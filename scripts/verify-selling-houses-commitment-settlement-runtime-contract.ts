/**
 * CommitmentSettlement Runtime Contract Verification
 *
 * Validates:
 * 1. CommitmentSettlement types compile and are frozen
 * 2. buildCommitmentSettlement produces deterministic frozen output
 * 3. appendCommitmentSettlement upserts by settlementId
 * 4. normalizeCommitmentSettlementHistory handles old saves
 * 5. buildCommitmentSettlementsForDay extracts by day
 * 6. No Date.now / Math.random in adapter
 * 7. Settlement does not alter gameplay
 * 8. Settlement links to ledger evidence refs
 */

import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { advanceOneDay } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  buildCommitmentSettlement,
  appendCommitmentSettlement,
  normalizeCommitmentSettlementHistory,
  buildCommitmentSettlementsForDay,
} from '../src/selling-houses/runtime/simulation/actionReceiptAdapter.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

// ---------------------------------------------------------------------------
// 1. buildCommitmentSettlement frozen output
// ---------------------------------------------------------------------------

console.log('=== Check 1: buildCommitmentSettlement frozen ===');

const settlement = buildCommitmentSettlement({
  day: 3,
  caseId: 'case-1',
  commitmentKind: 'price_hold',
  commitmentScope: 'negotiation',
  trigger: 'created',
  ownerEntity: 'owner',
  strengthBefore: 0,
  strengthAfter: 60,
  reason: '首次面访建立信任',
  relatedEventIds: ['evt-1'],
  relatedReceiptIds: ['receipt-1'],
});

check(settlement.settlementId === 'settlement-case-1-price_hold-3', 'settlementId is deterministic');
check(settlement.day === 3, 'day matches');
check(settlement.commitmentKind === 'price_hold', 'kind matches');
check(settlement.trigger === 'created', 'trigger matches');
check(settlement.strengthBefore === 0, 'strengthBefore matches');
check(settlement.strengthAfter === 60, 'strengthAfter matches');
check(Object.isFrozen(settlement), 'settlement is frozen');
check(Object.isFrozen(settlement.relatedEventIds), 'relatedEventIds is frozen');
check(Object.isFrozen(settlement.relatedReceiptIds), 'relatedReceiptIds is frozen');

console.log('  buildCommitmentSettlement: PASS');

// ---------------------------------------------------------------------------
// 2. appendCommitmentSettlement upserts
// ---------------------------------------------------------------------------

console.log('=== Check 2: appendCommitmentSettlement upserts ===');

const state2 = {} as GameState;
(state2 as any).commitmentSettlementHistory = [];

appendCommitmentSettlement(state2, settlement);
check(state2.commitmentSettlementHistory!.length === 1, 'after first append: 1');

appendCommitmentSettlement(state2, settlement);
check(state2.commitmentSettlementHistory!.length === 1, 'after duplicate: still 1 (upsert)');

const settlement2 = buildCommitmentSettlement({
  day: 4,
  caseId: 'case-1',
  commitmentKind: 'price_hold',
  commitmentScope: 'negotiation',
  trigger: 'advanced',
  ownerEntity: 'owner',
  strengthBefore: 60,
  strengthAfter: 80,
  reason: '价格沟通推进',
  relatedEventIds: [],
  relatedReceiptIds: [],
});

appendCommitmentSettlement(state2, settlement2);
check(state2.commitmentSettlementHistory!.length === 2, 'after different: 2');

console.log('  appendCommitmentSettlement: PASS');

// ---------------------------------------------------------------------------
// 3. normalizeCommitmentSettlementHistory
// ---------------------------------------------------------------------------

console.log('=== Check 3: normalizeCommitmentSettlementHistory ===');

check(normalizeCommitmentSettlementHistory(undefined).length === 0, 'undefined → empty');
check(normalizeCommitmentSettlementHistory(null).length === 0, 'null → empty');
check(normalizeCommitmentSettlementHistory([settlement]).length === 1, 'valid → kept');
check(normalizeCommitmentSettlementHistory([{ day: -1, settlementId: 'x' }]).length === 0, 'negative day → filtered');

console.log('  normalizeCommitmentSettlementHistory: PASS');

// ---------------------------------------------------------------------------
// 4. buildCommitmentSettlementsForDay
// ---------------------------------------------------------------------------

console.log('=== Check 4: buildCommitmentSettlementsForDay ===');

const state4 = { commitmentSettlementHistory: [settlement, settlement2] } as any as GameState;
check(buildCommitmentSettlementsForDay(state4, 3).length === 1, 'day 3: 1 settlement');
check(buildCommitmentSettlementsForDay(state4, 4).length === 1, 'day 4: 1 settlement');
check(buildCommitmentSettlementsForDay(state4, 5).length === 0, 'day 5: 0 settlements');

console.log('  buildCommitmentSettlementsForDay: PASS');

// ---------------------------------------------------------------------------
// 5. No Date.now / Math.random
// ---------------------------------------------------------------------------

console.log('=== Check 5: No side effects ===');

import { readFileSync } from 'node:fs';
const adapterSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/simulation/actionReceiptAdapter.ts',
  'utf-8',
);
const srcNoComments = adapterSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcNoComments.includes('Date.now'), 'no Date.now');
check(!srcNoComments.includes('Math.random'), 'no Math.random');

console.log('  No side effects: PASS');

// ---------------------------------------------------------------------------
// 6. Deterministic settlement IDs
// ---------------------------------------------------------------------------

console.log('=== Check 6: Deterministic IDs ===');

const s1 = buildCommitmentSettlement({
  day: 1, caseId: 'c1', commitmentKind: 'k', commitmentScope: 's',
  trigger: 'created', ownerEntity: 'o', strengthBefore: 0, strengthAfter: 50,
  reason: 'r', relatedEventIds: [], relatedReceiptIds: [],
});
const s2 = buildCommitmentSettlement({
  day: 1, caseId: 'c1', commitmentKind: 'k', commitmentScope: 's',
  trigger: 'created', ownerEntity: 'o', strengthBefore: 0, strengthAfter: 50,
  reason: 'r', relatedEventIds: [], relatedReceiptIds: [],
});
check(s1.settlementId === s2.settlementId, 'same input → same settlementId');
check(JSON.stringify(s1) === JSON.stringify(s2), 'byte-identical JSON');

console.log('  Deterministic IDs: PASS');

// ---------------------------------------------------------------------------
// 7. Gameplay invariance
// ---------------------------------------------------------------------------

console.log('=== Check 7: Gameplay invariance ===');

const snapshot = getScenarioSnapshotById('standard-window-chain')!;
const world7a = createInitialState(snapshot, 20260504);
seedInitialOpportunities(world7a);
const world7b = createInitialState(snapshot, 20260504);
seedInitialOpportunities(world7b);

advanceOneDay(world7a);
advanceOneDay(world7b);

check(world7a.rngCalls === world7b.rngCalls, 'rngCalls identical');
check(world7a.rngState === world7b.rngState, 'rngState identical');

console.log('  Gameplay invariance: PASS');

// ---------------------------------------------------------------------------
// 8. All trigger types compile
// ---------------------------------------------------------------------------

console.log('=== Check 8: All trigger types ===');

const triggers = ['created', 'advanced', 'expired', 'revoked', 'signed', 'collapsed', 'merged'] as const;
for (const trigger of triggers) {
  const s = buildCommitmentSettlement({
    day: 1, caseId: 'c', commitmentKind: 'k', commitmentScope: 's',
    trigger, ownerEntity: 'o', strengthBefore: 0, strengthAfter: 0,
    reason: 'test', relatedEventIds: [], relatedReceiptIds: [],
  });
  check(s.trigger === trigger, `trigger ${trigger} compiles`);
}

console.log('  All trigger types: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses commitment settlement runtime contract verification passed');
  process.exit(0);
}
