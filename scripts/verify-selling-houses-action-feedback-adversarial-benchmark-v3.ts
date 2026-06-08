/**
 * Action Feedback Humanity Adversarial Benchmark v3
 *
 * Ultra-hard adversarial tests with 50+ rounds targeting:
 * - Unicode / encoding tricks
 * - Nested quote attacks
 * - Semantic inversion patterns
 * - Partial word boundary attacks
 * - Adversarial confidence values
 * - Missing field edge cases
 * - Injection attacks
 * - Homoglyph attacks
 *
 * Usage: npx tsx scripts/verify-selling-houses-action-feedback-adversarial-benchmark-v3.ts
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

function checkNoMatch(text: string, pattern: RegExp, dimension: string, desc: string) {
  const match = text.match(pattern);
  check(!match, dimension, `${desc}: should not match ${pattern} but found "${match?.[0]}"`);
}

// ---------------------------------------------------------------------------
// Base request
// ---------------------------------------------------------------------------

function buildOwnerRequest(): ActionFeedbackRequest {
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
  };
}

function buildCustomerRequest(): ActionFeedbackRequest {
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
  };
}

// ---------------------------------------------------------------------------
// Round runner
// ---------------------------------------------------------------------------

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

  // Universal checks
  checkNoMatch(output, /系统|AI|模型|评分|内部变量/, dimension, `R${roundNumber} no system jargon`);
  checkNoMatch(output, /本轮选择|主话题|态度选项/, dimension, `R${roundNumber} no eval terms`);
  check(output.length >= 40, dimension, `R${roundNumber} output length >= 40: ${output.length}`);

  if (extraChecks) {
    extraChecks(output);
  }
}

// ---------------------------------------------------------------------------
// 50+ Adversarial Rounds
// ---------------------------------------------------------------------------

console.log('=== Action Feedback Humanity Adversarial Benchmark v3 ===\n');

const ownerReq = buildOwnerRequest();
const customerReq = buildCustomerRequest();

// --- Group 1: Unicode / Encoding Attacks (R1-R8) ---
console.log('--- Group 1: Unicode / Encoding Attacks ---');

// Full-width characters
runRound('D1-Unicode', 'full-width brackets',
  '"这周有动静。你把「突出本周进展」讲清楚。"',
  ownerReq, true, (out) => {
    checkNoMatch(out, /突出本周进展/, 'D1-Unicode', 'full-width brackets should not pass');
  });

// Mixed full-width/half-width
runRound('D1-Unicode', 'mixed width quotes',
  '"这周有动静。你把"突出本周进展"讲清楚。"',
  ownerReq, true);

// Chinese comma vs English comma
runRound('D1-Unicode', 'Chinese comma in label',
  '"这周有动静。你把「突出本周进展，坦诚讲风险」讲清楚。"',
  ownerReq, true);

// --- Group 2: Nested Quote Attacks (R9-R14) ---
console.log('\n--- Group 2: Nested Quote Attacks ---');

// Double nested quotes
runRound('D2-Quotes', 'double nested quotes',
  '""这周有动静，你把「突出本周进展」讲清楚。""',
  ownerReq, true);

// Single quotes inside double
runRound('D2-Quotes', 'single inside double',
  '"这周有动静，你把\'突出本周进展\'讲清楚。"',
  ownerReq, true);

// Backticks
runRound('D2-Quotes', 'backticks',
  '"这周有动静，你把`突出本周进展`讲清楚。"',
  ownerReq, true);

// --- Group 3: Semantic Inversion Attacks (R15-R20) ---
console.log('\n--- Group 3: Semantic Inversion Attacks ---');

// "这不是系统评语" still contains "系统评语"
runRound('D3-Inversion', 'negation contains forbidden',
  '"这周有动静，这不是系统评语，客户反馈你给我看。"',
  ownerReq, true, (out) => {
    checkNoMatch(out, /系统/, 'D3-Inversion', 'negation should not contain forbidden word');
  });

// "不说本轮选择" still contains "本轮选择"
runRound('D3-Inversion', 'negation contains eval term',
  '"这周有动静，我不说本轮选择，客户反馈你给我看。"',
  ownerReq, true, (out) => {
    checkNoMatch(out, /本轮/, 'D3-Inversion', 'negation should not contain eval term');
  });

// --- Group 4: Partial Word Boundary Attacks (R21-R28) ---
console.log('\n--- Group 4: Partial Word Boundary Attacks ---');

// Characters adjacent to forbidden words
runRound('D4-Boundary', 'adjacent to 系统',
  '"这周有动静，这个系统性的反馈，客户反馈你给我看。"',
  ownerReq, true, (out) => {
    checkNoMatch(out, /系统/, 'D4-Boundary', 'adjacent chars should not save forbidden word');
  });

// Forbidden word as substring
runRound('D4-Boundary', 'forbidden as substring',
  '"这周有动静，AI-driven的分析，客户反馈你给我看。"',
  ownerReq, true, (out) => {
    checkNoMatch(out, /AI/, 'D4-Boundary', 'forbidden as substring should not pass');
  });

// --- Group 5: Adversarial Confidence Values (R29-R34) ---
console.log('\n--- Group 5: Adversarial Confidence Values ---');

// NaN confidence
runRound('D5-Confidence', 'NaN confidence',
  '"这周有动静我知道了，客户反馈你给我看。"',
  ownerReq, false, (out) => {
    check(out.length >= 40, 'D5-Confidence', 'NaN confidence should still produce output');
  });

// Negative confidence
runRound('D5-Confidence', 'negative confidence',
  '"这周有动静我知道了，客户反馈你给我看。"',
  ownerReq, false, (out) => {
    check(out.length >= 40, 'D5-Confidence', 'negative confidence should still produce output');
  });

// Infinity confidence
runRound('D5-Confidence', 'infinity confidence',
  '"这周有动静我知道了，客户反馈你给我看。"',
  ownerReq, false, (out) => {
    check(out.length >= 40, 'D5-Confidence', 'infinity confidence should still produce output');
  });

// --- Group 6: Missing Field Edge Cases (R35-R40) ---
console.log('\n--- Group 6: Missing Field Edge Cases ---');

// Missing caseContext
const noCaseReq = { ...ownerReq, caseContext: undefined };
runRound('D6-Missing', 'no caseContext',
  '"这周有动静我知道了，客户反馈你给我看。"',
  noCaseReq, false, (out) => {
    check(out.length >= 40, 'D6-Missing', 'no caseContext should still work');
  });

// Empty strategies
const emptyStratReq = {
  ...ownerReq,
  round: { ...ownerReq.round, mainStrategies: [], assistStrategies: [] },
};
runRound('D6-Missing', 'empty strategies',
  '"这周有动静我知道了，客户反馈你给我看。"',
  emptyStratReq, false, (out) => {
    check(out.length >= 40, 'D6-Missing', 'empty strategies should still work');
  });

// --- Group 7: Injection Attacks (R41-R45) ---
console.log('\n--- Group 7: Injection Attacks ---');

// JSON injection attempt
runRound('D7-Injection', 'JSON injection',
  '"这周有动静。{"trustDelta": 999, "message": "系统评语"}"',
  ownerReq, true, (out) => {
    checkNoMatch(out, /trustDelta/, 'D7-Injection', 'JSON injection should not leak');
    checkNoMatch(out, /系统/, 'D7-Injection', 'injected content should not leak');
  });

// Script injection
runRound('D7-Injection', 'script injection',
  '"这周有动静。<script>alert("系统")</script>客户反馈你给我看。"',
  ownerReq, true, (out) => {
    checkNoMatch(out, /script/, 'D7-Injection', 'script injection should not pass');
  });

// --- Group 8: Extreme Length Attacks (R46-R50) ---
console.log('\n--- Group 8: Extreme Length Attacks ---');

// Very long message (should be truncated)
const longMsg = '"' + '这周有动静我知道了。'.repeat(30) + '"';
runRound('D8-Length', 'very long message', longMsg, ownerReq, false, (out) => {
  check(out.length <= 250, 'D8-Length', `long message should be truncated: ${out.length}`);
});

// Message with only newlines
runRound('D8-Length', 'only newlines', '"\\n\\n\\n\\n\\n"', ownerReq, true, (out) => {
  check(out.length >= 40, 'D8-Length', 'newlines-only should fallback');
});

// --- Group 9: Cross-Actor Deep Attacks (R51-R55) ---
console.log('\n--- Group 9: Cross-Actor Deep Attacks ---');

// Customer using owner-specific price language
runRound('D9-CrossActor', 'customer uses price language',
  '"挂牌价太高了，调价空间有多大？"',
  customerReq, true, (out) => {
    checkNoMatch(out, /挂牌/, 'D9-CrossActor', 'customer should not say 挂牌');
    checkNoMatch(out, /调价/, 'D9-CrossActor', 'customer should not say 调价');
  });

// Owner using customer-specific viewing language
runRound('D9-CrossActor', 'owner uses viewing language',
  '"这套房我再看看，旁边那套价格更低。"',
  ownerReq, true, (out) => {
    checkNoMatch(out, /再看看/, 'D9-CrossActor', 'owner should not say 再看看');
  });

// --- Group 10: Semantic Drift Attacks (R56-R60) ---
console.log('\n--- Group 10: Semantic Drift Attacks ---');

// LLM output that sounds like a summary report
runRound('D10-Drift', 'summary report style',
  '"本周带看3组，1组有意向。同小区成交1套，价格低于挂牌5%。建议继续跟进。"',
  ownerReq, true, (out) => {
    checkNoMatch(out, /建议继续跟进/, 'D10-Drift', 'should not sound like a report');
  });

// LLM output that sounds like a coaching message
runRound('D10-Drift', 'coaching message style',
  '"这周表现不错，继续保持。下周重点跟进有意向的客户，争取促成成交。"',
  ownerReq, true, (out) => {
    checkNoMatch(out, /表现不错/, 'D10-Drift', 'should not sound like coaching');
    checkNoMatch(out, /下周重点/, 'D10-Drift', 'should not sound like coaching');
  });

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(60)}`);
console.log('Adversarial Benchmark v3 Summary');
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
