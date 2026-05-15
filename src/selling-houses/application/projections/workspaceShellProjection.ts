import type { BudgetTransaction, Case, GameState, MatterEntry } from '../../domain/models.js';
import { WEEKLY_ROUTINE } from '../../domain/constants.js';
import { getRoutine } from '../../domain/utils.js';
import { getPromotionBudget, resolveFormalSoldCount } from '../../domain/runtimeStats.js';
import {
  buildCaseDetailProjection,
  type CaseDetailProjection,
} from './operatingProjection.js';
import {
  buildMarketOpeningPOVProjection,
  type MarketOpeningPOVProjection,
} from './marketOpeningPOVProjection.js';
import {
  buildPlayableMarketProjection,
  type PlayableMarketProjection,
} from './playableMarketProjection.js';
import {
  buildStrategicMarketDecisionProjection,
  type StrategicPlayableMarketProjection,
} from './strategicMarketDecisionProjection.js';
import type { ActorKnowledgeSnapshot } from '../../domain/world-model/actorKnowledgeTypes.js';

export type WorkspaceShellResourcePanelId = 'budget' | 'auxiliary' | 'energy';
export type WorkspaceShellMiniStatTone = 'emerald' | 'sky' | 'rose' | 'amber';

export interface WorkspaceShellHeaderProjection {
  scenarioTheme: string;
  routineLabel: string;
  routineTheme: string;
  difficultyId: string;
  scenarioName: string;
  dayLabel: string;
  progressLabel: string;
  statusNote: string;
}

export interface WorkspaceShellResourceTileProjection {
  label: string;
  value: string;
  detail?: string;
}

export interface WorkspaceShellMiniStatProjection {
  label: string;
  value: string;
  tone: WorkspaceShellMiniStatTone;
}

export interface WorkspaceShellRuleStatProjection {
  label: string;
  value: string;
}

export interface WorkspaceShellPanelMetaProjection {
  eyebrow: string;
  title: string;
  description: string;
}

export interface WorkspaceShellBudgetEntryProjection {
  id: string;
  title: string;
  detail: string;
  dayLabel: string;
  amountLabel: string;
  balanceLabel: string;
  positive: boolean;
}

export interface WorkspaceShellSoldCaseProjection {
  id: string;
  title: string;
  community: string;
  detail: string;
  commissionLabel: string;
}

export interface WorkspaceShellEnergyRhythmProjection {
  key: string;
  label: string;
  title: string;
  energyLabel: string;
}

export interface WorkspaceShellBudgetPanelProjection {
  balanceLabel: string;
  summary: string;
  stats: WorkspaceShellMiniStatProjection[];
  rules: WorkspaceShellRuleStatProjection[];
  note: string;
  entries: WorkspaceShellBudgetEntryProjection[];
}

export interface WorkspaceShellAuxiliaryPanelProjection {
  commissionLabel: string;
  summary: string;
  stats: WorkspaceShellMiniStatProjection[];
  rules: WorkspaceShellRuleStatProjection[];
  note: string;
  soldCases: WorkspaceShellSoldCaseProjection[];
}

export interface WorkspaceShellEnergyPanelProjection {
  energyLabel: string;
  summary: string;
  stats: WorkspaceShellMiniStatProjection[];
  rules: WorkspaceShellRuleStatProjection[];
  note: string;
  rhythm: WorkspaceShellEnergyRhythmProjection[];
}

export interface WorkspaceShellJournalSummaryProjection {
  todayCount: number;
  totalCount: number;
  lastTitle: string;
  lastDetail: string;
  yesterdayCount: number;
  riskCount: number;
  chanceCount: number;
  brief: string;
  actionLabel: string;
}

export interface WorkspaceShellSidebarProjection {
  journal: WorkspaceShellJournalSummaryProjection;
}

export interface WorkspaceShellSelectedCaseDetailProjection {
  caseId: string;
  title: string;
  stageLabel: string;
  district: string;
  community: string;
  story: string;
  projection: CaseDetailProjection;
}

export interface WorkspaceShellProjection {
  header: WorkspaceShellHeaderProjection;
  resourceTiles: Record<WorkspaceShellResourcePanelId, WorkspaceShellResourceTileProjection>;
  panelMeta: Record<WorkspaceShellResourcePanelId, WorkspaceShellPanelMetaProjection>;
  budgetPanel: WorkspaceShellBudgetPanelProjection;
  auxiliaryPanel: WorkspaceShellAuxiliaryPanelProjection;
  energyPanel: WorkspaceShellEnergyPanelProjection;
  sidebar: WorkspaceShellSidebarProjection;
  selectedCaseDetail: WorkspaceShellSelectedCaseDetailProjection | null;
  /** 大世界 POV 投影 — 市场入场简报（只读，不暴露完整 shadow world） */
  marketOpeningBrief: MarketOpeningPOVProjection;
  /** 可玩市场投影 — 市场雷达 + 竞品压力 + 客户池 + 业主池 + 经纪人机会 */
  playableMarket?: PlayableMarketProjection;
  /** 战略决策投影 — 资源消耗、机会成本、竞品风险、时间线影响 */
  strategicDecision?: StrategicPlayableMarketProjection;
}

function getClosedDealCount(state: GameState) {
  return resolveFormalSoldCount(state);
}

export function buildWorkspaceShellProjection(
  state: GameState,
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
): WorkspaceShellProjection {
  const routine = getRoutine(state.day, WEEKLY_ROUTINE);
  const nextRoutine = getRoutine(state.day + 1, WEEKLY_ROUTINE);
  const promotionBudget = getPromotionBudget(state);
  const recentBudgetEntries = state.budgetLedger.slice(0, 8);
  const weeklyBudgetIncome = sumBudgetByKind(state.budgetLedger, 'weekly-allocation');
  const saleBudgetIncome = sumBudgetByKind(state.budgetLedger, 'sale-rebate');
  const budgetSpend = Math.abs(state.budgetLedger.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0));
  const soldCases = [...state.cases]
    .filter((entry) => entry.status === 'sold')
    .sort((left, right) => (right.soldPrice || 0) - (left.soldPrice || 0))
    .slice(0, 6);
  const soldCount = getClosedDealCount(state);
  const averageCommission = soldCount > 0
    ? state.auxiliaryStats.commission / soldCount
    : 0;
  const spentEnergy = Math.max(state.maxEnergy - state.energy, 0);
  const activeCaseCount = state.cases.filter((entry) => entry.status === 'active').length;
  const activeOpportunityCount = state.opportunities.filter((entry) => entry.status === 'active').length;
  const selectedCase = state.selectedCaseId
    ? state.cases.find((entry) => entry.id === state.selectedCaseId) || null
    : null;
  const selectedCaseProjection = selectedCase
    ? buildCaseDetailProjection(state, selectedCase, actorKnowledgeMap?.get(selectedCase.id))
    : null;

  return {
    header: {
      scenarioTheme: state.runContext.scenarioSnapshot.scenario.theme,
      routineLabel: routine.label,
      routineTheme: routine.theme,
      difficultyId: state.runContext.difficultyId,
      scenarioName: state.runContext.scenarioName,
      dayLabel: `第 ${state.day} / ${state.maxDay} 天`,
      progressLabel: `${activeCaseCount} 套在场 · ${activeOpportunityCount} 条活跃机会`,
      statusNote: buildHeaderStatusNote(state, promotionBudget, activeCaseCount, activeOpportunityCount),
    },
    resourceTiles: {
      budget: {
        label: '推广金',
        value: `${promotionBudget} 点`,
        detail: buildBudgetHealthText(promotionBudget, state.rules.weeklyBudgetAllowance),
      },
      auxiliary: {
        label: '成交概况',
        value: `${soldCount} 成交`,
        detail: soldCount > 0 ? '已有正式成交回款。' : '成交还在累积中。',
      },
      energy: {
        label: '今日精力',
        value: `${state.energy} / ${state.maxEnergy}`,
        detail: `当前可用 ${state.energy}，今日上限 ${state.maxEnergy}。${buildEnergyHealthText(state.energy, state.maxEnergy)}`,
      },
    },
    panelMeta: {
      budget: {
        eyebrow: '资源详情',
        title: '推广金',
        description: '余额、流水和投放结构。',
      },
      auxiliary: {
        eyebrow: '成交与回款',
        title: '成交与佣金',
        description: '成交套数和佣金变化。',
      },
      energy: {
        eyebrow: '日程资源',
        title: '今日精力',
        description: '今天还能做多少事。',
      },
    },
    budgetPanel: {
      balanceLabel: `${promotionBudget} 点`,
      summary: `每周固定补给 ${state.rules.weeklyBudgetAllowance} 点，成交后再按返投规则补回。${buildBudgetHealthText(promotionBudget, state.rules.weeklyBudgetAllowance)}`,
      stats: [
        { label: '周补给', value: `+${weeklyBudgetIncome}`, tone: 'emerald' },
        { label: '成交返投', value: `+${saleBudgetIncome}`, tone: 'sky' },
        { label: '累计投放', value: `-${budgetSpend}`, tone: 'rose' },
      ],
      rules: [
        { label: '周度补给', value: `${state.rules.weeklyBudgetAllowance} 点 / 周` },
        { label: '最近可看流水', value: `${recentBudgetEntries.length} 条` },
        { label: '当前模拟日', value: `Day ${state.day}` },
      ],
      note: '推广金主要消耗在投放、开放日等高成本动作上，流水会直接反映资源投向。',
      entries: recentBudgetEntries.map((entry) => toBudgetEntryProjection(entry)),
    },
    auxiliaryPanel: {
      commissionLabel: `${formatPointValue(state.auxiliaryStats.commission)} 点`,
      summary: `已成交 ${soldCount} 套，平均每套 ${formatPointValue(averageCommission)} 点。`,
      stats: [
        { label: '已成交', value: `${soldCount} 套`, tone: 'emerald' },
        { label: '均佣', value: `${formatPointValue(averageCommission)}`, tone: 'sky' },
        { label: '撤回', value: `${state.auxiliaryStats.withdrawnCount} 套`, tone: 'rose' },
      ],
      rules: [
        { label: '计佣规则', value: '成交价 1% x 25%' },
        { label: '在场房源', value: `${state.cases.filter((entry) => entry.status === 'active').length} 套` },
        { label: '成交状态', value: soldCount > 0 ? '已有成交回款' : '仍在累积首单' },
      ],
      note: '佣金只看成交回款。',
      soldCases: soldCases.map((entry) => toSoldCaseProjection(entry)),
    },
    energyPanel: {
      energyLabel: `${state.energy} / ${state.maxEnergy}`,
      summary: `今天是 ${routine.label} · ${routine.theme}。当前可用 ${state.energy}，今日上限 ${state.maxEnergy}。${buildEnergyHealthText(state.energy, state.maxEnergy)}`,
      stats: [
        { label: '今日上限', value: `${state.maxEnergy}`, tone: 'amber' },
        { label: '已用精力', value: `${spentEnergy}`, tone: 'rose' },
        { label: '明日恢复', value: `${nextRoutine.energy}`, tone: 'sky' },
      ],
      rules: [
        { label: '每日恢复', value: '开日自动回满' },
        { label: '基础上限', value: `${state.rules.baseMaxEnergy} 精力` },
        { label: '明日主题', value: nextRoutine.theme },
      ],
      note: '今日精力表示当前可用 / 今日上限；日程里的可排余量会扣掉固定预留和已排占用。',
      rhythm: Array.from({ length: 4 }, (_, index) => {
        const absoluteDay = state.day + index;
        const previewRoutine = getRoutine(absoluteDay, WEEKLY_ROUTINE);

        return {
          key: `${absoluteDay}-${index}`,
          label: index === 0 ? '今天' : index === 1 ? '明天' : `+${index}天`,
          title: `${previewRoutine.label} · ${previewRoutine.theme}`,
          energyLabel: `${previewRoutine.energy} 精力`,
        };
      }),
    },
    sidebar: buildSidebarProjection(state),
    selectedCaseDetail: selectedCase && selectedCaseProjection
      ? {
        caseId: selectedCase.id,
        title: selectedCase.title,
        stageLabel: selectedCase.stageLabel,
        district: selectedCase.district,
        community: selectedCase.community,
        story: selectedCase.story,
        projection: selectedCaseProjection,
      }
      : null,
    marketOpeningBrief: buildMarketOpeningPOVProjection(state, actorKnowledgeMap),
    playableMarket: buildPlayableMarketProjection(state, actorKnowledgeMap),
    strategicDecision: buildStrategicMarketDecisionProjection(state, actorKnowledgeMap),
  };
}

function buildSidebarProjection(state: GameState): WorkspaceShellSidebarProjection {
  return {
    journal: buildSidebarJournalSummary(state),
  };
}

function buildSidebarJournalSummary(state: GameState): WorkspaceShellJournalSummaryProjection {
  const journalItems = [
    ...state.eventStore.map((entry) => ({
      id: `event-${entry.id}`,
      day: entry.day,
      title: entry.title,
      detail: entry.detail,
      tone: entry.tone,
      date: entry.date,
    })),
    ...state.eventLog
      .filter((entry) => !state.eventStore.some((event) =>
        event.day === entry.day
        && event.actor === entry.actor
        && event.detail === entry.message,
      ))
      .map((entry, index) => ({
        id: `log-${entry.day}-${index}`,
        day: entry.day,
        title: trimJournalTitle(entry.message),
        detail: entry.message,
        tone: entry.tone,
        date: entry.date,
      })),
  ].sort((left, right) => {
    if (right.day !== left.day) return right.day - left.day;
    return (right.date || '').localeCompare(left.date || '');
  });
  const todayItems = journalItems.filter((entry) => entry.day === state.day);
  const yesterday = Math.max(1, state.day - 1);
  const yesterdayItems = journalItems.filter((entry) => entry.day === yesterday);
  const riskCount = todayItems.filter((entry) => entry.tone === 'danger').length;
  const chanceCount = todayItems.filter((entry) => entry.tone === 'success').length;
  const lastEvent = journalItems[0];

  return {
    todayCount: todayItems.length,
    totalCount: journalItems.length,
    lastTitle: lastEvent?.title || '这局还没有新的记录。',
    lastDetail: lastEvent?.detail || '先推进一天，再回来查看。',
    yesterdayCount: yesterdayItems.length,
    riskCount,
    chanceCount,
    brief: buildJournalBrief(state, todayItems.length, yesterdayItems.length, riskCount, chanceCount),
    actionLabel: '展开记录',
  };
}

function buildJournalBrief(state: GameState, todayCount: number, yesterdayCount: number, riskCount: number, chanceCount: number) {
  const tickResult = state.lastDailyTickResult;
  const dirtySummary = buildJournalDirtyScopeSummary(tickResult);

  if (tickResult && dirtySummary) {
    if (tickResult.invariantAlerts.length > 0) {
      return `今天影响到 ${dirtySummary}，还有 ${tickResult.invariantAlerts.length} 条系统提醒。`;
    }

    return `今天影响到 ${dirtySummary}，适合顺着这条线回看近因。`;
  }

  if (todayCount === 0 && yesterdayCount === 0) {
    return '还没有足够记录。';
  }

  if (riskCount > 0) {
    return `今天 ${todayCount} 条记录，其中 ${riskCount} 条是风险变化。`;
  }

  if (chanceCount > 0) {
    return `今天 ${todayCount} 条记录，其中 ${chanceCount} 条是机会推进。`;
  }

  return `今天 ${todayCount} 条记录，昨天有 ${yesterdayCount} 条变化。`;
}

function buildJournalDirtyScopeSummary(tickResult: GameState['lastDailyTickResult']) {
  if (!tickResult) {
    return '';
  }

  const parts: string[] = [];
  if (tickResult.dirtyScopes.cases.length > 0) {
    parts.push(`${tickResult.dirtyScopes.cases.length} 套房源`);
  }
  if (tickResult.dirtyScopes.customers.length > 0) {
    parts.push(`${tickResult.dirtyScopes.customers.length} 位客户`);
  }
  if (tickResult.dirtyScopes.districts.length > 0) {
    parts.push(tickResult.dirtyScopes.districts.slice(0, 2).join('、'));
  }
  if (tickResult.dirtyScopes.market) {
    parts.push('市场层');
  }

  return parts.slice(0, 3).join('、');
}

function trimJournalTitle(message: string) {
  const trimmed = message.trim();
  if (trimmed.length <= 24) {
    return trimmed;
  }

  return `${trimmed.slice(0, 24)}...`;
}

function sumBudgetByKind(ledger: BudgetTransaction[], kind: BudgetTransaction['kind']) {
  return ledger
    .filter((entry) => entry.kind === kind)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function buildBudgetHealthText(promotionBudget: number, weeklyBudgetAllowance: number) {
  if (promotionBudget <= Math.max(4, weeklyBudgetAllowance)) {
    return '余额偏紧，后续高成本动作空间有限。';
  }

  if (promotionBudget >= weeklyBudgetAllowance * 3) {
    return '结余比较健康，仍有继续投放的空间。';
  }

  return '余额处于中段，后续动作仍可承接。';
}

function buildEnergyHealthText(energy: number, maxEnergy: number) {
  if (energy <= 1) {
    return '今天可用精力已经接近见底。';
  }

  if (energy >= Math.max(3, Math.ceil(maxEnergy * 0.6))) {
    return '当前可用精力仍然充足。';
  }

  return '今天精力已经过半。';
}

function buildHeaderStatusNote(
  state: GameState,
  promotionBudget: number,
  activeCaseCount: number,
  activeOpportunityCount: number,
) {
  if (activeCaseCount === 0) {
    return '当前没有在场房源，这一局更多是在等待下一次开局或正式结算。';
  }

  if (state.energy <= 1) {
    return '今天精力已经见底，只适合处理最关键的沟通和推进。';
  }

  if (promotionBudget <= Math.max(4, state.rules.weeklyBudgetAllowance)) {
    return '推广金偏紧，后续高成本动作要更挑着打。';
  }

  if (activeOpportunityCount >= activeCaseCount * 2) {
    return '当前客户承接还算有厚度，重点是别让已经谈到深处的客户掉出去。';
  }

  return '今天重点处理最需要承接的房源。';
}

function toBudgetEntryProjection(entry: BudgetTransaction): WorkspaceShellBudgetEntryProjection {
  return {
    id: entry.id,
    title: entry.title,
    detail: entry.detail,
    dayLabel: `Day ${entry.day}`,
    amountLabel: `${entry.amount >= 0 ? '+' : ''}${entry.amount}`,
    balanceLabel: `余额 ${entry.balanceAfter}`,
    positive: entry.amount >= 0,
  };
}

function toSoldCaseProjection(entry: Case): WorkspaceShellSoldCaseProjection {
  const soldPrice = entry.soldPrice || 0;
  const commission = Math.round(soldPrice * 0.01 * 0.25 * 10) / 10;

  return {
    id: entry.id,
    title: entry.title,
    community: entry.community,
    detail: `成交价 ${soldPrice} 万，业主 ${entry.ownerName}，这套房已经成交。`,
    commissionLabel: `+${formatPointValue(commission)}`,
  };
}

function formatPointValue(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}
