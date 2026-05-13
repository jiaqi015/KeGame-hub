/**
 * verify-selling-houses-because-big-no-action-ui-diff
 *
 * Proves: "没有同类竞品" only appears when market cell truly has no comparable supply.
 * Proves: "没有客户" only appears when demand field genuinely has no demand.
 * Proves: projection only exposes top signals (bounded).
 * Proves: user-facing text is brokerage language, not model logs.
 */

import assert from 'node:assert/strict';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import {
  buildWorkspaceBigWorldModule,
  buildComparableSupplyPOV,
  buildDemandMovementPOV,
  type BigWorldPOVSummary,
} from '../src/selling-houses/application/projections/bigWorldPOVProjection.js';
import { advanceDays, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario');
  const world = createInitialState(snapshot, 20260501);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function getFirstActiveCaseId(world: ReturnType<typeof buildWorld>): string {
  const active = world.cases.find((c) => c.status === 'active');
  assert.ok(active, 'Expected at least one active case');
  return active.id;
}

const FORBIDDEN_MODEL_LOG_PATTERNS = [
  /大世界运行/i,
  /causal ledger/i,
  /shadow customer/i,
  /bootstrap 显示/i,
  /模型认为/i,
  /模型日志/i,
  /WorldCausalEvent/i,
  /GameState/i,
  /MarketCellSnapshot/i,
  /demandMomentum.*=\s*\d/i, // raw numbers
];

const FORBIDDEN_INTERNAL_METRICS = /\b(trust|patience|urgency|score|D1|D2|D3)\s*[=:]\s*\d/i;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testNoSupplyMessageAccuracy() {
  const world = buildWorld();
  const caseId = getFirstActiveCaseId(world);

  // Check each active case
  for (const caseItem of world.cases.filter((c) => c.status === 'active')) {
    const supply = buildComparableSupplyPOV(world, caseItem.id);

    if (supply.noSupply) {
      // Only claim "no supply" if there are genuinely 0 rival listings in the cell
      const actualRivals = world.marketShadow.rivalListings.filter(
        (r) => r.status === 'active' && r.marketCellId === caseItem.marketCellId,
      );
      assert.equal(
        actualRivals.length,
        0,
        `Case ${caseItem.title}: noSupply=true but found ${actualRivals.length} actual rivals in cell ${caseItem.marketCellId}`,
      );
      assert.ok(supply.noSupplyReason, 'noSupply must include a reason');
      assert.ok(supply.noSupplyReason!.length > 5, 'noSupplyReason must be human-readable');
      console.log(`  [PASS] noSupply correctly empty for cell ${caseItem.marketCellId}`);
    }
  }

  console.log('  [PASS] "没有同类竞品" only when cell truly has no comparable supply');
}

function testNoDemandMessageAccuracy() {
  const world = buildWorld();

  for (const caseItem of world.cases.filter((c) => c.status === 'active')) {
    const demand = buildDemandMovementPOV(world, caseItem.id);

    if (demand.noDemand) {
      // Only claim "no demand" if there are genuinely 0 active customers
      const actualActive = world.customerStates.filter(
        (cs) => cs.activeCaseIds.includes(caseItem.id) && cs.status !== 'lost' && cs.status !== 'converted',
      );
      assert.equal(
        actualActive.length,
        0,
        `Case ${caseItem.title}: noDemand=true but found ${actualActive.length} active customers`,
      );
      assert.ok(demand.noDemandReason, 'noDemand must include a reason');
      assert.ok(demand.noDemandReason!.length > 5, 'noDemandReason must be human-readable');
    }
  }

  console.log('  [PASS] "没有客户" only when demand field genuinely has no demand');
}

function testTopSignalsBounded() {
  const world = buildWorld();

  for (const caseItem of world.cases.filter((c) => c.status === 'active')) {
    const summary = buildWorkspaceBigWorldModule(world, caseItem.id);
    if (!summary) continue;

    assert.ok(
      summary.comparableSupply.topSignals.length <= 3,
      `ComparableSupply.topSignals must be <= 3, got ${summary.comparableSupply.topSignals.length}`,
    );
    assert.ok(
      summary.demandMovement.topSignals.length <= 3,
      `DemandMovement.topSignals must be <= 3, got ${summary.demandMovement.topSignals.length}`,
    );
    assert.ok(
      summary.ownerExpectation.topSignals.length <= 2,
      `OwnerExpectation.topSignals must be <= 2, got ${summary.ownerExpectation.topSignals.length}`,
    );
    assert.ok(
      summary.brokerActionPressure.topSignals.length <= 3,
      `BrokerActionPressure.topSignals must be <= 3, got ${summary.brokerActionPressure.topSignals.length}`,
    );
    assert.ok(
      summary.recommendedActionReasons.length <= 2,
      `recommendedActionReasons must be <= 2, got ${summary.recommendedActionReasons.length}`,
    );
  }

  console.log('  [PASS] top signals bounded per dimension');
}

function testNoForbiddenModelLogLanguage() {
  const world = buildWorld();

  for (const caseItem of world.cases.filter((c) => c.status === 'active')) {
    const summary = buildWorkspaceBigWorldModule(world, caseItem.id);
    if (!summary) continue;

    const allText = JSON.stringify(summary);

    for (const pattern of FORBIDDEN_MODEL_LOG_PATTERNS) {
      assert.ok(
        !pattern.test(allText),
        `Found forbidden model-log pattern ${pattern} in projection for case ${caseItem.title}`,
      );
    }
  }

  console.log('  [PASS] no forbidden model-log language in projection');
}

function testNoInternalMetricsExposed() {
  const world = buildWorld();

  for (const caseItem of world.cases.filter((c) => c.status === 'active')) {
    const summary = buildWorkspaceBigWorldModule(world, caseItem.id);
    if (!summary) continue;

    const textFields = [
      summary.marketCell.summary,
      ...summary.comparableSupply.topSignals.map((s) => `${s.headline} ${s.detail}`),
      ...summary.demandMovement.topSignals.map((s) => `${s.headline} ${s.detail}`),
      ...summary.ownerExpectation.topSignals.map((s) => `${s.headline} ${s.detail}`),
      ...summary.brokerActionPressure.topSignals.map((s) => `${s.headline} ${s.detail}`),
      ...summary.recommendedActionReasons.map((r) => `${r.headline} ${r.detail}`),
    ];

    for (const text of textFields) {
      assert.ok(
        !FORBIDDEN_INTERNAL_METRICS.test(text),
        `Found internal metric in text: "${text}"`,
      );
    }
  }

  console.log('  [PASS] no internal metrics exposed in user-facing text');
}

function testDay7StillRespectsBounds() {
  const world = buildWorld();

  // Advance 7 days
  for (let i = 0; i < 7; i++) {
    advanceDays(world, 1);
  }
  updateDerivedState(world);

  for (const caseItem of world.cases.filter((c) => c.status === 'active')) {
    const summary = buildWorkspaceBigWorldModule(world, caseItem.id);
    if (!summary) continue;

    assert.ok(summary.comparableSupply.topSignals.length <= 3);
    assert.ok(summary.demandMovement.topSignals.length <= 3);
    assert.ok(summary.ownerExpectation.topSignals.length <= 2);
    assert.ok(summary.brokerActionPressure.topSignals.length <= 3);
    assert.ok(summary.recommendedActionReasons.length <= 2);

    // Still no forbidden language
    const allText = JSON.stringify(summary);
    for (const pattern of FORBIDDEN_MODEL_LOG_PATTERNS) {
      assert.ok(!pattern.test(allText), `Day 7: forbidden pattern ${pattern}`);
    }
  }

  console.log('  [PASS] day 7 projection respects all bounds');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('\n=== Because-Big No-Action UI Diff Verification ===\n');

testNoSupplyMessageAccuracy();
testNoDemandMessageAccuracy();
testTopSignalsBounded();
testNoForbiddenModelLogLanguage();
testNoInternalMetricsExposed();
testDay7StillRespectsBounds();

console.log('\n=== All no-action UI diff checks passed ===\n');
