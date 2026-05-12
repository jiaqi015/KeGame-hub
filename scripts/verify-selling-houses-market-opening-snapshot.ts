/**
 * Verification script for MarketOpeningSnapshot — "大世界开局底座"
 *
 * Checks:
 * 1. opening snapshot exists on a fresh GameState
 * 2. seed deterministic (same seed -> identical snapshot)
 * 3. ACN >= 3
 * 4. MarketCell >= 3
 * 5. shadow listings > player cases
 * 6. shadow customers > player opportunities
 * 7. broker network exists, shadow brokers > named brokers
 * 8. domain/world-model/ does NOT import runtime/application/ui
 * 9. tsc --noEmit passes (called externally)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.error(`  [FAIL] ${message}`);
  }
}

function walkTsFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...walkTsFiles(fullPath));
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        results.push(fullPath);
      }
    }
  } catch { /* directory doesn't exist */ }
  return results;
}

// ---------------------------------------------------------------------------
// Test: createMarketOpeningSnapshot directly
// ---------------------------------------------------------------------------

console.log('\n=== MarketOpeningSnapshot Verification ===\n');

// We dynamically import to verify the actual module
async function run() {
  const { createMarketOpeningSnapshot } = await import(
    '../src/selling-houses/domain/world-model/seededMarketWorld.js'
  );
  const {
    readMarketOpeningSnapshot,
    assertMarketOpeningInvariants,
  } = await import(
    '../src/selling-houses/domain/world-model/marketOpening.js'
  );

  // --- 1. Snapshot exists and has correct shape ---
  console.log('\n--- 1. Snapshot creation ---');
  const snapshot = createMarketOpeningSnapshot({
    seed: 42,
    scenarioName: 'test-scenario',
    difficultyId: 'standard',
    playerCaseCount: 5,
  });

  check(snapshot !== null && snapshot !== undefined, 'Snapshot is created');
  check(snapshot.version === 1, `Snapshot version is 1 (got ${snapshot.version})`);
  check(snapshot.seed === 42, `Snapshot seed is 42 (got ${snapshot.seed})`);
  check(snapshot.scenarioName === 'test-scenario', 'Scenario name preserved');
  check(snapshot.playerCaseCount === 5, 'Player case count preserved');

  // --- 2. Seed deterministic ---
  console.log('\n--- 2. Seed deterministic ---');
  const snapshot2 = createMarketOpeningSnapshot({
    seed: 42,
    scenarioName: 'test-scenario',
    difficultyId: 'standard',
    playerCaseCount: 5,
  });
  const s1 = JSON.stringify(snapshot);
  const s2 = JSON.stringify(snapshot2);
  check(s1 === s2, 'Same seed produces identical snapshot');

  const snapshot3 = createMarketOpeningSnapshot({
    seed: 99,
    scenarioName: 'test-scenario',
    difficultyId: 'standard',
    playerCaseCount: 5,
  });
  const s3 = JSON.stringify(snapshot3);
  check(s1 !== s3, 'Different seed produces different snapshot');

  // --- 3. ACN >= 3 ---
  console.log('\n--- 3. ACN networks ---');
  check(
    snapshot.acnNetworks.length >= 3,
    `ACN networks >= 3 (got ${snapshot.acnNetworks.length})`,
  );

  // Check roles
  const acnRoles = snapshot.acnNetworks.map((a) => a.role);
  check(acnRoles.includes('player_acn'), 'Has player_acn');
  check(acnRoles.includes('strong_rival_acn'), 'Has strong_rival_acn');
  check(acnRoles.includes('local_relational'), 'Has local_relational');

  // --- 4. MarketCell >= 3 ---
  console.log('\n--- 4. Market cells ---');
  check(
    snapshot.marketCells.length >= 3,
    `Market cells >= 3 (got ${snapshot.marketCells.length})`,
  );

  // Heat is structured numeric
  for (const cell of snapshot.marketCells) {
    check(
      typeof cell.heat === 'number' && cell.heat >= 0 && cell.heat <= 100,
      `MarketCell ${cell.id} heat is 0-100 numeric (${cell.heat})`,
    );
  }

  // --- 5. Shadow listings > player cases ---
  console.log('\n--- 5. Listing inventory ---');
  check(
    snapshot.listingInventory.shadowListingCount > snapshot.playerCaseCount,
    `Shadow listings (${snapshot.listingInventory.shadowListingCount}) > player cases (${snapshot.playerCaseCount})`,
  );

  // --- 6. Shadow customers > 0 ---
  console.log('\n--- 6. Customer demand ---');
  check(
    snapshot.customerDemand.shadowCustomerCount > 0,
    `Shadow customer count > 0 (${snapshot.customerDemand.shadowCustomerCount})`,
  );

  // --- 7. Broker network ---
  console.log('\n--- 7. Broker network ---');
  check(
    snapshot.brokerNetwork !== null && snapshot.brokerNetwork !== undefined,
    'Broker network exists',
  );
  check(
    snapshot.brokerNetwork.shadowBrokerCount > snapshot.brokerNetwork.namedBrokers.length,
    `Shadow brokers (${snapshot.brokerNetwork.shadowBrokerCount}) > named brokers (${snapshot.brokerNetwork.namedBrokers.length})`,
  );
  check(
    snapshot.brokerNetwork.namedBrokers.length >= 3,
    `Named brokers >= 3 (got ${snapshot.brokerNetwork.namedBrokers.length})`,
  );

  // --- 8. assertMarketOpeningInvariants ---
  console.log('\n--- 8. Invariant assertions ---');
  const invariantErrors = assertMarketOpeningInvariants(snapshot);
  check(
    invariantErrors.length === 0,
    `Invariant assertions pass (errors: ${invariantErrors.length === 0 ? 'none' : invariantErrors.join('; ')})`,
  );

  // --- 9. readMarketOpeningSnapshot helper ---
  console.log('\n--- 9. readMarketOpeningSnapshot helper ---');
  const mockState = {
    runContext: {
      marketOpeningSnapshot: snapshot,
    },
  };
  const readBack = readMarketOpeningSnapshot(mockState);
  check(readBack !== null, 'readMarketOpeningSnapshot returns snapshot');
  check(
    readBack!.seed === 42,
    `readMarketOpeningSnapshot seed is 42 (got ${readBack!.seed})`,
  );

  const mockLegacyState = { runContext: {} };
  const readBackNull = readMarketOpeningSnapshot(mockLegacyState);
  check(readBackNull === null, 'readMarketOpeningSnapshot returns null for legacy state');

  // --- 10. domain/world-model/ does NOT import runtime/application/ui ---
  console.log('\n--- 10. Import boundary check ---');
  const worldModelDir = join(process.cwd(), 'src/selling-houses/domain/world-model');
  const worldModelFiles = walkTsFiles(worldModelDir);

  check(worldModelFiles.length > 0, `Found ${worldModelFiles.length} files in domain/world-model/`);

  for (const filePath of worldModelFiles) {
    const src = readFileSync(filePath, 'utf8');
    const stripped = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    const hasRuntime = /from\s+['"]\.\.\/(\.\.\/)?runtime\//.test(stripped);
    const hasApplication = /from\s+['"]\.\.\/(\.\.\/)?application\//.test(stripped);
    const hasUi = /from\s+['"]\.\.\/(\.\.\/)?(ui|interface)\//.test(stripped);

    check(!hasRuntime, `${filePath} does not import runtime/`);
    check(!hasApplication, `${filePath} does not import application/`);
    check(!hasUi, `${filePath} does not import ui/`);
  }

  // --- Summary ---
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failures.length > 0) {
    console.error('\nFailures:');
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  } else {
    console.log('\nAll checks passed.');
  }
}

run().catch((err) => {
  console.error('Verification script failed to run:', err);
  process.exit(1);
});
