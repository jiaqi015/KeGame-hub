import { buildAgentRuntimePack } from '../../core/world-state/agents/harness.js';
import { resolveAgentPromptPreset, type AgentPromptPresetId } from '../../core/world-state/agents/promptCatalog.js';
import { resolveAgentToolManifest } from '../../core/world-state/agents/toolRegistry.js';
import type {
  AgentChannel,
  AgentHarnessAdapter,
  AgentMemoryFact,
  AgentPerceptionPack,
  AgentProfile,
} from '../../core/world-state/agents/models.js';
import type { ActionAdviceRequest } from '../actionDecisionAdvice.js';

export interface ActionDecisionAgentRuntime {
  readonly profile: AgentProfile;
  readonly perception: AgentPerceptionPack<ActionAdviceRequest>;
  readonly promptLines: readonly string[];
}

const ACTION_DECISION_AGENT_PROFILE: AgentProfile = {
  agentId: 'action-decision:broker-advisor',
  kind: 'matter',
  roleLabel: '动作情景参谋',
  soul: '把房源、客户、业主和竞品放在同一张业务桌上判断，不替玩家结算，只帮玩家把这一轮话题和态度选得更像真实经纪动作。',
  goals: ['选出本轮最值得推进的话题', '保留现有规则模式的稳定性', '让对话和动作能接上后续世界变化'],
  traits: ['先看当前房源压力', '再看客户和竞品是否已经形成比较', '最后判断该稳住还是推进'],
  boundaries: ['不能发明选项', '不能直接改 GameState', '不能承诺必然成交或必然调价'],
  speakingStyle: ['短句', '业务一线口吻', '只说这一轮怎么选和为什么'],
};

const actionDecisionAgentAdapter: AgentHarnessAdapter<ActionAdviceRequest> = {
  channel: 'face_visit',

  resolveProfile(context) {
    return {
      ...ACTION_DECISION_AGENT_PROFILE,
      agentId: buildActionDecisionAgentId(context),
    };
  },

  buildPerception(profile, context) {
    return {
      agentId: profile.agentId,
      channel: resolveActionDecisionChannel(context.actionId),
      day: 0,
      visibleRefs: buildVisibleRefs(context),
      context,
      memory: buildActionDecisionMemoryFacts(profile, context),
      pressure: buildPressureLines(context),
      uncertainty: buildUncertaintyLines(context),
    };
  },

  compilePrompt(profile, perception) {
    const channel = resolveActionDecisionChannel(perception.context.actionId);
    const preset = resolveActionDecisionPromptPreset(channel);
    const toolManifest = resolveAgentToolManifest({ channel, mode: 'hybrid' });
    return {
      systemLines: [
        `agent：${profile.roleLabel}`,
        `soul：${profile.soul}`,
        `目标：${profile.goals.join('；')}`,
        `判断偏好：${profile.traits.join('；')}`,
        `边界：${profile.boundaries.join('；')}`,
        `表达方式：${profile.speakingStyle.join('；')}`,
        ...(preset ? [
          `预制场景 agent：${preset.roleLabel}`,
          ...preset.rootLines,
        ] : []),
      ],
      contextLines: [
        `当前压力：${perception.pressure.join('；') || '暂无明显压力'}`,
        `不确定点：${perception.uncertainty.join('；') || '暂无'}`,
        `记忆：${perception.memory.map((fact) => fact.summary).join('；') || '暂无记忆'}`,
        ...toolManifest.promptLines,
        ...(preset?.guardrailLines || []),
      ],
      outputContractLines: [
        '输出是动作情景模拟和本轮选择建议，不是结算结果。',
        'mainStrategies 和 assistStrategies 必须保留来自输入的 option id。',
        'recommendedMainStrategyIds 和 recommendedAssistStrategyId 只能引用已有 option id。',
        '不要说系统、AI、模型、评分、内部变量。',
        ...(preset?.outputContractLines || []),
      ],
    };
  },
};

export function buildActionDecisionAgentRuntime(request: ActionAdviceRequest): ActionDecisionAgentRuntime {
  const runtime = buildAgentRuntimePack({
    adapter: {
      ...actionDecisionAgentAdapter,
      channel: resolveActionDecisionChannel(request.actionId),
    },
    context: request,
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

export function resolveActionDecisionChannel(actionId: string): AgentChannel {
  if (actionId === 'open-day') return 'open_day';
  if (actionId === 'sincerity-sale') return 'sincere_sale';
  if (actionId === 'weekly-feedback' || actionId === 'deep-diagnosis') return 'focus_meeting';
  if (actionId === 'pricing' || actionId === 'ask-psychological-price') return 'market_reaction';
  return 'face_visit';
}

function resolveActionDecisionPromptPreset(channel: AgentChannel) {
  const presetIdByChannel: Partial<Record<AgentChannel, AgentPromptPresetId>> = {
    open_day: 'scenario.openDay',
    sincere_sale: 'scenario.sincereSale',
    focus_meeting: 'scenario.focusMeeting',
  };
  const presetId = presetIdByChannel[channel];
  return presetId ? resolveAgentPromptPreset(presetId) : null;
}

export function buildActionDecisionAgentId(context: ActionAdviceRequest) {
  const subject = context.caseContext?.title || context.title || 'unknown';
  return `action:${context.actionId}:${subject}`.replace(/\s+/g, '-').slice(0, 140);
}

function buildVisibleRefs(context: ActionAdviceRequest) {
  return [
    `action:${context.actionId}`,
    `round:${context.currentRound}/${context.totalRounds}`,
    context.caseContext?.title ? `case:${context.caseContext.title}` : null,
    ...context.round.mainStrategies.map((option) => `main:${option.id}`),
    ...context.round.assistStrategies.map((option) => `assist:${option.id}`),
  ].filter((value): value is string => Boolean(value));
}

function buildActionDecisionMemoryFacts(
  profile: AgentProfile,
  context: ActionAdviceRequest,
): AgentMemoryFact[] {
  const facts: AgentMemoryFact[] = [];
  if (context.caseContext) {
    const priceGap = typeof context.caseContext.askPrice === 'number' && typeof context.caseContext.marketPrice === 'number'
      ? Math.round(context.caseContext.askPrice - context.caseContext.marketPrice)
      : null;
    facts.push({
      factId: `${profile.agentId}:case`,
      agentId: profile.agentId,
      kind: 'case_context',
      summary: `${context.caseContext.title}${context.caseContext.community ? `，${context.caseContext.community}` : ''}${priceGap !== null ? `，挂牌比市场${priceGap >= 0 ? '高' : '低'} ${Math.abs(priceGap)} 万` : ''}`,
      strength: 0.9,
      scope: { channel: resolveActionDecisionChannel(context.actionId) },
    });
    facts.push({
      factId: `${profile.agentId}:owner-state`,
      agentId: profile.agentId,
      kind: 'owner_state',
      summary: `信任 ${context.caseContext.trust ?? '-'}，耐心 ${context.caseContext.patience ?? '-'}，催促 ${context.caseContext.urgency ?? '-'}，热度 ${context.caseContext.heat ?? '-'}`,
      strength: 0.82,
      scope: { channel: resolveActionDecisionChannel(context.actionId) },
    });
  }

  context.contextBullets.slice(0, 5).forEach((bullet, index) => {
    facts.push({
      factId: `${profile.agentId}:context:${index}`,
      agentId: profile.agentId,
      kind: 'visible_context',
      summary: bullet,
      strength: 0.72 - index * 0.04,
      scope: { channel: resolveActionDecisionChannel(context.actionId) },
    });
  });

  return facts.slice(0, 8);
}

function buildPressureLines(context: ActionAdviceRequest) {
  const lines: string[] = [];
  if ((context.caseContext?.urgency || 0) >= 70) lines.push('业主催促感偏强');
  if ((context.caseContext?.patience || 100) <= 45) lines.push('业主耐心偏低');
  if ((context.caseContext?.heat || 0) >= 65) lines.push('客户热度可用，需要抓住窗口');
  if (context.contextBullets.some((line) => /外部|竞品|比较|同类房/.test(line))) lines.push('同类竞品在场');
  if (context.actionId === 'showing') lines.push('本轮选择会影响看后反馈质量');
  return lines.slice(0, 5);
}

function buildUncertaintyLines(context: ActionAdviceRequest) {
  const lines: string[] = [];
  if (context.round.mainStrategies.length > 1) lines.push('多个话题都可选，需要判断主线');
  if (context.round.assistStrategies.length > 1) lines.push('态度会改变角色反馈强弱');
  if (!context.caseContext) lines.push('缺少完整房源上下文');
  if (!context.contextBullets.length) lines.push('缺少外部事实补充');
  return lines.slice(0, 4);
}
