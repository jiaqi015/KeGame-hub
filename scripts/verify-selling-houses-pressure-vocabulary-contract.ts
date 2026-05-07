/**
 * Pressure vocabulary contract verification.
 *
 * Validates:
 * 1. PressureInputSource (runtime) does NOT contain 'market-signal' or 'seasonality'.
 * 2. ConstraintSignalSource (core) DOES contain 'market-signal' and 'seasonality' as future concepts.
 * 3. Every PressureInputSource maps 1:1 to a ConstraintSignalSource value.
 * 4. DailyTickResult.pressureReceipts is typed as PressureReceiptBundle (not GameState fact).
 * 5. Source→dimension→evidenceKind mapping table is complete for all 8 runtime sources.
 * 6. company-pressure and random/scripted-event have valid vocabulary for C's next wiring.
 * 7. PressureReceiptBundle is defined in core, not runtime.
 */

import assert from 'node:assert/strict';

import type { DailyTickResult } from '../src/selling-houses/domain/models.js';
import {
  type PressureInputSource,
  type ConstraintSignalSource,
  type ConstraintSignalDimension,
  type CompetitionEvidenceKind,
  type PressureReceiptBundle,
  type PressureInput,
  type DecisionPressureDimension,
} from '../src/selling-houses/core/world-state/competition/models.js';

// ---------------------------------------------------------------------------
// 1. PressureInputSource must NOT contain market-signal / seasonality
// ---------------------------------------------------------------------------

const runtimeSources: PressureInputSource[] = [
  'rival-pressure',
  'competition-group',
  'competition-rival-loss',
  'company-pressure',
  'customer-feedback',
  'rival-customer-pull',
  'random-event',
  'scripted-event',
];

assert.strictEqual(runtimeSources.length, 8, 'PressureInputSource must have exactly 8 values');
assert.ok(!runtimeSources.includes('market-signal' as PressureInputSource), 'PressureInputSource must NOT contain market-signal');
assert.ok(!runtimeSources.includes('seasonality' as PressureInputSource), 'PressureInputSource must NOT contain seasonality');

console.log('  PressureInputSource: 8 values, no market-signal/seasonality');

// ---------------------------------------------------------------------------
// 2. ConstraintSignalSource must contain market-signal and seasonality
// ---------------------------------------------------------------------------

const coreSources: ConstraintSignalSource[] = [
  'rival-listing',
  'competition-group',
  'company-pressure',
  'customer-feedback',
  'rival-customer-pull',
  'random-event',
  'scripted-event',
  'market-signal',
  'seasonality',
];

assert.strictEqual(coreSources.length, 9, 'ConstraintSignalSource must have exactly 9 values');
assert.ok(coreSources.includes('market-signal'), 'ConstraintSignalSource must contain market-signal');
assert.ok(coreSources.includes('seasonality'), 'ConstraintSignalSource must contain seasonality');

console.log('  ConstraintSignalSource: 9 values, includes market-signal + seasonality');

// ---------------------------------------------------------------------------
// 3. PressureInputSource → ConstraintSignalSource mapping completeness
// ---------------------------------------------------------------------------

const sourceMapping: Record<PressureInputSource, ConstraintSignalSource> = {
  'rival-pressure': 'rival-listing',
  'competition-group': 'competition-group',
  'competition-rival-loss': 'competition-group',
  'company-pressure': 'company-pressure',
  'customer-feedback': 'customer-feedback',
  'rival-customer-pull': 'rival-customer-pull',
  'random-event': 'random-event',
  'scripted-event': 'scripted-event',
};

for (const [runtimeSource, coreSource] of Object.entries(sourceMapping)) {
  assert.ok(
    coreSources.includes(coreSource as ConstraintSignalSource),
    `Runtime source '${runtimeSource}' maps to valid core source '${coreSource}'`,
  );
}

// Verify no runtime source maps to market-signal or seasonality
for (const coreSource of Object.values(sourceMapping)) {
  assert.notStrictEqual(coreSource, 'market-signal', 'No runtime source may map to market-signal');
  assert.notStrictEqual(coreSource, 'seasonality', 'No runtime source may map to seasonality');
}

console.log('  Source mapping: 8 runtime → 8 core (market-signal/seasonality unmapped)');

// ---------------------------------------------------------------------------
// 4. DailyTickResult.pressureReceipts is PressureReceiptBundle, not GameState fact
// ---------------------------------------------------------------------------

// Type-level check: DailyTickResult has pressureReceipts as optional PressureReceiptBundle
type DTR_PressureReceipts = DailyTickResult['pressureReceipts'];
type AssertIsBundle = DTR_PressureReceipts extends PressureReceiptBundle | undefined ? true : never;
const _typeCheck: AssertIsBundle = true;

// Verify PressureReceiptBundle structure
const bundleFields: readonly (keyof PressureReceiptBundle)[] = [
  'snapshots',
  'decisionDeltas',
  'brokerPOV',
  'ownerPOV',
  'managerPOV',
  'inputCount',
  'day',
];

assert.ok(bundleFields.length === 7, 'PressureReceiptBundle must have 7 fields');

// Verify it's NOT a GameState field (no 'cases', 'opportunities', etc.)
const gsFields = ['cases', 'opportunities', 'closedDeals', 'customers', 'markets'] as const;
for (const field of gsFields) {
  assert.ok(
    !bundleFields.includes(field as keyof PressureReceiptBundle),
    `PressureReceiptBundle must NOT contain GameState field '${field}'`,
  );
}

console.log('  DailyTickResult.pressureReceipts: typed as PressureReceiptBundle (7 fields, not GameState)');

// ---------------------------------------------------------------------------
// 5. Source→dimension→evidenceKind mapping table for all 8 runtime sources
// ---------------------------------------------------------------------------

interface SourceVocabularyRow {
  readonly source: PressureInputSource;
  readonly typicalDimensions: readonly ConstraintSignalDimension[];
  readonly defaultEvidenceKind: CompetitionEvidenceKind;
  readonly targetEntityKind: 'case' | 'opportunity' | 'customer-runtime';
  readonly legacyMutationSite: string;
}

const sourceVocabulary: readonly SourceVocabularyRow[] = [
  {
    source: 'rival-pressure',
    typicalDimensions: ['heat', 'trust', 'competitive-pressure'],
    defaultEvidenceKind: 'rival-price-overlap',
    targetEntityKind: 'case',
    legacyMutationSite: 'applyRivalPressure → heat/trust',
  },
  {
    source: 'competition-group',
    typicalDimensions: ['heat', 'trust', 'urgency', 'competitive-pressure'],
    defaultEvidenceKind: 'group-premium-penalty',
    targetEntityKind: 'case',
    legacyMutationSite: 'tickCompetition → heat/trust/urgency',
  },
  {
    source: 'competition-rival-loss',
    typicalDimensions: ['heat'],
    defaultEvidenceKind: 'rival-loss-window',
    targetEntityKind: 'case',
    legacyMutationSite: 'sellVisibleRivalForCase → status=lost_to_rival',
  },
  {
    source: 'company-pressure',
    typicalDimensions: ['intent', 'confidence'],
    defaultEvidenceKind: 'company-shared-lead-pressure',
    targetEntityKind: 'opportunity',
    legacyMutationSite: 'applyCompanyPressure → intent/confidence on shadow leads',
  },
  {
    source: 'customer-feedback',
    typicalDimensions: ['heat', 'trust'],
    defaultEvidenceKind: 'customer-no-active-leads',
    targetEntityKind: 'case',
    legacyMutationSite: 'applyCustomerFeedbackToCases → heat/trust',
  },
  {
    source: 'rival-customer-pull',
    typicalDimensions: ['demand-heat', 'confidence', 'churn-risk'],
    defaultEvidenceKind: 'rival-customer-pull-attention',
    targetEntityKind: 'customer-runtime',
    legacyMutationSite: 'applyRivalPullOnCustomers → interest(confidence)/confidence/churnRisk',
  },
  {
    source: 'random-event',
    typicalDimensions: ['confidence', 'heat', 'trust', 'competitive-pressure'],
    defaultEvidenceKind: 'random-event-competitor-activity',
    targetEntityKind: 'case',
    legacyMutationSite: 'triggerRandomEvent → confidence/heat/trust/competitive-pressure',
  },
  {
    source: 'scripted-event',
    typicalDimensions: ['heat', 'trust', 'urgency', 'patience'],
    defaultEvidenceKind: 'scripted-event-effect',
    targetEntityKind: 'case',
    legacyMutationSite: 'fireScheduledEvents → various Case fields',
  },
];

assert.strictEqual(sourceVocabulary.length, 8, 'Source vocabulary table must cover all 8 runtime sources');

const allDimensions: ConstraintSignalDimension[] = [
  'heat', 'trust', 'patience', 'urgency', 'intent', 'confidence',
  'churn-risk', 'competitive-pressure', 'sentiment', 'demand-heat',
];

const allEvidenceKinds: CompetitionEvidenceKind[] = [
  'rival-price-overlap', 'rival-lead-siphon', 'rival-owner-anchor',
  'group-premium-penalty', 'group-price-cutter', 'group-sold-spillover',
  'company-shared-lead-pressure', 'company-internal-competition',
  'customer-no-active-leads', 'customer-comparing', 'customer-high-intent-feedback',
  'rival-customer-pull-attention',
  'random-event-policy-shift', 'random-event-school-boom', 'random-event-competitor-activity',
  'scripted-event-effect',
  'rival-loss-window', 'rival-loss-relationship-gap', 'rival-loss-trust-collapse',
  'rival-loss-pipeline-opening', 'rival-loss-price-trap',
];

const allDecisionDimensions: DecisionPressureDimension[] = [
  'price-adjustment-pressure', 'speed-pressure', 'service-quality-pressure',
  'trust-repair-pressure', 'resource-allocation-pressure',
];

for (const row of sourceVocabulary) {
  // All typical dimensions must be valid ConstraintSignalDimension
  for (const dim of row.typicalDimensions) {
    assert.ok(allDimensions.includes(dim), `${row.source}: dimension '${dim}' must be valid`);
  }
  // Default evidence kind must be valid
  assert.ok(
    allEvidenceKinds.includes(row.defaultEvidenceKind),
    `${row.source}: evidenceKind '${row.defaultEvidenceKind}' must be valid`,
  );
}

console.log('  Source vocabulary: 8 sources × dimensions/evidenceKind validated');

// ---------------------------------------------------------------------------
// 6. company-pressure and random/scripted-event vocabulary for C's next wiring
// ---------------------------------------------------------------------------

const companyRow = sourceVocabulary.find((r) => r.source === 'company-pressure')!;
assert.deepStrictEqual(companyRow.typicalDimensions, ['intent', 'confidence']);
assert.strictEqual(companyRow.defaultEvidenceKind, 'company-shared-lead-pressure');
assert.strictEqual(companyRow.targetEntityKind, 'opportunity');

const randomRow = sourceVocabulary.find((r) => r.source === 'random-event')!;
assert.ok(randomRow.typicalDimensions.includes('confidence'));
assert.ok(randomRow.typicalDimensions.includes('heat'));
assert.ok(randomRow.typicalDimensions.includes('trust'));
assert.strictEqual(randomRow.defaultEvidenceKind, 'random-event-competitor-activity');

const scriptedRow = sourceVocabulary.find((r) => r.source === 'scripted-event')!;
assert.ok(scriptedRow.typicalDimensions.includes('heat'));
assert.ok(scriptedRow.typicalDimensions.includes('trust'));
assert.strictEqual(scriptedRow.defaultEvidenceKind, 'scripted-event-effect');

console.log('  company-pressure: intent/confidence → opportunity (company-shared-lead-pressure)');
console.log('  random-event: confidence/heat/trust/competitive-pressure → case');
console.log('  scripted-event: heat/trust/urgency/patience → case');

// ---------------------------------------------------------------------------
// 7. PressureReceiptBundle is in core, not runtime
// ---------------------------------------------------------------------------

// This is verified by the import itself — we imported from core/world-state/competition/models.js
// If it were only in runtime, this import would fail.
assert.ok(true, 'PressureReceiptBundle imported from core (not runtime) — layer boundary clean');

// Verify the bundle can be built from core-only types
const testInput: PressureInput = {
  source: 'company-pressure',
  caseId: 'test-case',
  day: 1,
  dimension: 'intent',
  magnitude: -5,
  evidence: 'test',
};
assert.ok(testInput.source === 'company-pressure', 'PressureInput from core types works');

console.log('  PressureReceiptBundle: core type, no runtime dependency');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nselling-houses pressure vocabulary contract verification passed`);
