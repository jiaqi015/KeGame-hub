/**
 * Action Feedback Humanity Benchmark
 *
 * Validates that action feedback replies sound like real character speech
 * (owner, customer, market) rather than system evaluations or UI label copies.
 *
 * Benchmark dimensions:
 * 1. No UI option title copying
 * 2. No evaluation tone ("评语腔")
 * 3. Must sound like the character speaking
 * 4. Must respond to selected strategies but translate to real concerns
 * 5. LLM-first should not be broken (good LLM accepted, bad LLM fallback)
 *
 * Usage: npx tsx scripts/verify-selling-houses-action-feedback-humanity-benchmark.ts
 */

import assert from 'node:assert/strict';
import {
  buildFallbackActionFeedbackProposal,
  normalizeActionFeedbackProposal,
  type ActionFeedbackRequest,
  type ActionFeedbackProposal,
} from '../src/selling-houses/application/actionDecisionAdvice.js';

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

function checkNoMatch(text: string, pattern: RegExp, dimension: string) {
  const match = text.match(pattern);
  check(!match, `${dimension}: should not match "${pattern}" but found "${match?.[0]}" in "${text.slice(0, 80)}..."`);
}

function checkHasMatch(text: string, pattern: RegExp, dimension: string) {
  const match = text.match(pattern);
  check(!!match, `${dimension}: should match "${pattern}" in "${text.slice(0, 80)}..."`);
}

// ---------------------------------------------------------------------------
// Case builders
// ---------------------------------------------------------------------------

function buildWeeklyFeedbackOwnerPositiveRequest(): ActionFeedbackRequest {
  return {
    actionId: 'weekly-feedback',
    title: '江悦府 128㎡ 三房 · 周度反馈',
    summary: '把这一周带看、客户反馈和价格风险同步给业主。',
    body: '业主想知道这周有没有实质进展，也担心价格风险没有被讲透。',
    actorLabel: '业主',
    currentRound: 1,
    totalRounds: 2,
    contextBullets: [
      '本周带看 3 组，1 组有意向但未出价。',
      '同小区近期有 1 套成交，价格低于挂牌 5%。',
    ],
    round: {
      title: '周度反馈',
      description: '这一轮要让业主相信你不是泛泛汇报。',
      mainStrategies: [
        { id: 'progress', title: '突出本周进展', note: '说明带看和客户反馈的真实变化。' },
        { id: 'risk', title: '坦诚讲风险', note: '把价格差距和竞品分流说清。' },
      ],
      assistStrategies: [
        { id: 'direct-risk', title: '坦诚讲风险', note: '风险直接说，不做空泛安抚。' },
      ],
    },
    choice: {
      mainStrategyIds: ['progress', 'risk'],
      assistStrategyId: 'direct-risk',
      baseFeedbackMessage: '"听起来这周还不错，继续保持。"',
      actor: 'owner',
      mood: 'positive',
    },
    caseContext: {
      title: '江悦府 128㎡ 三房',
      ownerName: '王经理',
      district: '浦东',
      community: '江悦府',
      askPrice: 930,
      marketPrice: 921,
      trust: 57,
      patience: 44,
      urgency: 66,
      heat: 63,
      stageLabel: '周度反馈',
    },
  };
}

function buildFirstVisitOwnerAnxiousRequest(): ActionFeedbackRequest {
  return {
    actionId: 'first-visit',
    title: '瑞和里 89㎡ 两房 · 首次面访',
    summary: '首次上门面访，业主催促明确方案。',
    body: '业主换房期限逼近，希望今天见面就能说清楚价格和客户。',
    actorLabel: '业主',
    currentRound: 1,
    totalRounds: 1,
    contextBullets: [
      '业主换房链催得很紧。',
      '挂牌价高于市场价 4%。',
    ],
    round: {
      title: '首次面访',
      description: '业主需要明确方案，不想再听空泛安抚。',
      mainStrategies: [
        { id: 'present-evidence', title: '展示市场数据', note: '用同小区成交和竞品差异说服业主。' },
        { id: 'discuss-price', title: '讨论价格策略', note: '把价格差距和调整空间摊开。' },
      ],
      assistStrategies: [
        { id: 'direct', title: '直接说', note: '不绕弯子，把真实情况摆出来。' },
      ],
    },
    choice: {
      mainStrategyIds: ['present-evidence'],
      assistStrategyId: 'direct',
      baseFeedbackMessage: '"你别跟我绕，我就想知道今天见面能不能说清楚价格和客户。"',
      actor: 'owner',
      mood: 'negative',
    },
    caseContext: {
      title: '瑞和里 89㎡ 两房',
      ownerName: '周女士',
      district: '浦东',
      community: '瑞和里',
      askPrice: 828,
      marketPrice: 795,
      trust: 42,
      patience: 28,
      urgency: 78,
      heat: 55,
      stageLabel: '首次面访',
    },
  };
}

function buildShowingCustomerRequest(): ActionFeedbackRequest {
  return {
    actionId: 'showing',
    title: '嘉悦府 71㎡ 一房 · 带看',
    summary: '带客户看房，客户关注价格和房况。',
    body: '客户在比较同类房，需要确认房况和价格差异。',
    actorLabel: '客户',
    currentRound: 1,
    totalRounds: 1,
    contextBullets: [
      '客户已看过 2 套同类房。',
      '客户关注装修和总价。',
    ],
    round: {
      title: '带看反馈',
      description: '客户会把这套房和同类房放在一起比。',
      mainStrategies: [
        { id: 'highlight-condition', title: '强调房况优势', note: '把装修和户型优势说清。' },
        { id: 'compare-price', title: '价格对比', note: '用同类房价格说明性价比。' },
      ],
      assistStrategies: [
        { id: 'patient', title: '耐心引导', note: '不催客户，留比较空间。' },
      ],
    },
    choice: {
      mainStrategyIds: ['highlight-condition'],
      assistStrategyId: 'patient',
      baseFeedbackMessage: '"房子还行，但我再看看。"',
      actor: 'customer',
      mood: 'neutral',
    },
    caseContext: {
      title: '嘉悦府 71㎡ 一房',
      ownerName: '梁先生',
      district: '静安',
      community: '嘉悦府',
      askPrice: 632,
      marketPrice: 618,
      trust: 55,
      patience: 40,
      urgency: 65,
      heat: 62,
      stageLabel: '带看中',
    },
  };
}

function buildMarketActorRequest(): ActionFeedbackRequest {
  return {
    actionId: 'open-day',
    title: '万航小区 63㎡ 一房 · 开放日',
    summary: '开放日后市场反馈。',
    body: '开放日结束后，需要汇总市场信号。',
    actorLabel: '市场',
    currentRound: 1,
    totalRounds: 1,
    contextBullets: [
      '开放日到场 5 组客户。',
      '2 组有意向但未出价。',
    ],
    round: {
      title: '市场反馈',
      description: '开放日后的市场信号汇总。',
      mainStrategies: [
        { id: 'summarize-signal', title: '汇总市场信号', note: '把到场客户和竞品变化说清。' },
      ],
      assistStrategies: [
        { id: 'objective', title: '客观呈现', note: '不夸大不缩小。' },
      ],
    },
    choice: {
      mainStrategyIds: ['summarize-signal'],
      assistStrategyId: 'objective',
      baseFeedbackMessage: '"有几组客户来看了。"',
      actor: 'market',
      mood: 'neutral',
    },
    caseContext: {
      title: '万航小区 63㎡ 一房',
      ownerName: '张阿姨',
      district: '静安',
      community: '万航小区',
      askPrice: 606,
      marketPrice: 590,
      trust: 60,
      patience: 50,
      urgency: 55,
      heat: 58,
      stageLabel: '开放日后',
    },
  };
}

// ---------------------------------------------------------------------------
// Dimension 1: No UI option title copying
// ---------------------------------------------------------------------------

console.log('\n=== Dimension 1: No UI option title copying ===');

const case1 = buildWeeklyFeedbackOwnerPositiveRequest();
const fallback1 = buildFallbackActionFeedbackProposal(case1);

checkNoMatch(fallback1.message, /突出本周进展/, 'D1: fallback should not copy "突出本周进展"');
checkNoMatch(fallback1.message, /坦诚讲风险/, 'D1: fallback should not copy "坦诚讲风险"');
checkNoMatch(fallback1.message, /「/, 'D1: fallback should not use book title marks');
checkNoMatch(fallback1.message, /讲清楚/, 'D1: fallback should not say "讲清楚"');

// Bad LLM input that copies option titles
const badLlm1 = normalizeActionFeedbackProposal({
  message: '"听起来这周还不错，继续保持。你把「突出本周进展、坦诚讲风险」讲清楚，最好再拿客户反馈和竞品差异给我看。"',
  confidence: 0.88,
}, case1);

checkNoMatch(badLlm1.message, /突出本周进展/, 'D1: bad LLM should be rejected, no "突出本周进展"');
checkNoMatch(badLlm1.message, /坦诚讲风险/, 'D1: bad LLM should be rejected, no "坦诚讲风险"');
checkNoMatch(badLlm1.message, /讲清楚/, 'D1: bad LLM should be rejected, no "讲清楚"');

// ---------------------------------------------------------------------------
// Dimension 2: No evaluation tone ("评语腔")
// ---------------------------------------------------------------------------

console.log('\n=== Dimension 2: No evaluation tone ===');

// Check fallback doesn't have evaluation tone
checkNoMatch(fallback1.message, /你把.*讲清楚/, 'D2: fallback should not have "你把...讲清楚"');
checkNoMatch(fallback1.message, /本轮选择/, 'D2: fallback should not have "本轮选择"');
checkNoMatch(fallback1.message, /主话题/, 'D2: fallback should not have "主话题"');
checkNoMatch(fallback1.message, /态度选项/, 'D2: fallback should not have "态度选项"');
checkNoMatch(fallback1.message, /系统/, 'D2: fallback should not have "系统"');
checkNoMatch(fallback1.message, /AI/, 'D2: fallback should not have "AI"');
checkNoMatch(fallback1.message, /模型/, 'D2: fallback should not have "模型"');
checkNoMatch(fallback1.message, /评分/, 'D2: fallback should not have "评分"');
checkNoMatch(fallback1.message, /内部变量/, 'D2: fallback should not have "内部变量"');

// Bad LLM with evaluation tone
const badLlm2 = normalizeActionFeedbackProposal({
  message: '"本轮选择主话题是突出本周进展，态度选项是坦诚讲风险，你需要把客户反馈讲清楚。"',
  confidence: 0.85,
}, case1);

checkNoMatch(badLlm2.message, /本轮选择/, 'D2: bad LLM with evaluation tone should be rejected');
checkNoMatch(badLlm2.message, /主话题/, 'D2: bad LLM with evaluation tone should be rejected');
checkNoMatch(badLlm2.message, /态度选项/, 'D2: bad LLM with evaluation tone should be rejected');

// ---------------------------------------------------------------------------
// Dimension 3: Must sound like character speaking
// ---------------------------------------------------------------------------

console.log('\n=== Dimension 3: Must sound like character speaking ===');

// Owner feedback should sound like owner
const ownerFallback = buildFallbackActionFeedbackProposal(buildWeeklyFeedbackOwnerPositiveRequest());
check(ownerFallback.message.includes('我'), 'D3: owner feedback should use "我"');
check(ownerFallback.message.includes('。'), 'D3: owner feedback should have sentence endings');

// Customer feedback should sound like customer
const customerFallback = buildFallbackActionFeedbackProposal(buildShowingCustomerRequest());
check(customerFallback.message.includes('我'), 'D3: customer feedback should use "我"');
check(!customerFallback.message.includes('业主'), 'D3: customer feedback should not mention "业主"');

// Market feedback should sound like market
const marketFallback = buildFallbackActionFeedbackProposal(buildMarketActorRequest());
check(!marketFallback.message.includes('业主反馈'), 'D3: market feedback should not mention "业主反馈"');
check(!marketFallback.message.includes('本轮选择'), 'D3: market feedback should not have evaluation tone');

// Anxious owner should sound anxious
const anxiousFallback = buildFallbackActionFeedbackProposal(buildFirstVisitOwnerAnxiousRequest());
check(anxiousFallback.message.length > 40, 'D3: anxious owner feedback should be substantial');

// ---------------------------------------------------------------------------
// Dimension 4: Must respond to selected strategies but translate to real concerns
// ---------------------------------------------------------------------------

console.log('\n=== Dimension 4: Strategy translation to real concerns ===');

// Weekly feedback with progress + risk selected
const weeklyFeedback = buildFallbackActionFeedbackProposal(buildWeeklyFeedbackOwnerPositiveRequest());
checkHasMatch(weeklyFeedback.message, /客户|带看|反馈|竞品|同小区|旁边|市场价/, 'D4: should mention real business concerns');
checkHasMatch(weeklyFeedback.message, /万|价格|差距|差/, 'D4: should mention price gap when available');

// First visit with evidence selected
const firstVisitFeedback = buildFallbackActionFeedbackProposal(buildFirstVisitOwnerAnxiousRequest());
checkHasMatch(firstVisitFeedback.message, /价格|客户|数据|成交|市场/, 'D4: anxious owner should ask about price/customer');

// ---------------------------------------------------------------------------
// Dimension 5: LLM-first not broken
// ---------------------------------------------------------------------------

console.log('\n=== Dimension 5: LLM-first not broken ===');

// Good LLM should be accepted
const goodLlm = normalizeActionFeedbackProposal({
  message: '"这周有动静我知道了，但我不想只听一句不错。客户为什么没往下走、旁边那套怎么比、你说差 9 万的依据，都给我摆出来，我再跟家里说。"',
  confidence: 0.76,
}, buildWeeklyFeedbackOwnerPositiveRequest());

check(goodLlm.message.includes('客户'), 'D5: good LLM should be accepted with customer mention');
check(goodLlm.message.includes('旁边'), 'D5: good LLM should be accepted with competitor mention');
check(goodLlm.confidence === 0.76, 'D5: good LLM confidence should be preserved');

// Bad LLM should be rejected and fallback used
const badLlm5 = normalizeActionFeedbackProposal({
  message: '"好。"',
  confidence: 0.9,
}, buildWeeklyFeedbackOwnerPositiveRequest());

check(badLlm5.message.length > 60, 'D5: bad LLM (too short) should fallback to longer message');
check(badLlm5.message !== '"好。"', 'D5: bad LLM should not be accepted as-is');

// Bad LLM with copied titles should fallback
const badLlm5b = normalizeActionFeedbackProposal({
  message: '"听起来这周还不错，继续保持。你把「突出本周进展、坦诚讲风险」讲清楚。"',
  confidence: 0.88,
}, buildWeeklyFeedbackOwnerPositiveRequest());

check(!badLlm5b.message.includes('突出本周进展'), 'D5: bad LLM with copied titles should fallback');
check(badLlm5b.confidence === 0.88, 'D5: confidence should be preserved even on fallback');

// Good LLM for customer should be accepted
const goodCustomerLlm = normalizeActionFeedbackProposal({
  message: '"房子我看了，装修还行，但旁边那套价格更低。你把同小区最近成交给我看，我再决定要不要继续。"',
  confidence: 0.72,
}, buildShowingCustomerRequest());

check(goodCustomerLlm.message.includes('旁边'), 'D5: good customer LLM should be accepted');
check(!goodCustomerLlm.message.includes('业主'), 'D5: good customer LLM should not mention owner');

// ---------------------------------------------------------------------------
// Dimension 6: Actor isolation
// ---------------------------------------------------------------------------

console.log('\n=== Dimension 6: Actor isolation ===');

// Customer feedback should not sound like owner
const customerFeedback = buildFallbackActionFeedbackProposal(buildShowingCustomerRequest());
check(!customerFeedback.message.includes('家里商量'), 'D6: customer should not say "家里商量"');
check(!customerFeedback.message.includes('业主'), 'D6: customer should not mention "业主"');

// Owner feedback should not sound like customer
const ownerFeedback = buildFallbackActionFeedbackProposal(buildWeeklyFeedbackOwnerPositiveRequest());
check(!ownerFeedback.message.includes('继续看'), 'D6: owner should not say "继续看"');

// Market feedback should be neutral
const marketFeedback = buildFallbackActionFeedbackProposal(buildMarketActorRequest());
check(!marketFeedback.message.includes('我再看看'), 'D6: market should not say "我再看看"');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(60)}`);
console.log('Action Feedback Humanity Benchmark');
console.log('='.repeat(60));
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  console.error('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nRESULT: PASS');
}
