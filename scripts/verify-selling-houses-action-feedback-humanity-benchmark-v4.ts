/**
 * Action Feedback Humanity Deep Benchmark v4
 *
 * Covers three gaps in previous benchmarks:
 * 1. Multi-turn conversation context humanity
 * 2. caseContext parameter combination coverage
 * 3. LLM output path normalization pipeline
 *
 * Usage: npx tsx scripts/verify-selling-houses-action-feedback-humanity-benchmark-v4.ts
 */

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
let roundNumber = 0;
const failures: Array<{ round: number; dimension: string; message: string }> = [];

function check(condition: boolean, dimension: string, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push({ round: roundNumber, dimension, message });
    console.error(`  [FAIL][R${roundNumber}][${dimension}] ${message}`);
  }
}

function checkNoMatch(text: string, pattern: RegExp, dimension: string, desc: string) {
  const match = text.match(pattern);
  check(!match, dimension, `${desc}: should not match ${pattern} but found "${match?.[0]}"`);
}

function checkHasMatch(text: string, pattern: RegExp, dimension: string, desc: string) {
  const match = text.match(pattern);
  check(!!match, dimension, `${desc}: should match ${pattern}`);
}

// ---------------------------------------------------------------------------
// Base request builder
// ---------------------------------------------------------------------------

function buildRequest(overrides: Partial<ActionFeedbackRequest> = {}): ActionFeedbackRequest {
  return {
    actionId: 'weekly-feedback',
    title: '江悦府 128㎡ 三房 · 周度反馈',
    summary: '把这一周带看、客户反馈和价格风险同步给业主。',
    body: '业主想知道这周有没有实质进展，也担心价格风险没有被讲透。',
    actorLabel: '业主',
    currentRound: 1,
    totalRounds: 2,
    contextBullets: ['本周带看 3 组，1 组有意向但未出价。', '同小区近期有 1 套成交，价格低于挂牌 5%。'],
    round: {
      title: '周度反馈',
      description: '这一轮要让业主相信你不是泛泛汇报。',
      mainStrategies: [
        { id: 'progress', title: '突出本周进展', note: '说明带看和客户反馈的真实变化。' },
        { id: 'risk', title: '坦诚讲风险', note: '把价格差距和竞品分流说清。' },
      ],
      assistStrategies: [{ id: 'direct-risk', title: '坦诚讲风险', note: '风险直接说，不做空泛安抚。' }],
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
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Dimension 1: Multi-turn conversation context humanity
// ---------------------------------------------------------------------------

console.log('=== Dimension 1: Multi-turn conversation context humanity ===\n');

// Test that different baseFeedbackMessage patterns produce different outputs
// reflecting the conversation context
const turnPatterns = [
  { msg: '"听起来这周还不错，继续保持。"', desc: 'positive feedback', expectLead: /这周有点动静/ },
  { msg: '"我不太满意，客户怎么还没出价？"', desc: 'negative feedback', expectLead: /不踏实|不满意/ },
  { msg: '"再看看吧，不急。"', desc: 'neutral/deferring', expectLead: /先不急|听到了|再看看/ },
  { msg: '"你到底有没有在推？"', desc: 'frustrated', expectLead: /听到了|知道了|你别急/ },
  { msg: '"好，我知道了。"', desc: 'minimal response', expectLead: /听到了|知道了|我听/ },
];

for (const pattern of turnPatterns) {
  roundNumber++;
  const req = buildRequest({ choice: { ...buildRequest().choice, baseFeedbackMessage: pattern.msg } });
  const result = buildFallbackActionFeedbackProposal(req);

  check(result.message.length >= 40, 'D1-MultiTurn', `R${roundNumber} ${pattern.desc}: output >= 40 chars`);
  checkNoMatch(result.message, /系统|AI|模型|评分/, 'D1-MultiTurn', `R${roundNumber} no system jargon`);
  checkNoMatch(result.message, /本轮选择|主话题|态度选项/, 'D1-MultiTurn', `R${roundNumber} no eval terms`);

  // Check that the lead reflects the mood
  const stripped = result.message.replace(/^[""]|[""]$/g, '');
  checkHasMatch(stripped, pattern.expectLead, 'D1-MultiTurn', `R${roundNumber} ${pattern.desc}: lead matches mood`);
}

// Test that different moods produce different outputs
roundNumber++;
const positiveReq = buildRequest({
  choice: { ...buildRequest().choice, mood: 'positive', baseFeedbackMessage: '"听起来这周还不错，继续保持。"' },
});
const negativeReq = buildRequest({
  choice: { ...buildRequest().choice, mood: 'negative', baseFeedbackMessage: '"我不太满意，客户怎么还没出价？"' },
});
const positiveResult = buildFallbackActionFeedbackProposal(positiveReq);
const negativeResult = buildFallbackActionFeedbackProposal(negativeReq);

check(
  positiveResult.message !== negativeResult.message,
  'D1-MultiTurn',
  `R${roundNumber} positive and negative moods should produce different outputs`,
);

// ---------------------------------------------------------------------------
// Dimension 2: caseContext parameter combinations
// ---------------------------------------------------------------------------

console.log('\n=== Dimension 2: caseContext parameter combinations ===\n');

const contextMatrix = [
  {
    desc: 'high trust + low urgency',
    ctx: { trust: 85, patience: 70, urgency: 25, askPrice: 600, marketPrice: 595 },
    expectNoPrice: false,
  },
  {
    desc: 'low trust + high urgency',
    ctx: { trust: 25, patience: 15, urgency: 85, askPrice: 800, marketPrice: 750 },
    expectNoPrice: false,
  },
  {
    desc: 'balanced trust/patience/urgency',
    ctx: { trust: 55, patience: 50, urgency: 50, askPrice: 700, marketPrice: 690 },
    expectNoPrice: false,
  },
  {
    desc: 'extreme price gap',
    ctx: { trust: 45, patience: 35, urgency: 70, askPrice: 1000, marketPrice: 800 },
    expectNoPrice: false,
  },
  {
    desc: 'no price gap',
    ctx: { trust: 60, patience: 55, urgency: 45, askPrice: 500, marketPrice: 500 },
    expectNoPrice: true,
  },
  {
    desc: 'negative price gap (below market)',
    ctx: { trust: 70, patience: 65, urgency: 35, askPrice: 480, marketPrice: 500 },
    expectNoPrice: true,
  },
  {
    desc: 'missing caseContext entirely',
    ctx: undefined,
    expectNoPrice: true,
  },
  {
    desc: 'partial caseContext (only title)',
    ctx: { title: '测试房源', askPrice: undefined, marketPrice: undefined } as any,
    expectNoPrice: true,
  },
];

for (const testCase of contextMatrix) {
  roundNumber++;
  const req = buildRequest({ caseContext: testCase.ctx ? { ...buildRequest().caseContext, ...testCase.ctx } : undefined });
  const result = buildFallbackActionFeedbackProposal(req);

  check(result.message.length >= 40, 'D2-Context', `R${roundNumber} ${testCase.desc}: output >= 40 chars`);
  checkNoMatch(result.message, /系统|AI|模型|评分/, 'D2-Context', `R${roundNumber} no system jargon`);
  checkNoMatch(result.message, /本轮选择|主话题|态度选项/, 'D2-Context', `R${roundNumber} no eval terms`);

  // Price gap check
  if (testCase.expectNoPrice) {
    checkNoMatch(result.message, /市场价差.*万/, 'D2-Context', `R${roundNumber} no price gap mention when not applicable`);
  } else {
    // Should mention price-related content when there's a gap
    const priceGap = testCase.ctx ? Math.round((testCase.ctx.askPrice || 0) - (testCase.ctx.marketPrice || 0)) : 0;
    if (priceGap > 0) {
      checkHasMatch(result.message, /万|价格|差距|差/, 'D2-Context', `R${roundNumber} should mention price when gap=${priceGap}`);
    }
  }
}

// Test different actionIds
const actionIds = [
  'weekly-feedback',
  'first-visit',
  'showing',
  'open-day',
  'adjust-listing-price',
  'pricing-advice',
  'deep-diagnosis',
  'private-referral',
  'xiaohongshu-boost',
];

for (const actionId of actionIds) {
  roundNumber++;
  const req = buildRequest({ actionId });
  const result = buildFallbackActionFeedbackProposal(req);

  check(result.message.length >= 40, 'D2-ActionId', `R${roundNumber} actionId=${actionId}: output >= 40 chars`);
  checkNoMatch(result.message, /系统|AI|模型|评分/, 'D2-ActionId', `R${roundNumber} no system jargon`);
}

// Test different actors
const actors: Array<'owner' | 'customer' | 'market'> = ['owner', 'customer', 'market'];
for (const actor of actors) {
  roundNumber++;
  const req = buildRequest({ choice: { ...buildRequest().choice, actor } });
  const result = buildFallbackActionFeedbackProposal(req);

  check(result.message.length >= 40, 'D2-Actor', `R${roundNumber} actor=${actor}: output >= 40 chars`);
  checkNoMatch(result.message, /系统|AI|模型|评分/, 'D2-Actor', `R${roundNumber} no system jargon`);

  // Actor-specific checks
  if (actor === 'customer') {
    checkNoMatch(result.message, /业主|挂牌|调价/, 'D2-Actor', `R${roundNumber} customer should not use owner terms`);
  }
  if (actor === 'market') {
    checkNoMatch(result.message, /我再看看|我跟家里/, 'D2-Actor', `R${roundNumber} market should not use personal terms`);
  }
}

// ---------------------------------------------------------------------------
// Dimension 3: LLM output path normalization pipeline
// ---------------------------------------------------------------------------

console.log('\n=== Dimension 3: LLM output path normalization pipeline ===\n');

const normalizationTests = [
  {
    desc: 'good LLM - should be accepted',
    input: '"这周有动静我知道了，但我不想只听一句不错。客户为什么没往下走、旁边那套怎么比、你说差9万的依据是什么，都给我摆出来。"',
    confidence: 0.76,
    shouldAccept: true,
  },
  {
    desc: 'bad LLM - copies UI labels',
    input: '"听起来这周还不错。你把「突出本周进展」讲清楚。"',
    confidence: 0.88,
    shouldAccept: false,
  },
  {
    desc: 'bad LLM - evaluation tone',
    input: '"本轮选择主话题是突出本周进展，你需要把客户反馈讲清楚。"',
    confidence: 0.85,
    shouldAccept: false,
  },
  {
    desc: 'bad LLM - too short',
    input: '"好。"',
    confidence: 0.9,
    shouldAccept: false,
  },
  {
    desc: 'bad LLM - system jargon',
    input: '"系统判断这周表现不错，AI评分显示客户意向在上升。"',
    confidence: 0.82,
    shouldAccept: false,
  },
  {
    desc: 'bad LLM - template style',
    input: '"综合考虑本周带看情况和市场数据，建议继续跟进有意向客户。"',
    confidence: 0.78,
    shouldAccept: false,
  },
  {
    desc: 'good LLM - natural hesitation',
    input: '"这周有动静我看到了，但客户为什么没往下走、旁边那套怎么比、你说差9万的依据是什么，你给我说清楚。"',
    confidence: 0.72,
    shouldAccept: true,
  },
  {
    desc: 'good LLM - specific concerns',
    input: '"同小区最近成交那套多少钱、客户到底卡在哪里、你说差9万的依据是什么、旁边那套怎么抢人，都给我摆出来。"',
    confidence: 0.68,
    shouldAccept: true,
  },
  {
    desc: 'edge LLM - exactly at length boundary',
    input: '"这周有动静我知道了，客户反馈和竞品差异你给我摊开看，我不想只听结论，要看依据和数据，你给我说明白。"',
    confidence: 0.7,
    shouldAccept: true,
  },
  {
    desc: 'edge LLM - just below length boundary',
    input: '"这周有动静，客户反馈你给我看。"',
    confidence: 0.7,
    shouldAccept: false,
  },
];

for (const test of normalizationTests) {
  roundNumber++;
  const req = buildRequest();
  const result = normalizeActionFeedbackProposal({ message: test.input, confidence: test.confidence }, req);

  const strippedInput = test.input.replace(/^[""]|[""]$/g, '').trim();
  const didAccept = result.message === test.input || result.message.includes(strippedInput);

  check(
    test.shouldAccept ? didAccept : !didAccept,
    'D3-Normalization',
    `R${roundNumber} ${test.desc}: ${test.shouldAccept ? 'should accept' : 'should reject'}`,
  );

  // Universal checks on output
  checkNoMatch(result.message, /系统|AI|模型|评分|内部变量/, 'D3-Normalization', `R${roundNumber} no system jargon`);
  checkNoMatch(result.message, /本轮选择|主话题|态度选项/, 'D3-Normalization', `R${roundNumber} no eval terms`);
  check(result.message.length >= 40, 'D3-Normalization', `R${roundNumber} output >= 40 chars`);

  // Confidence should be preserved or clamped
  check(
    result.confidence >= 0.35 && result.confidence <= 0.95,
    'D3-Normalization',
    `R${roundNumber} confidence in range: ${result.confidence}`,
  );
}

// Test that normalization preserves confidence on fallback
roundNumber++;
const fallbackTest = normalizeActionFeedbackProposal(
  { message: '"好。"', confidence: 0.92 },
  buildRequest(),
);
check(
  fallbackTest.confidence === 0.92,
  'D3-Confidence',
  `R${roundNumber} confidence preserved on fallback: ${fallbackTest.confidence}`,
);

// Test that normalization clamps out-of-range confidence
roundNumber++;
const clampTest = normalizeActionFeedbackProposal(
  { message: '"这周有动静我知道了，客户反馈和竞品差异你给我摊开看，我不想只听结论。"', confidence: 1.5 },
  buildRequest(),
);
check(
  clampTest.confidence <= 1.0,
  'D3-Confidence',
  `R${roundNumber} confidence clamped to 1.0: ${clampTest.confidence}`,
);

// ---------------------------------------------------------------------------
// Dimension 4: Cross-actor consistency
// ---------------------------------------------------------------------------

console.log('\n=== Dimension 4: Cross-actor consistency ===\n');

// Same input, different actors should produce different outputs
roundNumber++;
const ownerOutput = buildFallbackActionFeedbackProposal(
  buildRequest({ choice: { ...buildRequest().choice, actor: 'owner' } }),
);
const customerOutput = buildFallbackActionFeedbackProposal(
  buildRequest({ choice: { ...buildRequest().choice, actor: 'customer' } }),
);
const marketOutput = buildFallbackActionFeedbackProposal(
  buildRequest({ choice: { ...buildRequest().choice, actor: 'market' } }),
);

check(
  ownerOutput.message !== customerOutput.message,
  'D4-Consistency',
  `R${roundNumber} owner and customer should produce different outputs`,
);
check(
  ownerOutput.message !== marketOutput.message,
  'D4-Consistency',
  `R${roundNumber} owner and market should produce different outputs`,
);
check(
  customerOutput.message !== marketOutput.message,
  'D4-Consistency',
  `R${roundNumber} customer and market should produce different outputs`,
);

// ---------------------------------------------------------------------------
// Dimension 5: Strategy translation quality
// ---------------------------------------------------------------------------

console.log('\n=== Dimension 5: Strategy translation quality ===\n');

const strategyTests = [
  {
    desc: 'progress + risk → mentions customer/competitor/price',
    mainStrategyIds: ['progress', 'risk'],
    assistStrategyId: 'direct-risk',
    expectPatterns: [/客户|带看|反馈/, /竞品|旁边|同类/, /万|价格|差距/],
  },
  {
    desc: 'progress only → mentions customer/feedback',
    mainStrategyIds: ['progress'],
    assistStrategyId: null,
    expectPatterns: [/客户|带看|反馈/],
  },
  {
    desc: 'risk only → mentions competitor/price',
    mainStrategyIds: ['risk'],
    assistStrategyId: 'direct-risk',
    expectPatterns: [/竞品|旁边|同类/, /万|价格|差距/],
  },
];

for (const test of strategyTests) {
  roundNumber++;
  const req = buildRequest({
    choice: {
      mainStrategyIds: test.mainStrategyIds,
      assistStrategyId: test.assistStrategyId,
      baseFeedbackMessage: '"听起来这周还不错，继续保持。"',
      actor: 'owner',
      mood: 'positive',
    },
  });
  const result = buildFallbackActionFeedbackProposal(req);

  for (const pattern of test.expectPatterns) {
    checkHasMatch(result.message, pattern, 'D5-Strategy', `R${roundNumber} ${test.desc}: should match ${pattern}`);
  }
}

// ---------------------------------------------------------------------------
// Dimension 6: Assist strategy translation
// ---------------------------------------------------------------------------

console.log('\n=== Dimension 6: Assist strategy translation ===\n');

const assistTests = [
  {
    desc: 'direct-risk assist → risk acknowledgment',
    assistStrategyId: 'direct-risk',
    expectPattern: /风险|直接|但别只/,
  },
  {
    desc: 'steady assist → pacing acknowledgment',
    assistStrategyId: 'steady',
    expectPattern: /节奏|不硬催|继续听/,
  },
  {
    desc: 'assertive assist → push acknowledgment',
    assistStrategyId: 'assertive',
    expectPattern: /推进|依据|先摆/,
  },
];

for (const test of assistTests) {
  roundNumber++;
  const req = buildRequest({
    round: {
      ...buildRequest().round,
      assistStrategies: [
        { id: 'direct-risk', title: '坦诚讲风险', note: '风险直接说。' },
        { id: 'steady', title: '不硬推', note: '保留空间。' },
        { id: 'assertive', title: '强势推进', note: '明确要求。' },
      ],
    },
    choice: {
      ...buildRequest().choice,
      assistStrategyId: test.assistStrategyId,
    },
  });
  const result = buildFallbackActionFeedbackProposal(req);

  checkHasMatch(result.message, test.expectPattern, 'D6-Assist', `R${roundNumber} ${test.desc}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(60)}`);
console.log('Deep Benchmark v4 Summary');
console.log('='.repeat(60));
console.log(`Total rounds: ${roundNumber}`);
console.log(`Total checks: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error('\nFailures by dimension:');
  const byDimension = new Map<string, number>();
  for (const f of failures) {
    byDimension.set(f.dimension, (byDimension.get(f.dimension) || 0) + 1);
  }
  for (const [dim, count] of byDimension) {
    console.error(`  ${dim}: ${count} failures`);
  }

  console.error('\nDetailed failures:');
  for (const f of failures.slice(0, 30)) {
    console.error(`  R${f.round}[${f.dimension}] ${f.message}`);
  }
  if (failures.length > 30) {
    console.error(`  ... and ${failures.length - 30} more`);
  }

  console.error('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nRESULT: PASS');
}
