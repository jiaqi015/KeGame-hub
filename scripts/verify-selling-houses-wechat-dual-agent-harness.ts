/**
 * WeChat Dual Agent Harness Verification v2
 *
 * Validates that the wechat conversation / agent memory / LLM boundary
 * stack works end-to-end in pure-rule (no-LLM) mode with correct
 * fallback, memory persistence, and trace discipline.
 *
 * Coverage:
 * 1. Pure rule path: scene pack → fallback proposal → settlement → receipt
 * 2. Memory write + re-select on second turn
 * 3. Fallback safety: null proposal → fallback; delta clamped; invalid nextStep
 * 4. Trace / envelope discipline
 * 5. Dangerous import patterns in core/world-state/agents
 * 6. Input sanitization
 * 7. Core harness is generic (no conversation imports, type params, injectable validator)
 * 8. Generic arbiter works with non-WeChat proposals
 * 9. WeChat delta validation at WeChat layer
 * 10. No simulated LLM (llmAvailable without llmProposal → no fake source:llm)
 * 11. Handler uses dual runtime
 * 12. Trace field completeness
 * 13. Customer scene type
 * 14. Integration: dual runtime → settle turn → receipt
 * 15. Receipt trace persistence + UI source checks
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import type { GameState, Case, Opportunity } from '../src/selling-houses/domain/models.js';
import type { WechatMessage } from '../src/selling-houses/application/projections/myWechatTypes.js';
import type {
  ConversationSceneInputPack,
  ConversationEffectProposal,
  ConversationReceipt,
  ConversationTraceSnapshot,
} from '../src/selling-houses/core/world-state/conversation/models.js';
import type { AgentMemoryFact } from '../src/selling-houses/core/world-state/agents/models.js';

import {
  buildWechatConversationScenePack,
  buildFallbackConversationEffectProposal,
  normalizeConversationEffectProposal,
  settleWechatConversationTurn,
  sanitizeWechatPlayerText,
} from '../src/selling-houses/application/wechatConversation.js';

import {
  selectAgentMemoryFacts,
  mergeAgentMemoryFacts,
  createEmptyAgentMemoryStore,
} from '../src/selling-houses/core/world-state/agents/memoryStore.js';

import {
  buildDisabledFallback,
  isLlmDisabled,
} from '../src/selling-houses/core/llm-boundary/models.js';

import {
  buildDisabledReplayRecord,
  buildReplayRecord,
  buildReplayStoreSummary,
  createReplayStore,
  appendReplayRecord,
  buildWhatIfProposalShell,
  isReplayRecordValid,
  isDisabledReplayRecord,
} from '../src/selling-houses/runtime/llm-support/llmReplaySupport.js';

import {
  buildAgentRuntimePack,
} from '../src/selling-houses/core/world-state/agents/harness.js';

import {
  resolveWechatAgentProfile,
  buildWechatRuntimeAgentId,
  buildWechatLocalReplyVariants,
  buildWechatAgentRuntime,
} from '../src/selling-houses/application/agents/wechatAgentAdapter.js';

import {
  buildAgentProposalEnvelope,
  arbitrateAgentProposals,
  buildAgentArbiterResult,
  buildAgentRunTrace,
} from '../src/selling-houses/core/world-state/agents/proposal.js';

import { buildWechatDualRuntime } from '../src/selling-houses/application/agents/wechatDualRuntime.js';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.error(`  [FAIL] ${message}`);
  }
}

function buildTestState(): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const state = createInitialState(snapshot, 91919);
  seedInitialOpportunities(state);
  updateDerivedState(state);
  return state;
}

function makeMinimalOpportunity(overrides?: Partial<Opportunity>): Opportunity {
  return {
    id: 'opp-1',
    caseId: 'case-1',
    customerId: 'cust-1',
    status: 'active',
    lifecycleStatus: 'active',
    stageIndex: 3,
    stageLabel: '带看中',
    intent: 65,
    confidence: 50,
    visibility: 'visible',
    channel: 'xiaohongshu',
    channelName: '小红书',
    daysLeft: 8,
    createdDay: 2,
    leadSource: 'online' as Opportunity['leadSource'],
    history: [],
    customerName: '张先生',
    fit: 0.8,
    budgetMax: 600,
    priceSensitivity: 0.6,
    stagnationTicks: 0,
    pendingClosingEvaluation: false,
    ...overrides,
  } as Opportunity;
}

function makeWechatMessage(caseId: string, senderName: string, senderRole: WechatMessage['senderRole'] = 'owner'): WechatMessage {
  return {
    id: 'msg-1',
    targetCaseId: caseId,
    senderName,
    senderRole,
    content: `${senderName}：最近客户反馈怎么样？`,
    preview: '最近客户反馈怎么样',
    timeLabel: '14:30',
    urgency: 'medium',
    ...{ senderRole, senderName, targetCaseId: caseId },
  } as WechatMessage;
}

// ---------------------------------------------------------------------------
// Check 1: Pure rule path — scene pack → fallback → settlement → receipt
// ---------------------------------------------------------------------------

console.log('=== Check 1: Pure rule path ===');

const state1 = buildTestState();
const case1 = state1.cases.find((c) => c.status === 'active')!;
const msg1 = makeWechatMessage(case1.id, case1.ownerName, 'owner');
const input1 = { conversationKey: `owner:${case1.ownerName}`, message: msg1, playerText: '这周有客户看过房，反馈还不错，我整理一下同步您。' };

const scene1 = buildWechatConversationScenePack(state1, input1);
check(typeof scene1.sceneId === 'string' && scene1.sceneId.length > 0, 'scene1 has sceneId');
check(scene1.sceneType === 'owner_wechat', `scene1 type = ${scene1.sceneType}, expected owner_wechat`);
check(scene1.caseContext !== undefined, 'scene1 has caseContext');
check(scene1.day > 0, 'scene1 day > 0');

const fallback1 = buildFallbackConversationEffectProposal(scene1);
check(typeof fallback1.summary === 'string' && fallback1.summary.length > 0, 'fallback1 has summary');
check(Array.isArray(fallback1.intentKinds) && fallback1.intentKinds.length > 0, 'fallback1 has intentKinds');
check(typeof fallback1.trustDelta === 'number', 'fallback1 has trustDelta');
check(typeof fallback1.confidence === 'number' && fallback1.confidence >= 0.35 && fallback1.confidence <= 0.95, 'fallback1 confidence in range');
check(fallback1.nextStep !== undefined, 'fallback1 has nextStep');

const result1 = settleWechatConversationTurn(state1, input1);
check(result1.success === true, `turn1 success: ${result1.reason}`);
check(result1.receipt !== null, 'turn1 has receipt');
check(result1.receipt!.source === 'fallback', `turn1 source = ${result1.receipt!.source}`);
check(typeof result1.receipt!.receiptId === 'string', 'turn1 receipt has receiptId');
check(Array.isArray(result1.receipt!.settlement.effectLabels), 'turn1 settlement has effectLabels');
check(typeof result1.receipt!.proposal.trustDelta === 'number', 'turn1 receipt has trustDelta');

// ---------------------------------------------------------------------------
// Check 2: Memory write + re-select on second turn
// ---------------------------------------------------------------------------

console.log('=== Check 2: Memory write + re-select ===');

const state2 = result1.nextState;
const store2 = state2.agentMemoryStore;
check(store2 !== undefined, 'state2 has agentMemoryStore');
check(Array.isArray(store2!.facts) && store2!.facts.length > 0, `state2 has facts: ${store2!.facts.length}`);

const factKinds = store2!.facts.map((f: AgentMemoryFact) => f.kind);
check(factKinds.includes('recent_interaction'), `state2 has recent_interaction: ${factKinds}`);
check(factKinds.includes('relationship_effect'), `state2 has relationship_effect: ${factKinds}`);

const agentId = buildWechatRuntimeAgentId(scene1);
const selected = selectAgentMemoryFacts(store2, {
  agentId: store2!.facts[0]?.agentId,
  conversationKey: `owner:${case1.ownerName}`,
  caseId: case1.id,
  channel: 'wechat',
  day: state1.day,
  limit: 8,
});
check(selected.length > 0, `selected memory facts: ${selected.length}`);

const msg2 = { ...msg1, id: 'msg-2', content: `${case1.ownerName}：价格还能再谈谈吗？` };
const input2 = { conversationKey: `owner:${case1.ownerName}`, message: msg2, playerText: '市场对比我看了，价格上可以再商量，我把同类房数据发您参考。' };
const result2 = settleWechatConversationTurn(state2, input2);
check(result2.success === true, `turn2 success: ${result2.reason}`);

const store3 = result2.nextState.agentMemoryStore;
check(store3!.facts.length >= store2!.facts.length, `memory grew: ${store2!.facts.length} → ${store3!.facts.length}`);

const selected2 = selectAgentMemoryFacts(store3, {
  agentId: store3!.facts[0]?.agentId,
  conversationKey: `owner:${case1.ownerName}`,
  caseId: case1.id,
  channel: 'wechat',
  day: state1.day,
  limit: 16,
});
check(selected2.length > 0, `re-selected memory facts: ${selected2.length}`);

// ---------------------------------------------------------------------------
// Check 3: Fallback safety — null proposal, delta clamp, invalid nextStep
// ---------------------------------------------------------------------------

console.log('=== Check 3: Fallback safety ===');

const state3 = buildTestState();
const case3 = state3.cases.find((c) => c.status === 'active')!;
const msg3 = makeWechatMessage(case3.id, case3.ownerName, 'owner');
const scene3 = buildWechatConversationScenePack(state3, {
  conversationKey: `owner:${case3.ownerName}`,
  message: msg3,
  playerText: '嗯嗯',
});

const normalized3 = normalizeConversationEffectProposal(null, scene3);
check(typeof normalized3.summary === 'string' && normalized3.summary.length > 0, 'null proposal → fallback summary');
check(normalized3.trustDelta >= -5 && normalized3.trustDelta <= 6, `trust delta clamped: ${normalized3.trustDelta}`);
check(normalized3.patienceDelta >= -5 && normalized3.patienceDelta <= 6, `patience delta clamped: ${normalized3.patienceDelta}`);
check(normalized3.urgencyDelta >= -6 && normalized3.urgencyDelta <= 6, `urgency delta clamped: ${normalized3.urgencyDelta}`);

const extremeProposal: ConversationEffectProposal = {
  summary: 'extreme test',
  recipientReply: 'test',
  intentKinds: ['reassure'],
  riskKinds: ['none'],
  evidenceUse: 'none',
  trustDelta: 999,
  patienceDelta: -999,
  urgencyDelta: 999,
  priceFlexibilityDelta: 999,
  customerIntentDelta: 999,
  customerConfidenceDelta: 999,
  nextStep: { kind: 'none', label: 'test', reason: 'test', priority: 'low' },
  confidence: 2.0,
};
const clamped3 = normalizeConversationEffectProposal(extremeProposal, scene3);
check(clamped3.trustDelta <= 6, `extreme trust clamped to ${clamped3.trustDelta}`);
check(clamped3.patienceDelta >= -5, `extreme patience clamped to ${clamped3.patienceDelta}`);
check(clamped3.urgencyDelta <= 6, `extreme urgency clamped to ${clamped3.urgencyDelta}`);
check(clamped3.confidence <= 0.95, `extreme confidence clamped to ${clamped3.confidence}`);

const invalidNextStep: ConversationEffectProposal = {
  summary: 'invalid nextStep test',
  recipientReply: 'test',
  intentKinds: ['reassure'],
  riskKinds: ['none'],
  evidenceUse: 'none',
  nextStep: { kind: 'bogus_kind' as any, label: '', reason: '', priority: 'low' },
  confidence: 0.5,
};
const fixedNextStep = normalizeConversationEffectProposal(invalidNextStep, scene3);
check(fixedNextStep.nextStep !== undefined, 'invalid nextStep normalized to defined');
check(fixedNextStep.nextStep?.kind === 'none' || (fixedNextStep.nextStep?.kind as string) !== 'bogus_kind', `invalid nextStep kind fixed: ${fixedNextStep.nextStep?.kind}`);

const shortResult = settleWechatConversationTurn(buildTestState(), {
  conversationKey: 'test',
  message: makeWechatMessage(case3.id, case3.ownerName, 'owner'),
  playerText: ' ',
});
check(shortResult.success === false, 'short text rejected');
check(shortResult.receipt === null, 'short text no receipt');

// ---------------------------------------------------------------------------
// Check 4: Trace / envelope discipline
// ---------------------------------------------------------------------------

console.log('=== Check 4: Trace / envelope discipline ===');

const receipt4 = result1.receipt!;
check(typeof receipt4.receiptId === 'string', 'receipt has receiptId');
check(typeof receipt4.conversationKey === 'string', 'receipt has conversationKey');
check(typeof receipt4.day === 'number', 'receipt has day');
check(typeof receipt4.sceneType === 'string', 'receipt has sceneType');
check(receipt4.proposal !== undefined, 'receipt has proposal');
check(receipt4.settlement !== undefined, 'receipt has settlement');

const memFacts = state2.agentMemoryStore!.facts;
const factsWithSourceRef = memFacts.filter((f: AgentMemoryFact) => f.sourceRef && f.sourceRef.refType === 'conversation_receipt');
check(factsWithSourceRef.length > 0, `facts with receipt sourceRef: ${factsWithSourceRef.length}`);

memFacts.forEach((fact: AgentMemoryFact, i: number) => {
  check(typeof fact.factId === 'string' && fact.factId.length > 0, `fact[${i}] has factId`);
  check(typeof fact.agentId === 'string' && fact.agentId.length > 0, `fact[${i}] has agentId`);
  check(typeof fact.kind === 'string' && fact.kind.length > 0, `fact[${i}] has kind`);
  check(typeof fact.summary === 'string' && fact.summary.length > 0, `fact[${i}] has summary`);
});

const disabledFallback = buildDisabledFallback('test no-LLM');
const disabledRecord = buildDisabledReplayRecord(disabledFallback);
check(isDisabledReplayRecord(disabledRecord), 'disabled record is recognized');
check(disabledRecord.applied === false, 'disabled record not applied');
check(isLlmDisabled('disabled'), 'disabled mode recognized');

const whatIf = buildWhatIfProposalShell('wi-1', 'case-1', 'price', -5, 'test what-if');
check(whatIf.applyability === 'never_apply_directly', 'what-if never_apply_directly');
check(whatIf.isFallback === false, 'what-if is not fallback');

const store0 = createReplayStore();
check(store0.records.length === 0, 'empty replay store');
const store1r = appendReplayRecord(store0, disabledRecord);
check(store1r.records.length === 1, 'replay store has 1 record');
check(store0.records.length === 0, 'original store unchanged (immutable)');

const summary = buildReplayStoreSummary(store1r);
check(summary.totalRecords === 1, `summary totalRecords = ${summary.totalRecords}`);
check(summary.disabledRecords === 1, `summary disabledRecords = ${summary.disabledRecords}`);

const scenePack = buildWechatConversationScenePack(state1, input1);
const runtime = buildWechatAgentRuntime(scenePack);
check(typeof runtime.profile.agentId === 'string', 'runtime has agentId');
check(runtime.perception.channel === 'wechat', 'runtime channel = wechat');
check(runtime.promptLines.length > 0, 'runtime has promptLines');

const profile4 = resolveWechatAgentProfile(scenePack);
check(typeof profile4.agentId === 'string', 'profile has agentId');
check(typeof profile4.roleLabel === 'string', 'profile has roleLabel');
check(Array.isArray(profile4.goals), 'profile has goals');

const variants = buildWechatLocalReplyVariants(scenePack);
check(typeof variants.positive === 'string', 'variants has positive');
check(typeof variants.neutral === 'string', 'variants has neutral');
check(typeof variants.skeptical === 'string', 'variants has skeptical');

// ---------------------------------------------------------------------------
// Check 5: Dangerous import patterns in core
// ---------------------------------------------------------------------------

console.log('=== Check 5: Dangerous import patterns ===');

const ROOT = join(import.meta.dirname, '..');
const agentsDir = join(ROOT, 'src/selling-houses/core/world-state/agents');
const llmBoundaryDir = join(ROOT, 'src/selling-houses/core/llm-boundary');

function scanForDangerousImports(dir: string, label: string) {
  const forbiddenPatterns = [
    /from\s+['"]..\/..\/domain/,
    /from\s+['"]..\/..\/application/,
    /from\s+['"]..\/..\/runtime/,
    /from\s+['"]..\/..\/ui/,
    /fetch\s*\(/,
    /import\s+.*openai/i,
    /from\s+['"].*conversation/,
    /performance\.now\(\)/,
    /Date\.now\(\)/,
    /Math\.random\(\)/,
  ];
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
  for (const file of files) {
    const src = readFileSync(join(dir, file), 'utf-8');
    const stripped = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const pattern of forbiddenPatterns) {
      const match = stripped.match(pattern);
      check(!match, `${label}/${file}: no forbidden import (matched ${match?.[0]})`);
    }
  }
}

scanForDangerousImports(agentsDir, 'core/world-state/agents');
scanForDangerousImports(llmBoundaryDir, 'core/llm-boundary');

// Edge case: no matching case still succeeds
const edgeCaseState = buildTestState();
edgeCaseState.cases = [];
const edgeCaseResult = settleWechatConversationTurn(edgeCaseState, {
  conversationKey: 'test',
  message: makeWechatMessage('nonexistent', '测试', 'owner'),
  playerText: '正常回复内容',
});
check(edgeCaseResult.success === true, `edge case (no matching case) still succeeds: ${edgeCaseResult.reason}`);
check(edgeCaseResult.receipt !== null, 'edge case still produces receipt');

// ---------------------------------------------------------------------------
// Check 6: Input sanitization
// ---------------------------------------------------------------------------

console.log('=== Check 6: Input sanitization ===');

check(sanitizeWechatPlayerText('  hello   world  ') === 'hello world', 'whitespace collapsed');
check(sanitizeWechatPlayerText('a'.repeat(300)).length <= 220, 'text truncated to 220');
check(sanitizeWechatPlayerText('') === '', 'empty text stays empty');

// ---------------------------------------------------------------------------
// Check 7: Core harness is generic — no conversation imports, type params, injectable validator
// ---------------------------------------------------------------------------

console.log('=== Check 7: Core harness is generic ===');

// 7a. Core proposal.ts does NOT import conversation types
const proposalSrc = readFileSync(join(agentsDir, 'proposal.ts'), 'utf-8');
const proposalCode = proposalSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!proposalCode.includes('ConversationEffectProposal'), 'core proposal.ts does not import ConversationEffectProposal');
check(!proposalCode.includes('ConversationSceneInputPack'), 'core proposal.ts does not import ConversationSceneInputPack');
check(!/from\s+['"].*conversation\//.test(proposalCode), 'core proposal.ts does not import from conversation/');

// 7b. Generic type params — arbiter works with non-WeChat proposals
interface OpenDayProposal {
  visitorCount: number;
  satisfactionScore: number;
  recommendation: string;
}

const openDayRule = buildAgentProposalEnvelope<OpenDayProposal>({
  proposalId: 'rule:openday-1',
  agentId: 'openday:agent-1',
  channel: 'open_day',
  mode: 'rule',
  source: 'rule',
  confidence: 0.60,
  proposal: { visitorCount: 20, satisfactionScore: 0.7, recommendation: 'continue' },
});
const openDayLlm = buildAgentProposalEnvelope<OpenDayProposal>({
  proposalId: 'llm:openday-1',
  agentId: 'openday:agent-1',
  channel: 'open_day',
  mode: 'hybrid',
  source: 'llm',
  confidence: 0.85,
  proposal: { visitorCount: 25, satisfactionScore: 0.8, recommendation: 'increase_promotion' },
});

const openDayArbiter = arbitrateAgentProposals<OpenDayProposal>({
  ruleProposal: openDayRule,
  llmProposal: openDayLlm,
});
check(openDayArbiter.acceptedSource === 'llm', 'generic arbiter selects LLM for open-day proposal');
check(openDayArbiter.finalProposal.visitorCount === 25, 'generic arbiter returns correct proposal data');

// 7c. Injectable validator with non-WeChat proposal
const openDayValidator = (proposal: OpenDayProposal) => {
  if (proposal.satisfactionScore < 0) {
    return { ok: false as const, reason: 'satisfaction cannot be negative', bounded: true };
  }
  return { ok: true as const };
};

const badOpenDayLlm = buildAgentProposalEnvelope<OpenDayProposal>({
  proposalId: 'llm:openday-bad',
  agentId: 'openday:agent-1',
  channel: 'open_day',
  mode: 'hybrid',
  source: 'llm',
  confidence: 0.90,
  proposal: { visitorCount: 100, satisfactionScore: -0.5, recommendation: 'stop' },
});
const validatedArbiter = arbitrateAgentProposals<OpenDayProposal>({
  ruleProposal: openDayRule,
  llmProposal: badOpenDayLlm,
  validateLlmProposal: openDayValidator,
});
check(validatedArbiter.acceptedSource === 'rule', 'injectable validator rejects bad LLM proposal');
check(
  validatedArbiter.rejectedReasons.includes('llm_proposal_validation_failed'),
  `validator rejection reason: ${validatedArbiter.rejectedReasons}`,
);

// 7d. Rule-only mode selects rule
const ruleOnlyArbiter = arbitrateAgentProposals<OpenDayProposal>({
  ruleProposal: openDayRule,
  llmProposal: null,
});
check(ruleOnlyArbiter.acceptedSource === 'rule', 'rule-only generic arbiter selects rule');
check(ruleOnlyArbiter.bounded === true, 'rule-only generic arbiter is bounded');

// 7e. Arbiter is pure: same inputs → same outputs
const arbiterA = arbitrateAgentProposals({ ruleProposal: openDayRule, llmProposal: null });
const arbiterB = arbitrateAgentProposals({ ruleProposal: openDayRule, llmProposal: null });
check(arbiterA.acceptedSource === arbiterB.acceptedSource, 'arbiter is pure (acceptedSource)');
check(arbiterA.reason === arbiterB.reason, 'arbiter is pure (reason)');

// ---------------------------------------------------------------------------
// Check 8: WeChat delta validation at WeChat layer
// ---------------------------------------------------------------------------

console.log('=== Check 8: WeChat delta validation ===');

const ruleEnvelope = buildAgentProposalEnvelope<ConversationEffectProposal>({
  proposalId: 'rule:verify-1',
  agentId: 'wechat:owner-test',
  channel: 'wechat',
  mode: 'rule',
  source: 'rule',
  confidence: 0.72,
  proposal: fallback1,
  evidenceRefs: ['scene-pack-1'],
  memoryRefs: ['mem-fact-1'],
});

// 8a. LLM with confidence > rule → LLM selected (normal deltas)
const normalLlm = buildAgentProposalEnvelope<ConversationEffectProposal>({
  proposalId: 'llm:verify-1',
  agentId: 'wechat:owner-test',
  channel: 'wechat',
  mode: 'hybrid',
  source: 'llm',
  confidence: 0.88,
  proposal: { ...fallback1, confidence: 0.88, recipientReply: 'AI生成的回复' },
});
const normalArbiter = arbitrateAgentProposals<ConversationEffectProposal>({
  ruleProposal: ruleEnvelope,
  llmProposal: normalLlm,
});
check(normalArbiter.acceptedSource === 'llm', 'normal LLM selected when confidence higher');

// 8b. LLM with out-of-bounds deltas → rule fallback (via dual runtime's validator)
const riskyLlm = buildAgentProposalEnvelope<ConversationEffectProposal>({
  proposalId: 'llm:risky-1',
  agentId: 'wechat:owner-test',
  channel: 'wechat',
  mode: 'hybrid',
  source: 'llm',
  confidence: 0.90,
  proposal: { ...fallback1, trustDelta: 25, patienceDelta: 30, confidence: 0.90 },
});
const riskyArbiter = arbitrateAgentProposals<ConversationEffectProposal>({
  ruleProposal: ruleEnvelope,
  llmProposal: riskyLlm,
});
// Without the WeChat validator, the arbiter won't catch delta bounds
// (the validator is only injected in wechatDualRuntime, not in the raw arbiter call)
// So we verify the dual runtime catches it instead
const dualRisky = buildWechatDualRuntime(scene1, { llmProposal: { ...fallback1, trustDelta: 25, patienceDelta: 30, confidence: 0.90 } });
check(dualRisky.arbiterResult.acceptedSource === 'rule', 'dual runtime rejects out-of-bounds LLM deltas');
check(
  dualRisky.arbiterResult.rejectedReasons.includes('llm_proposal_validation_failed'),
  `dual runtime delta validation rejection: ${dualRisky.arbiterResult.rejectedReasons}`,
);

// 8c. LLM with low confidence → rule fallback
const lowConfLlm = buildAgentProposalEnvelope<ConversationEffectProposal>({
  proposalId: 'llm:low-1',
  agentId: 'wechat:owner-test',
  channel: 'wechat',
  mode: 'hybrid',
  source: 'llm',
  confidence: 0.35,
  proposal: { ...fallback1, confidence: 0.35 },
});
const lowConfArbiter = arbitrateAgentProposals<ConversationEffectProposal>({
  ruleProposal: ruleEnvelope,
  llmProposal: lowConfLlm,
});
check(lowConfArbiter.acceptedSource === 'rule', 'low confidence LLM falls back to rule');
check(
  lowConfArbiter.rejectedReasons.includes('llm_confidence_below_threshold'),
  `low conf rejection reason: ${lowConfArbiter.rejectedReasons}`,
);

// 8d. AgentRunTrace builder with full fields
const trace = buildAgentRunTrace({
  traceId: 'trace:test-1',
  agentId: 'wechat:owner-test',
  channel: 'wechat',
  day: 5,
  visibleRefs: ['msg-1', 'case-1'],
  memoryFactIds: ['fact-1', 'fact-2'],
  pressure: ['业主催促感偏强'],
  uncertainty: ['首次面访未完成'],
  ruleSource: 'rule',
  llmSource: null,
  arbiterDecision: 'rule-only mode',
  acceptedSource: 'rule',
  ruleConfidence: 0.72,
  llmConfidence: null,
  durationUs: 150,
  validationNotes: [],
});
check(trace.traceId === 'trace:test-1', 'trace has traceId');
check(trace.agentId === 'wechat:owner-test', 'trace has agentId');
check(trace.day === 5, 'trace has day');
check(trace.visibleRefs.length === 2, 'trace has visibleRefs');
check(trace.memoryFactIds.length === 2, 'trace has memoryFactIds');
check(trace.pressure.length === 1, 'trace has pressure');
check(trace.uncertainty.length === 1, 'trace has uncertainty');
check(trace.ruleSource === 'rule', 'trace has ruleSource');
check(trace.llmSource === null, 'trace has llmSource (null)');
check(trace.arbiterDecision === 'rule-only mode', 'trace has arbiterDecision');
check(trace.acceptedSource === 'rule', 'trace has acceptedSource');
check(trace.ruleConfidence === 0.72, 'trace has ruleConfidence');
check(trace.llmConfidence === null, 'trace has llmConfidence (null)');
check(trace.durationUs === 150, 'trace has durationUs');
check(trace.validationNotes.length === 0, 'trace has validationNotes');

// 8e. AgentArbiterResult builder
const arbiterResult = buildAgentArbiterResult({
  acceptedSource: 'rule',
  finalProposal: fallback1,
  reason: 'rule-only',
  bounded: true,
  rejectedReasons: [],
});
check(arbiterResult.acceptedSource === 'rule', 'arbiter result acceptedSource = rule');
check(arbiterResult.bounded === true, 'arbiter result bounded = true');

// ---------------------------------------------------------------------------
// Check 9: No simulated LLM
// ---------------------------------------------------------------------------

console.log('=== Check 9: No simulated LLM ===');

// 9a. When no llmProposal provided, dual runtime has no LLM envelope
const dualNoLlm = buildWechatDualRuntime(scene1);
check(dualNoLlm.llmProposal === null, 'no llmProposal → no LLM envelope');
check(dualNoLlm.arbiterResult.acceptedSource !== 'llm', 'no llmProposal → arbiter never selects llm');

// 9b. When llmError is set, dual runtime has no LLM envelope even if llmProposal provided
const dualError = buildWechatDualRuntime(scene1, { llmProposal: fallback1, llmError: 'timeout' });
check(dualError.llmProposal === null, 'llmError with llmProposal → no LLM envelope');
check(dualError.arbiterResult.acceptedSource === 'rule', 'llmError → arbiter selects rule');
check(
  dualError.arbiterResult.rejectedReasons.includes('llm_error'),
  `llmError rejection: ${dualError.arbiterResult.rejectedReasons}`,
);

// 9c. Only a real llmProposal without error creates an LLM envelope
const dualWithLlm = buildWechatDualRuntime(scene1, { llmProposal: { ...fallback1, confidence: 0.88, recipientReply: '好的回复' } });
check(dualWithLlm.llmProposal !== null, 'real llmProposal → LLM envelope exists');
check(dualWithLlm.llmProposal!.source === 'llm', 'real llmProposal → source = llm');

// 9d. The dual runtime module does NOT contain buildLlmSimulationProposal
const dualRuntimeSrc = readFileSync(join(ROOT, 'src/selling-houses/application/agents/wechatDualRuntime.ts'), 'utf-8');
const dualRuntimeCode = dualRuntimeSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!dualRuntimeCode.includes('buildLlmSimulationProposal'), 'no simulated LLM function in dual runtime');
check(!/performance\.now\s*\(/.test(dualRuntimeCode), 'no performance.now() call in dual runtime');
check(!/Date\.now\s*\(/.test(dualRuntimeCode), 'no Date.now() call in dual runtime');

// ---------------------------------------------------------------------------
// Check 10: Handler uses dual runtime
// ---------------------------------------------------------------------------

console.log('=== Check 10: Handler uses dual runtime ===');

const handlerSrc = readFileSync(join(ROOT, 'src/selling-houses/interfaces/http/myWechatConversationHandlers.ts'), 'utf-8');

// 10a. Handler imports buildWechatDualRuntime
check(handlerSrc.includes('buildWechatDualRuntime'), 'handler imports buildWechatDualRuntime');

// 10b. Handler calls buildWechatDualRuntime in the success path
check(
  handlerSrc.includes('buildWechatDualRuntime(scene, { llmProposal'),
  'handler calls buildWechatDualRuntime with llmProposal in success path',
);

// 10c. Handler calls buildWechatDualRuntime in the error path
check(
  handlerSrc.includes('buildWechatDualRuntime(scene, {') && handlerSrc.includes('llmError'),
  'handler calls buildWechatDualRuntime with llmError in error path',
);

// 10d. Handler returns arbiter finalProposal
check(
  handlerSrc.includes('dual.arbiterResult.finalProposal'),
  'handler returns dual.arbiterResult.finalProposal',
);

// 10e. Handler returns trace and arbiterResult
check(
  handlerSrc.includes('trace: dual.trace'),
  'handler returns dual.trace',
);
check(
  handlerSrc.includes('arbiterResult: dual.arbiterResult'),
  'handler returns dual.arbiterResult',
);

// 10f. Handler maps acceptedSource to response source correctly
check(
  handlerSrc.includes("acceptedSource === 'llm' ? 'ai' : 'fallback'"),
  'handler maps llm → ai, rule/fallback → fallback',
);

// ---------------------------------------------------------------------------
// Check 11: Trace field completeness in dual runtime
// ---------------------------------------------------------------------------

console.log('=== Check 11: Trace field completeness ===');

const dualTrace = buildWechatDualRuntime(scene1, {
  llmProposal: { ...fallback1, confidence: 0.88 },
  durationUs: 500,
});

// 11a. All required trace fields are present
check(typeof dualTrace.trace.traceId === 'string' && dualTrace.trace.traceId.length > 0, 'trace has traceId');
check(typeof dualTrace.trace.agentId === 'string' && dualTrace.trace.agentId.length > 0, 'trace has agentId');
check(dualTrace.trace.channel === 'wechat', 'trace channel = wechat');
check(typeof dualTrace.trace.day === 'number', 'trace has day');
check(Array.isArray(dualTrace.trace.visibleRefs), 'trace has visibleRefs');
check(Array.isArray(dualTrace.trace.memoryFactIds), 'trace has memoryFactIds');
check(Array.isArray(dualTrace.trace.pressure), 'trace has pressure');
check(Array.isArray(dualTrace.trace.uncertainty), 'trace has uncertainty');
check(typeof dualTrace.trace.ruleSource === 'string', 'trace has ruleSource');
check(dualTrace.trace.llmSource === 'llm' || dualTrace.trace.llmSource === null, 'trace has llmSource');
check(typeof dualTrace.trace.arbiterDecision === 'string', 'trace has arbiterDecision');
check(typeof dualTrace.trace.acceptedSource === 'string', 'trace has acceptedSource');
check(typeof dualTrace.trace.ruleConfidence === 'number', 'trace has ruleConfidence');
check(typeof dualTrace.trace.llmConfidence === 'number' || dualTrace.trace.llmConfidence === null, 'trace has llmConfidence');
check(typeof dualTrace.trace.durationUs === 'number' || dualTrace.trace.durationUs === null, 'trace has durationUs');
check(Array.isArray(dualTrace.trace.validationNotes), 'trace has validationNotes');

// 11b. Duration is passed through from options
check(dualTrace.trace.durationUs === 500, `trace durationUs = ${dualTrace.trace.durationUs}, expected 500`);

// 11c. Rule-only trace: llmConfidence is null
const dualRuleOnlyTrace = buildWechatDualRuntime(scene1);
check(dualRuleOnlyTrace.trace.llmConfidence === null, 'rule-only trace has llmConfidence = null');
check(dualRuleOnlyTrace.trace.llmSource === null, 'rule-only trace has llmSource = null');

// ---------------------------------------------------------------------------
// Check 12: Customer scene type
// ---------------------------------------------------------------------------

console.log('=== Check 12: Customer scene type ===');

const opp7 = state1.opportunities.find((o) => o.status === 'active');
const cust7 = opp7 ? state1.customers.find((c) => c.id === opp7.customerId) : null;
check(!!opp7, 'has active opportunity for customer check');
const state7 = buildTestState();
const msg7 = makeWechatMessage(opp7?.caseId || '', cust7?.name || '客户', 'customer');
const input7 = { conversationKey: `customer:${cust7?.name || '客户'}`, message: msg7, playerText: '这周末可以安排看房，我帮您确认时间。' };
const scene7 = buildWechatConversationScenePack(state7, input7);
check(scene7.sceneType === 'customer_wechat', `scene7 type = ${scene7.sceneType}, expected customer_wechat`);

const fallback7 = buildFallbackConversationEffectProposal(scene7);
check(fallback7.intentKinds.includes('follow_customer'), `customer scene has follow_customer intent`);

const result7 = settleWechatConversationTurn(state7, input7);
check(result7.success === true, `customer turn success: ${result7.reason}`);

// ---------------------------------------------------------------------------
// Check 13: Integration — dual runtime → settle turn → receipt with trace
// ---------------------------------------------------------------------------

console.log('=== Check 13: Integration (dual runtime → settle turn) ===');

const state13 = buildTestState();
const case13 = state13.cases.find((c) => c.status === 'active')!;
const msg13 = makeWechatMessage(case13.id, case13.ownerName, 'owner');
const dualInput13 = { conversationKey: `owner:${case13.ownerName}`, message: msg13, playerText: '我下午把客户反馈和竞品对比给您讲清楚。' };
const scene13 = buildWechatConversationScenePack(state13, dualInput13);
const dual13 = buildWechatDualRuntime(scene13, { llmProposal: { ...fallback1, confidence: 0.88, recipientReply: '好的，你整理了给我看。' }, durationUs: 800 });

// 13a. Settle turn with dual runtime proposal + trace
const turn13 = settleWechatConversationTurn(state13, {
  conversationKey: `owner:${case13.ownerName}`,
  message: msg13,
  playerText: scene13.playerText,
  proposal: dual13.arbiterResult.finalProposal,
  proposalSource: dual13.arbiterResult.acceptedSource === 'llm' ? 'ai' : 'fallback',
  trace: dual13.trace,
  arbiterResult: dual13.arbiterResult,
});
check(turn13.success === true, `dual settle turn succeeds: ${turn13.reason}`);
check(turn13.receipt !== null, 'dual settle turn has receipt');

// 13b. Trace and arbiterResult pass through
check(turn13.trace !== undefined, 'turn result has trace');
check(turn13.arbiterResult !== undefined, 'turn result has arbiterResult');

// 13c. Game state updated
check(
  (turn13.nextState.wechatConversationHistory?.length || 0) > 0,
  'conversation history updated after dual settle',
);

// 13d. Agent memory updated
check(
  (turn13.nextState.agentMemoryStore?.facts.length || 0) > 0,
  'agent memory updated after dual settle',
);

// 13e. No raw GameState in LLM context
if (dual13.llmProposal) {
  const proposalStr = JSON.stringify(dual13.llmProposal);
  check(
    !proposalStr.includes('runtimeCaseHeatStates') && !proposalStr.includes('runtimeOwnerCaseReadinessStates'),
    'no raw GameState in LLM proposal',
  );
}

// ---------------------------------------------------------------------------
// Check 15: Receipt trace persistence + UI source checks
// ---------------------------------------------------------------------------

console.log('=== Check 15: Receipt trace persistence + UI source ===');

// 15a. ConversationReceipt type includes optional traceSnapshot
const modelsSrc15 = readFileSync(join(ROOT, 'src/selling-houses/core/world-state/conversation/models.ts'), 'utf-8');
check(modelsSrc15.includes('ConversationTraceSnapshot'), 'ConversationTraceSnapshot type defined');
check(modelsSrc15.includes('traceSnapshot?'), 'ConversationReceipt has optional traceSnapshot');

// 15b. Receipt with trace input → traceSnapshot populated
const state15 = buildTestState();
const case15 = state15.cases.find((c) => c.status === 'active')!;
const msg15 = makeWechatMessage(case15.id, case15.ownerName, 'owner');
const scene15 = buildWechatConversationScenePack(state15, {
  conversationKey: `owner:${case15.ownerName}`,
  message: msg15,
  playerText: '我来安排面访，把最新市场数据带给您参考。',
});
const dual15 = buildWechatDualRuntime(scene15, { llmProposal: { ...fallback1, confidence: 0.88 }, durationUs: 600 });

const turn15 = settleWechatConversationTurn(state15, {
  conversationKey: `owner:${case15.ownerName}`,
  message: msg15,
  playerText: scene15.playerText,
  proposal: dual15.arbiterResult.finalProposal,
  proposalSource: dual15.arbiterResult.acceptedSource === 'llm' ? 'ai' : 'fallback',
  trace: dual15.trace,
  arbiterResult: dual15.arbiterResult,
});
check(turn15.receipt !== null, 'turn15 has receipt');
check(turn15.receipt!.traceSnapshot !== undefined, 'receipt with trace input has traceSnapshot');
const snap15 = turn15.receipt!.traceSnapshot as ConversationTraceSnapshot;
check(typeof snap15.acceptedSource === 'string', 'traceSnapshot has acceptedSource');
check(typeof snap15.ruleConfidence === 'number', 'traceSnapshot has ruleConfidence');
check(snap15.llmConfidence === null || typeof snap15.llmConfidence === 'number', 'traceSnapshot has llmConfidence');
check(typeof snap15.memoryFactCount === 'number', 'traceSnapshot has memoryFactCount');
check(typeof snap15.contextSignalCount === 'number', 'traceSnapshot has contextSignalCount');
check(Array.isArray(snap15.pressure), 'traceSnapshot has pressure');
check(Array.isArray(snap15.uncertainty), 'traceSnapshot has uncertainty');
check(Array.isArray(snap15.validationNotes), 'traceSnapshot has validationNotes');
check(Array.isArray(snap15.rejectedReasons), 'traceSnapshot has rejectedReasons');
check(typeof snap15.arbiterDecision === 'string', 'traceSnapshot has arbiterDecision');

// 15c. Receipt without trace → traceSnapshot is a fallback trace (not undefined)
// Old saved receipts with traceSnapshot:undefined still load fine via the ? optional field.
// But NEW receipts always produce a trace for observability.
const turn15b = settleWechatConversationTurn(buildTestState(), {
  conversationKey: 'test',
  message: makeWechatMessage(case15.id, case15.ownerName, 'owner'),
  playerText: '正常回复内容',
});
check(turn15b.receipt !== null, 'turn15b has receipt');
check(turn15b.receipt!.traceSnapshot !== undefined, 'receipt without trace still has fallback traceSnapshot');
check(turn15b.receipt!.traceSnapshot!.acceptedSource === 'fallback', 'fallback traceSnapshot acceptedSource is fallback');
check(turn15b.receipt!.traceSnapshot!.arbiterDecision === 'no_agent_trace_available', 'fallback traceSnapshot records no_agent_trace_available');

// 15d. useGame handler returns trace + arbiterResult
const useGameSrc = readFileSync(join(ROOT, 'src/selling-houses/application/useGame.ts'), 'utf-8');
const useGameCode = useGameSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(useGameCode.includes('trace: result.trace'), 'useGame handler returns trace');
check(useGameCode.includes('arbiterResult: result.arbiterResult'), 'useGame handler returns arbiterResult');

// 15e. MyWechatPanel source: trace panel with required fields
const panelSrc = readFileSync(join(ROOT, 'src/selling-houses/ui/features/MyWechatPanel.tsx'), 'utf-8');
const panelCode = panelSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(panelCode.includes('AgentTraceDetail'), 'MyWechatPanel has AgentTraceDetail component');
check(panelCode.includes('acceptedSource'), 'MyWechatPanel shows acceptedSource');
check(panelCode.includes('ruleConfidence'), 'MyWechatPanel shows ruleConfidence');
check(panelCode.includes('llmConfidence'), 'MyWechatPanel shows llmConfidence');
check(panelCode.includes('memoryFactCount') || panelCode.includes('memoryFactIds'), 'MyWechatPanel shows memory fact count');
check(panelCode.includes('contextSignalCount') || panelCode.includes('visibleRefs'), 'MyWechatPanel shows context signal count');
check(panelCode.includes('validationNotes'), 'MyWechatPanel shows validationNotes');
check(panelCode.includes('rejectedReasons'), 'MyWechatPanel shows rejectedReasons');
check(panelCode.includes('arbiterDecision'), 'MyWechatPanel shows arbiterDecision');
check(panelCode.includes('本次采用') || panelCode.includes('查看判断'), 'MyWechatPanel has trace summary/expand labels');

// 15f. MyWechatPanel Enter/Shift+Enter
check(panelCode.includes("event.key !== 'Enter'") || panelCode.includes("event.key===\"Enter\""), 'MyWechatPanel handles Enter key');
check(panelCode.includes('event.shiftKey') || panelCode.includes('shiftKey'), 'MyWechatPanel handles Shift+Enter');

// 15g. MyWechatPanel scroll
check(panelCode.includes('scrollTo') || panelCode.includes('scrollTop'), 'MyWechatPanel has scroll-to-bottom');

// 15h. MyWechatPanel fallback hint
check(panelCode.includes('fallbackHint'), 'MyWechatPanel has fallbackHint for slow response');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== WeChat Dual Agent Harness Verification ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  console.error('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nRESULT: PASS');
}
