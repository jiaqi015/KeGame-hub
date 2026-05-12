/**
 * Verification script for WorldCausalLedger — "大世界因果账本"
 *
 * Checks:
 * 1. Causal ledger can be created (empty and from events)
 * 2. Opening snapshot recent events can be imported as causal events
 * 3. Rival repricing sample can derive a complete causal chain
 * 4. All events have kind / day / source / confidence / affectedIds
 * 5. causeEventIds connect properly (no dangling refs in the chain)
 * 6. Ledger does NOT depend on UI / projection / runtime
 * 7. domain/world-model/ import boundary is respected
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
// Verification
// ---------------------------------------------------------------------------

async function run() {
  // Dynamic imports to verify the actual modules
  const {
    buildMarketHeatShifted,
    buildRivalListingRepriced,
    buildCustomerComparedListings,
    buildCustomerAttentionShifted,
    buildOwnerMarketPressurePerceived,
    buildBrokerRecommendationChanged,
    buildMatterPriorityChanged,
    buildOpeningWorldEventImported,
  } = await import('../src/selling-houses/domain/world-model/causalEvents.js');

  const {
    buildCausalLedger,
    appendToLedger,
    getEventsByKind,
    getEventsByDay,
    getEventsAffecting,
    traceCausalChainBackward,
    traceCausalChainForward,
    findDanglingCauseRefs,
    validateCausalChain,
    summarizeCausalChain,
  } = await import('../src/selling-houses/domain/world-model/causalLedger.js');

  const {
    adaptOpeningRecentEvents,
    adaptDomainEventToCausal,
    adaptRivalListingReprice,
    adaptCompetitionPressureToOwnerPerception,
    buildInitialCausalEventsFromOpening,
  } = await import('../src/selling-houses/domain/world-model/causalAdapters.js');

  const {
    buildRivalRepriceCausalChain,
    verifyRivalRepriceChain,
    buildAndVerifyRivalRepriceChain,
  } = await import('../src/selling-houses/domain/world-model/causalChainExamples.js');

  // We also import the opening snapshot to test the adapter
  const { createMarketOpeningSnapshot } = await import(
    '../src/selling-houses/domain/world-model/seededMarketWorld.js'
  );

  // =========================================================================
  console.log('\n=== 1. Causal Ledger Creation ===\n');
  // =========================================================================

  // Empty ledger
  const emptyLedger = buildCausalLedger([]);
  check(emptyLedger.count === 0, 'Empty ledger has 0 events');
  check(emptyLedger.events.length === 0, 'Empty ledger events array is empty');
  check(emptyLedger.byKind.size === 0, 'Empty ledger byKind is empty');

  // Ledger with events
  const heatShift = buildMarketHeatShifted('test-heat-1', 1, {
    marketCellId: 'cell-1',
    before: 40,
    after: 60,
    sourceSignalId: 'signal-1',
    sourceSignalType: 'market-signal',
    confidence: 0.8,
  });

  const ledgerWithOne = appendToLedger(emptyLedger, heatShift);
  check(ledgerWithOne.count === 1, 'Ledger with one event has count 1');
  check(ledgerWithOne.byId.has('test-heat-1'), 'Ledger indexes event by id');

  const byKind = getEventsByKind(ledgerWithOne, 'MarketHeatShifted');
  check(byKind.length === 1, 'getEventsByKind returns 1 MarketHeatShifted');

  const byDay = getEventsByDay(ledgerWithOne, 1);
  check(byDay.length === 1, 'getEventsByDay returns 1 event for day 1');

  const byAffected = getEventsAffecting(ledgerWithOne, 'cell-1');
  check(byAffected.length === 1, 'getEventsAffecting returns 1 event for cell-1');

  // =========================================================================
  console.log('\n=== 2. Opening Snapshot Import ===\n');
  // =========================================================================

  const snapshot = createMarketOpeningSnapshot({
    seed: 42,
    scenarioName: 'test-causal',
    difficultyId: 'standard',
    playerCaseCount: 5,
  });

  const importedEvents = adaptOpeningRecentEvents(snapshot, 0);
  check(importedEvents.length > 0, `Imported ${importedEvents.length} opening events`);

  for (const event of importedEvents) {
    check(event.kind === 'OpeningWorldEventImported', `Event kind is OpeningWorldEventImported (got ${event.kind})`);
    check(typeof event.day === 'number', `Event day is number (got ${typeof event.day})`);
    check(event.source === 'opening-snapshot', `Event source is opening-snapshot (got ${event.source})`);
    check(typeof event.confidence === 'number', `Event confidence is number (got ${typeof event.confidence})`);
    check(event.affectedIds.length >= 0, `Event affectedIds exists (length ${event.affectedIds.length})`);
  }

  // Full initial causal events from opening
  const initialEvents = buildInitialCausalEventsFromOpening(snapshot);
  check(initialEvents.length >= importedEvents.length, `buildInitialCausalEventsFromOpening produces ${initialEvents.length} events (>= ${importedEvents.length})`);

  // Build ledger from opening
  const openingLedger = buildCausalLedger(initialEvents);
  check(openingLedger.count === initialEvents.length, `Opening ledger has ${openingLedger.count} events`);
  check(openingLedger.byKind.has('OpeningWorldEventImported'), 'Opening ledger has OpeningWorldEventImported kind');
  check(openingLedger.byKind.has('MarketHeatShifted'), 'Opening ledger has MarketHeatShifted kind');

  // =========================================================================
  console.log('\n=== 3. Rival Repricing Chain ===\n');
  // =========================================================================

  const chainInput = {
    day: 5,
    listingId: 'rival-listing-1',
    acnId: 'acn-2',
    brokerId: 'broker-3',
    oldPrice: 500,
    newPrice: 450,
    affectedMarketCellIds: ['cell-1'],
    affectedCaseId: 'case-1',
    comparingCustomerIds: ['customer-1', 'customer-2'],
    comparisonListingIds: ['rival-listing-1', 'case-1'],
  };

  const { output: chainOutput, verification } = buildAndVerifyRivalRepriceChain(chainInput);

  check(verification.valid, `Chain verification passed (errors: ${verification.errors.length === 0 ? 'none' : verification.errors.join('; ')})`);
  check(chainOutput.allEvents.length >= 6, `Chain has ${chainOutput.allEvents.length} events (expected >= 6)`);
  check(chainOutput.root.kind === 'RivalListingRepriced', 'Root event is RivalListingRepriced');
  check(chainOutput.comparisons.length === 2, `2 customer comparison events (got ${chainOutput.comparisons.length})`);
  check(chainOutput.attentionShifts.length === 2, `2 attention shift events (got ${chainOutput.attentionShifts.length})`);
  check(chainOutput.ownerPerceptions.length >= 1, `At least 1 owner perception event (got ${chainOutput.ownerPerceptions.length})`);
  check(chainOutput.brokerRecommendations.length === 1, `1 broker recommendation event (got ${chainOutput.brokerRecommendations.length})`);
  check(chainOutput.matterPriorityChanges.length === 1, `1 matter priority change event (got ${chainOutput.matterPriorityChanges.length})`);

  // =========================================================================
  console.log('\n=== 4. All Events Have Required Fields ===\n');
  // =========================================================================

  for (const event of chainOutput.allEvents) {
    check(event.kind !== undefined && event.kind !== null, `Event ${event.id} has kind: ${event.kind}`);
    check(typeof event.day === 'number', `Event ${event.id} has numeric day: ${event.day}`);
    check(event.source !== undefined && event.source !== null, `Event ${event.id} has source: ${event.source}`);
    check(typeof event.confidence === 'number', `Event ${event.id} has numeric confidence: ${event.confidence}`);
    check(Array.isArray(event.affectedIds), `Event ${event.id} has affectedIds array`);
  }

  // =========================================================================
  console.log('\n=== 5. Cause Event IDs Connect Properly ===\n');
  // =========================================================================

  // Check root has no causes
  check(chainOutput.root.causeEventIds.length === 0, 'Root event has no causes (is root cause)');

  // Check non-root events have causes
  const eventsWithCauses = chainOutput.allEvents.filter(e => e.causeEventIds.length > 0);
  check(eventsWithCauses.length >= 5, `At least 5 events have causes (got ${eventsWithCauses.length})`);

  // Check all cause IDs reference real events in the chain
  const dangling = findDanglingCauseRefs(chainOutput.ledger);
  check(dangling.length === 0, `No dangling cause refs (found ${dangling.length}: ${dangling.join(', ')})`);

  // Check causal chain traversal works
  const lastEvent = chainOutput.matterPriorityChanges[0];
  if (lastEvent) {
    const backwardChain = traceCausalChainBackward(chainOutput.ledger, lastEvent.id);
    check(backwardChain.length >= 2, `Backward chain from last event has ${backwardChain.length} events (expected >= 2)`);

    const forwardFromRoot = traceCausalChainForward(chainOutput.ledger, chainOutput.root.id);
    check(forwardFromRoot.length >= 3, `Forward chain from root has ${forwardFromRoot.length} events (expected >= 3)`);

    // Summarize chain
    const summary = summarizeCausalChain(chainOutput.ledger, lastEvent.id);
    check(summary.length > 0, `Causal chain summary has ${summary.length} lines`);
  }

  // =========================================================================
  console.log('\n=== 6. Ledger Does NOT Depend on UI/Projection/Runtime ===\n');
  // =========================================================================

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

  // =========================================================================
  console.log('\n=== 7. Adapter Tests ===\n');
  // =========================================================================

  // Test adaptDomainEventToCausal
  const marketEvent = {
    id: 'evt-market-1',
    day: 3,
    kind: 'market_event',
    actor: 'system',
    title: 'Market heat shift',
    detail: 'Cell 1 heat increased',
    payload: { targetMarketCellId: 'cell-1', demandHeatDelta: 15 },
  };
  const adapted = adaptDomainEventToCausal(marketEvent);
  check(adapted !== null, 'adaptDomainEventToCausal returns non-null for market_event');
  if (adapted) {
    check(adapted.kind === 'MarketHeatShifted', `Adapted kind is MarketHeatShifted (got ${adapted.kind})`);
    check(adapted.day === 3, `Adapted day is 3 (got ${adapted.day})`);
  }

  // Test adaptRivalListingReprice
  const repriced = adaptRivalListingReprice({
    listingId: 'rival-1',
    acnId: 'acn-1',
    brokerId: 'broker-1',
    oldPrice: 600,
    newPrice: 550,
    affectedMarketCellIds: ['cell-1'],
    day: 5,
  });
  check(repriced.kind === 'RivalListingRepriced', 'adaptRivalListingReprice produces RivalListingRepriced');
  check((repriced.payload as any).priceDelta === -50, 'Price delta is -50');

  // Test adaptCompetitionPressureToOwnerPerception
  const ownerPerceived = adaptCompetitionPressureToOwnerPerception({
    caseId: 'case-1',
    day: 5,
    netHeatDelta: -8,
    netTrustDelta: -3,
    sourceEntityIds: ['rival-1'],
  }, ['evt-1']);
  check(ownerPerceived.kind === 'OwnerMarketPressurePerceived', 'adaptCompetitionPressureToOwnerPerception produces OwnerMarketPressurePerceived');
  check(ownerPerceived.causeEventIds.includes('evt-1'), 'Cause event ids are set');

  // =========================================================================
  // Summary
  // =========================================================================

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
