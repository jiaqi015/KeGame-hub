/**
 * R44 contract: deal closing is ONLY valid when canonical proof exists.
 *
 * `buildCanonicalPriceTrajectoryFromEvidence` returns success=false when
 * both persisted and pending source records are empty. In that case
 * `finalizeClosedDeal` must NOT mark the deal as converted:
 *   - auxiliaryStats.soldCount must NOT increment
 *   - auxiliaryStats.commission must NOT increase
 *   - opportunity.status must NOT become 'won'
 *
 * Lines 412-435 and 437-444 of dealClosing.ts run unconditional stat
 * push / status updates before the `if (contractFact)` legacy-mirror
 * guard at line 401. This test enforces that boundary.
 */
import { describe, expect, it } from 'vitest';
import { createInitialState, updateDerivedState } from '../../application/gameState.js';
import { queueDealClosingEvaluation, settlePendingDealClosings } from '../dealClosing.js';
import { seedInitialOpportunities } from '../engine.js';
import { getScenarioSnapshotById } from '../scenarioCatalog.js';
import { releaseMarketDealSlotsForDay, asWritableCase } from '../models.js';

function createWorld(seed: number) {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) {
    throw new Error('Expected standard-window-chain scenario to exist');
  }
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function pickAndBoostSettleable(world: ReturnType<typeof createWorld>) {
  releaseMarketDealSlotsForDay(world, 1);

  const opportunity = world.opportunities
    .filter((entry) => entry.caseId && entry.daysLeft >= 2)
    .sort((a, b) => b.intent - a.intent)[0];
  const caseItem = world.cases.find((entry) => entry.id === opportunity?.caseId);
  if (!opportunity || !caseItem) {
    throw new Error('Expected an opportunity and a matching case to exist');
  }

  opportunity.intent = 100;
  opportunity.confidence = 100;
  opportunity.fit = 100;
  opportunity.budgetMax = caseItem.askPrice * 3;
  caseItem.heat = 100;
  caseItem.competitiveness = 100;
  asWritableCase(caseItem).trust = 100;
  caseItem.askPrice = caseItem.marketPrice;

  return { opportunity, caseItem };
}

function stripAllEvidence(world: ReturnType<typeof createWorld>) {
  (world as { pendingSourceRecords: unknown[] }).pendingSourceRecords = [];
  if (world.bigWorldRuntime) {
    (
      world.bigWorldRuntime as { persistedSourceRecords: unknown[] }
    ).persistedSourceRecords = [];
  }
}

describe('dealClosing — R44 false-deal invariant', () => {
  it('does NOT increment soldCount/commission when canonical evidence is missing', () => {
    const world = createWorld(20260425);
    stripAllEvidence(world);
    const { opportunity, caseItem } = pickAndBoostSettleable(world);

    const beforeSoldCount = world.auxiliaryStats.soldCount;
    const beforeCommission = world.auxiliaryStats.commission;

    queueDealClosingEvaluation(world, caseItem, opportunity, 'balanced');
    settlePendingDealClosings(world);

    expect(
      world.auxiliaryStats.soldCount,
      'soldCount must NOT increment when canonical evidence is missing',
    ).toBe(beforeSoldCount);
    expect(
      world.auxiliaryStats.commission,
      'commission must NOT increase when canonical evidence is missing',
    ).toBe(beforeCommission);
  });

  it('does NOT mark opportunity.status as "won" when canonical evidence is missing', () => {
    const world = createWorld(20260426);
    stripAllEvidence(world);
    const { opportunity, caseItem } = pickAndBoostSettleable(world);

    queueDealClosingEvaluation(world, caseItem, opportunity, 'balanced');
    settlePendingDealClosings(world);

    expect(
      opportunity.status,
      'opportunity.status must NOT be "won" when canonical evidence is missing',
    ).not.toBe('won');
  });
});
