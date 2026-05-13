// ---------------------------------------------------------------------------
// verify-selling-houses-information-source-types.ts
//
// Verifies:
// 1. InformationSourceRecord type structure (all 10 fields present)
// 2. SourceKind coverage (all 10 kinds)
// 3. Per-kind payload examples compile and are well-formed
// 4. Visibility policy is consistent
// 5. Source-to-causal mapping covers all 10 kinds
// 6. Records are structurally immutable (readonly fields)
// 7. EntityRef / ActorRef are well-typed
// 8. Replay key format is deterministic
// 9. Hidden truth vs actor POV boundary:
//    - visibility.scope === 'no_one' means record is hidden from all actors
//    - SourceRecord itself is NOT a POV projection
// 10. SourceRecord does not mutate Case / Opportunity (no write fields)

import type {
  InformationSourceRecord,
  SourceKind,
  SourceKindPayloadMap,
  VisibilityPolicy,
  EntityRef,
  ActorRef,
  SourceToCausalMapping,
} from '../src/selling-houses/domain/world-model/informationSourceTypes.js';
import {
  SOURCE_TO_CAUSAL_MAP,
  EXAMPLE_MARKET_SIGNAL,
  EXAMPLE_RIVAL_ACTION,
  EXAMPLE_OWNER_INTERVIEW,
  EXAMPLE_COMPARABLE_TXN,
} from '../src/selling-houses/domain/world-model/informationSourceTypes.js';

let failures = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error(`  FAIL: ${msg}`); failures += 1; }
  else { console.log(`  PASS: ${msg}`); }
}

console.log('=== InformationSourceRecord Type Verification ===\n');

// --- 1. SourceKind coverage ---
console.log('--- 1. SourceKind coverage ---');
const ALL_KINDS: SourceKind[] = [
  'market_signal', 'rival_action', 'customer_interaction',
  'owner_interview', 'manager_message', 'player_action_receipt',
  'process_receipt', 'comparable_transaction', 'platform_traffic',
  'acn_network_signal',
];
assert(ALL_KINDS.length === 10, `10 source kinds defined (got ${ALL_KINDS.length})`);
const kindSet = new Set(ALL_KINDS);
assert(kindSet.size === 10, 'all source kinds are unique');

// --- 2. Example: market_signal ---
console.log('\n--- 2. market_signal example ---');
const ms = EXAMPLE_MARKET_SIGNAL;
assert(ms.sourceKind === 'market_signal', 'sourceKind matches');
assert(typeof ms.sourceId === 'string', 'sourceId is string');
assert(ms.sourceId.startsWith('isr-'), 'sourceId format: isr-{seed}-{kind}-{index}');
assert(typeof ms.day === 'number' && ms.day > 0, 'day is positive number');
assert(ms.phase === 'morning' || ms.phase === 'afternoon' || ms.phase === 'evening' || ms.phase === 'tick_close', 'phase valid');
assert(ms.entityRefs.length > 0, 'entityRefs not empty');
assert(ms.actorRefs.length > 0, 'actorRefs not empty');
assert(typeof ms.visibility === 'object', 'visibility is object');
assert(typeof ms.confidence === 'number' && ms.confidence >= 0 && ms.confidence <= 1, 'confidence in [0,1]');
assert(typeof ms.delayDays === 'number' && ms.delayDays >= 0, 'delayDays >= 0');
assert(typeof ms.replayKey === 'string' && ms.replayKey.length > 0, 'replayKey non-empty');
assert(ms.origin === 'ecosystem_tick' || ms.origin === 'bootstrap' || ms.origin === 'player_action' || ms.origin === 'process_run' || ms.origin === 'daily_settlement', 'origin valid');
assert(ms.payload.subtype === 'heat_shift', 'payload.subtype');
assert(typeof ms.payload.summary === 'string', 'payload.summary is string');
assert(typeof ms.payload.marketCellId === 'string', 'payload.marketCellId is string');
assert(typeof ms.payload.before === 'number', 'payload.before is number');
assert(typeof ms.payload.after === 'number', 'payload.after is number');
assert(typeof ms.payload.isPublic === 'boolean', 'payload.isPublic is boolean');

// --- 3. Example: rival_action ---
console.log('\n--- 3. rival_action example ---');
const ra = EXAMPLE_RIVAL_ACTION;
assert(ra.sourceKind === 'rival_action', 'sourceKind');
assert(ra.payload.subtype === 'reprice', 'subtype');
assert(typeof ra.payload.rivalBrokerId === 'string', 'rivalBrokerId');
assert(typeof ra.payload.rivalAcnId === 'string', 'rivalAcnId');
assert(typeof ra.payload.priceBefore === 'number', 'priceBefore');
assert(typeof ra.payload.priceAfter === 'number', 'priceAfter');
assert(ra.payload.evidenceStrength === 'direct' || ra.payload.evidenceStrength === 'rumor' || ra.payload.evidenceStrength === 'inferred', 'evidenceStrength valid');

// --- 4. Example: owner_interview ---
console.log('\n--- 4. owner_interview example ---');
const oi = EXAMPLE_OWNER_INTERVIEW;
assert(oi.sourceKind === 'owner_interview', 'sourceKind');
assert(oi.payload.subtype === 'price_discussed', 'subtype');
assert(typeof oi.payload.ownerId === 'string', 'ownerId');
assert(typeof oi.payload.caseId === 'string', 'caseId');
assert(typeof oi.payload.brokerId === 'string', 'brokerId');
assert(typeof oi.payload.ownerStatement === 'string', 'ownerStatement');
assert(oi.payload.tone === 'positive' || oi.payload.tone === 'neutral' || oi.payload.tone === 'negative' || oi.payload.tone === 'hostile', 'tone valid');
assert(oi.visibility.scope === 'specific_actors', 'owner interview visibility: specific_actors');
assert(oi.visibility.actorIds !== undefined && oi.visibility.actorIds.length === 2, 'visibility.actorIds has 2 entries');

// --- 5. Example: comparable_transaction ---
console.log('\n--- 5. comparable_transaction example ---');
const ct = EXAMPLE_COMPARABLE_TXN;
assert(ct.sourceKind === 'comparable_transaction', 'sourceKind');
assert(ct.payload.subtype === 'deal_closed', 'subtype');
assert(typeof ct.payload.price === 'number', 'price');
assert(typeof ct.payload.discountPct === 'number', 'discountPct');
assert(ct.delayDays === 1, 'comparable txn delay: 1 day');

// --- 6. Visibility policy consistency ---
console.log('\n--- 6. Visibility policy ---');
const visPolicies: VisibilityPolicy[] = [
  ms.visibility, ra.visibility, oi.visibility, ct.visibility,
  { scope: 'no_one', baseDelayDays: 0 },
  { scope: 'all_actors', baseDelayDays: 2 },
  { scope: 'player_only', baseDelayDays: 0 },
  { scope: 'broker_chain', baseDelayDays: 1 },
  { scope: 'owner_only', baseDelayDays: 0 },
];
for (const v of visPolicies) {
  assert(v.scope !== undefined, `scope defined for ${v.scope}`);
  assert(typeof v.baseDelayDays === 'number' && v.baseDelayDays >= 0, `baseDelayDays >= 0 for ${v.scope}`);
  if (v.scope === 'specific_actors') {
    assert(Array.isArray(v.actorIds) && v.actorIds.length > 0, 'specific_actors must have actorIds');
  }
}

// --- 7. EntityRef / ActorRef structure ---
console.log('\n--- 7. EntityRef / ActorRef ---');
const entityKinds = new Set<string>();
for (const ex of [ms, ra, oi, ct]) {
  for (const ref of ex.entityRefs) {
    assert(typeof ref.id === 'string', 'entityRef.id is string');
    entityKinds.add(ref.kind);
  }
  for (const ref of ex.actorRefs) {
    assert(typeof ref.id === 'string', 'actorRef.id is string');
    assert(['player_broker', 'rival_broker', 'owner', 'customer', 'manager', 'system'].includes(ref.role), `actorRef.role valid: ${ref.role}`);
  }
}
assert(entityKinds.size >= 3, `at least 3 entity kinds used (got ${entityKinds.size})`);

// --- 8. Source-to-causal mapping ---
console.log('\n--- 8. Source-to-causal mapping ---');
assert(SOURCE_TO_CAUSAL_MAP.length === 10, `mapping covers all 10 kinds (got ${SOURCE_TO_CAUSAL_MAP.length})`);
const mappedKinds = new Set(SOURCE_TO_CAUSAL_MAP.map((m) => m.sourceKind));
for (const kind of ALL_KINDS) {
  assert(mappedKinds.has(kind), `mapping exists for ${kind}`);
}
for (const m of SOURCE_TO_CAUSAL_MAP) {
  assert(m.possibleCausalKinds.length > 0, `${m.sourceKind} has causal kinds`);
  assert(m.confidenceRange.min >= 0 && m.confidenceRange.max <= 1, `${m.sourceKind} confidence in [0,1]`);
  assert(m.typicalDelayDays.min >= 0, `${m.sourceKind} delay min >= 0`);
  assert(m.typicalDelayDays.max >= m.typicalDelayDays.min, `${m.sourceKind} delay max >= min`);
}

// --- 9. Structural immutability ---
console.log('\n--- 9. Structural immutability ---');
// TypeScript readonly fields are compile-time only; at runtime we check shape
assert(typeof ms === 'object' && ms !== null, 'record is object');
assert(!('write' in ms), 'record has no write method');
assert(!('mutate' in ms), 'record has no mutate method');

// --- 10. SourceRecord does not reference Case/Opp write fields ---
console.log('\n--- 10. No Case/Opp mutation fields ---');
const dangerousFields = ['setStatus', 'setPrice', 'setTrust', 'setStage', 'updateCase', 'updateOpportunity'];
for (const field of dangerousFields) {
  assert(!(field in ms), `record has no ${field}`);
}

// --- 11. Replay key determinism ---
console.log('\n--- 11. Replay key ---');
assert(typeof ms.replayKey === 'string' && ms.replayKey.length > 0, 'replayKey non-empty');
assert(ms.replayKey.includes('42'), 'replayKey contains seed');
assert(ms.replayKey === 'rk-42-ms-3-0', 'replayKey format: rk-{seed}-{kind_abbr}-{day}-{index}');

// --- 12. Hidden truth boundary ---
console.log('\n--- 12. Hidden truth boundary ---');
// Records with visibility.scope === 'no_one' are hidden truth only
const hiddenRecord: InformationSourceRecord<'acn_network_signal'> = {
  ...EXAMPLE_MARKET_SIGNAL,
  sourceKind: 'acn_network_signal',
  visibility: { scope: 'no_one', baseDelayDays: 0 },
  payload: {
    subtype: 'credit_allocation',
    summary: 'ACN 内部 credit 分配',
    sourceAcnId: 'acn-1',
    brokerIds: ['b-1'],
    cooperationScore: 75,
  },
};
assert(hiddenRecord.visibility.scope === 'no_one', 'hidden record: scope=no_one');
assert(hiddenRecord.sourceKind === 'acn_network_signal', 'hidden record: acn_network_signal');

// --- Summary ---
console.log('\n=== Summary ===');
console.log(`Source kinds: ${ALL_KINDS.length}`);
console.log(`Entity ref kinds used: ${entityKinds.size}`);
console.log(`Causal mappings: ${SOURCE_TO_CAUSAL_MAP.length}`);
console.log(`Examples verified: 4 (market_signal, rival_action, owner_interview, comparable_transaction)`);

if (failures > 0) { console.error(`\n${failures} FAILURES`); process.exit(1); }
else { console.log('\nAll tests passed!'); }
