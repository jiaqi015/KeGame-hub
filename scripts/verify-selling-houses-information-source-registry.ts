// ---------------------------------------------------------------------------
// verify-selling-houses-information-source-registry.ts
//
// Verifies:
// 1. createEmptyRegistry produces valid empty structure
// 2. appendSourceRecord returns new registry (no mutation)
// 3. Index consistency after append (all, byKind, byDay, byEntityId, byActorId, byReplayKey)
// 4. Duplicate replayKey is rejected
// 5. VisibilityPolicy enforcement for all 6 scopes
// 6. no_one scope hidden from actor queries
// 7. Registry JSON determinism (same records → same JSON)
// 8. No Case / Opportunity mutation methods on registry
// 9. queryBy* helpers work correctly
// 10. queryHiddenSourceRecords only returns no_one records

import {
  createEmptyRegistry,
  appendSourceRecord,
  appendSourceRecords,
  queryVisibleSourceRecords,
  queryHiddenSourceRecords,
  queryByKind,
  queryByDay,
  queryByEntityId,
  queryByActorId,
  queryByReplayKey,
  getRegistryStats,
  type InformationSourceRegistry,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';
import type {
  InformationSourceRecord,
  SourceKind,
  ActorRole,
} from '../src/selling-houses/domain/world-model/informationSourceTypes.js';

let failures = 0;
let recordCounter = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error(`  FAIL: ${msg}`); failures += 1; }
  else { console.log(`  PASS: ${msg}`); }
}

function makeRecord(overrides: Partial<InformationSourceRecord> = {}): InformationSourceRecord {
  recordCounter += 1;
  return {
    sourceId: overrides.sourceId ?? `isr-test-${recordCounter}`,
    sourceKind: overrides.sourceKind ?? 'market_signal',
    day: overrides.day ?? 1,
    phase: overrides.phase ?? 'morning',
    entityRefs: overrides.entityRefs ?? [{ id: 'entity-1', kind: 'case' }],
    actorRefs: overrides.actorRefs ?? [{ id: 'actor-1', role: 'player_broker' }],
    visibility: overrides.visibility ?? { scope: 'all_actors', baseDelayDays: 0 },
    confidence: overrides.confidence ?? 0.9,
    delayDays: overrides.delayDays ?? 0,
    replayKey: overrides.replayKey ?? `rk-auto-${recordCounter}`,
    origin: overrides.origin ?? 'ecosystem_tick',
    payload: overrides.payload ?? { subtype: 'heat_shift', summary: 'test', marketCellId: 'c-1', before: 50, after: 60, unit: 'heat', isPublic: true },
  };
}

console.log('=== InformationSourceRegistry Verification ===\n');

// --- 1. Empty registry ---
console.log('--- 1. Empty registry ---');
const empty = createEmptyRegistry();
assert(empty.index.count === 0, 'count is 0');
assert(empty.index.all.length === 0, 'all is empty');
assert(empty.index.byKind.size === 0, 'byKind is empty');
assert(empty.index.byDay.size === 0, 'byDay is empty');
assert(empty.index.byEntityId.size === 0, 'byEntityId is empty');
assert(empty.index.byActorId.size === 0, 'byActorId is empty');
assert(empty.index.byReplayKey.size === 0, 'byReplayKey is empty');

// --- 2. Append returns new registry ---
console.log('\n--- 2. Append returns new registry ---');
const r1 = makeRecord({ sourceId: 'isr-1', replayKey: 'rk-1', day: 1, sourceKind: 'market_signal',
  entityRefs: [{ id: 'case-1', kind: 'case' }], actorRefs: [{ id: 'broker-1', role: 'player_broker' }] });
const result1 = appendSourceRecord(empty, r1);
assert(result1.ok === true, 'append ok');
if (result1.ok) {
  const reg = result1.registry;
  assert(reg.index.count === 1, 'count is 1');
  assert(reg.index.all.length === 1, 'all has 1');
  assert(reg.index.all[0] === r1, 'all[0] is same reference');
  assert(reg.index.byKind.get('market_signal')?.length === 1, 'byKind: market_signal has 1');
  assert(reg.index.byDay.get(1)?.length === 1, 'byDay: day 1 has 1');
  assert(reg.index.byEntityId.get('case-1')?.length === 1, 'byEntityId: case-1 has 1');
  assert(reg.index.byActorId.get('broker-1')?.length === 1, 'byActorId: broker-1 has 1');
  assert(reg.index.byReplayKey.get('rk-1') === r1, 'byReplayKey: rk-1 maps to r1');
}

// --- 3. Index consistency after multiple appends ---
console.log('\n--- 3. Multi-append index consistency ---');
const r2 = makeRecord({ sourceId: 'isr-2', replayKey: 'rk-2', day: 2, sourceKind: 'rival_action',
  entityRefs: [{ id: 'listing-1', kind: 'listing' }, { id: 'case-1', kind: 'case' }],
  actorRefs: [{ id: 'broker-2', role: 'rival_broker' }] });
const r3 = makeRecord({ sourceId: 'isr-3', replayKey: 'rk-3', day: 1, sourceKind: 'owner_interview',
  entityRefs: [{ id: 'case-1', kind: 'case' }, { id: 'owner-1', kind: 'owner' }],
  actorRefs: [{ id: 'broker-1', role: 'player_broker' }, { id: 'owner-1', role: 'owner' }] });

let reg = result1.ok ? result1.registry : empty;
const result2 = appendSourceRecord(reg, r2);
assert(result2.ok, 'append r2 ok');
if (result2.ok) {
  const result3 = appendSourceRecord(result2.registry, r3);
  assert(result3.ok, 'append r3 ok');
  if (result3.ok) {
    reg = result3.registry;
    assert(reg.index.count === 3, 'count is 3');
    assert(reg.index.all.length === 3, 'all has 3');
    assert(reg.index.byKind.get('market_signal')?.length === 1, 'byKind: market_signal=1');
    assert(reg.index.byKind.get('rival_action')?.length === 1, 'byKind: rival_action=1');
    assert(reg.index.byKind.get('owner_interview')?.length === 1, 'byKind: owner_interview=1');
    assert(reg.index.byDay.get(1)?.length === 2, 'byDay: day 1 has 2');
    assert(reg.index.byDay.get(2)?.length === 1, 'byDay: day 2 has 1');
    assert(reg.index.byEntityId.get('case-1')?.length === 3, 'byEntityId: case-1 has 3 (r1+r2+r3)');
    assert(reg.index.byEntityId.get('listing-1')?.length === 1, 'byEntityId: listing-1 has 1');
    assert(reg.index.byEntityId.get('owner-1')?.length === 1, 'byEntityId: owner-1 has 1');
    assert(reg.index.byActorId.get('broker-1')?.length === 2, 'byActorId: broker-1 has 2 (r1+r3)');
    assert(reg.index.byActorId.get('broker-2')?.length === 1, 'byActorId: broker-2 has 1');
    assert(reg.index.byActorId.get('owner-1')?.length === 1, 'byActorId: owner-1 has 1');
    assert(reg.index.byReplayKey.size === 3, 'byReplayKey has 3');
  }
}

// --- 4. Duplicate replayKey rejection ---
console.log('\n--- 4. Duplicate replayKey rejection ---');
const rDup = makeRecord({ sourceId: 'isr-dup', replayKey: 'rk-1', day: 5, sourceKind: 'market_signal' });
const dupResult = appendSourceRecord(reg, rDup);
assert(dupResult.ok === false, 'duplicate rejected');
const dupResultFailed = dupResult as Extract<typeof dupResult, { ok: false }>;
assert(dupResultFailed.reason === 'duplicate_replay_key', 'reason is duplicate_replay_key');
assert(dupResultFailed.existing === r1, 'existing record returned');
assert(reg.index.count === 3, 'registry unchanged after dup');

// --- 5. VisibilityPolicy — all 6 scopes ---
console.log('\n--- 5. VisibilityPolicy enforcement ---');

// 5a. all_actors
const visAll: InformationSourceRecord = makeRecord({
  sourceId: 'isr-vis-all', replayKey: 'rk-vis-all', day: 3, sourceKind: 'market_signal',
  visibility: { scope: 'all_actors', baseDelayDays: 0 },
});
let visReg = createEmptyRegistry();
const visAllResult = appendSourceRecord(visReg, visAll);
assert(visAllResult.ok, 'append visAll ok');
if (visAllResult.ok) visReg = visAllResult.registry;

const allVisible = queryVisibleSourceRecords(visReg, 'anyone', 'customer', 3);
assert(allVisible.length === 1, 'all_actors: visible to customer');
const allVisibleBroker = queryVisibleSourceRecords(visReg, 'broker-x', 'rival_broker', 3);
assert(allVisibleBroker.length === 1, 'all_actors: visible to rival_broker');

// 5b. specific_actors
const visSpec: InformationSourceRecord = makeRecord({
  sourceId: 'isr-vis-spec', replayKey: 'rk-vis-spec', day: 3, sourceKind: 'owner_interview',
  visibility: { scope: 'specific_actors', actorIds: ['player-broker', 'owner-1'], baseDelayDays: 0 },
});
const specResult = appendSourceRecord(visReg, visSpec);
assert(specResult.ok, 'append visSpec ok');
if (specResult.ok) visReg = specResult.registry;

// visReg now has: visAll (all_actors) + visSpec (specific_actors)
// player-broker sees both (all_actors + specific_actors)
const specVisible = queryVisibleSourceRecords(visReg, 'player-broker', 'player_broker', 3);
assert(specVisible.length === 2, 'specific_actors: player-broker sees visAll+visSpec (2)');
// owner-1 sees both (all_actors + specific_actors)
const specVisible2 = queryVisibleSourceRecords(visReg, 'owner-1', 'owner', 3);
assert(specVisible2.length === 2, 'specific_actors: owner-1 sees visAll+visSpec (2)');
// random-broker only sees visAll (all_actors), not visSpec (specific_actors)
const specHidden = queryVisibleSourceRecords(visReg, 'random-broker', 'rival_broker', 3);
assert(specHidden.length === 1, 'specific_actors: random-broker sees only visAll (1)');

// 5c. no_one
const visNone: InformationSourceRecord = makeRecord({
  sourceId: 'isr-vis-none', replayKey: 'rk-vis-none', day: 3, sourceKind: 'acn_network_signal',
  visibility: { scope: 'no_one', baseDelayDays: 0 },
});
const noneResult = appendSourceRecord(visReg, visNone);
assert(noneResult.ok, 'append visNone ok');
if (noneResult.ok) visReg = noneResult.registry;

// visReg now has: visAll + visSpec + visNone
// visNone (no_one) is invisible to all actors
const noneVisible = queryVisibleSourceRecords(visReg, 'player-broker', 'player_broker', 3);
assert(noneVisible.length === 2, 'no_one: player-broker still sees visAll+visSpec (2), not visNone');
const noneHidden = queryHiddenSourceRecords(visReg);
assert(noneHidden.length === 1, 'no_one: accessible via queryHiddenSourceRecords');

// 5d. owner_only
const visOwner: InformationSourceRecord = makeRecord({
  sourceId: 'isr-vis-owner', replayKey: 'rk-vis-owner', day: 3, sourceKind: 'owner_interview',
  visibility: { scope: 'owner_only', baseDelayDays: 0 },
});
const ownerResult = appendSourceRecord(visReg, visOwner);
assert(ownerResult.ok, 'append visOwner ok');
if (ownerResult.ok) visReg = ownerResult.registry;

// visReg now has: visAll + visSpec + visNone + visOwner
// visOwner (owner_only): only owner sees it
// broker-1 is NOT in visSpec's specific_actors list, so broker only sees visAll
const ownerCanSee = queryVisibleSourceRecords(visReg, 'owner-1', 'owner', 3);
assert(ownerCanSee.length === 3, 'owner_only: owner sees visAll+visSpec+visOwner (3)');
const brokerCantSee = queryVisibleSourceRecords(visReg, 'broker-1', 'player_broker', 3);
assert(brokerCantSee.length === 1, 'owner_only: broker sees only visAll (1), not visSpec or visOwner');

// 5e. player_only
const visPlayer: InformationSourceRecord = makeRecord({
  sourceId: 'isr-vis-player', replayKey: 'rk-vis-player', day: 3, sourceKind: 'manager_message',
  visibility: { scope: 'player_only', baseDelayDays: 0 },
});
const playerResult = appendSourceRecord(visReg, visPlayer);
assert(playerResult.ok, 'append visPlayer ok');
if (playerResult.ok) visReg = playerResult.registry;

// visReg now has: visAll + visSpec + visNone + visOwner + visPlayer
// visPlayer (player_only): only player_broker sees it
const playerCanSee = queryVisibleSourceRecords(visReg, 'player-broker', 'player_broker', 3);
assert(playerCanSee.length === 3, 'player_only: player sees visAll+visSpec+visPlayer (3)');
const rivalCantSee = queryVisibleSourceRecords(visReg, 'rival-1', 'rival_broker', 3);
assert(rivalCantSee.length === 1, 'player_only: rival sees only visAll (1), not visSpec or visPlayer');

// 5f. broker_chain
const visChain: InformationSourceRecord = makeRecord({
  sourceId: 'isr-vis-chain', replayKey: 'rk-vis-chain', day: 3, sourceKind: 'acn_network_signal',
  visibility: { scope: 'broker_chain', baseDelayDays: 0 },
});
const chainResult = appendSourceRecord(visReg, visChain);
assert(chainResult.ok, 'append visChain ok');
if (chainResult.ok) visReg = chainResult.registry;

// visReg now has: visAll + visSpec + visNone + visOwner + visPlayer + visChain
// visChain (broker_chain): player_broker, rival_broker, manager see it; owner does not
// visSpec (specific_actors): only player-broker and owner-1 see it
const chainPlayer = queryVisibleSourceRecords(visReg, 'player-broker', 'player_broker', 3);
assert(chainPlayer.length === 4, 'broker_chain: player sees visAll+visSpec+visPlayer+visChain (4)');
const chainRival = queryVisibleSourceRecords(visReg, 'rival-1', 'rival_broker', 3);
assert(chainRival.length === 2, 'broker_chain: rival sees visAll+visChain (2)');
const chainMgr = queryVisibleSourceRecords(visReg, 'mgr-1', 'manager', 3);
assert(chainMgr.length === 2, 'broker_chain: manager sees visAll+visChain (2)');
const chainOwner = queryVisibleSourceRecords(visReg, 'owner-1', 'owner', 3);
assert(chainOwner.length === 3, 'broker_chain: owner sees visAll+visSpec+visOwner (3), not visChain');

// --- 6. Delay enforcement ---
console.log('\n--- 6. Delay enforcement ---');
const visDelay: InformationSourceRecord = makeRecord({
  sourceId: 'isr-delay', replayKey: 'rk-delay', day: 5, sourceKind: 'comparable_transaction',
  visibility: { scope: 'all_actors', baseDelayDays: 2 },
});
let delayReg = createEmptyRegistry();
const delayResult = appendSourceRecord(delayReg, visDelay);
assert(delayResult.ok, 'append delay ok');
if (delayResult.ok) delayReg = delayResult.registry;

const day5 = queryVisibleSourceRecords(delayReg, 'broker-1', 'player_broker', 5);
assert(day5.length === 0, 'delay: not visible on day 5 (5 < 5+2)');
const day6 = queryVisibleSourceRecords(delayReg, 'broker-1', 'player_broker', 6);
assert(day6.length === 0, 'delay: not visible on day 6 (6 < 5+2)');
const day7 = queryVisibleSourceRecords(delayReg, 'broker-1', 'player_broker', 7);
assert(day7.length === 1, 'delay: visible on day 7 (7 >= 5+2)');

// --- 7. JSON determinism ---
console.log('\n--- 7. JSON determinism ---');
const recs: InformationSourceRecord[] = [];
for (let i = 0; i < 10; i++) {
  recs.push(makeRecord({
    sourceId: `isr-det-${i}`, replayKey: `rk-det-${i}`, day: i + 1,
    sourceKind: (['market_signal', 'rival_action', 'owner_interview'] as SourceKind[])[i % 3],
    entityRefs: [{ id: `entity-${i}`, kind: 'case' }],
    actorRefs: [{ id: `actor-${i}`, role: 'player_broker' }],
  }));
}
let regDetA = createEmptyRegistry();
let regDetB = createEmptyRegistry();
for (const r of recs) {
  const ra = appendSourceRecord(regDetA, r);
  const rb = appendSourceRecord(regDetB, r);
  assert(ra.ok && rb.ok, 'append ok');
  if (ra.ok) regDetA = ra.registry;
  if (rb.ok) regDetB = rb.registry;
}
const jsonA = JSON.stringify(regDetA.index);
const jsonB = JSON.stringify(regDetB.index);
assert(jsonA === jsonB, 'same records order → same JSON');
assert(regDetA.index.count === 10, 'det count is 10');

// --- 8. No Case/Opp mutation methods ---
console.log('\n--- 8. No mutation methods ---');
const dangerousFields = ['updateCase', 'updateOpportunity', 'deleteRecord', 'setRecord', 'mutate'];
for (const field of dangerousFields) {
  assert(!(field in empty), `registry has no ${field}`);
}
assert(typeof (empty as any).index === 'object', 'registry has index (read-only)');

// --- 9. queryBy* helpers ---
console.log('\n--- 9. queryBy* helpers ---');
assert(queryByKind(reg, 'market_signal').length === 1, 'queryByKind: market_signal=1');
assert(queryByKind(reg, 'rival_action').length === 1, 'queryByKind: rival_action=1');
assert(queryByKind(reg, 'owner_interview').length === 1, 'queryByKind: owner_interview=1');
assert(queryByDay(reg, 1).length === 2, 'queryByDay: day 1 has 2');
assert(queryByDay(reg, 2).length === 1, 'queryByDay: day 2 has 1');
assert(queryByEntityId(reg, 'case-1').length === 3, 'queryByEntityId: case-1 has 3 (r1+r2+r3)');
assert(queryByActorId(reg, 'broker-1').length === 2, 'queryByActorId: broker-1 has 2');
assert(queryByReplayKey(reg, 'rk-1') === r1, 'queryByReplayKey: rk-1 returns r1');
assert(queryByReplayKey(reg, 'rk-nonexistent') === undefined, 'queryByReplayKey: nonexistent returns undefined');

// --- 10. queryHiddenSourceRecords ---
console.log('\n--- 10. queryHiddenSourceRecords ---');
const hidden1: InformationSourceRecord = makeRecord({
  sourceId: 'isr-hid-1', replayKey: 'rk-hid-1', day: 4, sourceKind: 'acn_network_signal',
  visibility: { scope: 'no_one', baseDelayDays: 0 },
});
const visible1: InformationSourceRecord = makeRecord({
  sourceId: 'isr-vis-1', replayKey: 'rk-vis-1', day: 4, sourceKind: 'market_signal',
  visibility: { scope: 'all_actors', baseDelayDays: 0 },
});
let hidReg = createEmptyRegistry();
const h1 = appendSourceRecord(hidReg, hidden1);
if (h1.ok) hidReg = h1.registry;
const h2 = appendSourceRecord(hidReg, visible1);
if (h2.ok) hidReg = h2.registry;

const hiddenRecords = queryHiddenSourceRecords(hidReg);
assert(hiddenRecords.length === 1, 'queryHidden: exactly 1 hidden record');
assert(hiddenRecords[0] === hidden1, 'queryHidden: returns the hidden record');
const visibleRecords = queryVisibleSourceRecords(hidReg, 'any', 'player_broker', 4);
assert(visibleRecords.length === 1, 'queryVisible: exactly 1 visible record');
assert(visibleRecords[0] === visible1, 'queryVisible: returns the visible record');

// --- 11. batch append ---
console.log('\n--- 11. batch append ---');
let batchReg = createEmptyRegistry();
const batch = appendSourceRecords(batchReg, [
  makeRecord({ sourceId: 'isr-b1', replayKey: 'rk-b1', day: 1 }),
  makeRecord({ sourceId: 'isr-b2', replayKey: 'rk-b2', day: 1 }),
  makeRecord({ sourceId: 'isr-b3', replayKey: 'rk-b1', day: 1 }), // duplicate
  makeRecord({ sourceId: 'isr-b4', replayKey: 'rk-b4', day: 2 }),
]);
assert(batch.ok === false, 'batch: not all ok (has dup)');
assert(batch.appendedCount === 3, 'batch: 3 appended');
assert(batch.rejected.length === 1, 'batch: 1 rejected');
batchReg = batch.registry;
assert(batchReg.index.count === 3, 'batch: count is 3');

// --- 12. Registry stats ---
console.log('\n--- 12. Registry stats ---');
const stats = getRegistryStats(reg);
assert(stats.totalCount === 3, 'stats.totalCount=3');
assert(stats.kindCounts['market_signal'] === 1, 'stats kindCounts market_signal=1');
assert(stats.kindCounts['rival_action'] === 1, 'stats kindCounts rival_action=1');
assert(stats.kindCounts['owner_interview'] === 1, 'stats kindCounts owner_interview=1');
assert(stats.dayRange?.min === 1, 'stats dayRange.min=1');
assert(stats.dayRange?.max === 2, 'stats dayRange.max=2');
assert(stats.uniqueEntityIds === 3, 'stats uniqueEntityIds=3');
assert(stats.uniqueActorIds === 3, 'stats uniqueActorIds=3');
assert(stats.uniqueReplayKeys === 3, 'stats uniqueReplayKeys=3');

// --- Summary ---
console.log('\n=== Summary ===');
console.log('Registry API verified: createEmptyRegistry, appendSourceRecord, appendSourceRecords');
console.log('Query API verified: queryVisibleSourceRecords, queryHiddenSourceRecords, queryBy*');
console.log('Visibility scopes verified: all_actors, specific_actors, no_one, owner_only, player_only, broker_chain');
console.log('Constraints verified: immutable append, duplicate rejection, delay enforcement, no mutation methods');

if (failures > 0) { console.error(`\n${failures} FAILURES`); process.exit(1); }
else { console.log('\nAll tests passed!'); }
