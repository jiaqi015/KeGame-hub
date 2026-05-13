/**
 * ActorKnowledgeProjection — builds actor-visible knowledge snapshots from the registry.
 *
 * Architecture position:
 *   InformationSourceRegistry (GlobalTruth)
 *     → buildActorKnowledgeSnapshot() (visibility + delay filter)
 *       → ActorKnowledgeSnapshot (bounded, actor-safe)
 *         → buildBrokerBigWorldPOV() (product surface)
 *
 * This module does NOT:
 *   - Expose raw registry or hidden records
 *   - Mutate any state
 *   - Read GameState directly (receives registry + causal events as inputs)
 *   - Output full InformationSourceRecord objects
 *
 * This module DOES:
 *   - Filter source records by visibility policy + actor role
 *   - Apply information delays (actor-dependent)
 *   - Compute source credibility per actor
 *   - Generate belief updates from visible sources
 *   - Bound output to prevent information leakage
 *
 * Mother model alignment:
 *   Section 9: POV reads the world; does not mutate it
 *   Section 19.1: Knowing vs Believing
 *   Section 13: Causal Transmission → source signal → actor receives → belief changes
 */

import type {
  InformationSourceRecord,
  ActorRole,
  VisibilityScope,
} from '../../domain/world-model/informationSourceTypes.js';

import type {
  InformationSourceRegistry,
} from '../../domain/world-model/informationSourceRegistry.js';

import { queryVisibleSourceRecords } from '../../domain/world-model/informationSourceRegistry.js';

import type {
  ActorKnowledgeSnapshot,
  VisibleSourceRef,
  ActorBeliefUpdate,
  BeliefConfidence,
  InformationDelay,
  SourceCredibility,
  CredibilityFactor,
  BeliefDomain,
  BeliefClaim,
  BeliefValue,
  BeliefDomainSummary,
  BlindSpot,
  RoleVisibilityRule,
  PressureSignal,
  AvailableCommand,
  RecommendedCommand,
  ExplanationEnvelope,
  ExplanationLink,
  DecisionEvidenceEnvelope,
} from '../../domain/world-model/actorKnowledgeTypes.js';

import {
  DEFAULT_ROLE_VISIBILITY,
} from '../../domain/world-model/actorKnowledgeTypes.js';

// Re-export ActorKnowledgeSnapshot for downstream consumers (e.g. bigWorldPOVProjection)
export type { ActorKnowledgeSnapshot } from '../../domain/world-model/actorKnowledgeTypes.js';

import type {
  BigWorldPOVSummary,
  POVCausalRef,
} from './bigWorldPOVProjection.js';

// ════════════════════════════════════════════════════════════════════════════
// Deterministic ID generation
// ════════════════════════════════════════════════════════════════════════════

function deterministicId(prefix: string, parts: (string | number)[]): string {
  return `${prefix}-${parts.join('-')}`;
}

// ════════════════════════════════════════════════════════════════════════════
// computeInformationDelay — actor-dependent delay
// ════════════════════════════════════════════════════════════════════════════

/**
 * Compute information delay for a specific actor role.
 * Total delay = baseDelayDays + actorModifierDays.
 */
export function computeInformationDelay(
  record: InformationSourceRecord,
  roleRule: RoleVisibilityRule,
  queryDay: number,
): InformationDelay {
  const baseDelay = record.visibility.baseDelayDays;
  const actorModifier = roleRule.delayModifier;
  const effectiveDelay = baseDelay + actorModifier;
  const visibleAfterDay = record.day + effectiveDelay;

  return {
    baseDelayDays: baseDelay,
    actorModifierDays: actorModifier,
    effectiveDelayDays: effectiveDelay,
    sourceDay: record.day,
    visibleAfterDay,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// computeSourceCredibility — relational credibility
// ════════════════════════════════════════════════════════════════════════════

/**
 * Compute how credible a source is to a specific actor.
 * Same source → different credibility per actor.
 *
 * Credibility factors by actor role:
 *   - owner: trusts owner_interview highly, distrusts rival_action rumors
 *   - player_broker: trusts player_action_receipt, values comparable_transaction
 *   - customer: distrusts broker signals, trusts comparable_transaction
 *   - manager: trusts manager_message highly, values process_receipt
 *   - rival_broker: trusts rival_action, values acn_network_signal
 */
export function computeSourceCredibility(
  record: InformationSourceRecord,
  actorRole: ActorRole,
): SourceCredibility {
  const factors: CredibilityFactor[] = [];
  let score = 0.5; // base

  // Factor 1: source type — universal baseline
  if (record.sourceKind === 'owner_interview' || record.sourceKind === 'manager_message') {
    factors.push({ dimension: 'source_type', contribution: 0.2, reason: 'direct stakeholder source' });
    score += 0.2;
  } else if (record.sourceKind === 'player_action_receipt' || record.sourceKind === 'process_receipt') {
    factors.push({ dimension: 'source_type', contribution: 0.15, reason: 'verified process source' });
    score += 0.15;
  } else if (record.sourceKind === 'comparable_transaction') {
    factors.push({ dimension: 'source_type', contribution: 0.1, reason: 'transaction evidence' });
    score += 0.1;
  }

  // Factor 2: evidence strength (for rival_action)
  if (record.sourceKind === 'rival_action') {
    const payload = record.payload as { evidenceStrength?: string };
    if (payload.evidenceStrength === 'direct') {
      factors.push({ dimension: 'evidence_strength', contribution: 0.2, reason: 'direct evidence' });
      score += 0.2;
    } else if (payload.evidenceStrength === 'rumor') {
      factors.push({ dimension: 'evidence_strength', contribution: -0.15, reason: 'unverified rumor' });
      score -= 0.15;
    }
  }

  // Factor 3: role-specific trust weighting (expanded)

  // Owner: trusts owner_interview highly, distrusts market signals (can't verify)
  if (actorRole === 'owner') {
    if (record.sourceKind === 'owner_interview') {
      factors.push({ dimension: 'actor_trust', contribution: 0.15, reason: 'owner trusts own interview data' });
      score += 0.15;
    }
    if (record.sourceKind === 'market_signal') {
      factors.push({ dimension: 'domain_expertise', contribution: -0.1, reason: 'owner cannot verify market signals independently' });
      score -= 0.1;
    }
    if (record.sourceKind === 'rival_action') {
      factors.push({ dimension: 'domain_expertise', contribution: -0.1, reason: 'owner has limited view of rival strategy' });
      score -= 0.1;
    }
    if (record.sourceKind === 'customer_interaction') {
      factors.push({ dimension: 'domain_expertise', contribution: -0.1, reason: 'owner may undervalue customer signals' });
      score -= 0.1;
    }
    if (record.sourceKind === 'comparable_transaction') {
      factors.push({ dimension: 'domain_expertise', contribution: 0.1, reason: 'owner values transaction evidence' });
      score += 0.1;
    }
  }

  // Player broker: trusts own actions, values comparable data
  if (actorRole === 'player_broker') {
    if (record.sourceKind === 'player_action_receipt') {
      factors.push({ dimension: 'actor_trust', contribution: 0.15, reason: 'player trusts own actions' });
      score += 0.15;
    }
    if (record.sourceKind === 'comparable_transaction') {
      factors.push({ dimension: 'domain_expertise', contribution: 0.1, reason: 'broker uses transaction data professionally' });
      score += 0.1;
    }
    if (record.sourceKind === 'market_signal') {
      factors.push({ dimension: 'domain_expertise', contribution: 0.05, reason: 'broker has market signal tools' });
      score += 0.05;
    }
  }

  // Customer: distrusts broker signals, trusts comparable data
  if (actorRole === 'customer') {
    if (record.sourceKind === 'player_action_receipt' || record.sourceKind === 'process_receipt') {
      factors.push({ dimension: 'actor_trust', contribution: -0.15, reason: 'customer distrusts broker-initiated signals' });
      score -= 0.15;
    }
    if (record.sourceKind === 'comparable_transaction') {
      factors.push({ dimension: 'domain_expertise', contribution: 0.15, reason: 'customer trusts transaction evidence from platform' });
      score += 0.15;
    }
    if (record.sourceKind === 'market_signal') {
      factors.push({ dimension: 'domain_expertise', contribution: 0.05, reason: 'customer sees market signals as neutral data' });
      score += 0.05;
    }
  }

  // Manager: trusts manager messages, values process receipts
  if (actorRole === 'manager') {
    if (record.sourceKind === 'manager_message') {
      factors.push({ dimension: 'actor_trust', contribution: 0.2, reason: 'manager trusts own organizational messages' });
      score += 0.2;
    }
    if (record.sourceKind === 'process_receipt') {
      factors.push({ dimension: 'domain_expertise', contribution: 0.15, reason: 'manager values process outcomes' });
      score += 0.15;
    }
    if (record.sourceKind === 'player_action_receipt') {
      factors.push({ dimension: 'domain_expertise', contribution: 0.05, reason: 'manager can verify broker actions' });
      score += 0.05;
    }
    if (record.sourceKind === 'rival_action') {
      factors.push({ dimension: 'domain_expertise', contribution: 0.05, reason: 'manager sees competitive landscape broadly' });
      score += 0.05;
    }
  }

  // Rival broker: trusts own rival actions, values ACN signals
  if (actorRole === 'rival_broker') {
    if (record.sourceKind === 'rival_action') {
      factors.push({ dimension: 'actor_trust', contribution: 0.2, reason: 'rival broker trusts own actions' });
      score += 0.2;
    }
    if (record.sourceKind === 'acn_network_signal') {
      factors.push({ dimension: 'actor_trust', contribution: 0.1, reason: 'rival broker trusts ACN signals' });
      score += 0.1;
    }
    if (record.sourceKind === 'player_action_receipt') {
      factors.push({ dimension: 'actor_trust', contribution: -0.15, reason: 'rival broker distrusts player actions' });
      score -= 0.15;
    }
  }

  // Clamp to [0, 1]
  score = Math.max(0, Math.min(1, score));

  return { score, factors };
}

// ════════════════════════════════════════════════════════════════════════════
// deriveBeliefFromSource — base map source to belief domain
// ════════════════════════════════════════════════════════════════════════════

/**
 * Derive a belief domain and claim from a source record (base mapping).
 * Returns null if the source does not directly map to a belief.
 */
function deriveBeliefFromSource(
  record: InformationSourceRecord,
): { domain: BeliefDomain; claim: BeliefClaim; value: BeliefValue } | null {
  switch (record.sourceKind) {
    case 'market_signal': {
      const payload = record.payload as { before: number; after: number; subtype: string };
      const direction = payload.after > payload.before ? 'rising' : payload.after < payload.before ? 'falling' : 'stable';
      const magnitude = Math.abs(payload.after - payload.before);
      return {
        domain: 'market_heat',
        claim: { type: 'direction', direction, magnitude },
        value: { type: 'numeric', value: payload.after },
      };
    }
    case 'rival_action': {
      const payload = record.payload as { subtype: string; priceAfter?: number; priceBefore?: number };
      if (payload.subtype === 'reprice' && payload.priceAfter !== undefined && payload.priceBefore !== undefined) {
        const direction = payload.priceAfter < payload.priceBefore ? 'falling' : 'rising';
        return {
          domain: 'price_anchor',
          claim: { type: 'direction', direction, magnitude: Math.abs(payload.priceAfter - payload.priceBefore) },
          value: { type: 'numeric', value: payload.priceAfter },
        };
      }
      return {
        domain: 'rival_threat',
        claim: { type: 'categorical', category: payload.subtype, confidence: 0.7 },
        value: { type: 'categorical', value: payload.subtype },
      };
    }
    case 'owner_interview': {
      const payload = record.payload as { trustLevel?: number; priceMentioned?: number; tone: string };
      if (payload.trustLevel !== undefined) {
        return {
          domain: 'broker_trust',
          claim: { type: 'threshold', value: payload.trustLevel, threshold: 50, above: payload.trustLevel >= 50 },
          value: { type: 'numeric', value: payload.trustLevel },
        };
      }
      if (payload.priceMentioned !== undefined) {
        return {
          domain: 'price_anchor',
          claim: { type: 'threshold', value: payload.priceMentioned, threshold: 0, above: true },
          value: { type: 'numeric', value: payload.priceMentioned },
        };
      }
      return {
        domain: 'owner_readiness',
        claim: { type: 'categorical', category: payload.tone, confidence: 0.6 },
        value: { type: 'categorical', value: payload.tone },
      };
    }
    case 'customer_interaction': {
      const payload = record.payload as { subtype: string; fitScore?: number; interestLevel?: number };
      if (payload.subtype === 'dropout_detected') {
        return {
          domain: 'customer_seriousness',
          claim: { type: 'direction', direction: 'falling', magnitude: 1 },
          value: { type: 'categorical', value: 'dropout' },
        };
      }
      if (payload.interestLevel !== undefined) {
        return {
          domain: 'customer_seriousness',
          claim: { type: 'threshold', value: payload.interestLevel, threshold: 50, above: payload.interestLevel >= 50 },
          value: { type: 'numeric', value: payload.interestLevel },
        };
      }
      return null;
    }
    case 'comparable_transaction': {
      const payload = record.payload as { discountPct: number; price: number };
      return {
        domain: 'price_anchor',
        claim: { type: 'comparison', subject: 'market_price', relativeTo: 'listing_price', relation: payload.discountPct > 5 ? 'worse' : 'same' },
        value: { type: 'numeric', value: payload.price },
      };
    }
    default:
      return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// deriveBeliefForRole — role-specific belief interpretation
// ════════════════════════════════════════════════════════════════════════════

/**
 * Given the same source record, derive the belief domain that THIS actor
 * would most naturally form.
 *
 * Different actors interpret the same information through different lenses:
 *   - market_signal: owner → owner_readiness, broker → market_heat, customer → price_anchor, manager → deal_closeability
 *   - rival_action: owner → rival_threat, broker → rival_threat + service_path, customer → price_anchor, manager → deal_closeability
 *   - owner_interview: owner → owner_readiness, broker → broker_trust, customer → (not visible), manager → owner_readiness
 *   - customer_interaction: owner → customer_seriousness, broker → customer_seriousness, customer → customer_seriousness, manager → deal_closeability
 *   - comparable_transaction: owner → price_anchor, broker → price_anchor, customer → price_anchor, manager → deal_closeability
 *
 * Returns null if the source does not map to a belief for this role.
 */
function deriveBeliefForRole(
  record: InformationSourceRecord,
  actorRole: ActorRole,
): { domain: BeliefDomain; claim: BeliefClaim; value: BeliefValue } | null {
  // First, get the base belief from the source
  const baseBelief = deriveBeliefFromSource(record);
  if (!baseBelief) return null;

  // Then, apply role-specific domain mapping
  switch (record.sourceKind) {
    case 'market_signal': {
      const payload = record.payload as { before: number; after: number; subtype: string };
      const direction = payload.after > payload.before ? 'rising' : payload.after < payload.before ? 'falling' : 'stable';
      const magnitude = Math.abs(payload.after - payload.before);

      switch (actorRole) {
        case 'owner':
          // Owner sees market signals as pressure on their readiness to sell
          return {
            domain: 'owner_readiness',
            claim: { type: 'direction', direction, magnitude },
            value: { type: 'numeric', value: payload.after },
          };
        case 'player_broker':
          // Broker sees market signals as market heat assessment
          return baseBelief; // market_heat
        case 'customer':
          // Customer sees market signals as price anchor signals
          return {
            domain: 'price_anchor',
            claim: { type: 'direction', direction, magnitude },
            value: { type: 'numeric', value: payload.after },
          };
        case 'manager':
          // Manager sees market signals as deal closeability indicators
          return {
            domain: 'deal_closeability',
            claim: { type: 'direction', direction, magnitude },
            value: { type: 'numeric', value: payload.after },
          };
        case 'rival_broker':
          // Rival broker sees market signals as competitive pressure
          return {
            domain: 'rival_threat',
            claim: { type: 'direction', direction, magnitude },
            value: { type: 'numeric', value: payload.after },
          };
        default:
          return baseBelief;
      }
    }

    case 'rival_action': {
      const payload = record.payload as { subtype: string; priceAfter?: number; priceBefore?: number };

      switch (actorRole) {
        case 'owner':
          // Owner sees rival action as direct threat
          return {
            domain: 'rival_threat',
            claim: { type: 'categorical', category: payload.subtype, confidence: 0.7 },
            value: { type: 'categorical', value: payload.subtype },
          };
        case 'player_broker':
          // Broker sees rival action as both threat and service path opportunity
          return baseBelief; // price_anchor or rival_threat
        case 'customer':
          // Customer sees rival action as price anchor shift
          if (payload.subtype === 'reprice' && payload.priceAfter !== undefined && payload.priceBefore !== undefined) {
            const direction = payload.priceAfter < payload.priceBefore ? 'falling' : 'rising';
            return {
              domain: 'price_anchor',
              claim: { type: 'direction', direction, magnitude: Math.abs(payload.priceAfter - payload.priceBefore) },
              value: { type: 'numeric', value: payload.priceAfter },
            };
          }
          return {
            domain: 'price_anchor',
            claim: { type: 'categorical', category: payload.subtype, confidence: 0.5 },
            value: { type: 'categorical', value: payload.subtype },
          };
        case 'manager':
          // Manager sees rival action as deal closeability risk
          return {
            domain: 'deal_closeability',
            claim: { type: 'categorical', category: `rival_${payload.subtype}`, confidence: 0.6 },
            value: { type: 'categorical', value: `rival_${payload.subtype}` },
          };
        case 'rival_broker':
          // Rival broker sees their own action as service_path effectiveness
          return {
            domain: 'service_path',
            claim: { type: 'categorical', category: payload.subtype, confidence: 0.8 },
            value: { type: 'categorical', value: payload.subtype },
          };
        default:
          return baseBelief;
      }
    }

    case 'owner_interview': {
      const payload = record.payload as { trustLevel?: number; priceMentioned?: number; tone: string };

      switch (actorRole) {
        case 'owner':
          // Owner sees interview as readiness signal
          return {
            domain: 'owner_readiness',
            claim: { type: 'categorical', category: payload.tone, confidence: 0.6 },
            value: { type: 'categorical', value: payload.tone },
          };
        case 'player_broker':
          // Broker sees interview as trust measurement
          return baseBelief; // broker_trust or price_anchor
        case 'customer':
          // Customer treats visible owner communication as price/negotiability evidence.
          return {
            domain: payload.priceMentioned !== undefined ? 'price_anchor' : 'deal_closeability',
            claim: payload.priceMentioned !== undefined
              ? { type: 'threshold', value: payload.priceMentioned, threshold: 0, above: true }
              : { type: 'categorical', category: `owner_${payload.tone}`, confidence: 0.45 },
            value: payload.priceMentioned !== undefined
              ? { type: 'numeric', value: payload.priceMentioned }
              : { type: 'categorical', value: `owner_${payload.tone}` },
          };
        case 'manager':
          // Manager sees interview as owner readiness assessment
          return {
            domain: 'owner_readiness',
            claim: { type: 'categorical', category: payload.tone, confidence: 0.6 },
            value: { type: 'categorical', value: payload.tone },
          };
        default:
          return baseBelief;
      }
    }

    case 'customer_interaction': {
      const payload = record.payload as { subtype: string; fitScore?: number; interestLevel?: number };

      switch (actorRole) {
        case 'owner':
          // Owner sees customer interaction as seriousness indicator
          return baseBelief; // customer_seriousness
        case 'player_broker':
          // Broker sees customer interaction as seriousness indicator
          return baseBelief; // customer_seriousness
        case 'customer':
          // Customer sees their own interaction as self-assessment
          return baseBelief; // customer_seriousness
        case 'manager':
          // Manager sees customer interaction as deal closeability signal
          if (payload.subtype === 'dropout_detected') {
            return {
              domain: 'deal_closeability',
              claim: { type: 'direction', direction: 'falling', magnitude: 1 },
              value: { type: 'categorical', value: 'dropout' },
            };
          }
          return {
            domain: 'deal_closeability',
            claim: { type: 'categorical', category: payload.subtype, confidence: 0.6 },
            value: { type: 'categorical', value: payload.subtype },
          };
        default:
          return baseBelief;
      }
    }

    case 'comparable_transaction': {
      const payload = record.payload as { discountPct: number; price: number };

      switch (actorRole) {
        case 'owner':
          // Owner sees transaction as price anchor reality check
          return baseBelief; // price_anchor
        case 'player_broker':
          // Broker sees transaction as price anchor evidence
          return baseBelief; // price_anchor
        case 'customer':
          // Customer sees transaction as affordability reference
          return {
            domain: 'price_anchor',
            claim: { type: 'comparison', subject: 'transaction_price', relativeTo: 'budget', relation: payload.price < 400 ? 'better' : 'worse' },
            value: { type: 'numeric', value: payload.price },
          };
        case 'manager':
          // Manager sees transaction as deal closeability signal
          return {
            domain: 'deal_closeability',
            claim: { type: 'comparison', subject: 'market_price', relativeTo: 'listing_price', relation: payload.discountPct > 5 ? 'worse' : 'same' },
            value: { type: 'numeric', value: payload.price },
          };
        default:
          return baseBelief;
      }
    }

    default:
      return baseBelief;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// buildVisibleSourceRef — bounded source reference
// ════════════════════════════════════════════════════════════════════════════

/**
 * Convert a full InformationSourceRecord into a bounded VisibleSourceRef.
 * Never exposes raw payload or full record.
 */
function buildVisibleSourceRef(
  record: InformationSourceRecord,
  actorRole: ActorRole,
  queryDay: number,
  roleRule: RoleVisibilityRule,
): VisibleSourceRef {
  const delay = computeInformationDelay(record, roleRule, queryDay);
  const credibility = computeSourceCredibility(record, actorRole);

  // Bounded entity refs: max 3
  const entityRefIds = record.entityRefs.slice(0, 3).map((ref) => ref.id);

  // Bounded summary: max 200 chars
  const summary = record.payload.summary.length > 200
    ? record.payload.summary.slice(0, 197) + '...'
    : record.payload.summary;

  return {
    sourceId: record.sourceId,
    sourceKind: record.sourceKind,
    day: record.day,
    phase: record.phase,
    summary,
    credibility,
    delay,
    entityRefIds,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// buildActorKnowledgeSnapshot — core builder
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build an ActorKnowledgeSnapshot for a specific actor at a specific day.
 *
 * This is the primary entry point for the actor-knowledge layer.
 * It reads from the InformationSourceRegistry (not raw GameState)
 * and produces a bounded, actor-safe snapshot.
 *
 * @param actorId - unique actor identifier
 * @param role - actor role (determines visibility)
 * @param day - simulation day
 * @param registry - the information source registry (GlobalTruth)
 * @param causalEvents - optional live causal events for cross-domain context
 */
export function buildActorKnowledgeSnapshot(
  actorId: string,
  role: ActorRole,
  day: number,
  registry: InformationSourceRegistry,
  causalEvents?: readonly { readonly id: string; readonly day: number; readonly kind: string; readonly affectedIds: readonly string[] }[],
): ActorKnowledgeSnapshot {
  const roleRule = DEFAULT_ROLE_VISIBILITY.find((r) => r.role === role)
    ?? DEFAULT_ROLE_VISIBILITY[0];

  // Query visible records (filters by base delay + scope)
  const visibleRecords = queryVisibleSourceRecords(registry, actorId, role, day);

  // Apply actor-specific delay modifier: records must also satisfy
  // day >= record.day + baseDelayDays + actorModifierDays
  const actorDelayedRecords = visibleRecords.filter((r) => {
    const totalDelay = r.visibility.baseDelayDays + roleRule.delayModifier;
    return day >= r.day + totalDelay;
  });

  const totalBeforeBound = actorDelayedRecords.length;

  // Bounded source refs: max 10 per role
  const maxSources = roleRule.maxVisibleSources;
  const boundedRecords = actorDelayedRecords.slice(0, maxSources);
  const visibleSourceRefs = boundedRecords.map((r) => buildVisibleSourceRef(r, role, day, roleRule));

  // Generate belief updates from visible sources
  const beliefUpdates = generateBeliefUpdates(
    actorId,
    role,
    day,
    boundedRecords,
    visibleSourceRefs,
    roleRule,
  );

  // Summarize beliefs by domain
  const beliefSummary = summarizeBeliefs(beliefUpdates, roleRule.maxBeliefsPerDomain);

  // Detect blind spots
  const blindSpots = detectBlindSpots(registry, role, day, roleRule.maxBlindSpots);

  return {
    actorId,
    actorRole: role,
    day,
    visibleSources: visibleSourceRefs,
    totalVisibleBeforeBound: totalBeforeBound,
    beliefs: beliefUpdates,
    beliefSummary,
    blindSpots,
    replayKey: deterministicId('aks', [actorId, role, day]),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// generateBeliefUpdates — derive beliefs from visible sources
// ════════════════════════════════════════════════════════════════════════════

function generateBeliefUpdates(
  actorId: string,
  role: ActorRole,
  day: number,
  records: readonly InformationSourceRecord[],
  sourceRefs: readonly VisibleSourceRef[],
  roleRule: RoleVisibilityRule,
): ActorBeliefUpdate[] {
  const updates: ActorBeliefUpdate[] = [];
  const domainCounts = new Map<BeliefDomain, number>();
  let index = 0;

  for (const record of records) {
    // Use role-specific belief derivation (multi-actor POV drift)
    const belief = deriveBeliefForRole(record, role);
    if (!belief) continue;

    const domainCount = domainCounts.get(belief.domain) ?? 0;
    if (domainCount >= roleRule.maxBeliefsPerDomain) continue;

    const sourceRef = sourceRefs.find((sr) => sr.sourceId === record.sourceId);
    if (!sourceRef) continue;

    // Confidence derivation — now also role-specific via credibility
    const derivation: BeliefConfidence['derivation'] =
      record.sourceKind === 'owner_interview' || record.sourceKind === 'manager_message'
        ? 'trusted_relay'
        : record.sourceKind === 'player_action_receipt'
          ? 'direct_observation'
          : record.sourceKind === 'comparable_transaction'
            ? 'policy_signal'
            : 'inference';

    const confidence: BeliefConfidence = {
      value: Math.min(1, record.confidence * sourceRef.credibility.score),
      derivation,
      sourceIds: [record.sourceId],
      asOfDay: day,
    };

    const update: ActorBeliefUpdate = {
      updateId: deterministicId('abu', [actorId, day, index]),
      actorId,
      actorRole: role,
      day,
      belief: { domain: belief.domain, claim: belief.claim },
      confidence,
      sourceRefs: [sourceRef],
      replayKey: deterministicId('abu-rk', [actorId, day, index]),
    };

    updates.push(update);
    domainCounts.set(belief.domain, domainCount + 1);
    index += 1;
  }

  return updates;
}

// ════════════════════════════════════════════════════════════════════════════
// summarizeBeliefs — aggregate by domain
// ════════════════════════════════════════════════════════════════════════════

function summarizeBeliefs(
  updates: readonly ActorBeliefUpdate[],
  maxPerDomain: number,
): BeliefDomainSummary[] {
  const byDomain = new Map<BeliefDomain, ActorBeliefUpdate[]>();
  for (const u of updates) {
    const arr = byDomain.get(u.belief.domain) ?? [];
    arr.push(u);
    byDomain.set(u.belief.domain, arr);
  }

  const summaries: BeliefDomainSummary[] = [];
  for (const [domain, domainUpdates] of byDomain) {
    const bounded = domainUpdates.slice(0, maxPerDomain);
    const latest = bounded[bounded.length - 1];
    const avgConf = bounded.reduce((s, u) => s + u.confidence.value, 0) / bounded.length;

    summaries.push({
      domain,
      updateCount: bounded.length,
      latestValue: { type: 'numeric', value: 0 }, // placeholder
      avgConfidence: avgConf,
      trend: 'stable',
    });
  }

  return summaries;
}

// ════════════════════════════════════════════════════════════════════════════
// detectBlindSpots — what the actor cannot see
// ════════════════════════════════════════════════════════════════════════════

function detectBlindSpots(
  registry: InformationSourceRegistry,
  role: ActorRole,
  day: number,
  maxBlindSpots: number,
): BlindSpot[] {
  const blindSpots: BlindSpot[] = [];
  const hiddenRecords = registry.index.all.filter(
    (r) => r.visibility.scope === 'no_one' && r.day <= day,
  );

  // Categorize hidden records
  const byCategory = new Map<string, number>();
  for (const r of hiddenRecords) {
    const category = mapSourceKindToBlindSpotCategory(r.sourceKind);
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }

  const impactHints: Record<string, string> = {
    'rival_intent': 'Cannot assess true rival strategy',
    'shadow_listing': 'May miss competitive supply changes',
    'customer_internal_state': 'Cannot verify customer commitment level',
    'manager_strategy': 'Unknown resource allocation priorities',
    'owner_private_thought': 'Owner may have unexpressed concerns',
    'acn_internal': 'Network-level decisions may affect opportunities',
  };

  for (const [category, count] of byCategory) {
    if (blindSpots.length >= maxBlindSpots) break;
    blindSpots.push({
      category: category as BlindSpot['category'],
      hiddenSourceCount: count,
      impactHint: impactHints[category] ?? 'Unknown impact',
    });
  }

  return blindSpots;
}

function mapSourceKindToBlindSpotCategory(kind: string): string {
  switch (kind) {
    case 'rival_action': return 'rival_intent';
    case 'platform_traffic': return 'shadow_listing';
    case 'customer_interaction': return 'customer_internal_state';
    case 'manager_message': return 'manager_strategy';
    case 'owner_interview': return 'owner_private_thought';
    case 'acn_network_signal': return 'acn_internal';
    default: return 'rival_intent';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// filterCausalRefsByVisibility — actor-safe ref filtering
// ════════════════════════════════════════════════════════════════════════════

/**
 * Filter POVCausalRefs through an ActorKnowledgeSnapshot.
 *
 * Rules:
 *   1. Refs whose sourceRecordId maps to a no_one scope → REMOVED
 *   2. Refs whose sourceRecordId maps to owner_only scope → only visible to owner
 *   3. Refs whose sourceRecordId maps to player_only scope → only visible to player_broker
 *   4. Refs whose sourceRecordId maps to broker_chain scope → only visible to brokers
 *   5. Refs with no matching sourceRecordId in the registry → kept (legacy/system refs)
 *
 * This ensures:
 *   - no_one sources never appear in any projection
 *   - owner_only / player_only / broker_chain are enforced at projection level
 *   - Same source produces different ref sets for different actors
 */
export function filterCausalRefsByVisibility(
  refs: readonly POVCausalRef[],
  knowledge: ActorKnowledgeSnapshot,
  registry: InformationSourceRegistry,
): POVCausalRef[] {
  const roleRule = DEFAULT_ROLE_VISIBILITY.find((r) => r.role === knowledge.actorRole)
    ?? DEFAULT_ROLE_VISIBILITY[0];
  const allowedScopes = new Set(roleRule.allowedScopes);

  // Build a map of sourceRecordId → visibility scope for fast lookup
  const sourceScopeMap = new Map<string, VisibilityScope>();
  for (const record of registry.index.all) {
    sourceScopeMap.set(record.sourceId, record.visibility.scope);
  }

  // Build a set of source IDs that are visible to this actor
  const visibleSourceIds = new Set(
    knowledge.visibleSources.map((s) => s.sourceId),
  );

  const filtered: POVCausalRef[] = [];
  const seen = new Set<string>();

  for (const ref of refs) {
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Find the source record that produced this ref's causal event
    // The refId may be a sourceRecordId or an entity ID — check both
    const scope = sourceScopeMap.get(ref.refId);

    if (scope === 'no_one') {
      // Hidden source: never show in projection
      continue;
    }

    if (scope !== undefined && !allowedScopes.has(scope)) {
      // Actor doesn't have permission for this scope
      continue;
    }

    // If the ref has a sourceRecordId that exists in visible sources, keep it
    // If the ref has no matching source (legacy/system ref), keep it
    filtered.push(ref);
  }

  return filtered;
}

/**
 * Apply visibility filtering to a BigWorldPOVSummary's refs using an ActorKnowledgeSnapshot.
 * Returns a new summary with filtered refs in all sub-projections.
 */
export function applyKnowledgeFilterToPOV(
  bigWorldPOV: BigWorldPOVSummary,
  knowledge: ActorKnowledgeSnapshot,
  registry: InformationSourceRegistry,
): BigWorldPOVSummary {
  const filter = (refs: readonly POVCausalRef[]): POVCausalRef[] =>
    filterCausalRefsByVisibility(refs, knowledge, registry);

  return {
    ...bigWorldPOV,
    marketCell: {
      ...bigWorldPOV.marketCell,
      refs: filter(bigWorldPOV.marketCell.refs),
    },
    comparableSupply: {
      ...bigWorldPOV.comparableSupply,
      refs: filter(bigWorldPOV.comparableSupply.refs),
      topSignals: bigWorldPOV.comparableSupply.topSignals.map((s) => ({
        ...s,
        refs: filter(s.refs),
      })),
    },
    demandMovement: {
      ...bigWorldPOV.demandMovement,
      refs: filter(bigWorldPOV.demandMovement.refs),
      topSignals: bigWorldPOV.demandMovement.topSignals.map((s) => ({
        ...s,
        refs: filter(s.refs),
      })),
    },
    ownerExpectation: {
      ...bigWorldPOV.ownerExpectation,
      refs: filter(bigWorldPOV.ownerExpectation.refs),
      topSignals: bigWorldPOV.ownerExpectation.topSignals.map((s) => ({
        ...s,
        refs: filter(s.refs),
      })),
    },
    brokerActionPressure: {
      ...bigWorldPOV.brokerActionPressure,
      refs: filter(bigWorldPOV.brokerActionPressure.refs),
      topSignals: bigWorldPOV.brokerActionPressure.topSignals.map((s) => ({
        ...s,
        refs: filter(s.refs),
      })),
    },
    becauseBigProof: {
      ...bigWorldPOV.becauseBigProof,
      safeCausalRefs: filter(bigWorldPOV.becauseBigProof.safeCausalRefs),
      movementEvidence: bigWorldPOV.becauseBigProof.movementEvidence.map((e) => ({
        ...e,
        refs: filter(e.refs),
      })),
    },
    recommendedActionReasons: bigWorldPOV.recommendedActionReasons.map((r) => ({
      ...r,
      refs: filter(r.refs),
    })),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// buildBrokerBigWorldPOV — derive product surface from knowledge snapshot
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build a BigWorldPOVSummary from an ActorKnowledgeSnapshot.
 *
 * This demonstrates the key architectural point:
 *   BigWorldPOVProjection now reads from ActorKnowledgeSnapshot
 *   instead of directly from GlobalTruth / GameState.
 *
 * The POV projection is bounded and actor-safe because:
 *   - Only VisibleSourceRefs are available (no raw records)
 *   - BeliefConfidence is used instead of SourceConfidence
 *   - BlindSpots replace hidden source access
 *   - CausalRefs are derived from visible sources only
 */
export function buildBrokerBigWorldPOV(
  knowledge: ActorKnowledgeSnapshot,
  bigWorldPOV: BigWorldPOVSummary,
  registry?: InformationSourceRegistry,
): BrokerBigWorldPOV {
  // Extract causal refs from visible sources only
  const causalRefs = extractCausalRefs(knowledge);

  // Apply visibility filtering to inherited sub-projection refs if registry available
  let filteredPOV = bigWorldPOV;
  if (registry) {
    filteredPOV = applyKnowledgeFilterToPOV(bigWorldPOV, knowledge, registry);
  }

  // Filter recommended actions through belief confidence
  const filteredActions = filteredPOV.recommendedActionReasons
    .filter((action) => {
      // Only show actions backed by beliefs with confidence > 0.3
      const relevantBeliefs = knowledge.beliefs.filter(
        (b) => action.refs.some((ref) => ref.refId.includes(b.actorId) || ref.refType === 'market-signal'),
      );
      if (relevantBeliefs.length === 0) return true; // show if no beliefs to filter by
      const maxConfidence = Math.max(...relevantBeliefs.map((b) => b.confidence.value));
      return maxConfidence > 0.3;
    })
    .slice(0, 3); // bound to 3

  // Build belief-informed market signals
  const beliefSignals = knowledge.beliefSummary.map((summary) => ({
    domain: summary.domain,
    trend: summary.trend,
    confidence: summary.avgConfidence,
    sourceCount: summary.updateCount,
  }));

  return {
    actorId: knowledge.actorId,
    actorRole: knowledge.actorRole,
    day: knowledge.day,
    marketCell: filteredPOV.marketCell,
    comparableSupply: filteredPOV.comparableSupply,
    demandMovement: filteredPOV.demandMovement,
    ownerExpectation: filteredPOV.ownerExpectation,
    brokerActionPressure: filteredPOV.brokerActionPressure,
    becauseBigProof: filteredPOV.becauseBigProof,
    recommendedActionReasons: filteredActions,
    causalRefs,
    beliefSignals,
    blindSpots: knowledge.blindSpots,
    visibleSourceCount: knowledge.visibleSources.length,
    totalSourcesBeforeBound: knowledge.totalVisibleBeforeBound,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// extractCausalRefs — derive POVCausalRefs from visible sources
// ════════════════════════════════════════════════════════════════════════════

function extractCausalRefs(knowledge: ActorKnowledgeSnapshot): POVCausalRef[] {
  const refs: POVCausalRef[] = [];
  const seen = new Set<string>();

  for (const source of knowledge.visibleSources) {
    for (const entityId of source.entityRefIds) {
      if (seen.has(entityId)) continue;
      seen.add(entityId);

      const refType = mapSourceKindToRefType(source.sourceKind);
      refs.push({
        refType,
        refId: entityId,
        refLabel: source.summary.slice(0, 50),
      });
    }
  }

  return refs.slice(0, 8); // bound
}

function mapSourceKindToRefType(kind: string): POVCausalRef['refType'] {
  switch (kind) {
    case 'market_signal': return 'market-signal';
    case 'rival_action': return 'rival-listing';
    case 'customer_interaction': return 'opportunity';
    case 'owner_interview': return 'case';
    case 'comparable_transaction': return 'market-signal';
    default: return 'market-signal';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BrokerBigWorldPOV — product surface derived from knowledge
// ════════════════════════════════════════════════════════════════════════════

/**
 * BrokerBigWorldPOV is the product surface that replaces direct GlobalTruth reads.
 * It inherits structure from BigWorldPOVSummary but filters through actor knowledge.
 */
export interface BrokerBigWorldPOV {
  readonly actorId: string;
  readonly actorRole: ActorRole;
  readonly day: number;

  // Inherited from BigWorldPOVSummary (filtered through knowledge)
  readonly marketCell: BigWorldPOVSummary['marketCell'];
  readonly comparableSupply: BigWorldPOVSummary['comparableSupply'];
  readonly demandMovement: BigWorldPOVSummary['demandMovement'];
  readonly ownerExpectation: BigWorldPOVSummary['ownerExpectation'];
  readonly brokerActionPressure: BigWorldPOVSummary['brokerActionPressure'];
  readonly becauseBigProof: BigWorldPOVSummary['becauseBigProof'];
  readonly recommendedActionReasons: BigWorldPOVSummary['recommendedActionReasons'];

  // Actor-knowledge layer
  /** Causal refs derived from visible sources only. */
  readonly causalRefs: readonly POVCausalRef[];
  /** Belief-informed market signals. */
  readonly beliefSignals: readonly {
    readonly domain: BeliefDomain;
    readonly trend: 'strengthening' | 'weakening' | 'stable';
    readonly confidence: number;
    readonly sourceCount: number;
  }[];
  /** What the actor cannot see. */
  readonly blindSpots: readonly BlindSpot[];
  /** How many sources are visible (after bounding). */
  readonly visibleSourceCount: number;
  /** Total sources before bounding (for transparency). */
  readonly totalSourcesBeforeBound: number;
}

// ════════════════════════════════════════════════════════════════════════════
// Decision Evidence Pipeline — Belief → Pressure → Command → Explanation
// ════════════════════════════════════════════════════════════════════════════

/**
 * Evaluate pressure signals from belief summaries.
 *
 * Pressure is derived from beliefs, not from raw state fields.
 * Each signal traces back to at least one belief update / source record.
 */
export function evaluatePressureSignals(
  knowledge: ActorKnowledgeSnapshot,
): PressureSignal[] {
  const signals: PressureSignal[] = [];
  let index = 0;

  for (const summary of knowledge.beliefSummary) {
    // Pressure = belief strength × domain relevance × confidence
    const pressureMagnitude = summary.updateCount * summary.avgConfidence * 25;
    if (pressureMagnitude < 10) continue;

    const direction = summary.trend === 'strengthening'
      ? 'increasing'
      : summary.trend === 'weakening'
        ? 'decreasing'
        : 'stable';

    // Collect source IDs from all belief updates in this domain
    const domainBeliefs = knowledge.beliefs.filter((b) => b.belief.domain === summary.domain);
    const beliefSourceIds: string[] = [];
    const sourceRecordIds: string[] = [];
    for (const belief of domainBeliefs) {
      beliefSourceIds.push(belief.updateId);
      for (const srcId of belief.confidence.sourceIds) {
        if (!sourceRecordIds.includes(srcId)) sourceRecordIds.push(srcId);
      }
    }

    const labelMap: Record<BeliefDomain, string> = {
      market_heat: '市场热度压力',
      price_anchor: '价格定位压力',
      owner_readiness: '业主准备度压力',
      customer_seriousness: '客户需求压力',
      rival_threat: '竞品威胁压力',
      broker_trust: '信任关系压力',
      deal_closeability: '成交接近度压力',
      service_path: '服务路径压力',
    };

    signals.push({
      signalId: deterministicId('ps', [knowledge.actorId, knowledge.day, index]),
      domain: summary.domain,
      magnitude: Math.min(100, Math.round(pressureMagnitude)),
      direction,
      label: labelMap[summary.domain] ?? `${summary.domain} 压力`,
      beliefSourceIds,
      sourceRecordIds,
    });
    index += 1;
  }

  // Bounded: top 5 pressure signals
  return signals
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 5);
}

// ════════════════════════════════════════════════════════════════════════════
// Command Catalog — bounded set of available actions
// ════════════════════════════════════════════════════════════════════════════

/**
 * Static catalog of available commands for broker players.
 * Commands are NOT derived from hidden state — they are role-constrained options.
 */
export const BROKER_COMMAND_CATALOG: readonly AvailableCommand[] = [
  {
    commandId: 'cmd-price-adjustment',
    name: '调整挂牌价',
    category: 'pricing',
    targetDomains: ['price_anchor', 'owner_readiness'],
    pressureThreshold: 30,
    allowedRoles: ['player_broker'],
  },
  {
    commandId: 'cmd-customer-acquisition',
    name: '补充潜在客户',
    category: 'promotion',
    targetDomains: ['customer_seriousness', 'deal_closeability'],
    pressureThreshold: 20,
    allowedRoles: ['player_broker'],
  },
  {
    commandId: 'cmd-owner-visit',
    name: '面访业主分型',
    category: 'relationship',
    targetDomains: ['owner_readiness', 'broker_trust', 'price_anchor'],
    pressureThreshold: 25,
    allowedRoles: ['player_broker'],
  },
  {
    commandId: 'cmd-focus-meeting',
    name: '进入聚焦会',
    category: 'process',
    targetDomains: ['customer_seriousness', 'deal_closeability', 'rival_threat'],
    pressureThreshold: 40,
    allowedRoles: ['player_broker'],
  },
  {
    commandId: 'cmd-escalate-manager',
    name: '上报经理协调',
    category: 'escalation',
    targetDomains: ['owner_readiness', 'rival_threat', 'deal_closeability'],
    pressureThreshold: 60,
    allowedRoles: ['player_broker'],
  },
  {
    commandId: 'cmd-defend-listing',
    name: '维护房源竞争力',
    category: 'promotion',
    targetDomains: ['rival_threat', 'market_heat', 'service_path'],
    pressureThreshold: 35,
    allowedRoles: ['player_broker'],
  },
  {
    commandId: 'cmd-owner-consider-price',
    name: '重新判断价格预期',
    category: 'pricing',
    targetDomains: ['price_anchor', 'owner_readiness', 'rival_threat'],
    pressureThreshold: 20,
    allowedRoles: ['owner'],
  },
  {
    commandId: 'cmd-owner-request-evidence',
    name: '要求经纪人补充市场证据',
    category: 'relationship',
    targetDomains: ['broker_trust', 'market_heat', 'price_anchor'],
    pressureThreshold: 25,
    allowedRoles: ['owner'],
  },
  {
    commandId: 'cmd-customer-compare-budget',
    name: '重新比较预算与备选房',
    category: 'pricing',
    targetDomains: ['price_anchor', 'deal_closeability', 'customer_seriousness'],
    pressureThreshold: 20,
    allowedRoles: ['customer'],
  },
  {
    commandId: 'cmd-customer-request-showing',
    name: '要求进一步看房确认',
    category: 'process',
    targetDomains: ['customer_seriousness', 'service_path', 'deal_closeability'],
    pressureThreshold: 20,
    allowedRoles: ['customer'],
  },
  {
    commandId: 'cmd-manager-allocate-resource',
    name: '分配组织资源',
    category: 'escalation',
    targetDomains: ['deal_closeability', 'rival_threat', 'market_heat'],
    pressureThreshold: 25,
    allowedRoles: ['manager'],
  },
  {
    commandId: 'cmd-rival-respond-market',
    name: '调整竞品应对策略',
    category: 'promotion',
    targetDomains: ['rival_threat', 'market_heat', 'price_anchor'],
    pressureThreshold: 25,
    allowedRoles: ['rival_broker'],
  },
] as const;

/**
 * Filter commands by role and pressure threshold.
 * Returns only commands the actor can execute and that match current pressure.
 */
export function filterAvailableCommands(
  actorRole: ActorRole,
  pressureSignals: readonly PressureSignal[],
): AvailableCommand[] {
  const commands: AvailableCommand[] = [];

  for (const cmd of BROKER_COMMAND_CATALOG) {
    // Role check
    if (!cmd.allowedRoles.includes(actorRole)) continue;

    // Pressure check: find the max pressure in the command's target domains
    const relevantPressure = pressureSignals
      .filter((ps) => cmd.targetDomains.includes(ps.domain))
      .reduce((max, ps) => Math.max(max, ps.magnitude), 0);

    if (relevantPressure >= cmd.pressureThreshold) {
      commands.push(cmd);
    }
  }

  return commands;
}

/**
 * Rank commands by relevance to current pressure signals.
 * Returns top 3 bounded.
 */
export function rankCommands(
  availableCommands: readonly AvailableCommand[],
  pressureSignals: readonly PressureSignal[],
): RecommendedCommand[] {
  const ranked: RecommendedCommand[] = [];

  for (const cmd of availableCommands) {
    // Compute ranking score: sum of matching domain pressures
    const matchingPressures = pressureSignals.filter((ps) => cmd.targetDomains.includes(ps.domain));
    const score = matchingPressures.reduce((s, ps) => s + ps.magnitude, 0);

    // Collect evidence chain
    const beliefSourceIds: string[] = [];
    const sourceRecordIds: string[] = [];
    for (const ps of matchingPressures) {
      for (const bid of ps.beliefSourceIds) {
        if (!beliefSourceIds.includes(bid)) beliefSourceIds.push(bid);
      }
      for (const sid of ps.sourceRecordIds) {
        if (!sourceRecordIds.includes(sid)) sourceRecordIds.push(sid);
      }
    }

    const confidence = Math.min(1, score / 100);

    ranked.push({
      command: cmd,
      reasoning: buildCommandReasoning(cmd, matchingPressures),
      confidence,
      pressureSignalIds: matchingPressures.map((ps) => ps.signalId),
      beliefSourceIds,
      sourceRecordIds,
    });
  }

  // Sort by confidence descending, take top 3
  return ranked
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}

function buildCommandReasoning(
  cmd: AvailableCommand,
  pressures: readonly PressureSignal[],
): string {
  if (pressures.length === 0) {
    return `${cmd.name}：当前压力条件不明显，但仍可作为预防性动作。`;
  }

  const topPressure = pressures[0];
  const domainLabels: Record<BeliefDomain, string> = {
    market_heat: '市场热度',
    price_anchor: '价格定位',
    owner_readiness: '业主准备度',
    customer_seriousness: '客户需求',
    rival_threat: '竞品威胁',
    broker_trust: '信任关系',
    deal_closeability: '成交接近度',
    service_path: '服务路径',
  };

  return `${cmd.name}：${domainLabels[topPressure.domain]}压力 ${topPressure.magnitude}%，`
    + `${topPressure.direction === 'increasing' ? '持续上升' : topPressure.direction === 'decreasing' ? '正在缓解' : '保持稳定'}。`;
}

// ════════════════════════════════════════════════════════════════════════════
// buildExplanationEnvelope — perfect explanation chain
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build an ExplanationEnvelope that traces source → belief → pressure → command.
 * Every link in the chain must reference real IDs from the evidence pipeline.
 */
export function buildExplanationEnvelope(
  recommended: RecommendedCommand,
  pressureSignals: readonly PressureSignal[],
  knowledge: ActorKnowledgeSnapshot,
): ExplanationEnvelope {
  const chain: ExplanationLink[] = [];

  // Step 1: Source records
  const sourceIds = recommended.sourceRecordIds.slice(0, 5);
  if (sourceIds.length > 0) {
    chain.push({
      step: 'source',
      description: `基于 ${sourceIds.length} 条可见信息源的证据链。`,
      referencedIds: sourceIds,
    });
  }

  // Step 2: Belief updates
  const beliefIds = recommended.beliefSourceIds.slice(0, 5);
  if (beliefIds.length > 0) {
    chain.push({
      step: 'belief',
      description: `这些信息形成了 ${beliefIds.length} 条关于 ${recommended.command.targetDomains.join('、')} 的判断。`,
      referencedIds: beliefIds,
    });
  }

  // Step 3: Pressure signals
  const pressureIds = recommended.pressureSignalIds.slice(0, 3);
  if (pressureIds.length > 0) {
    const topPressure = pressureSignals.find((ps) => ps.signalId === pressureIds[0]);
    chain.push({
      step: 'pressure',
      description: topPressure
        ? `当前 ${topPressure.label}达到 ${topPressure.magnitude}%，${topPressure.direction === 'increasing' ? '需要立即行动' : '压力仍在'}。`
        : `检测到 ${pressureIds.length} 个压力信号。`,
      referencedIds: pressureIds,
    });
  }

  // Step 4: Command
  chain.push({
    step: 'command',
    description: recommended.reasoning,
    referencedIds: [recommended.command.commandId],
  });

  // Safe refs for UI: bounded, player-safe
  const safeRefs = knowledge.visibleSources.slice(0, 5).map((s) => ({
    refType: s.sourceKind,
    refId: s.sourceId,
    refLabel: s.summary.slice(0, 60),
  }));

  return {
    summary: recommended.reasoning,
    chain,
    confidence: recommended.confidence,
    safeRefs,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// buildDecisionEvidenceEnvelope — top-level decision pipeline
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build a DecisionEvidenceEnvelope from an ActorKnowledgeSnapshot.
 *
 * This is the decision-big pipeline:
 *   ActorKnowledgeSnapshot
 *     → evaluatePressureSignals (beliefs → pressure)
 *     → filterAvailableCommands (pressure → commands)
 *     → rankCommands (commands → recommendation)
 *     → buildExplanationEnvelope (recommendation → explanation)
 *     → DecisionEvidenceEnvelope
 *
 * Key constraints:
 *   - No hidden GlobalTruth reads (only ActorKnowledgeSnapshot)
 *   - All output is bounded and actor-safe
 *   - Every recommendation traces source → belief → pressure → command
 *   - Deterministic: same inputs → same output
 */
export function buildDecisionEvidenceEnvelope(
  knowledge: ActorKnowledgeSnapshot,
): DecisionEvidenceEnvelope {
  // Step 1: Evaluate pressure from beliefs
  const pressureSignals = evaluatePressureSignals(knowledge);

  // Step 2: Filter available commands by role and pressure
  const availableCommands = filterAvailableCommands(knowledge.actorRole, pressureSignals);

  // Step 3: Rank commands and pick recommendation
  const rankedCommands = rankCommands(availableCommands, pressureSignals);
  const recommendedCommand = rankedCommands.length > 0 ? rankedCommands[0] : null;

  // Step 4: Build explanation envelope
  const explanation = recommendedCommand
    ? buildExplanationEnvelope(recommendedCommand, pressureSignals, knowledge)
    : { summary: '当前没有足够的证据支持特定动作建议。', chain: [], confidence: 0, safeRefs: [] };

  // Causal refs: extract from visible sources (bounded)
  const causalRefs: { refType: string; refId: string; refLabel: string }[] = [];
  const seen = new Set<string>();
  for (const source of knowledge.visibleSources) {
    for (const entityId of source.entityRefIds) {
      const key = `${source.sourceKind}:${entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      causalRefs.push({
        refType: source.sourceKind,
        refId: entityId,
        refLabel: source.summary.slice(0, 50),
      });
    }
  }

  return {
    actorId: knowledge.actorId,
    actorRole: knowledge.actorRole,
    day: knowledge.day,
    visibleSourceRefs: knowledge.visibleSources,
    causalRefs: causalRefs.slice(0, 8),
    beliefUpdates: knowledge.beliefs,
    beliefSummary: knowledge.beliefSummary,
    pressureSignals,
    availableCommands,
    recommendedCommand,
    explanation,
    replayKey: deterministicId('dee', [knowledge.actorId, knowledge.actorRole, knowledge.day]),
  };
}
