import type { BudgetTransaction, Case, GameState, MatterEntry } from '../../domain/models.js';
import { WEEKLY_ROUTINE } from '../../domain/constants.js';
import { getRoutine } from '../../domain/utils.js';
import { getPromotionBudget, resolveFormalSoldCount } from '../../domain/runtimeStats.js';
import {
  buildCaseDetailProjection,
  buildDashboardProjection,
  buildMarketProjection,
  type CaseDetailProjection,
  type ProjectionBrief,
  type ProjectionTone,
} from './operatingProjection.js';

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

export interface WorkspaceShellSidebarFocusProjection {
  eyebrow: string;
  title: string;
  detail: string;
  badges: string[];
  caseId?: string;
}

export interface WorkspaceShellSidebarCueProjection {
  id: string;
  label: string;
  title: string;
  detail: string;
  tone: ProjectionTone;
  caseId?: string;
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
}

export interface WorkspaceShellMatterStatProjection {
  label: string;
  value: string;
  detail: string;
  tone: ProjectionTone;
}

export interface WorkspaceShellMatterProjection {
  headline: string;
  summary: string;
  stats: WorkspaceShellMatterStatProjection[];
  actionItems: WorkspaceShellSidebarCueProjection[];
  intelligenceItems: WorkspaceShellSidebarCueProjection[];
}

export interface WorkspaceShellSidebarProjection {
  focus: WorkspaceShellSidebarFocusProjection;
  matter: WorkspaceShellMatterProjection;
  actionCues: WorkspaceShellSidebarCueProjection[];
  riskCues: WorkspaceShellSidebarCueProjection[];
  marketCues: WorkspaceShellSidebarCueProjection[];
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
}

function getClosedDealCount(state: GameState) {
  return resolveFormalSoldCount(state);
}

export function buildWorkspaceShellProjection(state: GameState): WorkspaceShellProjection {
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
  const dashboardProjection = buildDashboardProjection(state);
  const marketProjection = buildMarketProjection(state);
  const selectedCase = state.selectedCaseId
    ? state.cases.find((entry) => entry.id === state.selectedCaseId) || null
    : null;
  const selectedCaseProjection = selectedCase ? buildCaseDetailProjection(state, selectedCase) : null;

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
        value: `${state.energy}/${state.maxEnergy}`,
        detail: buildEnergyHealthText(state.energy, state.maxEnergy),
      },
    },
    panelMeta: {
      budget: {
        eyebrow: '资源详情',
        title: '推广金',
        description: '这里展示余额、流水和投放结构。',
      },
      auxiliary: {
        eyebrow: '成交与回款',
        title: '成交与佣金',
        description: '这里看成交套数和佣金变化，只作为辅助参考。',
      },
      energy: {
        eyebrow: '日程资源',
        title: '今日精力',
        description: '这里看今天还能做多少事，以及接下来几天的精力安排。',
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
      summary: `已成交 ${soldCount} 套，平均每套 ${formatPointValue(averageCommission)} 点。佣金只解释成交结构，最终还是看房源结局和三项分数。`,
      stats: [
        { label: '已成交', value: `${soldCount} 套`, tone: 'emerald' },
        { label: '均佣', value: `${formatPointValue(averageCommission)}`, tone: 'sky' },
        { label: '撤回', value: `${state.auxiliaryStats.withdrawnCount} 套`, tone: 'rose' },
      ],
      rules: [
        { label: '计佣规则', value: '成交价 1% x 25%' },
        { label: '在场房源', value: `${state.cases.filter((entry) => entry.status === 'active').length} 套` },
        { label: '当前阶段', value: soldCount > 0 ? '已有成交回款' : '仍在累积首单' },
      ],
      note: '如果佣金高但差结果很多，这局仍然不算打好；如果没成交但商圈聚焦房没被抢走，也可能算稳住了。',
      soldCases: soldCases.map((entry) => toSoldCaseProjection(entry)),
    },
    energyPanel: {
      energyLabel: `${state.energy}/${state.maxEnergy}`,
      summary: `今天是 ${routine.label} · ${routine.theme}。${buildEnergyHealthText(state.energy, state.maxEnergy)}`,
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
      note: '精力是每日硬上限，数值只反映今天还能执行多少动作。',
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
    sidebar: buildSidebarProjection(
      state,
      dashboardProjection,
      marketProjection,
      selectedCase,
      selectedCaseProjection,
    ),
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
  };
}

function buildSidebarProjection(
  state: GameState,
  dashboardProjection: ReturnType<typeof buildDashboardProjection>,
  marketProjection: ReturnType<typeof buildMarketProjection>,
  selectedCase: Case | null,
  selectedCaseProjection: ReturnType<typeof buildCaseDetailProjection> | null,
): WorkspaceShellSidebarProjection {
  const focus = buildSidebarFocus(state, dashboardProjection, selectedCase, selectedCaseProjection);
  const journal = buildSidebarJournalSummary(state);
  const matter = buildMatterProjection(state, dashboardProjection, marketProjection, selectedCaseProjection);
  const actionCues = matter.actionItems.length > 0
    ? matter.actionItems.slice(0, 3)
    : dashboardProjection.todayPriority.slice(0, 3).map(toSidebarCue);

  return {
    focus,
    matter,
    actionCues,
    riskCues: dashboardProjection.riskReminders.slice(0, 3).map(toSidebarCue),
    marketCues: (
      marketProjection.affectedCases.length > 0
        ? marketProjection.affectedCases
        : dashboardProjection.marketBrief.briefs
    )
      .slice(0, 3)
      .map(toSidebarCue),
    journal,
  };
}

function buildMatterProjection(
  state: GameState,
  dashboardProjection: ReturnType<typeof buildDashboardProjection>,
  marketProjection: ReturnType<typeof buildMarketProjection>,
  selectedCaseProjection: ReturnType<typeof buildCaseDetailProjection> | null,
): WorkspaceShellMatterProjection {
  const runtimeMatters = state.matters
    .filter((entry) => entry.stage === 'pending' || entry.stage === 'in_progress')
    .slice(0, 6)
    .map(toMatterCue);
  const todayPriority = dashboardProjection.todayPriority.slice(0, 4).map(toSidebarCue);
  const actionItems = dedupeSidebarCues([...runtimeMatters, ...todayPriority]).slice(0, 4);
  const yesterdayItems = dashboardProjection.yesterdayIntel.slice(0, 2).map((item) => ({
    ...toSidebarCue(item),
    label: '昨日情报',
  }));
  const marketItems = (
    marketProjection.affectedCases.length > 0
      ? marketProjection.affectedCases
      : dashboardProjection.marketBrief.briefs
  )
    .slice(0, Math.max(0, 4 - yesterdayItems.length))
    .map((item) => ({
      ...toSidebarCue(item),
      label: item.tone === 'risk' ? '竞品压力' : '昨日情报',
    }));
  const intelligenceItems = dedupeSidebarCues([...yesterdayItems, ...marketItems]).slice(0, 4);
  const pendingMatters = state.matters.filter((entry) => entry.stage === 'pending');
  const urgentMatterCount = pendingMatters.filter((entry) => (entry.urgency || 0) >= 78).length;
  const closingGroupCount = dashboardProjection.priorityGroups.find((group) => group.id === 'closingOpportunity')?.count || 0;
  const closingCount = pendingMatters.filter((entry) => entry.kind === 'opportunity').length + closingGroupCount;
  const competitionCount = [
    ...dashboardProjection.riskReminders,
    ...marketProjection.affectedCases,
    ...dashboardProjection.todayPriority,
  ].filter((item) => /竞品|竞争|分流|同类/.test(`${item.label} ${item.title} ${item.detail}`)).length;
  const mainProblem = selectedCaseProjection?.mainProblemLabel
    || dashboardProjection.todayPriority[0]?.label
    || '今日先办';

  return {
    headline: buildMatterHeadline(actionItems, dashboardProjection.todayHeadline),
    summary: `当前重点是 ${mainProblem}。先处理今天最要紧的事项，再看昨天变化和竞品动向有没有改变优先级。`,
    stats: [
      {
        label: '今日先办',
        value: `${pendingMatters.length}`,
        detail: actionItems[0]?.title || '今天没有新的明确待办。',
        tone: urgentMatterCount > 0 ? 'risk' : 'neutral',
      },
      {
        label: '成交线索',
        value: `${closingCount}`,
        detail: closingCount > 0 ? '已有机会接近报价或谈判，需要优先承接。' : '暂时没有明确到成交桌的机会。',
        tone: closingCount > 0 ? 'chance' : 'neutral',
      },
      {
        label: '竞品压力',
        value: `${competitionCount}`,
        detail: competitionCount > 0 ? '有外部压力命中房源或客户判断。' : '暂时没有明显竞品分流信号。',
        tone: competitionCount > 0 ? 'risk' : 'neutral',
      },
    ],
    actionItems,
    intelligenceItems,
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
    lastTitle: lastEvent?.title || '这局还没有留下新的关键记录。',
    lastDetail: lastEvent?.detail || '先推进一天，系统才会开始留下可追溯的经营变化。',
    yesterdayCount: yesterdayItems.length,
    riskCount,
    chanceCount,
    brief: buildJournalBrief(todayItems.length, yesterdayItems.length, riskCount, chanceCount),
  };
}

function buildSidebarFocus(
  state: GameState,
  dashboardProjection: ReturnType<typeof buildDashboardProjection>,
  selectedCase: Case | null,
  selectedCaseProjection: ReturnType<typeof buildCaseDetailProjection> | null,
): WorkspaceShellSidebarFocusProjection {
  if (selectedCase && selectedCaseProjection) {
    return {
      eyebrow: '当前焦点',
      title: selectedCase.title,
      detail: selectedCaseProjection.actionReasons[0]?.detail
        || selectedCaseProjection.ownerSummary.detail,
      badges: [
        selectedCaseProjection.mainProblemLabel,
        `窗口 ${selectedCase.windowDays} 天`,
        `信任 ${Math.round(selectedCase.trust)}`,
      ],
      caseId: selectedCase.id,
    };
  }

  if (state.finalResult) {
    const activeCount = state.cases.filter((entry) => entry.status === 'active').length;
    return {
      eyebrow: '本局状态',
      title: `${state.runContext.scenarioName} 已正式结算`,
      detail: `最终得分 ${Math.round(state.finalResult.score)}，先看每套房最后落成什么样，再回头复盘。`,
      badges: [
        state.finalResult.grade,
        `${getClosedDealCount(state)} 套成交`,
        `${activeCount} 套在场`,
      ],
    };
  }

  return {
    eyebrow: '今日经营',
    title: dashboardProjection.todayHeadline,
    detail: dashboardProjection.todayPriority[0]?.detail || '今天先看最需要承接的房源，再安排关键动作。',
    badges: [
      `${dashboardProjection.resourceSnapshot.activeCases} 套在场`,
      `${dashboardProjection.resourceSnapshot.activeOpportunities} 条机会`,
      `精力 ${dashboardProjection.resourceSnapshot.energy}`,
    ],
    caseId: dashboardProjection.todayPriority[0]?.caseId,
  };
}

function toSidebarCue(item: ProjectionBrief): WorkspaceShellSidebarCueProjection {
  return {
    id: item.id,
    label: item.label,
    title: item.title,
    detail: item.detail,
    tone: item.tone,
    caseId: item.caseId,
  };
}

function toMatterCue(item: MatterEntry): WorkspaceShellSidebarCueProjection {
  return {
    id: item.id,
    label: item.kind === 'opportunity'
      ? '成交线索'
      : item.template === 'schedule'
        ? '今日先办'
        : '重点问题',
    title: item.title,
    detail: item.badge ? `${item.detail} · ${item.badge}` : item.detail,
    tone: item.kind === 'opportunity'
      ? 'chance'
      : (item.urgency || 0) >= 78
        ? 'risk'
        : 'neutral',
    caseId: item.caseId,
  };
}

function dedupeSidebarCues(items: WorkspaceShellSidebarCueProjection[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.caseId || 'global'}-${item.title}-${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildMatterHeadline(items: WorkspaceShellSidebarCueProjection[], fallback: string) {
  const firstRisk = items.find((item) => item.tone === 'risk');
  const firstChance = items.find((item) => item.label === '成交线索' || item.tone === 'chance');
  const lead = firstRisk || firstChance || items[0];

  if (!lead) return fallback;
  return `${lead.label} · ${lead.title}`;
}

function buildJournalBrief(todayCount: number, yesterdayCount: number, riskCount: number, chanceCount: number) {
  if (todayCount === 0 && yesterdayCount === 0) {
    return '还没有足够记录，先做动作或推进一天形成可回看的事实。';
  }

  if (riskCount > 0) {
    return `今天已有 ${todayCount} 条记录，其中 ${riskCount} 条涉及风险变化，先追近因。`;
  }

  if (chanceCount > 0) {
    return `今天已有 ${todayCount} 条记录，其中 ${chanceCount} 条是机会推进，适合回看成交线索。`;
  }

  return `今天 ${todayCount} 条记录，昨天留下 ${yesterdayCount} 条变化，可用于解释当前排序。`;
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

  return '今天优先看最需要处理的房源，再按资源承接关键动作。';
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
