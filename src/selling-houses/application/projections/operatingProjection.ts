import type {
  Case,
  CustomerProfile,
  CustomerRuntimeState,
  GameState,
  MatterEntry,
  Opportunity,
  TodayPlanConflictHint,
  TodayArrangementSlot,
} from '../../domain/models.js';
import { ACTIONS, WEEKLY_ROUTINE } from '../../domain/constants.js';
import { isScenarioAction } from '../../domain/actions/templates.js';
import { getActionStageRelation } from '../../domain/actionStageRelations.js';
import { getActionAvailability } from '../../domain/engine.js';
import { getActiveOpportunities } from '../../domain/engine/opportunityEngine.js';
import { deriveCaseRecommendations, type CaseRecommendationTier } from '../../domain/recommendationEngine.js';
import { average, getDayOfWeek, getRoutine } from '../../domain/utils.js';
import {
  estimateFixedTodayPlanEnergyReserve,
  getVisibleFixedScheduleEntries,
  getSlotRemainingCapacity,
  getTodayPlanCommittedEnergy,
  getTodayPlanConflictHint,
  getTodayPlanRemainingEnergy,
  isSlotBlockingRoutine,
  resolveActionDurationHours,
  resolveScheduleEntryDurationHours,
  resolveScheduleEntrySlot,
} from '../todayPlan.js';
import { buildFollowUpPriorityProjection } from '../../ui/features/followUpPriority.js';
import { averageValue, mapTone, trimTitle } from './operatingProjectionHelpers.js';
import {
  buildMarketBoardDetail,
  buildMarketBoardSummary,
  buildMarketBoardTitle,
  buildMarketIntelProjection,
  describeLeadSiphonPower,
  type IntelItem,
  type IntelLayerTab,
} from '../../ui/features/marketIntel.js';
import type { OwnerProfilingMemorySummary } from '../../domain/ownerProfilingMemoryTypes.js';

function formatVisibleDaysLeft(daysLeft: number) {
  const value = Number.isFinite(daysLeft) ? Math.max(0, daysLeft) : 0;
  if (value < 1) return '不足 1 天';
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.001) return `${rounded} 天`;
  return `约 ${Math.ceil(value)} 天`;
}

export type ProjectionTone = 'neutral' | 'chance' | 'risk';
export type CaseMainProblem = 'owner' | 'customer-pool' | 'price' | 'competition' | 'execution' | 'market';
export type OpportunityBucketId = 'met' | 'potential' | 'at-risk' | 'closing';
export type ListingLifecyclePhaseCode =
  | 'pre_visit'
  | 'packaging'
  | 'showing'
  | 'feedback_offer'
  | 'negotiation'
  | 'sold'
  | 'written_off'
  | 'sold_elsewhere';
export type ListingLifecycleDelayLevel = 'on_track' | 'watch' | 'late';

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

export interface ArrangementItemProjection {
  id: string;
  source: 'fixed' | 'candidate' | 'planned' | 'completed';
  slot?: TodayArrangementSlot;
  rank?: number;
  label: string;
  title: string;
  displayTitle?: string;
  contextTitle?: string;
  detail: string;
  tone: ProjectionTone;
  caseId?: string;
  matterId?: string;
  customerId?: string;
  opportunityId?: string;
  durationHours: number;
  energyCost: number;
  statusLabel: string;
  actionId?: string;
  executionMode: 'direct' | 'scenario' | 'navigate';
  ctaLabel: string;
  secondaryLabel?: string;
  todayPlanItemId?: string;
  disabledReason?: string;
  conflictHint?: TodayPlanConflictHint;
  isDisabled?: boolean;
}

export interface ArrangementSlotProjection {
  slot: TodayArrangementSlot;
  label: string;
  fixedItems: ArrangementItemProjection[];
  plannedItems: ArrangementItemProjection[];
  candidateItems: ArrangementItemProjection[];
  completedItems: ArrangementItemProjection[];
}

export interface ArrangementProjection {
  headline: string;
  summary: string;
  remainingEnergy: number;
  remainingEnergyLabel: string;
  plannedEnergy: number;
  fixedEnergyReserve: number;
  plannedEnergyLabel: string;
  fixedItems: ArrangementItemProjection[];
  plannedItems: ArrangementItemProjection[];
  candidateItems: ArrangementItemProjection[];
  completedItems: ArrangementItemProjection[];
  weekFocusLabel: string;
  slots: Record<TodayArrangementSlot, ArrangementSlotProjection>;
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
  triageCards: Array<{
    id: 'cases' | 'customers' | 'market';
    label: string;
    title: string;
    detail: string;
    countLabel: string;
    tone: ProjectionTone;
    targetView: 'cases' | 'customers' | 'market';
    marketLayer?: IntelLayerTab;
    caseId?: string;
  }>;
  arrangement: ArrangementProjection;
  productOpportunities: ProductOpportunityProjection[];
}

export type ProductOpportunityType = 'open-day' | 'sincere-sale';
export type ProductOpportunityScope = 'community' | 'listing';
export type ProductOpportunityStatus = 'candidate' | 'triggered' | 'acknowledged' | 'accepted' | 'expired';

export interface ProductOpportunityProjection {
  id: string;
  type: ProductOpportunityType;
  scope: ProductOpportunityScope;
  status: ProductOpportunityStatus;
  reasonLabel: string;
  targetId: string;
  expiresAtDay?: number;
  primaryActionLabel: string;
  headline: string;
  subline: string;
  actionId: 'open-day' | 'sincerity-sale';
  actionCaseId: string;
  caseId?: string;
}

export interface OpportunityBucketProjection {
  id: OpportunityBucketId;
  label: string;
  count: number;
  summary: string;
}

export type CustomerRelationTone = 'neutral' | 'chance' | 'risk';

export interface CustomerCaseRelationProjection {
  id: string;
  caseId: string;
  opportunityId?: string;
  title: string;
  district: string;
  stageIndex: number;
  stageLabel: string;
  intent: number;
  confidence: number;
  fit: number;
  daysLeft?: number;
  viewed: boolean;
  selected: boolean;
  revealed: boolean;
  channelName?: string;
  tone: CustomerRelationTone;
  nextActionId?: string;
  nextActionLabel?: string;
}

export interface CustomerProjection {
  customerId: string;
  name: string;
  profile: string;
  budgetLine: string;
  targetDistrict: string;
  layoutLine: string;
  statusLabel: string;
  statusDetail: string;
  advisorTrust: number;
  fatigue: number;
  churnRisk: number;
  activeRelationCount: number;
  revealedRelationCount: number;
  viewedRelationCount: number;
  topCaseId?: string;
  topCaseTitle?: string;
  primaryActionId?: string;
  primaryActionLabel?: string;
  rankScore: number;
  relations: CustomerCaseRelationProjection[];
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
  listingLifecyclePhase: ListingLifecyclePhaseProjection;
  mainProblem: CaseMainProblem;
  mainProblemLabel: string;
  currentRiskTags: string[];
  actionReasons: ProjectionBrief[];
  comparisonSummary: {
    title: string;
    detail: string;
    rivalStores: ProjectionBrief[];
    rivalListings: ProjectionBrief[];
    comparingCustomers: ProjectionBrief[];
    decisionLens: string[];
  };
  factChain: CaseFactChainProjection[];
  nextStepLine: string;
  recentChanges: ProjectionBrief[];
  ownerSummary: {
    isRevealed: boolean;
    title: string;
    detail: string;
    trust: number;
    patience: number;
    urgency: number;
  };
  ownerProfiling: OwnerProfilingMemorySummary | null;
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

export interface ListingLifecyclePhaseProjection {
  phaseCode: ListingLifecyclePhaseCode;
  phaseLabel: string;
  coreProblemLabel: string;
  primaryActionId?: string;
  primaryActionLabel: string;
  phaseAgeDays: number;
  phaseDelayLevel: ListingLifecycleDelayLevel;
  phaseRiskHint: string;
  completionStateLabel?: string;
}

export interface OpportunityListProjection {
  totalActive: number;
  met: Opportunity[];
  potential: Opportunity[];
  closing: Opportunity[];
  atRisk: Opportunity[];
  customers: CustomerProjection[];
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
}

export interface MarketProjection {
  headline: string;
  summary: string;
  yesterdayNews: ProjectionBrief[];
  layerCards: Array<{
    id: IntelLayerTab;
    label: string;
    count: number;
    title: string;
    detail: string;
    tone: ProjectionTone;
  }>;
  signalFeed: Array<{
    id: string;
    layer: IntelLayerTab;
    label: string;
    title: string;
    summary: string;
    detail: string;
    tone: ProjectionTone;
    badge: string;
    day: number;
    affectedCaseIds: string[];
  }>;
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
  productOpportunities: ProductOpportunityProjection[];
}

export function buildOperatingProjection(state: GameState): OperatingProjection {
  const caseDetails = state.cases.map((caseItem) => buildCaseDetailProjection(state, caseItem));
  const productOpportunities = buildProductOpportunityProjection(state, caseDetails);

  return {
    dashboard: buildDashboardProjection(state, caseDetails, productOpportunities),
    cases: caseDetails,
    opportunities: buildOpportunityListProjection(state),
    market: buildMarketProjection(state),
    productOpportunities,
  };
}

export function buildDashboardProjection(
  state: GameState,
  caseDetails: CaseDetailProjection[] = state.cases.map((caseItem) => buildCaseDetailProjection(state, caseItem)),
  productOpportunities: ProductOpportunityProjection[] = buildProductOpportunityProjection(state, caseDetails),
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
  const marketBrief = {
    todayCount: marketIntelProjection.todayCount,
    riskCount: marketIntelProjection.riskCount,
    chanceCount: marketIntelProjection.chanceCount,
    lead: marketIntelProjection.homepage.lead ? toIntelProjectionBrief(marketIntelProjection.homepage.lead) : null,
    briefs: marketIntelProjection.homepage.briefs.map((item) => toIntelProjectionBrief(item)),
    impactedCases: marketIntelProjection.homepage.impactedCases.map((item) => ({
      id: `market-impacted-${item.caseId}`,
      label: '受影响房源',
      title: item.title,
      detail: sanitizeFrontstageText(item.reason),
      tone: 'risk' as const,
      caseId: item.caseId,
    })),
  };

  return {
    todayHeadline: topPriorityCase
      ? `${state.cases.find((caseItem) => caseItem.id === topPriorityCase.caseId)?.title || '重点房源'}`
      : activeCaseCount > 0
        ? `${activeCaseCount} 套在场，按优先级处理。`
        : '暂无在场房源。',
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
      leadReason: sanitizeFrontstageText(group.leadReason),
    })),
    marketBrief,
    triageCards: buildDashboardTriageCards(state, todayPriority, marketBrief, priorityProjection),
    arrangement: buildArrangementProjection(state, caseDetails, todayPriority),
    productOpportunities,
  };
}

function buildProductOpportunityProjection(
  state: GameState,
  caseDetails: CaseDetailProjection[],
): ProductOpportunityProjection[] {
  const result: ProductOpportunityProjection[] = [];
  const activeCases = state.cases.filter((entry) => entry.status === 'active');
  const activeRuns = state.productRuns.filter((entry) => entry.status === 'running');
  const openDayWindow = getDayOfWeek(state.day) === 5 || getDayOfWeek(state.day) === 1;

  const communityBuckets = new Map<string, typeof activeCases>();
  activeCases.forEach((entry) => {
    const current = communityBuckets.get(entry.community) || [];
    current.push(entry);
    communityBuckets.set(entry.community, current);
  });

  communityBuckets.forEach((casesInCommunity, community) => {
    if (casesInCommunity.length < 2) return;
    const avgHeat = average(casesInCommunity.map((entry) => entry.heat));
    const topHeat = Math.max(...casesInCommunity.map((entry) => entry.heat));
    const liftReadyCount = state.opportunities.filter((entry) => (
      entry.status === 'active'
      && entry.visibility !== 'shadow'
      && casesInCommunity.some((caseItem) => caseItem.id === entry.caseId)
      && entry.stageIndex >= 1
      && entry.stageIndex <= 3
    )).length;
    const hotEnough = avgHeat >= 56 || topHeat >= 64;
    const run = activeRuns.find((entry) => (
      entry.productType === 'open-day'
      && entry.targetIds.some((targetId) => casesInCommunity.some((caseItem) => caseItem.id === targetId))
    ));
    const anchorCase = [...casesInCommunity].sort((left, right) => right.heat - left.heat)[0];
    const expiresAtDay = state.day + (openDayWindow ? 2 : 1);
    const status: ProductOpportunityStatus = run
      ? 'accepted'
      : hotEnough && liftReadyCount >= 2
        ? openDayWindow ? 'triggered' : 'candidate'
        : 'candidate';
    const finalStatus: ProductOpportunityStatus = !run && state.day > expiresAtDay
      ? 'expired'
      : status;
    if (finalStatus === 'candidate' && !openDayWindow) {
      return;
    }

    result.push({
      id: `op-open-day-${community}-${state.day}`,
      type: 'open-day',
      scope: 'community',
      status: finalStatus,
      reasonLabel: getDayOfWeek(state.day) === 5 ? '周五可先锁周末开放日' : '本周小区热度上来了',
      targetId: community,
      expiresAtDay,
      primaryActionLabel: '去报名',
      headline: `${community} · 可发起开放日`,
      subline: `当前有 ${liftReadyCount} 条客户线可承接`,
      actionId: 'open-day',
      actionCaseId: anchorCase.id,
      caseId: anchorCase.id,
    });
  });

  activeCases.forEach((caseItem) => {
    const run = activeRuns.find((entry) => (
      entry.productType === 'sincere-sale'
      && entry.targetIds.includes(caseItem.id)
    ));
    const offerLeads = state.opportunities.filter((entry) => (
      entry.status === 'active'
      && entry.caseId === caseItem.id
      && entry.visibility !== 'shadow'
      && entry.stageIndex >= 3
    ));
    const closeStage = caseItem.stageIndex >= 3
      || caseDetails.find((entry) => entry.caseId === caseItem.id)?.listingLifecyclePhase.phaseCode === 'negotiation'
      || caseDetails.find((entry) => entry.caseId === caseItem.id)?.listingLifecyclePhase.phaseCode === 'feedback_offer';
    const priceReasonable = caseItem.askPrice <= caseItem.marketPrice * 1.05;
    const triggerable = offerLeads.length > 2 && priceReasonable && closeStage;
    if (!triggerable && !run) {
      return;
    }
    const expiresAtDay = state.day + 2;
    const status: ProductOpportunityStatus = run ? 'accepted' : 'triggered';
    const finalStatus: ProductOpportunityStatus = !run && state.day > expiresAtDay ? 'expired' : status;
    result.push({
      id: `op-sincere-sale-${caseItem.id}-${state.day}`,
      type: 'sincere-sale',
      scope: 'listing',
      status: finalStatus,
      reasonLabel: `已有 ${offerLeads.length} 位客户出价`,
      targetId: caseItem.id,
      expiresAtDay,
      primaryActionLabel: '去设置',
      headline: `${caseItem.title} · 可发起诚意卖`,
      subline: `当前挂牌 ${Math.round(caseItem.askPrice)} 万`,
      actionId: 'sincerity-sale',
      actionCaseId: caseItem.id,
      caseId: caseItem.id,
    });
  });

  return result
    .sort((left, right) => {
      const leftScore = left.status === 'triggered' ? 3 : left.status === 'accepted' ? 2 : 1;
      const rightScore = right.status === 'triggered' ? 3 : right.status === 'accepted' ? 2 : 1;
      return rightScore - leftScore;
    })
    .slice(0, 6);
}

function buildArrangementProjection(
  state: GameState,
  caseDetails: CaseDetailProjection[],
  todayPriority: ProjectionBrief[],
): ArrangementProjection {
  const fixedItems = buildFixedArrangementItems(state);
  const todayPlan = state.todayPlan?.day === state.day
    ? state.todayPlan
    : { day: state.day, playerItems: [] };
  const plannedItems = buildPlannedArrangementItems(state, caseDetails, todayPlan.playerItems);
  const completedItems = buildCompletedArrangementItems(state, caseDetails, todayPlan.playerItems);
  const plannedEnergy = getTodayPlanCommittedEnergy(state, 'planned');
  const fixedEnergyReserve = estimateFixedTodayPlanEnergyReserve(state);
  const remainingEnergy = getTodayPlanRemainingEnergy(state);
  const candidateItems = buildCandidateArrangementItems(state, caseDetails, todayPriority, todayPlan.playerItems);
  const weekFocus = buildWeekCalendar(state)
    .slice(0, 7)
    .sort((left, right) => right.energy - left.energy)[0];
  const slots = buildArrangementSlotProjection(fixedItems, plannedItems, candidateItems, completedItems);

  return {
    headline: plannedItems[0]
      ? `已排：${plannedItems[0].title}`
      : fixedItems[0]
        ? `已安排：${fixedItems[0].title}`
        : candidateItems[0]
        ? `待选：${candidateItems[0].title}`
        : '今日暂无待选',
    summary: plannedItems.length > 0
      ? `已排 ${plannedItems.length} 件。`
      : fixedItems.length > 0
        ? `已安排 ${fixedItems.length} 件。`
      : candidateItems.length > 0
        ? '候选可排。'
        : '今日暂无待选。',
    remainingEnergy,
    remainingEnergyLabel: `可排余量 ${remainingEnergy}/${state.maxEnergy} 小时`,
    plannedEnergy,
    fixedEnergyReserve,
    plannedEnergyLabel: `已排占用 ${plannedEnergy} · 固定预留 ${fixedEnergyReserve}`,
    fixedItems,
    plannedItems,
    candidateItems,
    completedItems,
    weekFocusLabel: weekFocus ? `${weekFocus.label} · ${weekFocus.title}` : '本周暂无固定重点',
    slots,
  };
}

function buildArrangementSlotProjection(
  fixedItems: ArrangementItemProjection[],
  plannedItems: ArrangementItemProjection[],
  candidateItems: ArrangementItemProjection[],
  completedItems: ArrangementItemProjection[],
): Record<TodayArrangementSlot, ArrangementSlotProjection> {
  const createSlot = (slot: TodayArrangementSlot, label: string): ArrangementSlotProjection => ({
    slot,
    label,
    fixedItems: [],
    plannedItems: [],
    candidateItems: [],
    completedItems: [],
  });

  const slots = {
    am: createSlot('am', '上午'),
    pm: createSlot('pm', '下午'),
  };

  fixedItems.forEach((item) => {
    const slot = item.slot || 'am';
    slots[slot].fixedItems.push(item);
  });
  plannedItems.forEach((item) => {
    const slot = item.slot || 'am';
    slots[slot].plannedItems.push(item);
  });
  candidateItems.forEach((item) => {
    const slot = item.slot || 'am';
    slots[slot].candidateItems.push(item);
  });
  completedItems.forEach((item) => {
    const slot = item.slot || 'pm';
    slots[slot].completedItems.push(item);
  });

  return slots;
}

function buildFixedArrangementItems(state: GameState): ArrangementItemProjection[] {
  const visibleScheduleEntries = getVisibleFixedScheduleEntries(state);

  const scheduleItems = visibleScheduleEntries.map<ArrangementItemProjection>((entry) => {
    const linkedCase = entry.caseId ? state.cases.find((item) => item.id === entry.caseId) || null : null;
    const linkedOpportunity = entry.opportunityId
      ? state.opportunities.find((item) => item.id === entry.opportunityId) || null
      : null;
    const scheduleTitle = presentScheduleTitle(entry.title);
    const isBlockedRoutine = isSlotBlockingRoutine(entry);
    const isFocusMeetingSubmit = entry.actionId === 'focus-meeting-submit';
    const actionId = resolveFixedScheduleActionId(state, entry, linkedCase);
    const shouldExposeAction = Boolean(actionId) && (!isBlockedRoutine || isFocusMeetingSubmit);
    const shouldExposeCase = !isBlockedRoutine || isFocusMeetingSubmit;
    const durationHours = resolveScheduleEntryDurationHours(entry);
    const displayTitle = isBlockedRoutine
      ? scheduleTitle
      : linkedCase ? `${linkedCase.title} · ${scheduleTitle}` : scheduleTitle;
    return {
      id: `fixed-schedule-${entry.key}`,
      source: 'fixed',
      slot: resolveScheduleEntrySlot(entry),
      label: entry.source === 'interrupt' ? '插单提示' : entry.source === 'routine' ? '周节奏' : '已安排',
      title: displayTitle,
      displayTitle: !isBlockedRoutine && linkedOpportunity ? linkedOpportunity.customerName : undefined,
      contextTitle: !isBlockedRoutine && linkedOpportunity && linkedCase ? linkedCase.title : undefined,
      detail: !isBlockedRoutine && entry.weekdayIntent
        ? `${presentScheduleDetail(entry.note)} ${entry.weekdayIntent}。`
        : presentScheduleDetail(entry.note),
      tone: entry.urgency >= 82 ? 'risk' : 'neutral',
      caseId: shouldExposeCase ? entry.caseId : undefined,
      durationHours,
      energyCost: durationHours,
      statusLabel: presentScheduleBadge(entry.badge),
      actionId: shouldExposeAction ? actionId : undefined,
      isDisabled: false,
      executionMode: shouldExposeAction && actionId && isScenarioAction(actionId)
        ? 'scenario'
        : shouldExposeAction && actionId
          ? 'direct'
          : 'navigate',
      ctaLabel: isFocusMeetingSubmit ? '提报房源' : actionId ? '进入情景' : '打开房源',
      secondaryLabel: '看客户线',
      conflictHint: entry.source === 'interrupt' && !isBlockedRoutine
        ? getTodayPlanConflictHint(state, {
            slot: resolveScheduleEntrySlot(entry),
            actionId: entry.actionId,
            caseId: entry.caseId,
            durationHours,
          })
        : undefined,
    };
  });

  const negotiationItems = state.matters
    .filter((entry) => entry.stage === 'pending' && entry.kind === 'opportunity')
    .slice(0, 1)
    .map<ArrangementItemProjection>((entry) => {
      const linkedCase = state.cases.find((item) => item.id === entry.caseId) || null;
      const linkedOpportunity = state.opportunities.find((item) => item.id === entry.sourceKey) || null;
      return {
      id: `fixed-matter-${entry.id}`,
      source: 'fixed',
      slot: 'pm',
      label: '已安排',
      title: linkedCase ? `${linkedCase.title} · ${entry.title}` : entry.title,
      displayTitle: linkedOpportunity?.customerName,
      contextTitle: linkedCase ? linkedCase.title : undefined,
      detail: sanitizeFrontstageText(entry.detail),
      tone: 'chance',
      caseId: entry.caseId,
      matterId: entry.id,
      customerId: linkedOpportunity?.customerId,
      durationHours: 1,
      energyCost: 1,
      statusLabel: entry.badge || '今日承接',
      actionId: 'invite-customer-negotiation',
      isDisabled: false,
      executionMode: 'direct',
      ctaLabel: '进入情景',
      secondaryLabel: '打开房源',
    };
    });

  return [...scheduleItems, ...negotiationItems].slice(0, 3);
}

function resolveFixedScheduleActionId(
  state: GameState,
  entry: GameState['schedule'][number],
  linkedCase: Case | null,
) {
  if (entry.actionId) {
    return entry.actionId;
  }

  if (!linkedCase || !entry.opportunityId) {
    return undefined;
  }

  const opportunity = state.opportunities.find((item) => item.id === entry.opportunityId && item.status === 'active') || null;
  const actionCandidates = opportunity && opportunity.stageIndex >= 3
    ? ['invite-customer-negotiation', 'sincerity-sale', 'showing']
    : ['showing', 'weekly-feedback'];

  return actionCandidates.find((actionId) => getActionAvailability(state, linkedCase, actionId).enabled);
}

function buildCandidateArrangementItems(
  state: GameState,
  caseDetails: CaseDetailProjection[],
  todayPriority: ProjectionBrief[],
  playerItems: GameState['todayPlan']['playerItems'],
): ArrangementItemProjection[] {
  const seenCaseIds = new Set<string>();
  const reservedKeys = new Set(
    playerItems
      .filter((entry) => entry.day === state.day)
      .map((entry) => buildTodayPlanKey(entry.linkedActionId, entry.linkedCaseId)),
  );
  const candidates: ArrangementItemProjection[] = [];
  const remainingEnergy = getTodayPlanRemainingEnergy(state);
  let rank = 0;

  for (const recommendation of deriveCaseRecommendations(state)) {
    if (seenCaseIds.has(recommendation.caseId)) {
      continue;
    }
    seenCaseIds.add(recommendation.caseId);

    const caseItem = state.cases.find((entry) => entry.id === recommendation.caseId);
    if (!caseItem || caseItem.status !== 'active') {
      continue;
    }

    const actionId = recommendation.primaryAction.actionId;
    const action = actionId ? ACTIONS.find((entry) => entry.id === actionId) || null : null;
    const linkedMatter = resolveRecommendationLinkedMatter(state, recommendation, action?.id);
    const candidateKey = buildTodayPlanKey(action?.id, recommendation.caseId);
    const isAlreadyPlanned = reservedKeys.has(candidateKey);
    const isEnergyBlocked = Boolean(action && action.costEnergy > remainingEnergy);
    const actionDurationHours = action ? resolveActionDurationHours(action.id) : 1;
    const actionEnergyCost = action?.costEnergy ?? 1;

    if (isAlreadyPlanned) {
      continue;
    }

    rank += 1;
    const slotSelection = suggestedCandidateSlot(state, actionDurationHours, { am: 0, pm: 0 });
    const isSlotBlocked = Boolean(action && !slotSelection.canFit);
    const slot = slotSelection.slot;
    const conflictHint = action && !isSlotBlocked && !isEnergyBlocked
      ? getTodayPlanConflictHint(state, {
          slot,
          actionId: action.id,
          caseId: recommendation.caseId,
          durationHours: actionDurationHours,
        })
      : undefined;
    const disabledReason = isEnergyBlocked
      ? '精力不足，先完成已排。'
      : isSlotBlocked
        ? '今天两个时段都排不下，先完成已排事项。'
        : undefined;
    const isDisabled = isEnergyBlocked || isSlotBlocked;

    candidates.push({
      id: `candidate-recommendation-${recommendation.caseId}-${action?.id || 'action'}`,
      source: 'candidate',
      slot,
      rank,
      label: '待选',
      title: action ? `${caseItem.title} · ${action.name}` : `${caseItem.title} · 今日动作`,
      detail: buildCandidateArrangementDetail(caseItem, action?.name || '今日动作'),
      tone: recommendationTierTone(recommendation.tier),
      caseId: recommendation.caseId,
      matterId: linkedMatter?.id,
      durationHours: actionDurationHours,
      energyCost: actionEnergyCost,
      statusLabel: action
        ? isEnergyBlocked
          ? '精力不足'
          : isSlotBlocked
            ? '今日排不下'
          : '可加入'
        : '待判断',
      actionId: action?.id,
      executionMode: isScenarioAction(action?.id || '') ? 'scenario' : action ? 'direct' : 'navigate',
      ctaLabel: action ? (isDisabled ? '排不下' : slot === 'am' ? '加入上午' : '加入下午') : '打开房源',
      secondaryLabel: action ? '看房源' : '看客户线',
      isDisabled,
      disabledReason,
      conflictHint,
    });
  }

  return candidates;
}

function recommendationTierTone(tier: CaseRecommendationTier): ProjectionTone {
  if (tier === 'DEFEND') return 'risk';
  if (tier === 'ACCELERATE') return 'chance';
  return 'neutral';
}

function buildCandidateArrangementDetail(caseItem: Case, actionName: string) {
  const parts = [
    caseItem.community,
    actionName,
    caseItem.hasCompletedFirstVisit ? '业主已面访' : '业主待面访',
  ];
  return parts.filter(Boolean).join(' · ');
}

function buildPlannedArrangementItems(
  state: GameState,
  caseDetails: CaseDetailProjection[],
  items: GameState['todayPlan']['playerItems'],
): ArrangementItemProjection[] {
  return items
    .filter((entry) => entry.day === state.day && entry.status === 'planned')
    .map((entry) => buildTodayPlanArrangementItem(state, caseDetails, entry, 'planned'))
    .filter(Boolean) as ArrangementItemProjection[];
}

function buildCompletedArrangementItems(
  state: GameState,
  caseDetails: CaseDetailProjection[],
  items: GameState['todayPlan']['playerItems'],
): ArrangementItemProjection[] {
  return items
    .filter((entry) => entry.day === state.day && entry.status === 'completed')
    .map((entry) => buildTodayPlanArrangementItem(state, caseDetails, entry, 'completed'))
    .filter(Boolean) as ArrangementItemProjection[];
}

function buildTodayPlanArrangementItem(
  state: GameState,
  caseDetails: CaseDetailProjection[],
  entry: GameState['todayPlan']['playerItems'][number],
  source: 'planned' | 'completed',
): ArrangementItemProjection | null {
  const action = ACTIONS.find((item) => item.id === entry.linkedActionId) || null;
  const caseItem = entry.linkedCaseId
    ? state.cases.find((item) => item.id === entry.linkedCaseId) || null
    : null;
  const caseProjection = entry.linkedCaseId
    ? caseDetails.find((item) => item.caseId === entry.linkedCaseId) || null
    : null;
  const matter = entry.sourceMatterId
    ? state.matters.find((item) => item.id === entry.sourceMatterId) || null
    : null;
  const availability = action && caseItem
    ? getActionAvailability(state, caseItem, action.id)
    : null;

  const objectTitle = caseItem
    ? `${caseItem.title} · ${action?.name || matter?.title || caseProjection?.headline || '今日事项'}`
    : action?.name || matter?.title || caseProjection?.headline || '今日事项';
  const targetOpportunity = entry.linkedOpportunityId
    ? state.opportunities.find((item) => item.id === entry.linkedOpportunityId) || null
    : entry.linkedCustomerId
      ? state.opportunities.find((item) => item.customerId === entry.linkedCustomerId && item.status === 'active') || null
      : matter?.kind === 'opportunity'
        ? state.opportunities.find((item) => item.id === matter.sourceKey) || null
        : null;
  return {
    id: `${source}-${entry.id}`,
    todayPlanItemId: entry.id,
    source,
    slot: entry.slot,
    label: source === 'planned' ? '我今天安排的' : '已完成',
    title: objectTitle,
    displayTitle: targetOpportunity?.customerName,
    contextTitle: targetOpportunity && caseItem ? caseItem.title : undefined,
    detail: matter?.detail || `${caseItem?.community || '该房源'} · ${caseProjection?.nextStepLine || action?.description || '今天安排的一件事。'}`,
    tone: source === 'completed'
      ? 'chance'
      : caseProjection?.mainProblem === 'owner' || caseProjection?.mainProblem === 'competition'
        ? 'risk'
        : 'neutral',
    caseId: entry.linkedCaseId,
    matterId: entry.sourceMatterId,
    customerId: entry.linkedCustomerId,
    opportunityId: targetOpportunity?.id,
    durationHours: action ? resolveActionDurationHours(action.id) : 1,
    energyCost: action?.costEnergy ?? 1,
    statusLabel: source === 'completed'
      ? '今天已完成'
      : availability?.enabled === false
        ? '当前不可执行'
        : '已排进今天',
    actionId: action?.id,
    executionMode: entry.executionMode,
    ctaLabel: entry.executionMode === 'scenario' ? '进入情景' : '开始执行',
    secondaryLabel: source === 'completed' ? '打开房源' : '移出今天',
    isDisabled: source === 'planned' ? availability?.enabled === false : false,
    disabledReason: source === 'planned' && availability && !availability.enabled ? availability.reason : undefined,
  };
}

function presentScheduleTitle(title: string) {
  if (title.includes('推进') || title.includes('节奏')) return '业主开始不耐烦';
  return title;
}

function sanitizeFrontstageText(text: string) {
  return text
    .replace(/\s*\/\s*[^，。；、·\s]+/g, '')
    .replace(/(\d+(?:\.\d+)?)\s*天/g, (_match, rawDays: string) => formatVisibleDaysLeft(Number(rawDays)))
    .replace(/，今天要把进展讲清楚。/g, '，进展反馈有压力。')
    .replace(/今天要把确定性往成交桌上推/g, '成交条件开始变清楚')
    .replace(/需要扫一眼/g, '待查看')
    .replace(/按计划推进/g, '计划条件稳定')
    .replace(/继续推进到/g, '后续可到')
    .replace(/推进会慢/g, '成交周期会拉长')
    .replace(/可推进/g, '可跟进')
    .replace(/推进/g, '跟进')
    .replace(/需要/g, '待')
    .replace(/先处理/g, '待处理')
    .replace(/窗.?压力/g, '时间压力')
    .replace(/谈判窗.?/g, '谈判进程')
    .replace(/观察窗.?/g, '观察期')
    .replace(/窗.?/g, '周期');
}

function presentScheduleDetail(detail: string) {
  return sanitizeFrontstageText(detail
    .replace(/处在业主窗.?收缩阶段/g, '已经拖到业主开始收紧耐心')
    .replace(/剩余窗.?已经不多/g, '再拖就容易失手'));
}

function presentScheduleBadge(badge: string) {
  return sanitizeFrontstageText(badge);
}

function suggestedCandidateSlot(
  state: GameState,
  actionDurationHours: number,
  reservedSlots: { am: number; pm: number },
): { slot: TodayArrangementSlot; canFit: boolean } {
  const amRemaining = getSlotRemainingCapacity(state, 'am') - reservedSlots.am;
  const pmRemaining = getSlotRemainingCapacity(state, 'pm') - reservedSlots.pm;

  if (amRemaining >= actionDurationHours && pmRemaining >= actionDurationHours) {
    return { slot: amRemaining >= pmRemaining ? 'am' : 'pm', canFit: true };
  }
  if (amRemaining >= actionDurationHours) {
    return { slot: 'am', canFit: true };
  }
  if (pmRemaining >= actionDurationHours) {
    return { slot: 'pm', canFit: true };
  }
  return { slot: amRemaining >= pmRemaining ? 'am' : 'pm', canFit: false };
}

function resolveRecommendationLinkedMatter(
  state: GameState,
  recommendation: ReturnType<typeof deriveCaseRecommendations>[number],
  actionId?: string,
): MatterEntry | null {
  if (!actionId) return null;

  const actionBoundOpportunities = resolveActionBoundOpportunities(state, recommendation.caseId, actionId);

  return state.matters.find((matter) => {
    if (matter.caseId !== recommendation.caseId || matter.stage !== 'pending') {
      return false;
    }

    if (matter.source === 'schedule') {
      const scheduleEntry = state.schedule.find((entry) => entry.key === matter.sourceKey);
      if (!scheduleEntry || scheduleEntry.caseId !== recommendation.caseId || scheduleEntry.actionId !== actionId) {
        return false;
      }
      if (!scheduleEntry.opportunityId) {
        return true;
      }
      return state.opportunities.some((entry) => (
        entry.id === scheduleEntry.opportunityId
        && entry.caseId === recommendation.caseId
        && entry.status === 'active'
      ));
    }

    if (matter.source === 'negotiation') {
      if (actionId !== 'invite-customer-negotiation') {
        return false;
      }
      const matchedOpportunity = actionBoundOpportunities.find((entry) => (
        entry.id === matter.sourceKey
        && Boolean(entry.pendingClosingEvaluation)
      ));
      return Boolean(matchedOpportunity) && actionBoundOpportunities.length === 1;
    }

    return false;
  }) || null;
}

function resolveActionBoundOpportunities(
  state: GameState,
  caseId: string,
  actionId: string,
): Opportunity[] {
  const relation = getActionStageRelation(actionId);
  if (relation?.availabilityKind !== 'opportunity-bound') {
    return [];
  }

  return state.opportunities.filter((entry) => {
    if (entry.caseId !== caseId || entry.status !== 'active') {
      return false;
    }
    const window = relation.opportunityStageWindow;
    return !window || (entry.stageIndex >= window.min && entry.stageIndex <= window.max);
  });
}

function buildTodayPlanKey(actionId?: string, caseId?: string) {
  return [actionId || 'unknown-action', caseId || 'no-case'].join('::');
}

const LIFECYCLE_ACTIONS: Record<
  Exclude<ListingLifecyclePhaseCode, 'sold' | 'written_off' | 'sold_elsewhere'>,
  string[]
> = {
  pre_visit: ['first-visit', 'ask-psychological-price', 'deep-diagnosis'],
  packaging: ['story', 'xiaohongshu-boost', 'broker-broadcast', 'private-referral'],
  showing: ['showing', 'weekly-feedback', 'deep-diagnosis', 'open-day'],
  feedback_offer: ['invite-customer-negotiation', 'adjust-listing-price', 'sincerity-sale'],
  negotiation: ['invite-customer-negotiation', 'adjust-listing-price'],
};

function buildListingLifecyclePhaseProjection(
  state: GameState,
  caseItem: Case,
  opportunities: Opportunity[],
  customerLinks: CustomerRuntimeState[],
  competitionPressure: number,
): ListingLifecyclePhaseProjection {
  if (caseItem.status === 'sold') {
    return {
      phaseCode: 'sold',
      phaseLabel: '已成交',
      coreProblemLabel: '这套房已经收口',
      primaryActionLabel: '回看成交过程',
      phaseAgeDays: 0,
      phaseDelayLevel: 'on_track',
      phaseRiskHint: '本轮经营已结束',
      completionStateLabel: '已成交',
    };
  }

  if (caseItem.status === 'withdrawn') {
    return {
      phaseCode: 'written_off',
      phaseLabel: '已核销',
      coreProblemLabel: '这套房已经退出本轮经营',
      primaryActionLabel: '回看失手节点',
      phaseAgeDays: 0,
      phaseDelayLevel: 'late',
      phaseRiskHint: '本轮经营已结束',
      completionStateLabel: '已核销',
    };
  }

  if (caseItem.status === 'lost_to_rival') {
    return {
      phaseCode: 'sold_elsewhere',
      phaseLabel: '他处成交',
      coreProblemLabel: '这套房已经在别处成交',
      primaryActionLabel: '回看失手机会',
      phaseAgeDays: 0,
      phaseDelayLevel: 'late',
      phaseRiskHint: '房子已在别处成交',
      completionStateLabel: '他处成交',
    };
  }

  const metCount = opportunities.filter((opportunity) => opportunity.visibility !== 'shadow').length;
  const closingCount = opportunities.filter((opportunity) => opportunity.visibility !== 'shadow' && opportunity.stageIndex >= 4).length;
  const negotiatingCount = customerLinks.filter((entry) => entry.status === 'negotiating').length;
  const comparingCount = customerLinks.filter((entry) => entry.status === 'comparing').length;
  const viewedCount = Math.max(
    caseItem.viewings,
    customerLinks.filter((entry) => entry.caseStates[caseItem.id]?.viewed).length,
  );
  const activeOpportunityCount = opportunities.filter((opportunity) => opportunity.status === 'active').length;

  let phaseCode: Exclude<ListingLifecyclePhaseCode, 'sold' | 'written_off' | 'sold_elsewhere'> = 'packaging';
  if (!caseItem.hasCompletedFirstVisit) {
    phaseCode = 'pre_visit';
  } else if (caseItem.offers > 0 || negotiatingCount > 0 || caseItem.stageIndex >= 4) {
    phaseCode = 'negotiation';
  } else if (closingCount > 0 || comparingCount > 0 || viewedCount >= 2) {
    phaseCode = 'feedback_offer';
  } else if (viewedCount > 0 || metCount > 0 || caseItem.heat >= 55 || activeOpportunityCount > 0) {
    phaseCode = 'showing';
  }

  const phaseAgeDays = resolvePhaseAgeDays(state.day, caseItem, phaseCode, viewedCount);
  const phaseDelayLevel = resolvePhaseDelayLevel(phaseCode, phaseAgeDays, caseItem, metCount, closingCount);
  const primaryActionId = resolvePrimaryActionId(state, caseItem, phaseCode);

  return {
    phaseCode,
    phaseLabel: phaseLabel(phaseCode),
    coreProblemLabel: phaseProblemLabel(phaseCode, caseItem, metCount, viewedCount, closingCount),
    primaryActionId,
    primaryActionLabel: phaseActionLabel(phaseCode, primaryActionId),
    phaseAgeDays,
    phaseDelayLevel,
    phaseRiskHint: phaseRiskHint(phaseCode, phaseDelayLevel, caseItem, competitionPressure),
  };
}

function resolvePrimaryActionId(
  state: GameState,
  caseItem: Case,
  phaseCode: Exclude<ListingLifecyclePhaseCode, 'sold' | 'written_off' | 'sold_elsewhere'>,
) {
  const candidates = LIFECYCLE_ACTIONS[phaseCode] || [];
  return candidates.find((actionId) => getActionAvailability(state, caseItem, actionId).enabled) || candidates[0];
}

function resolvePhaseAgeDays(
  currentDay: number,
  caseItem: Case,
  phaseCode: Exclude<ListingLifecyclePhaseCode, 'sold' | 'written_off' | 'sold_elsewhere'>,
  viewedCount: number,
) {
  const daysSinceOwnerTouched = elapsedDays(currentDay, caseItem.lastOwnerTouchedDay);
  const daysSinceTouched = elapsedDays(currentDay, caseItem.lastTouchedDay);
  if (phaseCode === 'pre_visit') {
    return daysSinceOwnerTouched;
  }
  if (phaseCode === 'packaging') {
    return daysSinceOwnerTouched;
  }
  if (phaseCode === 'showing') {
    return viewedCount > 0 ? daysSinceTouched : daysSinceOwnerTouched;
  }
  if (phaseCode === 'feedback_offer') {
    return daysSinceTouched;
  }
  return daysSinceTouched;
}

function resolvePhaseDelayLevel(
  phaseCode: Exclude<ListingLifecyclePhaseCode, 'sold' | 'written_off' | 'sold_elsewhere'>,
  phaseAgeDays: number,
  caseItem: Case,
  metCount: number,
  closingCount: number,
): ListingLifecycleDelayLevel {
  if (phaseCode === 'pre_visit') {
    return phaseAgeDays >= 4 ? 'late' : phaseAgeDays >= 2 ? 'watch' : 'on_track';
  }
  if (phaseCode === 'packaging') {
    return phaseAgeDays >= 5 || caseItem.heat < 45 ? 'late' : phaseAgeDays >= 3 ? 'watch' : 'on_track';
  }
  if (phaseCode === 'showing') {
    return phaseAgeDays >= 4 || metCount === 0 ? 'late' : phaseAgeDays >= 2 ? 'watch' : 'on_track';
  }
  if (phaseCode === 'feedback_offer') {
    return phaseAgeDays >= 3 || closingCount === 0 ? 'watch' : 'on_track';
  }
  return phaseAgeDays >= 3 ? 'watch' : 'on_track';
}

function phaseLabel(phaseCode: ListingLifecyclePhaseCode) {
  if (phaseCode === 'pre_visit') return '待面访分型';
  if (phaseCode === 'packaging') return '需包装曝光';
  if (phaseCode === 'showing') return '需提升带看';
  if (phaseCode === 'feedback_offer') return '促进反馈出价';
  if (phaseCode === 'negotiation') return '谈判成交';
  if (phaseCode === 'sold') return '已成交';
  if (phaseCode === 'written_off') return '已核销';
  return '他处成交';
}

function phaseProblemLabel(
  phaseCode: Exclude<ListingLifecyclePhaseCode, 'sold' | 'written_off' | 'sold_elsewhere'>,
  caseItem: Case,
  metCount: number,
  viewedCount: number,
  closingCount: number,
) {
  if (phaseCode === 'pre_visit') return '首次面访未完成';
  if (phaseCode === 'packaging') return metCount > 0 ? '曝光还没起量' : '有效曝光不足';
  if (phaseCode === 'showing') return viewedCount > 0 ? '带看后反馈断档' : '带看还没接上';
  if (phaseCode === 'feedback_offer') return closingCount > 0 ? '报价还没形成' : '反馈还没沉淀';
  return caseItem.offers > 0 ? '谈价还未收口' : '谈判桌还没搭起来';
}

function phaseActionLabel(
  phaseCode: Exclude<ListingLifecyclePhaseCode, 'sold' | 'written_off' | 'sold_elsewhere'>,
  primaryActionId?: string,
) {
  const actionName = ACTIONS.find((item) => item.id === primaryActionId)?.name || '补一个动作';
  if (phaseCode === 'pre_visit') return `去做${actionName}`;
  if (phaseCode === 'packaging') return `把房子包装并推出去`;
  if (phaseCode === 'showing') return primaryActionId === 'open-day' ? '组织一次开放日' : '组织一次带看并拿反馈';
  if (phaseCode === 'feedback_offer') return primaryActionId === 'adjust-listing-price' ? '价格沟通' : '客户出价';
  return '谈判收口';
}

function phaseRiskHint(
  phaseCode: Exclude<ListingLifecyclePhaseCode, 'sold' | 'written_off' | 'sold_elsewhere'>,
  delayLevel: ListingLifecycleDelayLevel,
  caseItem: Case,
  competitionPressure: number,
) {
  if (phaseCode === 'pre_visit') {
    return delayLevel === 'late' ? '业主反馈空窗偏长' : '业主、价格、房源故事还不完整';
  }
  if (phaseCode === 'packaging') {
    return delayLevel === 'late' ? '曝光起量偏慢' : '曝光仍在启动';
  }
  if (phaseCode === 'showing') {
    return delayLevel === 'late' ? '看房机会在变冷' : '带看节奏偏慢';
  }
  if (phaseCode === 'feedback_offer') {
    return delayLevel === 'late' ? '客户热度在回落' : '反馈到报价的链路偏慢';
  }
  if (caseItem.windowDays <= 3 || competitionPressure >= 70) {
    return '成交窗口偏紧';
  }
  return '谈判窗口偏紧';
}

function phaseToMainProblem(phaseCode: ListingLifecyclePhaseCode): CaseMainProblem {
  if (phaseCode === 'pre_visit') return 'owner';
  if (phaseCode === 'packaging') return 'execution';
  if (phaseCode === 'showing') return 'customer-pool';
  if (phaseCode === 'feedback_offer') return 'customer-pool';
  if (phaseCode === 'negotiation') return 'price';
  return 'market';
}

function pickSuggestedActionId(
  state: GameState,
  caseItem: Case,
  item: ProjectionBrief,
  detail: CaseDetailProjection | null,
): string | undefined {
  const lifecycleActionId = detail?.listingLifecyclePhase.primaryActionId;
  if (lifecycleActionId && getActionAvailability(state, caseItem, lifecycleActionId).enabled) {
    return lifecycleActionId;
  }
  const text = `${item.label} ${item.title} ${item.detail} ${detail?.mainProblemLabel || ''}`;
  const actionIds = /成交|报价|谈判/.test(text)
    ? ['invite-customer-negotiation', 'sincerity-sale', 'showing']
    : /业主|反馈|信任|耐心|定价/.test(text)
      ? ['weekly-feedback', 'deep-diagnosis', 'pricing-advice']
      : /客户|带看|流失/.test(text)
        ? ['showing', 'private-referral', 'story']
        : /竞品|竞争|商圈|市场/.test(text)
          ? ['deep-diagnosis', 'story', 'open-day']
          : ['deep-diagnosis', 'story', 'showing'];

  return applyWeekdayActionBias(state.day, actionIds)
    .find((actionId) => getActionAvailability(state, caseItem, actionId).enabled);
}

function applyWeekdayActionBias(day: number, actionIds: string[]) {
  const dayOfWeek = getDayOfWeek(day);
  const preferred = dayOfWeek === 1
    ? ['weekly-feedback', 'pricing-advice', 'deep-diagnosis']
    : dayOfWeek === 2
      ? ['deep-diagnosis', 'weekly-feedback']
      : dayOfWeek === 3
        ? ['deep-diagnosis', 'story', 'private-referral', 'broker-broadcast']
        : dayOfWeek === 4
          ? ['focus-meeting-submit', 'story', 'deep-diagnosis']
          : dayOfWeek === 5
            ? ['showing', 'private-referral', 'broker-broadcast', 'open-day']
            : ['showing', 'open-day', 'invite-customer-negotiation', 'weekly-feedback'];
  const seen = new Set<string>();
  return [...preferred, ...actionIds].filter((actionId) => {
    if (!actionIds.includes(actionId) || seen.has(actionId)) {
      return false;
    }
    seen.add(actionId);
    return true;
  });
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
  const listingLifecyclePhase = buildListingLifecyclePhaseProjection(state, caseItem, opportunities, customerLinks, competitionPressure);
  const mainProblem = deriveMainProblem(state.day, caseItem, opportunities, customerLinks, competitionPressure);
  const factChain = buildCaseFactChain(state.day, caseItem, opportunities, customerLinks, competitionPressure, mainProblem);
  const recentChanges = buildCaseRecentChanges(state, caseItem, opportunities);
  const primaryRiskTag = buildRiskTags(caseItem, opportunities, competitionPressure, atRiskCount)[0] || listingLifecyclePhase.phaseRiskHint;
  const primaryAction = listingLifecyclePhase.primaryActionId
    ? ACTIONS.find((entry) => entry.id === listingLifecyclePhase.primaryActionId) || null
    : null;
  const comparableRivalStores = (state.marketShadow?.rivalStores || [])
    .filter((entry) => entry.districtFocus.includes(caseItem.district) || entry.activityHeat >= 50)
    .sort((left, right) => right.activityHeat - left.activityHeat)
    .slice(0, 3)
    .map((entry) => ({
      id: `case-${caseItem.id}-rival-store-${entry.id}`,
      label: entry.type === 'same_company' ? '同公司门店' : '外部门店',
      title: entry.name,
      detail: `${entry.activityHeat >= 65 ? '动作很猛' : entry.activityHeat >= 50 ? '动作偏多' : '动作一般'} · 重点盯 ${entry.districtFocus[0] || caseItem.district}`,
      tone: entry.activityHeat >= 65 ? 'risk' as const : 'neutral' as const,
      caseId: caseItem.id,
    }));
  const comparableRivalListings = rivalListings
    .slice()
    .sort((left, right) => right.leadSiphonPower - left.leadSiphonPower)
    .slice(0, 3)
    .map((entry) => ({
      id: `case-${caseItem.id}-rival-listing-${entry.id}`,
      label: '同类在卖房',
      title: entry.title,
      detail: `${entry.district} · ${entry.segment} · ${describeLeadSiphonPower(entry.leadSiphonPower)}。`,
      tone: entry.leadSiphonPower >= 62 ? 'risk' as const : 'neutral' as const,
      caseId: caseItem.id,
    }));
  const comparingCustomers = customerLinks
    .filter((entry) => entry.status === 'comparing' || entry.activeCaseIds.length > 0)
    .sort((left, right) => (
      (right.status === 'comparing' ? 80 : 0)
      + right.activeCaseIds.length * 14
      + (right.churnRisk || 0) * 0.5
      - ((left.status === 'comparing' ? 80 : 0)
        + left.activeCaseIds.length * 14
        + (left.churnRisk || 0) * 0.5)
    ))
    .slice(0, 3)
    .map((entry) => {
      const customer = state.customers.find((item) => item.id === entry.customerId) || null;
      const runtime = entry.caseStates[caseItem.id] || null;
      const externalCompetitors = (runtime?.competingCaseIds || [])
        .map((competitorId) => state.marketShadow?.rivalListings?.find((rival) => rival.id === competitorId)?.title)
        .filter(Boolean)
        .slice(0, 2);
      const competitorText = externalCompetitors.length > 0
        ? `正在拿 ${externalCompetitors.join('、')} 比较`
        : `${entry.activeCaseIds.length} 套在比较`;
      return {
        id: `case-${caseItem.id}-customer-${entry.customerId}`,
        label: entry.status === 'comparing' ? '比较中客户' : '已接上客户',
        title: customer?.name || entry.customerId,
        detail: entry.status === 'comparing'
          ? `${competitorText}，${customer?.targetDistrict || caseItem.district} 的预算和需求还在校准。`
          : `${entry.activeCaseIds.length} 条关系在场，${customer?.targetDistrict || caseItem.district} 的客源还在承接。`,
        tone: entry.status === 'comparing' ? 'risk' as const : 'neutral' as const,
        caseId: caseItem.id,
      };
    });
  const decisionLens = [
    mainProblemLabel(mainProblem),
    listingLifecyclePhase.phaseLabel,
    caseItem.hasCompletedFirstVisit ? '已过面访' : '待面访',
    rivalListings.length > 0 ? '外部竞品在场' : '当前竞品较少',
  ];

  return {
    caseId: caseItem.id,
    headline: `${caseItem.title} · ${listingLifecyclePhase.phaseLabel}`,
    listingLifecyclePhase,
    mainProblem,
    mainProblemLabel: listingLifecyclePhase.coreProblemLabel,
    currentRiskTags: [primaryRiskTag],
    actionReasons: primaryAction ? [{
      id: `${caseItem.id}-primary-action`,
      label: listingLifecyclePhase.phaseLabel,
      title: `当前动作：${listingLifecyclePhase.primaryActionLabel}`,
      detail: listingLifecyclePhase.phaseRiskHint,
      tone: listingLifecyclePhase.phaseDelayLevel === 'late' ? 'risk' : 'neutral',
      caseId: caseItem.id,
    }] : [],
    comparisonSummary: {
      title: rivalListings.length > 0 || customerLinks.some((entry) => entry.status === 'comparing')
        ? '要和其他经纪人的同类房比较'
        : '先把可比较的同类房补出来',
      detail: rivalListings.length > 0
        ? `这套房现在有 ${rivalListings.length} 套其他经纪人维护的同类房在抢客户，${customerLinks.filter((entry) => entry.status === 'comparing').length} 位客户还在比较。`
        : `当前外部竞品还不多，但仍要持续补进同商圈、同户型和同客户线的比较对象。`,
      rivalStores: comparableRivalStores,
      rivalListings: comparableRivalListings,
      comparingCustomers,
      decisionLens,
    },
    factChain,
    nextStepLine: `当前动作：${listingLifecyclePhase.primaryActionLabel}`,
    recentChanges,
    ownerSummary: {
      isRevealed: caseItem.hasCompletedFirstVisit,
      title: deriveOwnerTitle(caseItem),
      detail: deriveOwnerDetail(state.day, caseItem),
      trust: caseItem.hasCompletedFirstVisit ? Math.round(caseItem.trust) : 0,
      patience: caseItem.hasCompletedFirstVisit ? Math.round(caseItem.patience) : 0,
      urgency: caseItem.hasCompletedFirstVisit ? Math.round(caseItem.urgency) : 0,
    },
    ownerProfiling: caseItem.hasCompletedFirstVisit ? caseItem.ownerProfilingMemory ?? null : null,
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
      detail: deriveCompetitionDetail(caseItem, rivalListings.length, competitionPressure, listingLifecyclePhase.phaseRiskHint),
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
  const customers = buildCustomerProjections(state, active);
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
    customers,
    realCustomerSummary: {
      contactedCount: customers.filter((entry) => entry.revealedRelationCount > 0).length,
      viewedCount: customers.filter((entry) => entry.viewedRelationCount > 0).length,
      comparingCount: customers.filter((entry) => entry.statusLabel === '比较中').length,
      negotiatingCount: customers.filter((entry) => entry.statusLabel === '谈价中').length,
    },
    potentialSummary: {
      caseCount: potentialCaseCount,
      channelCount: potentialChannelCount,
      soonestDaysLeft: potential.length > 0 ? Math.min(...potential.map((opportunity) => opportunity.daysLeft)) : null,
    },
    bucketSummaries: buildOpportunityBuckets(met, potential, closing.length, atRisk.length),
  };
}

function buildCustomerProjections(state: GameState, activeOpportunities: Opportunity[]): CustomerProjection[] {
  const activeOpportunityByCustomerCase = new Map<string, Opportunity>();
  activeOpportunities.forEach((opportunity) => {
    activeOpportunityByCustomerCase.set(buildCustomerCaseKey(opportunity.customerId, opportunity.caseId), opportunity);
  });

  const rows = state.customers
    .map((customer) => {
      const customerState = state.customerStates.find((entry) => entry.customerId === customer.id);
      const relations = buildCustomerCaseRelations(state, customer, customerState, activeOpportunityByCustomerCase);
      if (relations.length === 0 && !customerState) {
        return null;
      }

      const activeRelations = relations.filter((entry) => entry.intent >= 24 || entry.revealed);
      if (activeRelations.length === 0) {
        return null;
      }

      const leadRelation = activeRelations[0];
      const advisorTrust = Math.round(customerState?.advisorTrust ?? 45);
      const fatigue = Math.round(customerState?.fatigue ?? 0);
      const churnRisk = Math.round(customerState?.churnRisk ?? 0);
      const profile = customer.profile || '需求还在确认';
      const primaryActionId = leadRelation?.nextActionId;

      return {
        customerId: customer.id,
        name: customer.name,
        profile,
        budgetLine: `${Math.round(customer.budgetMin)}-${Math.round(customer.budgetMax)} 万`,
        targetDistrict: customer.targetDistrict,
        layoutLine: customer.layouts.slice(0, 2).join(' / ') || '户型待确认',
        statusLabel: deriveCustomerProjectionStatusLabel(customerState, leadRelation),
        statusDetail: deriveCustomerProjectionStatusDetail(customer, customerState, leadRelation, activeRelations),
        advisorTrust,
        fatigue,
        churnRisk,
        activeRelationCount: activeRelations.length,
        revealedRelationCount: activeRelations.filter((entry) => entry.revealed).length,
        viewedRelationCount: activeRelations.filter((entry) => entry.viewed).length,
        topCaseId: leadRelation?.caseId,
        topCaseTitle: leadRelation?.title,
        primaryActionId,
        primaryActionLabel: primaryActionId ? getActionDisplayName(primaryActionId) : undefined,
        rankScore: scoreCustomerProjection(customerState, activeRelations),
        relations: activeRelations,
      } satisfies CustomerProjection;
    })
    .filter(Boolean) as CustomerProjection[];

  return rows.sort((left, right) => right.rankScore - left.rankScore || left.name.localeCompare(right.name, 'zh-Hans-CN'));
}

function buildCustomerCaseRelations(
  state: GameState,
  customer: CustomerProfile,
  customerState: CustomerRuntimeState | undefined,
  activeOpportunityByCustomerCase: Map<string, Opportunity>,
): CustomerCaseRelationProjection[] {
  const caseIds = new Set<string>(customerState?.activeCaseIds || []);
  activeOpportunityByCustomerCase.forEach((opportunity) => {
    if (opportunity.customerId === customer.id) {
      caseIds.add(opportunity.caseId);
    }
  });

  return [...caseIds]
    .map((caseId) => {
      const caseItem = state.cases.find((entry) => entry.id === caseId && entry.status === 'active');
      const runtime = customerState?.caseStates[caseId];
      const opportunity = activeOpportunityByCustomerCase.get(buildCustomerCaseKey(customer.id, caseId));
      if (!caseItem || (!runtime && !opportunity)) {
        return null;
      }

      const stageIndex = Math.round(opportunity?.stageIndex ?? runtime?.stageIndex ?? 0);
      const stageLabel = opportunity?.stageLabel || deriveRelationStageLabel(stageIndex);
      const intent = Math.round(opportunity?.intent ?? runtime?.interest ?? 0);
      const confidence = Math.round(opportunity?.confidence ?? runtime?.confidence ?? 0);
      const fit = Math.round(opportunity?.fit ?? runtime?.fit ?? 0);
      const viewed = Boolean(runtime?.viewed || stageIndex >= 2);
      const selected = Boolean(runtime?.selected);
      const revealed = Boolean(opportunity && opportunity.visibility !== 'shadow');
      const nextActionId = resolveCustomerRelationActionId(state, caseItem, opportunity, runtime);

      return {
        id: opportunity?.id || `${customer.id}-${caseId}-runtime`,
        caseId,
        opportunityId: opportunity?.id,
        title: caseItem.title,
        district: caseItem.district,
        stageIndex,
        stageLabel,
        intent,
        confidence,
        fit,
        daysLeft: opportunity?.daysLeft,
        viewed,
        selected,
        revealed,
        channelName: opportunity?.channelName,
        tone: resolveCustomerRelationTone(customerState, opportunity, intent),
        nextActionId,
        nextActionLabel: nextActionId ? getActionDisplayName(nextActionId) : undefined,
      } satisfies CustomerCaseRelationProjection;
    })
    .filter(Boolean)
    .sort((left, right) => scoreCustomerRelation(right) - scoreCustomerRelation(left)) as CustomerCaseRelationProjection[];
}

function buildCustomerCaseKey(customerId: string, caseId: string) {
  return `${customerId}::${caseId}`;
}

function deriveRelationStageLabel(stageIndex: number) {
  if (stageIndex >= 5) return '谈判中';
  if (stageIndex >= 4) return '反馈出价';
  if (stageIndex >= 3) return '复看比较';
  if (stageIndex >= 2) return '已带看';
  if (stageIndex >= 1) return '已咨询';
  return '初步匹配';
}

function resolveCustomerRelationActionId(
  state: GameState,
  caseItem: Case,
  opportunity?: Opportunity,
  runtime?: CustomerRuntimeState['caseStates'][string],
) {
  const stageIndex = Math.round(opportunity?.stageIndex ?? runtime?.stageIndex ?? 0);
  const candidateActionIds = stageIndex >= 4
    ? ['invite-customer-negotiation', 'sincerity-sale', 'weekly-feedback']
    : stageIndex >= 2 || runtime?.viewed
      ? ['sincerity-sale', 'showing', 'weekly-feedback']
      : ['showing', 'weekly-feedback'];

  return candidateActionIds.find((actionId) => getActionAvailability(state, caseItem, actionId).enabled);
}

function getActionDisplayName(actionId: string) {
  return ACTIONS.find((entry) => entry.id === actionId)?.name || '安排事项';
}

function resolveCustomerRelationTone(
  customerState: CustomerRuntimeState | undefined,
  opportunity: Opportunity | undefined,
  intent: number,
): CustomerRelationTone {
  if ((customerState?.churnRisk || 0) >= 60 || (opportunity?.daysLeft ?? 9) <= 2 || intent < 45) {
    return 'risk';
  }
  if ((opportunity?.stageIndex || 0) >= 4 || intent >= 76) {
    return 'chance';
  }
  return 'neutral';
}

function deriveCustomerProjectionStatusLabel(
  customerState: CustomerRuntimeState | undefined,
  leadRelation?: CustomerCaseRelationProjection,
) {
  if ((customerState?.churnRisk || 0) >= 60) return '掉线风险';
  if (customerState?.status === 'negotiating' || (leadRelation?.stageIndex || 0) >= 4) return '谈价中';
  if (customerState?.status === 'comparing') return '比较中';
  if (customerState?.status === 'engaged') return '持续沟通';
  if (customerState?.status === 'browsing') return '看盘中';
  if (leadRelation?.revealed) return '已接上';
  return '潜在人群';
}

function deriveCustomerProjectionStatusDetail(
  customer: CustomerProfile,
  customerState: CustomerRuntimeState | undefined,
  leadRelation: CustomerCaseRelationProjection | undefined,
  relations: CustomerCaseRelationProjection[],
) {
  if (!leadRelation) return `${customer.targetDistrict} 的潜在客户，还没有形成明确房源关系。`;
  if ((customerState?.churnRisk || 0) >= 60) return `重点别让 ${leadRelation.title} 这条关系断掉。`;
  if (customerState?.status === 'comparing' || relations.length >= 2) return `正在比较 ${relations.length} 套，先围绕最匹配的 ${leadRelation.title} 推进。`;
  if (leadRelation.stageIndex >= 4) return `${leadRelation.title} 已经进入报价或谈价前后。`;
  if (leadRelation.viewed) return `${leadRelation.title} 已看过房，下一步要把反馈和价格接上。`;
  return `${leadRelation.title} 已接触，先安排带看或明确下一步。`;
}

function scoreCustomerProjection(
  customerState: CustomerRuntimeState | undefined,
  relations: CustomerCaseRelationProjection[],
) {
  const leadScore = relations[0] ? scoreCustomerRelation(relations[0]) : 0;
  const breadthScore = Math.min(4, relations.length) * 22;
  const riskScore = Math.max(0, (customerState?.churnRisk || 0) - 45) * 1.4;
  const statusScore = customerState?.status === 'negotiating' ? 90
    : customerState?.status === 'engaged' ? 60
      : customerState?.status === 'comparing' ? 45
        : 0;
  return Math.round(leadScore + breadthScore + riskScore + statusScore);
}

function scoreCustomerRelation(relation: CustomerCaseRelationProjection) {
  return (
    relation.stageIndex * 45
    + relation.intent * 0.9
    + relation.confidence * 0.7
    + relation.fit * 0.5
    + (relation.selected ? 24 : 0)
    + (relation.viewed ? 30 : 0)
    - Math.max(0, relation.daysLeft === undefined ? 0 : relation.daysLeft <= 2 ? -30 : relation.daysLeft * 1.8)
  );
}

function buildCaseFactChain(
  currentDay: number,
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

  const daysSinceOwnerTouched = elapsedDays(currentDay, caseItem.lastOwnerTouchedDay);
  facts.push({
    id: `${caseItem.id}-owner`,
    lane: 'owner',
    title: '业主关系',
    fact: daysSinceOwnerTouched >= 4
      ? `${daysSinceOwnerTouched} 天没做业主反馈，信任和耐心都在下滑边缘。`
      : `当前信任 ${Math.round(caseItem.trust)}，耐心 ${Math.round(caseItem.patience)}，业主还在等明确反馈。`,
    nextStep: daysSinceOwnerTouched >= 4
        ? '业主反馈已有事实材料。'
        : '反馈频率稳定。',
    tone: daysSinceOwnerTouched >= 4 || caseItem.trust < 52 || caseItem.patience < 42 ? 'risk' : 'neutral',
  });

  facts.push({
    id: `${caseItem.id}-price`,
    lane: 'price',
    title: '价格站位',
    fact: priceGap > 0
      ? `挂牌比市场常见成交价高 ${priceGap} 万，当前底价 ${caseItem.bottomPrice} 万。`
      : `挂牌与市场常见成交价基本贴近，当前更看执行和客户承接。`,
    nextStep: priceGap > 0
        ? '价格说法已统一，复看或报价更顺。'
        : '保持价格稳定，集中讲实客户理由。',
    tone: priceGap > 0 ? (priceGap >= 12 ? 'risk' : 'neutral') : 'chance',
  });

  facts.push({
    id: `${caseItem.id}-pool`,
    lane: 'pool',
    title: '客户承接',
    fact: `已接上 ${metCount} 位、潜在人群 ${potentialCount} 组，比较中 ${customerLinks.filter((entry) => entry.status === 'comparing').length} 位。`,
    nextStep: closingCount > 0
      ? '报价和谈判客户已接近成交。'
      : atRiskCount > 0
        ? '回访快要掉线的客户。'
        : metCount === 0
          ? '先补第一批真人客户。'
          : '已接上的客户可进入看房或复看。',
    tone: closingCount > 0 ? 'chance' : atRiskCount > 0 || metCount === 0 ? 'risk' : 'neutral',
  });

  facts.push({
    id: `${caseItem.id}-competition`,
    lane: 'main',
    title: '当前后果',
    fact: competitionPressure >= 68 || caseItem.windowDays <= 3
      ? '同类房在抢客户，再慢一步就容易失手。'
      : '外部压力还在，但这套房还有空间往前推。',
    nextStep: competitionPressure >= 68 || caseItem.windowDays <= 3
      ? '关键动作已浮出。'
      : '这套房保持连续触达。',
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
      detail: `发生在第 ${latestOpportunityStep.latestHistory.day} 天，这条客户线剩余 ${formatVisibleDaysLeft(latestOpportunityStep.opportunity.daysLeft)}。`,
      tone: latestOpportunityStep.opportunity.stageIndex >= 4 ? 'chance' : 'neutral',
      caseId: caseItem.id,
    });
  }

  if (!caseItem.touchedToday && caseItem.status === 'active') {
    changes.push({
      id: `${caseItem.id}-no-touch`,
      label: '今日动作',
      title: '今天还没安排动作',
      detail: '当前房源今日动作为空。',
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
    layerCards: buildMarketLayerCards(marketIntelProjection),
    signalFeed: marketIntelProjection.items.map((item) => ({
      id: item.id,
      layer: item.layer,
      label: item.layer === 'macro'
        ? '全城'
        : item.layer === 'district'
          ? '板块'
          : item.layer === 'competition'
            ? '竞争'
            : '房源',
      title: item.title,
      summary: sanitizeFrontstageText(item.summary),
      detail: sanitizeFrontstageText(item.detail),
      tone: item.tone,
      badge: item.badge,
      day: item.day,
      affectedCaseIds: item.affectedCaseIds,
    })),
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
        summary: sanitizeFrontstageText(layer.summary),
        lead: layer.lead ? toIntelProjectionBrief(layer.lead) : null,
      })),
    },
  };
}

function buildDashboardTriageCards(
  state: GameState,
  todayPriority: ProjectionBrief[],
  marketBrief: DashboardProjection['marketBrief'],
  priorityProjection: ReturnType<typeof buildFollowUpPriorityProjection>,
): DashboardProjection['triageCards'] {
  const activeOpportunityCount = state.opportunities.filter((opportunity) => opportunity.status === 'active').length;
  const closingLead = priorityProjection.groups.closingOpportunity.items[0] || null;
  const firstPriority = todayPriority[0] || null;

  return [
    {
      id: 'cases',
      label: '去房源',
      title: firstPriority?.title || '打开一套当前活跃房源',
      detail: firstPriority?.detail || '当前活跃房源可继续跟进。',
      countLabel: `${todayPriority.length} 件在排`,
      tone: firstPriority?.tone || 'neutral',
      targetView: 'cases',
      caseId: firstPriority?.caseId,
    },
    {
      id: 'customers',
      label: '去客户',
      title: closingLead
        ? `${closingLead.caseTitle} 这条客户线更接近成交`
        : activeOpportunityCount > 0
          ? '客户池里还有活跃关系'
          : '客户线偏薄',
      detail: closingLead?.reason || (activeOpportunityCount > 0
        ? `${activeOpportunityCount} 条活跃机会。`
        : '客户线偏薄。'),
      countLabel: `${activeOpportunityCount} 条活跃线`,
      tone: closingLead?.tone || (activeOpportunityCount > 0 ? 'chance' : 'neutral'),
      targetView: 'customers',
      caseId: closingLead?.caseId,
    },
    {
      id: 'market',
      label: '去市场',
      title: marketBrief.lead?.title || '外部变化今天不算强',
      detail: marketBrief.lead?.detail || '去看外部变化。',
      countLabel: `${marketBrief.todayCount} 条外因`,
      tone: marketBrief.lead?.tone || (marketBrief.riskCount > 0 ? 'risk' : marketBrief.chanceCount > 0 ? 'chance' : 'neutral'),
      targetView: 'market',
      marketLayer: 'macro',
      caseId: marketBrief.impactedCases[0]?.caseId,
    },
  ];
}

function buildMarketLayerCards(
  marketIntelProjection: ReturnType<typeof buildMarketIntelProjection>,
): MarketProjection['layerCards'] {
  return (['macro', 'district', 'competition', 'listing'] as IntelLayerTab[]).map((layer) => {
    const summary = marketIntelProjection.layers.find((entry) => entry.layer === layer);
    const label = layer === 'macro'
      ? '全城'
      : layer === 'district'
        ? '板块'
        : layer === 'competition'
          ? '竞争'
          : '房源';

    return {
      id: layer,
      label,
      count: summary?.totalCount || 0,
      title: summary?.lead?.title || `${label}层暂时没有强信号`,
      detail: sanitizeFrontstageText(summary?.summary || `今天 ${label}层没有形成明确主导变化。`),
      tone: summary?.lead?.tone || (summary?.riskCount ? 'risk' : summary?.chanceCount ? 'chance' : 'neutral'),
    };
  });
}

function buildTodayPriority(
  state: GameState,
  caseDetails: CaseDetailProjection[],
  priorityProjection: ReturnType<typeof buildFollowUpPriorityProjection>,
): ProjectionBrief[] {
  const fromSchedule = state.schedule.slice(0, 3).map((entry) => ({
    id: `schedule-${entry.key}`,
    label: '待处理',
    title: presentScheduleTitle(entry.title),
    detail: presentScheduleDetail(entry.note || entry.badge),
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
      detail: appendRhythmHint(state.day, sanitizeFrontstageText(item.reason)),
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
      label: entry.listingLifecyclePhase.phaseLabel,
      title: `${state.cases.find((caseItem) => caseItem.id === entry.caseId)?.title || '房源'} · ${entry.listingLifecyclePhase.coreProblemLabel}`,
      detail: appendRhythmHint(state.day, `当前动作：${sanitizeFrontstageText(entry.listingLifecyclePhase.primaryActionLabel)}`),
      tone: entry.listingLifecyclePhase.phaseDelayLevel === 'late' ? 'risk' as const : 'neutral' as const,
      caseId: entry.caseId,
    }));

  return [...fromSchedule, ...fromPriorityGroups, ...fromCaseDetails].slice(0, 4);
}

function appendRhythmHint(day: number, detail: string) {
  const dayOfWeek = getDayOfWeek(day);
  const hint = dayOfWeek === 1
    ? '今天是业主反馈拍，周末事实可转成业主看得懂的反馈。'
    : dayOfWeek === 2
      ? '今天是恢复整理拍，最容易失手的一件事已浮出。'
      : dayOfWeek === 3
        ? '今天上午偏内部判断，下午偏获客和包装。'
        : dayOfWeek === 4
          ? '今天上午是聚焦会拍，资源倾斜要有明确对象。'
        : dayOfWeek === 5
            ? '今天是周末前的蓄客预约拍，带看预约是主线。'
            : '今天是集中带看拍，优先拿真实市场反馈。';
  return `${detail} ${hint}`;
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
      label: entry.listingLifecyclePhase.phaseLabel,
      title: `${state.cases.find((caseItem) => caseItem.id === entry.caseId)?.title || '房源'} · ${entry.listingLifecyclePhase.coreProblemLabel}`,
      detail: appendRhythmHint(state.day, entry.listingLifecyclePhase.phaseRiskHint),
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
  currentDay: number,
  caseItem: Case,
  opportunities: Opportunity[],
  customerLinks: CustomerRuntimeState[],
  competitionPressure: number,
): CaseMainProblem {
  if (caseItem.trust < 52 || caseItem.patience < 42 || elapsedDays(currentDay, caseItem.lastOwnerTouchedDay) >= 4) return 'owner';
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
  if (problem === 'competition') return '同类房在抢客户';
  if (problem === 'execution') return '今天动作';
  return '外部变化';
}

function buildRiskTags(caseItem: Case, opportunities: Opportunity[], competitionPressure: number, atRiskCount: number) {
  const tags: string[] = [];
  if (caseItem.trust < 52) tags.push('业主信任低');
  if (caseItem.patience < 42) tags.push('业主耐心低');
  if (caseItem.askPrice > caseItem.marketPrice * 1.04) tags.push('挂牌价偏高');
  if (caseItem.windowDays <= 3) tags.push('再拖容易失手');
  if (competitionPressure >= 68) tags.push('同类房抢客户压力高');
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
      title: '业主反馈缺一条事实线',
      detail: '客户、带看、同类房和价格依据都在。',
      tone: 'risk',
      caseId: caseItem.id,
    });
  }

  if (mainProblem === 'price') {
    reasons.push({
      id: `${caseItem.id}-price-talk`,
      label: '待处理',
      title: '价格口径待统一',
      detail: `挂牌比市场价高 ${Math.max(0, caseItem.askPrice - caseItem.marketPrice)} 万，客户会犹豫。`,
      tone: 'risk',
      caseId: caseItem.id,
    });
  }

  if (mainProblem === 'customer-pool') {
    reasons.push({
      id: `${caseItem.id}-customer-pool`,
      label: '待处理',
      title: '缺客户线索',
      detail: '可补开放日、私域转介绍或合作经纪人。',
      tone: 'neutral',
      caseId: caseItem.id,
    });
  }

  if (mainProblem === 'competition') {
    reasons.push({
      id: `${caseItem.id}-competition`,
      label: '待处理',
      title: '同类房在抢客户',
      detail: competitionPressure >= 70 ? '同类盘在分客，带看和硬卖点压力更高。' : '时间拉长后难度会增加。',
      tone: 'risk',
      caseId: caseItem.id,
    });
  }

  if (mainProblem === 'execution') {
    reasons.push({
      id: `${caseItem.id}-execution`,
      label: '待处理',
      title: '动作未明确',
      detail: caseItem.hasCompletedFirstVisit ? '今日还没有明确触达记录。' : '首次面访没完成，业主、价格、房源故事都不稳。',
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
      detail: '报价、谈判和成交条件已经成为主线。',
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
      label: '见面准客',
      count: met.length,
      summary: met.length > 0 ? '客户阶段状态清楚。' : '还没有稳定接上的客户。',
    },
    {
      id: 'potential',
      label: '潜在人群',
      count: potential.length,
      summary: potential.length > 0 ? '按规模和概率判断，不是真实意向。' : '潜在人群还没浮出来。',
    },
    {
      id: 'closing',
      label: '报价/签约',
      count: closingCount,
      summary: closingCount > 0 ? '已经进入报价或谈判区。' : '暂时没有走到成交桌的客户。',
    },
    {
      id: 'at-risk',
      label: '流失风险',
      count: atRiskCount,
      summary: atRiskCount > 0 ? '短期回访和价格解释有压力。' : '短期流失压力不明显。',
    },
  ];
}

function deriveOwnerTitle(caseItem: Case) {
  if (!caseItem.hasCompletedFirstVisit) return '业主状态待面访';
  if (caseItem.trust < 52) return '业主开始不放心';
  if (caseItem.patience < 42) return '业主耐心不多';
  if (caseItem.urgency >= 78) return '业主更看重速度';
  return '业主还能配合';
}

function deriveOwnerDetail(currentDay: number, caseItem: Case) {
  if (!caseItem.hasCompletedFirstVisit) return '首次面访后，业主分型、真实目标和配合状态才会变清楚。';
  const daysSinceOwnerTouched = elapsedDays(currentDay, caseItem.lastOwnerTouchedDay);
  if (daysSinceOwnerTouched >= 4) return `业主反馈空窗 ${daysSinceOwnerTouched} 天。`;
  if (caseItem.trust < 52) return '业主信任偏低，客户和竞品信息还不够清楚。';
  if (caseItem.patience < 42) return '业主耐心偏低。';
  return caseItem.ownerMood ? sanitizeFrontstageText(caseItem.ownerMood) : '当前业主状态相对稳定。';
}

function deriveCustomerPoolTitle(metCount: number, potentialCount: number, closingCount: number, atRiskCount: number) {
  if (closingCount > 0) return '客户已经走到报价前后';
  if (atRiskCount > 0) return '客户池有流失风险';
  if (metCount >= 3) return '客户池比较厚';
  if (metCount > 0 || potentialCount > 0) return '客户池还在培养';
  return '客户池偏薄';
}

function deriveCustomerPoolDetail(caseItem: Case, met: Opportunity[], potential: Opportunity[], comparingCount: number) {
  if (met.some((opportunity) => opportunity.stageIndex >= 4)) return '已有客户进入报价或谈判，成交条件开始变清楚。';
  if (comparingCount > 0) return `${comparingCount} 位客户还在比较同类盘，${caseItem.title} 的价格和卖点要讲得更具体。`;
  if (potential.length > 0) return '有潜在线索，但预算和需求还没核实，不能当成真实成交机会。';
  if (met.length > 0) return '已经接上客户，阶段还浅，后续看房、复看或报价空间仍在。';
  return '客户承接不足，先补线索和曝光。';
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
  if (pressure >= 70) return '同类房在抢客户';
  if (rivalCount > 0) return '同类房在旁边盯着';
  return '外部压力暂时可控';
}

function deriveCompetitionDetail(caseItem: Case, rivalCount: number, pressure: number, phaseRiskHint: string) {
  if (pressure >= 70) return phaseRiskHint;
  if (rivalCount > 0) return `有 ${rivalCount} 套同类房在场，客户比较会更频繁。`;
  return `${caseItem.title} 当前外部压力不算最重。`;
}

function deriveCalendarDetail(dayOfWeek: number, theme: string) {
  if (dayOfWeek === 1) return '把周末客户、带看、同类房和价格整理成事实，回传给业主。';
  if (dayOfWeek === 2) return '休假、整理和恢复，只轻经营，不把今天排满。';
  if (dayOfWeek === 3) return '上午内部会做判断，下午补包装、获客和提报准备。';
  if (dayOfWeek === 4) return '上午聚焦会定资源倾斜，别让好房被同类盘分走。';
  if (dayOfWeek === 5) return '周末前找带看、蓄客、预约，把高峰日先锁住。';
  if (dayOfWeek === 6) return '集中带看，现场拿客户和市场的真实反馈。';
  if (dayOfWeek === 7) return '继续集中带看，同时为周一业主反馈留证据。';
  if (theme.includes('业主')) return '把客户、带看、同类房和价格整理成事实再沟通。';
  return '按当天资源处理最关键事项。';
}

function elapsedDays(currentDay: number, lastTouchedDay: number) {
  if (!lastTouchedDay || lastTouchedDay <= 0) {
    return Math.max(1, currentDay);
  }
  return Math.max(1, currentDay - lastTouchedDay);
}

function deriveMarketHeadline(state: GameState, rivalCount: number) {
  const dailyEvent = state.marketShadow?.dailyMarketEvent;
  if (dailyEvent) return dailyEvent.title;
  if (rivalCount > 0) return `今天有 ${rivalCount} 套同类房在抢客户`;
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
    fragments.push(`现在有 ${rivalCount} 套同类房在抢客户`);
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
      summary: radarAxes.demandHeat >= 65 ? '客户愿意出来看房，承接条件较好。' : radarAxes.demandHeat <= 40 ? '客户偏观望，成交周期会拉长。' : '客户热度中性。',
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
      label: '别家门店动作',
      value: radarAxes.rivalActivity,
      tone: (radarAxes.rivalActivity >= 65 ? 'risk' : 'neutral') as ProjectionTone,
      summary: radarAxes.rivalActivity >= 65 ? '别家门店和同类房动作偏猛，容易分客。' : '别家门店动作暂时不算太猛。',
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
      label: '同类在卖房',
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



function toIntelProjectionBrief(item: IntelItem): ProjectionBrief {
  return {
    id: item.id,
    label: item.badge,
    title: item.title,
    detail: sanitizeFrontstageText(item.detail),
    tone: item.tone === 'risk' ? 'risk' : item.tone === 'chance' ? 'chance' : 'neutral',
    caseId: item.affectedCaseIds[0],
  };
}
