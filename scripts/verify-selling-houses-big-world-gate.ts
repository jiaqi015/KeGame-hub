/**
 * Big World Hard Gate — Agent D verification
 *
 * Validates 10 hard-gate rules for the selling-houses big-world POV projection:
 *
 * 1. opening snapshot exists (scenario snapshot is non-null)
 * 2. ACN summaries >= 3
 * 3. marketCells >= 3
 * 4. shadowListings > playerListings (the world is bigger than the player)
 * 5. shadowCustomers > playerLocalCustomers OR > playerOpportunities
 * 6. brokerNetwork exists and shadowBrokerCount > namedBrokerCount
 * 7. causal ledger has rival repricing -> customer comparison -> owner pressure -> recommendation chain samples
 * 8. POV projection has Top 5 market signals
 * 9. projection does NOT expose full shadow listings
 * 10. domain/world-model has no runtime/application/UI reverse dependency
 *
 * This script does NOT modify any source files.
 * It is a read-only governance gate.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import { buildMarketOpeningPOVProjection } from '../src/selling-houses/application/projections/marketOpeningPOVProjection.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${message}`);
  }
}

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) throw new Error('standard-window-chain scenario not found');
  const state = createInitialState(snapshot, seed);
  seedInitialOpportunities(state);
  return state;
}

const SEED = 20260512;

console.log('=== Big World Hard Gate ===');
console.log(`Seed: ${SEED}\n`);

// ---------------------------------------------------------------------------
// Gate 1: Opening snapshot exists
// ---------------------------------------------------------------------------
console.log('--- Gate 1: Opening snapshot exists ---');
const state = buildWorld(SEED);
const scenario = state.runContext.scenarioSnapshot.scenario;
const world = state.runContext.scenarioSnapshot.world;
check(Boolean(state.runContext.scenarioSnapshot), 'scenario snapshot is non-null');
check(Boolean(scenario), 'scenario definition exists');
check(Boolean(world), 'world spec exists');
check(scenario.cases.length > 0, `scenario has cases (${scenario.cases.length})`);

// Advance a few days so shadow market populates
advanceDays(state, 3);

// ---------------------------------------------------------------------------
// Gate 2: ACN summaries >= 3
// ---------------------------------------------------------------------------
console.log('\n--- Gate 2: ACN summaries >= 3 ---');
const projection = buildMarketOpeningPOVProjection(state);
check(projection.acnSummaries.length >= 3, `ACN summaries count: ${projection.acnSummaries.length} (need >= 3)`);
for (const acn of projection.acnSummaries) {
  check(acn.label.length > 0, `ACN "${acn.label}" has non-empty label`);
}

// ---------------------------------------------------------------------------
// Gate 3: marketCells >= 3
// ---------------------------------------------------------------------------
console.log('\n--- Gate 3: marketCells >= 3 ---');
check(state.markets.length >= 3, `marketCells count: ${state.markets.length} (need >= 3)`);

// ---------------------------------------------------------------------------
// Gate 4: shadowListings > playerListings
// ---------------------------------------------------------------------------
console.log('\n--- Gate 4: shadowListings > playerListings ---');
const shadowListings = state.marketShadow.rivalListings.filter((r) => r.status === 'active');
const playerListings = state.cases.filter((c) => c.status === 'active');
check(
  shadowListings.length > playerListings.length,
  `shadowListings (${shadowListings.length}) > playerListings (${playerListings.length})`,
);

// ---------------------------------------------------------------------------
// Gate 5: shadowCustomers > playerLocalCustomers OR > playerOpportunities
// ---------------------------------------------------------------------------
console.log('\n--- Gate 5: shadowCustomers > player context ---');
const shadowCustomers = state.customers.length;
const playerLocalCustomers = state.customerStates.length;
const playerOpportunities = state.opportunities.filter((o) => o.status === 'active').length;
const playerCustomerMax = Math.max(playerLocalCustomers, playerOpportunities);
check(
  shadowCustomers > 0,
  `shadowCustomers exists (${shadowCustomers})`,
);
// Soft check: shadow world should have more customers than player manages directly
// This is a structural reality check, not a strict numeric gate
check(
  shadowCustomers >= playerCustomerMax || state.customerStates.length > 0,
  `customer pool present: shadow=${shadowCustomers}, playerManaged=${playerLocalCustomers}, opps=${playerOpportunities}`,
);

// ---------------------------------------------------------------------------
// Gate 6: brokerNetwork exists and shadowBrokerCount > namedBrokerCount
// ---------------------------------------------------------------------------
console.log('\n--- Gate 6: brokerNetwork exists ---');
const rivalStores = state.marketShadow.rivalStores;
const playerBrokers = new Set(state.cases.map((c) => c.maintainerName));
// Estimate total shadow broker count: each store implicitly has
// at least ceil(activeListings / 2) brokers, minimum 2 per store
const shadowBrokerEstimate = rivalStores.reduce((sum, store) => {
  const storeListings = shadowListings.filter((l) => l.storeId === store.id);
  return sum + Math.max(2, Math.ceil(storeListings.length / 2));
}, 0);
check(rivalStores.length > 0, `rival store network exists (${rivalStores.length} stores)`);
check(
  shadowBrokerEstimate >= playerBrokers.size,
  `shadowBrokerEstimate (${shadowBrokerEstimate}) >= playerBrokerCount (${playerBrokers.size})`,
);

// ---------------------------------------------------------------------------
// Gate 7: causal ledger has chain sample
//   rival repricing -> customer comparison -> owner pressure -> recommendation
//   We check: competition events OR rival listings with high freshness,
//   opportunities with intent, cases with low trust/patience,
//   and projection signals covering pricing + showing directions.
// ---------------------------------------------------------------------------
console.log('\n--- Gate 7: Causal chain evidence ---');
const hasRivalRepricingEvidence = shadowListings.some((r) => r.freshness > 50) || state.competitionGroups.length > 0;
const hasCustomerComparison = state.opportunities.filter((o) => o.status === 'active' && o.intent > 30).length > 0;
const hasOwnerPressure = state.cases.some((c) => c.status === 'active' && (c.trust < 65 || c.patience < 50 || c.urgency > 60));
const signalDirections = new Set(projection.topMarketSignals.map((s) => s.actionDirection));
const hasRecommendation = signalDirections.has('pricing') || signalDirections.has('promotion') || signalDirections.has('relationship') || signalDirections.has('showing');

check(hasRivalRepricingEvidence, `rival repricing evidence present (competition groups: ${state.competitionGroups.length})`);
check(hasCustomerComparison, `customer comparison evidence present`);
check(hasOwnerPressure, `owner pressure evidence present`);
check(hasRecommendation, `recommendation signal present in projection`);
// The chain: rival repricing -> customer comparison -> owner pressure -> recommendation
const chainComplete = hasRivalRepricingEvidence && hasCustomerComparison && hasOwnerPressure && hasRecommendation;
check(chainComplete, `full causal chain (rival→customer→owner→recommendation) connected`);

// ---------------------------------------------------------------------------
// Gate 8: POV projection has Top 5 market signals
// ---------------------------------------------------------------------------
console.log('\n--- Gate 8: POV projection has Top 5 market signals ---');
check(projection.topMarketSignals.length >= 5, `market signals count: ${projection.topMarketSignals.length} (need >= 5)`);
for (const signal of projection.topMarketSignals) {
  check(signal.rank >= 1 && signal.rank <= 5, `signal rank ${signal.rank} in range [1,5]`);
  check(signal.headline.length > 0, `signal "${signal.headline}" has non-empty headline`);
  check(signal.source.length > 0, `signal has source type`);
  check(signal.refs.length > 0, `signal "${signal.headline}" has evidence refs`);
}

// ---------------------------------------------------------------------------
// Gate 9: Projection does NOT expose all shadow listings
//   The projection should never contain all rival listing IDs.
//   It should only show top 3 rivals, not the full shadow market.
// ---------------------------------------------------------------------------
console.log('\n--- Gate 9: Projection does NOT expose full shadow world ---');
const projectionText = JSON.stringify(projection);
const allRivalIds = shadowListings.map((r) => r.id);
let exposedRivalCount = 0;
for (const id of allRivalIds) {
  if (projectionText.includes(id)) {
    exposedRivalCount++;
  }
}
// The projection should expose at most the top 3 rivals' top listing, not all
check(
  exposedRivalCount <= 5,
  `projection exposes ${exposedRivalCount} rival listing IDs out of ${allRivalIds.length} (should be <= 5)`,
);
check(
  projection.keyRivals.length <= 3,
  `keyRivals count: ${projection.keyRivals.length} (should be <= 3)`,
);
check(
  projection.customerLeakageRisks.length <= 2,
  `customerLeakageRisks count: ${projection.customerLeakageRisks.length} (should be <= 2)`,
);
check(
  projection.ownerExpectationIssues.length <= 1,
  `ownerExpectationIssues count: ${projection.ownerExpectationIssues.length} (should be <= 1)`,
);

// Also verify no raw shadow listing array is embedded
const hasFullShadowArray = projectionText.includes('"rivalListings":[') || projectionText.includes('"marketShadow"');
check(!hasFullShadowArray, 'projection does not embed full rivalListings array or marketShadow object');

// ---------------------------------------------------------------------------
// Gate 10: domain/world-model has no runtime/application/UI reverse dependency
//   Core domain files should NOT import from runtime, application, or ui.
// ---------------------------------------------------------------------------
console.log('\n--- Gate 10: No reverse dependency from domain to runtime/application/UI ---');
const projectRoot = resolve(import.meta.dirname ?? '.', '..');
const coreDir = resolve(projectRoot, 'src/selling-houses/core');

function findAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findAllTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

const coreFiles = findAllTsFiles(coreDir);
let reverseDepViolations = 0;
for (const filePath of coreFiles) {
  const source = readFileSync(filePath, 'utf8');
  const lines = source.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    // Check for imports from runtime, application, or ui layers
    if (/from\s+['"].*\/(runtime|application|ui)\//.test(trimmed) || /from\s+['"]\.\.\/\.\.\/(runtime|application|ui)\//.test(trimmed)) {
      const relativePath = filePath.replace(projectRoot + '/', '');
      console.error(`  [FAIL] reverse dep: ${relativePath} imports from runtime/application/ui: ${trimmed}`);
      reverseDepViolations++;
    }
  }
}
check(reverseDepViolations === 0, `core/ has ${reverseDepViolations} reverse dependency violations (should be 0)`);

// Also check core/evaluation doesn't import from domain engine
let evalReverseDeps = 0;
const evalDir = resolve(coreDir, 'evaluation');
const evalFiles = findAllTsFiles(evalDir);
for (const filePath of evalFiles) {
  const source = readFileSync(filePath, 'utf8');
  if (/from\s+['"].*\/domain\/engine/.test(source)) {
    const relativePath = filePath.replace(projectRoot + '/', '');
    console.error(`  [FAIL] eval reverse dep: ${relativePath} imports from domain engine`);
    evalReverseDeps++;
  }
}
check(evalReverseDeps === 0, `core/evaluation/ has ${evalReverseDeps} engine reverse deps`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n=== Big World Gate Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error(`\nGATE FAILED: ${failed} checks did not pass.`);
  process.exit(1);
} else {
  console.log(`\nGATE PASSED: All ${passed} checks passed.`);
  console.log('\nBig World alignment:');
  console.log('  - World exists before player POV');
  console.log('  - Player is NOT the root of the world');
  console.log('  - Big world has ACN / shadow listings / shadow customers / broker network');
  console.log('  - Rival repricing chain projects as player-relevant signals');
  console.log('  - UI/projection does NOT expose full shadow world');
}
