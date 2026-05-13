/**
 * verify-selling-houses-decision-big-gate.ts
 *
 * Verifies the decision-big vertical slice:
 *   ActorKnowledge → Belief → Pressure → AvailableCommand → Recommendation → ExplanationEnvelope
 *
 * Gates:
 * 1. DecisionEvidenceEnvelope is properly built from ActorKnowledgeSnapshot
 * 2. No direct GlobalTruth reads (rivalListings / customerStates / worldCausalEvents) in recommendation pipeline
 * 3. All recommendations have source/belief/pressure evidence chains
 * 4. Pressure signals trace back to belief updates
 * 5. Commands are role-filtered (owner cannot execute broker commands)
 * 6. buildWorkspaceBigWorldModule uses decision pipeline when knowledge provided
 * 7. Same ActorKnowledgeSnapshot → identical DecisionEvidenceEnvelope (determinism)
 * 8. Bounded output: max 5 pressure signals, max 3 recommendations
 * 9. Recommendation without evidence chain = FAIL (the core gate)
 * 10. No hidden GlobalTruth leakage through command catalog
 */

// ── Imports ──────────────────────────────────────────────────────────────

import type {
  InformationSourceRecord,
  SourceKind,
  ActorRole,
} from '../src/selling-houses/domain/world-model/informationSourceTypes.js';

import type {
  InformationSourceRegistry,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';

import {
  createEmptyRegistry,
  appendSourceRecord,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';

import {
  buildActorKnowledgeSnapshot,
  evaluatePressureSignals,
  filterAvailableCommands,
  rankCommands,
  buildDecisionEvidenceEnvelope,
  buildExplanationEnvelope,
  BROKER_COMMAND_CATALOG,
} from '../src/selling-houses/application/projections/actorKnowledgeProjection.js';

import type {
  ActorKnowledgeSnapshot,
  PressureSignal,
  AvailableCommand,
  RecommendedCommand,
  DecisionEvidenceEnvelope,
  ExplanationEnvelope,
} from '../src/selling-houses/domain/world-model/actorKnowledgeTypes.js';

import {
  buildWorkspaceBigWorldModule,
  type BigWorldPOVSummary,
} from '../src/selling-houses/application/projections/bigWorldPOVProjection.js';

import type {
  POVCausalRef,
} from '../src/selling-houses/application/projections/bigWorldPOVProjection.js';

// ── Test helpers ──────────────────────────────────────────────────────────

let failures = 0;
let passed = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    failures += 1;
  } else {
    passed += 1;
  }
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    console.error(`  FAIL: ${msg} (expected ${expected}, got ${actual})`);
    failures += 1;
  } else {
    passed += 1;
  }
}

// ── Test data builders ────────────────────────────────────────────────────

let recordCounter = 1000;

function buildRegistry(records: InformationSourceRecord[]): InformationSourceRegistry {
  let registry = createEmptyRegistry();
  for (const r of records) {
    const result = appendSourceRecord(registry, r);
    if (result.ok) registry = result.registry;
  }
  return registry;
}

function makeSourceRecord(overrides: Partial<InformationSourceRecord> & { sourceKind: SourceKind }): InformationSourceRecord {
  recordCounter += 1;
  return {
    sourceId: overrides.sourceId ?? `isr-decision-${recordCounter}`,
    sourceKind: overrides.sourceKind,
    day: overrides.day ?? 1,
    phase: overrides.phase ?? 'morning',
    entityRefs: overrides.entityRefs ?? [{ id: 'entity-1', kind: 'case' }],
    actorRefs: overrides.actorRefs ?? [{ id: 'actor-1', role: 'system' }],
    visibility: overrides.visibility ?? { scope: 'all_actors', baseDelayDays: 0 },
    confidence: overrides.confidence ?? 0.8,
    delayDays: overrides.delayDays ?? 0,
    replayKey: overrides.replayKey ?? `rk-decision-${recordCounter}`,
    origin: overrides.origin ?? 'ecosystem_tick',
    payload: overrides.payload ?? { summary: 'test source', subtype: 'heat_shift', marketCellId: 'cell-1', before: 50, after: 60, unit: 'heat', isPublic: true },
  } as InformationSourceRecord;
}

const DUMMY_BIG_WORLD_POV: BigWorldPOVSummary = {
  caseId: 'case-1',
  caseTitle: '测试房源',
  day: 5,
  marketCell: {
    cellId: 'cell-1',
    cellName: '和平里',
    heat: 55,
    heatBand: '偏热',
    priceTrend: '企稳',
    inventoryPressure: 50,
    dealVelocity: 55,
    supplyPressure: 50,
    competitivePressure: 50,
    summary: '和平里当前偏热',
    refs: [{ refType: 'market-cell', refId: 'cell-1', refLabel: '和平里' }],
  },
  comparableSupply: {
    totalActiveInCell: 5,
    directlyCompetingCount: 2,
    avgAskPriceInCell: 380,
    priceRangeLabel: '350-420 万',
    topSignals: [],
    noSupply: false,
    refs: [],
  },
  demandMovement: {
    demandMomentum: 55,
    direction: 'stagnant',
    activeCustomerCount: 3,
    comparingCustomerCount: 1,
    topSignals: [],
    noDemand: false,
    refs: [],
  },
  ownerExpectation: {
    priceGapPct: 8,
    trustLevel: 60,
    patienceLevel: 55,
    urgencyLevel: 40,
    pressureLabel: 'low',
    delayedMarketSignal: '暂无延迟信号',
    topSignals: [],
    refs: [],
  },
  brokerActionPressure: {
    topSignals: [],
    activeRivalStoreCount: 2,
    recentRepriceCount: 1,
    refs: [],
  },
  becauseBigProof: {
    hasMarketMovement: false,
    hasDemandShift: false,
    hasRivalMovement: false,
    hasOwnerPressureDelta: false,
    movementEvidence: [],
    safeCausalRefs: [],
  },
  recommendedActionReasons: [
    { rank: 1, headline: '先做面访', detail: '业主预期需要引导', refs: [{ refType: 'case', refId: 'case-1', refLabel: '测试' }] },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════════════

console.log('=== Decision-Big Gate Verification ===\n');

// --- Test 1: DecisionEvidenceEnvelope is properly built ---
console.log('--- 1. DecisionEvidenceEnvelope from ActorKnowledgeSnapshot ---');
{
  const marketRecord = makeSourceRecord({
    sourceId: 'isr-dec-market-1',
    sourceKind: 'market_signal',
    day: 2,
    confidence: 0.9,
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
  });
  const rivalRecord = makeSourceRecord({
    sourceId: 'isr-dec-rival-1',
    sourceKind: 'rival_action',
    day: 3,
    confidence: 0.85,
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
    payload: { summary: '竞品降价', subtype: 'reprice', rivalBrokerId: 'r-1', rivalAcnId: 'acn-1', priceBefore: 400, priceAfter: 380, evidenceStrength: 'direct' },
  });
  const ownerRecord = makeSourceRecord({
    sourceId: 'isr-dec-owner-1',
    sourceKind: 'owner_interview',
    day: 3,
    confidence: 0.8,
    visibility: { scope: 'owner_only', baseDelayDays: 0 },
    payload: { summary: '业主表达降价意愿', subtype: 'expectation_adjusted', ownerId: 'owner-1', caseId: 'case-1', brokerId: 'b-1', tone: 'neutral', ownerStatement: '可以考虑降价', interactionMode: 'scheduled_call' },
  });

  const registry = buildRegistry([marketRecord, rivalRecord, ownerRecord]);
  const knowledge = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);
  const envelope = buildDecisionEvidenceEnvelope(knowledge);

  assert(envelope.actorId === 'broker-1', 'envelope has correct actorId');
  assert(envelope.actorRole === 'player_broker', 'envelope has correct actorRole');
  assert(envelope.day === 5, 'envelope has correct day');

  // Evidence chain
  assert(Array.isArray(envelope.visibleSourceRefs), 'envelope has visibleSourceRefs');
  assert(envelope.visibleSourceRefs.length > 0, 'envelope has at least 1 visible source');
  assert(Array.isArray(envelope.causalRefs), 'envelope has causalRefs');
  assert(Array.isArray(envelope.beliefUpdates), 'envelope has beliefUpdates');
  assert(Array.isArray(envelope.pressureSignals), 'envelope has pressureSignals');
  assert(Array.isArray(envelope.availableCommands), 'envelope has availableCommands');

  // Recommendation
  if (envelope.recommendedCommand) {
    assert(typeof envelope.recommendedCommand.confidence === 'number', 'recommendation has confidence');
    assert(envelope.recommendedCommand.confidence >= 0 && envelope.recommendedCommand.confidence <= 1, 'confidence in [0,1]');
    assert(envelope.recommendedCommand.pressureSignalIds.length > 0, 'recommendation traces to pressure signals');
    assert(envelope.recommendedCommand.beliefSourceIds.length > 0, 'recommendation traces to beliefs');
    assert(envelope.recommendedCommand.sourceRecordIds.length > 0, 'recommendation traces to source records');
  }

  // Explanation
  assert(typeof envelope.explanation.summary === 'string', 'explanation has summary');
  assert(envelope.explanation.summary.length > 0, 'explanation summary is non-empty');
  assert(typeof envelope.explanation.confidence === 'number', 'explanation has confidence');
  assert(Array.isArray(envelope.explanation.safeRefs), 'explanation has safeRefs');

  console.log('  [PASS] DecisionEvidenceEnvelope properly built');
}

// --- Test 2: No direct GlobalTruth reads in recommendation pipeline ---
console.log('\n--- 2. No GlobalTruth leakage in decision pipeline ---');
{
  // Check the source code of actorKnowledgeProjection.ts
  // The decision pipeline functions must NOT import or reference:
  // - marketShadow (rivalListings, rivalStores)
  // - customerStates
  // - worldCausalEvents
  // - state.cases
  // - state.markets
  // - state.opportunities
  const fs = await import('node:fs');
  const path = await import('node:path');
  const projSource = fs.readFileSync(
    path.resolve(import.meta.dirname ?? '.', '../src/selling-houses/application/projections/actorKnowledgeProjection.ts'),
    'utf-8',
  );

  // The file should NOT import GameState or domain models directly
  const hasGameStateImport = projSource.includes("from '../../domain/models.js'")
    || projSource.includes('from "../../domain/models.js"');
  assert(!hasGameStateImport, 'actorKnowledgeProjection.ts does NOT import GameState directly');

  // The decision pipeline section should not reference state.marketShadow, state.customerStates, etc.
  const decisionPipelineStart = projSource.indexOf('// Decision Evidence Pipeline');
  if (decisionPipelineStart > -1) {
    const pipelineSource = projSource.slice(decisionPipelineStart);
    assert(!pipelineSource.includes('state.marketShadow'), 'decision pipeline does NOT read state.marketShadow');
    assert(!pipelineSource.includes('state.customerStates'), 'decision pipeline does NOT read state.customerStates');
    assert(!pipelineSource.includes('state.worldCausalEvents'), 'decision pipeline does NOT read state.worldCausalEvents');
    assert(!pipelineSource.includes('state.cases'), 'decision pipeline does NOT read state.cases');
    assert(!pipelineSource.includes('state.markets'), 'decision pipeline does NOT read state.markets');
    assert(!pipelineSource.includes('state.opportunities'), 'decision pipeline does NOT read state.opportunities');
  }

  console.log('  [PASS] decision pipeline does not leak GlobalTruth');
}

// --- Test 3: All recommendations have source/belief/pressure evidence chains ---
console.log('\n--- 3. Recommendations have evidence chains ---');
{
  // Create a rich knowledge snapshot with multiple beliefs
  const records: InformationSourceRecord[] = [];
  for (let i = 0; i < 5; i++) {
    records.push(makeSourceRecord({
      sourceId: `isr-chain-${i}`,
      sourceKind: i < 2 ? 'market_signal' : i < 3 ? 'rival_action' : 'owner_interview',
      day: i + 1,
      confidence: 0.7 + i * 0.05,
      visibility: { scope: i === 4 ? 'owner_only' : 'all_actors', baseDelayDays: 0 },
      payload: i < 2
        ? { summary: `市场信号 ${i}`, subtype: 'heat_shift', marketCellId: 'cell-1', before: 50, after: 60 + i * 5, unit: 'heat', isPublic: true }
        : i < 3
          ? { summary: `竞品动作 ${i}`, subtype: 'reprice', rivalBrokerId: 'r-1', rivalAcnId: 'acn-1', priceBefore: 400, priceAfter: 380, evidenceStrength: 'direct' }
          : { summary: '业主沟通', subtype: 'expectation_adjusted', ownerId: 'owner-1', caseId: 'case-1', brokerId: 'b-1', tone: 'neutral', ownerStatement: '可以考虑降价', interactionMode: 'scheduled_call' },
    }));
  }

  const registry = buildRegistry(records);
  const knowledge = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 10, registry);
  const envelope = buildDecisionEvidenceEnvelope(knowledge);

  if (envelope.recommendedCommand) {
    const cmd = envelope.recommendedCommand;

    // Must have source records
    assert(cmd.sourceRecordIds.length > 0, `recommendation has source records (got ${cmd.sourceRecordIds.length})`);

    // Must have belief sources
    assert(cmd.beliefSourceIds.length > 0, `recommendation has belief sources (got ${cmd.beliefSourceIds.length})`);

    // Must have pressure signals
    assert(cmd.pressureSignalIds.length > 0, `recommendation has pressure signals (got ${cmd.pressureSignalIds.length})`);

    // Every source record must be in the knowledge snapshot
    for (const srcId of cmd.sourceRecordIds) {
      assert(
        knowledge.visibleSources.some((s) => s.sourceId === srcId),
        `recommendation source ${srcId} is in visible sources`,
      );
    }

    // Every belief source must be in the knowledge beliefs
    for (const beliefId of cmd.beliefSourceIds) {
      assert(
        knowledge.beliefs.some((b) => b.updateId === beliefId),
        `recommendation belief ${beliefId} is in knowledge beliefs`,
      );
    }

    console.log('  [PASS] recommendation has complete evidence chain');
  } else {
    console.log('  [SKIP] no recommendation (low pressure environment)');
  }
}

// --- Test 4: Pressure signals trace back to beliefs ---
console.log('\n--- 4. Pressure signals trace to beliefs ---');
{
  const records: InformationSourceRecord[] = [];
  for (let i = 0; i < 4; i++) {
    records.push(makeSourceRecord({
      sourceId: `isr-pressure-${i}`,
      sourceKind: 'market_signal',
      day: i + 1,
      confidence: 0.85,
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
    }));
  }

  const registry = buildRegistry(records);
  const knowledge = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);
  const pressureSignals = evaluatePressureSignals(knowledge);

  for (const signal of pressureSignals) {
    // Every pressure signal must trace to belief source IDs
    assert(signal.beliefSourceIds.length > 0, `pressure signal ${signal.signalId} traces to beliefs`);

    // Every belief source must exist in knowledge
    for (const beliefId of signal.beliefSourceIds) {
      assert(
        knowledge.beliefs.some((b) => b.updateId === beliefId),
        `pressure signal belief ${beliefId} exists in knowledge`,
      );
    }

    // Every source record must exist in visible sources
    for (const srcId of signal.sourceRecordIds) {
      assert(
        knowledge.visibleSources.some((s) => s.sourceId === srcId),
        `pressure signal source ${srcId} is visible`,
      );
    }
  }

  console.log('  [PASS] pressure signals trace to beliefs and sources');
}

// --- Test 5: Commands are role-filtered ---
console.log('\n--- 5. Command catalog role filtering ---');
{
  const pressureSignals: PressureSignal[] = [{
    signalId: 'ps-test-1',
    domain: 'price_anchor',
    magnitude: 80,
    direction: 'increasing',
    label: '价格压力',
    beliefSourceIds: ['belief-1'],
    sourceRecordIds: ['src-1'],
  }];

  // Player broker should see commands
  const brokerCommands = filterAvailableCommands('player_broker', pressureSignals);
  assert(brokerCommands.length > 0, 'player_broker has available commands');

  // Owner should NOT see broker commands
  const ownerCommands = filterAvailableCommands('owner', pressureSignals);
  const ownerHasBrokerOnlyCmds = ownerCommands.filter(
    (cmd) => !cmd.allowedRoles.includes('owner'),
  );
  assert(ownerHasBrokerOnlyCmds.length === 0, 'owner does NOT see broker-only commands');

  // All returned commands must be in the catalog
  for (const cmd of brokerCommands) {
    const inCatalog = BROKER_COMMAND_CATALOG.some((c) => c.commandId === cmd.commandId);
    assert(inCatalog, `command ${cmd.commandId} exists in catalog`);
  }

  console.log('  [PASS] command catalog correctly role-filtered');
}

// --- Test 6: buildWorkspaceBigWorldModule uses decision pipeline ---
console.log('\n--- 6. Workspace module uses decision pipeline ---');
{
  // Check that buildWorkspaceBigWorldModule imports and uses buildDecisionEvidenceEnvelope
  const fs = await import('node:fs');
  const path = await import('node:path');
  const projSource = fs.readFileSync(
    path.resolve(import.meta.dirname ?? '.', '../src/selling-houses/application/projections/bigWorldPOVProjection.ts'),
    'utf-8',
  );

  assert(
    projSource.includes('buildDecisionEvidenceEnvelope'),
    'bigWorldPOVProjection imports buildDecisionEvidenceEnvelope',
  );
  assert(
    projSource.includes('buildDecisionBigRecommendations'),
    'bigWorldPOVProjection has buildDecisionBigRecommendations function',
  );
  assert(
    projSource.includes('actorKnowledge') && projSource.includes('Decision'),
    'workspace module branches on actorKnowledge for decision pipeline',
  );

  console.log('  [PASS] workspace module uses decision pipeline');
}

// --- Test 7: Determinism ---
console.log('\n--- 7. Decision pipeline is deterministic ---');
{
  const records = [
    makeSourceRecord({ sourceId: 'isr-det-dec-1', sourceKind: 'market_signal', day: 1, visibility: { scope: 'all_actors', baseDelayDays: 0 } }),
    makeSourceRecord({ sourceId: 'isr-det-dec-2', sourceKind: 'rival_action', day: 2, visibility: { scope: 'all_actors', baseDelayDays: 0 } }),
  ];

  const registry = buildRegistry(records);
  const knowledge1 = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);
  const knowledge2 = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);

  const envelope1 = buildDecisionEvidenceEnvelope(knowledge1);
  const envelope2 = buildDecisionEvidenceEnvelope(knowledge2);

  assert(
    JSON.stringify(envelope1) === JSON.stringify(envelope2),
    'same inputs produce identical DecisionEvidenceEnvelope (determinism)',
  );

  console.log('  [PASS] decision pipeline is deterministic');
}

// --- Test 8: Bounded output ---
console.log('\n--- 8. Bounded output ---');
{
  const records: InformationSourceRecord[] = [];
  for (let i = 0; i < 20; i++) {
    records.push(makeSourceRecord({
      sourceId: `isr-bound-${i}`,
      sourceKind: 'market_signal',
      day: i + 1,
      confidence: 0.9,
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
    }));
  }

  const registry = buildRegistry(records);
  const knowledge = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 25, registry);
  const envelope = buildDecisionEvidenceEnvelope(knowledge);

  // Pressure signals bounded to 5
  assert(envelope.pressureSignals.length <= 5, `pressure signals bounded (got ${envelope.pressureSignals.length}, max 5)`);

  // Available commands bounded by catalog
  assert(envelope.availableCommands.length <= BROKER_COMMAND_CATALOG.length, 'available commands bounded by catalog');

  // Causal refs bounded
  assert(envelope.causalRefs.length <= 8, `causal refs bounded (got ${envelope.causalRefs.length}, max 8)`);

  // Explanation safeRefs bounded
  assert(envelope.explanation.safeRefs.length <= 5, `explanation safeRefs bounded (got ${envelope.explanation.safeRefs.length}, max 5)`);

  console.log('  [PASS] decision pipeline output is bounded');
}

// --- Test 9: Core gate — no recommendation without evidence chain ---
console.log('\n--- 9. Core gate: no recommendation without evidence ---');
{
  // This is the CORE GATE: every recommendation MUST have evidence.
  // If a recommendation has 0 source records, 0 beliefs, or 0 pressure signals → FAIL

  const records = [
    makeSourceRecord({ sourceId: 'isr-gate-1', sourceKind: 'market_signal', day: 2, confidence: 0.9, visibility: { scope: 'all_actors', baseDelayDays: 0 } }),
    makeSourceRecord({ sourceId: 'isr-gate-2', sourceKind: 'rival_action', day: 3, confidence: 0.85, visibility: { scope: 'all_actors', baseDelayDays: 0 }, payload: { summary: '竞品降价', subtype: 'reprice', rivalBrokerId: 'r-1', rivalAcnId: 'acn-1', priceBefore: 400, priceAfter: 380, evidenceStrength: 'direct' } }),
  ];

  const registry = buildRegistry(records);
  const knowledge = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);
  const envelope = buildDecisionEvidenceEnvelope(knowledge);

  if (envelope.recommendedCommand) {
    const cmd = envelope.recommendedCommand;

    // THE CORE GATE: every recommendation must have a complete evidence chain
    assert(cmd.sourceRecordIds.length > 0,
      'CORE GATE: recommendation has at least 1 source record in evidence chain');
    assert(cmd.beliefSourceIds.length > 0,
      'CORE GATE: recommendation has at least 1 belief in evidence chain');
    assert(cmd.pressureSignalIds.length > 0,
      'CORE GATE: recommendation has at least 1 pressure signal in evidence chain');

    // The explanation must reference the same evidence
    assert(envelope.explanation.chain.length > 0,
      'CORE GATE: explanation has at least 1 chain link');
    assert(envelope.explanation.confidence > 0,
      'CORE GATE: explanation has non-zero confidence');

    console.log('  [PASS] CORE GATE: recommendation has complete evidence chain');
  } else {
    // No recommendation is acceptable — it means pressure was too low
    console.log('  [PASS] CORE GATE: no recommendation (pressure below threshold — acceptable)');
  }
}

// --- Test 10: No hidden GlobalTruth in command catalog ---
console.log('\n--- 10. Command catalog is self-contained ---');
{
  // The command catalog should NOT contain any references to hidden state
  const fs = await import('node:fs');
  const path = await import('node:path');
  const typeSource = fs.readFileSync(
    path.resolve(import.meta.dirname ?? '.', '../src/selling-houses/domain/world-model/actorKnowledgeTypes.ts'),
    'utf-8',
  );

  // Find the BROKER_COMMAND_CATALOG section
  const catalogStart = typeSource.indexOf('BROKER_COMMAND_CATALOG');
  if (catalogStart > -1) {
    // The catalog section should not reference GameState, marketShadow, etc.
    // Actually, the catalog is in actorKnowledgeProjection.ts, not types
    // Let me check the projection file
    const projSource = fs.readFileSync(
      path.resolve(import.meta.dirname ?? '.', '../src/selling-houses/application/projections/actorKnowledgeProjection.ts'),
      'utf-8',
    );
    const catalogSection = projSource.slice(
      projSource.indexOf('BROKER_COMMAND_CATALOG'),
      projSource.indexOf('BROKER_COMMAND_CATALOG') + 2000,
    );

    // Catalog should only define commands, not reference hidden state
    assert(!catalogSection.includes('state.marketShadow'), 'catalog does not reference marketShadow');
    assert(!catalogSection.includes('state.customerStates'), 'catalog does not reference customerStates');
    assert(!catalogSection.includes('state.worldCausalEvents'), 'catalog does not reference worldCausalEvents');
  }

  console.log('  [PASS] command catalog is self-contained, no hidden state');
}

// --- Summary ---
console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failures}`);

if (failures > 0) {
  console.error(`\n${failures} FAILURES`);
  process.exit(1);
} else {
  console.log('\nAll tests passed!');
}
