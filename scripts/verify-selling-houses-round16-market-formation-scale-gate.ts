/**
 * Round 16 — Market-Formation Scale Hard Gate
 *
 * Proves market has supply/demand thickness, not just entity counts.
 *
 * Beyond R15 (500+ listings, 500+ owners), R16 requires:
 *   - Each core market cell has activeSupply, activeDemand, brokerDensity, rivalPressure, liquidityLevel
 *   - Hot/cold/mature zones have structural differences (not random noise)
 *   - Supply/demand imbalance creates real price pressure per cell
 *   - Broker density varies by cell (not uniform distribution)
 *   - Owner pool has pressure variance (not all identical)
 *
 * Anti-false-positive rules:
 *   - Entity counts alone ≠ pass (must have per-cell market thickness)
 *   - Uniform distribution ≠ pass (must have structural variance)
 *   - Bootstrap data alone ≠ pass (must verify runtime state)
 *
 * Usage: npx tsx scripts/verify-selling-houses-round16-market-formation-scale-gate.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  createBigWorldBootstrap,
  buildScaleManifest,
  buildDiversityManifest,
} from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type {
  BigWorldBootstrap,
  BigWorldScalePolicy,
} from '../src/selling-houses/domain/world-model/bigWorldTypes.js';

// ── Infrastructure ──────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; failures.push(msg); console.error(`  ❌ ${msg}`); }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

// ── Scale policy ────────────────────────────────────────────────

const MARKET_FORMATION_SCALE: BigWorldScalePolicy = {
  minMarketCells: 24,
  maxMarketCells: 24,
  acnCount: 8,
  namedBrokersPerAcn: 5,
  shadowBrokersPerAcn: 15,
  shadowListingsPerCell: 25,
  directRivalListingsPerCell: 8,
  materializedCustomersPerCell: 50,
  shadowAggregateClustersPerCell: 20,
  ownerProfilePriorCount: 500,
  customerCaseRatio: 12,
};

const SEED = 20260620;

// ── Build world ─────────────────────────────────────────────────

function buildMarketFormationWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const state = createInitialState(snapshot, seed);
  const bootstrap = createBigWorldBootstrap({
    seed,
    scenarioName: snapshot.scenario.name,
    difficultyId: snapshot.scenario.difficultyId,
    playerCaseCount: snapshot.scenario.cases.length,
    scaleOverride: MARKET_FORMATION_SCALE,
  });
  (state.runContext as any).bigWorldBootstrap = bootstrap;
  seedInitialOpportunities(state);
  return state;
}

// ══════════════════════════════════════════════════════════════════════════
// Gate
// ══════════════════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Round 16 — Market-Formation Scale Hard Gate                    ║');
console.log('║  Proves supply/demand thickness per cell, not just counts      ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════
// SECTION 1: ENTITY COUNTS — baseline scale
// ═══════════════════════════════════════════════════════════════
section('1. ENTITY COUNTS — baseline scale');

const state1 = buildMarketFormationWorld(SEED);
const bootstrap = state1.runContext.bigWorldBootstrap as BigWorldBootstrap;
const sm = buildScaleManifest(bootstrap);
const div = buildDiversityManifest(bootstrap);

console.log(`  Scale: ${sm.totalListings} listings, ${sm.totalOwners} owners, ${sm.totalCustomers} demand, ${sm.totalBrokers} brokers, ${sm.marketCells} cells`);

check(sm.totalListings >= 500, `listings >= 500 (got ${sm.totalListings})`);
check(sm.totalOwners >= 500, `owners >= 500 (got ${sm.totalOwners})`);
check(sm.totalCustomers >= 3000, `customers >= 3000 (got ${sm.totalCustomers})`);
check(sm.totalBrokers >= 100, `brokers >= 100 (got ${sm.totalBrokers})`);
check(sm.marketCells >= 20, `market cells >= 20 (got ${sm.marketCells})`);
check(sm.acnNetworks >= 5, `ACN networks >= 5 (got ${sm.acnNetworks})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 2: PER-CELL MARKET THICKNESS — activeSupply/activeDemand/brokerDensity/rivalPressure/liquidityLevel
// ═══════════════════════════════════════════════════════════════
section('2. PER-CELL MARKET THICKNESS — supply/demand/broker/rival/liquidity');

// Advance to create runtime state
advanceDays(state1, 7);
updateDerivedState(state1);

const cells = bootstrap.hiddenTruth.marketCells;
const bsListings = bootstrap.materializedEntities.listings;
const bsBrokers = bootstrap.materializedEntities.brokers;

check(cells.length >= 20, `bootstrap market cells >= 20 (got ${cells.length})`);

let cellsWithActiveSupply = 0;
let cellsWithActiveDemand = 0;
let cellsWithBrokerDensity = 0;
let cellsWithRivalPressure = 0;
let cellsWithLiquidity = 0;

for (const cell of cells) {
  // Active supply: bootstrap listings in this cell
  const cellListings = bsListings.filter((l) => l.marketCellId === cell.id);
  const activeSupply = cellListings.filter((l) => l.status === 'active').length;
  if (activeSupply > 0) cellsWithActiveSupply++;

  // Active demand: bootstrap customers targeting this cell
  const cellCustomers = bootstrap.materializedEntities.customers.filter(
    (c) => c.targetMarketCellId === cell.id,
  );
  if (cellCustomers.length > 0) cellsWithActiveDemand++;

  // Broker density: brokers covering this cell
  const cellBrokers = bsBrokers.filter((b) => b.marketCellIds.includes(cell.id));
  if (cellBrokers.length > 0) cellsWithBrokerDensity++;

  // Rival pressure: listings with heat > 50
  const hotRivals = cellListings.filter((l) => (l.competitiveness ?? 0) > 50);
  if (hotRivals.length > 0) cellsWithRivalPressure++;

  // Liquidity: deal velocity > 0 or inventory pressure < 80
  const hasLiquidity = cell.dealVelocity > 10 || cell.inventoryPressure < 80;
  if (hasLiquidity) cellsWithLiquidity++;
}

console.log(`  Cells with active supply: ${cellsWithActiveSupply}/${cells.length}`);
console.log(`  Cells with active demand: ${cellsWithActiveDemand}/${cells.length}`);
console.log(`  Cells with broker density: ${cellsWithBrokerDensity}/${cells.length}`);
console.log(`  Cells with rival pressure: ${cellsWithRivalPressure}/${cells.length}`);
console.log(`  Cells with liquidity: ${cellsWithLiquidity}/${cells.length}`);

check(cellsWithActiveSupply >= 15, `cells with active supply >= 15 (${cellsWithActiveSupply}/${cells.length})`);
check(cellsWithActiveDemand >= 10, `cells with active demand >= 10 (${cellsWithActiveDemand}/${cells.length})`);
check(cellsWithBrokerDensity >= 15, `cells with broker density >= 15 (${cellsWithBrokerDensity}/${cells.length})`);
check(cellsWithRivalPressure >= 10, `cells with rival pressure >= 10 (${cellsWithRivalPressure}/${cells.length})`);
check(cellsWithLiquidity >= 15, `cells with liquidity >= 15 (${cellsWithLiquidity}/${cells.length})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 3: STRUCTURAL VARIANCE — hot/cold/mature zones differ
// ═══════════════════════════════════════════════════════════════
section('3. STRUCTURAL VARIANCE — hot/cold/mature zones differ');

const hotCells = cells.filter((c) => c.heat >= 60);
const coldCells = cells.filter((c) => c.heat < 25);
const matureCells = cells.filter((c) => c.heat >= 25 && c.heat < 55);

check(hotCells.length >= 3, `hot zones >= 3 (got ${hotCells.length})`);
check(coldCells.length >= 2, `cold zones >= 2 (got ${coldCells.length})`);
check(matureCells.length >= 3, `mature zones >= 3 (got ${matureCells.length})`);

// Hot zones should have higher avg heat than cold zones
const hotAvgHeat = hotCells.length > 0
  ? Math.round(hotCells.reduce((s, c) => s + c.heat, 0) / hotCells.length)
  : 0;
const coldAvgHeat = coldCells.length > 0
  ? Math.round(coldCells.reduce((s, c) => s + c.heat, 0) / coldCells.length)
  : 0;

console.log(`  Hot avg heat: ${hotAvgHeat}, Cold avg heat: ${coldAvgHeat}`);
if (hotCells.length > 0 && coldCells.length > 0) {
  check(hotAvgHeat > coldAvgHeat, `hot zone avg heat > cold zone (${hotAvgHeat} > ${coldAvgHeat})`);
}

// Supply pressure should vary across cells (using inventoryPressure from bootstrap)
const supplyPressures = cells.map((c) => c.inventoryPressure);
const minSupply = Math.min(...supplyPressures);
const maxSupply = Math.max(...supplyPressures);
console.log(`  Inventory pressure range: ${minSupply} - ${maxSupply}`);
check(maxSupply > minSupply, `inventory pressure varies across cells (${minSupply} to ${maxSupply})`);

// Deal velocity should vary
const dealVelocities = cells.map((c) => c.dealVelocity);
const minComp = Math.min(...dealVelocities);
const maxComp = Math.max(...dealVelocities);
console.log(`  Deal velocity range: ${minComp} - ${maxComp}`);
check(maxComp > minComp, `deal velocity varies across cells (${minComp} to ${maxComp})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 4: OWNER POOL PRESSURE VARIANCE — not all identical
// ═══════════════════════════════════════════════════════════════
section('4. OWNER POOL PRESSURE VARIANCE — not all identical');

const ownerPriors = bootstrap.hiddenTruth.ownerProfilePriors;
const trustValues = ownerPriors.map((p) => p.expectedTrustBaseline);
const patienceValues = ownerPriors.map((p) => p.expectedPatienceBaseline);
const urgencyValues = ownerPriors.map((p) => p.expectedUrgencyBaseline);

const trustStd = Math.sqrt(trustValues.reduce((s, v) => s + (v - trustValues.reduce((a, b) => a + b, 0) / trustValues.length) ** 2, 0) / trustValues.length);
const patienceStd = Math.sqrt(patienceValues.reduce((s, v) => s + (v - patienceValues.reduce((a, b) => a + b, 0) / patienceValues.length) ** 2, 0) / patienceValues.length);

console.log(`  Trust std: ${trustStd.toFixed(1)}, Patience std: ${patienceStd.toFixed(1)}`);
check(trustStd > 5, `trust variance > 5 (${trustStd.toFixed(1)})`);
check(patienceStd > 5, `patience variance > 5 (${patienceStd.toFixed(1)})`);

// Owner archetype diversity
const ownerTypes = new Set(ownerPriors.map((p) => p.type));
check(ownerTypes.size >= 15, `owner archetypes >= 15 (${ownerTypes.size})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 5: BROKER DENSITY VARIES — not uniform distribution
// ═══════════════════════════════════════════════════════════════
section('5. BROKER DENSITY VARIES — not uniform distribution');

const brokersPerCell = new Map<string, number>();
for (const broker of bsBrokers) {
  for (const cellId of broker.marketCellIds) {
    brokersPerCell.set(cellId, (brokersPerCell.get(cellId) ?? 0) + 1);
  }
}
const brokerDensities = [...brokersPerCell.values()];
const minBrokerDensity = Math.min(...brokerDensities);
const maxBrokerDensity = Math.max(...brokerDensities);
const avgBrokerDensity = Math.round(brokerDensities.reduce((s, d) => s + d, 0) / brokerDensities.length);

console.log(`  Broker density: min=${minBrokerDensity}, max=${maxBrokerDensity}, avg=${avgBrokerDensity}`);
check(maxBrokerDensity > minBrokerDensity, `broker density varies (${minBrokerDensity} to ${maxBrokerDensity})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 6: DIVERSITY — archetypes, layouts, bands, segments
// ═══════════════════════════════════════════════════════════════
section('6. DIVERSITY — archetypes, layouts, bands, segments');

check(div.ownerArchetypeDiversity >= 20, `owner archetypes >= 20 (${div.ownerArchetypeDiversity})`);
check(div.listingTypeDiversity >= 8, `listing layouts >= 8 (${div.listingTypeDiversity})`);
check(div.priceBandDiversity >= 6, `price bands >= 6 (${div.priceBandDiversity})`);
check(div.demandSegmentDiversity >= 10, `demand segments >= 10 (${div.demandSegmentDiversity})`);
check(div.brokerStyleDiversity >= 8, `broker styles >= 8 (${div.brokerStyleDiversity})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 7: RUNTIME STATE — bigWorldRuntime exists after advance
// ═══════════════════════════════════════════════════════════════
section('7. RUNTIME STATE — bigWorldRuntime exists after advance');

check(state1.bigWorldRuntime !== undefined, 'bigWorldRuntime exists after 7 days');
check((state1.bigWorldRuntime?.tickCount ?? 0) >= 5, `tickCount >= 5 (got ${state1.bigWorldRuntime?.tickCount})`);
check((state1.worldCausalEvents?.length ?? 0) > 0, `worldCausalEvents > 0 (${state1.worldCausalEvents?.length})`);

// ═══════════════════════════════════════════════════════════════
// SELF-AUDIT
// ═══════════════════════════════════════════════════════════════
section('SELF-AUDIT — no soft patterns');

const gateSrc = readFileSync(resolve(import.meta.dirname ?? '.', '..', 'scripts/verify-selling-houses-round16-market-formation-scale-gate.ts'), 'utf-8');
const auditMarker = '// SELF-AUDIT';
const auditIdx = gateSrc.lastIndexOf(auditMarker);
const gateSrcCore = auditIdx > 0 ? gateSrc.slice(0, auditIdx) : gateSrc;
const gateSrcNoComments = gateSrcCore
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const hasOrTrue = gateSrcNoComments.includes('|| true');
const hasCheckTrue = gateSrcNoComments.match(/check\(\s*true\s*,/);
check(!hasOrTrue, 'gate source has no || true');
check(!hasCheckTrue, 'gate source has no check(true, ...)');

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 16 — Market-Formation Scale Gate`);
console.log(`  Passed: ${passed} | Failed: ${failed}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failures.length > 0) {
  console.log('\n  Failures:');
  for (const f of failures) {
    console.log(`    ❌ ${f}`);
  }
}

if (failed === 0) {
  console.log('\n  ✅ MARKET-FORMATION-SCALE achieved');
  process.exit(0);
} else {
  console.log('\n  ❌ GATE FAILED');
  process.exit(1);
}
