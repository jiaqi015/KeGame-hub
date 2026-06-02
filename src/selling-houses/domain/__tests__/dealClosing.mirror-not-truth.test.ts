/**
 * R19 contract: contract facts are the canonical source of truth, NOT the
 * legacy `closedDeals` mirror.
 *
 * `state.closedDeals` is a derived view synced from
 * `runtimeContractFacts` via `syncLegacyCaseDealMirrorsFromContractFact`.
 * If the mirror and the contract store diverge, the contract store
 * wins. Specifically, the idempotency checks at dealClosing.ts:265 and
 * dealClosing.ts:682 must read from `runtimeContractFacts`, not from
 * the legacy mirror.
 *
 * This test injects a stale `closedDeals` entry with NO matching
 * `runtimeContractFacts` and asserts the close path still proceeds to
 * the canonical R44 evaluation (which must collapse the consensus when
 * proof is absent) rather than silently short-circuiting on the mirror.
 */
import { describe, expect, it } from 'vitest';
import { createInitialState, updateDerivedState } from '../../application/gameState.js';
import { queueDealClosingEvaluation, settlePendingDealClosings } from '../dealClosing.js';
import { seedInitialOpportunities } from '../engine.js';
import { getScenarioSnapshotById } from '../scenarioCatalog.js';
import { releaseMarketDealSlotsForDay, asWritableCase, asWritableGameState } from '../models.js';

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

function injectStaleClosedDealsMirror(world: ReturnType<typeof createWorld>, caseId: string) {
  asWritableGameState(world).closedDeals.push({
    caseId,
    closedAt: 'stale',
  } as unknown as (typeof world.closedDeals)[number]);
}

describe('dealClosing — R19 canonical contract fact as truth', () => {
  it('does NOT short-circuit on stale closedDeals mirror when no runtimeContractFacts exists', () => {
    const world = createWorld(20260429);
    const { opportunity, caseItem } = pickAndBoostSettleable(world);
    injectStaleClosedDealsMirror(world, caseItem.id);

    queueDealClosingEvaluation(world, caseItem, opportunity, 'balanced');
    stripAllEvidence(world);
    settlePendingDealClosings(world);

    const formations = (world.runtimeConsensusFormations ?? []) as unknown as readonly {
      stage: string;
    }[];
    expect(formations.length, 'expected at least one consensus formation after queue').toBeGreaterThan(0);
    const consensusAfter = formations[0];
    expect(
      consensusAfter.stage,
      'consensus must collapse to "collapsed" when no canonical proof is available, ' +
        'even if a stale closedDeals mirror is present',
    ).toBe('collapsed');
  });
});
