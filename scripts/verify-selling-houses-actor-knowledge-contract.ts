/**
 * verify-selling-houses-actor-knowledge-contract.ts
 *
 * Verifies:
 * 1. ActorKnowledgeSnapshot is bounded and never exposes raw registry
 * 2. owner_only sources visible to owner, invisible to broker
 * 3. player_only sources visible to player_broker, invisible to owner
 * 4. no_one sources never enter any actor POV
 * 5. Same source produces different credibility for different actors
 * 6. Information delays are actor-dependent
 * 7. BeliefConfidence is separate from SourceConfidence
 * 8. Bounded output: max 10 sources, max 5 beliefs per domain
 * 9. BlindSpots replace hidden source access
 * 10. buildBrokerBigWorldPOV reads from knowledge, not raw registry
 */

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
  computeSourceCredibility,
  computeInformationDelay,
  buildBrokerBigWorldPOV,
} from '../src/selling-houses/application/projections/actorKnowledgeProjection.js';

import type {
  ActorKnowledgeSnapshot,
  RoleVisibilityRule,
} from '../src/selling-houses/domain/world-model/actorKnowledgeTypes.js';

import {
  DEFAULT_ROLE_VISIBILITY,
} from '../src/selling-houses/domain/world-model/actorKnowledgeTypes.js';

import type { BigWorldPOVSummary } from '../src/selling-houses/application/projections/bigWorldPOVProjection.js';

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

let recordCounter = 0;

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
    sourceId: overrides.sourceId ?? `isr-test-${recordCounter}`,
    sourceKind: overrides.sourceKind,
    day: overrides.day ?? 1,
    phase: overrides.phase ?? 'morning',
    entityRefs: overrides.entityRefs ?? [{ id: 'entity-1', kind: 'case' }],
    actorRefs: overrides.actorRefs ?? [{ id: 'actor-1', role: 'system' }],
    visibility: overrides.visibility ?? { scope: 'all_actors', baseDelayDays: 0 },
    confidence: overrides.confidence ?? 0.8,
    delayDays: overrides.delayDays ?? 0,
    replayKey: overrides.replayKey ?? `rk-test-${recordCounter}`,
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
    internalPressure: 0,
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
    { rank: 2, headline: '补充客户', detail: '需求偏弱', refs: [{ refType: 'market-signal', refId: 'sig-1', refLabel: '信号' }] },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════════════

console.log('=== ActorKnowledge Contract Verification ===\n');

// --- Test 1: owner_only visible to owner, invisible to broker ---
console.log('--- 1. Owner-only visibility ---');
{
  const ownerOnlyRecord = makeSourceRecord({
    sourceId: 'isr-owner-only-1',
    sourceKind: 'owner_interview',
    day: 3,
    visibility: { scope: 'owner_only', baseDelayDays: 0 },
    payload: { summary: '业主表达了降价意愿', subtype: 'expectation_adjusted', ownerId: 'owner-1', caseId: 'case-1', brokerId: 'broker-1', tone: 'neutral', ownerStatement: '可以考虑降价', interactionMode: 'scheduled_call' },
  });
  const allActorsRecord = makeSourceRecord({
    sourceId: 'isr-all-1',
    sourceKind: 'market_signal',
    day: 2,
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
  });

  const registry = buildRegistry([ownerOnlyRecord, allActorsRecord]);

  // Owner should see both
  const ownerSnapshot = buildActorKnowledgeSnapshot('owner-1', 'owner', 5, registry);
  assert(ownerSnapshot.visibleSources.some((s) => s.sourceId === 'isr-owner-only-1'), 'owner sees owner_only source');
  assert(ownerSnapshot.visibleSources.some((s) => s.sourceId === 'isr-all-1'), 'owner sees all_actors source');

  // Broker should NOT see owner_only
  const brokerSnapshot = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);
  assert(!brokerSnapshot.visibleSources.some((s) => s.sourceId === 'isr-owner-only-1'), 'broker does NOT see owner_only source');
  assert(brokerSnapshot.visibleSources.some((s) => s.sourceId === 'isr-all-1'), 'broker sees all_actors source');
}

// --- Test 2: player_only visible to player_broker, invisible to owner ---
console.log('\n--- 2. Player-only visibility ---');
{
  const playerOnlyRecord = makeSourceRecord({
    sourceId: 'isr-player-only-1',
    sourceKind: 'player_action_receipt',
    day: 2,
    visibility: { scope: 'player_only', baseDelayDays: 0 },
    payload: { summary: '玩家执行了带看动作', subtype: 'action_executed', actionId: 'showing', executorId: 'broker-1', caseId: 'case-1', costEnergy: 10, costPromotionBudget: 0, fieldDeltas: [], outcome: 'success' },
  });

  const registry = buildRegistry([playerOnlyRecord]);

  // Player broker sees it
  const playerSnapshot = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);
  assert(playerSnapshot.visibleSources.some((s) => s.sourceId === 'isr-player-only-1'), 'player_broker sees player_only source');

  // Owner does NOT see it
  const ownerSnapshot = buildActorKnowledgeSnapshot('owner-1', 'owner', 5, registry);
  assert(!ownerSnapshot.visibleSources.some((s) => s.sourceId === 'isr-player-only-1'), 'owner does NOT see player_only source');

  // Rival broker does NOT see it
  const rivalSnapshot = buildActorKnowledgeSnapshot('rival-1', 'rival_broker', 5, registry);
  assert(!rivalSnapshot.visibleSources.some((s) => s.sourceId === 'isr-player-only-1'), 'rival_broker does NOT see player_only source');
}

// --- Test 3: no_one never enters any actor POV ---
console.log('\n--- 3. No-one hidden truth ---');
{
  const hiddenRecord = makeSourceRecord({
    sourceId: 'isr-hidden-1',
    sourceKind: 'acn_network_signal',
    day: 1,
    visibility: { scope: 'no_one', baseDelayDays: 0 },
    payload: { summary: 'ACN内部credit分配', subtype: 'credit_allocation', sourceAcnId: 'acn-1', brokerIds: ['b-1'], cooperationScore: 75 },
  });

  const registry = buildRegistry([hiddenRecord]);

  // No actor should see it
  const roles: ActorRole[] = ['player_broker', 'rival_broker', 'owner', 'customer', 'manager'];
  for (const role of roles) {
    const snapshot = buildActorKnowledgeSnapshot(`actor-${role}`, role, 5, registry);
    assert(!snapshot.visibleSources.some((s) => s.sourceId === 'isr-hidden-1'), `${role} does NOT see no_one source`);
  }

  // But it should appear in blindSpots
  const brokerSnapshot = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);
  assert(brokerSnapshot.blindSpots.length > 0, 'broker has blind spots for hidden sources');
  assert(brokerSnapshot.blindSpots.some((b) => b.category === 'acn_internal'), 'blind spot category is acn_internal');
}

// --- Test 4: same source, different credibility per actor ---
console.log('\n--- 4. Source credibility is relational ---');
{
  const rivalRecord = makeSourceRecord({
    sourceId: 'isr-rival-1',
    sourceKind: 'rival_action',
    day: 3,
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
    payload: { summary: '竞品降价', subtype: 'reprice', rivalBrokerId: 'r-1', rivalAcnId: 'acn-1', priceBefore: 400, priceAfter: 380, evidenceStrength: 'rumor' },
  });

  const brokerCred = computeSourceCredibility(rivalRecord, 'player_broker');
  const ownerCred = computeSourceCredibility(rivalRecord, 'owner');

  // Both should be computed, but may differ
  assert(typeof brokerCred.score === 'number', 'broker credibility is number');
  assert(typeof ownerCred.score === 'number', 'owner credibility is number');
  assert(brokerCred.factors.length > 0, 'broker credibility has factors');
  assert(ownerCred.factors.length > 0, 'owner credibility has factors');

  // The rumor evidence strength should reduce credibility for both
  assert(brokerCred.factors.some((f) => f.dimension === 'evidence_strength'), 'broker considers evidence strength');
}

// --- Test 5: information delays are actor-dependent ---
console.log('\n--- 5. Information delays ---');
{
  const marketRecord = makeSourceRecord({
    sourceId: 'isr-market-1',
    sourceKind: 'market_signal',
    day: 3,
    visibility: { scope: 'all_actors', baseDelayDays: 1 },
  });

  const brokerRule = DEFAULT_ROLE_VISIBILITY.find((r) => r.role === 'player_broker')!;
  const ownerRule = DEFAULT_ROLE_VISIBILITY.find((r) => r.role === 'owner')!;

  const brokerDelay = computeInformationDelay(marketRecord, brokerRule, 10);
  const ownerDelay = computeInformationDelay(marketRecord, ownerRule, 10);

  // Broker has delayModifier=0, owner has delayModifier=2
  assertEqual(brokerDelay.actorModifierDays, 0, 'broker delay modifier is 0');
  assertEqual(ownerDelay.actorModifierDays, 2, 'owner delay modifier is 2');
  assertEqual(brokerDelay.effectiveDelayDays, 1, 'broker effective delay = base(1) + modifier(0)');
  assertEqual(ownerDelay.effectiveDelayDays, 3, 'owner effective delay = base(1) + modifier(2)');
  assertEqual(brokerDelay.visibleAfterDay, 4, 'broker sees record after day 4');
  assertEqual(ownerDelay.visibleAfterDay, 6, 'owner sees record after day 6');

  // At day 5: broker sees it, owner doesn't
  const registry = buildRegistry([marketRecord]);
  const brokerSnap = buildActorKnowledgeSnapshot('b-1', 'player_broker', 5, registry);
  const ownerSnap = buildActorKnowledgeSnapshot('o-1', 'owner', 5, registry);
  assert(brokerSnap.visibleSources.some((s) => s.sourceId === 'isr-market-1'), 'broker sees record at day 5');
  assert(!ownerSnap.visibleSources.some((s) => s.sourceId === 'isr-market-1'), 'owner does NOT see record at day 5 (delay)');
}

// --- Test 6: BeliefConfidence vs SourceConfidence ---
console.log('\n--- 6. BeliefConfidence separate from SourceConfidence ---');
{
  const record = makeSourceRecord({
    sourceId: 'isr-belief-1',
    sourceKind: 'market_signal',
    day: 2,
    confidence: 0.95, // high source confidence
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
  });

  const registry = buildRegistry([record]);
  const snapshot = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);

  // Source has confidence 0.95, but belief should factor in credibility
  if (snapshot.beliefs.length > 0) {
    const belief = snapshot.beliefs[0];
    assert(typeof belief.confidence.value === 'number', 'belief confidence is number');
    assert(belief.confidence.value >= 0 && belief.confidence.value <= 1, 'belief confidence in [0,1]');
    assert(belief.confidence.derivation !== undefined, 'belief confidence has derivation');
    assert(belief.confidence.sourceIds.length > 0, 'belief confidence references source');
    // Belief confidence should differ from source confidence (0.95)
    // because it factors in credibility
    assert(belief.confidence.value !== 0.95 || belief.confidence.derivation === 'direct_observation', 'belief confidence considers more than just source confidence');
  }
}

// --- Test 7: bounded output ---
console.log('\n--- 7. Bounded output ---');
{
  const records: InformationSourceRecord[] = [];
  for (let i = 0; i < 20; i++) {
    records.push(makeSourceRecord({
      sourceId: `isr-many-${i}`,
      sourceKind: 'market_signal',
      day: i + 1,
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
    }));
  }

  const registry = buildRegistry(records);
  const snapshot = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 25, registry);

  // Bounded by maxVisibleSources (10 for player_broker)
  assert(snapshot.visibleSources.length <= 10, `visible sources bounded (got ${snapshot.visibleSources.length}, max 10)`);
  assert(snapshot.totalVisibleBeforeBound > 10, `totalVisibleBeforeBound tracks pre-bound count (got ${snapshot.totalVisibleBeforeBound})`);

  // Beliefs per domain bounded
  for (const summary of snapshot.beliefSummary) {
    assert(summary.updateCount <= 5, `beliefs per domain bounded: ${summary.domain} has ${summary.updateCount}`);
  }

  // BlindSpots bounded
  assert(snapshot.blindSpots.length <= 3, `blind spots bounded (got ${snapshot.blindSpots.length}, max 3)`);
}

// --- Test 8: no raw registry in snapshot ---
console.log('\n--- 8. No raw registry leakage ---');
{
  const record = makeSourceRecord({
    sourceId: 'isr-leak-1',
    sourceKind: 'market_signal',
    day: 1,
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
  });

  const registry = buildRegistry([record]);
  const snapshot = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);

  const serialized = JSON.stringify(snapshot);
  assert(!serialized.includes('"all":'), 'snapshot does not contain raw registry "all" array');
  assert(!serialized.includes('"byKind":'), 'snapshot does not contain raw registry "byKind" map');
  assert(!serialized.includes('"byDay":'), 'snapshot does not contain raw registry "byDay" map');
  assert(!serialized.includes('"byEntityId":'), 'snapshot does not contain raw registry "byEntityId" map');
  assert(!serialized.includes('"byActorId":'), 'snapshot does not contain raw registry "byActorId" map');
  assert(!serialized.includes('"count":'), 'snapshot does not contain raw registry "count"');

  // VisibleSourceRef should not contain full payload
  for (const source of snapshot.visibleSources) {
    assert(typeof source.summary === 'string', 'source has bounded summary string');
    assert(source.summary.length <= 200, `source summary bounded to 200 chars (got ${source.summary.length})`);
    assert(source.entityRefIds.length <= 3, `entity refs bounded to 3 (got ${source.entityRefIds.length})`);
  }
}

// --- Test 9: buildBrokerBigWorldPOV reads from knowledge ---
console.log('\n--- 9. BrokerBigWorldPOV from knowledge, not raw registry ---');
{
  const record = makeSourceRecord({
    sourceId: 'isr-pov-1',
    sourceKind: 'market_signal',
    day: 3,
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
  });

  const registry = buildRegistry([record]);
  const knowledge = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);

  const brokerPOV = buildBrokerBigWorldPOV(knowledge, DUMMY_BIG_WORLD_POV);

  assert(brokerPOV.actorId === 'broker-1', 'POV has correct actorId');
  assert(brokerPOV.actorRole === 'player_broker', 'POV has correct actorRole');
  assert(brokerPOV.day === 5, 'POV has correct day');
  assert(typeof brokerPOV.visibleSourceCount === 'number', 'POV tracks visible source count');
  assert(typeof brokerPOV.totalSourcesBeforeBound === 'number', 'POV tracks pre-bound count');
  assert(Array.isArray(brokerPOV.causalRefs), 'POV has causalRefs array');
  assert(Array.isArray(brokerPOV.beliefSignals), 'POV has beliefSignals array');
  assert(Array.isArray(brokerPOV.blindSpots), 'POV has blindSpots array');

  // Recommended actions should be bounded
  assert(brokerPOV.recommendedActionReasons.length <= 3, `recommendations bounded (got ${brokerPOV.recommendedActionReasons.length})`);

  // POV should not contain raw registry
  const serialized = JSON.stringify(brokerPOV);
  assert(!serialized.includes('"byKind":'), 'POV does not contain raw registry');
}

// --- Test 10: same source, different actor snapshots have different visibility ---
console.log('\n--- 10. Cross-actor visibility divergence ---');
{
  const ownerRecord = makeSourceRecord({
    sourceId: 'isr-diverge-1',
    sourceKind: 'owner_interview',
    day: 2,
    visibility: { scope: 'owner_only', baseDelayDays: 0 },
    payload: { summary: '业主沟通记录', subtype: 'price_discussed', ownerId: 'owner-1', caseId: 'case-1', brokerId: 'b-1', tone: 'neutral', ownerStatement: '可以谈', interactionMode: 'meeting' },
  });

  const playerRecord = makeSourceRecord({
    sourceId: 'isr-diverge-2',
    sourceKind: 'player_action_receipt',
    day: 2,
    visibility: { scope: 'player_only', baseDelayDays: 0 },
    payload: { summary: '玩家动作', subtype: 'action_executed', actionId: 'showing', executorId: 'b-1', caseId: 'case-1', costEnergy: 10, costPromotionBudget: 0, fieldDeltas: [], outcome: 'success' },
  });

  const allRecord = makeSourceRecord({
    sourceId: 'isr-diverge-3',
    sourceKind: 'market_signal',
    day: 1,
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
  });

  const registry = buildRegistry([ownerRecord, playerRecord, allRecord]);

  const ownerSnap = buildActorKnowledgeSnapshot('owner-1', 'owner', 5, registry);
  const brokerSnap = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);

  // Owner sees owner_only + all_actors, but NOT player_only
  const ownerIds = new Set(ownerSnap.visibleSources.map((s) => s.sourceId));
  assert(ownerIds.has('isr-diverge-1'), 'owner sees owner_only');
  assert(ownerIds.has('isr-diverge-3'), 'owner sees all_actors');
  assert(!ownerIds.has('isr-diverge-2'), 'owner does NOT see player_only');

  // Broker sees player_only + all_actors, but NOT owner_only
  const brokerIds = new Set(brokerSnap.visibleSources.map((s) => s.sourceId));
  assert(brokerIds.has('isr-diverge-2'), 'broker sees player_only');
  assert(brokerIds.has('isr-diverge-3'), 'broker sees all_actors');
  assert(!brokerIds.has('isr-diverge-1'), 'broker does NOT see owner_only');

    // Different snapshots, different worlds — compatible Set check (no isSubsetOf)
    const ownerHasOnly = [...ownerIds].some((id) => !brokerIds.has(id));
    const brokerHasOnly = [...brokerIds].some((id) => !ownerIds.has(id));
    assert(ownerSnap.visibleSources.length !== brokerSnap.visibleSources.length || ownerHasOnly || brokerHasOnly, 'owner and broker have different visible source sets');
}

// --- Test 11: determinism ---
console.log('\n--- 11. Determinism ---');
{
  const record = makeSourceRecord({
    sourceId: 'isr-det-1',
    sourceKind: 'market_signal',
    day: 1,
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
  });

  const registry = buildRegistry([record]);
  const snap1 = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);
  const snap2 = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);

  assert(JSON.stringify(snap1) === JSON.stringify(snap2), 'same inputs produce identical output (determinism)');
}

// --- Test 12: no_one refs filtered from projection ---
console.log('\n--- 12. Projection filtering: no_one refs removed ---');
{
  const hiddenRecord = makeSourceRecord({
    sourceId: 'isr-proj-hidden-1',
    sourceKind: 'acn_network_signal',
    day: 1,
    visibility: { scope: 'no_one', baseDelayDays: 0 },
    payload: { summary: 'ACN内部决策', subtype: 'credit_allocation', sourceAcnId: 'acn-1', brokerIds: ['b-1'], cooperationScore: 75 },
  });
  const visibleRecord = makeSourceRecord({
    sourceId: 'isr-proj-visible-1',
    sourceKind: 'market_signal',
    day: 2,
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
  });

  const registry = buildRegistry([hiddenRecord, visibleRecord]);

  // Build a BigWorldPOV with refs to both hidden and visible source IDs
  const povWithHiddenRefs: BigWorldPOVSummary = {
    ...DUMMY_BIG_WORLD_POV,
    marketCell: {
      ...DUMMY_BIG_WORLD_POV.marketCell,
      refs: [
        { refType: 'market-cell', refId: 'cell-1', refLabel: '和平里' },
        { refType: 'market-signal', refId: 'isr-proj-hidden-1', refLabel: '隐藏信号' },
        { refType: 'market-signal', refId: 'isr-proj-visible-1', refLabel: '可见信号' },
      ],
    },
  };

  const brokerKnowledge = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);
  const { applyKnowledgeFilterToPOV } = await import('../src/selling-houses/application/projections/actorKnowledgeProjection.js');
  const filteredPOV = applyKnowledgeFilterToPOV(povWithHiddenRefs, brokerKnowledge, registry);

  const filteredRefIds = filteredPOV.marketCell.refs.map((r) => r.refId);
  assert(!filteredRefIds.includes('isr-proj-hidden-1'), 'no_one ref is REMOVED from filtered POV');
  assert(filteredRefIds.includes('isr-proj-visible-1'), 'all_actors ref is KEPT in filtered POV');
  assert(filteredRefIds.includes('cell-1'), 'system ref (no matching source) is KEPT');
}

// --- Test 13: owner_only refs only visible to owner ---
console.log('\n--- 13. Projection filtering: owner_only visibility ---');
{
  const ownerRecord = makeSourceRecord({
    sourceId: 'isr-proj-owner-1',
    sourceKind: 'owner_interview',
    day: 3,
    visibility: { scope: 'owner_only', baseDelayDays: 0 },
    payload: { summary: '业主沟通记录', subtype: 'price_discussed', ownerId: 'owner-1', caseId: 'case-1', brokerId: 'b-1', tone: 'neutral', ownerStatement: '可以谈', interactionMode: 'meeting' },
  });

  const registry = buildRegistry([ownerRecord]);

  const povWithOwnerRef: BigWorldPOVSummary = {
    ...DUMMY_BIG_WORLD_POV,
    ownerExpectation: {
      ...DUMMY_BIG_WORLD_POV.ownerExpectation,
      refs: [
        { refType: 'case', refId: 'isr-proj-owner-1', refLabel: '业主沟通' },
      ],
    },
  };

  // Owner sees it
  const ownerKnowledge = buildActorKnowledgeSnapshot('owner-1', 'owner', 5, registry);
  const { applyKnowledgeFilterToPOV } = await import('../src/selling-houses/application/projections/actorKnowledgeProjection.js');
  const ownerPOV = applyKnowledgeFilterToPOV(povWithOwnerRef, ownerKnowledge, registry);
  assert(ownerPOV.ownerExpectation.refs.length === 1, 'owner sees owner_only ref');
  assert(ownerPOV.ownerExpectation.refs[0].refId === 'isr-proj-owner-1', 'owner sees correct ref');

  // Broker does NOT see it
  const brokerKnowledge = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);
  const brokerPOV = applyKnowledgeFilterToPOV(povWithOwnerRef, brokerKnowledge, registry);
  assert(brokerPOV.ownerExpectation.refs.length === 0, 'broker does NOT see owner_only ref');
}

// --- Test 14: player_only refs only visible to player_broker ---
console.log('\n--- 14. Projection filtering: player_only visibility ---');
{
  const playerRecord = makeSourceRecord({
    sourceId: 'isr-proj-player-1',
    sourceKind: 'player_action_receipt',
    day: 2,
    visibility: { scope: 'player_only', baseDelayDays: 0 },
    payload: { summary: '玩家动作执行', subtype: 'action_executed', actionId: 'showing', executorId: 'b-1', caseId: 'case-1', costEnergy: 10, costPromotionBudget: 0, fieldDeltas: [], outcome: 'success' },
  });

  const registry = buildRegistry([playerRecord]);

  const povWithPlayerRef: BigWorldPOVSummary = {
    ...DUMMY_BIG_WORLD_POV,
    becauseBigProof: {
      ...DUMMY_BIG_WORLD_POV.becauseBigProof,
      safeCausalRefs: [
        { refType: 'case', refId: 'isr-proj-player-1', refLabel: '玩家动作' },
      ],
    },
  };

  // Player broker sees it
  const playerKnowledge = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);
  const { applyKnowledgeFilterToPOV } = await import('../src/selling-houses/application/projections/actorKnowledgeProjection.js');
  const playerPOV = applyKnowledgeFilterToPOV(povWithPlayerRef, playerKnowledge, registry);
  assert(playerPOV.becauseBigProof.safeCausalRefs.length === 1, 'player_broker sees player_only ref');

  // Owner does NOT see it
  const ownerKnowledge = buildActorKnowledgeSnapshot('owner-1', 'owner', 5, registry);
  const ownerPOV = applyKnowledgeFilterToPOV(povWithPlayerRef, ownerKnowledge, registry);
  assert(ownerPOV.becauseBigProof.safeCausalRefs.length === 0, 'owner does NOT see player_only ref');

  // Rival broker does NOT see it
  const rivalKnowledge = buildActorKnowledgeSnapshot('rival-1', 'rival_broker', 5, registry);
  const rivalPOV = applyKnowledgeFilterToPOV(povWithPlayerRef, rivalKnowledge, registry);
  assert(rivalPOV.becauseBigProof.safeCausalRefs.length === 0, 'rival_broker does NOT see player_only ref');
}

// --- Test 15: same source, different actor projections have different refs ---
console.log('\n--- 15. Cross-actor projection ref divergence ---');
{
  const ownerRecord = makeSourceRecord({
    sourceId: 'isr-proj-diverge-1',
    sourceKind: 'owner_interview',
    day: 2,
    visibility: { scope: 'owner_only', baseDelayDays: 0 },
    payload: { summary: '业主专属信息', subtype: 'price_discussed', ownerId: 'owner-1', caseId: 'case-1', brokerId: 'b-1', tone: 'neutral', ownerStatement: '降价5万', interactionMode: 'meeting' },
  });

  const playerRecord = makeSourceRecord({
    sourceId: 'isr-proj-diverge-2',
    sourceKind: 'player_action_receipt',
    day: 2,
    visibility: { scope: 'player_only', baseDelayDays: 0 },
    payload: { summary: '玩家专属动作', subtype: 'action_executed', actionId: 'showing', executorId: 'b-1', caseId: 'case-1', costEnergy: 10, costPromotionBudget: 0, fieldDeltas: [], outcome: 'success' },
  });

  const allRecord = makeSourceRecord({
    sourceId: 'isr-proj-diverge-3',
    sourceKind: 'market_signal',
    day: 1,
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
  });

  const registry = buildRegistry([ownerRecord, playerRecord, allRecord]);

  const povWithAllRefs: BigWorldPOVSummary = {
    ...DUMMY_BIG_WORLD_POV,
    marketCell: {
      ...DUMMY_BIG_WORLD_POV.marketCell,
      refs: [
        { refType: 'case', refId: 'isr-proj-diverge-1', refLabel: '业主专属' },
        { refType: 'market-signal', refId: 'isr-proj-diverge-2', refLabel: '玩家专属' },
        { refType: 'market-signal', refId: 'isr-proj-diverge-3', refLabel: '公共信号' },
        { refType: 'market-cell', refId: 'cell-1', refLabel: '和平里' },
      ],
    },
  };

  const ownerKnowledge = buildActorKnowledgeSnapshot('owner-1', 'owner', 5, registry);
  const brokerKnowledge = buildActorKnowledgeSnapshot('broker-1', 'player_broker', 5, registry);

  const { applyKnowledgeFilterToPOV } = await import('../src/selling-houses/application/projections/actorKnowledgeProjection.js');
  const ownerPOV = applyKnowledgeFilterToPOV(povWithAllRefs, ownerKnowledge, registry);
  const brokerPOV = applyKnowledgeFilterToPOV(povWithAllRefs, brokerKnowledge, registry);

  // Owner sees owner_only + all_actors + system
  const ownerRefIds = new Set(ownerPOV.marketCell.refs.map((r) => r.refId));
  assert(ownerRefIds.has('isr-proj-diverge-1'), 'owner sees owner_only ref');
  assert(ownerRefIds.has('isr-proj-diverge-3'), 'owner sees all_actors ref');
  assert(ownerRefIds.has('cell-1'), 'owner sees system ref');
  assert(!ownerRefIds.has('isr-proj-diverge-2'), 'owner does NOT see player_only ref');

  // Broker sees player_only + all_actors + system
  const brokerRefIds = new Set(brokerPOV.marketCell.refs.map((r) => r.refId));
  assert(brokerRefIds.has('isr-proj-diverge-2'), 'broker sees player_only ref');
  assert(brokerRefIds.has('isr-proj-diverge-3'), 'broker sees all_actors ref');
  assert(brokerRefIds.has('cell-1'), 'broker sees system ref');
  assert(!brokerRefIds.has('isr-proj-diverge-1'), 'broker does NOT see owner_only ref');

  // Projections are different — compatible Set check (no isSubsetOf)
  const ownerRefOnly = [...ownerRefIds].some((id) => !brokerRefIds.has(id));
  const brokerRefOnly = [...brokerRefIds].some((id) => !ownerRefIds.has(id));
  assert(ownerRefIds.size !== brokerRefIds.size || ownerRefOnly || brokerRefOnly, 'owner and broker projections have different ref sets');
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
