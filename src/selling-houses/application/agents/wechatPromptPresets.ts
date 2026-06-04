import type { CaseAgentContextPack } from '../../core/world-state/agents/caseContextPack.js';
import { buildCaseAgentOsRunPlan } from '../../core/world-state/agents/caseAgentOs.js';
import {
  buildCaseAgentCoordinatorPlan,
  resolveCaseAgentCoordinatorRoleId,
} from './caseCoordinator.js';
import { resolveAgentToolManifest } from '../../core/world-state/agents/toolRegistry.js';
import type { AgentPerceptionPack, AgentProfile } from '../../core/world-state/agents/models.js';
import type { ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';
import { formatConversationRiskSummary } from './conversationRiskLabels.js';
import { buildSoulPromptLines } from './soulStore.js';

export interface WechatAgentPromptSections {
  readonly rootLines: readonly string[];
  readonly roleLines: readonly string[];
  readonly contextLines: readonly string[];
  readonly memoryLines: readonly string[];
  readonly soulLines: readonly string[];
  readonly validationLines: readonly string[];
  readonly outputContractLines: readonly string[];
}

export function buildWechatAgentPromptSections(input: {
  readonly profile: AgentProfile;
  readonly scene: ConversationSceneInputPack;
  readonly caseContextPack?: CaseAgentContextPack;
  readonly perception?: AgentPerceptionPack<ConversationSceneInputPack>;
}): WechatAgentPromptSections {
  const osPlan = buildCaseAgentOsRunPlan({ channel: 'wechat', mode: 'hybrid' });
  const toolManifest = resolveAgentToolManifest({ channel: 'wechat', mode: 'hybrid' });
  const casePack = input.caseContextPack;
  const coordinatorPlan = casePack
    ? buildCaseAgentCoordinatorPlan({ scene: input.scene, caseContextPack: casePack })
    : null;
  const coordinatorRolePlan = coordinatorPlan
    ? coordinatorPlan.rolePlans.find((role) => role.roleId === resolveCaseAgentCoordinatorRoleId(input.scene.sceneType))
    : null;

  return {
    rootLines: [
      '你运行在上海二手房经营模拟的微信对话代理层。',
      '你只能输出 proposal，不直接改 GameState，不直接改挂牌价，不直接关闭成交。',
      '所有世界变化最终都要走引擎结算；你看到的是被边界过滤后的上下文，不是无限真相。',
      '如果事实不够，先保守判断，宁可少说，也不要脑补。',
    ],
    roleLines: [
      `对话角色：${input.profile.roleLabel}`,
      `角色 soul：${input.profile.soul}`,
      `目标：${input.profile.goals.join('；')}`,
      `性格和偏好：${input.profile.traits.join('；')}`,
      `边界：${input.profile.boundaries.join('；')}`,
      `说话方式：${input.profile.speakingStyle.join('；')}`,
      ...(coordinatorRolePlan?.missionLines || []),
    ],
    contextLines: coordinatorPlan?.sharedContextLines || buildWechatContextLines(input.scene, casePack),
    memoryLines: coordinatorPlan
      ? [
          ...coordinatorPlan.sharedMemoryLines,
          ...coordinatorPlan.sharedBoundaryLines,
        ]
      : buildWechatMemoryLines(input.scene, casePack, input.perception),
    soulLines: input.scene.participantSoul
      ? buildSoulPromptLines(input.scene.participantSoul)
      : [],
    validationLines: [
      '意图识别顺序：先判辱骂/摆烂/威胁；再判过度承诺；再判是否空泛安抚；再判是否忽略对方核心问题；再判证据、动作、时间、价格、面访、客户跟进、经理对齐。',
      '如果上下文预算显示已压缩，不要脑补缺失事实；优先沿用已给出的市场、竞品、客户和最近记忆。',
      '如果对方在问价格、装修、竞品、时间、方案，而回复没有接住，就要判 ignores_customer。',
      '如果只是“收到/好的/再等等/我看看”且没有证据、动作、时间，就要判 empty_comfort。',
      '如果出现辱骂、摆烂、威胁或明显冒犯，必须判 hostile + offensive_reply，不能洗成正常安抚。',
      ...(coordinatorPlan ? coordinatorPlan.sharedBoundaryLines : []),
      ...toolManifest.promptLines,
      `可用 proposal 工具：${toolManifest.availableTools.filter((tool) => tool.permission === 'proposal').map((tool) => tool.toolId).join('；')}`,
      `禁止工具：${toolManifest.forbiddenTools.map((tool) => tool.toolId).join('；')}`,
      '禁止在 proposal 中声称已经执行了 forbidden tool 对应的动作。proposal 只能提出建议，不能声明已执行。例如：不能说"已经把价改到580万"，只能说"建议调价到580万"。',
      `运行 hooks：${osPlan.hooks.map((hook) => `${hook.phase}:${hook.hookId}`).join('；')}`,
    ],
    outputContractLines: [
      '思考步骤（先写回复再分类，不要反过来）：',
      '1. 先想这个角色看到这条微信后，心里最真实的第一反应是什么。',
      '2. 基于这个反应，写出 recipientReply（对方会怎么回这条微信）。',
      '3. 基于你写的回复，判断意图（intentKinds）和风险（riskKinds）。',
      '4. 基于意图和风险，计算各项 delta。',
      '',
      'recipientReply 必须像这个角色本人回的一条微信，不是系统评语。',
      '不要说系统、AI、模型、评分、内部变量。',
      '不要复述玩家原文，不要每次都用"收到/好/可以"开头。',
      'recipientReply 控制在 16 到 46 个中文字符，优先短句。',
      '只输出 JSON，不输出 Markdown、说明、思考过程。',
      '{"summary":"一句业务影响总结","recipientReply":"对方的微信反应","intentKinds":["present_market_evidence"],"riskKinds":["none"],"evidenceUse":"specific","trustDelta":2,"patienceDelta":1,"urgencyDelta":-1,"priceFlexibilityDelta":0,"customerIntentDelta":0,"customerConfidenceDelta":0,"nextStep":{"kind":"schedule_face_visit","actionId":"first-visit","label":"安排面访","reason":"一句原因","priority":"high"},"confidence":0.78}',
      `输出合约：${osPlan.outputContract.join('；')}`,
    ],
  };
}

export function buildWechatConversationTurnPromptLines(input: {
  readonly profile: AgentProfile;
  readonly scene: ConversationSceneInputPack;
  readonly caseContextPack?: CaseAgentContextPack;
}): readonly string[] {
  const sections = buildWechatAgentPromptSections(input);
  return [
    '你是上海二手房经纪经营模拟的"微信对话理解器"。',
    '你的任务不是代替游戏改状态，而是阅读玩家给业主/客户/经理发出的微信，输出一个可被应用层结算的效果提案。',
    '你同时要扮演对话对象的真实反应。recipientReply 必须像这个角色本人回的一条微信，不是评语。',
    '',
    ...sections.rootLines,
    '',
    ...sections.roleLines,
    '',
    ...sections.contextLines,
    '',
    ...sections.memoryLines,
    '',
    ...sections.validationLines,
    '',
    ...sections.outputContractLines,
    '',
    '输入上下文：',
    JSON.stringify(buildLLMVisibleContext(input.scene, input.caseContextPack), null, 2),
  ];
}

function buildWechatContextLines(
  scene: ConversationSceneInputPack,
  pack?: CaseAgentContextPack,
): string[] {
  if (!pack) {
    return [
      'Case 全上下文：暂无，按当前微信片段保守判断。',
      '上下文预算：暂无',
    ];
  }
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
    `上下文预算：${pack.contextBudget.summary}`,
    `世界压力：${pack.currentWorld.todayTheme}；市场信号：${marketSignals}；外部竞品：${competitors}；活跃客户：${customers}；最近事件：${events}。`,
    `经营约束：今日精力 ${pack.operatingContext.energyLeft}/${pack.operatingContext.maxEnergy}；${pack.operatingContext.actionPressure}；今日已排：${plannedActions}；已做动作：${recentActions}`,
    `人物心智：${pack.actorMind.name}，${pack.actorMind.persona}，情绪=${pack.actorMind.emotionalState}，关系底线=${pack.actorMind.relationshipBoundary}`,
    `对话局面：${pack.dialogueSituation.whyThisMessageAppeared} 要回答的问题：${pack.dialogueSituation.expectedBusinessQuestion}`,
    `可用动作：${actions}`,
    `结算边界：${pack.settlementContract.hardRules.join('；')}`,
  ];
}

function buildWechatMemoryLines(
  scene: ConversationSceneInputPack,
  pack?: CaseAgentContextPack,
  perception?: AgentPerceptionPack<ConversationSceneInputPack>,
): string[] {
  if (!pack) {
    return [
      `当前压力：${perception?.pressure.join('；') || scene.caseContext?.urgency || '未知'}；不确定点：${perception?.uncertainty.join('；') || '暂无'}；记忆：${perception?.memory.map((fact) => fact.summary).join('；') || '暂无记忆'}。`,
    ];
  }
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
    `当前压力：${perception?.pressure.join('；') || pack.operatingContext.actionPressure}`,
    `不确定点：${perception?.uncertainty.join('；') || '暂无'}`,
    `记忆：${semanticFacts}`,
    `最近对话：${recentTurns}`,
    `会话历史：${conversationHistory}`,
    `未消化风险：${formatConversationRiskSummary(`未消化风险：${unresolvedRisks}`)}`,
    `未兑现承诺：${promises}`,
    `运行记忆：${perception?.memory.map((fact) => fact.summary).join('；') || '暂无'}`,
  ];
}

function buildLLMVisibleContext(
  scene: ConversationSceneInputPack,
  caseContextPack?: CaseAgentContextPack,
) {
  const canRevealBottomPrice =
    (scene.caseContext?.hasCompletedFirstVisit || false) &&
    (scene.caseContext?.trust || 0) > 70;

  const filteredPack = caseContextPack
    ? filterPackForLLM(caseContextPack, scene.sceneType, canRevealBottomPrice)
    : undefined;

  return {
    _visibleBoundary: caseContextPack?.visibleBoundary,
    day: scene.day,
    sceneType: scene.sceneType,
    playerText: scene.playerText,
    sourceMessage: {
      senderName: scene.sourceMessage.senderName,
      senderRole: scene.sourceMessage.senderRole,
      content: scene.sourceMessage.content,
      urgency: scene.sourceMessage.urgency,
    },
    caseContext: scene.caseContext ? {
      title: scene.caseContext.title,
      ownerName: scene.caseContext.ownerName,
      district: scene.caseContext.district,
      community: scene.caseContext.community,
      askPrice: scene.caseContext.askPrice,
      marketPrice: scene.caseContext.marketPrice,
      priceGapPct: scene.caseContext.priceGapPct,
      trust: scene.caseContext.trust,
      patience: scene.caseContext.patience,
      urgency: scene.caseContext.urgency,
      hasCompletedFirstVisit: scene.caseContext.hasCompletedFirstVisit,
      ownerProfileLabel: scene.caseContext.ownerProfileLabel,
    } : undefined,
    caseAgentContextPack: filteredPack,
    opportunityContext: scene.opportunityContext ? {
      customerName: scene.opportunityContext.customerName,
      stage: scene.opportunityContext.stage,
      intent: scene.opportunityContext.intent,
      confidence: scene.opportunityContext.confidence,
    } : undefined,
    agentMemory: (scene.agentMemory || []).map((fact) => ({
      kind: fact.kind,
      summary: fact.summary,
    })),
    recentTurns: scene.recentTurns,
  };
}

function describeBudgetRange(budgetMax?: number): string | undefined {
  if (budgetMax === undefined) return undefined;
  if (budgetMax < 500) return '500万以下';
  if (budgetMax < 600) return '500-600万';
  if (budgetMax < 700) return '600-700万';
  if (budgetMax < 800) return '700-800万';
  return '800万以上';
}

function describeSensitivityRange(priceSensitivity?: number): string | undefined {
  if (priceSensitivity === undefined) return undefined;
  if (priceSensitivity < 40) return '低';
  if (priceSensitivity < 65) return '中';
  if (priceSensitivity < 80) return '中高';
  return '高';
}

function filterPackForLLM(
  pack: CaseAgentContextPack,
  sceneType: string,
  canRevealBottomPrice: boolean,
): CaseAgentContextPack {
  const filteredCustomers = pack.currentWorld.activeCustomers.map((customer) => ({
    ...customer,
    budgetMax: undefined,
    priceSensitivity: undefined,
    budgetRange: describeBudgetRange(customer.budgetMax),
    priceSensitivityLevel: describeSensitivityRange(customer.priceSensitivity),
  }));

  return {
    ...pack,
    caseIdentity: canRevealBottomPrice
      ? pack.caseIdentity
      : { ...pack.caseIdentity, bottomPrice: undefined },
    currentWorld: {
      ...pack.currentWorld,
      activeCustomers: filteredCustomers,
    },
  };
}
