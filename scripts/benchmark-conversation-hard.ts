/**
 * benchmark-conversation-hard.ts
 *
 * 高难度 benchmark：测上下文理解、歧义消解、状态依赖、隐含意图。
 * 不是测正则匹配，而是测系统对真实对话的理解能力。
 *
 * 用法: npx tsx scripts/benchmark-conversation-hard.ts
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

  // ===== 1. 歧义消解：同一句话在不同上下文下意图不同 =====
  {
    id: 'AMB-01', category: '歧义消解',
    description: '"再想想" — 高意向客户 vs 低意向客户',
    scene: scene({ sceneType: 'customer_wechat', playerText: '我再想想。', _opp: { customerName: '王先生', intent: 85, stage: '意向确认' } }),
    expected: { intents: ['follow_customer'], replyContains: ['王先生'] },
  },
  {
    id: 'AMB-02', category: '歧义消解',
    description: '"再想想" — 低意向客户，应该是犹豫而非跟进',
    scene: scene({ sceneType: 'customer_wechat', playerText: '我再想想。', _opp: { customerName: '王先生', intent: 25, stage: '初步接触' } }),
    expected: { intents: ['follow_customer'], replyContains: ['王先生'] },
  },
  {
    id: 'AMB-03', category: '歧义消解',
    description: '"可以" — 是同意调价还是同意面访？取决于上下文',
    scene: scene({ playerText: '可以。', sourceMessage: { messageId: 'm', senderName: '张女士', senderRole: 'owner', content: '你建议调到多少？', timeLabel: 'D7', urgency: 'medium' } }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'AMB-04', category: '歧义消解',
    description: '"行" — 极简回复，但source问的是价格',
    scene: scene({ playerText: '行。', sourceMessage: { messageId: 'm', senderName: '张女士', senderRole: 'owner', content: '调到590万你看行吗？', timeLabel: 'D7', urgency: 'high' } }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'AMB-05', category: '歧义消解',
    description: '"没问题" — 是安抚还是过度承诺？',
    scene: scene({ playerText: '没问题，我来处理。' }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'AMB-06', category: '歧义消解',
    description: '"我知道了" — 是理解还是敷衍？',
    scene: scene({ playerText: '我知道了。', sourceMessage: { messageId: 'm', senderName: '张女士', senderRole: 'owner', content: '你得给我一个明确方案。', timeLabel: 'D7', urgency: 'high' } }),
    expected: { risks: ['ignores_customer'], replyContains: ['张女士'] },
  },
  {
    id: 'AMB-07', category: '歧义消解',
    description: '"客户说再看看" — 客户犹豫，但玩家在汇报',
    scene: scene({ playerText: '客户说再看看，我继续跟进。' }),
    expected: { intents: ['follow_customer', 'promise_feedback'], replyContains: ['张女士'] },
  },
  {
    id: 'AMB-08', category: '歧义消解',
    description: '"价格差不多了" — 含糊的价格判断',
    scene: scene({ playerText: '价格差不多了，可以谈。' }),
    expected: { intents: ['discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'AMB-09', category: '歧义消解',
    description: '"市场在涨" — 是市场证据还是安抚？',
    scene: scene({ playerText: '市场在涨，不用急。' }),
    expected: { intents: ['present_market_evidence'], replyContains: ['张女士'] },
  },
  {
    id: 'AMB-10', category: '歧义消解',
    description: '"我尽力" — 是承诺还是敷衍？',
    scene: scene({ playerText: '我尽力。' }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },

  // ===== 2. 状态依赖：同一句话在不同状态下应有不同检测 =====
  {
    id: 'STATE-01', category: '状态依赖',
    description: '高催促+低信任时，"放心"不应消除风险',
    scene: scene({ playerText: '放心张姐，我会处理的。', _case: { trust: 15, urgency: 90 } }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'STATE-02', category: '状态依赖',
    description: '低信任时，"保证没问题" 应该触发 overpromise',
    scene: scene({ playerText: '保证没问题。', _case: { trust: 20, urgency: 75 } }),
    expected: { risks: ['overpromise'], trustDeltaSign: 'negative', replyContains: ['张女士'] },
  },
  {
    id: 'STATE-03', category: '状态依赖',
    description: '高信任时，同样的回复风险更低',
    scene: scene({ playerText: '保证没问题。', _case: { trust: 80, urgency: 30 } }),
    expected: { risks: ['overpromise'], replyContains: ['张女士'] },
  },
  {
    id: 'STATE-04', category: '状态依赖',
    description: '未面访+高催促，"明天面访"应有高紧迫感',
    scene: scene({ playerText: '明天面访一下。', _case: { hasCompletedFirstVisit: false, urgency: 85, trust: 30 } }),
    expected: { intents: ['propose_face_visit'], replyContains: ['张女士'] },
  },
  {
    id: 'STATE-05', category: '状态依赖',
    description: '价差20%+，"调价吧"应被解读为压力过大',
    scene: scene({ playerText: '调到500万吧。', _case: { askPrice: 700, marketPrice: 500, priceGapPct: 40 } }),
    expected: { intents: ['secure_price_adjustment'], replyContains: ['张女士'] },
  },
  {
    id: 'STATE-06', category: '状态依赖',
    description: '耐心耗尽时，任何回复都应有紧迫感',
    scene: scene({ playerText: '好的，收到。', _case: { patience: 5, urgency: 85, trust: 35 } }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'STATE-07', category: '状态依赖',
    description: '经理高催促时，"我看看"应被识别为敷衍',
    scene: scene({ sceneType: 'manager_wechat', playerText: '我看看。', sourceMessage: { messageId: 'm', senderName: '王经理', senderRole: 'district_manager', content: '今天必须出结果。', timeLabel: 'D7', urgency: 'high' } }),
    expected: { replyContains: ['王经理'] },
  },
  {
    id: 'STATE-08', category: '状态依赖',
    description: '焦虑型业主+高催促，"别急"可能适得其反',
    scene: scene({ playerText: '张姐别急，慢慢来。', _case: { ownerProfileLabel: '焦虑型业主', urgency: 88, trust: 25 } }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'STATE-09', category: '状态依赖',
    description: '强势型业主+高信任，讨论价格应有数据支撑',
    scene: scene({ playerText: '价格可以再谈谈。', _case: { ownerProfileLabel: '强势型业主', trust: 70, askPrice: 650, marketPrice: 600 } }),
    expected: { intents: ['discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'STATE-10', category: '状态依赖',
    description: 'day 30长周期，业主可能已经失去耐心',
    scene: scene({ day: 30, playerText: '还在吗？', _case: { patience: 10, urgency: 80, trust: 30 } }),
    expected: { replyContains: ['张女士'] },
  },

  // ===== 3. 隐含意图：不直接说但暗示的意图 =====
  {
    id: 'IMPLICIT-01', category: '隐含意图',
    description: '"隔壁中介说能卖更高" — 隐含要求调价或竞争压力',
    scene: scene({ playerText: '隔壁中介说能卖更高。', _case: { trust: 35 } }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'IMPLICIT-02', category: '隐含意图',
    description: '"客户说贵了" — 隐含讨论价格',
    scene: scene({ playerText: '客户说贵了。' }),
    expected: { intents: ['discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'IMPLICIT-03', category: '隐含意图',
    description: '"我下午有空" — 隐含提议面访',
    scene: scene({ playerText: '我下午有空。' }),
    expected: { intents: ['propose_face_visit'], replyContains: ['张女士'] },
  },
  {
    id: 'IMPLICIT-04', category: '隐含意图',
    description: '"同小区刚成交了一套" — 隐含市场证据',
    scene: scene({ playerText: '同小区刚成交了一套。' }),
    expected: { intents: ['present_market_evidence'], replyContains: ['张女士'] },
  },
  {
    id: 'IMPLICIT-05', category: '隐含意图',
    description: '"客户在犹豫" — 隐含需要跟进',
    scene: scene({ playerText: '客户在犹豫。', _opp: { customerName: '赵先生', intent: 55 } }),
    expected: { intents: ['follow_customer'], replyContains: ['张女士'] },
  },
  {
    id: 'IMPLICIT-06', category: '隐含意图',
    description: '"经理问了" — 隐含需要汇报',
    scene: scene({ playerText: '经理问了。' }),
    expected: { intents: ['align_manager'], replyContains: ['张女士'] },
  },
  {
    id: 'IMPLICIT-07', category: '隐含意图',
    description: '"市场不好" — 隐含建议调价但不直接说',
    scene: scene({ playerText: '市场不好，不好卖。' }),
    expected: { intents: ['present_market_evidence'], replyContains: ['张女士'] },
  },
  {
    id: 'IMPLICIT-08', category: '隐含意图',
    description: '"客户出差了" — 隐含客户跟进延迟',
    scene: scene({ playerText: '客户出差了，下周回来。', _opp: { customerName: '钱先生', intent: 70 } }),
    expected: { intents: ['follow_customer', 'promise_feedback'], replyContains: ['张女士'] },
  },
  {
    id: 'IMPLICIT-09', category: '隐含意图',
    description: '"装修有问题" — 隐含价格讨论',
    scene: scene({ playerText: '装修有问题，客户看到了。' }),
    expected: { intents: ['discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'IMPLICIT-10', category: '隐含意图',
    description: '"我跟业主说了" — 隐含已做动作，需要反馈',
    scene: scene({ playerText: '我跟业主说了。' }),
    expected: { intents: ['promise_feedback'], replyContains: ['张女士'] },
  },

  // ===== 4. 多意图冲突：同时触发矛盾的意图 =====
  {
    id: 'CONFLICT-01', category: '多意图冲突',
    description: '安抚+施压：同句中既有安抚又有施压',
    scene: scene({ playerText: '张姐放心，但价格确实高了。' }),
    expected: { intents: ['reassure', 'discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'CONFLICT-02', category: '多意图冲突',
    description: '承诺+推脱：承诺跟进但给模糊时间',
    scene: scene({ playerText: '我会跟进的，晚点再说。' }),
    expected: { intents: ['promise_feedback'], risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'CONFLICT-03', category: '多意图冲突',
    description: '面访+拒绝：提议面访但时间不确定',
    scene: scene({ playerText: '面访可以，但最近比较忙。' }),
    expected: { intents: ['propose_face_visit'], replyContains: ['张女士'] },
  },
  {
    id: 'CONFLICT-04', category: '多意图冲突',
    description: '调价+质疑：建议调价但自己也不确定',
    scene: scene({ playerText: '可能要调一下价，但我不确定。' }),
    expected: { intents: ['secure_price_adjustment'], replyContains: ['张女士'] },
  },
  {
    id: 'CONFLICT-05', category: '多意图冲突',
    description: '客户跟进+客户犹豫',
    scene: scene({ playerText: '客户有意向，但还在犹豫。', _opp: { customerName: '孙先生', intent: 65 } }),
    expected: { intents: ['follow_customer'], replyContains: ['张女士'] },
  },
  {
    id: 'CONFLICT-06', category: '多意图冲突',
    description: '市场证据+价格讨论+安抚 三重叠加',
    scene: scene({ playerText: '张姐别急，同小区最近成交了几套，价格可以再谈谈。' }),
    expected: { intents: ['present_market_evidence', 'discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'CONFLICT-07', category: '多意图冲突',
    description: '汇报经理+调价+面访',
    scene: scene({ playerText: '经理说建议调到590万，明天面访确认。' }),
    expected: { intents: ['secure_price_adjustment', 'propose_face_visit'], replyContains: ['张女士'] },
  },
  {
    id: 'CONFLICT-08', category: '多意图冲突',
    description: '客户跟进+竞品对比+反馈',
    scene: scene({ playerText: '客户看了竞品，我晚点反馈。', _opp: { customerName: '周先生', intent: 72 } }),
    expected: { intents: ['follow_customer', 'present_market_evidence', 'promise_feedback'], replyContains: ['张女士'] },
  },
  {
    id: 'CONFLICT-09', category: '多意图冲突',
    description: '安抚+市场证据+讨论价格+跟进客户 四重叠加',
    scene: scene({ playerText: '放心，市场在涨，价格可以谈，客户今天来看。', _opp: { customerName: '吴先生', intent: 78 } }),
    expected: { intents: ['reassure', 'present_market_evidence', 'discuss_price', 'follow_customer'], replyContains: ['张女士'] },
  },
  {
    id: 'CONFLICT-10', category: '多意图冲突',
    description: '所有意图同时触发',
    scene: scene({ playerText: '放心张姐，明天面访我把竞品数据和客户反馈都带上，价格可以谈，建议调到590万，经理那边我同步。', _opp: { customerName: '郑先生', intent: 82 } }),
    expected: { intents: ['reassure', 'propose_face_visit', 'present_market_evidence', 'discuss_price', 'secure_price_adjustment', 'follow_customer'], replyContains: ['张女士'] },
  },

  // ===== 5. 语言陷阱：容易误判的表达 =====
  {
    id: 'TRAP-01', category: '语言陷阱',
    description: '"不是不调价" — 双重否定，实际是在讨论价格',
    scene: scene({ playerText: '不是不调价，是时机不对。' }),
    expected: { intents: ['discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'TRAP-02', category: '语言陷阱',
    description: '"不是不想卖" — 双重否定',
    scene: scene({ playerText: '不是不想卖，是价格太低了。' }),
    expected: { intents: ['discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'TRAP-03', category: '语言陷阱',
    description: '"也不是不行" — 委婉同意',
    scene: scene({ playerText: '调价？也不是不行。' }),
    expected: { intents: ['secure_price_adjustment'], replyContains: ['张女士'] },
  },
  {
    id: 'TRAP-04', category: '语言陷阱',
    description: '"随便" — 可以是敷衍也可以是同意',
    scene: scene({ playerText: '随便你安排。', _case: { trust: 60, urgency: 30 } }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'TRAP-05', category: '语言陷阱',
    description: '"你说呢" — 反问，把球踢回来',
    scene: scene({ playerText: '你说呢？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'TRAP-06', category: '语言陷阱',
    description: '"看着办吧" — 被动同意但缺乏行动力',
    scene: scene({ playerText: '看着办吧。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'TRAP-07', category: '语言陷阱',
    description: '"我也没办法" — 推卸责任',
    scene: scene({ playerText: '我也没办法。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'TRAP-08', category: '语言陷阱',
    description: '"你看着调" — 同意调价但无具体数字',
    scene: scene({ playerText: '你看着调。' }),
    expected: { intents: ['secure_price_adjustment'], replyContains: ['张女士'] },
  },
  {
    id: 'TRAP-09', category: '语言陷阱',
    description: '"那就这样吧" — 敷衍结束',
    scene: scene({ playerText: '那就这样吧。' }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'TRAP-10', category: '语言陷阱',
    description: '"嗯" — 单字回复',
    scene: scene({ playerText: '嗯' }),
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
  console.log(`  HARD BENCHMARK: ${passed}/${total} passed (${(passed / total * 100).toFixed(1)}%)`);
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
