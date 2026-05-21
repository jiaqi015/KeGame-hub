/**
 * verify-selling-houses-workspace-semantic-composer-contract
 *
 * Proves:
 * - buildWorkspaceBigWorldModule is the single entry point for "Because Big" projection
 * - All sub-builders are composable and have correct contract
 * - Projection can be consumed by UI without knowing internal structure
 * - Exported types match the contract
 */

import assert from 'node:assert/strict';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import {
  buildWorkspaceBigWorldModule,
  buildCaseWorldContextPOV,
  buildComparableSupplyPOV,
  buildDemandMovementPOV,
  buildOwnerExpectationSignalPOV,
  buildBrokerActionPressurePOV,
  buildBecauseBigProof,
  type BigWorldPOVSummary,
  type CaseWorldContextPOV,
  type ComparableSupplyPOV,
  type DemandMovementPOV,
  type OwnerExpectationSignalPOV,
  type BrokerActionPressurePOV,
  type BecauseBigProof,
  type POVCausalRef,
} from '../src/selling-houses/application/projections/bigWorldPOVProjection.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testWorkspaceIsSingleEntryPoint() {
  const world = buildWorld();
  const caseId = getFirstActiveCaseId(world);

  const summary = buildWorkspaceBigWorldModule(world, caseId);
  assert.ok(summary, 'Expected summary from workspace entry point');

  // Workspace must include all sub-POVs
  const marketCell = buildCaseWorldContextPOV(world, caseId);
  const supply = buildComparableSupplyPOV(world, caseId);
  const demand = buildDemandMovementPOV(world, caseId);
  const owner = buildOwnerExpectationSignalPOV(world, caseId);
  const broker = buildBrokerActionPressurePOV(world, caseId);
  const proof = buildBecauseBigProof(world, caseId);

  assert.deepEqual(summary.marketCell, marketCell, 'Workspace marketCell must match sub-builder');
  assert.deepEqual(summary.comparableSupply, supply, 'Workspace comparableSupply must match sub-builder');
  assert.deepEqual(summary.demandMovement, demand, 'Workspace demandMovement must match sub-builder');
  assert.deepEqual(summary.ownerExpectation, owner, 'Workspace ownerExpectation must match sub-builder');
  assert.deepEqual(summary.brokerActionPressure, broker, 'Workspace brokerActionPressure must match sub-builder');
  assert.deepEqual(summary.becauseBigProof, proof, 'Workspace becauseBigProof must match sub-builder');

  console.log('  [PASS] workspace composes all sub-builders correctly');
}

function testSubBuilderContracts() {
  const world = buildWorld();
  const caseId = getFirstActiveCaseId(world);

  // CaseWorldContextPOV contract
  const ctx = buildCaseWorldContextPOV(world, caseId) as CaseWorldContextPOV;
  assert.ok(ctx.cellId, 'CaseWorldContextPOV must have cellId');
  assert.ok(ctx.cellName, 'CaseWorldContextPOV must have cellName');
  assert.equal(typeof ctx.heat, 'number', 'CaseWorldContextPOV.heat must be number');
  assert.ok(ctx.summary, 'CaseWorldContextPOV must have summary');
  assert.ok(Array.isArray(ctx.refs), 'CaseWorldContextPOV.refs must be array');
  assert.ok(ctx.refs.length > 0, 'CaseWorldContextPOV must have at least 1 ref');

  // ComparableSupplyPOV contract
  const supply = buildComparableSupplyPOV(world, caseId) as ComparableSupplyPOV;
  assert.equal(typeof supply.totalActiveInCell, 'number');
  assert.equal(typeof supply.directlyCompetingCount, 'number');
  assert.equal(typeof supply.noSupply, 'boolean');
  assert.ok(Array.isArray(supply.topSignals));
  assert.ok(supply.topSignals.length <= 3);

  // DemandMovementPOV contract
  const demand = buildDemandMovementPOV(world, caseId) as DemandMovementPOV;
  assert.ok(['inflow', 'stagnant', 'outflow'].includes(demand.direction));
  assert.equal(typeof demand.demandMomentum, 'number');
  assert.equal(typeof demand.activeCustomerCount, 'number');
  assert.equal(typeof demand.noDemand, 'boolean');
  assert.ok(Array.isArray(demand.topSignals));
  assert.ok(demand.topSignals.length <= 3);

  // OwnerExpectationSignalPOV contract
  const owner = buildOwnerExpectationSignalPOV(world, caseId) as OwnerExpectationSignalPOV;
  assert.equal(typeof owner.priceGapPct, 'number');
  assert.equal(typeof owner.trustLevel, 'number');
  assert.equal(typeof owner.patienceLevel, 'number');
  assert.equal(typeof owner.urgencyLevel, 'number');
  assert.ok(['none', 'low', 'moderate', 'high'].includes(owner.pressureLabel));
  assert.ok(typeof owner.delayedMarketSignal === 'string');
  assert.ok(Array.isArray(owner.topSignals));
  assert.ok(owner.topSignals.length <= 2);

  // BrokerActionPressurePOV contract
  const broker = buildBrokerActionPressurePOV(world, caseId) as BrokerActionPressurePOV;
  assert.equal(typeof broker.activeRivalStoreCount, 'number');
  assert.equal(typeof broker.recentRepriceCount, 'number');
  assert.equal(typeof broker.internalPressure, 'number');
  assert.ok(Array.isArray(broker.topSignals));
  assert.ok(broker.topSignals.length <= 3);

  // BecauseBigProof contract
  const proof = buildBecauseBigProof(world, caseId) as BecauseBigProof;
  assert.equal(typeof proof.hasMarketMovement, 'boolean');
  assert.equal(typeof proof.hasDemandShift, 'boolean');
  assert.equal(typeof proof.hasRivalMovement, 'boolean');
  assert.equal(typeof proof.hasOwnerPressureDelta, 'boolean');
  assert.ok(Array.isArray(proof.movementEvidence));
  assert.ok(Array.isArray(proof.safeCausalRefs));

  console.log('  [PASS] all sub-builder contracts satisfied');
}

function testUIConsumptionWithoutInternalKnowledge() {
  const world = buildWorld();
  const caseId = getFirstActiveCaseId(world);
  const summary = buildWorkspaceBigWorldModule(world, caseId) as BigWorldPOVSummary;

  // UI-like consumption: extract text for rendering without knowing internals
  const uiFields = {
    cellName: summary.marketCell.cellName,
    cellSummary: summary.marketCell.summary,
    heatBand: summary.marketCell.heatBand,
    priceTrend: summary.marketCell.priceTrend,
    supplyCount: summary.comparableSupply.totalActiveInCell,
    supplyLabel: summary.comparableSupply.noSupply
      ? summary.comparableSupply.noSupplyReason
      : `${summary.comparableSupply.totalActiveInCell} 套竞品在同板块`,
    demandDirection: summary.demandMovement.direction,
    demandMomentum: summary.demandMovement.demandMomentum,
    ownerPressure: summary.ownerExpectation.pressureLabel,
    ownerGap: Math.round(summary.ownerExpectation.priceGapPct),
    topActionReason: summary.recommendedActionReasons[0]?.headline || '暂无推荐',
  };

  // All fields must be non-null and meaningful
  assert.ok(uiFields.cellName.length > 0);
  assert.ok(uiFields.cellSummary.length > 5);
  assert.ok(uiFields.heatBand.length > 0);
  assert.ok(uiFields.priceTrend.length > 0);
  assert.ok(uiFields.supplyLabel.length > 0);
  assert.ok(['inflow', 'stagnant', 'outflow'].includes(uiFields.demandDirection));
  assert.ok(['none', 'low', 'moderate', 'high'].includes(uiFields.ownerPressure));
  assert.ok(typeof uiFields.ownerGap === 'number');
  assert.ok(uiFields.topActionReason.length > 0);

  console.log('  [PASS] UI can consume projection without internal knowledge');
}

function testTypeExportsCompile() {
  // This test verifies types are correctly exported by type-checking
  const _typeCheck: BigWorldPOVSummary['marketCell'] extends CaseWorldContextPOV ? true : never = true;
  const _typeCheck2: BigWorldPOVSummary['comparableSupply'] extends ComparableSupplyPOV ? true : never = true;
  const _typeCheck3: BigWorldPOVSummary['demandMovement'] extends DemandMovementPOV ? true : never = true;
  const _typeCheck4: BigWorldPOVSummary['ownerExpectation'] extends OwnerExpectationSignalPOV ? true : never = true;
  const _typeCheck5: BigWorldPOVSummary['brokerActionPressure'] extends BrokerActionPressurePOV ? true : never = true;
  const _typeCheck6: BigWorldPOVSummary['becauseBigProof'] extends BecauseBigProof ? true : never = true;

  assert.ok(_typeCheck);
  assert.ok(_typeCheck2);
  assert.ok(_typeCheck3);
  assert.ok(_typeCheck4);
  assert.ok(_typeCheck5);
  assert.ok(_typeCheck6);

  console.log('  [PASS] all type exports compile correctly');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('\n=== Workspace Semantic Composer Contract Verification ===\n');

testWorkspaceIsSingleEntryPoint();
testSubBuilderContracts();
testUIConsumptionWithoutInternalKnowledge();
testTypeExportsCompile();

console.log('\n=== All workspace semantic composer checks passed ===\n');
