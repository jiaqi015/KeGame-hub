/**
 * BrokerCustomerRelation Adapter — legacy projection from GameState.
 *
 * Builds BrokerCustomerRelation instances from:
 * - Opportunity (per-opportunity relation projection)
 * - GameState.customerStates + opportunities (full batch projection)
 *
 * Mother model alignment:
 * - advisorTrust in CustomerRuntimeState is a compatibility mirror of BrokerCustomerRelation.trust
 * - These projections are source='legacy_compatibility_projection'
 *
 * Hard constraints:
 * 1. Pure functions — no mutation of GameState.
 * 2. No Date.now, no Math.random.
 * 3. Source must be 'legacy_compatibility_projection'.
 */

import {
  buildBrokerCustomerRelationId,
  createBrokerCustomerRelation,
  type BrokerCustomerRelation,
} from '../core/world-state/customer/brokerCustomerRelation.js';
import type { GameState, Opportunity, CustomerRuntimeState } from './models.js';

// ---------------------------------------------------------------------------
// buildLegacyBrokerCustomerRelationFromOpportunity
// ---------------------------------------------------------------------------

/**
 * Builds a single BrokerCustomerRelation from an Opportunity.
 * Uses advisorTrust from CustomerRuntimeState as trust source.
 * Source is always 'legacy_compatibility_projection'.
 */
export function buildLegacyBrokerCustomerRelationFromOpportunity(
  state: GameState,
  opportunity: Opportunity,
): BrokerCustomerRelation {
  const brokerId = resolvePlayerBrokerId(state);
  const customerState = state.customerStates.find(
    (cs) => cs.customerId === opportunity.customerId,
  );
  const trust = customerState?.advisorTrust ?? 48;
  const familiarity = computeFamiliarity(customerState, opportunity);
  const influence = computeInfluence(customerState, opportunity);
  const firstContactDay = opportunity.createdDay;
  const lastInteractionDay = customerState?.lastTouchDay ?? opportunity.createdDay;

  return createBrokerCustomerRelation(brokerId, opportunity.customerId, state.day, {
    trust,
    familiarity,
    influence,
    source: 'legacy_compatibility_projection',
    evidenceRefs: [opportunity.id],
    sourceRecordIds: [opportunity.id],
  });
}

// ---------------------------------------------------------------------------
// buildBrokerCustomerRelationsFromGameState
// ---------------------------------------------------------------------------

/**
 * Builds all BrokerCustomerRelation instances from GameState.
 * Deduplicates by customerId — one relation per customer (the highest-trust one).
 * Source is always 'legacy_compatibility_projection'.
 */
export function buildBrokerCustomerRelationsFromGameState(
  state: GameState,
): readonly BrokerCustomerRelation[] {
  const brokerId = resolvePlayerBrokerId(state);
  const relationMap = new Map<string, BrokerCustomerRelation>();

  // Build from opportunities (source of truth for customer-broker links)
  for (const opp of state.opportunities ?? []) {
    const existing = relationMap.get(opp.customerId);
    const relation = buildLegacyBrokerCustomerRelationFromOpportunity(state, opp);
    // Keep the relation with higher trust or more recent interaction
    if (!existing || relation.trust > existing.trust) {
      relationMap.set(opp.customerId, relation);
    }
  }

  // Also cover customers with CustomerRuntimeState but no opportunities
  for (const cs of state.customerStates ?? []) {
    if (relationMap.has(cs.customerId)) continue;
    const relation = buildRelationFromCustomerState(state, brokerId, cs);
    relationMap.set(cs.customerId, relation);
  }

  return Object.freeze([...relationMap.values()]);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolvePlayerBrokerId(state: GameState): string {
  return state.bigWorldRuntime?.playerBrokerAcnId ?? 'player-broker';
}

function computeFamiliarity(
  cs: CustomerRuntimeState | undefined,
  opp: Opportunity,
): number {
  if (!cs) return 20;
  const interactionBoost = Math.min(30, (opp.history?.length ?? 0) * 5);
  const stageBoost = Math.min(20, opp.stageIndex * 4);
  const touchRecency = cs.lastTouchDay > 0 ? 10 : 0;
  return Math.max(0, Math.min(100, 20 + interactionBoost + stageBoost + touchRecency));
}

function computeInfluence(
  cs: CustomerRuntimeState | undefined,
  opp: Opportunity,
): number {
  if (!cs) return 30;
  const trustFactor = (cs.advisorTrust - 50) * 0.4;
  const intentFactor = (opp.intent - 50) * 0.3;
  return Math.max(0, Math.min(100, 50 + trustFactor + intentFactor));
}

function buildRelationFromCustomerState(
  state: GameState,
  brokerId: string,
  cs: CustomerRuntimeState,
): BrokerCustomerRelation {
  return createBrokerCustomerRelation(brokerId, cs.customerId, state.day, {
    trust: cs.advisorTrust,
    familiarity: 15,
    influence: 25,
    source: 'legacy_compatibility_projection',
    evidenceRefs: [],
    sourceRecordIds: [],
  });
}
