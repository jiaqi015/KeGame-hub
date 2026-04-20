import { CASE_STAGES } from './constants.js';
import { calculateUrgency, updateCompetitiveness } from './scoring.js';
import type { Case, DomainEventEntry, DomainEventKind, GameState, GoalTier, MatterEntry, Opportunity, Tone } from './models.js';
import { getOpportunityPriority, average, clamp } from './utils.js';
import { syncAuxiliaryMirrors } from './runtimeStats.js';

function buildDomainEventId(kind: DomainEventKind, day: number, index: number) {
  return `event-${kind}-${day}-${index}`;
}

export function recordDomainEvent(
  world: GameState,
  input: {
    kind: DomainEventKind;
    actor: string;
    title: string;
    detail: string;
    tone?: Tone;
    caseId?: string;
    opportunityId?: string;
    customerId?: string;
    payload?: Record<string, unknown>;
  },
) {
  const entry: DomainEventEntry = {
    id: buildDomainEventId(input.kind, world.day, world.eventStore.length + 1),
    day: world.day,
    date: world.currentDate,
    kind: input.kind,
    actor: input.actor,
    title: input.title,
    detail: input.detail,
    tone: input.tone || 'accent',
    caseId: input.caseId,
    opportunityId: input.opportunityId,
    customerId: input.customerId,
    payload: input.payload || {},
  };
  world.eventStore.unshift(entry);
  return entry;
}

export function logEvent(world: GameState, actor: string, message: string, tone: Tone = 'accent') {
  world.eventLog.unshift({
    actor,
    message,
    tone,
    day: world.day,
    date: world.currentDate,
  });
  if (world.eventLog.length > 120) {
    world.eventLog.pop();
  }
  recordDomainEvent(world, {
    kind: 'journal',
    actor,
    title: actor,
    detail: message,
    tone,
  });
}

export function deriveDefaultGoalTier(caseItem: Partial<Case>): GoalTier {
  if (caseItem.goalTier === 'core' || caseItem.goalTier === 'important' || caseItem.goalTier === 'normal') {
    return caseItem.goalTier;
  }

  if (Number(caseItem.windowDays) <= 7 || Number(caseItem.urgency) >= 76) {
    return 'core';
  }
  if (Number(caseItem.trust) <= 58 || Number(caseItem.windowDays) <= 10 || Number(caseItem.patience) <= 45) {
    return 'important';
  }
  return 'normal';
}

export function seedCase(base: Case): Case {
  return {
    ...base,
    competitionGroupIds: Array.isArray(base.competitionGroupIds) ? [...base.competitionGroupIds] : [],
    riskFlags: [],
    competitivenessSnapshots: [],
    status: 'active',
    stageIndex: 0,
    stageLabel: CASE_STAGES[0],
    actionsToday: 0,
    touchedToday: false,
    touchedOwnerToday: false,
    lastTouchedDay: 0,
    lastOwnerTouchedDay: 0,
    hasCompletedFirstVisit: false,
    lastAction: '',
    lastPriceActionDay: -99,
    openDayCooldown: 0,
    qualityStory: 0,
    negotiationBonus: 0,
    viewings: 0,
    offers: 0,
    soldPrice: null,
    priceGapPct: 0,
    lastAskPrice: base.askPrice,
    lastRivalThreatDay: undefined,
    goalTier: deriveDefaultGoalTier(base),
    storylineState: 'healthy',
    relativeOutcome: undefined,
    ownerSatisfaction: undefined,
    defenseOutcome: undefined,
    endingType: undefined,
    endingBucket: undefined,
    endingSummary: '',
  };
}

export function updateDerivedState(world: GameState) {
  world.cases.forEach((caseItem) => {
    const opportunities = world.opportunities.filter((entry) => entry.caseId === caseItem.id && entry.status === 'active');
    const highestStage = opportunities.length ? Math.max(...opportunities.map((entry) => entry.stageIndex)) : 0;

    if (caseItem.status === 'sold') {
      caseItem.stageLabel = '已成交';
    } else if (caseItem.status === 'lost_to_rival') {
      caseItem.stageLabel = '被竞品截走';
    } else if (caseItem.status === 'withdrawn') {
      caseItem.stageLabel = '已撤盘';
    } else {
      caseItem.stageIndex = Math.max(caseItem.stageIndex, highestStage);
      caseItem.stageLabel = CASE_STAGES[clamp(caseItem.stageIndex, 0, CASE_STAGES.length - 1)];
    }

    caseItem.priceGapPct = Math.round(((caseItem.askPrice - caseItem.marketPrice) / Math.max(caseItem.marketPrice, 1)) * 1000) / 10;
    updateCompetitiveness(world, caseItem);
    caseItem.riskFlags = deriveRiskFlags(caseItem, opportunities);
    caseItem.storylineState = deriveStorylineState(caseItem, opportunities);
  });

  world.schedule = deriveSchedule(world);
  world.priorities = derivePriorities(world);
  world.matters = deriveMatters(world);
  world.metrics = deriveMetrics(world);
  syncAuxiliaryMirrors(world);

  if (!world.cases.some((entry) => entry.id === world.selectedCaseId)) {
    world.selectedCaseId = world.cases.find((entry) => entry.status === 'active')?.id || world.cases[0]?.id || null;
  }

  world.opportunities.sort((left, right) => getOpportunityPriority(right) - getOpportunityPriority(left));
}

function deriveRiskFlags(caseItem: Case, opportunities: Opportunity[]) {
  const flags: string[] = [];
  if (caseItem.status !== 'active') return flags;
  if (caseItem.trust < 58) flags.push('业主开始不放心');
  if (caseItem.windowDays <= 4) flags.push('剩余时间不多');
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) flags.push('要价偏高');
  if (caseItem.heat < 48) flags.push('来看的人变少了');
  if (!opportunities.length) flags.push('现在没有客户');
  if (caseItem.competitionGroupIds.length > 0) flags.push('同类房在抢客户');
  if (!flags.length) flags.push('整体还算稳定');
  return flags;
}

function deriveStorylineState(caseItem: Case, opportunities: Opportunity[]) {
  if (caseItem.status === 'sold') return 'healthy' as const;
  if (caseItem.status === 'lost_to_rival' || caseItem.status === 'withdrawn') return 'critical' as const;
  if (caseItem.windowDays <= 2 || caseItem.trust <= 45) return 'critical' as const;
  if (caseItem.windowDays <= 4 || caseItem.trust <= 55 || !opportunities.length) return 'sliding' as const;
  if (caseItem.heat < 50 || caseItem.competitionGroupIds.length > 0) return 'fragile' as const;
  return 'healthy' as const;
}

function deriveSchedule(world: GameState) {
  const items: GameState['schedule'] = [];
  world.cases.forEach((caseItem) => {
    if (caseItem.status !== 'active') return;
    if (caseItem.windowDays <= 4) {
      items.push({
        key: `${caseItem.id}-window`,
        caseId: caseItem.id,
        title: '业主窗口逼近',
        badge: `${caseItem.windowDays} 天内`,
        note: `${caseItem.title} 处在业主窗口收缩阶段，${caseItem.ownerName} 的预期正在变紧。`,
        urgency: 100 - caseItem.windowDays * 10,
      });
    }
  });

  world.opportunities
    .filter((entry) => entry.status === 'active' && entry.daysLeft <= 2)
    .forEach((entry) => {
      const isShadow = entry.visibility === 'shadow';
      const displayName = isShadow ? `待确认客户 #${entry.id.split('-').pop()}` : entry.customerName;
      items.push({
        key: entry.id,
        caseId: entry.caseId,
        title: isShadow ? '确认客户需求' : entry.stageLabel,
        badge: `${entry.daysLeft} 天后流失`,
        note: `${displayName} 正在从 ${world.cases.find((caseItem) => caseItem.id === entry.caseId)?.title || '房源'} 上流失，剩余窗口已经不多。`,
        urgency: 86 - entry.daysLeft * 10 + entry.stageIndex * 4,
      });
    });

  return items.sort((left, right) => right.urgency - left.urgency).slice(0, 10);
}

function derivePriorities(world: GameState) {
  const items: GameState['priorities'] = [];
  world.cases
    .filter((entry) => entry.status === 'active')
    .sort((left, right) => calculateUrgency(right) - calculateUrgency(left))
    .slice(0, 2)
    .forEach((caseItem) => {
      const urgencyLabel = caseItem.storylineState === 'critical'
        ? '这套房已经快滑出可控区了。'
        : caseItem.storylineState === 'sliding'
          ? '这套房正在往难看收尾滑。'
          : caseItem.storylineState === 'fragile'
            ? '这套房还能守，但已经不能再放。'
            : '这套房目前还在你能控住的区间里。';
      items.push({
        key: `${caseItem.id}-priority`,
        kind: 'case',
        title: `${caseItem.title} 风险抬升`,
        detail: `${urgencyLabel} ${caseItem.ownerName} 当前信任 ${Math.round(caseItem.trust)}，配合度 ${Math.round(caseItem.d3)}。`,
        caseId: caseItem.id,
      });
    });

  world.opportunities
    .filter((entry) => entry.status === 'active')
    .slice(0, 2)
    .forEach((entry) => {
      const isShadow = entry.visibility === 'shadow';
      const displayName = isShadow ? `待确认客户 #${entry.id.split('-').pop()}` : entry.customerName;
      items.push({
        key: entry.id,
        kind: 'opportunity',
        title: isShadow ? `${displayName} 待确认` : `${displayName} 进入 ${entry.stageLabel}`,
        detail: isShadow
          ? `这是一位待确认客户，当前信息来自经纪人 ${entry.brokerName}。`
          : `${displayName} 已进入 ${entry.stageLabel}，${entry.daysLeft} 天后可能流失。`,
        caseId: entry.caseId,
      });
    });

  return items.slice(0, 5);
}

function deriveMatters(world: GameState): MatterEntry[] {
  const scheduleMatters: MatterEntry[] = world.schedule.map((entry) => ({
    id: `matter-schedule-${entry.key}`,
    source: 'schedule',
    sourceKey: entry.key,
    caseId: entry.caseId,
    title: entry.title,
    detail: entry.note,
    badge: entry.badge,
    stage: 'pending',
    template: 'schedule',
    presentation: 'inline-card',
    kind: 'case',
    urgency: entry.urgency,
    openedAtDay: world.day,
  }));

  const priorityMatters: MatterEntry[] = world.priorities.map((entry) => ({
    id: `matter-priority-${entry.key}`,
    source: 'priority',
    sourceKey: entry.key,
    caseId: entry.caseId,
    title: entry.title,
    detail: entry.detail,
    stage: 'pending',
    template: entry.kind === 'opportunity' ? 'dialog' : 'form',
    presentation: 'inline-card',
    kind: entry.kind,
    urgency: entry.kind === 'opportunity' ? 72 : 84,
    openedAtDay: world.day,
  }));

  return [...scheduleMatters, ...priorityMatters];
}

function deriveMetrics(world: GameState) {
  const activeCases = world.cases.filter((entry) => entry.status === 'active');
  const activeOpportunities = world.opportunities.filter((entry) => entry.status === 'active');
  return {
    activeCaseCount: activeCases.length,
    activeOpportunityCount: activeOpportunities.length,
    averageTrust: Math.round(average(activeCases.map((entry) => entry.trust))),
    averageD1: Math.round(average(activeCases.map((entry) => entry.d1))),
    averageD3: Math.round(average(activeCases.map((entry) => entry.d3))),
    topConversion: activeOpportunities.length ? `${Math.round(activeOpportunities[0].intent)}%` : '暂无',
  };
}
