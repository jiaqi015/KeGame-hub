import type { GameState } from '../../domain/models.js';
import { isOpportunityActiveByCanonicalState } from '../../domain/opportunityLifecycleStatusRead.js';
import type {
  CaseAgentCompetitor,
  CaseAgentConversationHistoryEntry,
  CaseAgentAvailableAction,
  CaseAgentContextPack,
  CaseAgentContextBudget,
  CaseAgentCustomer,
  CaseAgentPlannedAction,
  CaseAgentRecentAction,
  CaseAgentSectionBudget,
  CaseAgentMarketSignal,
  CaseAgentWorldEvent,
} from '../../core/world-state/agents/caseContextPack.js';
import type { ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';
import { formatConversationRiskSummary } from './conversationRiskLabels.js';

export function buildCaseAgentContextPack(
  state: GameState,
  scene: ConversationSceneInputPack,
): CaseAgentContextPack | undefined {
  if (!scene.caseContext) return undefined;

  const caseItem = state.cases.find((entry) => entry.id === scene.caseContext?.caseId);
  const marketCellId = caseItem?.marketCellId;
  const caseId = scene.caseContext.caseId;
  const activeCustomers = buildActiveCustomers(state, caseId);
  const marketSignalsSource = buildMarketSignals(state, scene);
  const externalCompetitorsSource = buildExternalCompetitors(state, caseId, marketCellId);
  const recentCausalEventsSource = buildRecentCausalEvents(state, caseId);
  const recentCaseActionsSource = buildRecentCaseActions(state, caseId);
  const recentTurnsSource = scene.recentTurns || [];
  const conversationHistorySource = buildConversationHistorySource(state, scene.conversationKey);
  const semanticFacts = [...(scene.agentMemory || [])];
  const marketSignals = marketSignalsSource.slice(0, 5);
  const externalCompetitors = externalCompetitorsSource.slice(0, 8);
  const recentCausalEvents = recentCausalEventsSource.slice(-6);
  const recentCaseActions = recentCaseActionsSource.slice(-5);
  const recentTurns = recentTurnsSource.slice(-3);
  const conversationHistory = conversationHistorySource.slice(-6);
  const contextBudget = buildContextBudget({
    marketSignalsSource,
    externalCompetitorsSource,
    activeCustomersSource: activeCustomers,
    recentCausalEventsSource,
    recentCaseActionsSource,
    conversationHistorySource,
    semanticFactsSource: semanticFacts,
    recentTurnsSource,
  });

  return {
    packId: `case-context:${scene.sceneId}:${caseId}`,
    contextBudget,
    caseIdentity: {
      caseId,
      title: scene.caseContext.title,
      community: scene.caseContext.community,
      district: scene.caseContext.district,
      layout: caseItem?.layout || '',
      area: caseItem?.area,
      askPrice: scene.caseContext.askPrice,
      marketPrice: scene.caseContext.marketPrice,
      bottomPrice: caseItem?.bottomPrice,
      priceGapPct: scene.caseContext.priceGapPct,
      stageLabel: caseItem?.stageLabel,
      story: caseItem?.story,
      tags: caseItem?.tags || [],
      defects: caseItem?.defects || [],
    },
    currentWorld: {
      day: state.day,
      currentDate: state.currentDate,
      todayTheme: state.marketShadow?.dailyMarketEvent?.title || state.currentReport?.todayPlan.theme || '日常跟进',
      marketSignals,
      externalCompetitors,
      activeCustomers,
      recentCausalEvents,
    },
    operatingContext: {
      energyLeft: Number(state.energy) || 0,
      maxEnergy: Number(state.maxEnergy) || 0,
      todayPlannedActions: buildTodayPlannedActions(state, caseId),
      actionPressure: buildActionPressure(state, caseId),
    },
    actorMind: {
      actorId: scene.conversationKey,
      role: normalizeActorRole(scene.sourceMessage.senderRole),
      name: scene.sourceMessage.senderName,
      persona: buildActorPersona(scene),
      trust: scene.caseContext.trust,
      patience: scene.caseContext.patience,
      urgency: scene.caseContext.urgency,
      intent: scene.opportunityContext?.intent,
      confidence: scene.opportunityContext?.confidence,
      emotionalState: buildEmotionalState(scene),
      relationshipBoundary: buildRelationshipBoundary(scene),
    },
    dialogueSituation: {
      sourceMessage: scene.sourceMessage.content,
      playerText: scene.playerText,
      whyThisMessageAppeared: buildWhyMessageAppeared(scene, activeCustomers),
      expectedBusinessQuestion: buildExpectedBusinessQuestion(scene),
    },
    memory: {
      recentTurns,
      conversationHistory,
      semanticFacts,
      recentCaseActions,
      unresolvedRisks: semanticFacts
        .filter((fact) => fact.kind === 'open_risk' || fact.summary.includes('未消化风险'))
        .map((fact) => formatConversationRiskSummary(fact.summary))
        .slice(0, 5),
      promisesNotYetFulfilled: semanticFacts
        .filter((fact) => fact.kind === 'active_next_step' || fact.summary.includes('下一步期待'))
        .map((fact) => fact.summary)
        .slice(0, 5),
    },
    visibleBoundary: buildVisibleBoundary(scene, caseItem),
    availableActions: buildAvailableActions(scene),
    settlementContract: {
      allowedDeltas: [
        'trustDelta',
        'patienceDelta',
        'urgencyDelta',
        'priceFlexibilityDelta',
        'customerIntentDelta',
        'customerConfidenceDelta',
      ],
      deltaBounds: {
        trustDelta: [-5, 6],
        patienceDelta: [-5, 6],
        urgencyDelta: [-6, 6],
        priceFlexibilityDelta: [-6, 10],
        customerIntentDelta: [-8, 8],
        customerConfidenceDelta: [-8, 8],
      },
      hardRules: [
        'LLM 只能输出 proposal，不能直接改 GameState。',
        '事实必须来自上下文；不能编造成交、调价、出价、带看。',
        '辱骂、摆烂、威胁、明显冒犯必须作为关系风险处理。',
        '最终状态写入只允许走引擎结算。',
      ],
    },
  };
}

function buildContextBudget(input: {
  marketSignalsSource: readonly CaseAgentMarketSignal[];
  externalCompetitorsSource: readonly CaseAgentCompetitor[];
  activeCustomersSource: readonly CaseAgentCustomer[];
  recentCausalEventsSource: readonly CaseAgentWorldEvent[];
  recentCaseActionsSource: readonly CaseAgentRecentAction[];
  conversationHistorySource: readonly CaseAgentConversationHistoryEntry[];
  semanticFactsSource: readonly { factId: string }[];
  recentTurnsSource: ConversationSceneInputPack['recentTurns'];
}): CaseAgentContextBudget {
  const marketSignals = buildBudget(input.marketSignalsSource.length, 5);
  const externalCompetitors = buildBudget(input.externalCompetitorsSource.length, 8);
  const activeCustomers = buildBudget(input.activeCustomersSource.length, 8);
  const recentCausalEvents = buildBudget(input.recentCausalEventsSource.length, 6);
  const recentCaseActions = buildBudget(input.recentCaseActionsSource.length, 5);
  const conversationHistory = buildBudget(input.conversationHistorySource.length, 6);
  const semanticFacts = buildBudget(input.semanticFactsSource.length, 8);
  const recentTurns = buildBudget(input.recentTurnsSource.length, 3);
  const isCompacted =
    marketSignals.truncated > 0 ||
    externalCompetitors.truncated > 0 ||
    activeCustomers.truncated > 0 ||
    recentCausalEvents.truncated > 0 ||
    recentCaseActions.truncated > 0 ||
    conversationHistory.truncated > 0 ||
    semanticFacts.truncated > 0 ||
    recentTurns.truncated > 0;

  return {
    marketSignals,
    externalCompetitors,
    activeCustomers,
    recentCausalEvents,
    recentCaseActions,
    conversationHistory,
    semanticFacts,
    recentTurns,
    isCompacted,
    summary: [
      `市场信号 ${marketSignals.kept}/${marketSignals.total}`,
      `外部竞品 ${externalCompetitors.kept}/${externalCompetitors.total}`,
      `活跃客户 ${activeCustomers.kept}/${activeCustomers.total}`,
      `最近事件 ${recentCausalEvents.kept}/${recentCausalEvents.total}`,
      `最近动作 ${recentCaseActions.kept}/${recentCaseActions.total}`,
      `会话历史 ${conversationHistory.kept}/${conversationHistory.total}`,
      `记忆 ${semanticFacts.kept}/${semanticFacts.total}`,
      `最近对话 ${recentTurns.kept}/${recentTurns.total}`,
      isCompacted ? '已压缩' : '未压缩',
    ].join('；'),
  };
}

function buildBudget(total: number, kept: number): CaseAgentSectionBudget {
  const normalizedTotal = Math.max(0, Math.round(total));
  const normalizedKept = Math.max(0, Math.min(Math.round(kept), normalizedTotal));
  return {
    total: normalizedTotal,
    kept: normalizedKept,
    truncated: Math.max(0, normalizedTotal - normalizedKept),
  };
}

function buildConversationHistorySource(
  state: GameState,
  conversationKey: string,
): CaseAgentConversationHistoryEntry[] {
  return (state.wechatConversationHistory || [])
    .filter((entry) => entry.conversationKey === conversationKey)
    .map((entry) => ({
      receiptId: entry.receiptId,
      day: entry.day,
      turnIndex: entry.turnIndex,
      source: entry.source,
      playerText: entry.playerText,
      recipientReply: entry.recipientReply,
      summary: entry.summary,
    }));
}

function buildMarketSignals(state: GameState, scene: ConversationSceneInputPack) {
  return [
    ...(state.marketShadow?.dailyMarketEvent ? [{
      signalId: state.marketShadow.dailyMarketEvent.id,
      title: state.marketShadow.dailyMarketEvent.title,
      message: state.marketShadow.dailyMarketEvent.message,
      source: state.marketShadow.dailyMarketEvent.layer,
    }] : []),
    ...(state.marketShadow?.marketSignals || [])
      .filter((signal) => !signal.district || signal.district === scene.caseContext?.district)
      .map((signal) => ({
        signalId: signal.id,
        title: signal.title,
        message: signal.message,
        confidence: signal.confidence,
        source: signal.type,
      })),
  ];
}

function buildExternalCompetitors(state: GameState, caseId: string, marketCellId?: string) {
  return (state.marketShadow?.rivalListings || [])
    .filter((listing) => listing.status === 'active')
    .filter((listing) => !marketCellId || listing.marketCellId === marketCellId || listing.linkedCaseId === caseId)
    .map((listing) => ({
      listingId: listing.id,
      title: listing.title,
      district: listing.district,
      askPrice: listing.askPrice,
      heat: listing.heat,
      daysLeft: listing.daysLeft,
      source: listing.source,
    }));
}

function buildTodayPlannedActions(state: GameState, caseId: string): CaseAgentPlannedAction[] {
  return (state.todayPlan?.playerItems || [])
    .filter((item) => item.linkedCaseId === caseId)
    .slice(0, 6)
    .map((item) => ({
      itemId: item.id,
      actionId: item.linkedActionId,
      status: item.status,
      slot: item.slot,
    }));
}

function buildActionPressure(state: GameState, caseId: string) {
  const planned = buildTodayPlannedActions(state, caseId);
  if (planned.length > 0) return `今天已经排了 ${planned.length} 个相关动作。`;
  if ((Number(state.energy) || 0) <= 1) return '今天精力余量很低，承诺动作要保守。';
  return '今天还有一定操作余量，但仍要承诺可执行动作。';
}

function buildRecentCaseActions(state: GameState, caseId: string): CaseAgentRecentAction[] {
  return [...(state.actionReceiptHistory || [])]
    .filter((receipt) => receipt.caseId === caseId)
    .map((receipt) => ({
      receiptId: receipt.receiptId,
      day: receipt.day,
      actionId: receipt.actionId,
      outcome: receipt.outcome,
      summary: receipt.outcomeSummary,
      fieldDeltas: receipt.fieldDeltas
        .map((delta) => `${delta.field}:${delta.from}->${delta.to}`)
        .slice(0, 6),
    }));
}

function buildActiveCustomers(state: GameState, caseId: string): CaseAgentCustomer[] {
  return state.opportunities
    .filter((opportunity) => opportunity.caseId === caseId && isOpportunityActiveByCanonicalState(state, opportunity))
    .map((opportunity) => ({
      opportunityId: opportunity.id,
      customerId: opportunity.customerId,
      customerName: opportunity.customerName,
      stage: opportunity.stageLabel,
      intent: opportunity.intent,
      confidence: opportunity.confidence,
      budgetMax: opportunity.budgetMax,
      priceSensitivity: opportunity.priceSensitivity,
    }));
}

function buildRecentCausalEvents(state: GameState, caseId: string) {
  return [...(state.worldCausalEvents || [])]
    .filter((event) => {
      const record = event as unknown as Record<string, unknown>;
      return record.targetCaseId === caseId || record.caseId === caseId;
    })
    .map((event, index) => {
      const record = event as unknown as Record<string, unknown>;
      return {
        eventId: String(record.eventId || record.id || `world-event-${index}`),
        day: typeof record.day === 'number' ? record.day : state.day,
        summary: String(record.summary || record.description || record.message || '相关世界事件'),
        source: String(record.kind || record.type || 'world'),
      };
    });
}

function normalizeActorRole(role: string): CaseAgentContextPack['actorMind']['role'] {
  if (role === 'owner') return 'owner';
  if (role === 'customer') return 'customer';
  if (role === 'district_manager' || role === 'store_manager') return 'manager';
  if (role === 'agent') return 'broker';
  return 'system';
}

function buildActorPersona(scene: ConversationSceneInputPack) {
  if (scene.sceneType === 'owner_wechat') return scene.caseContext?.ownerProfileLabel || '普通业主';
  if (scene.sceneType === 'customer_wechat') return `${scene.opportunityContext?.stage || '看房'}客户`;
  if (scene.sceneType === 'manager_wechat') return '关注当日推进和风险闭环的管理者';
  return '业务联系人';
}

function buildEmotionalState(scene: ConversationSceneInputPack) {
  if (scene.sceneType === 'owner_wechat') {
    if ((scene.caseContext?.urgency || 0) >= 70) return '催促强，需要明确方案';
    if ((scene.caseContext?.patience || 0) <= 40) return '耐心偏低，不想继续空等';
    return '愿意听依据，但需要具体动作';
  }
  if (scene.sceneType === 'customer_wechat') {
    if ((scene.opportunityContext?.confidence || 0) < 55) return '还在比较，需要安全感';
    return '可以推进，但需要信息确认';
  }
  return '关注动作是否落地';
}

function buildRelationshipBoundary(scene: ConversationSceneInputPack) {
  if (scene.sceneType === 'owner_wechat') {
    return '不能接受辱骂、摆烂、空泛拖延或无依据劝降价。';
  }
  if (scene.sceneType === 'customer_wechat') {
    return '不能接受被硬推、被敷衍或价格风险被忽略。';
  }
  if (scene.sceneType === 'manager_wechat') {
    return '不能接受没有对象、时间和结果的泛泛汇报。';
  }
  return '不能接受脱离事实的承诺。';
}

function buildWhyMessageAppeared(
  scene: ConversationSceneInputPack,
  activeCustomers: readonly CaseAgentCustomer[],
) {
  if (scene.sceneType === 'owner_wechat') {
    const customerText = activeCustomers.length > 0 ? `，还有 ${activeCustomers.length} 位客户在推进或比较` : '';
    return `业主正在追问这套房的明确方案${customerText}。`;
  }
  if (scene.sceneType === 'customer_wechat') return '客户正在确认这套房是否值得继续看或谈价。';
  if (scene.sceneType === 'manager_wechat') return '经理在确认今天的重点动作和风险闭环。';
  return '对方需要经纪人给出事实和下一步。';
}

function buildExpectedBusinessQuestion(scene: ConversationSceneInputPack) {
  if (scene.sceneType === 'owner_wechat') return '经纪人是否接住业主情绪，并给出有依据、可执行的下一步。';
  if (scene.sceneType === 'customer_wechat') return '经纪人是否讲清价格、差异和后续安排。';
  if (scene.sceneType === 'manager_wechat') return '经纪人是否说明今天抓哪套、做什么、怎么回传结果。';
  return '经纪人是否给出清晰业务回应。';
}

function buildVisibleBoundary(
  scene: ConversationSceneInputPack,
  caseItem?: { bottomPrice?: number },
): { canKnow: string[]; cannotKnow: string[] } {
  const canKnow: string[] = [];
  const cannotKnow: string[] = [];

  if (scene.sceneType === 'owner_wechat') {
    canKnow.push(
      '房源价格、市场价、价差百分比。',
      '业主关系状态（信任、耐心、催促）和已发生的玩家动作。',
      '相关客户数量和阶段分布（不含客户姓名和具体预算）。',
      '竞品房源价格范围和市场信号。',
    );
    cannotKnow.push(
      '不能知道具体客户姓名（除非玩家已告知业主）和客户具体预算。',
      '不能知道未曝光的隐藏概率、随机种子或内部评分公式。',
      '不能把未发生的成交、调价、出价、带看当成事实。',
    );
  } else if (scene.sceneType === 'customer_wechat') {
    canKnow.push(
      '房源价格、市场价。',
      '户型差异、竞品价格对比。',
      '已安排的带看和市场信号。',
    );
    cannotKnow.push(
      '不能知道业主底价、业主信任/耐心/催促的具体数值。',
      '不能知道未曝光的隐藏概率、随机种子或内部评分公式。',
      '不能把未发生的成交、调价、出价、带看当成事实。',
    );
  } else if (scene.sceneType === 'manager_wechat') {
    canKnow.push(
      '今日动作安排和执行状态。',
      '风险状态和业主关系状态。',
      '客户推进状态和市场信号。',
    );
    cannotKnow.push(
      '不能知道未汇报的客户细节。',
      '不能知道未曝光的隐藏概率、随机种子或内部评分公式。',
      '不能把未发生的成交、调价、出价、带看当成事实。',
    );
  } else {
    canKnow.push(
      '当前房源价格、市场价、业主关系状态和已发生的玩家动作。',
      '与本房源相关的客户、竞品、市场信号和最近世界事件。',
    );
    cannotKnow.push(
      '不能知道未曝光的隐藏概率、随机种子或内部评分公式。',
      '不能把未发生的成交、调价、出价、带看当成事实。',
    );
  }

  // 通用不能知道
  cannotKnow.push('不能直接改 GameState，只能输出 proposal。');

  // 底价条件：已做面访且信任>70 才可知道
  const trust = scene.caseContext?.trust || 0;
  const hasVisited = scene.caseContext?.hasCompletedFirstVisit || false;
  if (!(hasVisited && trust > 70)) {
    cannotKnow.push('不能知道业主底价（除非已完成面访且信任>70）。');
  }

  return { canKnow, cannotKnow };
}

function buildAvailableActions(scene: ConversationSceneInputPack): CaseAgentAvailableAction[] {
  const actions: CaseAgentAvailableAction[] = [];
  if (scene.sceneType === 'owner_wechat') {
    actions.push({
      actionId: 'first-visit',
      label: '安排面访',
      preconditions: ['业主需要明确判断或关系需要修复'],
      expectedEffect: '当面讲清客户反馈、竞品和价格方案。',
    });
    actions.push({
      actionId: 'deep-diagnosis',
      label: '准备竞品对比',
      preconditions: ['客户或业主正在拿同类房比较'],
      expectedEffect: '用同类房差异解释价格和展示打法。',
    });
    actions.push({
      actionId: 'pricing-advice',
      label: '做价格沟通',
      preconditions: ['对话进入价格判断'],
      expectedEffect: '让业主理解守价、微调或换展示打法的边界。',
    });
    if ((scene.caseContext?.priceGapPct || 0) >= 3) {
      actions.push({
        actionId: 'adjust-listing-price',
        label: '确认挂牌价调整',
        preconditions: ['业主已接受价格复盘且有依据支撑'],
        expectedEffect: '把挂牌价调整写入正式动作。',
      });
    }
  }
  if (scene.sceneType === 'customer_wechat') {
    actions.push({
      actionId: 'showing',
      label: '安排带看',
      preconditions: ['客户还在比较但愿意继续看'],
      expectedEffect: '推进看房或看后反馈。',
    });
  }
  return actions.length ? actions : [{
    actionId: 'open_case',
    label: '打开房源',
    preconditions: ['需要回到房源看事实'],
    expectedEffect: '确认房源、客户、竞品和下一步。',
  }];
}
