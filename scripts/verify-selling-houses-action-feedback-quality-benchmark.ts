/**
 * Action Feedback Humanity Quality Benchmark v6
 *
 * Tests OUTPUT QUALITY, not just "no bad patterns".
 *
 * Core question: Does the system produce outputs that a human would
 * recognize as "this sounds like a real owner/customer/market message"?
 *
 * Quality dimensions:
 * 1. Differentiation: same actor + different inputs → different outputs
 * 2. Character authenticity: each actor has distinct voice
 * 3. Pressure reflection: price gap / urgency affects tone
 * 4. Specificity: output references actual business context
 * 5. Naturalness: output reads like WeChat, not like essay
 *
 * Usage: npx tsx scripts/verify-selling-houses-action-feedback-quality-benchmark.ts
 */

import {
  buildFallbackActionFeedbackProposal,
  normalizeActionFeedbackProposal,
  type ActionFeedbackRequest,
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
// Quality 1: Differentiation — same actor, different inputs
// ---------------------------------------------------------------------------

console.log('=== Quality 1: Differentiation ===\n');

const ownerInputs = [
  { msg: '"听起来这周还不错，继续保持。"', mood: 'positive' as const },
  { msg: '"我不太满意，客户怎么还没出价？"', mood: 'negative' as const },
  { msg: '"你到底有没有在推？"', mood: 'negative' as const },
  { msg: '"好吧，你给我看看数据。"', mood: 'neutral' as const },
  { msg: '"我再跟家里商量一下。"', mood: 'neutral' as const },
  { msg: '"你别光说不错，我就想知道客户具体什么反应。"', mood: 'negative' as const },
  { msg: '"这周有几组客户来看了，但为什么没有出价的？"', mood: 'neutral' as const },
];

const ownerOutputs: string[] = [];
for (const input of ownerInputs) {
  roundNumber++;
  const req = buildRequest({
    choice: { ...buildRequest().choice, baseFeedbackMessage: input.msg, mood: input.mood },
  });
  const result = buildFallbackActionFeedbackProposal(req);
  ownerOutputs.push(result.message);

  // Each output should be substantial
  check(result.message.length >= 60, 'Q1-Diff', `R${roundNumber} owner output >= 60 chars: ${result.message.length}`);
  check(result.message.length <= 200, 'Q1-Diff', `R${roundNumber} owner output <= 200 chars: ${result.message.length}`);
}

// Check that different inputs produce different outputs
let uniqueOwnerOutputs = new Set(ownerOutputs);
roundNumber++;
check(
  uniqueOwnerOutputs.size >= 5,
  'Q1-Diff',
  `R${roundNumber} 7 different owner inputs should produce >= 5 unique outputs, got ${uniqueOwnerOutputs.size}`,
);

// Check that no two consecutive outputs are identical
for (let i = 1; i < ownerOutputs.length; i++) {
  roundNumber++;
  check(
    ownerOutputs[i] !== ownerOutputs[i - 1],
    'Q1-Diff',
    `R${roundNumber} consecutive owner outputs should differ (turn ${i} vs ${i + 1})`,
  );
}

// ---------------------------------------------------------------------------
// Quality 2: Character authenticity — each actor has distinct voice
// ---------------------------------------------------------------------------

console.log('\n=== Quality 2: Character authenticity ===\n');

const actorVoices = [
  {
    actor: 'owner' as const,
    desc: 'owner voice',
    expectPatterns: [/我/, /家里|商量|依据|摊开|说清楚/],
    forbidPatterns: [/继续看|再看看/, /系统|AI|模型/],
  },
  {
    actor: 'customer' as const,
    desc: 'customer voice',
    expectPatterns: [/我/, /看|房|价格|差异/],
    forbidPatterns: [/业主|挂牌|调价|家里商量/, /系统|AI|模型/],
  },
  {
    actor: 'market' as const,
    desc: 'market voice',
    expectPatterns: [/反馈|信号|客户|竞品|带看/],
    forbidPatterns: [/我再看看|我跟家里|我觉得/, /系统|AI|模型/],
  },
];

for (const voice of actorVoices) {
  roundNumber++;
  const req = buildRequest({
    choice: { ...buildRequest().choice, actor: voice.actor },
  });
  const result = buildFallbackActionFeedbackProposal(req);

  for (const pattern of voice.expectPatterns) {
    const match = result.message.match(pattern);
    check(!!match, 'Q2-Voice', `R${roundNumber} ${voice.desc}: should match ${pattern}, got "${result.message.slice(0, 60)}..."`);
  }
  for (const pattern of voice.forbidPatterns) {
    const match = result.message.match(pattern);
    check(!match, 'Q2-Voice', `R${roundNumber} ${voice.desc}: should not match ${pattern}, got "${result.message.slice(0, 60)}..."`);
  }
}

// Check that different actors produce different outputs
roundNumber++;
const ownerVoice = buildFallbackActionFeedbackProposal(buildRequest({ choice: { ...buildRequest().choice, actor: 'owner' } }));
const customerVoice = buildFallbackActionFeedbackProposal(buildRequest({ choice: { ...buildRequest().choice, actor: 'customer' } }));
const marketVoice = buildFallbackActionFeedbackProposal(buildRequest({ choice: { ...buildRequest().choice, actor: 'market' } }));

check(ownerVoice.message !== customerVoice.message, 'Q2-Voice', `R${roundNumber} owner ≠ customer`);
check(ownerVoice.message !== marketVoice.message, 'Q2-Voice', `R${roundNumber} owner ≠ market`);
check(customerVoice.message !== marketVoice.message, 'Q2-Voice', `R${roundNumber} customer ≠ market`);

// ---------------------------------------------------------------------------
// Quality 3: Pressure reflection — price gap / urgency affects tone
// ---------------------------------------------------------------------------

console.log('\n=== Quality 3: Pressure reflection ===\n');

// High price gap vs no price gap
roundNumber++;
const highGapReq = buildRequest({
  caseContext: { ...buildRequest().caseContext, askPrice: 1000, marketPrice: 900 },
});
const noGapReq = buildRequest({
  caseContext: { ...buildRequest().caseContext, askPrice: 600, marketPrice: 600 },
});
const highGapResult = buildFallbackActionFeedbackProposal(highGapReq);
const noGapResult = buildFallbackActionFeedbackProposal(noGapReq);

check(highGapResult.message.includes('万'), 'Q3-Pressure', `R${roundNumber} high gap should mention price`);
check(!noGapResult.message.includes('市场价差'), 'Q3-Pressure', `R${roundNumber} no gap should not mention price difference`);
check(highGapResult.message !== noGapResult.message, 'Q3-Pressure', `R${roundNumber} high gap ≠ no gap output`);

// High urgency vs low urgency
roundNumber++;
const highUrgencyReq = buildRequest({
  caseContext: { ...buildRequest().caseContext, urgency: 85, patience: 15 },
});
const lowUrgencyReq = buildRequest({
  caseContext: { ...buildRequest().caseContext, urgency: 25, patience: 75 },
});
const highUrgencyResult = buildFallbackActionFeedbackProposal(highUrgencyReq);
const lowUrgencyResult = buildFallbackActionFeedbackProposal(lowUrgencyReq);

check(highUrgencyResult.message !== lowUrgencyResult.message, 'Q3-Pressure', `R${roundNumber} high urgency ≠ low urgency output`);

// Low trust vs high trust
roundNumber++;
const lowTrustReq = buildRequest({
  caseContext: { ...buildRequest().caseContext, trust: 20 },
});
const highTrustReq = buildRequest({
  caseContext: { ...buildRequest().caseContext, trust: 80 },
});
const lowTrustResult = buildFallbackActionFeedbackProposal(lowTrustReq);
const highTrustResult = buildFallbackActionFeedbackProposal(highTrustReq);

check(lowTrustResult.message !== highTrustResult.message, 'Q3-Pressure', `R${roundNumber} low trust ≠ high trust output`);

// ---------------------------------------------------------------------------
// Quality 4: Specificity — output references actual business context
// ---------------------------------------------------------------------------

console.log('\n=== Quality 4: Specificity ===\n');

// Owner with progress + risk selected → should mention customer/competitor/price
roundNumber++;
const specificReq = buildRequest({
  choice: {
    ...buildRequest().choice,
    mainStrategyIds: ['progress', 'risk'],
    assistStrategyId: 'direct-risk',
  },
  caseContext: {
    ...buildRequest().caseContext,
    askPrice: 930,
    marketPrice: 921,
  },
});
const specificResult = buildFallbackActionFeedbackProposal(specificReq);

// Should reference real business concepts
check(
  /客户|带看|反馈/.test(specificResult.message),
  'Q4-Specific',
  `R${roundNumber} should mention customer/showing/feedback`,
);
check(
  /竞品|旁边|同类|市场/.test(specificResult.message),
  'Q4-Specific',
  `R${roundNumber} should mention competitor/market`,
);
check(
  /万|价格|差距/.test(specificResult.message),
  'Q4-Specific',
  `R${roundNumber} should mention price`,
);

// Customer with condition focus → should mention condition/price/choice
roundNumber++;
const customerSpecificReq = buildRequest({
  choice: {
    ...buildRequest().choice,
    actor: 'customer',
    mainStrategyIds: ['highlight-condition'],
    assistStrategyId: 'patient',
  },
});
const customerSpecificResult = buildFallbackActionFeedbackProposal(customerSpecificReq);

check(
  /房|装修|户型|价格|差异/.test(customerSpecificResult.message),
  'Q4-Specific',
  `R${roundNumber} customer should mention condition/price`,
);

// ---------------------------------------------------------------------------
// Quality 5: Naturalness — reads like WeChat, not like essay
// ---------------------------------------------------------------------------

console.log('\n=== Quality 5: Naturalness ===\n');

const naturalnessChecks = [
  {
    desc: 'owner positive',
    req: buildRequest({ choice: { ...buildRequest().choice, mood: 'positive' } }),
  },
  {
    desc: 'owner negative',
    req: buildRequest({ choice: { ...buildRequest().choice, mood: 'negative', baseFeedbackMessage: '"我不太满意。"' } }),
  },
  {
    desc: 'customer interested',
    req: buildRequest({ choice: { ...buildRequest().choice, actor: 'customer', mood: 'positive' } }),
  },
  {
    desc: 'market neutral',
    req: buildRequest({ choice: { ...buildRequest().choice, actor: 'market', mood: 'neutral' } }),
  },
];

for (const test of naturalnessChecks) {
  roundNumber++;
  const result = buildFallbackActionFeedbackProposal(test.req);
  const msg = result.message;

  // Should have sentence endings (。！？)
  check(/[。！？]/.test(msg), 'Q5-Natural', `R${roundNumber} ${test.desc}: has sentence endings`);

  // Should not have essay-like patterns
  check(!/首先|其次|最后|总之|综上/.test(msg), 'Q5-Natural', `R${roundNumber} ${test.desc}: no essay patterns`);
  check(!/第一|第二|第三/.test(msg), 'Q5-Natural', `R${roundNumber} ${test.desc}: no numbered list`);
  check(!/一方面|另一方面/.test(msg), 'Q5-Natural', `R${roundNumber} ${test.desc}: no formal connectors`);

  // Should not be too formal
  check(!/贵方|敝人|本公司/.test(msg), 'Q5-Natural', `R${roundNumber} ${test.desc}: no formal archaic`);

  // Should have natural Chinese sentence structure
  check(msg.includes('，') || msg.includes('。'), 'Q5-Natural', `R${roundNumber} ${test.desc}: has Chinese punctuation`);

  // Length should feel like a real WeChat message (not too short, not too long)
  check(msg.length >= 60, 'Q5-Natural', `R${roundNumber} ${test.desc}: >= 60 chars (not too short)`);
  check(msg.length <= 200, 'Q5-Natural', `R${roundNumber} ${test.desc}: <= 200 chars (not too long)`);
}

// ---------------------------------------------------------------------------
// Quality 6: Real LLM bad output recovery
// ---------------------------------------------------------------------------

console.log('\n=== Quality 6: Real LLM bad output recovery ===\n');

const realBadOutputs = [
  {
    desc: 'user reported bad output (exact)',
    input: '"听起来这周还不错，继续保持。 我不是不听建议，你把「突出本周进展、坦诚讲风险」讲清楚，最好再拿同小区成交、客户反馈和竞品差异给我看。现在挂牌和你说的市场价还差 9 万……"',
    shouldRecover: true,
  },
  {
    desc: 'system evaluation style',
    input: '"本轮选择主话题是突出本周进展，态度选项是坦诚讲风险。你需要把客户反馈讲清楚。"',
    shouldRecover: true,
  },
  {
    desc: 'AI jargon style',
    input: '"系统判断这周表现不错，AI评分显示客户意向在上升，模型建议继续推进。"',
    shouldRecover: true,
  },
  {
    desc: 'template report style',
    input: '"本周带看3组，1组有意向。同小区成交1套，价格低于挂牌5%。建议继续跟进。"',
    shouldRecover: true,
  },
  {
    desc: 'coaching message style',
    input: '"这周表现不错，继续保持。下周重点跟进有意向的客户，争取促成成交。"',
    shouldRecover: true,
  },
];

for (const test of realBadOutputs) {
  roundNumber++;
  const req = buildRequest();
  const result = normalizeActionFeedbackProposal({ message: test.input, confidence: 0.85 }, req);
  const output = result.message;

  // Should recover to a good output
  check(output !== test.input, 'Q6-Recovery', `R${roundNumber} ${test.desc}: should not pass through as-is`);

  // Recovered output should be good quality
  check(output.length >= 60, 'Q6-Recovery', `R${roundNumber} ${test.desc}: recovered output >= 60 chars`);
  check(output.length <= 200, 'Q6-Recovery', `R${roundNumber} ${test.desc}: recovered output <= 200 chars`);
  check(!/系统|AI|模型|评分|内部变量/.test(output), 'Q6-Recovery', `R${roundNumber} ${test.desc}: no system jargon`);
  check(!/本轮选择|主话题|态度选项/.test(output), 'Q6-Recovery', `R${roundNumber} ${test.desc}: no eval terms`);
  check(!/讲清楚/.test(output), 'Q6-Recovery', `R${roundNumber} ${test.desc}: no "讲清楚"`);
  check(/。/.test(output), 'Q6-Recovery', `R${roundNumber} ${test.desc}: has sentence ending`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(60)}`);
console.log('Quality Benchmark v6 Summary');
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
