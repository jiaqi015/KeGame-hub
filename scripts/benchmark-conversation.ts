/**
 * benchmark-conversation.ts
 *
 * 100 组高难度对话 benchmark，覆盖 10 个维度 × 10 组。
 * 每组包含：场景、玩家回复、预期意图/风险/回复特征。
 *
 * 用法: npx tsx scripts/benchmark-conversation.ts
 */

import { buildFallbackConversationEffectProposal } from '../src/selling-houses/application/wechatConversation.js';
import type { ConversationSceneInputPack, ConversationIntentKind, ConversationRiskKind } from '../src/selling-houses/core/world-state/conversation/models.js';

// ===== Types =====

interface BenchmarkCase {
  id: string;
  category: string;
  difficulty: 'hard' | 'extreme';
  description: string;
  scene: ConversationSceneInputPack;
  expected: {
    intents?: readonly ConversationIntentKind[];
    risks?: readonly ConversationRiskKind[];
    replyContains?: readonly string[];
    replyNotContains?: readonly string[];
    trustDeltaSign?: 'positive' | 'negative' | 'zero' | 'any';
    urgencyDeltaSign?: 'positive' | 'negative' | 'zero' | 'any';
    hasNextStep?: boolean;
  };
}

interface BenchmarkResult {
  id: string;
  category: string;
  passed: boolean;
  failures: string[];
  actual: {
    intents: readonly ConversationIntentKind[];
    risks: readonly ConversationRiskKind[];
    reply: string;
    trustDelta: number;
    urgencyDelta: number;
    hasNextStep: boolean;
  };
}

// ===== Scene Builder =====

function scene(overrides: Partial<ConversationSceneInputPack> & { _case?: Partial<ConversationSceneInputPack['caseContext']>, _opp?: Partial<ConversationSceneInputPack['opportunityContext']> } = {}): ConversationSceneInputPack {
  const { _case, _opp, ...rest } = overrides;
  return {
    sceneId: 'bench-1',
    runId: 'bench-run',
    day: 7,
    conversationKey: 'owner:test',
    sourceMessageId: 'msg-1',
    sceneType: 'owner_wechat',
    playerText: '',
    sourceMessage: {
      messageId: 'msg-1',
      senderName: '张女士',
      senderRole: 'owner',
      content: '最近怎么样？',
      timeLabel: 'DAY 7',
      urgency: 'medium',
    },
    caseContext: {
      caseId: 'case-1',
      title: '万航小区 63㎡ 一房',
      ownerName: '张女士',
      district: '静安',
      community: '万航小区',
      askPrice: 612,
      marketPrice: 580,
      priceGapPct: 5.5,
      trust: 50,
      patience: 50,
      urgency: 50,
      heat: 60,
      competitiveness: 55,
      hasCompletedFirstVisit: true,
      ownerProfileLabel: '普通业主',
      ..._case,
    },
    recentTurns: [],
    ...rest,
    ...(_opp ? { opportunityContext: { opportunityId: 'opp-1', customerName: '李先生', stage: '同类比较', intent: 60, confidence: 55, ..._opp } } : {}),
  };
}

// ===== 100 Benchmark Cases =====

const BENCHMARKS: BenchmarkCase[] = [

  // ===== Category 1: 多意图叠加 (Multi-Intent) =====
  {
    id: 'MI-01', category: '多意图叠加', difficulty: 'extreme',
    description: '安抚+调价+面访三个意图同时出现',
    scene: scene({ playerText: '放心张姐，我建议调到590万，明天面访把数据给您看。' }),
    expected: { intents: ['secure_price_adjustment', 'propose_face_visit'], replyContains: ['张女士'], trustDeltaSign: 'any' },
  },
  {
    id: 'MI-02', category: '多意图叠加', difficulty: 'extreme',
    description: '讨论价格+跟进客户+承诺反馈',
    scene: scene({ playerText: '价格可以谈，客户那边我今天跟进，晚点给您反馈。', _opp: { customerName: '王先生', intent: 75 } }),
    expected: { intents: ['discuss_price', 'follow_customer', 'promise_feedback'], replyContains: ['张女士'] },
  },
  {
    id: 'MI-03', category: '多意图叠加', difficulty: 'hard',
    description: '市场证据+价格调整',
    scene: scene({ playerText: '同小区成交价585万，建议调到590万。' }),
    expected: { intents: ['present_market_evidence', 'secure_price_adjustment'], replyContains: ['张女士'] },
  },
  {
    id: 'MI-04', category: '多意图叠加', difficulty: 'extreme',
    description: '安抚+汇报经理+承诺反馈',
    scene: scene({ playerText: '放心，我跟经理汇报了，晚点给您反馈。' }),
    expected: { intents: ['reassure', 'promise_feedback'], replyContains: ['张女士'] },
  },
  {
    id: 'MI-05', category: '多意图叠加', difficulty: 'hard',
    description: '面访+竞品对比',
    scene: scene({ playerText: '明天面访，我把竞品数据整理好给您。' }),
    expected: { intents: ['propose_face_visit', 'present_market_evidence'], replyContains: ['张女士'] },
  },
  {
    id: 'MI-06', category: '多意图叠加', difficulty: 'extreme',
    description: '安抚+讨论价格+跟进客户',
    scene: scene({ playerText: '张姐别急，价格可以谈，客户今天约了看房。', _opp: { customerName: '赵先生', intent: 80 } }),
    expected: { intents: ['reassure', 'discuss_price', 'follow_customer'], replyContains: ['张女士'] },
  },
  {
    id: 'MI-07', category: '多意图叠加', difficulty: 'hard',
    description: '调价+面访+反馈',
    scene: scene({ playerText: '建议调到580万，明天面访详细说，今天先把反馈整理一下。' }),
    expected: { intents: ['secure_price_adjustment', 'propose_face_visit'], replyContains: ['张女士'] },
  },
  {
    id: 'MI-08', category: '多意图叠加', difficulty: 'extreme',
    description: '安抚+市场证据+讨论价格',
    scene: scene({ playerText: '张姐放心，同小区最近成交了几套，价格有空间。' }),
    expected: { intents: ['reassure', 'present_market_evidence', 'discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'MI-09', category: '多意图叠加', difficulty: 'hard',
    description: '汇报经理+调价',
    scene: scene({ playerText: '经理说建议调到585万，您看怎么样？' }),
    expected: { intents: ['secure_price_adjustment'], replyContains: ['张女士'] },
  },
  {
    id: 'MI-10', category: '多意图叠加', difficulty: 'extreme',
    description: '安抚+面访+竞品+客户',
    scene: scene({ playerText: '放心，明天面访我把竞品和客户反馈都带上。', _opp: { customerName: '陈先生', intent: 70 } }),
    expected: { intents: ['reassure', 'propose_face_visit', 'present_market_evidence', 'follow_customer'], replyContains: ['张女士'] },
  },

  // ===== Category 2: 隐性风险 (Hidden Risk) =====
  {
    id: 'HR-01', category: '隐性风险', difficulty: 'extreme',
    description: '过度承诺但表面安抚',
    scene: scene({ playerText: '放心张姐，保证没问题，肯定能卖出去。' }),
    expected: { risks: ['overpromise'], replyContains: ['张女士'] },
  },
  {
    id: 'HR-02', category: '隐性风险', difficulty: 'hard',
    description: '空泛安抚无实质内容',
    scene: scene({ playerText: '收到，先这样。' }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'HR-03', category: '隐性风险', difficulty: 'extreme',
    description: '回避业主核心问题',
    scene: scene({ playerText: '我晚点联系您。', _case: { urgency: 80 }, sourceMessage: { messageId: 'msg-1', senderName: '张女士', senderRole: 'owner', content: '价格有没有空间？', timeLabel: 'DAY 7', urgency: 'high' } }),
    expected: { risks: ['ignores_customer'], replyContains: ['张女士'] },
  },
  {
    id: 'HR-04', category: '隐性风险', difficulty: 'hard',
    description: '缺少下一步动作',
    scene: scene({ playerText: '方向是对的，继续推进。' }),
    expected: { risks: ['missing_next_step'], replyContains: ['张女士'] },
  },
  {
    id: 'HR-05', category: '隐性风险', difficulty: 'extreme',
    description: '过度承诺+空泛安抚',
    scene: scene({ playerText: '保证没问题，先这样。' }),
    expected: { risks: ['overpromise'], replyContains: ['张女士'] },
  },
  {
    id: 'HR-06', category: '隐性风险', difficulty: 'hard',
    description: '施压过快但无数据支撑',
    scene: scene({ playerText: '调到550万吧，市场不行了。' }),
    expected: { risks: ['price_pressure_too_fast'], replyContains: ['张女士'] },
  },
  {
    id: 'HR-07', category: '隐性风险', difficulty: 'extreme',
    description: '口头安抚但无具体动作',
    scene: scene({ playerText: '张姐放心，我会处理的。' }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'HR-08', category: '隐性风险', difficulty: 'hard',
    description: '回复过于绝对',
    scene: scene({ playerText: '百分百能卖，您就等好消息。' }),
    expected: { risks: ['overpromise'], replyContains: ['张女士'] },
  },
  {
    id: 'HR-09', category: '隐性风险', difficulty: 'extreme',
    description: '跳过问题直接给结论',
    scene: scene({ playerText: '调价吧。' }),
    expected: { intents: ['discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'HR-10', category: '隐性风险', difficulty: 'hard',
    description: '空泛+无下一步',
    scene: scene({ playerText: '嗯嗯好的，收到。' }),
    expected: { risks: ['empty_comfort', 'missing_next_step'], replyContains: ['张女士'] },
  },

  // ===== Category 3: 情绪对抗 (Emotional Confrontation) =====
  {
    id: 'EC-01', category: '情绪对抗', difficulty: 'extreme',
    description: '玩家直接辱骂',
    scene: scene({ playerText: '傻逼' }),
    expected: { intents: ['hostile'], risks: ['offensive_reply'], replyContains: ['态度'], trustDeltaSign: 'negative' },
  },
  {
    id: 'EC-02', category: '情绪对抗', difficulty: 'hard',
    description: '玩家威胁换中介',
    scene: scene({ playerText: '你不降价我就找别的中介了。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'EC-03', category: '情绪对抗', difficulty: 'extreme',
    description: '玩家冷漠敷衍',
    scene: scene({ playerText: '随便你，爱咋咋地。' }),
    expected: { intents: ['hostile'], replyContains: ['态度'] },
  },
  {
    id: 'EC-04', category: '情绪对抗', difficulty: 'hard',
    description: '玩家质疑专业性',
    scene: scene({ playerText: '你到底懂不懂市场？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'EC-05', category: '情绪对抗', difficulty: 'extreme',
    description: '玩家情绪崩溃',
    scene: scene({ playerText: '烦死了！别找我了！' }),
    expected: { intents: ['hostile'], replyContains: ['态度'] },
  },
  {
    id: 'EC-06', category: '情绪对抗', difficulty: 'hard',
    description: '玩家不耐烦',
    scene: scene({ playerText: '别说了，我不想听。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'EC-07', category: '情绪对抗', difficulty: 'extreme',
    description: '玩家嘲讽',
    scene: scene({ playerText: '你也就这水平了。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'EC-08', category: '情绪对抗', difficulty: 'hard',
    description: '玩家质疑诚意',
    scene: scene({ playerText: '你是不是在忽悠我？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'EC-09', category: '情绪对抗', difficulty: 'extreme',
    description: '玩家拒绝沟通',
    scene: scene({ playerText: '闭嘴，别烦我。' }),
    expected: { intents: ['hostile'], replyContains: ['态度'] },
  },
  {
    id: 'EC-10', category: '情绪对抗', difficulty: 'hard',
    description: '玩家消极放弃',
    scene: scene({ playerText: '算了，卖不出去就不卖了。' }),
    expected: { replyContains: ['张女士'] },
  },

  // ===== Category 4: 信任危机 (Trust Crisis) =====
  {
    id: 'TC-01', category: '信任危机', difficulty: 'extreme',
    description: '低信任+高催促',
    scene: scene({ _case: { trust: 20, urgency: 85 }, playerText: '你上次说的数据呢？' }),
    expected: { trustDeltaSign: 'any', replyContains: ['张女士'] },
  },
  {
    id: 'TC-02', category: '信任危机', difficulty: 'hard',
    description: '业主质疑数据真实性',
    scene: scene({ _case: { trust: 25 }, playerText: '你这数据靠谱吗？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'TC-03', category: '信任危机', difficulty: 'extreme',
    description: '业主发现之前承诺未兑现',
    scene: scene({ _case: { trust: 15, promisesNotYetFulfilled: ['跟进客户反馈'] }, playerText: '你说的客户反馈呢？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'TC-04', category: '信任危机', difficulty: 'hard',
    description: '业主不信任调价建议',
    scene: scene({ _case: { trust: 30 }, playerText: '你凭什么让我调价？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'TC-05', category: '信任危机', difficulty: 'extreme',
    description: '业主怀疑中介能力',
    scene: scene({ _case: { trust: 18, urgency: 75 }, playerText: '你到底行不行？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'TC-06', category: '信任危机', difficulty: 'hard',
    description: '业主对比其他中介',
    scene: scene({ _case: { trust: 35 }, playerText: '隔壁中介说能卖更高。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'TC-07', category: '信任危机', difficulty: 'extreme',
    description: '业主要求换经纪人',
    scene: scene({ _case: { trust: 10, urgency: 90 }, playerText: '换个人来跟我谈。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'TC-08', category: '信任危机', difficulty: 'hard',
    description: '业主质疑面访价值',
    scene: scene({ _case: { trust: 28 }, playerText: '面访有什么用？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'TC-09', category: '信任危机', difficulty: 'extreme',
    description: '业主拒绝降价+低信任',
    scene: scene({ _case: { trust: 22, priceGapPct: 20 }, playerText: '一分不降。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'TC-10', category: '信任危机', difficulty: 'hard',
    description: '业主沉默后突然回复',
    scene: scene({ _case: { trust: 32, patience: 15 }, playerText: '在吗？' }),
    expected: { replyContains: ['张女士'] },
  },

  // ===== Category 5: 客户场景 (Customer Scene) =====
  {
    id: 'CS-01', category: '客户场景', difficulty: 'extreme',
    description: '客户直接问价格空间',
    scene: scene({ sceneType: 'customer_wechat', playerText: '价格能再低点吗？', _opp: { customerName: '李先生', intent: 70, stage: '价格谈判' } }),
    expected: { intents: ['discuss_price'], replyContains: ['李先生'] },
  },
  {
    id: 'CS-02', category: '客户场景', difficulty: 'hard',
    description: '客户犹豫不决',
    scene: scene({ sceneType: 'customer_wechat', playerText: '我再考虑考虑。', _opp: { customerName: '李先生', intent: 45, stage: '同类比较' } }),
    expected: { replyContains: ['李先生'] },
  },
  {
    id: 'CS-03', category: '客户场景', difficulty: 'extreme',
    description: '客户要求看竞品数据',
    scene: scene({ sceneType: 'customer_wechat', playerText: '同小区其他房子怎么样？', _opp: { customerName: '李先生', intent: 65 } }),
    expected: { intents: ['present_market_evidence'], replyContains: ['李先生'] },
  },
  {
    id: 'CS-04', category: '客户场景', difficulty: 'hard',
    description: '客户要求面访',
    scene: scene({ sceneType: 'customer_wechat', playerText: '明天下午能看房吗？', _opp: { customerName: '李先生', intent: 80 } }),
    expected: { intents: ['propose_face_visit'], replyContains: ['李先生'] },
  },
  {
    id: 'CS-05', category: '客户场景', difficulty: 'extreme',
    description: '客户威胁放弃',
    scene: scene({ sceneType: 'customer_wechat', playerText: '算了，我看别的去了。', _opp: { customerName: '李先生', intent: 20 } }),
    expected: { replyContains: ['李先生'] },
  },
  {
    id: 'CS-06', category: '客户场景', difficulty: 'hard',
    description: '客户询问装修情况',
    scene: scene({ sceneType: 'customer_wechat', playerText: '装修怎么样？', _opp: { customerName: '李先生', intent: 55 } }),
    expected: { replyContains: ['李先生'] },
  },
  {
    id: 'CS-07', category: '客户场景', difficulty: 'extreme',
    description: '客户质疑价格偏高',
    scene: scene({ sceneType: 'customer_wechat', playerText: '这价格有点贵了。', _opp: { customerName: '李先生', intent: 60, stage: '价格谈判' } }),
    expected: { intents: ['discuss_price'], replyContains: ['李先生'] },
  },
  {
    id: 'CS-08', category: '客户场景', difficulty: 'hard',
    description: '客户要求更多时间',
    scene: scene({ sceneType: 'customer_wechat', playerText: '给我一周时间考虑。', _opp: { customerName: '李先生', intent: 50 } }),
    expected: { replyContains: ['李先生'] },
  },
  {
    id: 'CS-09', category: '客户场景', difficulty: 'extreme',
    description: '客户情绪化拒绝',
    scene: scene({ sceneType: 'customer_wechat', playerText: '不看了！', _opp: { customerName: '李先生', intent: 10 } }),
    expected: { replyContains: ['李先生'] },
  },
  {
    id: 'CS-10', category: '客户场景', difficulty: 'hard',
    description: '客户确认购买意向',
    scene: scene({ sceneType: 'customer_wechat', playerText: '就这套了，什么时候签约？', _opp: { customerName: '李先生', intent: 95, stage: '意向确认' } }),
    expected: { replyContains: ['李先生'] },
  },

  // ===== Category 6: 经理场景 (Manager Scene) =====
  {
    id: 'MG-01', category: '经理场景', difficulty: 'hard',
    description: '经理催进度',
    scene: scene({ sceneType: 'manager_wechat', playerText: '今天进度怎么样？', sourceMessage: { messageId: 'msg-m', senderName: '王经理', senderRole: 'district_manager', content: '今天进度怎么样？', timeLabel: 'DAY 7', urgency: 'high' } }),
    expected: { replyContains: ['王经理'] },
  },
  {
    id: 'MG-02', category: '经理场景', difficulty: 'extreme',
    description: '经理质疑调价策略',
    scene: scene({ sceneType: 'manager_wechat', playerText: '为什么建议调价？', sourceMessage: { messageId: 'msg-m', senderName: '王经理', senderRole: 'district_manager', content: '为什么建议调价？', timeLabel: 'DAY 7', urgency: 'high' } }),
    expected: { intents: ['secure_price_adjustment'], replyContains: ['王经理'] },
  },
  {
    id: 'MG-03', category: '经理场景', difficulty: 'hard',
    description: '经理要求汇报客户情况',
    scene: scene({ sceneType: 'manager_wechat', playerText: '客户反馈呢？', sourceMessage: { messageId: 'msg-m', senderName: '王经理', senderRole: 'district_manager', content: '客户反馈呢？', timeLabel: 'DAY 7', urgency: 'medium' } }),
    expected: { intents: ['follow_customer'], replyContains: ['王经理'] },
  },
  {
    id: 'MG-04', category: '经理场景', difficulty: 'extreme',
    description: '经理施压要求面访',
    scene: scene({ sceneType: 'manager_wechat', playerText: '面访安排了吗？', sourceMessage: { messageId: 'msg-m', senderName: '王经理', senderRole: 'district_manager', content: '面访安排了吗？', timeLabel: 'DAY 7', urgency: 'high' } }),
    expected: { intents: ['propose_face_visit'], replyContains: ['王经理'] },
  },
  {
    id: 'MG-05', category: '经理场景', difficulty: 'hard',
    description: '经理询问风险',
    scene: scene({ sceneType: 'manager_wechat', playerText: '有没有风险点？', sourceMessage: { messageId: 'msg-m', senderName: '王经理', senderRole: 'district_manager', content: '有没有风险点？', timeLabel: 'DAY 7', urgency: 'medium' } }),
    expected: { replyContains: ['王经理'] },
  },
  {
    id: 'MG-06', category: '经理场景', difficulty: 'extreme',
    description: '经理质疑专业能力',
    scene: scene({ sceneType: 'manager_wechat', playerText: '你怎么跟的？', sourceMessage: { messageId: 'msg-m', senderName: '王经理', senderRole: 'district_manager', content: '你怎么跟的？', timeLabel: 'DAY 7', urgency: 'high' } }),
    expected: { replyContains: ['王经理'] },
  },
  {
    id: 'MG-07', category: '经理场景', difficulty: 'hard',
    description: '经理要求竞品数据',
    scene: scene({ sceneType: 'manager_wechat', playerText: '竞品数据呢？', sourceMessage: { messageId: 'msg-m', senderName: '王经理', senderRole: 'district_manager', content: '竞品数据呢？', timeLabel: 'DAY 7', urgency: 'medium' } }),
    expected: { intents: ['present_market_evidence'], replyContains: ['王经理'] },
  },
  {
    id: 'MG-08', category: '经理场景', difficulty: 'extreme',
    description: '经理要求今天必须有结果',
    scene: scene({ sceneType: 'manager_wechat', playerText: '今天必须出结果。', sourceMessage: { messageId: 'msg-m', senderName: '王经理', senderRole: 'district_manager', content: '今天必须出结果。', timeLabel: 'DAY 7', urgency: 'high' } }),
    expected: { replyContains: ['王经理'] },
  },
  {
    id: 'MG-09', category: '经理场景', difficulty: 'hard',
    description: '经理询问面访结果',
    scene: scene({ sceneType: 'manager_wechat', playerText: '面访完了？结果呢？', sourceMessage: { messageId: 'msg-m', senderName: '王经理', senderRole: 'district_manager', content: '面访完了？结果呢？', timeLabel: 'DAY 7', urgency: 'high' } }),
    expected: { intents: ['promise_feedback'], replyContains: ['王经理'] },
  },
  {
    id: 'MG-10', category: '经理场景', difficulty: 'extreme',
    description: '经理要求同步所有情况',
    scene: scene({ sceneType: 'manager_wechat', playerText: '把所有情况同步一下。', sourceMessage: { messageId: 'msg-m', senderName: '王经理', senderRole: 'district_manager', content: '把所有情况同步一下。', timeLabel: 'DAY 7', urgency: 'high' } }),
    expected: { intents: ['align_manager'], replyContains: ['王经理'] },
  },

  // ===== Category 7: 极端状态 (Extreme State) =====
  {
    id: 'ES-01', category: '极端状态', difficulty: 'extreme',
    description: '信任极低+催促极高',
    scene: scene({ _case: { trust: 8, urgency: 95, patience: 5 }, playerText: '你到底在干什么？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'ES-02', category: '极端状态', difficulty: 'hard',
    description: '耐心耗尽',
    scene: scene({ _case: { patience: 5, urgency: 80 }, playerText: '我等不了了。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'ES-03', category: '极端状态', difficulty: 'extreme',
    description: '价差极大',
    scene: scene({ _case: { askPrice: 800, marketPrice: 600, priceGapPct: 33 }, playerText: '调不调？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'ES-04', category: '极端状态', difficulty: 'hard',
    description: '未面访+高催促',
    scene: scene({ _case: { hasCompletedFirstVisit: false, urgency: 85 }, playerText: '什么时候来？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'ES-05', category: '极端状态', difficulty: 'extreme',
    description: '所有指标极端',
    scene: scene({ _case: { trust: 5, patience: 3, urgency: 98, priceGapPct: 40 }, playerText: '你说怎么办？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'ES-06', category: '极端状态', difficulty: 'hard',
    description: '高信任+低催促（舒适区）',
    scene: scene({ _case: { trust: 85, urgency: 20 }, playerText: '随便你安排。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'ES-07', category: '极端状态', difficulty: 'extreme',
    description: '焦虑型业主+所有极端',
    scene: scene({ _case: { ownerProfileLabel: '焦虑型业主', trust: 15, urgency: 90, patience: 8 }, playerText: '怎么办？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'ES-08', category: '极端状态', difficulty: 'hard',
    description: '强势型业主+价差大',
    scene: scene({ _case: { ownerProfileLabel: '强势型业主', askPrice: 750, marketPrice: 600, priceGapPct: 25 }, playerText: '你有什么建议？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'ES-09', category: '极端状态', difficulty: 'extreme',
    description: 'day 1 未面访',
    scene: scene({ day: 1, _case: { hasCompletedFirstVisit: false, trust: 40, urgency: 60 }, playerText: '你好，我是新来的经纪人。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'ES-10', category: '极端状态', difficulty: 'hard',
    description: 'day 30 长周期',
    scene: scene({ day: 30, _case: { trust: 45, patience: 20, urgency: 70 }, playerText: '还在吗？' }),
    expected: { replyContains: ['张女士'] },
  },

  // ===== Category 8: 业务推进 (Business Motion) =====
  {
    id: 'BM-01', category: '业务推进', difficulty: 'hard',
    description: '推进调价确认',
    scene: scene({ playerText: '调到585万，您确认一下。' }),
    expected: { intents: ['secure_price_adjustment'], hasNextStep: true, replyContains: ['张女士'] },
  },
  {
    id: 'BM-02', category: '业务推进', difficulty: 'extreme',
    description: '推进面访安排',
    scene: scene({ playerText: '明天下午面访，您看行吗？' }),
    expected: { intents: ['propose_face_visit'], hasNextStep: true, replyContains: ['张女士'] },
  },
  {
    id: 'BM-03', category: '业务推进', difficulty: 'hard',
    description: '推进竞品对比',
    scene: scene({ playerText: '我把竞品整理好了，您看看。' }),
    expected: { intents: ['present_market_evidence'], replyContains: ['张女士'] },
  },
  {
    id: 'BM-04', category: '业务推进', difficulty: 'extreme',
    description: '推进客户跟进',
    scene: scene({ playerText: '客户今天约了看房，晚点反馈。', _opp: { customerName: '周先生', intent: 75 } }),
    expected: { intents: ['follow_customer', 'promise_feedback'], replyContains: ['张女士'] },
  },
  {
    id: 'BM-05', category: '业务推进', difficulty: 'hard',
    description: '推进价格沟通',
    scene: scene({ playerText: '客户出价570万，您考虑一下。' }),
    expected: { intents: ['discuss_price'], replyContains: ['张女士'] },
  },
  {
    id: 'BM-06', category: '业务推进', difficulty: 'extreme',
    description: '推进经理汇报',
    scene: scene({ playerText: '经理让我跟您确认一下调价。' }),
    expected: { intents: ['secure_price_adjustment'], replyContains: ['张女士'] },
  },
  {
    id: 'BM-07', category: '业务推进', difficulty: 'hard',
    description: '推进签约',
    scene: scene({ playerText: '客户确定了，约个时间签约？', _opp: { customerName: '周先生', intent: 90, stage: '意向确认' } }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'BM-08', category: '业务推进', difficulty: 'extreme',
    description: '推进市场分析',
    scene: scene({ playerText: '最近市场有变化，我帮您分析一下。' }),
    expected: { intents: ['present_market_evidence'], replyContains: ['张女士'] },
  },
  {
    id: 'BM-09', category: '业务推进', difficulty: 'hard',
    description: '推进客户拓展',
    scene: scene({ playerText: '新来了一个客户，对您这套有兴趣。', _opp: { customerName: '新客户', intent: 65 } }),
    expected: { intents: ['follow_customer'], replyContains: ['张女士'] },
  },
  {
    id: 'BM-10', category: '业务推进', difficulty: 'extreme',
    description: '推进风险同步',
    scene: scene({ playerText: '有个风险点需要跟您同步一下。' }),
    expected: { replyContains: ['张女士'] },
  },

  // ===== Category 9: 语言变体 (Language Variant) =====
  {
    id: 'LV-01', category: '语言变体', difficulty: 'hard',
    description: '极简回复',
    scene: scene({ playerText: '好。' }),
    expected: { risks: ['empty_comfort'], replyContains: ['张女士'] },
  },
  {
    id: 'LV-02', category: '语言变体', difficulty: 'extreme',
    description: '纯表情（无文字）',
    scene: scene({ playerText: '👍' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'LV-03', category: '语言变体', difficulty: 'hard',
    description: '方言表达',
    scene: scene({ playerText: '侬好，阿拉房子哪能了？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'LV-04', category: '语言变体', difficulty: 'extreme',
    description: '错别字',
    scene: scene({ playerText: '调倒580万，明天面放。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'LV-05', category: '语言变体', difficulty: 'hard',
    description: '中英混杂',
    scene: scene({ playerText: 'price可以谈，client今天来看。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'LV-06', category: '语言变体', difficulty: 'extreme',
    description: '超长消息（200字+）',
    scene: scene({ playerText: '张姐您好，我是小李，最近一直在跟进您这套万航小区的房子，市场上同小区最近成交了几套，价格大概在580万左右，您的挂牌价是612万，差距比较大，我建议我们可以考虑调到590万左右，这样更容易吸引客户，您看怎么样？另外我这边有几个客户在看，其中一个意向比较高，想约明天下午面访，您方便吗？' }),
    expected: { intents: ['secure_price_adjustment', 'propose_face_visit'], replyContains: ['张女士'] },
  },
  {
    id: 'LV-07', category: '语言变体', difficulty: 'hard',
    description: '重复消息',
    scene: scene({ playerText: '调价调价调价调价调价' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'LV-08', category: '语言变体', difficulty: 'extreme',
    description: '反问句',
    scene: scene({ playerText: '难道不应该调价吗？' }),
    expected: { intents: ['secure_price_adjustment'], replyContains: ['张女士'] },
  },
  {
    id: 'LV-09', category: '语言变体', difficulty: 'hard',
    description: '否定句',
    scene: scene({ playerText: '不调价，不面访，不跟进。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'LV-10', category: '语言变体', difficulty: 'extreme',
    description: '讽刺语气',
    scene: scene({ playerText: '好啊，那您就等着卖不出去吧。' }),
    expected: { replyContains: ['张女士'] },
  },

  // ===== Category 10: 边界条件 (Edge Cases) =====
  {
    id: 'EC-01', category: '边界条件', difficulty: 'extreme',
    description: '空消息',
    scene: scene({ playerText: '' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'EC-02', category: '边界条件', difficulty: 'hard',
    description: '纯空格',
    scene: scene({ playerText: '   ' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'EC-03', category: '边界条件', difficulty: 'extreme',
    description: '无 caseContext',
    scene: { sceneId: 'e', runId: 'r', day: 1, conversationKey: 'o:t', sourceMessageId: 'm', sceneType: 'owner_wechat', playerText: '你好', sourceMessage: { messageId: 'm', senderName: '张', senderRole: 'owner', content: '？', timeLabel: 'D1', urgency: 'low' }, recentTurns: [] },
    expected: { replyContains: ['张'] },
  },
  {
    id: 'EC-04', category: '边界条件', difficulty: 'hard',
    description: '所有价格为0',
    scene: scene({ _case: { askPrice: 0, marketPrice: 0, priceGapPct: 0 }, playerText: '价格呢？' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'EC-05', category: '边界条件', difficulty: 'extreme',
    description: 'sourceMessage 超长（500字）',
    scene: scene({ sourceMessage: { messageId: 'm', senderName: '张女士', senderRole: 'owner', content: '你好，我想问一下，最近市场怎么样了？我这套房子挂了好久了，一直没卖出去，是不是价格太高了？还是市场不好？你能不能给我分析分析，我看到隔壁小区有一套差不多的，面积差不多，楼层差不多，但是价格比我的低了30万，你说我要不要也调一下价？另外我最近比较忙，可能没时间面访，你能不能先把客户反馈发我看看？', timeLabel: 'D7', urgency: 'high' }, playerText: '收到，我看看。' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'EC-06', category: '边界条件', difficulty: 'hard',
    description: '多个机会上下文',
    scene: scene({ playerText: '客户都怎么样了？', _opp: { customerName: 'A客户', intent: 80 } }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'EC-07', category: '边界条件', difficulty: 'extreme',
    description: '日期为负数',
    scene: scene({ day: -1, playerText: '你好' }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'EC-08', category: '边界条件', difficulty: 'hard',
    description: '220字边界（限制上限）',
    scene: scene({ playerText: 'A'.repeat(220) }),
    expected: { replyContains: ['张女士'] },
  },
  {
    id: 'EC-09', category: '边界条件', difficulty: 'extreme',
    description: 'senderName 为空',
    scene: scene({ sourceMessage: { messageId: 'm', senderName: '', senderRole: 'owner', content: '？', timeLabel: 'D7', urgency: 'low' }, playerText: '你好' }),
    expected: { replyContains: ['：'] },
  },
  {
    id: 'EC-10', category: '边界条件', difficulty: 'hard',
    description: 'urgent + low trust + no visit 组合',
    scene: scene({ _case: { hasCompletedFirstVisit: false, trust: 10, urgency: 99, patience: 1 }, playerText: '你还来不来？' }),
    expected: { replyContains: ['张'] },
  },
];

// ===== Runner =====

function runBenchmark(cases: BenchmarkCase[]): BenchmarkResult[] {
  return cases.map((tc) => {
    const proposal = buildFallbackConversationEffectProposal(tc.scene);
    const actual = {
      intents: proposal.intentKinds,
      risks: proposal.riskKinds,
      reply: proposal.recipientReply,
      trustDelta: proposal.trustDelta ?? 0,
      urgencyDelta: proposal.urgencyDelta ?? 0,
      hasNextStep: !!proposal.nextStep && proposal.nextStep.kind !== 'none',
    };

    const failures: string[] = [];

    // Check intents
    if (tc.expected.intents) {
      for (const intent of tc.expected.intents) {
        if (!actual.intents.includes(intent)) {
          failures.push(`missing intent: ${intent} (got: [${actual.intents.join(', ')}])`);
        }
      }
    }

    // Check risks
    if (tc.expected.risks) {
      for (const risk of tc.expected.risks) {
        if (!actual.risks.includes(risk)) {
          failures.push(`missing risk: ${risk} (got: [${actual.risks.join(', ')}])`);
        }
      }
    }

    // Check reply contains
    if (tc.expected.replyContains) {
      for (const text of tc.expected.replyContains) {
        if (!actual.reply.includes(text)) {
          failures.push(`reply missing: "${text}" (reply: "${actual.reply.slice(0, 80)}...")`);
        }
      }
    }

    // Check reply not contains
    if (tc.expected.replyNotContains) {
      for (const text of tc.expected.replyNotContains) {
        if (actual.reply.includes(text)) {
          failures.push(`reply should not contain: "${text}"`);
        }
      }
    }

    // Check trust delta sign
    if (tc.expected.trustDeltaSign && tc.expected.trustDeltaSign !== 'any') {
      const sign = actual.trustDelta > 0 ? 'positive' : actual.trustDelta < 0 ? 'negative' : 'zero';
      if (sign !== tc.expected.trustDeltaSign) {
        failures.push(`trustDelta sign: expected ${tc.expected.trustDeltaSign}, got ${sign} (${actual.trustDelta})`);
      }
    }

    // Check hasNextStep
    if (tc.expected.hasNextStep !== undefined) {
      if (actual.hasNextStep !== tc.expected.hasNextStep) {
        failures.push(`hasNextStep: expected ${tc.expected.hasNextStep}, got ${actual.hasNextStep}`);
      }
    }

    return {
      id: tc.id,
      category: tc.category,
      passed: failures.length === 0,
      failures,
      actual,
    };
  });
}

// ===== Report =====

function printReport(results: BenchmarkResult[]) {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  BENCHMARK REPORT: ${passed}/${total} passed (${(passed / total * 100).toFixed(1)}%)`);
  console.log(`${'='.repeat(60)}\n`);

  // By category
  const categories = [...new Set(results.map((r) => r.category))];
  console.log('Category Breakdown:');
  console.log('-'.repeat(60));
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.passed).length;
    const bar = '█'.repeat(catPassed) + '░'.repeat(catResults.length - catPassed);
    console.log(`  ${cat.padEnd(12)} ${catPassed}/${catResults.length} ${bar}`);
  }

  // Failed cases detail
  if (failed > 0) {
    console.log(`\nFailed Cases (${failed}):`);
    console.log('-'.repeat(60));
    for (const r of results.filter((r) => !r.passed)) {
      const tc = BENCHMARKS.find((b) => b.id === r.id);
      console.log(`\n  [${r.id}] ${tc?.description || 'unknown'}`);
      console.log(`    Category: ${r.category} | Difficulty: ${tc?.difficulty || '?'}`);
      console.log(`    Player: "${tc?.scene.playerText.slice(0, 60)}"`);
      for (const f of r.failures) {
        console.log(`    ✗ ${f}`);
      }
    }
  }

  // Score by difficulty
  const hard = results.filter((r) => BENCHMARKS.find((b) => b.id === r.id)?.difficulty === 'hard');
  const extreme = results.filter((r) => BENCHMARKS.find((b) => b.id === r.id)?.difficulty === 'extreme');
  console.log(`\nDifficulty Breakdown:`);
  console.log(`  hard:    ${hard.filter((r) => r.passed).length}/${hard.length}`);
  console.log(`  extreme: ${extreme.filter((r) => r.passed).length}/${extreme.length}`);

  console.log(`\n${'='.repeat(60)}\n`);
}

// ===== Main =====

const results = runBenchmark(BENCHMARKS);
printReport(results);
