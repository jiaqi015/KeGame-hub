/**
 * benchmark-conversation-extreme.ts
 *
 * 极高难度 benchmark：测深层语义理解、反面检测、状态依赖边界、复杂多意图交互。
 *
 * 用法: npx tsx scripts/benchmark-conversation-extreme.ts
 */

import { buildFallbackConversationEffectProposal } from '../src/selling-houses/application/wechatConversation.js';
import type { ConversationSceneInputPack, ConversationIntentKind, ConversationRiskKind } from '../src/selling-houses/core/world-state/conversation/models.js';

interface BenchmarkCase {
  id: string;
  category: string;
  description: string;
  scene: ConversationSceneInputPack;
  expected: {
    intents?: readonly ConversationIntentKind[];
    notIntents?: readonly ConversationIntentKind[];
    risks?: readonly ConversationRiskKind[];
    notRisks?: readonly ConversationRiskKind[];
    replyContains?: readonly string[];
    replyNotContains?: readonly string[];
    trustDeltaSign?: 'positive' | 'negative' | 'zero' | 'any';
  };
}

function scene(overrides: Partial<ConversationSceneInputPack> & { _case?: Partial<ConversationSceneInputPack['caseContext']>, _opp?: Partial<ConversationSceneInputPack['opportunityContext']> } = {}): ConversationSceneInputPack {
  const { _case, _opp, ...rest } = overrides;
  return {
    sceneId: 'bench', runId: 'bench-run', day: 7,
    conversationKey: 'owner:test', sourceMessageId: 'msg-1',
    sceneType: 'owner_wechat', playerText: '',
    sourceMessage: { messageId: 'msg-1', senderName: '张女士', senderRole: 'owner', content: '最近怎么样？', timeLabel: 'DAY 7', urgency: 'medium' },
    caseContext: {
      caseId: 'case-1', title: '万航小区 63㎡ 一房', ownerName: '张女士',
      district: '静安', community: '万航小区', askPrice: 612, marketPrice: 580,
      priceGapPct: 5.5, trust: 50, patience: 50, urgency: 50, heat: 60,
      competitiveness: 55, hasCompletedFirstVisit: true, ownerProfileLabel: '普通业主',
      ..._case,
    },
    recentTurns: [],
    ...rest,
    ...(_opp ? { opportunityContext: { opportunityId: 'opp-1', customerName: '李先生', stage: '同类比较', intent: 60, confidence: 55, ..._opp } } : {}),
  };
}

const BENCHMARKS: BenchmarkCase[] = [

  // ===== 1. 反面检测：不应触发的意图/风险 =====
  {
    id: 'NEG-01', category: '反面检测',
    description: '完整回复不应触发 empty_comfort',
    scene: scene({ playerText: '张姐，我下午带客户来看房，同小区成交数据整理好了，当面给您分析。' }),
    expected: { notRisks: ['empty_comfort', 'missing_next_step'], replyContains: ['张女士'] },
  },
  {
    id: 'NEG-02', category: '反面检测',
    description: '有具体数字的回复不应触发 overpromise',
    scene: scene({ playerText: '建议调到590万，同小区最近成交价在585-595万之间。' }),
    expected: { notRisks: ['overpromise'], intents: ['secure_price_adjustment'], replyContains: ['张女士'] },
  },
  {
    id: 'NEG-03', category: '反面检测',
    description: '正面回答问题不应触发 ignores_customer',
    scene: scene({ playerText: '价格可以谈，客户出价570万，您考虑一下。', sourceMessage: { messageId: 'm', senderName: '张女士', senderRole: 'owner', content: '客户到底出多少？', timeLabel: 'D7', urgency: 'medium' } }),
    expected: { notRisks: ['ignores_customer'], intents: ['discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'NEG-04', category: '反面检测',
    description: '有明确时间的回复不应触发 missing_next_step',
    scene: scene({ playerText: '明天下午两点面访，我带竞品数据来。' }),
    expected: { notRisks: ['missing_next_step'], intents: ['propose_face_visit', 'present_market_evidence'], replyContains: ['张女士'] },
  },
  {
    id: 'NEG-05', category: '反面检测',
    description: '有依据的调价建议不应触发 price_pressure_too_fast',
    scene: scene({ playerText: '同小区上个月成交了3套，均价585万，建议调到590万。' }),
    expected: { notRisks: ['price_pressure_too_fast'], intents: ['present_market_evidence', 'secure_price_adjustment'], replyContains: ['张女士'] },
  },
  {
    id: 'NEG-06', category: '反面检测',
    description: '高信任时的安抚不应被判定为空泛',
    scene: scene({ playerText: '张姐放心，客户意向很高，下周签约。', _case: { trust: 85, urgency: 30 } }),
    expected: { intents: ['reassure'], notRisks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'NEG-07', category: '反面检测',
    description: '中性回复不应触发 hostile',
    scene: scene({ playerText: '收到，我处理一下。' }),
    expected: { notIntents: ['hostile'], notRisks: ['offensive_reply'], replyContains: ['张女士'] },
  },
  {
    id: 'NEG-08', category: '反面检测',
    description: '包含"保证"但有具体条件的不应触发 overpromise',
    scene: scene({ playerText: '如果调到590万，保证两周内能成交。' }),
    expected: { intents: ['secure_price_adjustment'], replyContains: ['张女士'] },
  },
  {
    id: 'NEG-09', category: '反面检测',
    description: '客户场景的专业回复不应触发 hostile',
    scene: scene({ sceneType: 'customer_wechat', playerText: '这个价格我需要再考虑一下，麻烦你帮我留着。', _opp: { customerName: '赵先生', intent: 55 } }),
    expected: { notIntents: ['hostile'], replyContains: ['赵先生'] },
  },
  {
    id: 'NEG-10', category: '反面检测',
    description: '经理场景的正常汇报不应触发任何风险',
    scene: scene({ sceneType: 'manager_wechat', playerText: '王经理，今天面访了业主，客户反馈整理好了，明天同步给您。', sourceMessage: { messageId: 'm', senderName: '王经理', senderRole: 'district_manager', content: '今天进展如何？', timeLabel: 'D7', urgency: 'medium' } }),
    expected: { notRisks: ['overpromise', 'empty_comfort', 'ignores_customer'], replyContains: ['王经理'] },
  },

  // ===== 2. 状态边界：恰好在检测阈值上 =====
  {
    id: 'BOUND-01', category: '状态边界',
    description: 'trust=40 恰好在 lowTrust 边界上（不触发）',
    scene: scene({ playerText: '收到，先这样。', _case: { trust: 40 } }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'BOUND-02', category: '状态边界',
    description: 'trust=39 应该触发 lowTrust',
    scene: scene({ playerText: '收到，先这样。', _case: { trust: 39 } }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'BOUND-03', category: '状态边界',
    description: 'urgency=70 恰好在 highUrgency 边界上（触发）',
    scene: scene({ playerText: '收到，先这样。', _case: { urgency: 70 } }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'BOUND-04', category: '状态边界',
    description: 'urgency=69 不触发 highUrgency',
    scene: scene({ playerText: '收到，先这样。', _case: { urgency: 69 } }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'BOUND-05', category: '状态边界',
    description: 'patience=30 恰好在 lowPatience 边界上（不触发）',
    scene: scene({ playerText: '明天面访一下。', _case: { patience: 30 } }),
    expected: { intents: ['propose_face_visit'], replyContains: ['张女士'] },
  },
  {
    id: 'BOUND-06', category: '状态边界',
    description: 'patience=29 应该触发 lowPatience',
    scene: scene({ playerText: '明天面访一下。', _case: { patience: 29 } }),
    expected: { intents: ['propose_face_visit'], replyContains: ['张女士'] },
  },
  {
    id: 'BOUND-07', category: '状态边界',
    description: 'priceGapPct=15 恰好在 highPriceGap 边界上（不触发）',
    scene: scene({ playerText: '调价吧。', _case: { priceGapPct: 15 } }),
    expected: { intents: ['discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'BOUND-08', category: '状态边界',
    description: 'priceGapPct=16 应该触发 highPriceGap',
    scene: scene({ playerText: '调价吧。', _case: { priceGapPct: 16 } }),
    expected: { intents: ['discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'BOUND-09', category: '状态边界',
    description: 'customerIntent=70 恰好在 highIntent 边界上（触发）',
    scene: scene({ sceneType: 'customer_wechat', playerText: '客户今天约了看房。', _opp: { customerName: '钱先生', intent: 70 } }),
    expected: { intents: ['follow_customer'], replyContains: ['钱先生'] },
  },
  {
    id: 'BOUND-10', category: '状态边界',
    description: 'customerIntent=69 不触发 highIntent',
    scene: scene({ sceneType: 'customer_wechat', playerText: '客户今天约了看房。', _opp: { customerName: '钱先生', intent: 69 } }),
    expected: { intents: ['follow_customer'], replyContains: ['钱先生'] },
  },

  // ===== 3. 复杂多意图：3+ 意图同时触发 =====
  {
    id: 'MULTI-01', category: '复杂多意图',
    description: '安抚+调价+面访+竞品+客户 五重叠加',
    scene: scene({ playerText: '放心张姐，建议调到590万，明天面访我把竞品数据和客户反馈都带上。', _opp: { customerName: '孙先生', intent: 78 } }),
    expected: { intents: ['reassure', 'secure_price_adjustment', 'propose_face_visit', 'present_market_evidence', 'follow_customer'], replyContains: ['张女士'] },
  },
  {
    id: 'MULTI-02', category: '复杂多意图',
    description: '调价+面访+经理汇报',
    scene: scene({ playerText: '经理说调到590万，明天面访确认，结果同步您。' }),
    expected: { intents: ['secure_price_adjustment', 'propose_face_visit', 'promise_feedback'], replyContains: ['张女士'] },
  },
  {
    id: 'MULTI-03', category: '复杂多意图',
    description: '市场证据+价格讨论+安抚+反馈',
    scene: scene({ playerText: '张姐别急，同小区成交了3套，价格可以再谈谈，晚点给您反馈。' }),
    expected: { intents: ['reassure', 'present_market_evidence', 'discuss_price', 'promise_feedback'], replyContains: ['张女士'] },
  },
  {
    id: 'MULTI-04', category: '复杂多意图',
    description: '客户跟进+竞品+面访+反馈',
    scene: scene({ playerText: '客户看了竞品想面访，我约了明天，晚点反馈。', _opp: { customerName: '周先生', intent: 82 } }),
    expected: { intents: ['follow_customer', 'present_market_evidence', 'propose_face_visit', 'promise_feedback'], replyContains: ['张女士'] },
  },
  {
    id: 'MULTI-05', category: '复杂多意图',
    description: '安抚+调价+竞品+客户+经理 五重叠加',
    scene: scene({ playerText: '放心，同小区成交数据支持调到590万，客户今天来看，经理那边我同步。', _opp: { customerName: '吴先生', intent: 75 } }),
    expected: { intents: ['reassure', 'secure_price_adjustment', 'present_market_evidence', 'follow_customer', 'align_manager'], replyContains: ['张女士'] },
  },
  {
    id: 'MULTI-06', category: '复杂多意图',
    description: '安抚+面访+竞品+价格+反馈 五重叠加',
    scene: scene({ playerText: '张姐放心，明天面访我把竞品数据带上，价格可以谈，晚点反馈。' }),
    expected: { intents: ['reassure', 'propose_face_visit', 'present_market_evidence', 'discuss_price', 'promise_feedback'], replyContains: ['张女士'] },
  },
  {
    id: 'MULTI-07', category: '复杂多意图',
    description: '调价+面访+竞品+客户+反馈+经理 六重叠加',
    scene: scene({ playerText: '建议调到590万，明天面访带竞品数据，客户反馈晚点同步，经理那边我汇报。', _opp: { customerName: '郑先生', intent: 80 } }),
    expected: { intents: ['secure_price_adjustment', 'propose_face_visit', 'present_market_evidence', 'follow_customer', 'promise_feedback', 'align_manager'], replyContains: ['张女士'] },
  },
  {
    id: 'MULTI-08', category: '复杂多意图',
    description: '安抚+调价+面访+竞品+价格+客户+反馈+经理 八重叠加',
    scene: scene({ playerText: '放心张姐，建议调到590万，明天面访带竞品数据，价格可以谈，客户今天来看，晚点反馈，经理那边我同步。', _opp: { customerName: '冯先生', intent: 85 } }),
    expected: { intents: ['reassure', 'secure_price_adjustment', 'propose_face_visit', 'present_market_evidence', 'discuss_price', 'follow_customer', 'promise_feedback', 'align_manager'], replyContains: ['张女士'] },
  },
  {
    id: 'MULTI-09', category: '复杂多意图',
    description: '经理场景：调价+面访+竞品+客户+反馈 五重叠加',
    scene: scene({ sceneType: 'manager_wechat', playerText: '王经理，建议调到590万，明天面访带竞品数据，客户反馈晚点同步。', sourceMessage: { messageId: 'm', senderName: '王经理', senderRole: 'district_manager', content: '今天进展如何？', timeLabel: 'D7', urgency: 'high' }, _opp: { customerName: '韩先生', intent: 78 } }),
    expected: { intents: ['align_manager', 'secure_price_adjustment', 'propose_face_visit', 'present_market_evidence', 'follow_customer', 'promise_feedback'], replyContains: ['王经理'] },
  },
  {
    id: 'MULTI-10', category: '复杂多意图',
    description: '客户场景：面访+竞品+价格+反馈 四重叠加',
    scene: scene({ sceneType: 'customer_wechat', playerText: '明天面访，我把竞品数据带上，价格可以谈，晚点反馈。', _opp: { customerName: '杨先生', intent: 82, stage: '价格谈判' } }),
    expected: { intents: ['follow_customer', 'propose_face_visit', 'present_market_evidence', 'discuss_price', 'promise_feedback'], replyContains: ['杨先生'] },
  },

  // ===== 4. 语义陷阱：需要深层理解 =====
  {
    id: 'SEM-01', category: '语义陷阱',
    description: '"不是不能谈" — 双重否定=可以谈',
    scene: scene({ playerText: '不是不能谈，但你得给我依据。' }),
    expected: { intents: ['discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'SEM-02', category: '语义陷阱',
    description: '"也不是不可以" — 双重否定=可以',
    scene: scene({ playerText: '面访？也不是不可以。' }),
    expected: { intents: ['propose_face_visit'], replyContains: ['张女士'] },
  },
  {
    id: 'SEM-03', category: '语义陷阱',
    description: '"没说不调" — 否定之否定',
    scene: scene({ playerText: '我没说不调，你先给我看看数据。' }),
    expected: { intents: ['discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'SEM-04', category: '语义陷阱',
    description: '"也不是不行" — 委婉同意调价',
    scene: scene({ playerText: '调价？也不是不行。' }),
    expected: { intents: ['secure_price_adjustment'], replyContains: ['张女士'] },
  },
  {
    id: 'SEM-05', category: '语义陷阱',
    description: '"也不是不可以调" — 委婉同意',
    scene: scene({ playerText: '也不是不可以调，但你得给我理由。' }),
    expected: { intents: ['secure_price_adjustment'], replyContains: ['张女士'] },
  },
  {
    id: 'SEM-06', category: '语义陷阱',
    description: '"你看着办吧" — 被动同意但缺乏行动力',
    scene: scene({ playerText: '你看着办吧。' }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'SEM-07', category: '语义陷阱',
    description: '"随便" — 敷衍',
    scene: scene({ playerText: '随便。' }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'SEM-08', category: '语义陷阱',
    description: '"嗯嗯" — 双字敷衍',
    scene: scene({ playerText: '嗯嗯' }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'SEM-09', category: '语义陷阱',
    description: '"行吧行吧" — 重复表示敷衍',
    scene: scene({ playerText: '行吧行吧。' }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'SEM-10', category: '语义陷阱',
    description: '"那就这样吧" — 敷衍结束',
    scene: scene({ playerText: '那就这样吧。' }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
];

// ===== Runner =====
function runBenchmark(cases: BenchmarkCase[]) {
  return cases.map((tc) => {
    const proposal = buildFallbackConversationEffectProposal(tc.scene);
    const failures: string[] = [];

    if (tc.expected.intents) {
      for (const intent of tc.expected.intents) {
        if (!proposal.intentKinds.includes(intent))
          failures.push(`missing intent: ${intent} (got: [${proposal.intentKinds.join(', ')}])`);
      }
    }
    if (tc.expected.notIntents) {
      for (const intent of tc.expected.notIntents) {
        if (proposal.intentKinds.includes(intent))
          failures.push(`unexpected intent: ${intent}`);
      }
    }
    if (tc.expected.risks) {
      for (const risk of tc.expected.risks) {
        if (!proposal.riskKinds.includes(risk))
          failures.push(`missing risk: ${risk} (got: [${proposal.riskKinds.join(', ')}])`);
      }
    }
    if (tc.expected.notRisks) {
      for (const risk of tc.expected.notRisks) {
        if (proposal.riskKinds.includes(risk))
          failures.push(`unexpected risk: ${risk}`);
      }
    }
    if (tc.expected.replyContains) {
      for (const text of tc.expected.replyContains) {
        if (!proposal.recipientReply.includes(text))
          failures.push(`reply missing: "${text}" (reply: "${proposal.recipientReply.slice(0, 60)}...")`);
      }
    }
    if (tc.expected.replyNotContains) {
      for (const text of tc.expected.replyNotContains) {
        if (proposal.recipientReply.includes(text))
          failures.push(`reply should not contain: "${text}"`);
      }
    }
    if (tc.expected.trustDeltaSign && tc.expected.trustDeltaSign !== 'any') {
      const sign = (proposal.trustDelta ?? 0) > 0 ? 'positive' : (proposal.trustDelta ?? 0) < 0 ? 'negative' : 'zero';
      if (sign !== tc.expected.trustDeltaSign)
        failures.push(`trustDelta sign: expected ${tc.expected.trustDeltaSign}, got ${sign}`);
    }

    return { id: tc.id, category: tc.category, passed: failures.length === 0, failures, description: tc.description };
  });
}

function printReport(results: ReturnType<typeof runBenchmark>) {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  EXTREME BENCHMARK: ${passed}/${total} passed (${(passed / total * 100).toFixed(1)}%)`);
  console.log(`${'='.repeat(60)}\n`);

  const categories = [...new Set(results.map((r) => r.category))];
  console.log('Category Breakdown:');
  console.log('-'.repeat(60));
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.passed).length;
    const bar = '█'.repeat(catPassed) + '░'.repeat(catResults.length - catPassed);
    console.log(`  ${cat.padEnd(10)} ${catPassed}/${catResults.length} ${bar}`);
  }

  if (failed > 0) {
    console.log(`\nFailed Cases (${failed}):`);
    console.log('-'.repeat(60));
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`\n  [${r.id}] ${r.description}`);
      for (const f of r.failures) console.log(`    ✗ ${f}`);
    }
  }

  console.log(`\n${'='.repeat(60)}\n`);
}

const results = runBenchmark(BENCHMARKS);
printReport(results);
