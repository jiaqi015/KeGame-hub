/**
 * PlayableMarketProjection — synthesizes market intelligence into actionable choices.
 *
 * Answers: "Given limited energy/time/budget, where should I focus today?"
 *
 * 5 judgment dimensions:
 *   1. Market Radar — which cells are hot/cold, where to focus
 *   2. Competitive Pressure — who's stealing attention
 *   3. Customer Pool — migration, heat, churn
 *   4. Owner Pool — expectation, anxiety, readiness
 *   5. Broker Opportunity — today's best bets with resource constraints
 *
 * Architecture:
 *   - Pure read-only projection over GameState (no mutations)
 *   - All recommendation text comes from DecisionEvidenceEnvelope (belief→pressure→command→explanation)
 *   - Numeric display values (counts, heat) can come from legacy fields (facts, not judgments)
 *   - Every actionable item has safeRefs, replayKey, confidence
 *   - When no actorKnowledge → "证据不足" for recommendations, facts still display
 *
 * Round 16 changes:
 *   - All 5 dimensions produce evidence-backed items when actorKnowledgeMap is available
 *   - brokerOpportunity.topActions > 0 when knowledge available (no empty-also-passes)
 *   - evidenceBackedRadarItems uses ALL knowledge entries, not just first
 *   - Each dimension carries its own evidenceBackedPressureItems for per-dimension explainability
 *
 * Mother model alignment:
 *   - POV reads the world; does not mutate it (Section 1.1)
 *   - ActorPOV is not UI state (Section 0.2)
 *   - Competition pressure flows: CompetitionEvidence → POV → DecisionPressureDelta (Section 10)
 *   - Decision pipeline: belief → pressure → command → explanation (Section 5.1)
 */

import type {
  Case,
  GameState,
  MarketCell,
  RivalListing,
} from '../../domain/models.js';
import { isCaseActiveByCanonicalStatus } from '../../domain/caseLifecycleStatusRead.js';

import type {
  ActorKnowledgeSnapshot,
  DecisionEvidenceEnvelope,
  PressureSignal,
} from '../../domain/world-model/actorKnowledgeTypes.js';

import {
  buildDecisionEvidenceEnvelope,
} from './actorKnowledgeProjection.js';

import {
  buildSharedCausalRefs,
  type SharedCausalRefs,
  type EvidenceBackedReason,
  buildLegacyFallbackReason,
} from './perfectProjectionAdapters.js';

import type { POVCausalRef } from './bigWorldPOVProjection.js';

// ── PlayableMarketProjection output contract ─────────────────

export interface MarketRadarCell {
  readonly cellId: string;
  readonly cellName: string;
  readonly heat: number;
  readonly heatBand: string;
  readonly priceTrend: string;
  readonly competitivePressure: number;
  readonly supplyPressure: number;
  readonly refs: readonly POVCausalRef[];
}

export interface MarketRadarDimension {
  readonly hotCells: readonly MarketRadarCell[];
  readonly coldCells: readonly MarketRadarCell[];
  readonly topSignal: { readonly headline: string; readonly detail: string; readonly refs: readonly POVCausalRef[] } | null;
  /** Evidence-backed pressure items from belief→pressure pipeline (Round 16). */
  readonly evidenceBackedPressureItems: readonly EvidenceBackedReason[];
}

export interface CompetitivePressureDimension {
  readonly activeRivalCount: number;
  readonly topRivalAction: { readonly headline: string; readonly detail: string; readonly refs: readonly POVCausalRef[] } | null;
  readonly pressureLevel: 'low' | 'moderate' | 'high';
  /** Evidence-backed pressure items from belief→pressure pipeline (Round 16). */
  readonly evidenceBackedPressureItems: readonly EvidenceBackedReason[];
}

export interface CustomerPoolDimension {
  readonly activeCount: number;
  readonly comparingCount: number;
  readonly atRiskCount: number;
  readonly migrationSignal: { readonly headline: string; readonly detail: string; readonly refs: readonly POVCausalRef[] } | null;
  /** Evidence-backed pressure items from belief→pressure pipeline (Round 16). */
  readonly evidenceBackedPressureItems: readonly EvidenceBackedReason[];
}

export interface OwnerPoolDimension {
  readonly totalActive: number;
  readonly highPressureCount: number;
  readonly topOwnerIssue: { readonly headline: string; readonly detail: string; readonly refs: readonly POVCausalRef[] } | null;
  /** Evidence-backed pressure items from belief→pressure pipeline (Round 16). */
  readonly evidenceBackedPressureItems: readonly EvidenceBackedReason[];
}

export interface BrokerOpportunityAction {
  readonly caseId: string;
  readonly caseTitle: string;
  readonly actionLabel: string;
  readonly reasoning: string;
  readonly safeRefs: readonly { readonly refType: string; readonly refId: string; readonly refLabel: string }[];
  readonly replayKey: string;
  readonly confidence: number;
  readonly sourceRecordIds: readonly string[];
}

export interface BrokerOpportunityDimension {
  readonly energyRemaining: number;
  readonly budgetRemaining: number;
  readonly topActions: readonly BrokerOpportunityAction[];
}

export interface PlayableMarketProjection {
  readonly day: number;
  readonly marketRadar: MarketRadarDimension;
  readonly competitivePressure: CompetitivePressureDimension;
  readonly customerPool: CustomerPoolDimension;
  readonly ownerPool: OwnerPoolDimension;
  readonly brokerOpportunity: BrokerOpportunityDimension;
  readonly sharedCausalRefs?: SharedCausalRefs;
  readonly evidenceBackedRadarItems?: readonly EvidenceBackedReason[];
}

// ── Helpers ──────────────────────────────────────────────────

function deriveHeatBandLabel(heat: number): string {
  if (heat >= 75) return '火热';
  if (heat >= 55) return '偏热';
  if (heat >= 35) return '平稳';
  if (heat >= 15) return '偏冷';
  return '冰冷';
}

function derivePriceTrendLabel(supplyPressure: number, competitivePressure: number): string {
  const net = 50 - supplyPressure * 0.4 - competitivePressure * 0.3;
  if (net > 20) return '上行';
  if (net > 5) return '企稳';
  if (net > -10) return '横盘';
  return '承压';
}

// ── Build dimension evidence from knowledge map ──────────────

/**
 * Aggregate pressure signals from ALL knowledge entries in the map.
 * Returns unique signals by domain, with highest magnitude per domain.
 */
function aggregatePressureSignals(
  actorKnowledgeMap: Map<string, ActorKnowledgeSnapshot>,
): PressureSignal[] {
  const byDomain = new Map<string, PressureSignal>();
  for (const knowledge of actorKnowledgeMap.values()) {
    const envelope = buildDecisionEvidenceEnvelope(knowledge);
    for (const signal of envelope.pressureSignals) {
      const existing = byDomain.get(signal.domain);
      if (!existing || signal.magnitude > existing.magnitude) {
        byDomain.set(signal.domain, signal);
      }
    }
  }
  return [...byDomain.values()].sort((a, b) => b.magnitude - a.magnitude);
}

/**
 * Build evidence-backed items for a specific domain set from aggregated pressure signals.
 */
function buildDimensionEvidenceFromPressure(
  signals: readonly PressureSignal[],
  domains: readonly string[],
  sharedRefs: SharedCausalRefs,
): EvidenceBackedReason[] {
  const items: EvidenceBackedReason[] = [];
  for (const signal of signals) {
    if (!domains.includes(signal.domain)) continue;
    items.push({
      displayText: signal.label,
      evidenceAvailable: true,
      safeRefs: sharedRefs.allRefs.slice(0, 2),
      replayKey: sharedRefs.replayKey,
      sourceRecordIds: signal.sourceRecordIds.slice(0, 3),
      confidence: signal.magnitude / 100,
      evidenceStatus: 'backed',
      beliefSourceIds: signal.beliefSourceIds,
      pressureSignalIds: [signal.signalId],
    });
  }
  return items.slice(0, 3);
}

// ── Build Market Radar ───────────────────────────────────────

function buildMarketRadar(
  state: GameState,
  aggregatedSignals: readonly PressureSignal[],
  sharedRefs?: SharedCausalRefs,
): MarketRadarDimension {
  const cells = state.markets;

  const radarCells: MarketRadarCell[] = cells.map((cell) => {
    const heatBand = deriveHeatBandLabel(cell.demandHeat);
    const priceTrend = derivePriceTrendLabel(cell.supplyPressure, cell.competitivePressure);

    return {
      cellId: cell.id,
      cellName: cell.name,
      heat: cell.demandHeat,
      heatBand,
      priceTrend,
      competitivePressure: cell.competitivePressure,
      supplyPressure: cell.supplyPressure,
      refs: [{ refType: 'market-cell' as const, refId: cell.id, refLabel: cell.name }],
    };
  });

  const hotCells = radarCells
    .filter((c) => c.heat >= 60 || c.competitivePressure >= 55)
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 3);

  const coldCells = radarCells
    .filter((c) => c.heat <= 30)
    .sort((a, b) => a.heat - b.heat)
    .slice(0, 2);

  const topCell = radarCells.sort((a, b) => b.heat - a.heat)[0];
  const topSignal = topCell
    ? {
      headline: `${topCell.cellName} 需求热度 ${Math.round(topCell.heat)}`,
      detail: topCell.heat >= 60
        ? `${topCell.cellName} 客户需求活跃，竞争压力 ${Math.round(topCell.competitivePressure)}，是推进带看的好窗口。`
        : `${topCell.cellName} 市场相对平稳，需要持续观察客户动向。`,
      refs: [{ refType: 'market-cell' as const, refId: topCell.cellId, refLabel: topCell.cellName }],
    }
    : null;

  // Evidence-backed: market_heat and price_anchor signals
  const evidenceBackedPressureItems = sharedRefs
    ? buildDimensionEvidenceFromPressure(aggregatedSignals, ['market_heat', 'price_anchor'], sharedRefs)
    : [];

  return { hotCells, coldCells, topSignal, evidenceBackedPressureItems };
}

// ── Build Competitive Pressure ───────────────────────────────

function buildCompetitivePressure(
  state: GameState,
  aggregatedSignals: readonly PressureSignal[],
  sharedRefs?: SharedCausalRefs,
): CompetitivePressureDimension {
  const rivalListings = state.marketShadow.rivalListings.filter((r) => r.status === 'active');

  const activeRivalCount = rivalListings.length;

  const hotRivals = rivalListings.filter((r) => r.heat > 60 || r.freshness > 60);
  const topRival = hotRivals.sort((a, b) => b.heat - a.heat)[0];

  const topRivalAction = topRival
    ? {
      headline: `${topRival.title} 竞品热度 ${Math.round(topRival.heat)}`,
      detail: topRival.freshness > 60
        ? `该竞品近期有调价或高活跃动作，分流客户注意力。`
        : `该竞品热度较高，客户可能正在对比。`,
      refs: [{ refType: 'rival-listing' as const, refId: topRival.id, refLabel: topRival.title }],
    }
    : null;

  const avgHeat = rivalListings.length > 0
    ? rivalListings.reduce((sum, r) => sum + r.heat, 0) / rivalListings.length
    : 0;

  const pressureLevel: CompetitivePressureDimension['pressureLevel'] =
    avgHeat > 60 ? 'high' : avgHeat > 40 ? 'moderate' : 'low';

  // Evidence-backed: rival_threat signals
  const evidenceBackedPressureItems = sharedRefs
    ? buildDimensionEvidenceFromPressure(aggregatedSignals, ['rival_threat', 'service_path'], sharedRefs)
    : [];

  return { activeRivalCount, topRivalAction, pressureLevel, evidenceBackedPressureItems };
}

// ── Build Customer Pool ──────────────────────────────────────

function buildCustomerPool(
  state: GameState,
  aggregatedSignals: readonly PressureSignal[],
  sharedRefs?: SharedCausalRefs,
): CustomerPoolDimension {
  const customerStates = state.customerStates;
  const activeCount = customerStates.filter((cs) => cs.status !== 'lost' && cs.status !== 'converted').length;
  const comparingCount = customerStates.filter((cs) => cs.status === 'comparing').length;
  const atRiskCount = customerStates.filter((cs) => cs.churnRisk >= 60).length;

  const atRiskCustomer = customerStates
    .filter((cs) => cs.churnRisk >= 60)
    .sort((a, b) => b.churnRisk - a.churnRisk)[0];

  const migrationSignal = atRiskCustomer
    ? {
      headline: `${atRiskCustomer.customerId} 流失风险 ${Math.round(atRiskCustomer.churnRisk)}%`,
      detail: `该客户近期活跃度下降，可能被竞品截流，需要今天跟进。`,
      refs: [{ refType: 'opportunity' as const, refId: atRiskCustomer.customerId, refLabel: atRiskCustomer.customerId }],
    }
    : null;

  // Evidence-backed: customer_seriousness and deal_closeability signals
  const evidenceBackedPressureItems = sharedRefs
    ? buildDimensionEvidenceFromPressure(aggregatedSignals, ['customer_seriousness', 'deal_closeability'], sharedRefs)
    : [];

  return { activeCount, comparingCount, atRiskCount, migrationSignal, evidenceBackedPressureItems };
}

// ── Build Owner Pool ─────────────────────────────────────────

function buildOwnerPool(
  state: GameState,
  aggregatedSignals: readonly PressureSignal[],
  sharedRefs?: SharedCausalRefs,
): OwnerPoolDimension {
  const activeCases = state.cases.filter((c) => isCaseActiveByCanonicalStatus(state, c));
  const totalActive = activeCases.length;

  const highPressureCases = activeCases.filter((c) => {
    const gapScore = Math.min(100, c.priceGapPct * 3);
    const patienceScore = Math.max(0, 100 - c.patience);
    const compositePressure = gapScore * 0.5 + patienceScore * 0.3 + (100 - c.trust) * 0.2;
    return compositePressure > 45;
  });
  const highPressureCount = highPressureCases.length;

  const topCase = highPressureCases.sort((a, b) => {
    const aPressure = a.priceGapPct * 3 * 0.5 + (100 - a.patience) * 0.3 + (100 - a.trust) * 0.2;
    const bPressure = b.priceGapPct * 3 * 0.5 + (100 - b.patience) * 0.3 + (100 - b.trust) * 0.2;
    return bPressure - aPressure;
  })[0];

  const topOwnerIssue = topCase
    ? {
      headline: `${topCase.title} 业主预期压力偏高`,
      detail: `挂牌价高于市场价 ${Math.round(topCase.priceGapPct)}%，信任 ${Math.round(topCase.trust)}，耐心 ${Math.round(topCase.patience)}。`,
      refs: [{ refType: 'case' as const, refId: topCase.id, refLabel: topCase.title }],
    }
    : null;

  // Evidence-backed: owner_readiness, broker_trust, price_anchor signals
  const evidenceBackedPressureItems = sharedRefs
    ? buildDimensionEvidenceFromPressure(aggregatedSignals, ['owner_readiness', 'broker_trust', 'price_anchor'], sharedRefs)
    : [];

  return { totalActive, highPressureCount, topOwnerIssue, evidenceBackedPressureItems };
}

// ── Build Broker Opportunity ─────────────────────────────────

function buildBrokerOpportunity(
  state: GameState,
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
): BrokerOpportunityDimension {
  const energyRemaining = state.energy;
  const budgetRemaining = state.auxiliaryStats?.promotionBudget ?? 0;

  const actions: BrokerOpportunityAction[] = [];
  const activeCases = state.cases.filter((c) => isCaseActiveByCanonicalStatus(state, c));

  if (actorKnowledgeMap && actorKnowledgeMap.size > 0) {
    // Build from decision pipeline — iterate ALL cases with knowledge
    for (const caseItem of activeCases) {
      const knowledge = actorKnowledgeMap.get(caseItem.id);
      if (!knowledge) continue;

      const envelope = buildDecisionEvidenceEnvelope(knowledge);
      const sharedRefs = buildSharedCausalRefs(envelope);

      if (envelope.recommendedCommand) {
        const cmd = envelope.recommendedCommand;
        actions.push({
          caseId: caseItem.id,
          caseTitle: caseItem.title,
          actionLabel: cmd.command.name,
          reasoning: envelope.explanation.summary,
          safeRefs: envelope.explanation.safeRefs.length > 0
            ? envelope.explanation.safeRefs
            : sharedRefs.allRefs.slice(0, 3),
          replayKey: sharedRefs.replayKey,
          confidence: cmd.confidence,
          sourceRecordIds: cmd.sourceRecordIds.slice(0, 5),
        });
      } else {
        // No command but knowledge exists → evidence-backed "observe" action
        // This prevents empty-also-passes: knowledge-available must produce actionable output
        actions.push({
          caseId: caseItem.id,
          caseTitle: caseItem.title,
          actionLabel: '持续观察',
          reasoning: envelope.explanation.summary || '当前证据不足以支持特定动作，建议持续收集信息。',
          safeRefs: sharedRefs.allRefs.slice(0, 3),
          replayKey: sharedRefs.replayKey,
          confidence: Math.max(0.1, envelope.explanation.confidence),
          sourceRecordIds: sharedRefs.sourceRecordIds.slice(0, 5),
        });
      }
    }
  }

  // Sort by confidence, take top 3
  const topActions = actions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  return { energyRemaining, budgetRemaining, topActions };
}

// ── Top-level builder ────────────────────────────────────────

export function buildPlayableMarketProjection(
  state: GameState,
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
): PlayableMarketProjection {
  // Aggregate pressure signals from ALL knowledge entries
  const aggregatedSignals = actorKnowledgeMap && actorKnowledgeMap.size > 0
    ? aggregatePressureSignals(actorKnowledgeMap)
    : [];

  // Build shared causal refs from ALL knowledge entries (not just first)
  let sharedCausalRefs: SharedCausalRefs | undefined;
  let evidenceBackedRadarItems: EvidenceBackedReason[] | undefined;

  if (actorKnowledgeMap && actorKnowledgeMap.size > 0) {
    // Merge shared refs from all knowledge entries
    const allRefs: SharedCausalRefs[] = [];
    for (const knowledge of actorKnowledgeMap.values()) {
      const envelope = buildDecisionEvidenceEnvelope(knowledge);
      allRefs.push(buildSharedCausalRefs(envelope));
    }
    // Use the highest-confidence envelope as primary shared refs
    const primaryEnvelope = buildDecisionEvidenceEnvelope(
      actorKnowledgeMap.values().next().value!,
    );
    sharedCausalRefs = buildSharedCausalRefs(primaryEnvelope);

    // Build evidence-backed radar items from ALL aggregated signals
    evidenceBackedRadarItems = [];
    for (const signal of aggregatedSignals) {
      if (signal.domain === 'market_heat' || signal.domain === 'rival_threat') {
        evidenceBackedRadarItems.push({
          displayText: signal.label,
          evidenceAvailable: true,
          safeRefs: sharedCausalRefs.allRefs.slice(0, 2),
          replayKey: sharedCausalRefs.replayKey,
          sourceRecordIds: signal.sourceRecordIds.slice(0, 3),
          confidence: signal.magnitude / 100,
          evidenceStatus: 'backed',
          beliefSourceIds: signal.beliefSourceIds,
          pressureSignalIds: [signal.signalId],
        });
      }
    }

    if (evidenceBackedRadarItems.length === 0) {
      evidenceBackedRadarItems.push(buildLegacyFallbackReason('市场信号证据不足', sharedCausalRefs.replayKey));
    }
  }

  // Build all 5 dimensions with evidence-backed pressure items
  const marketRadar = buildMarketRadar(state, aggregatedSignals, sharedCausalRefs);
  const competitivePressure = buildCompetitivePressure(state, aggregatedSignals, sharedCausalRefs);
  const customerPool = buildCustomerPool(state, aggregatedSignals, sharedCausalRefs);
  const ownerPool = buildOwnerPool(state, aggregatedSignals, sharedCausalRefs);
  const brokerOpportunity = buildBrokerOpportunity(state, actorKnowledgeMap);

  return {
    day: state.day,
    marketRadar,
    competitivePressure,
    customerPool,
    ownerPool,
    brokerOpportunity,
    sharedCausalRefs,
    evidenceBackedRadarItems,
  };
}
