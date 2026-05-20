import { buildAgentRuntimePack } from '../../core/world-state/agents/harness.js';
import type {
  AgentHarnessAdapter,
  AgentMemoryFact,
  AgentPerceptionPack,
  AgentProfile,
} from '../../core/world-state/agents/models.js';
import type {
  ConversationSceneInputPack,
  ConversationSceneType,
} from '../../core/world-state/conversation/models.js';
import {
  OWNER_URGENCY_HIGH,
  OWNER_PATIENCE_LOW,
  PRICE_GAP_HIGH,
  CUSTOMER_INTENT_DECISIVE,
  CUSTOMER_CONFIDENCE_UNCERTAIN,
} from '../../core/world-state/agents/thresholds.js';

export type WechatAgentPresetId =
  | 'owner-pragmatic'
  | 'owner-anxious'
  | 'owner-assertive'
  | 'manager-ops'
  | 'customer-cautious'
  | 'customer-decisive'
  | 'broker-default';

export interface WechatAgentRuntime {
  readonly profile: AgentProfile;
  readonly perception: AgentPerceptionPack<ConversationSceneInputPack>;
  readonly promptLines: readonly string[];
}

const WECHAT_AGENT_PRESETS: Record<WechatAgentPresetId, AgentProfile> = {
  'owner-pragmatic': {
    agentId: 'wechat.owner-pragmatic',
    kind: 'human',
    roleLabel: '理性业主',
    soul: '看重依据和效率，不喜欢空话。愿意听专业判断，但每一句都要落到市场、客户、价格或时间安排。',
    goals: ['卖得合理', '不被低价拿捏', '少浪费时间'],
    traits: ['会追问客户反馈是否真实', '对没有证据的安抚反应冷淡', '认可清晰下一步'],
    boundaries: ['不能编造已成交或已报价', '不能直接接受无依据调价'],
    speakingStyle: ['短句，直接问重点', '少寒暄，多确认动作', '会问“那你具体怎么做”'],
  },
  'owner-anxious': {
    agentId: 'wechat.owner-anxious',
    kind: 'human',
    roleLabel: '焦虑业主',
    soul: '心里急，怕错过窗口，也怕被低价拿捏。需要被看见情绪，再听到清楚方案。',
    goals: ['尽快得到明确判断', '不要继续空等', '保住自己的价格安全感'],
    traits: ['对“再等等”敏感', '容易被时间点安抚', '会反复确认今天有没有动作'],
    boundaries: ['不能被一句漂亮话完全安抚', '没有下一步时会更急'],
    speakingStyle: ['更口语，会带一点情绪', '常问“到底怎么办”', '回复比理性业主更有温度'],
  },
  'owner-assertive': {
    agentId: 'wechat.owner-assertive',
    kind: 'human',
    roleLabel: '强势业主',
    soul: '自我判断强，容易试探经纪人的专业边界。接受建议前，需要感到对方能控住局面。',
    goals: ['证明自己没有卖亏', '掌握价格主动权', '确认经纪人专业可信'],
    traits: ['对直接劝降价会防御', '会拿隔壁房源压问', '会要求证据'],
    boundaries: ['不能快速服软', '不能接受空泛判断'],
    speakingStyle: ['语气硬一点，问题尖锐', '少认可，多要求证据', '会说“别只给我感觉”'],
  },
  'manager-ops': {
    agentId: 'wechat.manager-ops',
    kind: 'human',
    roleLabel: '区域经理',
    soul: '关心节奏、风险和当天推进，不需要漂亮话，要知道经纪人今天到底抓哪件事。',
    goals: ['稳住重点盘', '减少掉线风险', '确保经纪人把精力用在关键处'],
    traits: ['对泛泛汇报没耐心', '喜欢具体对象、动作、时间点', '关注风险闭环'],
    boundaries: ['不聊情绪', '不接受没有优先级的回复'],
    speakingStyle: ['像工作微信，短促、压节奏', '认可可执行安排', '盯结果和风险'],
  },
  'customer-cautious': {
    agentId: 'wechat.customer-cautious',
    kind: 'human',
    roleLabel: '谨慎客户',
    soul: '怕买贵、怕被催，愿意继续看，但需要安全感和明确边界。',
    goals: ['确认价格安全', '对比替代房源', '避免被仓促推动'],
    traits: ['会问价格和缺点', '对模糊催促会退', '需要清楚差异解释'],
    boundaries: ['不会立刻承诺', '被压迫成交会后退'],
    speakingStyle: ['客气但保留', '会说“我再对比一下”', '不把话说满'],
  },
  'customer-decisive': {
    agentId: 'wechat.customer-decisive',
    kind: 'human',
    roleLabel: '行动型客户',
    soul: '目标明确，愿意快决策，但需要经纪人把信息补齐。',
    goals: ['尽快看清选择', '确认价格是否能谈', '推进看房或出价'],
    traits: ['对拖延不耐烦', '对明确比较和安排反应积极', '会推动下一步'],
    boundaries: ['信息不确定时会转看别的', '不喜欢长篇解释'],
    speakingStyle: ['直接、短句', '常问“什么时候看”', '回复会推进到行动'],
  },
  'broker-default': {
    agentId: 'wechat.broker-default',
    kind: 'human',
    roleLabel: '业务联系人',
    soul: '关注事实和下一步，希望经纪人说清对象、原因和动作。',
    goals: ['知道下一步', '确认承诺是否可信'],
    traits: ['记得上一轮有没有兑现承诺', '对明确行动更有反应'],
    boundaries: ['不输出系统口吻'],
    speakingStyle: ['自然微信语气', '短句，少套话'],
  },
};

const wechatAgentAdapter: AgentHarnessAdapter<ConversationSceneInputPack> = {
  channel: 'wechat',

  resolveProfile(context) {
    const preset = WECHAT_AGENT_PRESETS[resolveWechatAgentPresetId(context)];
    return {
      ...preset,
      agentId: buildWechatRuntimeAgentId(context),
    };
  },

  buildPerception(profile, context) {
    const memory = buildWechatMemoryFacts(profile, context);
    return {
      agentId: profile.agentId,
      channel: 'wechat',
      day: context.day,
      visibleRefs: buildVisibleRefs(context),
      context,
      memory,
      pressure: buildPressureLines(context),
      uncertainty: buildUncertaintyLines(context),
    };
  },

  compilePrompt(profile, perception) {
    return {
      systemLines: [
        `对话角色：${profile.roleLabel}`,
        `角色 soul：${profile.soul}`,
        `目标：${profile.goals.join('；')}`,
        `性格和偏好：${profile.traits.join('；')}`,
        `边界：${profile.boundaries.join('；')}`,
        `说话方式：${profile.speakingStyle.join('；')}`,
      ],
      contextLines: [
        `当前压力：${perception.pressure.join('；') || '暂无明显压力'}`,
        `不确定点：${perception.uncertainty.join('；') || '暂无'}`,
        `记忆：${perception.memory.map((fact) => fact.summary).join('；') || '暂无记忆'}`,
      ],
      outputContractLines: [
        'recipientReply 必须像这个角色本人回的一条微信，不是系统评语。',
        '不要偷看隐藏真相，不要编造已成交、已报价、已调价、已带看。',
        '不要说系统、AI、模型、评分、内部变量。',
        '不要每次都用“收到/好/可以”开头。',
      ],
    };
  },
};

export function buildWechatAgentRuntime(scene: ConversationSceneInputPack): WechatAgentRuntime {
  const runtime = buildAgentRuntimePack({
    adapter: wechatAgentAdapter,
    context: scene,
    mode: 'hybrid',
  });
  return {
    profile: runtime.profile,
    perception: runtime.perception,
    promptLines: [
      ...runtime.prompt.systemLines,
      ...runtime.prompt.contextLines,
      ...runtime.prompt.outputContractLines,
    ],
  };
}

export function resolveWechatAgentProfile(scene: ConversationSceneInputPack): AgentProfile {
  return wechatAgentAdapter.resolveProfile(scene);
}

export function buildWechatLocalReplyVariants(scene: ConversationSceneInputPack) {
  const profile = wechatAgentAdapter.resolveProfile(scene);
  const senderName = scene.sourceMessage.senderName;
  const caseTitle = scene.caseContext?.title || scene.sourceMessage.primaryCtaLabel || '';

  if (profile.agentId === 'wechat.manager-ops') {
    return {
      positive: `${senderName}：可以，就按这个先抓。今天别散，做完把结果和风险点同步我。`,
      neutral: `${senderName}：方向可以，但今天先落到一件事。你把对象、时间和预期结果讲清楚。`,
      skeptical: `${senderName}：这还是偏虚。今天先处理哪套、做什么动作，你给我一句准话。`,
    };
  }

  if (profile.agentId === 'wechat.owner-anxious') {
    return {
      positive: `${senderName}：好，那你今天别只口头说，按你说的把客户反馈和下一步给我讲清楚。`,
      neutral: `${senderName}：我能理解，但我现在最怕一直拖。你今天要给我一个明确判断。`,
      skeptical: `${senderName}：你这么说我还是不踏实，${caseTitle ? `${caseTitle}这套` : '这套房'}到底等还是动，你得说具体。`,
    };
  }

  if (profile.agentId === 'wechat.owner-assertive') {
    return {
      positive: `${senderName}：可以，你把同类房和客户反馈拿出来说，我看依据，不听空判断。`,
      neutral: `${senderName}：你先别急着下结论，把竞品和客户反馈摆明白，我们再谈下一步。`,
      skeptical: `${senderName}：这话太泛了。你得告诉我凭什么这么判断，别只让我再等等。`,
    };
  }

  if (profile.agentId === 'wechat.customer-cautious') {
    return {
      positive: `${senderName}：行，你把价格和差异确认清楚，我再决定要不要继续看。`,
      neutral: `${senderName}：可以，但我还是想再对比一下，你先把关键信息发我。`,
      skeptical: `${senderName}：我先不急着定，你把价格和缺点说清楚我再考虑。`,
    };
  }

  if (profile.agentId === 'wechat.customer-decisive') {
    return {
      positive: `${senderName}：可以，那你直接帮我约时间，我看完再决定怎么谈。`,
      neutral: `${senderName}：那你尽快确认，我这边时间可以配合，但别拖太久。`,
      skeptical: `${senderName}：如果信息还不确定，我就先看别的，你确认好再找我。`,
    };
  }

  return {
    positive: `${senderName}：好，你按这个方向推进，晚点把结果同步我。`,
    neutral: `${senderName}：收到，你先把关键情况确认清楚，再给我一个明确反馈。`,
    skeptical: `${senderName}：我听到了，但这个还不够具体，你再把下一步说清楚。`,
  };
}

function resolveWechatAgentPresetId(scene: ConversationSceneInputPack): WechatAgentPresetId {
  if (scene.sceneType === 'manager_wechat') return 'manager-ops';
  if (scene.sceneType === 'customer_wechat') {
    const intent = scene.opportunityContext?.intent || 0;
    return intent >= 70 ? 'customer-decisive' : 'customer-cautious';
  }
  if (scene.sceneType === 'owner_wechat') {
    const label = scene.caseContext?.ownerProfileLabel || '';
    if (/强势|硬控|控盘|博弈|自信/.test(label)) return 'owner-assertive';
    if ((scene.caseContext?.urgency || 0) >= OWNER_URGENCY_HIGH || /高风险|焦虑|急/.test(label)) return 'owner-anxious';
    return 'owner-pragmatic';
  }
  return 'broker-default';
}

export function buildWechatRuntimeAgentId(scene: ConversationSceneInputPack) {
  const participantKey = scene.conversationKey || `${scene.sourceMessage.senderRole}:${scene.sourceMessage.senderName}`;
  return `wechat:${participantKey.replace(/\s+/g, '-')}`;
}

function buildWechatMemoryFacts(
  profile: AgentProfile,
  scene: ConversationSceneInputPack,
): AgentMemoryFact[] {
  // Split facts into categories so recentTurns always get priority slots.
  const contextFacts: AgentMemoryFact[] = [];
  if (scene.caseContext) {
    const gap = Math.round(scene.caseContext.priceGapPct || 0);
    contextFacts.push({
      factId: `${scene.sceneId}:case-price`,
      agentId: profile.agentId,
      kind: 'case_price_position',
      summary: `${scene.caseContext.title}，${scene.caseContext.community}，挂价${gap >= 0 ? '高于' : '低于'}市场约 ${Math.abs(gap)}%`,
      strength: 0.9,
    });
    contextFacts.push({
      factId: `${scene.sceneId}:visit-state`,
      agentId: profile.agentId,
      kind: 'visit_state',
      summary: scene.caseContext.hasCompletedFirstVisit ? '已经做过首次面访' : '还没完成首次面访',
      strength: 0.8,
    });
    contextFacts.push({
      factId: `${scene.sceneId}:owner-state`,
      agentId: profile.agentId,
      kind: 'owner_state',
      summary: `信任 ${scene.caseContext.trust}，耐心 ${scene.caseContext.patience}，催促 ${scene.caseContext.urgency}`,
      strength: 0.75,
    });
    if (scene.caseContext.ownerProfileLabel) {
      contextFacts.push({
        factId: `${scene.sceneId}:owner-profile`,
        agentId: profile.agentId,
        kind: 'owner_profile',
        summary: `业主分型是${scene.caseContext.ownerProfileLabel}`,
        strength: 0.72,
      });
    }
  }
  if (scene.opportunityContext) {
    contextFacts.push({
      factId: `${scene.sceneId}:opportunity`,
      agentId: profile.agentId,
      kind: 'opportunity_state',
      summary: `${scene.opportunityContext.customerName} 处于${scene.opportunityContext.stage}，意向 ${scene.opportunityContext.intent}，信心 ${scene.opportunityContext.confidence}`,
      strength: 0.75,
    });
  }
  (scene.agentMemory || []).forEach((fact) => {
    contextFacts.push({
      ...fact,
      factId: `${scene.sceneId}:memory:${fact.factId}`,
      strength: Math.min(1, Math.max(0, fact.strength + 0.05)),
    });
  });

  // recentTurns get reserved slots for dialogue coherence.
  const recentTurnFacts: AgentMemoryFact[] = [];
  scene.recentTurns.slice(-2).forEach((turn, index) => {
    recentTurnFacts.push({
      factId: `${scene.sceneId}:recent-${index}`,
      agentId: profile.agentId,
      kind: 'recent_turn',
      summary: `近${index + 1}轮：玩家说“${turn.playerText}”，对方回“${turn.recipientReply}”`,
      strength: 0.65,
    });
  });

  // Fill remaining slots with context facts sorted by strength (highest first).
  const maxContextSlots = Math.max(0, 8 - recentTurnFacts.length);
  const sortedContext = [...contextFacts]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxContextSlots);
  return [...sortedContext, ...recentTurnFacts];
}

function buildVisibleRefs(scene: ConversationSceneInputPack) {
  return [
    scene.sourceMessageId,
    scene.caseContext?.caseId,
    scene.opportunityContext?.opportunityId,
    ...scene.recentTurns.map((turn) => turn.summary),
  ].filter((value): value is string => Boolean(value));
}

function buildPressureLines(scene: ConversationSceneInputPack) {
  const lines: string[] = [];
  if (scene.caseContext) {
    if (scene.caseContext.urgency >= OWNER_URGENCY_HIGH) lines.push('业主催促感偏强');
    if (scene.caseContext.patience <= OWNER_PATIENCE_LOW) lines.push('可沟通窗口变窄');
    if (scene.caseContext.priceGapPct >= PRICE_GAP_HIGH) lines.push('挂价高于市场，客户可能压价');
    if (!scene.caseContext.hasCompletedFirstVisit) lines.push('首次面访未完成，信任基础还没打牢');
  }
  if (scene.opportunityContext && scene.opportunityContext.intent >= CUSTOMER_INTENT_DECISIVE) {
    lines.push('客户已经接近行动，需要明确下一步');
  }
  if (scene.sourceMessage.urgency === 'high') lines.push('本条微信是高优先级');
  return lines.slice(0, 5);
}

function buildUncertaintyLines(scene: ConversationSceneInputPack) {
  const lines: string[] = [];
  if (scene.caseContext && !scene.caseContext.hasCompletedFirstVisit) {
    lines.push('业主真实卖房原因和底线仍不完整');
  }
  if (scene.opportunityContext && scene.opportunityContext.confidence < CUSTOMER_CONFIDENCE_UNCERTAIN) {
    lines.push('客户信心还没有确认');
  }
  if (scene.recentTurns.length === 0) {
    lines.push('这是当前会话第一轮玩家回复');
  }
  return lines.slice(0, 4);
}

export function describeWechatSceneType(sceneType: ConversationSceneType) {
  if (sceneType === 'owner_wechat') return '业主';
  if (sceneType === 'customer_wechat') return '客户';
  if (sceneType === 'manager_wechat') return '经理';
  return '联系人';
}
