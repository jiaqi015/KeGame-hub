import type { AgentProfile, AgentPerceptionPack } from '../../core/world-state/agents/models.js';
import type { AiArrangementContextPack } from '../aiArrangement/contextPack.js';

export interface AiArrangementAgentRuntime {
  readonly profile: AgentProfile;
  readonly perception: AgentPerceptionPack<AiArrangementContextPack>;
  readonly promptLines: readonly string[];
}

export function buildAiArrangementAgentRuntime(pack: AiArrangementContextPack): AiArrangementAgentRuntime {
  const profile: AgentProfile = {
    agentId: `ai-arrangement:${pack.day}`,
    kind: 'world_engine',
    roleLabel: '今日安排代理',
    soul: '根据当前余量、候选动作和微信信号，生成今日安排建议。',
    goals: ['最大化今日经营效率', '平衡精力和优先级'],
    traits: ['优先少而准', '最多3个draft'],
    boundaries: ['不能创建新action', '不能修改游戏状态'],
    speakingStyle: ['只输出JSON', '不输出推理链'],
  };

  const perception: AgentPerceptionPack<AiArrangementContextPack> = {
    agentId: profile.agentId,
    channel: 'open_day',
    day: pack.day,
    visibleRefs: pack.candidateItems.map(item => item.itemId),
    context: pack,
    memory: [],
    pressure: buildPressure(pack),
    uncertainty: buildUncertainty(pack),
  };

  const promptLines = buildPromptLines(pack);

  return { profile, perception, promptLines };
}

function buildPressure(pack: AiArrangementContextPack): string[] {
  const pressure: string[] = [];
  if (pack.energy.remaining <= 2) pressure.push('今日精力紧张');
  if (pack.slots.am.remainingCapacity <= 0) pressure.push('上午已满');
  if (pack.slots.pm.remainingCapacity <= 0) pressure.push('下午已满');
  if (pack.wechatSignals.some(s => s.urgency === 'high')) pressure.push('有高优先级微信待处理');
  return pressure;
}

function buildUncertainty(pack: AiArrangementContextPack): string[] {
  const uncertainty: string[] = [];
  if (pack.candidateItems.length === 0) uncertainty.push('无可用候选动作');
  if (pack.constraints.length > 0) uncertainty.push(`约束：${pack.constraints.join('；')}`);
  return uncertainty;
}

function buildPromptLines(pack: AiArrangementContextPack): readonly string[] {
  return [
    '你是卖房经营游戏里的今日安排代理。你只能根据输入的 candidateItems 做选择。',
    '你不能创建新 action，不能修改游戏状态，不能声称已经安排成功。',
    '输出必须是 JSON，字段为 headline、summary、evidenceLabels、drafts。',
    'drafts 中每一项只能引用 candidateItems 里存在且未 disabled 的 itemId。',
    `总 energyCost 不能超过 ${pack.energy.remaining}，单个 slot 不能超过 slots[slot].remainingCapacity。`,
    '不要输出推理链，只输出可解释摘要。',
    '优先少而准，最多 3 个 draft。',
    '如果没有可排动作，返回空 drafts，并说明今天先处理已有安排。',
  ];
}
