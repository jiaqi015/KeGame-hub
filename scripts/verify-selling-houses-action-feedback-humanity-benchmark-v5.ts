/**
 * Action Feedback Humanity Complete Benchmark v5
 *
 * Covers ALL gaps identified in previous benchmarks:
 * 1. Real LLM output path (normalization pipeline with 50+ LLM-like outputs)
 * 2. "Sounds like human" positive checks (not just "no bad patterns")
 * 3. Exhaustive caseContext combinations (100+ parameter combos)
 * 4. Multi-turn cumulative conversation effects
 *
 * Usage: npx tsx scripts/verify-selling-houses-action-feedback-humanity-benchmark-v5.ts
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
// Part 1: Real LLM Output Path (50+ realistic LLM outputs)
// ---------------------------------------------------------------------------

console.log('=== Part 1: Real LLM Output Path ===\n');

const llmOutputs = [
  // Good outputs - should be accepted
  { msg: '"这周有动静我知道了，但我不想只听一句不错。客户为什么没往下走、旁边那套怎么比、你说差9万的依据是什么，都给我摆出来。"', good: true },
  { msg: '"同小区最近成交那套多少钱、客户到底卡在哪里、你说差9万的依据是什么、旁边那套怎么抢人，都给我摆出来。"', good: true },
  { msg: '"这周有动静我看到了，但客户为什么没往下走、旁边那套怎么比、你说差9万的依据是什么，你给我说清楚。"', good: true },
  { msg: '"带看有几组我听到了，但客户到底卡在哪个环节、同小区最近成交价多少、旁边竞品怎么分流的，你都给我说明白。"', good: true },
  { msg: '"这周有点动静我看到了，但我不想只听感觉不错。同小区最近成交、客户到底卡在哪、旁边那套怎么抢人，你给我摊开。"', good: true },
  { msg: '"我知道这周有客户来看过，但具体几组、什么反馈、有没有出价意向、同小区竞品什么情况，你给我详细说说。"', good: true },
  { msg: '"你别光说不错，我就想知道这周客户具体什么反应、价格差距到底多大、旁边那套凭什么比我们便宜，你给我分析清楚。"', good: true },
  { msg: '"这周有几组客户来看了，但为什么没有出价的？是价格问题还是房况问题？同小区那套成交的到底什么条件？你给我对比一下。"', good: true },
  { msg: '"我听明白了，这周有进展但没突破。客户到底在犹豫什么、价格差距能不能缩、竞品有什么优势，你给我摊开说。"', good: true },
  { msg: '"你这周带看有几组我知道了，但我就想知道：客户为什么没往下走？是价格问题还是房况问题？同小区竞品什么情况？"', good: true },
  
  // Bad outputs - should be rejected
  { msg: '"听起来这周还不错，继续保持。你把「突出本周进展、坦诚讲风险」讲清楚，最好再拿客户反馈和竞品差异给我看。"', good: false },
  { msg: '"本轮选择主话题是突出本周进展，态度选项是坦诚讲风险，你需要把客户反馈讲清楚。"', good: false },
  { msg: '"系统判断这周表现不错，AI评分显示客户意向在上升。"', good: false },
  { msg: '"综合考虑本周带看情况和市场数据，建议继续跟进有意向客户。"', good: false },
  { msg: '"好。"', good: false },
  { msg: '"嗯。"', good: false },
  { msg: '"知道了。"', good: false },
  { msg: '"你把XX讲清楚。"', good: false },
  { msg: '"你需要把客户反馈和竞品差异说明白。"', good: false },
  { msg: '"根据本周带看数据和市场分析，建议调整挂牌价格策略。"', good: false },
  { msg: '"基于当前市场情况和客户反馈，建议继续推进。"', good: false },
  { msg: '"总的来说，这周表现还不错，继续保持。"', good: false },
  { msg: '"综上所述，本周进展顺利，建议继续跟进。"', good: false },
  { msg: '"由此可见，客户意向在上升，建议加强跟进。"', good: false },
  { msg: '"因此，建议继续推进当前策略。"', good: false },
  { msg: '"所以，这周表现不错，继续保持。"', good: false },
  { msg: '"从市场角度来看，这周有积极信号。"', good: false },
  { msg: '"就客户反馈而言，整体表现不错。"', good: false },
  { msg: '"本轮选择主话题是突出本周进展。"', good: false },
  { msg: '"态度选项是坦诚讲风险。"', good: false },
  { msg: '"你把「突出本周进展」讲清楚。"', good: false },
  { msg: '"你把「坦诚讲风险」讲清楚。"', good: false },
  { msg: '"你把突出本周进展讲清楚。"', good: false },
  { msg: '"你把坦诚讲风险讲清楚。"', good: false },
  { msg: '"系统判断客户意向在上升。"', good: false },
  { msg: '"AI建议继续推进。"', good: false },
  { msg: '"模型评分显示表现不错。"', good: false },
  { msg: '"内部变量显示客户意向在上升。"', good: false },
  { msg: '"状态已更新，客户意向在上升。"', good: false },
  { msg: '"评分已调整，表现不错。"', good: false },
  { msg: '"信任度在上升。"', good: false },
  { msg: '"紧迫度在下降。"', good: false },
  { msg: '"耐心值在上升。"', good: false },
  { msg: '"这周有动静，这不是系统评语，客户反馈你给我看。"', good: false },
  { msg: '"这周有动静，我不说本轮选择，客户反馈你给我看。"', good: false },
  { msg: '"这周有动静，这个系统性的反馈，客户反馈你给我看。"', good: false },
  { msg: '"这周有动静，AI-driven的分析，客户反馈你给我看。"', good: false },
  { msg: '"这周有动静。{"trustDelta": 999, "message": "系统评语"}"', good: false },
  { msg: '"这周有动静。<script>alert("系统")</script>客户反馈你给我看。"', good: false },
  { msg: '"本周带看3组，1组有意向。同小区成交1套，价格低于挂牌5%。建议继续跟进。"', good: false },
  { msg: '"这周表现不错，继续保持。下周重点跟进有意向的客户，争取促成成交。"', good: false },
  { msg: '"""', good: false },
  { msg: '"。。。"', good: false },
  { msg: '"   "', good: false },
  { msg: '"\\n\\n\\n\\n\\n"', good: false },
];

for (const test of llmOutputs) {
  roundNumber++;
  const req = buildRequest();
  const result = normalizeActionFeedbackProposal({ message: test.msg, confidence: 0.85 }, req);
  const output = result.message;

  const strippedInput = test.msg.replace(/^[""\s]+/, '').replace(/[""\s]+$/, '').trim();
  // A message is "accepted" if the normalizer uses it as-is (not fallback)
  // A message is "rejected" if the normalizer falls back to a different message
  const didAccept = output === test.msg || (strippedInput.length >= 48 && output.includes(strippedInput));

  check(
    test.good ? didAccept : !didAccept,
    'D1-LLMPath',
    `R${roundNumber} ${test.good ? 'good' : 'bad'} LLM: ${test.good ? 'should accept' : 'should reject'} "${test.msg.slice(0, 40)}..."`,
  );

  // Universal checks
  checkNoMatch(output, /系统|AI|模型|评分|内部变量/, 'D1-LLMPath', `R${roundNumber} no system jargon`);
  checkNoMatch(output, /本轮选择|主话题|态度选项/, 'D1-LLMPath', `R${roundNumber} no eval terms`);
  check(output.length >= 40, 'D1-LLMPath', `R${roundNumber} output >= 40 chars`);
}

// ---------------------------------------------------------------------------
// Part 2: "Sounds like human" positive checks
// ---------------------------------------------------------------------------

console.log('\n=== Part 2: "Sounds like human" positive checks ===\n');

const humanChecks = [
  {
    desc: 'owner positive - should have natural lead',
    req: buildRequest({ choice: { ...buildRequest().choice, mood: 'positive' } }),
    expectPatterns: [/我/, /这周|动静|看到了/],
    forbidPatterns: [/系统|AI|模型/, /本轮|主话题/],
  },
  {
    desc: 'owner negative - should have concern',
    req: buildRequest({ choice: { ...buildRequest().choice, mood: 'negative', baseFeedbackMessage: '"我不太满意。"' } }),
    expectPatterns: [/我/, /不踏实|不满意|担心/],
    forbidPatterns: [/系统|AI|模型/, /本轮|主话题/],
  },
  {
    desc: 'owner frustrated - should acknowledge',
    req: buildRequest({ choice: { ...buildRequest().choice, mood: 'negative', baseFeedbackMessage: '"你到底有没有在推？"' } }),
    expectPatterns: [/我|你/, /听到了|知道了|别急/],
    forbidPatterns: [/系统|AI|模型/, /本轮|主话题/],
  },
  {
    desc: 'customer interested - should have curiosity',
    req: buildRequest({
      choice: { ...buildRequest().choice, actor: 'customer', mood: 'positive', baseFeedbackMessage: '"房子还行。"' },
    }),
    expectPatterns: [/我/, /看|房|价格/],
    forbidPatterns: [/业主|挂牌|调价/, /系统|AI|模型/],
  },
  {
    desc: 'customer hesitant - should have doubt',
    req: buildRequest({
      choice: { ...buildRequest().choice, actor: 'customer', mood: 'negative', baseFeedbackMessage: '"再看看吧。"' },
    }),
    expectPatterns: [/我/, /犹豫|看看|再/],
    forbidPatterns: [/业主|挂牌|调价/, /系统|AI|模型/],
  },
  {
    desc: 'market neutral - should be objective',
    req: buildRequest({
      choice: { ...buildRequest().choice, actor: 'market', mood: 'neutral', baseFeedbackMessage: '"有几组客户来看了。"' },
    }),
    expectPatterns: [/反馈|信号|客户|竞品/],
    forbidPatterns: [/我再看看|我跟家里/, /系统|AI|模型/],
  },
];

for (const test of humanChecks) {
  roundNumber++;
  const result = buildFallbackActionFeedbackProposal(test.req);

  for (const pattern of test.expectPatterns) {
    checkHasMatch(result.message, pattern, 'D2-Human', `R${roundNumber} ${test.desc}: should match ${pattern}`);
  }
  for (const pattern of test.forbidPatterns) {
    checkNoMatch(result.message, pattern, 'D2-Human', `R${roundNumber} ${test.desc}: should not match ${pattern}`);
  }

  // Check it feels like a WeChat message (has sentence endings, reasonable length)
  check(result.message.includes('。'), 'D2-Human', `R${roundNumber} ${test.desc}: has sentence endings`);
  check(result.message.length >= 60, 'D2-Human', `R${roundNumber} ${test.desc}: >= 60 chars`);
  check(result.message.length <= 200, 'D2-Human', `R${roundNumber} ${test.desc}: <= 200 chars`);
}

// ---------------------------------------------------------------------------
// Part 3: Exhaustive caseContext combinations
// ---------------------------------------------------------------------------

console.log('\n=== Part 3: Exhaustive caseContext combinations ===\n');

// Generate parameter combinations programmatically
const trustLevels = [20, 40, 60, 80];
const patienceLevels = [15, 35, 55, 75];
const urgencyLevels = [25, 50, 75, 90];
const priceGaps = [-20, 0, 5, 15, 30]; // negative = below market

let comboCount = 0;
for (const trust of trustLevels) {
  for (const patience of patienceLevels) {
    for (const urgency of urgencyLevels) {
      for (const priceGap of priceGaps) {
        comboCount++;
        roundNumber++;
        const marketPrice = 600;
        const askPrice = marketPrice + priceGap;
        const req = buildRequest({
          caseContext: {
            ...buildRequest().caseContext,
            trust,
            patience,
            urgency,
            askPrice,
            marketPrice,
          },
        });
        const result = buildFallbackActionFeedbackProposal(req);

        // Universal checks
        checkNoMatch(result.message, /系统|AI|模型|评分|内部变量/, 'D3-Combo', `R${roundNumber} no system jargon`);
        checkNoMatch(result.message, /本轮选择|主话题|态度选项/, 'D3-Combo', `R${roundNumber} no eval terms`);
        check(result.message.length >= 40, 'D3-Combo', `R${roundNumber} output >= 40 chars`);
        check(result.message.length <= 200, 'D3-Combo', `R${roundNumber} output <= 200 chars`);

        // Price gap check
        if (priceGap > 0) {
          checkHasMatch(result.message, /万|价格|差距|差/, 'D3-Combo', `R${roundNumber} priceGap=${priceGap}: should mention price`);
        } else {
          checkNoMatch(result.message, /市场价差.*万/, 'D3-Combo', `R${roundNumber} priceGap=${priceGap}: should not mention price gap`);
        }

        // High urgency should not say "不急"
        if (urgency >= 75) {
          checkNoMatch(result.message, /不急|先等等|再看看/, 'D3-Combo', `R${roundNumber} urgency=${urgency}: should not say "不急"`);
        }

        // Low trust should not be overly positive
        if (trust <= 25) {
          checkNoMatch(result.message, /很好|非常好|太棒了/, 'D3-Combo', `R${roundNumber} trust=${trust}: should not be overly positive`);
        }
      }
    }
  }
}

console.log(`  Tested ${comboCount} parameter combinations`);

// ---------------------------------------------------------------------------
// Part 4: Multi-turn cumulative conversation effects
// ---------------------------------------------------------------------------

console.log('\n=== Part 4: Multi-turn cumulative effects ===\n');

// Simulate a 5-turn conversation and check consistency
const conversationTurns = [
  { msg: '"听起来这周还不错，继续保持。"', mood: 'positive' as const, desc: 'turn 1: positive start' },
  { msg: '"客户怎么还没出价？我有点担心。"', mood: 'negative' as const, desc: 'turn 2: concern' },
  { msg: '"你到底有没有在推？"', mood: 'negative' as const, desc: 'turn 3: frustrated' },
  { msg: '"好吧，你给我看看数据。"', mood: 'neutral' as const, desc: 'turn 4: accepting' },
  { msg: '"我再跟家里商量一下。"', mood: 'neutral' as const, desc: 'turn 5: deliberating' },
];

const turnOutputs: string[] = [];
for (const turn of conversationTurns) {
  roundNumber++;
  const req = buildRequest({
    choice: {
      ...buildRequest().choice,
      baseFeedbackMessage: turn.msg,
      mood: turn.mood,
    },
  });
  const result = buildFallbackActionFeedbackProposal(req);
  turnOutputs.push(result.message);

  // Each turn should pass basic checks
  checkNoMatch(result.message, /系统|AI|模型|评分|内部变量/, 'D4-MultiTurn', `R${roundNumber} ${turn.desc}: no system jargon`);
  checkNoMatch(result.message, /本轮选择|主话题|态度选项/, 'D4-MultiTurn', `R${roundNumber} ${turn.desc}: no eval terms`);
  check(result.message.length >= 40, 'D4-MultiTurn', `R${roundNumber} ${turn.desc}: >= 40 chars`);
}

// Check that consecutive turns produce different outputs
for (let i = 1; i < turnOutputs.length; i++) {
  roundNumber++;
  check(
    turnOutputs[i] !== turnOutputs[i - 1],
    'D4-MultiTurn',
    `R${roundNumber} turn ${i} and turn ${i + 1} should produce different outputs`,
  );
}

// Check that the conversation has variety (not all outputs are the same)
roundNumber++;
const uniqueOutputs = new Set(turnOutputs);
check(
  uniqueOutputs.size >= 3,
  'D4-MultiTurn',
  `R${roundNumber} 5-turn conversation should have at least 3 unique outputs, got ${uniqueOutputs.size}`,
);

// ---------------------------------------------------------------------------
// Part 5: Normalization pipeline edge cases
// ---------------------------------------------------------------------------

console.log('\n=== Part 5: Normalization pipeline edge cases ===\n');

const normalizationEdgeCases = [
  {
    desc: 'LLM output with extra whitespace (short after stripping)',
    input: '"  这周有动静我知道了，客户反馈和竞品差异你给我摊开看，我不想只听结论，要看依据和数据。  "',
    shouldAccept: false, // Whitespace stripped, too short
  },
  {
    desc: 'LLM output with newlines (short after stripping)',
    input: '"这周有动静我知道了，\n客户反馈和竞品差异你给我摊开看，\n我不想只听结论，要看依据和数据。"',
    shouldAccept: false, // Newlines stripped, too short
  },
  {
    desc: 'LLM output with mixed quotes',
    input: '"这周有动静我知道了，客户反馈和竞品差异你给我摊开看，我不想只听结论，要看依据和数据，你给我说明白。"',
    shouldAccept: true,
  },
  {
    desc: 'LLM output with Chinese punctuation',
    input: '"这周有动静我知道了，客户反馈和竞品差异你给我摊开看，我不想只听结论，要看依据和数据，你给我说明白。"',
    shouldAccept: true,
  },
  {
    desc: 'LLM output that is too short after stripping',
    input: '"这周有动静我知道了，客户反馈和竞品差异你给我摊开看。"',
    shouldAccept: false, // Too short after stripping
  },
  {
    desc: 'LLM output that is long enough after stripping',
    input: '"这周有动静我知道了，客户反馈和竞品差异你给我摊开看，我不想只听结论，要看依据和数据，你给我说明白。"',
    shouldAccept: true,
  },
  {
    desc: 'LLM output with forbidden word as substring',
    input: '"这周有动静，AI-driven的分析显示客户意向在上升，你给我详细说说。"',
    shouldAccept: false,
  },
  {
    desc: 'LLM output with partial UI label',
    input: '"这周有动静，突出进展我看到了，你给我详细说说客户反馈和竞品差异。"',
    shouldAccept: false,
  },
  {
    desc: 'LLM output with evaluation tone',
    input: '"这周有动静，你需要把客户反馈和竞品差异讲清楚，我才能做判断。"',
    shouldAccept: false,
  },
  {
    desc: 'LLM output with template pattern',
    input: '"综合考虑本周带看情况和市场数据，客户反馈和竞品差异你给我摊开看。"',
    shouldAccept: false,
  },
];

for (const test of normalizationEdgeCases) {
  roundNumber++;
  const req = buildRequest();
  const result = normalizeActionFeedbackProposal({ message: test.input, confidence: 0.85 }, req);
  const output = result.message;

  const strippedInput = test.input.replace(/^[""\s]+/, '').replace(/[""\s]+$/, '').trim();
  const didAccept = strippedInput.length > 0
    ? (output === test.input || output.includes(strippedInput))
    : (output !== test.input);

  check(
    test.shouldAccept ? didAccept : !didAccept,
    'D5-Normalization',
    `R${roundNumber} ${test.desc}: ${test.shouldAccept ? 'should accept' : 'should reject'}`,
  );

  // Universal checks
  checkNoMatch(output, /系统|AI|模型|评分|内部变量/, 'D5-Normalization', `R${roundNumber} no system jargon`);
  checkNoMatch(output, /本轮选择|主话题|态度选项/, 'D5-Normalization', `R${roundNumber} no eval terms`);
  check(output.length >= 40, 'D5-Normalization', `R${roundNumber} output >= 40 chars`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(60)}`);
console.log('Complete Benchmark v5 Summary');
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
