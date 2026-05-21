import type { AgentChannel, AgentExecutionMode } from '../../core/world-state/agents/models.js';
import type { CaseAgentContextPack } from '../../core/world-state/agents/caseContextPack.js';
import type { AgentPromptPresetId } from '../../core/world-state/agents/promptCatalog.js';
import { resolveAgentPromptPreset } from '../../core/world-state/agents/promptCatalog.js';
import type { ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';
import { formatConversationRiskSummary } from './conversationRiskLabels.js';

export type CaseAgentCoordinatorRoleId =
  | 'owner'
  | 'customer'
  | 'manager'
  | 'broker'
  | 'world';

export function resolveCaseAgentCoordinatorRoleId(sceneType: ConversationSceneInputPack['sceneType']): CaseAgentCoordinatorRoleId {
  if (sceneType === 'owner_wechat') return 'owner';
  if (sceneType === 'customer_wechat') return 'customer';
  if (sceneType === 'manager_wechat') return 'manager';
  if (sceneType === 'broker_wechat') return 'broker';
  return 'broker';
}

export interface CaseAgentCoordinatorRolePlan {
  readonly roleId: CaseAgentCoordinatorRoleId;
  readonly channel: AgentChannel;
  readonly mode: AgentExecutionMode;
  readonly promptPresetId: AgentPromptPresetId;
  readonly roleLabel: string;
  readonly missionLines: readonly string[];
  readonly promptLines: readonly string[];
  readonly requiredToolsets: readonly string[];
}

export interface CaseAgentCoordinatorPlan {
  readonly planId: string;
  readonly sceneId: string;
  readonly caseId: string;
  readonly conversationKey: string;
  readonly day: number;
  readonly sharedContextLines: readonly string[];
  readonly sharedMemoryLines: readonly string[];
  readonly sharedBoundaryLines: readonly string[];
  readonly rolePlans: readonly CaseAgentCoordinatorRolePlan[];
}

const ROLE_PRESET_MAP: Record<CaseAgentCoordinatorRoleId, AgentPromptPresetId> = {
  owner: 'wechat.ownerDialogue',
  customer: 'wechat.customerDialogue',
  manager: 'wechat.managerDialogue',
  broker: 'wechat.brokerDialogue',
  world: 'world.dailyTick',
};

const ROLE_MISSION_LINES: Record<CaseAgentCoordinatorRoleId, readonly string[]> = {
  owner: [
    '你只以业主视角反应，关注价格、安全感、时间和是否继续等。',
    '你可以追问，但不要越过已知边界去猜测未公开事实。',
  ],
  customer: [
    '你只以客户视角反应，关注预算、装修、竞品和看房价值。',
    '你会推动经纪人把差异、价格和下一步说清楚。',
  ],
  manager: [
    '你只以管理者视角反应，关注当天动作、风险闭环和推进节奏。',
    '你要求对象、动作、时间和结果，不接受虚话。',
  ],
  broker: [
    '你只以经纪人视角反应，既要专业，也要克制，给出可执行下一步。',
    '你必须把事实、判断和动作分开，不能假装已经执行。',
  ],
  world: [
    '你只以世界引擎视角反应，提出市场、竞对、客户和业主的自然变化候选事件。',
    '你不能直接改 GameState，只能给出可裁决的事件提案。',
  ],
};

export function buildCaseAgentCoordinatorPlan(input: {
  readonly scene: ConversationSceneInputPack;
  readonly caseContextPack: CaseAgentContextPack;
  readonly roleIds?: readonly CaseAgentCoordinatorRoleId[];
}): CaseAgentCoordinatorPlan {
  const roleIds = input.roleIds && input.roleIds.length > 0
    ? [...new Set(input.roleIds)]
    : (['owner', 'customer', 'manager', 'broker', 'world'] as const);
  const sharedContextLines = buildSharedContextLines(input.scene, input.caseContextPack);
  const sharedMemoryLines = buildSharedMemoryLines(input.caseContextPack);
  const sharedBoundaryLines = buildSharedBoundaryLines(input.caseContextPack);
  const rolePlans = roleIds.map((roleId) => buildCaseAgentCoordinatorRolePlan({
    roleId,
    sharedContextLines,
    sharedMemoryLines,
    sharedBoundaryLines,
  }));

  return Object.freeze({
    planId: `case-coordinator:${input.scene.sceneId}:${input.caseContextPack.caseIdentity.caseId}`,
    sceneId: input.scene.sceneId,
    caseId: input.caseContextPack.caseIdentity.caseId,
    conversationKey: input.scene.conversationKey,
    day: input.scene.day,
    sharedContextLines: Object.freeze(sharedContextLines),
    sharedMemoryLines: Object.freeze(sharedMemoryLines),
    sharedBoundaryLines: Object.freeze(sharedBoundaryLines),
    rolePlans: Object.freeze(rolePlans),
  });
}

export function buildCaseAgentRolePromptLines(
  plan: CaseAgentCoordinatorPlan,
  roleId: CaseAgentCoordinatorRoleId,
): readonly string[] {
  const rolePlan = plan.rolePlans.find((entry) => entry.roleId === roleId);
  if (!rolePlan) {
    return plan.sharedContextLines;
  }
  return rolePlan.promptLines;
}

function buildCaseAgentCoordinatorRolePlan(input: {
  readonly roleId: CaseAgentCoordinatorRoleId;
  readonly sharedContextLines: readonly string[];
  readonly sharedMemoryLines: readonly string[];
  readonly sharedBoundaryLines: readonly string[];
}): CaseAgentCoordinatorRolePlan {
  const preset = resolveAgentPromptPreset(ROLE_PRESET_MAP[input.roleId]);
  if (!preset) {
    throw new Error(`Missing agent prompt preset for role ${input.roleId}`);
  }
  const promptLines = [
    `角色中枢：${preset.roleLabel}`,
    ...input.sharedContextLines,
    '',
    ...input.sharedMemoryLines,
    '',
    ...input.sharedBoundaryLines,
    '',
    ...preset.rootLines,
    '',
    ...ROLE_MISSION_LINES[input.roleId],
    '',
    ...preset.guardrailLines,
    '',
    ...preset.outputContractLines,
  ];
  return Object.freeze({
    roleId: input.roleId,
    channel: preset.channel,
    mode: preset.mode,
    promptPresetId: preset.presetId,
    roleLabel: preset.roleLabel,
    missionLines: Object.freeze([...ROLE_MISSION_LINES[input.roleId]]),
    promptLines: Object.freeze(promptLines),
    requiredToolsets: Object.freeze([...preset.requiredToolsets]),
  });
}

function buildSharedContextLines(
  scene: ConversationSceneInputPack,
  pack: CaseAgentContextPack,
): string[] {
  const marketSignals = pack.currentWorld.marketSignals
    .map((signal) => `${signal.title}：${signal.message}`)
    .join('；') || '暂无';
  const competitors = pack.currentWorld.externalCompetitors
    .map((item) => `${item.title}，${item.askPrice}万，热度${item.heat}`)
    .join('；') || '暂无';
  const customers = pack.currentWorld.activeCustomers
    .map((customer) => `${customer.customerName}，${customer.stage}，意向${customer.intent}，信心${customer.confidence}`)
    .join('；') || '暂无';
  const events = pack.currentWorld.recentCausalEvents
    .map((event) => event.summary)
    .join('；') || '暂无';
  const actions = pack.availableActions
    .map((action) => `${action.label}(${action.actionId})`)
    .join('；') || '暂无';
  const plannedActions = pack.operatingContext.todayPlannedActions
    .map((action) => `${action.actionId}/${action.status}${action.slot ? `/${action.slot}` : ''}`)
    .join('；') || '暂无';
  const recentActions = pack.memory.recentCaseActions
    .map((action) => `D${action.day} ${action.actionId}：${action.summary}`)
    .join('；') || '暂无';

  return [
    `Case 全上下文：${pack.caseIdentity.title}，${pack.caseIdentity.community}，挂价${pack.caseIdentity.askPrice}万，市场${pack.caseIdentity.marketPrice}万，价差${pack.caseIdentity.priceGapPct}%。`,
    `场景锚点：${scene.sceneType}；对话对象 ${pack.actorMind.name}；来源消息 ${scene.sourceMessage.content}；玩家文本 ${scene.playerText}。`,
    `上下文预算：${pack.contextBudget.summary}`,
    `世界压力：${pack.currentWorld.todayTheme}；市场信号：${marketSignals}；外部竞品：${competitors}；活跃客户：${customers}；最近事件：${events}。`,
    `经营约束：今日精力 ${pack.operatingContext.energyLeft}/${pack.operatingContext.maxEnergy}；${pack.operatingContext.actionPressure}；今日已排：${plannedActions}；已做动作：${recentActions}`,
    `人物心智：${pack.actorMind.name}，${pack.actorMind.persona}，情绪=${pack.actorMind.emotionalState}，关系底线=${pack.actorMind.relationshipBoundary}`,
    `对话局面：${pack.dialogueSituation.whyThisMessageAppeared} 要回答的问题：${pack.dialogueSituation.expectedBusinessQuestion}`,
    `可用动作：${actions}`,
  ];
}

function buildSharedMemoryLines(pack: CaseAgentContextPack): string[] {
  const recentTurns = pack.memory.recentTurns
    .map((turn) => `你上次说“${turn.playerText}”，对方回“${turn.recipientReply}”`)
    .join('；') || '暂无';
  const conversationHistory = pack.memory.conversationHistory
    .map((turn) => `D${turn.day}#${turn.turnIndex} ${turn.source === 'ai' ? '已回' : '兜底'}：${turn.summary}`)
    .join('；') || '暂无';
  const semanticFacts = pack.memory.semanticFacts
    .map((fact) => fact.summary)
    .join('；') || '暂无';
  const unresolvedRisks = pack.memory.unresolvedRisks.join('；') || '暂无';
  const promises = pack.memory.promisesNotYetFulfilled.join('；') || '暂无';
  return [
    `记忆：${semanticFacts}`,
    `最近对话：${recentTurns}`,
    `会话历史：${conversationHistory}`,
    `未消化风险：${formatConversationRiskSummary(`未消化风险：${unresolvedRisks}`)}`,
    `未兑现承诺：${promises}`,
  ];
}

function buildSharedBoundaryLines(pack: CaseAgentContextPack): string[] {
  return [
    `可见边界：${pack.visibleBoundary.canKnow.join('；')}`,
    `不可见边界：${pack.visibleBoundary.cannotKnow.join('；')}`,
    `结算边界：${pack.settlementContract.hardRules.join('；')}`,
    `可用 delta：${pack.settlementContract.allowedDeltas.join('；')}`,
  ];
}
