import type { Case, CustomerRuntimeState, GameState, MarketSignal, Opportunity, Tone } from '../../domain/models.js';
import { getActiveOpportunities } from '../../domain/engine/opportunityEngine.js';
import { getDayOfWeek, getRoutine } from '../../domain/utils.js';
import { WEEKLY_ROUTINE } from '../../domain/constants.js';
import { buildFollowUpPriorityProjection } from '../../ui/features/followUpPriority.js';
import {
  buildMarketBoardDetail,
  buildMarketBoardSummary,
  buildMarketBoardTitle,
  buildMarketIntelProjection,
  describeLeadSiphonPower,
  type IntelItem,
} from '../../ui/features/marketIntel.js';

export type ProjectionTone = 'neutral' | 'chance' | 'risk';
export type CaseMainProblem = 'owner' | 'customer-pool' | 'price' | 'competition' | 'execution' | 'market';
export type OpportunityBucketId = 'met' | 'potential' | 'at-risk' | 'closing';

export interface ProjectionBrief {
  id: string;
  label: string;
  title: string;
  detail: string;
  tone: ProjectionTone;
  caseId?: string;
}

export interface CalendarDayProjection {
  day: number;
  label: string;
  title: string;
  detail: string;
  energy: number;
  tone: ProjectionTone;
}

export interface ResourceSnapshotProjection {
  energy: string;
  promotionBudget: string;
  wordOfMouth: string;
  commission: string;
  activeCases: number;
  activeOpportunities: number;
}

export interface DashboardProjection {
  todayHeadline: string;
  todayPriority: ProjectionBrief[];
  yesterdayIntel: ProjectionBrief[];
  weekCalendar: CalendarDayProjection[];
  resourceSnapshot: ResourceSnapshotProjection;
  riskReminders: ProjectionBrief[];
  priorityGroups: Array<{
    id: 'ownerRisk' | 'competitionRisk' | 'closingOpportunity';
    label: string;
    count: number;
    leadCaseId: string | null;
    leadCaseTitle: string | null;
    leadReason: string;
  }>;
  marketBrief: {
    todayCount: number;
    riskCount: number;
    chanceCount: number;
    lead: ProjectionBrief | null;
    briefs: ProjectionBrief[];
    impactedCases: ProjectionBrief[];
  };
}

export interface OpportunityBucketProjection {
  id: OpportunityBucketId;
  label: string;
  count: number;
  summary: string;
}

export interface CaseFactChainProjection {
  id: string;
  lane: 'main' | 'owner' | 'price' | 'pool';
  title: string;
  fact: string;
  nextStep: string;
  tone: ProjectionTone;
}

export interface CaseDetailProjection {
  caseId: string;
  headline: string;
  mainProblem: CaseMainProblem;
  mainProblemLabel: string;
  currentRiskTags: string[];
  actionReasons: ProjectionBrief[];
  factChain: CaseFactChainProjection[];
  nextStepLine: string;
  recentChanges: ProjectionBrief[];
  ownerSummary: {
    title: string;
    detail: string;
    trust: number;
    patience: number;
    urgency: number;
  };
  customerPoolSummary: {
    title: string;
    detail: string;
    metCount: number;
    potentialCount: number;
    comparingCount: number;
    closingCount: number;
    atRiskCount: number;
    buckets: OpportunityBucketProjection[];
  };
  priceSummary: {
    title: string;
    detail: string;
    askPrice: number;
    marketPrice: number;
    bottomPrice: number;
    gapToMarket: number;
  };
  competitionSummary: {
    title: string;
    detail: string;
    rivalCount: number;
    pressure: number;
  };
}

export interface OpportunityListProjection {
  totalActive: number;
  met: Opportunity[];
  potential: Opportunity[];
  closing: Opportunity[];
  atRisk: Opportunity[];
  realCustomerSummary: {
    contactedCount: number;
    viewedCount: number;
    comparingCount: number;
    negotiatingCount: number;
  };
  potentialSummary: {
    caseCount: number;
    channelCount: number;
    soonestDaysLeft: number | null;
  };
  bucketSummaries: OpportunityBucketProjection[];
  signalCards: Array<{
    id: string;
    title: string;
    detail: string;
    confidence: number;
    district: string;
    expiresInDays: number;
  }>;
}

export interface MarketProjection {
  headline: string;
  summary: string;
  yesterdayNews: ProjectionBrief[];
  radarAxes: {
    demandHeat: number;
    supplyPressure: number;
    rivalActivity: number;
    customerActivity: number;
    coSaleOpportunity: number;
  };
  radarCards: Array<{
    id: 'demandHeat' | 'supplyPressure' | 'rivalActivity' | 'customerActivity' | 'coSaleOpportunity';
    label: string;
    value: number;
    tone: ProjectionTone;
    summary: string;
  }>;
  districtBoards: Array<{
    marketId: string;
    name: string;
    title: string;
    summary: string;
    tone: ProjectionTone;
    demandHeat: number;
    supplyPressure: number;
    competitivePressure: number;
    sentiment: number;
  }>;
  competitionBoards: {
    rivalStores: ProjectionBrief[];
    rivalListings: ProjectionBrief[];
    companyPressure: ProjectionBrief[];
  };
  affectedCases: ProjectionBrief[];
  intelSummary: {
    todayCount: number;
    riskCount: number;
    chanceCount: number;
    layers: Array<{
      layer: 'macro' | 'district' | 'competition' | 'listing';
      label: string;
      totalCount: number;
      riskCount: number;
      chanceCount: number;
      summary: string;
      lead: ProjectionBrief | null;
    }>;
  };
}

export interface OperatingProjection {
  dashboard: DashboardProjection;
  cases: CaseDetailProjection[];
  opportunities: OpportunityListProjection;
  market: MarketProjection;
}

export function buildOperatingProjection(state: GameState): OperatingProjection {
  const caseDetails = state.cases.map((caseItem) => buildCaseDetailProjection(state, caseItem));

  return {
    dashboard: buildDashboardProjection(state, caseDetails),
    cases: caseDetails,
    opportunities: buildOpportunityListProjection(state),
    market: buildMarketProjection(state),
  };
}

export function buildDashboardProjection(
  state: GameState,
  caseDetails: CaseDetailProjection[] = state.cases.map((caseItem) => buildCaseDetailProjection(state, caseItem)),
): DashboardProjection {
  const activeCaseCount = state.cases.filter((caseItem) => caseItem.status === 'active').length;
  const priorityProjection = buildFollowUpPriorityProjection(state);
  const marketIntelProjection = buildMarketIntelProjection(state);
  const topPriorityCase = [...caseDetails]
    .filter((entry) => state.cases.find((caseItem) => caseItem.id === entry.caseId)?.status === 'active')
    .sort((left, right) => scoreCaseProjectionUrgency(right) - scoreCaseProjectionUrgency(left))[0];
  const riskReminders = buildRiskReminders(state, caseDetails, priorityProjection);
  const todayPriority = buildTodayPriority(state, caseDetails, priorityProjection);
  const yesterdayIntel = buildYesterdayIntel(state);

  return {
    todayHeadline: topPriorityCase
      ? `今天先盯 ${topPriorityCase.headline}`
      : activeCaseCount > 0
        ? `今天有 ${activeCaseCount} 套房在场，先按优先级处理。`
        : '这一局当前没有在场房源。',
    todayPriority,
    yesterdayIntel,
    weekCalendar: buildWeekCalendar(state),
    resourceSnapshot: {
      energy: `${Math.round(state.energy)}/${Math.round(state.maxEnergy)}`,
      promotionBudget: `${Math.round(state.auxiliaryStats?.promotionBudget ?? state.cash ?? 0)}`,
      wordOfMouth: `${Math.round(state.auxiliaryStats?.wordOfMouth ?? state.reputation ?? 0)}`,
      commission: `${Math.round(state.auxiliaryStats?.commission ?? state.commission ?? 0)}`,
      activeCases: activeCaseCount,
      activeOpportunities: state.opportunities.filter((opportunity) => opportunity.status === 'active').length,
    },
    riskReminders,
    priorityGroups: [
      priorityProjection.groups.ownerRisk,
      priorityProjection.groups.competitionRisk,
      priorityProjection.groups.closingOpportunity,
    ].map((group) => ({
      id: group.id,
      label: group.label,
      count: group.items.length,
      leadCaseId: group.leadCaseId,
      leadCaseTitle: group.leadCaseTitle,
      leadReason: group.leadReason,
    })),
    marketBrief: {
      todayCount: marketIntelProjection.todayCount,
      riskCount: marketIntelProjection.riskCount,
      chanceCount: marketIntelProjection.chanceCount,
      lead: marketIntelProjection.homepage.lead ? toIntelProjectionBrief(marketIntelProjection.homepage.lead) : null,
      briefs: marketIntelProjection.homepage.briefs.map((item) => toIntelProjectionBrief(item)),
      impactedCases: marketIntelProjection.homepage.impactedCases.map((item) => ({
        id: `market-impacted-${item.caseId}`,
        label: '受影响房源',
        title: item.title,
        detail: item.reason,
        tone: 'risk',
        caseId: item.caseId,
      })),
    },
  };
}

export function buildCaseDetailProjection(state: GameState, caseItem: Case): CaseDetailProjection {
  const opportunities = getActiveOpportunities(state, caseItem.id);
  const met = opportunities.filter((opportunity) => opportunity.visibility !== 'shadow');
  const potential = opportunities.filter((opportunity) => opportunity.visibility === 'shadow');
  const customerLinks = state.customerStates.filter((entry) => Boolean(entry.caseStates[caseItem.id]));
  const comparingCount = customerLinks.filter((entry) => entry.status === 'comparing').length;
  const closingCount = met.filter((opportunity) => opportunity.stageIndex >= 4).length;
  const atRiskCount = opportunities.filter((opportunity) => opportunity.daysLeft <= 2 || opportunity.intent < 45).length
    + customerLinks.filter((entry) => entry.churnRisk >= 60).length;
  const rivalListings = (state.marketShadow?.rivalListings || []).filter((entry) =>
    entry.status === 'active'
    && (entry.linkedCaseId === caseItem.id || entry.marketCellId === caseItem.marketCellId || entry.district === caseItem.district),
  );
  const competitionPressure = Math.round(
    Math.max(
      caseItem.competitiveness < 45 ? 70 : 0,
      caseItem.windowDays <= 3 ? 76 : 0,
      rivalListings.reduce((max, rival) => Math.max(max, rival.leadSiphonPower), 0),
      (state.marketShadow?.companyPressure?.sharedLeadPressure || 0),
    ),
  );
  const mainProblem = deriveMainProblem(caseItem, opportunities, customerLinks, competitionPressure);
  const factChain = buildCaseFactChain(caseItem, opportunities, customerLinks, competitionPressure, mainProblem);
  const recentChanges = buildCaseRecentChanges(state, caseItem, opportunities);

  return {
    caseId: caseItem.id,
    headline: `${caseItem.title} · ${mainProblemLabel(mainProblem)}`,
    mainProblem,
    mainProblemLabel: mainProblemLabel(mainProblem),
    currentRiskTags: buildRiskTags(caseItem, opportunities, competitionPressure, atRiskCount),
    actionReasons: buildCaseActionReasons(caseItem, opportunities, mainProblem, competitionPressure),
    factChain,
    nextStepLine: factChain[0]?.nextStep || '今天先把最容易掉线的一步补上。',
    recentChanges,
    ownerSummary: {
      title: deriveOwnerTitle(caseItem),
      detail: deriveOwnerDetail(caseItem),
      trust: Math.round(caseItem.trust),
      patience: Math.round(caseItem.patience),
      urgency: Math.round(caseItem.urgency),
    },
    customerPoolSummary: {
      title: deriveCustomerPoolTitle(met.length, potential.length, closingCount, atRiskCount),
      detail: deriveCustomerPoolDetail(caseItem, met, potential, comparingCount),
      metCount: met.length,
      potentialCount: potential.length,
      comparingCount,
      closingCount,
      atRiskCount,
      buckets: buildOpportunityBuckets(met, potential, closingCount, atRiskCount),
    },
    priceSummary: {
      title: derivePriceTitle(caseItem),
      detail: derivePriceDetail(caseItem),
      askPrice: caseItem.askPrice,
      marketPrice: caseItem.marketPrice,
      bottomPrice: caseItem.bottomPrice,
      gapToMarket: caseItem.askPrice - caseItem.marketPrice,
    },
    competitionSummary: {
      title: deriveCompetitionTitle(rivalListings.length, competitionPressure),
      detail: deriveCompetitionDetail(caseItem, rivalListings.length, competitionPressure),
      rivalCount: rivalListings.length,
      pressure: competitionPressure,
    },
  };
}

export function buildOpportunityListProjection(state: GameState): OpportunityListProjection {
  const active = state.opportunities.filter((opportunity) => opportunity.status === 'active');
  const potential = active.filter((opportunity) => opportunity.visibility === 'shadow');
  const met = active.filter((opportunity) => opportunity.visibility !== 'shadow');
  const closing = met.filter((opportunity) => opportunity.stageIndex >= 4);
  const atRisk = active.filter((opportunity) => opportunity.daysLeft <= 2 || opportunity.intent < 45);
  const customerStates = state.customerStates.filter((entry) => entry.activeCaseIds.length > 0);
  const viewedCaseKeys = new Set(
    customerStates.flatMap((entry) => Object.values(entry.caseStates).filter((runtime) => runtime.viewed).map((runtime) => runtime.caseId)),
  );
  const potentialCaseCount = new Set(potential.map((opportunity) => opportunity.caseId)).size;
  const potentialChannelCount = new Set(potential.map((opportunity) => opportunity.channelName).filter(Boolean)).size;

  return {
    totalActive: active.length,
    met,
    potential,
    closing,
    atRisk,
    realCustomerSummary: {
      contactedCount: met.length,
      viewedCount: viewedCaseKeys.size,
      comparingCount: customerStates.filter((entry) => entry.status === 'comparing').length,
      negotiatingCount: customerStates.filter((entry) => entry.status === 'negotiating').length,
    },
    potentialSummary: {
      caseCount: potentialCaseCount,
      channelCount: potentialChannelCount,
      soonestDaysLeft: potential.length > 0 ? Math.min(...potential.map((opportunity) => opportunity.daysLeft)) : null,
    },
    bucketSummaries: buildOpportunityBuckets(met, potential, closing.length, atRisk.length),
    signalCards: buildOpportunitySignalCards(state.marketShadow?.marketSignals || []),
  };
}

function buildCaseFactChain(
  caseItem: Case,
  opportunities: Opportunity[],
  customerLinks: CustomerRuntimeState[],
  competitionPressure: number,
  mainProblem: CaseMainProblem,
): CaseFactChainProjection[] {
  const metCount = opportunities.filter((opportunity) => opportunity.visibility !== 'shadow').length;
  const potentialCount = opportunities.filter((opportunity) => opportunity.visibility === 'shadow').length;
  const closingCount = opportunities.filter((opportunity) => opportunity.visibility !== 'shadow' && opportunity.stageIndex >= 4).length;
  const atRiskCount = opportunities.filter((opportunity) => opportunity.daysLeft <= 2 || opportunity.intent < 45).length;
  const priceGap = caseItem.askPrice - caseItem.marketPrice;
  const facts: CaseFactChainProjection[] = [];

  facts.push({
    id: `${caseItem.id}-owner`,
    lane: 'owner',
    title: '业主关系',
    fact: caseItem.lastOwnerTouchedDay >= 4
      ? `${caseItem.lastOwnerTouchedDay} 天没做业主反馈，信任和耐心都在下滑边缘。`
      : `当前信任 ${Math.round(caseItem.trust)}，耐心 ${Math.round(caseItem.patience)}，业主还在等明确反馈。`,
    nextStep: caseItem.lastOwnerTouchedDay >= 4
      ? '今天补一次带事实的反馈，把客户、带看、竞品和价格讲完整。'
      : '继续保持固定频率反馈，别让沟通断档。',
    tone: caseItem.lastOwnerTouchedDay >= 4 || caseItem.trust < 52 || caseItem.patience < 42 ? 'risk' : 'neutral',
  });

  facts.push({
    id: `${caseItem.id}-price`,
    lane: 'price',
    title: '价格站位',
    fact: priceGap > 0
      ? `挂牌比市场常见成交价高 ${priceGap} 万，当前底价 ${caseItem.bottomPrice} 万。`
      : `挂牌与市场常见成交价基本贴近，当前更看执行和客户承接。`,
    nextStep: priceGap > 0
      ? '先统一价格说法，再推进复看或报价，避免客户反复拿价格做比较。'
      : '保持价格稳定，集中把客户理由讲实。',
    tone: priceGap > 0 ? (priceGap >= 12 ? 'risk' : 'neutral') : 'chance',
  });

  facts.push({
    id: `${caseItem.id}-pool`,
    lane: 'pool',
    title: '客户承接',
    fact: `已接上 ${metCount} 位、潜在人群 ${potentialCount} 组，比较中 ${customerLinks.filter((entry) => entry.status === 'comparing').length} 位。`,
    nextStep: closingCount > 0
      ? '先盯已经走到报价和谈判的客户，把最后几步推进到确定动作。'
      : atRiskCount > 0
        ? '先回访快要掉线的客户，别让已接上的机会断掉。'
        : metCount === 0
          ? '先补第一批真人客户，再谈阶段推进。'
          : '把已接上的客户推进到看房或复看，别停在浅沟通。',
    tone: closingCount > 0 ? 'chance' : atRiskCount > 0 || metCount === 0 ? 'risk' : 'neutral',
  });

  facts.push({
    id: `${caseItem.id}-competition`,
    lane: 'main',
    title: '竞争与窗口',
    fact: caseItem.windowDays <= 3
      ? `窗口只剩 ${caseItem.windowDays} 天，竞品压力 ${competitionPressure}。`
      : `当前竞品压力 ${competitionPressure}，窗口还有 ${caseItem.windowDays} 天。`,
    nextStep: competitionPressure >= 68 || caseItem.windowDays <= 3
      ? '优先做能立刻影响客户和业主判断的动作，减少无效铺量。'
      : '保持持续跟进，稳住业主和客户两条线。',
    tone: competitionPressure >= 68 || caseItem.windowDays <= 3 ? 'risk' : 'neutral',
  });

  return facts
    .sort((left, right) => factToneWeight(right.tone) - factToneWeight(left.tone))
    .sort((left, right) => (left.lane === 'main' || left.lane === laneByProblem(mainProblem) ? -1 : 0) - (right.lane === 'main' || right.lane === laneByProblem(mainProblem) ? -1 : 0))
    .slice(0, 4);
}

function buildCaseRecentChanges(
  state: GameState,
  caseItem: Case,
  opportunities: Opportunity[],
): ProjectionBrief[] {
  const changes: ProjectionBrief[] = [];
  const snapshots = caseItem.competitivenessSnapshots || [];
  const latest = snapshots[0];

  if (latest && Math.abs(latest.delta) >= 0.1) {
    changes.push({
      id: `${caseItem.id}-score-delta`,
      label: '好房分变化',
      title: latest.delta >= 0 ? `好房分较上一轮 +${Math.round(latest.delta * 10) / 10}` : `好房分较上一轮 ${Math.round(latest.delta * 10) / 10}`,
      detail: latest.delta >= 0 ? '这套房吸引力在回升。' : '这套房吸引力在回落。',
      tone: latest.delta >= 0 ? 'chance' : 'risk',
      caseId: caseItem.id,
    });
  }

  if (caseItem.lastAskPrice !== caseItem.askPrice) {
    const priceDelta = caseItem.askPrice - caseItem.lastAskPrice;
    changes.push({
      id: `${caseItem.id}-price-change`,
      label: '挂牌变化',
      title: priceDelta >= 0 ? `挂牌上调 ${Math.round(priceDelta)} 万` : `挂牌下调 ${Math.round(Math.abs(priceDelta))} 万`,
      detail: `当前挂牌 ${caseItem.askPrice} 万，市场常见成交价 ${caseItem.marketPrice} 万。`,
      tone: priceDelta <= 0 ? 'chance' : 'neutral',
      caseId: caseItem.id,
    });
  }

  const latestOpportunityStep = opportunities
    .map((opportunity) => {
      const latestHistory = opportunity.history[opportunity.history.length - 1];
      const previousHistory = opportunity.history[opportunity.history.length - 2];
      if (!latestHistory || !previousHistory || latestHistory.stage === previousHistory.stage) {
        return null;
      }
      return {
        opportunity,
        latestHistory,
        previousHistory,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => right.latestHistory.day - left.latestHistory.day)[0];

  if (latestOpportunityStep) {
    changes.push({
      id: `${caseItem.id}-opportunity-step`,
      label: '客户阶段变化',
      title: `${latestOpportunityStep.opportunity.customerName} 从 ${latestOpportunityStep.previousHistory.stage} 到 ${latestOpportunityStep.latestHistory.stage}`,
      detail: `发生在第 ${latestOpportunityStep.latestHistory.day} 天，当前剩余窗口 ${latestOpportunityStep.opportunity.daysLeft} 天。`,
      tone: latestOpportunityStep.opportunity.stageIndex >= 4 ? 'chance' : 'neutral',
      caseId: caseItem.id,
    });
  }

  if (!caseItem.touchedToday && caseItem.status === 'active') {
    changes.push({
      id: `${caseItem.id}-no-touch`,
      label: '动作提醒',
      title: '今天这套房还没有明确动作',
      detail: '至少要补一个可落地动作，避免业主和客户都感受不到推进。',
      tone: 'risk',
      caseId: caseItem.id,
    });
  }

  if (changes.length === 0) {
    changes.push({
      id: `${caseItem.id}-steady`,
      label: '状态',
      title: '最近没有明显波动',
      detail: `第 ${state.day} 天这套房状态相对平稳，重点是别让跟进断掉。`,
      tone: 'neutral',
      caseId: caseItem.id,
    });
  }

  return changes.slice(0, 3);
}

function laneByProblem(problem: CaseMainProblem): CaseFactChainProjection['lane'] {
  if (problem === 'owner') return 'owner';
  if (problem === 'price') return 'price';
  if (problem === 'customer-pool') return 'pool';
  return 'main';
}

function factToneWeight(tone: ProjectionTone) {
  if (tone === 'risk') return 3;
  if (tone === 'chance') return 2;
  return 1;
}

export function buildMarketProjection(state: GameState): MarketProjection {
  const activeCases = state.cases.filter((caseItem) => caseItem.status === 'active');
  const marketIntelProjection = buildMarketIntelProjection(state);
  const yesterdayNews = buildYesterdayIntel(state);
  const averageDemand = averageValue(state.markets.map((market) => market.demandHeat));
  const averageSupply = averageValue(state.markets.map((market) => market.supplyPressure));
  const rivalListings = state.marketShadow?.rivalListings?.filter((entry) => entry.status === 'active') || [];
  const rivalActivity = averageValue([
    ...rivalListings.map((entry) => entry.leadSiphonPower),
    ...(state.marketShadow?.rivalStores || []).map((entry) => entry.activityHeat),
  ]);
  const customerActivity = averageValue(state.customerStates.map(scoreCustomerActivity));
  const coSaleOpportunity = Math.round(100 - Math.min(100, state.marketShadow?.companyPressure?.sharedLeadPressure || 0));
  const radarAxes = {
    demandHeat: Math.round(averageDemand),
    supplyPressure: Math.round(averageSupply),
    rivalActivity: Math.round(rivalActivity),
    customerActivity: Math.round(customerActivity),
    coSaleOpportunity,
  };
  const affectedCases = marketIntelProjection.impactedCases
    .slice(0, 5)
    .map((item) => {
      const caseItem = activeCases.find((entry) => entry.id === item.caseId);
      const pressure = item.tone === 'risk'
        ? Math.max(item.count * 18, caseItem ? calculateMarketPressureForCase(state, caseItem) : 0)
        : 0;

      return {
        id: `affected-${item.caseId}`,
        label: '受影响房源',
        title: item.title,
        detail: item.reason,
        tone: pressure >= 70 ? 'risk' as const : 'neutral' as const,
        caseId: item.caseId,
      };
    });

  return {
    headline: deriveMarketHeadline(state, rivalListings.length),
    summary: deriveMarketSummary(state, radarAxes, rivalListings.length),
    yesterdayNews,
    radarAxes,
    radarCards: buildMarketRadarCards(radarAxes),
    districtBoards: buildDistrictBoards(state),
    competitionBoards: buildCompetitionBoards(state, rivalListings),
    affectedCases,
    intelSummary: {
      todayCount: marketIntelProjection.todayCount,
      riskCount: marketIntelProjection.riskCount,
      chanceCount: marketIntelProjection.chanceCount,
      layers: marketIntelProjection.layers.map((layer) => ({
        layer: layer.layer,
        label: layer.label,
        totalCount: layer.totalCount,
        riskCount: layer.riskCount,
        chanceCount: layer.chanceCount,
        summary: layer.summary,
        lead: layer.lead ? toIntelProjectionBrief(layer.lead) : null,
      })),
    },
  };
}

function buildTodayPriority(
  state: GameState,
  caseDetails: CaseDetailProjection[],
  priorityProjection: ReturnType<typeof buildFollowUpPriorityProjection>,
): ProjectionBrief[] {
  const fromSchedule = state.schedule.slice(0, 3).map((entry) => ({
    id: `schedule-${entry.key}`,
    label: '待处理',
    title: entry.title,
    detail: entry.note || entry.badge,
    tone: entry.urgency >= 75 ? 'risk' as const : 'neutral' as const,
    caseId: entry.caseId,
  }));
  const scheduledCaseIds = new Set(fromSchedule.map((item) => item.caseId).filter(Boolean));
  const fromPriorityGroups = [
    priorityProjection.groups.ownerRisk.items[0],
    priorityProjection.groups.competitionRisk.items[0],
    priorityProjection.groups.closingOpportunity.items[0],
  ]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => !scheduledCaseIds.has(item.caseId))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(0, 4 - fromSchedule.length))
    .map((item) => ({
      id: `priority-group-${item.caseId}-${item.type}`,
      label: item.label,
      title: `${item.caseTitle} · ${item.shortReason}`,
      detail: item.reason,
      tone: item.tone,
      caseId: item.caseId,
    }));
  const selectedCaseIds = new Set([
    ...scheduledCaseIds,
    ...fromPriorityGroups.map((item) => item.caseId).filter(Boolean),
  ]);
  const fromCaseDetails = caseDetails
    .filter((entry) => !selectedCaseIds.has(entry.caseId))
    .filter((entry) => !fromSchedule.some((item) => item.caseId === entry.caseId))
    .sort((left, right) => scoreCaseProjectionUrgency(right) - scoreCaseProjectionUrgency(left))
    .slice(0, Math.max(0, 4 - fromSchedule.length - fromPriorityGroups.length))
    .map((entry) => ({
      id: `case-priority-${entry.caseId}`,
      label: entry.mainProblemLabel,
      title: entry.headline,
      detail: entry.actionReasons[0]?.detail || '今天要给这套房补一个明确动作。',
      tone: entry.currentRiskTags.length >= 2 ? 'risk' as const : 'neutral' as const,
      caseId: entry.caseId,
    }));

  return [...fromSchedule, ...fromPriorityGroups, ...fromCaseDetails].slice(0, 4);
}

function buildYesterdayIntel(state: GameState): ProjectionBrief[] {
  const yesterday = Math.max(1, state.day - 1);
  const yesterdayEvents = state.eventStore
    .filter((event) => event.day === yesterday)
    .slice(-4)
    .reverse();

  if (yesterdayEvents.length > 0) {
    return yesterdayEvents.map((event) => ({
      id: `yesterday-${event.id}`,
      label: event.actor,
      title: event.title,
      detail: event.detail,
      tone: mapTone(event.tone),
      caseId: event.caseId,
    }));
  }

  return state.eventLog
    .filter((event) => event.day === yesterday)
    .slice(-4)
    .reverse()
    .map((event, index) => ({
      id: `yesterday-log-${index}`,
      label: event.actor,
      title: trimTitle(event.message),
      detail: event.message,
      tone: mapTone(event.tone),
    }));
}

function buildWeekCalendar(state: GameState): CalendarDayProjection[] {
  return Array.from({ length: 7 }, (_, offset) => {
    const day = state.day + offset;
    const routine = getRoutine(day, WEEKLY_ROUTINE);
    const dayOfWeek = getDayOfWeek(day);
    const title = offset === 0 ? '今天' : routine.label;

    return {
      day,
      label: title,
      title: routine.theme,
      detail: deriveCalendarDetail(dayOfWeek, routine.theme),
      energy: routine.energy,
      tone: routine.energy <= 1 ? 'risk' : dayOfWeek === 6 || dayOfWeek === 7 ? 'chance' : 'neutral',
    };
  });
}

function buildRiskReminders(
  state: GameState,
  caseDetails: CaseDetailProjection[],
  priorityProjection: ReturnType<typeof buildFollowUpPriorityProjection>,
): ProjectionBrief[] {
  const leadRiskCaseIds = new Set([
    priorityProjection.groups.ownerRisk.leadCaseId,
    priorityProjection.groups.competitionRisk.leadCaseId,
  ].filter((value): value is string => Boolean(value)));
  const caseReminders: ProjectionBrief[] = caseDetails
    .filter((entry) => entry.currentRiskTags.length > 0 || leadRiskCaseIds.has(entry.caseId))
    .sort((left, right) => scoreCaseProjectionUrgency(right) - scoreCaseProjectionUrgency(left))
    .slice(0, 3)
    .map((entry) => ({
      id: `risk-${entry.caseId}`,
      label: '丢盘风险',
      title: entry.headline,
      detail: entry.currentRiskTags.join('、'),
      tone: 'risk' as const,
      caseId: entry.caseId,
    }));

  if (state.energy <= 1) {
    caseReminders.unshift({
      id: 'risk-low-energy',
      label: '资源风险',
      title: '今天精力很紧',
      detail: '只处理最关键的业主、客户和谈价动作。',
      tone: 'risk',
    });
  }

  return caseReminders.slice(0, 4);
}

function deriveMainProblem(
  caseItem: Case,
  opportunities: Opportunity[],
  customerLinks: CustomerRuntimeState[],
  competitionPressure: number,
): CaseMainProblem {
  if (caseItem.trust < 52 || caseItem.patience < 42 || caseItem.lastOwnerTouchedDay >= 4) return 'owner';
  if (caseItem.askPrice > caseItem.marketPrice * 1.04) return 'price';
  if (competitionPressure >= 68 || caseItem.windowDays <= 3) return 'competition';
  if (opportunities.filter((opportunity) => opportunity.visibility !== 'shadow').length === 0 && customerLinks.length < 2) return 'customer-pool';
  if (!caseItem.hasCompletedFirstVisit || !caseItem.touchedToday) return 'execution';
  return 'market';
}

function mainProblemLabel(problem: CaseMainProblem) {
  if (problem === 'owner') return '业主沟通';
  if (problem === 'customer-pool') return '客户承接';
  if (problem === 'price') return '价格';
  if (problem === 'competition') return '竞品压力';
  if (problem === 'execution') return '今天动作';
  return '外部变化';
}

function buildRiskTags(caseItem: Case, opportunities: Opportunity[], competitionPressure: number, atRiskCount: number) {
  const tags: string[] = [];
  if (caseItem.trust < 52) tags.push('业主信任低');
  if (caseItem.patience < 42) tags.push('业主耐心低');
  if (caseItem.askPrice > caseItem.marketPrice * 1.04) tags.push('挂牌价偏高');
  if (caseItem.windowDays <= 3) tags.push('窗口很短');
  if (competitionPressure >= 68) tags.push('竞品压力高');
  if (atRiskCount > 0) tags.push('客户可能流失');
  if (opportunities.length === 0) tags.push('缺客户');
  return tags;
}

function buildCaseActionReasons(
  caseItem: Case,
  opportunities: Opportunity[],
  mainProblem: CaseMainProblem,
  competitionPressure: number,
): ProjectionBrief[] {
  const reasons: ProjectionBrief[] = [];

  if (mainProblem === 'owner') {
    reasons.push({
      id: `${caseItem.id}-owner-feedback`,
      label: '待处理',
      title: '先给业主一次有事实的反馈',
      detail: '业主关系在变紧，反馈要带上客户、带看、竞品和价格依据。',
      tone: 'risk',
      caseId: caseItem.id,
    });
  }

  if (mainProblem === 'price') {
    reasons.push({
      id: `${caseItem.id}-price-talk`,
      label: '待处理',
      title: '先把价格说法统一',
      detail: `挂牌价比市场常见成交价高 ${Math.max(0, caseItem.askPrice - caseItem.marketPrice)} 万，客户推进会被价格卡住。`,
      tone: 'risk',
      caseId: caseItem.id,
    });
  }

  if (mainProblem === 'customer-pool') {
    reasons.push({
      id: `${caseItem.id}-customer-pool`,
      label: '待处理',
      title: '先补客户线索',
      detail: '现在接上的客户不够，开放日、私域转介绍或合作经纪人都可以补线索。',
      tone: 'neutral',
      caseId: caseItem.id,
    });
  }

  if (mainProblem === 'competition') {
    reasons.push({
      id: `${caseItem.id}-competition`,
      label: '待处理',
      title: '先处理竞品分流',
      detail: competitionPressure >= 70 ? '同类盘正在分走客户，要么提速带看，要么把价格和卖点讲硬。' : '窗口变短，今天动作不能再拖。',
      tone: 'risk',
      caseId: caseItem.id,
    });
  }

  if (mainProblem === 'execution') {
    reasons.push({
      id: `${caseItem.id}-execution`,
      label: '待处理',
      title: '先补一个明确动作',
      detail: caseItem.hasCompletedFirstVisit ? '今天还没有明确触达，先把客户或业主接上。' : '首次面访没完成，业主、价格和房源故事都还不稳。',
      tone: 'neutral',
      caseId: caseItem.id,
    });
  }

  const closing = opportunities.find((opportunity) => opportunity.visibility !== 'shadow' && opportunity.stageIndex >= 4);
  if (closing) {
    reasons.push({
      id: `${caseItem.id}-closing-${closing.id}`,
      label: '成交线索',
      title: `${closing.customerName} 已经到 ${closing.stageLabel}`,
      detail: '这不是继续铺线索的时候了，今天要把报价、谈判和成交条件讲透。',
      tone: 'chance',
      caseId: caseItem.id,
    });
  }

  return reasons.slice(0, 3);
}

function buildOpportunityBuckets(
  met: Opportunity[],
  potential: Opportunity[],
  closingCount: number,
  atRiskCount: number,
): OpportunityBucketProjection[] {
  return [
    {
      id: 'met',
      label: '见过面 / 接上话',
      count: met.length,
      summary: met.length > 0 ? '可以做阶段管理。' : '还没有稳定接上的客户。',
    },
    {
      id: 'potential',
      label: '潜在人群',
      count: potential.length,
      summary: potential.length > 0 ? '只能先按规模和概率判断，不能当成真实意向。' : '潜在人群还没浮出来。',
    },
    {
      id: 'closing',
      label: '快到报价',
      count: closingCount,
      summary: closingCount > 0 ? '已经进入报价或谈判区。' : '暂时没有走到成交桌的客户。',
    },
    {
      id: 'at-risk',
      label: '流失风险',
      count: atRiskCount,
      summary: atRiskCount > 0 ? '今天需要优先回访或解释价格。' : '短期流失压力不明显。',
    },
  ];
}

function buildOpportunitySignalCards(signals: MarketSignal[]) {
  return signals.slice(0, 3).map((signal) => ({
    id: signal.id,
    title: signal.title,
    detail: signal.message,
    confidence: signal.confidence,
    district: signal.district,
    expiresInDays: signal.expiresInDays,
  }));
}

function deriveOwnerTitle(caseItem: Case) {
  if (caseItem.trust < 52) return '业主开始不放心';
  if (caseItem.patience < 42) return '业主耐心不多';
  if (caseItem.urgency >= 78) return '业主更看重速度';
  return '业主还能配合';
}

function deriveOwnerDetail(caseItem: Case) {
  if (caseItem.lastOwnerTouchedDay >= 4) return `${caseItem.lastOwnerTouchedDay} 天没做业主反馈，今天要补事实。`;
  if (caseItem.trust < 52) return '反馈不能只说“在推”，要拿客户、带看、竞品和价格讲清楚。';
  if (caseItem.patience < 42) return '沟通要更直接，别绕太久。';
  return caseItem.ownerMood || '当前业主状态相对稳定。';
}

function deriveCustomerPoolTitle(metCount: number, potentialCount: number, closingCount: number, atRiskCount: number) {
  if (closingCount > 0) return '客户已经走到报价前后';
  if (atRiskCount > 0) return '客户池有流失风险';
  if (metCount >= 3) return '客户池比较厚';
  if (metCount > 0 || potentialCount > 0) return '客户池还在培养';
  return '客户池偏薄';
}

function deriveCustomerPoolDetail(caseItem: Case, met: Opportunity[], potential: Opportunity[], comparingCount: number) {
  if (met.some((opportunity) => opportunity.stageIndex >= 4)) return '已有客户进入报价或谈判，今天要把确定性往成交桌上推。';
  if (comparingCount > 0) return `${comparingCount} 位客户还在比较同类盘，${caseItem.title} 的价格和卖点要讲得更具体。`;
  if (potential.length > 0) return '有潜在线索，但预算和需求还没核实，不能当成真实成交机会。';
  if (met.length > 0) return '已经接上客户，但阶段还浅，需要继续推进到看房、复看或报价。';
  return '当前客户承接不足，先补线索和曝光。';
}

function derivePriceTitle(caseItem: Case) {
  if (caseItem.askPrice <= caseItem.marketPrice) return '价格有竞争力';
  if (caseItem.askPrice <= caseItem.marketPrice * 1.03) return '价格略高但可谈';
  return '价格偏硬';
}

function derivePriceDetail(caseItem: Case) {
  const gap = caseItem.askPrice - caseItem.marketPrice;
  if (gap <= 0) return `挂牌 ${caseItem.askPrice} 万，低于或接近市场常见成交价。`;
  return `挂牌 ${caseItem.askPrice} 万，比市场常见成交价高 ${gap} 万，底价 ${caseItem.bottomPrice} 万。`;
}

function deriveCompetitionTitle(rivalCount: number, pressure: number) {
  if (pressure >= 70) return '竞品压力很高';
  if (rivalCount > 0) return '已有同类房在抢客户';
  return '竞品压力可控';
}

function deriveCompetitionDetail(caseItem: Case, rivalCount: number, pressure: number) {
  if (pressure >= 70) return `${caseItem.district} 的同类竞争偏强，客户容易被分走。`;
  if (rivalCount > 0) return `有 ${rivalCount} 套同类竞品在场，需要盯客户比较关系。`;
  return '当前没有明显强竞品压到这套房。';
}

function deriveCalendarDetail(dayOfWeek: number, theme: string) {
  if (dayOfWeek === 6) return '周末带看高峰，适合集中承接客户。';
  if (dayOfWeek === 7) return '适合追开放日和周末带看反馈。';
  if (theme.includes('业主')) return '把客户、带看、竞品和价格整理成事实再沟通。';
  if (theme.includes('获客')) return '重点补客户池，不要只等自然进线。';
  if (theme.includes('聚焦')) return '确定资源位，别让好房被同类盘分走。';
  return '按当天资源处理最关键事项。';
}

function deriveMarketHeadline(state: GameState, rivalCount: number) {
  const dailyEvent = state.marketShadow?.dailyMarketEvent;
  if (dailyEvent) return dailyEvent.title;
  if (rivalCount > 0) return `今天有 ${rivalCount} 套竞品在场`;
  const hottest = [...state.markets].sort((left, right) => right.demandHeat - left.demandHeat)[0];
  return hottest ? `${hottest.name} 今天客户更活跃` : '今天市场变化不大';
}

function deriveMarketSummary(
  state: GameState,
  radarAxes: MarketProjection['radarAxes'],
  rivalCount: number,
) {
  const hottest = [...state.markets].sort((left, right) => right.demandHeat - left.demandHeat)[0];
  const toughest = [...state.markets].sort((left, right) => right.competitivePressure - left.competitivePressure)[0];
  const fragments: string[] = [];

  if (hottest) {
    fragments.push(`${hottest.name} 的客户热度最高`);
  }
  if (toughest && toughest.competitivePressure >= 60) {
    fragments.push(`${toughest.name} 的竞争最挤`);
  }
  if (rivalCount > 0) {
    fragments.push(`现在有 ${rivalCount} 套竞品在抢同类客户`);
  }
  if (radarAxes.coSaleOpportunity >= 55) {
    fragments.push('同 ACN 联卖空间还在');
  } else {
    fragments.push('同 ACN 分客压力偏紧');
  }

  return fragments.join('，') || '今天市场没有出现特别极端的变化。';
}

function buildMarketRadarCards(radarAxes: MarketProjection['radarAxes']) {
  return [
    {
      id: 'demandHeat' as const,
      label: '客户热度',
      value: radarAxes.demandHeat,
      tone: (radarAxes.demandHeat >= 65 ? 'chance' : radarAxes.demandHeat <= 40 ? 'risk' : 'neutral') as ProjectionTone,
      summary: radarAxes.demandHeat >= 65 ? '客户愿意出来看房，适合提速承接。' : radarAxes.demandHeat <= 40 ? '客户偏观望，推进会慢。' : '客户热度中性。',
    },
    {
      id: 'supplyPressure' as const,
      label: '在售供给',
      value: radarAxes.supplyPressure,
      tone: (radarAxes.supplyPressure >= 65 ? 'risk' : 'neutral') as ProjectionTone,
      summary: radarAxes.supplyPressure >= 65 ? '同类房多，业主更容易拿你去比。' : '供给压力暂时可控。',
    },
    {
      id: 'rivalActivity' as const,
      label: '竞对动作',
      value: radarAxes.rivalActivity,
      tone: (radarAxes.rivalActivity >= 65 ? 'risk' : 'neutral') as ProjectionTone,
      summary: radarAxes.rivalActivity >= 65 ? '竞店和竞品动作偏猛，容易分客。' : '竞对动作暂时不算太猛。',
    },
    {
      id: 'customerActivity' as const,
      label: '客户活跃',
      value: radarAxes.customerActivity,
      tone: (radarAxes.customerActivity >= 65 ? 'chance' : radarAxes.customerActivity <= 40 ? 'risk' : 'neutral') as ProjectionTone,
      summary: radarAxes.customerActivity >= 65 ? '已有客户更愿意继续往前走。' : radarAxes.customerActivity <= 40 ? '客户承接容易断档。' : '客户活跃度处于中段。',
    },
    {
      id: 'coSaleOpportunity' as const,
      label: '联卖空间',
      value: radarAxes.coSaleOpportunity,
      tone: (radarAxes.coSaleOpportunity >= 60 ? 'chance' : radarAxes.coSaleOpportunity <= 35 ? 'risk' : 'neutral') as ProjectionTone,
      summary: radarAxes.coSaleOpportunity >= 60 ? '同 ACN 还有分客和联卖空间。' : radarAxes.coSaleOpportunity <= 35 ? '同 ACN 资源位很紧，先守住重点房。' : '联卖机会一般。',
    },
  ];
}

function buildDistrictBoards(state: GameState): MarketProjection['districtBoards'] {
  return [...state.markets]
    .sort((left, right) => {
      const leftScore = left.demandHeat - left.competitivePressure - left.supplyPressure / 2;
      const rightScore = right.demandHeat - right.competitivePressure - right.supplyPressure / 2;
      return rightScore - leftScore;
    })
    .map((market) => ({
      marketId: market.id,
      name: market.name,
      title: buildMarketBoardTitle(market),
      summary: buildMarketBoardSummary(market),
      tone: market.demandHeat >= 70 && market.competitivePressure < 60
        ? 'chance'
        : market.competitivePressure >= 65 || market.supplyPressure >= 70 || market.sentiment <= 40
          ? 'risk'
          : 'neutral',
      demandHeat: market.demandHeat,
      supplyPressure: market.supplyPressure,
      competitivePressure: market.competitivePressure,
      sentiment: market.sentiment,
    }));
}

function buildCompetitionBoards(
  state: GameState,
  rivalListings: NonNullable<GameState['marketShadow']>['rivalListings'],
): MarketProjection['competitionBoards'] {
  const rivalStores = (state.marketShadow?.rivalStores || [])
    .slice()
    .sort((left, right) => right.activityHeat - left.activityHeat)
    .slice(0, 4)
    .map((store) => ({
      id: `rival-store-${store.id}`,
      label: store.type === 'same_company' ? '同公司' : '外部',
      title: store.name,
      detail: `${store.activityHeat >= 70 ? '动作很猛' : store.activityHeat >= 50 ? '动作偏多' : '动作一般'}，重点盯 ${store.districtFocus[0] || '多个商圈'}。`,
      tone: store.activityHeat >= 65 ? 'risk' as const : 'neutral' as const,
    }));

  const listingCards = rivalListings
    .slice()
    .sort((left, right) => right.leadSiphonPower - left.leadSiphonPower)
    .slice(0, 4)
    .map((listing) => ({
      id: `rival-listing-${listing.id}`,
      label: '竞品房源',
      title: listing.title,
      detail: `${listing.district} · ${listing.segment} · ${describeLeadSiphonPower(listing.leadSiphonPower)}。`,
      tone: listing.leadSiphonPower >= 62 ? 'risk' as const : 'neutral' as const,
      caseId: listing.linkedCaseId,
    }));

  const pressure = state.marketShadow?.companyPressure;
  const companyPressure = pressure ? [
    {
      id: 'company-pressure-shared-lead',
      label: '同 ACN',
      title: pressure.sharedLeadPressure >= 58 ? '共享客户偏紧' : '共享客户尚可',
      detail: pressure.sharedLeadPressure >= 58 ? '今天同 ACN 也在抢同一批客户。' : '今天同 ACN 分客压力不大。',
      tone: pressure.sharedLeadPressure >= 58 ? 'risk' as const : 'neutral' as const,
    },
    {
      id: 'company-pressure-focus-slot',
      label: '资源位',
      title: pressure.focusSlotPressure >= 60 ? '重点资源位在抢' : '重点资源位还算稳定',
      detail: pressure.focusSlotPressure >= 60 ? '房源端和客源端都在争重点位置。' : '当前资源位冲突不算明显。',
      tone: pressure.focusSlotPressure >= 60 ? 'risk' as const : 'neutral' as const,
    },
  ] : [];

  return {
    rivalStores,
    rivalListings: listingCards,
    companyPressure,
  };
}

function scoreCaseProjectionUrgency(entry: CaseDetailProjection) {
  return entry.currentRiskTags.length * 30
    + entry.customerPoolSummary.closingCount * 35
    + entry.customerPoolSummary.atRiskCount * 20
    + entry.competitionSummary.pressure
    + Math.max(0, entry.priceSummary.gapToMarket) / 2;
}

function calculateMarketPressureForCase(state: GameState, caseItem: Case) {
  const market = state.markets.find((entry) => entry.id === caseItem.marketCellId);
  const rivalPressure = (state.marketShadow?.rivalListings || [])
    .filter((entry) => entry.status === 'active' && (entry.marketCellId === caseItem.marketCellId || entry.district === caseItem.district))
    .reduce((max, entry) => Math.max(max, entry.leadSiphonPower), 0);
  return Math.round(Math.max(
    market?.competitivePressure || 0,
    market?.supplyPressure || 0,
    rivalPressure,
    caseItem.windowDays <= 3 ? 72 : 0,
  ));
}

function scoreCustomerActivity(customerState: CustomerRuntimeState) {
  if (customerState.status === 'negotiating') return 88;
  if (customerState.status === 'engaged') return 72;
  if (customerState.status === 'comparing') return 62;
  if (customerState.status === 'browsing') return 42;
  return 18;
}

function averageValue(values: number[]) {
  const filtered = values.filter(Number.isFinite);
  if (filtered.length === 0) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function mapTone(tone: Tone): ProjectionTone {
  if (tone === 'danger') return 'risk';
  if (tone === 'success') return 'chance';
  return 'neutral';
}

function toIntelProjectionBrief(item: IntelItem): ProjectionBrief {
  return {
    id: item.id,
    label: item.badge,
    title: item.title,
    detail: item.detail,
    tone: item.tone === 'risk' ? 'risk' : item.tone === 'chance' ? 'chance' : 'neutral',
    caseId: item.affectedCaseIds[0],
  };
}

function trimTitle(message: string) {
  const first = message.split('，')[0] || message;
  return first.length > 24 ? `${first.slice(0, 24)}...` : first;
}
