/**
 * Verification script for D4 Receipt Coverage / Confidence.
 *
 * Checks:
 * 1. Empty receipts → coverage = 0, maxConfidence = 0
 * 2. Partial receipts (2/5 wired) → coverage = 0.4, maxConfidence = 0.3
 * 3. Full wired receipts → coverage = 1.0, maxConfidence = 0.75
 * 4. Pending sources (company-pressure, random-event, scripted-event) don't affect coverage ratio
 * 5. market-signal is informational, not counted as pending or wired
 * 6. Coverage report sources are correctly categorized
 * 7. buildD4ConfidenceFromCoverage returns maxConfidence
 * 8. D4 total / legacy score unchanged by coverage
 * 9. Freeze behavior on returned report
 */

import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type { PressureInput } from '../src/selling-houses/core/world-state/competition/models.js';
import {
  createPressureCollectionBuffer,
  buildPressureReceiptsFromBuffer,
} from '../src/selling-houses/core/world-state/competition/pressureBuffer.js';

import {
  buildAssetScoreSnapshotFromLegacyCase,
  buildAssetScoreSnapshotFromLegacyCaseWithPressureReceipts,
  buildD4ConfidenceFromCoverage,
  buildD4ReceiptCoverageReport,
} from '../src/selling-houses/core/evaluation/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildWorld(): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260421);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function buildReceiptBundle(day: number, inputs: PressureInput[]) {
  const buffer = createPressureCollectionBuffer(day);
  for (const input of inputs) {
    buffer.collectPressure(input);
  }
  return buildPressureReceiptsFromBuffer(buffer);
}

// ---------------------------------------------------------------------------
// 1. Empty receipts → coverage = 0, maxConfidence = 0
// ---------------------------------------------------------------------------

function verifyEmptyReceiptsZeroCoverage() {
  const report = buildD4ReceiptCoverageReport(null);

  assert.equal(report.coverage, 0, 'coverage must be 0 for null receipts');
  assert.equal(report.maxConfidence, 0, 'maxConfidence must be 0 for null receipts');
  assert.equal(report.wiredCount, 0, 'wiredCount must be 0');
  assert.equal(report.wiredTotal, 7, 'wiredTotal must be 7');

  const reportUndefined = buildD4ReceiptCoverageReport(undefined);
  assert.equal(reportUndefined.coverage, 0, 'coverage must be 0 for undefined receipts');

  console.log('  [PASS] Empty receipts → coverage = 0');
}

// ---------------------------------------------------------------------------
// 2. Partial receipts (2/7 wired) → coverage ≈ 0.286
// ---------------------------------------------------------------------------

function verifyPartialReceiptsPartialCoverage() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  // rival-pressure maps to signal source 'rival-listing'
  // competition-group maps to signal source 'competition-group'
  const inputs: PressureInput[] = [
    {
      source: 'rival-pressure',
      caseId: caseItem.id,
      day: world.day,
      dimension: 'heat',
      magnitude: -3,
      evidence: '竞品热度冲击',
    },
    {
      source: 'competition-group',
      caseId: caseItem.id,
      day: world.day,
      dimension: 'trust',
      magnitude: -2,
      evidence: '竞争组信任侵蚀',
    },
  ];
  const receipts = buildReceiptBundle(world.day, inputs);
  const report = buildD4ReceiptCoverageReport(receipts);

  assert.equal(report.wiredCount, 2, 'wiredCount must be 2');
  assert.equal(report.wiredTotal, 7, 'wiredTotal must be 7');
  assert.equal(report.coverage, 2 / 7, 'coverage must be 2/7');
  assert.equal(report.maxConfidence, 0.75 * (2 / 7), 'maxConfidence must be 0.75 * 2/7');

  console.log('  [PASS] Partial receipts → coverage = 2/7');
}

// ---------------------------------------------------------------------------
// 3. Full wired receipts → coverage = 1.0
// ---------------------------------------------------------------------------

function verifyFullWiredReceiptsFullCoverage() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  // All 6 PressureInput sources → 7 ConstraintSignalSource wired values
  // (rival-pressure maps to rival-listing, so 6 inputs cover all 7 wired sources)
  const inputs: PressureInput[] = [
    { source: 'customer-feedback', caseId: caseItem.id, day: world.day, dimension: 'heat', magnitude: -1, evidence: '客户反馈' },
    { source: 'rival-customer-pull', caseId: caseItem.id, day: world.day, dimension: 'trust', magnitude: -1, evidence: '竞品拉客' },
    { source: 'rival-pressure', caseId: caseItem.id, day: world.day, dimension: 'heat', magnitude: -2, evidence: '竞品压力' },
    { source: 'competition-group', caseId: caseItem.id, day: world.day, dimension: 'trust', magnitude: -1, evidence: '竞争组' },
    { source: 'company-pressure', caseId: caseItem.id, day: world.day, dimension: 'trust', magnitude: -1, evidence: '公司压力' },
    { source: 'random-event', caseId: caseItem.id, day: world.day, dimension: 'heat', magnitude: -1, evidence: '随机事件' },
    { source: 'scripted-event', caseId: caseItem.id, day: world.day, dimension: 'heat', magnitude: -1, evidence: '脚本事件' },
  ];
  const receipts = buildReceiptBundle(world.day, inputs);
  const report = buildD4ReceiptCoverageReport(receipts);

  assert.equal(report.wiredCount, 7, 'wiredCount must be 7 (all sources wired)');
  assert.equal(report.wiredTotal, 7, 'wiredTotal must be 7');
  assert.equal(report.coverage, 1.0, 'coverage must be 1.0');
  assert.equal(report.maxConfidence, 0.75, 'maxConfidence must be 0.75');

  console.log('  [PASS] Full wired receipts → coverage = 1.0');
}

// ---------------------------------------------------------------------------
// 4. Pending sources don't affect coverage ratio
// ---------------------------------------------------------------------------

function verifyPendingSourcesDontAffectCoverage() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  // NOTE: D4_PENDING_SOURCES is now empty — all ConstraintSignalSource values are wired.
  // This test verifies that previously-pending sources (company-pressure, random-event)
  // are now correctly counted as wired.

  const inputs: PressureInput[] = [
    { source: 'company-pressure', caseId: caseItem.id, day: world.day, dimension: 'trust', magnitude: -1, evidence: '公司压力' },
    { source: 'random-event', caseId: caseItem.id, day: world.day, dimension: 'heat', magnitude: -1, evidence: '随机事件' },
  ];
  const receipts = buildReceiptBundle(world.day, inputs);
  const report = buildD4ReceiptCoverageReport(receipts);

  assert.equal(report.wiredCount, 2, 'wiredCount must be 2 (now all sources are wired)');
  assert.equal(report.coverage, 2 / 7, 'coverage must be 2/7');
  assert.equal(report.pendingSources.length, 0, 'no pending sources remain');

  console.log('  [PASS] Formerly pending sources now correctly wired (2/7)');
}

// ---------------------------------------------------------------------------
// 5. market-signal is informational
// ---------------------------------------------------------------------------

function verifyMarketSignalInformational() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  // market-signal is in ConstraintSignalSource but NOT in PressureInputSource,
  // so it can't appear in PressureInput. Verify it's categorized correctly
  // in the report regardless.
  const report = buildD4ReceiptCoverageReport(null);

  const marketEntry = report.sources.find((s) => s.source === 'market-signal');
  assert.ok(marketEntry, 'market-signal must be in sources');
  assert.equal(marketEntry!.category, 'informational', 'market-signal must be informational');
  assert.equal(marketEntry!.present, false, 'market-signal must not be present (no runtime hook)');

  // Verify pending sources are NOT informational
  for (const pendingSource of report.pendingSources) {
    const entry = report.sources.find((s) => s.source === pendingSource);
    assert.ok(entry, `pending source ${pendingSource} must be in sources`);
    assert.equal(entry!.category, 'pending', `${pendingSource} must be pending, not informational`);
  }

  console.log('  [PASS] market-signal is informational');
}

// ---------------------------------------------------------------------------
// 6. Coverage report sources are correctly categorized
// ---------------------------------------------------------------------------

function verifySourceCategorization() {
  const report = buildD4ReceiptCoverageReport(null);

  // All 7 ConstraintSignalSource values are now wired
  const expectedWired = [
    'customer-feedback', 'rival-customer-pull', 'rival-listing', 'competition-group',
    'company-pressure', 'random-event', 'scripted-event',
  ];
  const expectedInformational = ['market-signal'];

  for (const source of expectedWired) {
    const entry = report.sources.find((s) => s.source === source);
    assert.ok(entry, `${source} must be in sources`);
    assert.equal(entry!.category, 'wired', `${source} must be wired`);
  }

  for (const source of expectedInformational) {
    const entry = report.sources.find((s) => s.source === source);
    assert.ok(entry, `${source} must be in sources`);
    assert.equal(entry!.category, 'informational', `${source} must be informational`);
  }

  // No pending sources remain
  assert.equal(report.pendingSources.length, 0, 'No pending sources remain');
  assert.equal(report.sources.length, 8, 'Total sources must be 8 (7 wired + 1 informational)');

  console.log('  [PASS] Source categorization correct');
}

// ---------------------------------------------------------------------------
// 7. buildD4ConfidenceFromCoverage returns maxConfidence
// ---------------------------------------------------------------------------

function verifyConfidenceHelper() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  // Full coverage (all 7 ConstraintSignalSource wired values via 7 PressureInput inputs)
  const fullInputs: PressureInput[] = [
    { source: 'rival-pressure', caseId: caseItem.id, day: world.day, dimension: 'heat', magnitude: -2, evidence: '竞品' },
    { source: 'competition-group', caseId: caseItem.id, day: world.day, dimension: 'trust', magnitude: -1, evidence: '竞争组' },
    { source: 'customer-feedback', caseId: caseItem.id, day: world.day, dimension: 'heat', magnitude: -1, evidence: '客户' },
    { source: 'rival-customer-pull', caseId: caseItem.id, day: world.day, dimension: 'trust', magnitude: -1, evidence: '拉客' },
    { source: 'company-pressure', caseId: caseItem.id, day: world.day, dimension: 'trust', magnitude: -1, evidence: '公司' },
    { source: 'random-event', caseId: caseItem.id, day: world.day, dimension: 'heat', magnitude: -1, evidence: '随机' },
    { source: 'scripted-event', caseId: caseItem.id, day: world.day, dimension: 'heat', magnitude: -1, evidence: '脚本' },
  ];
  const fullReceipts = buildReceiptBundle(world.day, fullInputs);
  const fullCoverage = buildD4ReceiptCoverageReport(fullReceipts);

  assert.equal(buildD4ConfidenceFromCoverage(fullCoverage), 0.75, 'Full coverage → confidence 0.75');

  // Partial coverage (1/7 wired)
  const partialInputs: PressureInput[] = [
    { source: 'rival-pressure', caseId: caseItem.id, day: world.day, dimension: 'heat', magnitude: -2, evidence: '竞品' },
  ];
  const partialReceipts = buildReceiptBundle(world.day, partialInputs);
  const partialCoverage = buildD4ReceiptCoverageReport(partialReceipts);

  assert.equal(buildD4ConfidenceFromCoverage(partialCoverage), 0.75 * (1 / 7), 'Partial coverage (1/7) → confidence 0.75/7');

  console.log('  [PASS] buildD4ConfidenceFromCoverage correct');
}

// ---------------------------------------------------------------------------
// 8. D4 total / legacy score unchanged by coverage
// ---------------------------------------------------------------------------

function verifyLegacyScoreUnchanged() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const withoutReceipts = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);

  const inputs: PressureInput[] = [
    { source: 'rival-pressure', caseId: caseItem.id, day: world.day, dimension: 'heat', magnitude: -5, evidence: '竞品' },
    { source: 'competition-group', caseId: caseItem.id, day: world.day, dimension: 'trust', magnitude: -3, evidence: '竞争组' },
  ];
  const receipts = buildReceiptBundle(world.day, inputs);
  const withReceipts = buildAssetScoreSnapshotFromLegacyCaseWithPressureReceipts(world, caseItem, receipts);

  assert.equal(withReceipts.score, withoutReceipts.score, 'Total score must not change');
  assert.equal(withReceipts.dimensions.d1.score, withoutReceipts.dimensions.d1.score, 'D1 must be identical');
  assert.equal(withReceipts.dimensions.d2.score, withoutReceipts.dimensions.d2.score, 'D2 must be identical');
  assert.equal(withReceipts.dimensions.d3.score, withoutReceipts.dimensions.d3.score, 'D3 must be identical');

  console.log('  [PASS] Legacy score unchanged by coverage');
}

// ---------------------------------------------------------------------------
// 9. Freeze behavior on returned report
// ---------------------------------------------------------------------------

function verifyFreezeBehavior() {
  const report = buildD4ReceiptCoverageReport(null);

  assert.ok(Object.isFrozen(report), 'Report must be frozen');
  assert.ok(Object.isFrozen(report.sources), 'Report sources must be frozen');
  assert.ok(Object.isFrozen(report.pendingSources), 'Report pendingSources must be frozen');

  console.log('  [PASS] Freeze behavior verified');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Verifying selling-houses evaluation D4 coverage contract...');

verifyEmptyReceiptsZeroCoverage();
verifyPartialReceiptsPartialCoverage();
verifyFullWiredReceiptsFullCoverage();
verifyPendingSourcesDontAffectCoverage();
verifyMarketSignalInformational();
verifySourceCategorization();
verifyConfidenceHelper();
verifyLegacyScoreUnchanged();
verifyFreezeBehavior();

console.log('selling-houses evaluation D4 coverage contract verification passed');
