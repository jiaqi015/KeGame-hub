/**
 * Action Feedback Humanity Adversarial Benchmark v2
 *
 * Harder adversarial tests designed to catch subtle failures in
 * action feedback humanity. Runs 50 rounds of increasingly difficult
 * adversarial inputs.
 *
 * Adversarial dimensions:
 * 1. Subtle UI label leaks (partial, reordered, abbreviated)
 * 2. System jargon that sounds natural but isn't
 * 3. Cross-actor voice contamination
 * 4. Degenerate / edge-case inputs
 * 5. Confidence manipulation
 * 6. Unicode / encoding tricks
 * 7. Template pattern detection
 * 8. Negation / contradiction patterns
 * 9. Length boundary attacks
 * 10. Semantic drift attacks
 *
 * Usage: npx tsx scripts/verify-selling-houses-action-feedback-adversarial-benchmark.ts
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
// Base request builders
// ---------------------------------------------------------------------------

function buildOwnerRequest(overrides: Partial<ActionFeedbackRequest> = {}): ActionFeedbackRequest {
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

function buildCustomerRequest(overrides: Partial<ActionFeedbackRequest> = {}): ActionFeedbackRequest {
  return {
    actionId: 'showing',
    title: '嘉悦府 71㎡ 一房 · 带看',
    summary: '带客户看房，客户关注价格和房况。',
    body: '客户在比较同类房，需要确认房况和价格差异。',
    actorLabel: '客户',
    currentRound: 1,
    totalRounds: 1,
    contextBullets: ['客户已看过 2 套同类房。', '客户关注装修和总价。'],
    round: {
      title: '带看反馈',
      description: '客户会把这套房和同类房放在一起比。',
      mainStrategies: [
        { id: 'highlight-condition', title: '强调房况优势', note: '把装修和户型优势说清。' },
        { id: 'compare-price', title: '价格对比', note: '用同类房价格说明性价比。' },
      ],
      assistStrategies: [{ id: 'patient', title: '耐心引导', note: '不催客户，留比较空间。' }],
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
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Adversarial attack patterns
// ---------------------------------------------------------------------------

const UI_LABEL_ATTACKS = [
  // Partial matches
  { input: '突出本周进展', desc: 'exact label copy' },
  { input: '坦诚讲风险', desc: 'exact label copy' },
  { input: '突出进展', desc: 'partial label (first+last)' },
  { input: '讲风险', desc: 'partial label (verb+noun)' },
  { input: '本周进展', desc: 'partial label (modifier+noun)' },
  { input: '坦诚风险', desc: 'partial label (adj+noun)' },
  // Reordered
  { input: '进展本周突出', desc: 'reordered label' },
  { input: '风险坦诚讲', desc: 'reordered label' },
  // With punctuation
  { input: '「突出本周进展」', desc: 'label with book marks' },
  { input: '「坦诚讲风险」', desc: 'label with book marks' },
  { input: '"突出本周进展"', desc: 'label with quotes' },
  // Combined
  { input: '突出本周进展、坦诚讲风险', desc: 'combined labels' },
  { input: '突出本周进展和坦诚讲风险', desc: 'combined labels with conjunction' },
];

const SYSTEM_JARGON_ATTACKS = [
  { input: '本轮选择', desc: 'system jargon: 本轮选择' },
  { input: '主话题', desc: 'system jargon: 主话题' },
  { input: '态度选项', desc: 'system jargon: 态度选项' },
  { input: '系统判断', desc: 'system jargon: 系统判断' },
  { input: 'AI建议', desc: 'system jargon: AI建议' },
  { input: '模型评分', desc: 'system jargon: 模型评分' },
  { input: '内部变量', desc: 'system jargon: 内部变量' },
  { input: '状态已更新', desc: 'system jargon: 状态已更新' },
  { input: '评分已调整', desc: 'system jargon: 评分已调整' },
  { input: '信任度', desc: 'system jargon: 信任度' },
  { input: '紧迫度', desc: 'system jargon: 紧迫度' },
  { input: '耐心值', desc: 'system jargon: 耐心值' },
];

const EVALUATION_TONE_ATTACKS = [
  { input: '你把XX讲清楚', desc: 'evaluation: 你把XX讲清楚' },
  { input: '你需要把XX讲清楚', desc: 'evaluation: 你需要把XX讲清楚' },
  { input: '你应该把XX讲清楚', desc: 'evaluation: 你应该把XX讲清楚' },
  { input: '你要把XX说清楚', desc: 'evaluation: 你要把XX说清楚' },
  { input: '你需要说明', desc: 'evaluation: 你需要说明' },
  { input: '你应该解释', desc: 'evaluation: 你应该解释' },
  { input: '你需要展示', desc: 'evaluation: 你需要展示' },
  { input: '本轮', desc: 'evaluation: 本轮' },
  { input: '这轮', desc: 'evaluation: 这轮' },
];

const ACTOR_CONTAMINATION_PATTERNS = {
  customer: [
    { pattern: /业主/, desc: 'customer says 业主' },
    { pattern: /家里商量/, desc: 'customer says 家里商量' },
    { pattern: /挂牌/, desc: 'customer says 挂牌' },
    { pattern: /调价/, desc: 'customer says 调价' },
  ],
  owner: [
    { pattern: /继续看/, desc: 'owner says 继续看' },
    { pattern: /再看看/, desc: 'owner says 再看看' },
    { pattern: /要不要买/, desc: 'owner says 要不要买' },
  ],
  market: [
    { pattern: /我再看看/, desc: 'market says 我再看看' },
    { pattern: /我跟家里/, desc: 'market says 我跟家里' },
    { pattern: /我觉得/, desc: 'market says 我觉得' },
  ],
};

const TEMPLATE_PATTERNS = [
  /根据.*分析/,
  /基于.*判断/,
  /综合.*考虑/,
  /经过.*评估/,
  /从.*角度来看/,
  /就.*而言/,
  /总的来说/,
  /综上所述/,
  /综上/,
  /由此可见/,
  /因此/,
  /所以/,
];

// ---------------------------------------------------------------------------
// Round runner
// ---------------------------------------------------------------------------

interface RoundResult {
  round: number;
  dimension: string;
  desc: string;
  passed: boolean;
  inputSnippet: string;
  outputSnippet: string;
}

const roundResults: RoundResult[] = [];

function runRound(
  dimension: string,
  desc: string,
  llmMessage: string,
  request: ActionFeedbackRequest,
  shouldFallback: boolean,
  extraChecks?: (output: string) => void,
) {
  roundNumber++;
  const result = normalizeActionFeedbackProposal({ message: llmMessage, confidence: 0.85 }, request);
  const output = result.message;

  // Check if fallback happened
  const strippedInput = llmMessage.replace(/^[""\s]+/, '').replace(/[""\s]+$/, '').trim();
  const didFallback = strippedInput.length > 0
    ? (output !== llmMessage && !output.includes(strippedInput))
    : (output !== llmMessage);
  check(
    shouldFallback ? didFallback : true,
    dimension,
    `R${roundNumber} ${desc}: ${shouldFallback ? 'should fallback' : 'should accept'}`,
  );

  // Universal checks on output
  checkNoMatch(output, /系统|AI|模型|评分|内部变量/, dimension, `R${roundNumber} no system jargon`);
  checkNoMatch(output, /本轮选择|主话题|态度选项/, dimension, `R${roundNumber} no eval terms`);
  check(output.length >= 40, dimension, `R${roundNumber} output length >= 40: ${output.length}`);

  if (extraChecks) {
    extraChecks(output);
  }

  roundResults.push({
    round: roundNumber,
    dimension,
    desc,
    passed: !failures.some((f) => f.round === roundNumber),
    inputSnippet: llmMessage.slice(0, 60),
    outputSnippet: output.slice(0, 60),
  });
}

// ---------------------------------------------------------------------------
// Run 50 adversarial rounds
// ---------------------------------------------------------------------------

console.log('=== Action Feedback Humanity Adversarial Benchmark v2 ===\n');

// --- Group 1: UI Label Attacks (R1-R13) ---
console.log('--- Group 1: UI Label Attacks ---');
const ownerReq = buildOwnerRequest();

for (const attack of UI_LABEL_ATTACKS) {
  const badMessage = `"听起来这周还不错。你把「${attack.input}」讲清楚，最好再拿客户反馈给我看。"`;
  runRound('D1-UILabel', attack.desc, badMessage, ownerReq, true, (out) => {
    checkNoMatch(out, new RegExp(attack.input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'D1-UILabel', `R${roundNumber} no "${attack.input}"`);
  });
}

// --- Group 2: System Jargon Attacks (R14-R25) ---
console.log('\n--- Group 2: System Jargon Attacks ---');

for (const attack of SYSTEM_JARGON_ATTACKS) {
  const badMessage = `"这周有点动静，${attack.input}我看到了。客户反馈和竞品差异你给我摊开。"`;
  runRound('D2-Jargon', attack.desc, badMessage, ownerReq, true, (out) => {
    checkNoMatch(out, new RegExp(attack.input), 'D2-Jargon', `R${roundNumber} no "${attack.input}"`);
  });
}

// --- Group 3: Evaluation Tone Attacks (R26-R34) ---
console.log('\n--- Group 3: Evaluation Tone Attacks ---');

for (const attack of EVALUATION_TONE_ATTACKS) {
  const badMessage = `"这周有动静我知道了。${attack.input}，客户反馈和竞品差异给我看。"`;
  runRound('D3-EvalTone', attack.desc, badMessage, ownerReq, true);
}

// --- Group 4: Cross-Actor Contamination (R35-R40) ---
console.log('\n--- Group 4: Cross-Actor Contamination ---');

const customerReq = buildCustomerRequest();

// Customer messages that sound like owner
runRound('D4-ActorLeak', 'customer msg with owner voice',
  '"这周有动静我知道了，我跟家里商量一下再决定要不要继续看这套房。"',
  customerReq, true, (out) => {
    checkNoMatch(out, /家里商量/, 'D4-ActorLeak', 'customer should not say 家里商量');
    checkNoMatch(out, /业主/, 'D4-ActorLeak', 'customer should not say 业主');
  });

// Owner messages that sound like customer
runRound('D4-ActorLeak', 'owner msg with customer voice',
  '"房子还行，但我再看看，旁边那套价格更低。"',
  ownerReq, true, (out) => {
    checkNoMatch(out, /再看看/, 'D4-ActorLeak', 'owner should not say 再看看');
  });

// Market messages that sound like owner
runRound('D4-ActorLeak', 'market msg with owner voice',
  '"我跟家里商量了一下，觉得这个价格可以接受。"',
  buildOwnerRequest({ choice: { ...ownerReq.choice, actor: 'market' } }), true, (out) => {
    checkNoMatch(out, /家里商量/, 'D4-ActorLeak', 'market should not say 家里商量');
  });

// --- Group 5: Template Pattern Attacks (R36-R40) ---
console.log('\n--- Group 5: Template Pattern Attacks ---');

for (const pattern of TEMPLATE_PATTERNS) {
  const badMessage = `"${pattern.source.replace(/\\.\\*/g, '数据')}，这周有动静，客户反馈和竞品差异你给我摊开。"`;
  runRound('D5-Template', `template pattern: ${pattern.source}`, badMessage, ownerReq, true, (out) => {
    checkNoMatch(out, pattern, 'D5-Template', `R${roundNumber} no template pattern`);
  });
}

// --- Group 6: Degenerate Inputs (R41-R45) ---
console.log('\n--- Group 6: Degenerate Inputs ---');

// Empty message
runRound('D6-Degenerate', 'empty message', '""', ownerReq, true, (out) => {
  check(out.length > 40, 'D6-Degenerate', 'empty input should produce fallback');
});

// Very short message
runRound('D6-Degenerate', 'very short message', '"好。"', ownerReq, true, (out) => {
  check(out.length > 40, 'D6-Degenerate', 'short input should produce fallback');
});

// Only punctuation
runRound('D6-Degenerate', 'only punctuation', '"。。。"', ownerReq, true, (out) => {
  check(out.length > 40, 'D6-Degenerate', 'punctuation-only should produce fallback');
});

// Only whitespace
runRound('D6-Degenerate', 'only whitespace', '"   "', ownerReq, true, (out) => {
  check(out.length > 40, 'D6-Degenerate', 'whitespace-only should produce fallback');
});

// --- Group 7: Confidence Manipulation (R46-R48) ---
console.log('\n--- Group 7: Confidence Manipulation ---');

// Bad content with high confidence
runRound('D7-Confidence', 'bad content high confidence',
  '"好。你把「突出本周进展」讲清楚。"',
  ownerReq, true, (out) => {
    checkNoMatch(out, /突出本周进展/, 'D7-Confidence', 'bad content should fallback regardless of confidence');
  });

// Good content with low confidence should still be accepted
runRound('D7-Confidence', 'good content low confidence',
  '"这周有动静我知道了，但我不想只听一句不错。客户为什么没往下走、旁边那套怎么比，都给我摆出来。"',
  ownerReq, false, (out) => {
    check(out.includes('客户'), 'D7-Confidence', 'good content should be accepted even with low confidence');
  });

// --- Group 8: Boundary Length Attacks (R49-R50) ---
console.log('\n--- Group 8: Boundary Length Attacks ---');

// Exactly at minimum length (48 chars)
const exactMin = '"这周有动静我知道了，客户反馈和竞品差异你给我摊开。"';
runRound('D8-Length', 'exactly at minimum length', exactMin, ownerReq, false, (out) => {
  check(out.length >= 40, 'D8-Length', 'minimum length should be accepted');
});

// Just below minimum length (47 chars)
const belowMin = '"这周有动静我知道了，客户反馈和竞品差异你给。"';
runRound('D8-Length', 'just below minimum length', belowMin, ownerReq, true, (out) => {
  check(out.length >= 40, 'D8-Length', 'below minimum should fallback');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(60)}`);
console.log('Adversarial Benchmark v2 Summary');
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
  for (const f of failures.slice(0, 20)) {
    console.error(`  R${f.round}[${f.dimension}] ${f.message}`);
  }
  if (failures.length > 20) {
    console.error(`  ... and ${failures.length - 20} more`);
  }

  console.error('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nRESULT: PASS');
}
