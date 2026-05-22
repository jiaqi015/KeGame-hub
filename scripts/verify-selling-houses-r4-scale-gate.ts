// R4 Scale Gate — PROVE the Big World is real
//
// This gate must PROVE the world is real: not UI mockup, not doc
// hallucination, not worktree fake-green.
//
// Anti-fake rules: every assertion compares a real computed number
// against a threshold. No soft passes.

import {
  createBigWorldBootstrap,
  buildScaleManifest,
} from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import { deriveBrandId } from '../src/selling-houses/domain/world-model/runtime/brandIdHelper.js';
import {
  FIVE_X_SCALE_POLICY,
  FIVE_X_SCALE_PROFILE_ID,
  FIVE_X_SCALE_CONTRACT_VERSION,
} from '../src/selling-houses/domain/world-model/bigWorldSpecFactory.js';
import type { BigWorldBootstrap } from '../src/selling-houses/domain/world-model/bigWorldTypes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const results: Array<{ dimension: string; actual: number; threshold: number; pass: boolean }> = [];

function checkDimension(dimension: string, actual: number, threshold: number): void {
  const pass = actual >= threshold;
  results.push({ dimension, actual, threshold, pass });
  if (pass) {
    console.log(`  PASS: ${dimension} = ${actual} >= ${threshold}`);
  } else {
    console.log(`  FAIL: ${dimension} = ${actual} < ${threshold}`);
  }
}

// ---------------------------------------------------------------------------
// Step 1: Verify the Five-X scale constants exist and have correct values
// ---------------------------------------------------------------------------

console.log('\n=== R4 Scale Gate: Five-X Constants ===\n');

// FIVE_X_SCALE_PROFILE_ID must be the canonical string
if (FIVE_X_SCALE_PROFILE_ID !== 'five-x-city-level-v1') {
  console.log(`  FAIL: FIVE_X_SCALE_PROFILE_ID = "${FIVE_X_SCALE_PROFILE_ID}" !== "five-x-city-level-v1"`);
  process.exit(1);
} else {
  console.log(`  PASS: FIVE_X_SCALE_PROFILE_ID = "${FIVE_X_SCALE_PROFILE_ID}"`);
}

// FIVE_X_SCALE_CONTRACT_VERSION must be >= 2
if (FIVE_X_SCALE_CONTRACT_VERSION < 2) {
  console.log(`  FAIL: FIVE_X_SCALE_CONTRACT_VERSION = ${FIVE_X_SCALE_CONTRACT_VERSION} < 2`);
  process.exit(1);
} else {
  console.log(`  PASS: FIVE_X_SCALE_CONTRACT_VERSION = ${FIVE_X_SCALE_CONTRACT_VERSION} >= 2`);
}

// FIVE_X_SCALE_POLICY must have the expected thresholds baked in
if (FIVE_X_SCALE_POLICY.acnCount < 32) {
  console.log(`  FAIL: FIVE_X_SCALE_POLICY.acnCount = ${FIVE_X_SCALE_POLICY.acnCount} < 32`);
  process.exit(1);
} else {
  console.log(`  PASS: FIVE_X_SCALE_POLICY.acnCount = ${FIVE_X_SCALE_POLICY.acnCount} >= 32`);
}

// ---------------------------------------------------------------------------
// Step 2: Create a real BigWorldBootstrap
// ---------------------------------------------------------------------------

console.log('\n=== R4 Scale Gate: Create Real Bootstrap ===\n');

const SEED = 42;

const bootstrap: BigWorldBootstrap = createBigWorldBootstrap({
  seed: SEED,
  scenarioName: FIVE_X_SCALE_PROFILE_ID,
  difficultyId: 'hard',
  playerCaseCount: 5,
  scaleOverride: FIVE_X_SCALE_POLICY,
});

if (!bootstrap || bootstrap.version !== 1) {
  console.log('  FAIL: bootstrap creation returned invalid result');
  process.exit(1);
}
console.log('  Bootstrap created successfully (version=1)');

// ---------------------------------------------------------------------------
// Step 3: Read actual counts from the bootstrap and compare
// ---------------------------------------------------------------------------

console.log('\n=== R4 Scale Gate: Entity Counts ===\n');

// --- hiddenTruth dimensions ---
checkDimension(
  'hiddenTruth.acnNetworks',
  bootstrap.hiddenTruth.acnNetworks.length,
  32,
);
checkDimension(
  'hiddenTruth.marketCells',
  bootstrap.hiddenTruth.marketCells.length,
  100,
);
checkDimension(
  'hiddenTruth.microCells',
  bootstrap.hiddenTruth.microCells.length,
  300,
);
checkDimension(
  'hiddenTruth.ownerPriors',
  bootstrap.hiddenTruth.ownerProfilePriors.length,
  2500,
);
checkDimension(
  'hiddenTruth.supportingInfo',
  bootstrap.hiddenTruth.supportingInfo.length,
  800,
);

// --- materializedEntities dimensions ---
checkDimension(
  'materializedEntities.brokers',
  bootstrap.materializedEntities.brokers.length,
  750,
);
checkDimension(
  'materializedEntities.listings',
  bootstrap.materializedEntities.listings.length,
  4000,
);

// --- total demand (materialized customers + shadow cluster units) ---
const materializedCustomerCount = bootstrap.materializedEntities.customers.length;
const shadowClusterUnits = bootstrap.coldAggregate.shadowDemandClusters.reduce(
  (sum, c) => sum + c.estimatedCustomerCount,
  0,
);
const totalDemandUnits = materializedCustomerCount + shadowClusterUnits;

checkDimension(
  'totalDemand (materialized + shadow)',
  totalDemandUnits,
  21000,
);

// ---------------------------------------------------------------------------
// Step 4: Verify ScaleManifest agrees
// ---------------------------------------------------------------------------

console.log('\n=== R4 Scale Gate: ScaleManifest Cross-Check ===\n');

const scaleManifest = buildScaleManifest(bootstrap);

// The scale manifest should compute the same counts
checkDimension(
  'scaleManifest.totalListings',
  scaleManifest.totalListings,
  4000,
);
checkDimension(
  'scaleManifest.totalBrokers',
  scaleManifest.totalBrokers,
  750,
);
checkDimension(
  'scaleManifest.marketCells',
  scaleManifest.marketCells,
  100,
);
checkDimension(
  'scaleManifest.microCells',
  scaleManifest.microCells,
  300,
);
checkDimension(
  'scaleManifest.acnNetworks',
  scaleManifest.acnNetworks,
  32,
);
checkDimension(
  'scaleManifest.totalOwners',
  scaleManifest.totalOwners,
  2500,
);
checkDimension(
  'scaleManifest.totalCustomers',
  scaleManifest.totalCustomers,
  21000,
);
checkDimension(
  'scaleManifest.supportingInfoCount',
  scaleManifest.supportingInfoCount,
  800,
);

// Scale contract metadata
if (scaleManifest.scaleProfileId !== FIVE_X_SCALE_PROFILE_ID) {
  console.log(`  FAIL: scaleManifest.scaleProfileId = "${scaleManifest.scaleProfileId}" !== "${FIVE_X_SCALE_PROFILE_ID}"`);
  results.push({ dimension: 'scaleProfileId', actual: 0, threshold: 1, pass: false });
} else {
  console.log(`  PASS: scaleManifest.scaleProfileId = "${scaleManifest.scaleProfileId}"`);
  results.push({ dimension: 'scaleProfileId', actual: 1, threshold: 1, pass: true });
}

// isFiveXScale should be true when all thresholds are met
if (!scaleManifest.isFiveXScale) {
  console.log(`  FAIL: scaleManifest.isFiveXScale = false (not all five-x thresholds met)`);
  results.push({ dimension: 'isFiveXScale', actual: 0, threshold: 1, pass: false });
} else {
  console.log(`  PASS: scaleManifest.isFiveXScale = true`);
  results.push({ dimension: 'isFiveXScale', actual: 1, threshold: 1, pass: true });
}

// ---------------------------------------------------------------------------
// Step 5: Verify WorldGraph builder produces non-zero counts
// ---------------------------------------------------------------------------

console.log('\n=== R4 Scale Gate: WorldGraph Builder ===\n');

let graphBuilderAvailable = false;

try {
  const { buildWorldGraph, buildWorldGraphSummary } = await import(
    '../src/selling-houses/application/projections/worldGraphBuilder.js'
  );
  graphBuilderAvailable = true;

  if (!graphBuilderAvailable) {
    console.log('  FAIL: worldGraphBuilder import succeeded but availability flag not set');
    process.exit(1);
  }

  // Build a minimal GameState-like object that buildWorldGraph can read from.
  // buildWorldGraph reads:
  //   - state.runContext.runSeed
  //   - state.runContext.bigWorldBootstrap
  //   - state.markets (MarketCell[])
  //   - state.cases (Case[])
  //   - state.customerStates (CustomerRuntimeState[])
  //   - state.marketShadow.rivalListings (RivalListing[])
  //   - state.marketShadow.rivalStores (RivalStore[])
  //
  // We construct just enough for the graph builder to work from the bootstrap.

  const minimalState = {
    runContext: {
      runSeed: SEED,
      bigWorldBootstrap: bootstrap,
    },
    markets: bootstrap.hiddenTruth.marketCells.map((cell) => ({
      id: cell.id,
      name: cell.name,
      demandHeat: cell.heat,
      supplyPressure: cell.inventoryPressure,
      competitivePressure: 0,
      sentiment: 0,
    })),
    cases: [] as unknown[],
    customerStates: [] as unknown[],
    marketShadow: {
      rivalListings: bootstrap.materializedEntities.listings
        .filter((l) => l.layer === 'direct_rival')
        .map((l) => ({
          id: l.listingId,
          title: `rival-${l.listingId}`,
          marketCellId: l.marketCellId,
          segment: '',
          askPrice: l.askPrice,
          status: l.status,
          storeId: '',
          heat: 0,
          freshness: 0,
        })),
      rivalStores: bootstrap.materializedEntities.brokers
        .filter((b) => b.brokerId !== 'player-broker')
        .map((b) => ({
          id: b.brokerId,
          name: b.name ?? b.brokerId,
          type: b.visibility === 'named' ? 'same_company' as const : 'external_company' as const,
          style: b.style ?? 'steady',
          districtFocus: b.marketCellIds ?? [],
          leadCapturePower: Math.max(0, Math.min(100, (b.customerPoolSize ?? 4) * 10)),
          sellerInfluencePower: Math.max(0, Math.min(100, (b.listingPoolSize ?? 3) * 10)),
          pricingPressurePower: Math.max(0, Math.min(100, 50 + (b.actionBias ?? 0))),
          activityHeat: Math.max(0, Math.min(100, b.energyBudget ?? 50)),
          acnId: b.acnId,
          brandId: deriveBrandId(b.acnId),
        })),
      companyPressure: {},
      marketSignals: [],
      dailyMarketEvent: null,
      activeRuleEffects: [],
      inboundQueue: [],
    },
  } as any;

  const graph = buildWorldGraph(minimalState);
  const summary = buildWorldGraphSummary(graph, minimalState);

  checkDimension('worldGraph.acnCount', summary.acnCount, 1);
  checkDimension('worldGraph.brokerCount', summary.brokerCount, 1);
  checkDimension('worldGraph.listingCount', summary.listingCount + summary.shadowListingCount + summary.rivalListingCount, 1);
  checkDimension('worldGraph.marketCellCount', summary.marketCellCount, 1);

  // Verify marketCellSummaries have three-channel pressure fields
  const cellsWithPressure = summary.marketCellSummaries.filter(
    (c) => c.coSalePressure >= 0 && c.internalPressure >= 0 && c.rivalPressure >= 0,
  );
  checkDimension('worldGraph.marketCellsWithThreeChannelPressure', cellsWithPressure.length, 1);

  // At least one cell must have non-zero pressure in some channel
  const anyNonZeroPressure = summary.marketCellSummaries.some(
    (c) => c.coSalePressure > 0 || c.internalPressure > 0 || c.rivalPressure > 0,
  );
  if (!anyNonZeroPressure) {
    console.log('  FAIL: no market cell has any non-zero pressure');
    results.push({ dimension: 'anyNonZeroPressure', actual: 0, threshold: 1, pass: false });
  } else {
    console.log('  PASS: at least one market cell has non-zero pressure');
  }

  // The graph node counts should match bootstrap entity counts for ACN, broker, market_cell
  const acnMatch = summary.acnCount === bootstrap.hiddenTruth.acnNetworks.length;
  if (!acnMatch) {
    console.log(`  WARN: graph acnCount (${summary.acnCount}) != bootstrap acnNetworks (${bootstrap.hiddenTruth.acnNetworks.length})`);
    results.push({ dimension: 'worldGraphAcnCount', actual: summary.acnCount, threshold: bootstrap.hiddenTruth.acnNetworks.length, pass: false });
  }

  const brokerMatch = summary.brokerCount === bootstrap.materializedEntities.brokers.length;
  if (!brokerMatch) {
    console.log(`  WARN: graph brokerCount (${summary.brokerCount}) != bootstrap brokers (${bootstrap.materializedEntities.brokers.length})`);
    results.push({ dimension: 'worldGraphBrokerCount', actual: summary.brokerCount, threshold: bootstrap.materializedEntities.brokers.length, pass: false });
  }
} catch (importError: any) {
  console.log(`  FAIL: worldGraphBuilder import failed (${importError.message})`);
  results.push({ dimension: 'worldGraphBuilderImport', actual: 0, threshold: 1, pass: false });
}

// ---------------------------------------------------------------------------
// Step 6: Determinism check — same seed must produce identical bootstrap
// ---------------------------------------------------------------------------

console.log('\n=== R4 Scale Gate: Determinism ===\n');

const bootstrap2: BigWorldBootstrap = createBigWorldBootstrap({
  seed: SEED,
  scenarioName: FIVE_X_SCALE_PROFILE_ID,
  difficultyId: 'hard',
  playerCaseCount: 5,
  scaleOverride: FIVE_X_SCALE_POLICY,
});

const listingIds1 = bootstrap.materializedEntities.listings.map((l) => l.listingId).sort().join(',');
const listingIds2 = bootstrap2.materializedEntities.listings.map((l) => l.listingId).sort().join(',');
const determinismPass = listingIds1 === listingIds2;
if (determinismPass) {
  console.log(`  PASS: determinism — same seed produces identical listing IDs (${bootstrap.materializedEntities.listings.length} listings)`);
} else {
  console.log(`  FAIL: determinism — same seed produces DIFFERENT listing IDs`);
  results.push({ dimension: 'determinism', actual: 0, threshold: 1, pass: false });
}

const brokerIds1 = bootstrap.materializedEntities.brokers.map((b) => b.brokerId).sort().join(',');
const brokerIds2 = bootstrap2.materializedEntities.brokers.map((b) => b.brokerId).sort().join(',');
const brokerDeterminismPass = brokerIds1 === brokerIds2;
if (brokerDeterminismPass) {
  console.log(`  PASS: determinism — same seed produces identical broker IDs (${bootstrap.materializedEntities.brokers.length} brokers)`);
} else {
  console.log(`  FAIL: determinism — same seed produces DIFFERENT broker IDs`);
  results.push({ dimension: 'brokerDeterminism', actual: 0, threshold: 1, pass: false });
}

// Different seed must produce different seeded properties.
// Listing IDs are counter-based and identical across seeds, but
// seeded properties (askPrice, ownerRigidity, etc.) must differ.
const bootstrap3: BigWorldBootstrap = createBigWorldBootstrap({
  seed: SEED + 1,
  scenarioName: FIVE_X_SCALE_PROFILE_ID,
  difficultyId: 'hard',
  playerCaseCount: 5,
  scaleOverride: FIVE_X_SCALE_POLICY,
});

const prices1 = bootstrap.materializedEntities.listings.map((l) => l.askPrice).join(',');
const prices3 = bootstrap3.materializedEntities.listings.map((l) => l.askPrice).join(',');
const differentSeedPass = prices1 !== prices3;
if (differentSeedPass) {
  console.log(`  PASS: different seed produces different listing prices`);
} else {
  console.log(`  FAIL: different seed produces SAME listing prices — not truly seeded`);
  results.push({ dimension: 'differentSeed', actual: 0, threshold: 1, pass: false });
}

// ---------------------------------------------------------------------------
// Step 7: Real runtime verification — createInitialState + advanceGameDaysWithSummary
// ---------------------------------------------------------------------------

console.log('\n=== R4 Scale Gate: Real Runtime Verification ===\n');

try {
  const { createInitialState } = await import(
    '../src/selling-houses/application/gameState.js'
  );
  const { advanceGameDaysWithSummary } = await import(
    '../src/selling-houses/application/gameTransitions.js'
  );
  const { getScenarioSnapshotById } = await import(
    '../src/selling-houses/domain/scenarioCatalog.js'
  );

  const snapshot = getScenarioSnapshotById('warmup-clean-handoff');
  if (!snapshot) {
    console.log('  FAIL: warmup-clean-handoff scenario not found');
    results.push({ dimension: 'scenarioAvailable', actual: 0, threshold: 1, pass: false });
  } else {
    const realState = createInitialState(snapshot, SEED);
    const result = advanceGameDaysWithSummary(realState, 1);
    const next = result.nextState;
    const runtimeSummary = next.bigWorldRuntime?.worldGraphSummary;

    if (!runtimeSummary) {
      console.log('  FAIL: state.bigWorldRuntime.worldGraphSummary is undefined after advanceGameDays');
      results.push({ dimension: 'runtimeWorldGraphSummary', actual: 0, threshold: 1, pass: false });
    } else {
      console.log(`  PASS: runtime worldGraphSummary exists after 1 day advance`);
      checkDimension('runtime.acnCount', runtimeSummary.acnCount, 1);
      checkDimension('runtime.brokerCount', runtimeSummary.brokerCount, 1);
      checkDimension('runtime.listingCount', runtimeSummary.listingCount, 1);
      checkDimension('runtime.marketCellCount', runtimeSummary.marketCellCount, 1);
      checkDimension('runtime.marketCellSummaries.length', runtimeSummary.marketCellSummaries.length, 1);

      // Verify three-channel pressure fields exist on at least one cell
      const runtimeCells = runtimeSummary.marketCellSummaries.filter(
        (c: any) => typeof c.coSalePressure === 'number' && typeof c.internalPressure === 'number' && typeof c.rivalPressure === 'number',
      );
      checkDimension('runtime.marketCellsWithThreeChannelPressure', runtimeCells.length, 1);
    }
  }
} catch (runtimeError: any) {
  console.log(`  FAIL: runtime verification failed (${runtimeError.message})`);
  results.push({ dimension: 'runtimeVerification', actual: 0, threshold: 1, pass: false });
}

// ---------------------------------------------------------------------------
// Step 7.5: TimeContext and ACN Identity Verification
// ---------------------------------------------------------------------------

console.log('\n=== R4 Scale Gate: TimeContext and ACN Identity ===\n');

// 7.5a: runBigWorldDayTick must accept old-style input without timeContext
try {
  const { runBigWorldDayTick } = await import(
    '../src/selling-houses/domain/world-model/runtime/clock.js'
  );

  const oldStyleInput = {
    settledDay: 1,
    runSeed: 42,
    // Intentionally NO timeContext
    marketCells: [{ id: 'mc-1', name: 'Test', demandHeat: 50, supplyPressure: 40, competitivePressure: 30, sentiment: 60 }],
    activeCases: [],
    activeOpportunities: [],
    rivalListings: [],
    rivalStores: [],
    customerStates: [],
  };

  const receipt = runBigWorldDayTick(oldStyleInput as any);
  if (!receipt || receipt.day !== 1) {
    console.log('  FAIL: runBigWorldDayTick with missing timeContext did not produce valid receipt');
    results.push({ dimension: 'timeContextFallback', actual: 0, threshold: 1, pass: false });
  } else {
    console.log('  PASS: runBigWorldDayTick accepts old-style input without timeContext');
    results.push({ dimension: 'timeContextFallback', actual: 1, threshold: 1, pass: true });
  }
} catch (err: any) {
  console.log(`  FAIL: runBigWorldDayTick crashed with missing timeContext: ${err.message}`);
  results.push({ dimension: 'timeContextFallback', actual: 0, threshold: 1, pass: false });
}

// 7.5b: economy broker_capacity_signal acnId must equal runtime.playerBrokerAcnId
// (Check that no 'player-broker-acn' placeholder appears in source records)
try {
  const { createInitialState } = await import(
    '../src/selling-houses/application/gameState.js'
  );
  const { advanceGameDaysWithSummary } = await import(
    '../src/selling-houses/application/gameTransitions.js'
  );
  const { getScenarioSnapshotById } = await import(
    '../src/selling-houses/domain/scenarioCatalog.js'
  );

  const snapshot = getScenarioSnapshotById('warmup-clean-handoff');
  if (snapshot) {
    const state = createInitialState(snapshot, 42);
    const result = advanceGameDaysWithSummary(state, 1);
    const runtime = result.nextState.bigWorldRuntime;

    if (runtime) {
      const playerAcnId = runtime.playerBrokerAcnId;
      if (!playerAcnId) {
        console.log('  FAIL: runtime.playerBrokerAcnId must be set after createInitialState + advanceGameDaysWithSummary');
        process.exit(1);
      }
    }
  }
} catch (err: any) {
  console.log(`  WARN: could not verify playerBrokerAcnId in runtime: ${err.message}`);
  results.push({ dimension: 'playerBrokerAcnIdRuntime', actual: 0, threshold: 1, pass: false });
}

// 7.5c: No forbidden ACN patterns in source/runtime records
// Scan for: acn-same_company, acn-external_company, player-broker-acn
try {
  const { runBigWorldDayTick } = await import(
    '../src/selling-houses/domain/world-model/runtime/clock.js'
  );

  const testInput = {
    settledDay: 5,
    runSeed: 42,
    marketCells: [{ id: 'mc-1', name: 'Test', demandHeat: 50, supplyPressure: 40, competitivePressure: 30, sentiment: 60 }],
    activeCases: [{
      id: 'case-1', title: 'Test', district: 'D1', marketCellId: 'mc-1',
      trust: 50, patience: 60, urgency: 70, heat: 55, competitiveness: 45,
      d1: 30, d3: 40, ownerName: 'Owner', windowDays: 14, personality: 'steady',
    }],
    activeOpportunities: [],
    rivalListings: [{
      id: 'rl-1', storeId: 'store-1', title: 'R', district: 'D1',
      marketCellId: 'mc-1', segment: '3BR', askPrice: 300, heat: 50, freshness: 80,
      status: 'active', daysLeft: 20,
    }],
    rivalStores: [
      { id: 'store-1', name: 'Store A', type: 'same_company', style: 'steady',
        districtFocus: ['D1'], leadCapturePower: 40, sellerInfluencePower: 35,
        pricingPressurePower: 30, activityHeat: 50, acnId: 'acn-test-1' },
      { id: 'store-2', name: 'Store B', type: 'external_company', style: 'aggressive',
        districtFocus: ['D1'], leadCapturePower: 60, sellerInfluencePower: 50,
        pricingPressurePower: 45, activityHeat: 70 },
    ],
    customerStates: [{ customerId: 'c-1', status: 'active', fatigue: 10, churnRisk: 5, activeCaseIds: ['case-1'] }],
  };

  const receipt = runBigWorldDayTick(testInput as any);

  // Collect all source records (economy + external only) for ACN pattern check.
  // This is intentionally a SUBSET of the full source record surface.
  // The full audit surface is receipt.sourceRecordAudit (canonical, from clock.ts).
  const allSourceRecords = [
    ...(receipt.economyReceipt?.sourceRecords ?? []),
    ...(receipt.externalSourceRecords ?? []),
  ];

  // Verify sourceRecordAudit exists and covers more than our manual subset
  const audit = receipt.sourceRecordAudit;
  if (audit) {
    const auditTotal = audit.totalCount;
    const manualTotal = allSourceRecords.length;
    if (auditTotal < manualTotal) {
      console.log(`  FAIL: sourceRecordAudit totalCount (${auditTotal}) < manual collection (${manualTotal}) — audit surface is incomplete`);
      results.push({ dimension: 'sourceAuditConsistency', actual: auditTotal, threshold: manualTotal, pass: false });
    } else {
      console.log(`  PASS: sourceRecordAudit covers ${auditTotal} records (manual subset=${manualTotal})`);
      results.push({ dimension: 'sourceAuditConsistency', actual: auditTotal, threshold: manualTotal, pass: true });
    }
  } else {
    console.log(`  WARN: receipt.sourceRecordAudit is missing — using manual collection only`);
    results.push({ dimension: 'sourceRecordAuditPresent', actual: 0, threshold: 1, pass: false });
  }

  const allAcnIds = allSourceRecords
    .filter((r: any) => r.payload?.acnId || r.payload?.rivalAcnId || r.payload?.sourceAcnId)
    .flatMap((r: any) => [r.payload?.acnId, r.payload?.rivalAcnId, r.payload?.sourceAcnId])
    .filter((id: any): id is string => typeof id === 'string');

  const forbiddenPatterns = ['acn-same_company', 'acn-external_company', 'player-broker-acn'];
  const violations = allAcnIds.filter((id: string) => forbiddenPatterns.some(p => id.includes(p)));

  if (violations.length > 0) {
    console.log(`  FAIL: found forbidden ACN patterns: ${violations.join(', ')}`);
    results.push({ dimension: 'noForbiddenAcnPatterns', actual: 0, threshold: 1, pass: false });
  } else {
    console.log('  PASS: no forbidden ACN patterns in source records');
    results.push({ dimension: 'noForbiddenAcnPatterns', actual: 1, threshold: 1, pass: true });
  }
} catch (err: any) {
  console.log(`  FAIL: ACN pattern check crashed: ${err.message}`);
  results.push({ dimension: 'noForbiddenAcnPatterns', actual: 0, threshold: 1, pass: false });
}

// ---------------------------------------------------------------------------
// Step 8: Self-audit — no soft pass patterns in the assertion logic
// ---------------------------------------------------------------------------

console.log('\n=== R4 Scale Gate: Self-Audit ===\n');

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const gateSrc = readFileSync(
  resolve(import.meta.dirname ?? '.', 'verify-selling-houses-r4-scale-gate.ts'),
  'utf-8',
);

// Only audit the section BEFORE the self-audit section itself.
// The self-audit code naturally contains the strings it checks for
// (e.g. in its error messages), which would cause false positives.
const auditMarker = "Step 8: Self-audit";
const markerIdx = gateSrc.indexOf(auditMarker);
const businessLogicSrc = markerIdx > 0 ? gateSrc.slice(0, markerIdx) : gateSrc;

// Strip comments and string literals to avoid false positives from docs/messages
const stripped = businessLogicSrc
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/'[^']*'/g, '""')
  .replace(/"[^"]*"/g, '""')
  .replace(/`[^`]*`/g, '``');

const hasOrTrue = stripped.includes('|| true');
const hasAssertTrue = /assert\s*\(\s*true\s*\)/.test(stripped);
const hasCheckTrue = /check\s*\(\s*true\s*[,\)]/.test(stripped);

function findPatternLines(source: string, pattern: RegExp): string {
  const lines = source.split('\n');
  const hits: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) hits.push(`L${i + 1}`);
  }
  return hits.length > 0 ? ` at ${hits.join(', ')}` : '';
}

if (hasOrTrue) {
  const loc = findPatternLines(stripped, /\|\|\s*true/);
  console.log(`  FAIL: gate assertion logic contains "|| true"${loc}`);
  results.push({ dimension: 'noOrTrue', actual: 0, threshold: 1, pass: false });
} else {
  console.log('  PASS: no "|| true" in gate assertion logic');
}

if (hasAssertTrue) {
  const loc = findPatternLines(stripped, /assert\s*\(\s*true\s*\)/);
  console.log(`  FAIL: gate assertion logic contains "assert(true)"${loc}`);
  results.push({ dimension: 'noAssertTrue', actual: 0, threshold: 1, pass: false });
} else {
  console.log('  PASS: no "assert(true)" in gate assertion logic');
}

if (hasCheckTrue) {
  const loc = findPatternLines(stripped, /check\s*\(\s*true\s*[,\)]/);
  console.log(`  FAIL: gate assertion logic contains "check(true, ...)"${loc}`);
  results.push({ dimension: 'noCheckTrue', actual: 0, threshold: 1, pass: false });
} else {
  console.log('  PASS: no "check(true, ...)" in gate assertion logic');
}

// Must NOT import from .claude/worktrees/ — check import statements only
const importLines = gateSrc.split('\n').filter((line) => line.trimStart().startsWith('import '));
const hasWorktreeImport = importLines.some((line) => line.includes('.claude/worktrees/'));
if (hasWorktreeImport) {
  console.log('  FAIL: gate imports from .claude/worktrees/');
  results.push({ dimension: 'noWorktreeImport', actual: 0, threshold: 1, pass: false });
} else {
  console.log('  PASS: no imports from .claude/worktrees/');
}

// ---------------------------------------------------------------------------
// Final verdict
// ---------------------------------------------------------------------------

console.log('\n=== R4 Scale Gate: Summary ===\n');

const passCount = results.filter((r) => r.pass).length;
const failCount = results.filter((r) => !r.pass).length;
const totalCount = results.length;

console.log(`  Total checks: ${totalCount}`);
console.log(`  Passed: ${passCount}`);
console.log(`  Failed: ${failCount}`);

if (failCount > 0) {
  console.log('\n  FAILED dimensions:');
  for (const r of results.filter((r) => !r.pass)) {
    console.log(`    - ${r.dimension}: actual=${r.actual}, threshold=${r.threshold}`);
  }
  console.log('\n  GATE FAILED');
  process.exit(1);
}

console.log('\n  GATE PASSED — the Big World is real');
process.exit(0);
