import { CASE_STAGES, WEEKLY_ROUTINE } from './constants.js';
import { deriveMatters as derivePersistentMatters } from './matterEngine.js';
import { normalizeOwnerPriceAnchors } from './priceAnchors.js';
import { calculateUrgency, updateCompetitiveness } from './scoring.js';
import type { Case, DomainEventEntry, DomainEventKind, GameState, GoalTier, MatterEntry, Opportunity, Tone } from './models.js';
import { getDayOfWeek, getOpportunityPriority, getRoutine, average, clamp } from './utils.js';
import { syncAuxiliaryMirrors } from './runtimeStats.js';

function buildDomainEventId(kind: DomainEventKind, day: number, index: number) {
  return `event-${kind}-${day}-${index}`;
}

function formatVisibleDaysLeft(daysLeft: number) {
  const value = Number.isFinite(daysLeft) ? Math.max(0, daysLeft) : 0;
  if (value < 1) return '不足 1 天';
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.001) return `${rounded} 天`;
  return `约 ${Math.ceil(value)} 天`;
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
  const priceAnchors = normalizeOwnerPriceAnchors(base);

  return {
    ...base,
    ...priceAnchors,
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
    lastAskPrice: priceAnchors.askPrice,
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
    const priceAnchors = normalizeOwnerPriceAnchors(caseItem);
    caseItem.askPrice = priceAnchors.askPrice;
    caseItem.marketPrice = priceAnchors.marketPrice;
    caseItem.bottomPrice = priceAnchors.bottomPrice;

    const opportunities = world.opportunities.filter((entry) => entry.caseId === caseItem.id && entry.status === 'active');
    const highestStage = opportunities.length ? Math.max(...opportunities.map((entry) => entry.stageIndex)) : 0;

    if (caseItem.status === 'sold') {
      caseItem.stageLabel = '已成交';
    } else if (caseItem.status === 'lost_to_rival') {
      caseItem.stageLabel = '他处成交';
    } else if (caseItem.status === 'withdrawn') {
      caseItem.stageLabel = '已核销';
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
  world.matters = derivePersistentMatters(world);
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
  const items: GameState['schedule'] = [...deriveWeekRhythmSchedule(world)];
  if (getDayOfWeek(world.day) === 4) {
    const anchorCaseId = world.selectedCaseId
      || world.cases.find((entry) => entry.status === 'active')?.id
      || world.cases[0]?.id
      || '';
    const submissionCount = world.focusMeeting.submissionDay === world.day
      ? world.focusMeeting.submittedCaseIds.length
      : 0;
    items.push({
      key: `focus-meeting-${world.day}`,
      caseId: anchorCaseId,
      title: '周四上午聚焦会',
      badge: `已提报 ${submissionCount}/3`,
      note: '上午固定进行提报评审，入选房源将得到额外业主信心与流量加成。',
      urgency: 95,
      slot: 'am',
      source: 'routine',
      weekdayIntent: '周四上午聚焦会，把资源倾斜给最值得守的房源。',
      actionId: 'focus-meeting-submit',
    });
  }
  world.cases.forEach((caseItem) => {
    if (caseItem.status !== 'active') return;
    if (caseItem.windowDays <= 4) {
      items.push({
        key: `${caseItem.id}-window`,
        caseId: caseItem.id,
        title: '业主开始不耐烦',
        badge: `${caseItem.windowDays} 天内`,
        note: `${caseItem.title} 已经拖到业主开始收紧耐心，${caseItem.ownerName} 的预期正在变紧。`,
        urgency: 100 - caseItem.windowDays * 10,
        source: 'risk',
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
        badge: `${formatVisibleDaysLeft(entry.daysLeft)}后流失`,
        note: `${displayName} 正在从 ${world.cases.find((caseItem) => caseItem.id === entry.caseId)?.title || '房源'} 上流失，再拖就容易失手。`,
        urgency: 86 - entry.daysLeft * 10 + entry.stageIndex * 4,
        source: 'risk',
        opportunityId: entry.id,
      });
    });

  world.productRuns
    .filter((run) => run.status === 'running')
    .forEach((run) => {
      const targetCaseId = run.targetIds.find((targetId) => world.cases.some((caseItem) => caseItem.id === targetId));
      if (!targetCaseId) {
        return;
      }
      const targetCase = world.cases.find((entry) => entry.id === targetCaseId);
      const milestone = (run.milestones || []).find((entry) => entry.id === run.nextMilestone) || null;
      if (!milestone) {
        return;
      }

      items.push({
        key: `${run.id}-${milestone.id}`,
        caseId: targetCaseId,
        title: milestone.title,
        badge: productRunMilestoneBadge(milestone.kind),
        note: `${targetCase?.title || '当前房源'} · ${milestone.summary}`,
        urgency: productRunMilestoneUrgency(milestone.kind, world.day, milestone.day),
        slot: milestone.kind === 'heavy_scene' ? 'am' : undefined,
        source: 'run',
      });
    });

  return items.sort((left, right) => getScheduleSortScore(right) - getScheduleSortScore(left)).slice(0, 10);
}

function getScheduleSortScore(entry: GameState['schedule'][number]) {
  const fixedRoutineBoost = entry.source === 'routine' && /内部|聚焦会/.test(`${entry.title} ${entry.badge} ${entry.weekdayIntent || ''}`)
    ? 1000
    : 0;
  return fixedRoutineBoost + entry.urgency;
}

function deriveWeekRhythmSchedule(world: GameState): GameState['schedule'] {
  const routine = getRoutine(world.day, WEEKLY_ROUTINE);
  const dayOfWeek = getDayOfWeek(world.day);
  const activeCases = world.cases.filter((entry) => entry.status === 'active');
  const anchorCase = world.selectedCaseId
    ? activeCases.find((entry) => entry.id === world.selectedCaseId) || activeCases[0]
    : activeCases[0];
  if (!anchorCase) {
    return [];
  }

  const items: GameState['schedule'] = [];
  const activeOpportunities = world.opportunities.filter((entry) => entry.status === 'active' && entry.visibility !== 'shadow');
  const ownerFeedbackCase = activeCases
    .slice()
    .sort((left, right) => (world.day - left.lastOwnerTouchedDay) - (world.day - right.lastOwnerTouchedDay))
    .reverse()
    .find((entry) => world.day - Math.max(entry.lastOwnerTouchedDay, 0) >= 2) || activeCases[0];
  const showingOpportunity = activeOpportunities
    .slice()
    .sort((left, right) => (right.stageIndex * 20 + right.intent) - (left.stageIndex * 20 + left.intent))[0] || null;
  const showingCase = showingOpportunity
    ? activeCases.find((entry) => entry.id === showingOpportunity.caseId) || anchorCase
    : anchorCase;

  if (dayOfWeek === 1 && ownerFeedbackCase) {
    items.push({
      key: `rhythm-owner-feedback-${ownerFeedbackCase.id}-${world.day}`,
      caseId: ownerFeedbackCase.id,
      title: '周一业主反馈',
      badge: '周节奏',
      note: `${ownerFeedbackCase.title} 要把周末客户、带看、同类房和价格变化翻译给业主，先稳住下一轮共识。`,
      urgency: 88,
      slot: 'am',
      source: 'routine',
      weekdayIntent: routine.theme,
      actionId: 'weekly-feedback',
    });
  }

  if (dayOfWeek === 2) {
    items.push({
      key: `rhythm-light-ops-${anchorCase.id}-${world.day}`,
      caseId: anchorCase.id,
      title: '周二轻经营',
      badge: '低精力',
      note: '今天只适合整理、恢复和补最要紧的漏，不要把自己排满。',
      urgency: activeCases.some((entry) => entry.windowDays <= 3 || entry.trust <= 50) ? 84 : 62,
      slot: 'am',
      source: 'routine',
      weekdayIntent: routine.theme,
      actionId: 'deep-diagnosis',
    });
  }

  if (dayOfWeek === 3) {
    items.push({
      key: `rhythm-internal-judgment-${anchorCase.id}-${world.day}`,
      caseId: anchorCase.id,
      title: '周三上午内部判断',
      badge: '内部会',
      note: '先判断哪些房源值得进周四聚焦会，下午再补包装、获客和邀约。',
      urgency: 86,
      slot: 'am',
      source: 'routine',
      weekdayIntent: routine.theme,
      actionId: 'deep-diagnosis',
    });
  }

  if (dayOfWeek === 5) {
    const communityCases = activeCases.filter((entry) => entry.community === anchorCase.community);
    const hasOpenDayRun = world.productRuns.some((run) => (
      run.status === 'running'
      && run.productType === 'open-day'
      && run.targetIds.some((targetId) => communityCases.some((caseItem) => caseItem.id === targetId))
    ));
    if (communityCases.length >= 2 && !hasOpenDayRun) {
      items.push({
        key: `interrupt-open-day-available-${anchorCase.community}-${world.day}`,
        caseId: anchorCase.id,
        title: '小区突然可办开放日',
        badge: '插单机会',
        note: `${anchorCase.community} 今天适合把周末带看集中起来；这是机会，不自动占用排程，但值得立刻判断是否发起开放日。`,
        urgency: 91,
        slot: 'pm',
        source: 'interrupt',
        weekdayIntent: routine.theme,
        actionId: 'open-day',
      });
    } else {
      items.push({
        key: `rhythm-friday-booking-${showingCase.id}-${world.day}`,
        caseId: showingCase.id,
        title: '周五锁周末带看',
        badge: '周节奏',
        note: '周末前先把客户、经纪人和业主时间对齐，别等到高峰日再临时找人。',
        urgency: 84,
        slot: 'pm',
        source: 'routine',
        weekdayIntent: routine.theme,
        actionId: 'showing',
        opportunityId: showingOpportunity?.id,
      });
    }
  }

  if (dayOfWeek === 6 || dayOfWeek === 7) {
    items.push({
      key: `interrupt-second-showing-${showingCase.id}-${world.day}`,
      caseId: showingCase.id,
      title: showingOpportunity ? '客户突然要求复看' : '周末集中带看',
      badge: showingOpportunity ? '插单事件' : '周节奏',
      note: showingOpportunity
        ? `${showingOpportunity.customerName} 的热度到了周末窗口，先提示冲突，再决定是否挤进今天。`
        : '今天先做带看和真实反馈，优先处理能拿到现场反馈的房源。',
      urgency: showingOpportunity ? 90 : 82,
      slot: 'am',
      source: showingOpportunity ? 'interrupt' : 'routine',
      weekdayIntent: routine.theme,
      actionId: 'showing',
      opportunityId: showingOpportunity?.id,
    });
  }

  const negotiationOpportunity = activeOpportunities.find((entry) => entry.stageIndex >= 3);
  if (negotiationOpportunity && (dayOfWeek === 1 || dayOfWeek >= 5)) {
    const negotiationCase = activeCases.find((entry) => entry.id === negotiationOpportunity.caseId) || anchorCase;
    items.push({
      key: `interrupt-owner-negotiation-${negotiationOpportunity.id}-${world.day}`,
      caseId: negotiationCase.id,
      title: '协助业主去谈判',
      badge: '插单事件',
      note: `${negotiationOpportunity.customerName} 已经接近出价，需要把业主底线、客户反馈和谈判口径放到同一张桌上。`,
      urgency: 89,
      slot: 'pm',
      source: 'interrupt',
      weekdayIntent: routine.theme,
      actionId: 'invite-customer-negotiation',
      opportunityId: negotiationOpportunity.id,
    });
  }

  return items.slice(0, 3);
}

function productRunMilestoneBadge(kind: 'event' | 'light_scene' | 'heavy_scene') {
  if (kind === 'heavy_scene') return '重场景';
  if (kind === 'light_scene') return '轻场景';
  return '普通事件';
}

function productRunMilestoneUrgency(
  kind: 'event' | 'light_scene' | 'heavy_scene',
  currentDay: number,
  milestoneDay: number,
) {
  const dayGap = Math.abs(currentDay - milestoneDay);
  const base = kind === 'heavy_scene' ? 95 : kind === 'light_scene' ? 90 : 84;
  return Math.max(72, base - dayGap * 6);
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
          : `${displayName} 已进入 ${entry.stageLabel}，${formatVisibleDaysLeft(entry.daysLeft)}后可能流失。`,
        caseId: entry.caseId,
      });
    });

  return items.slice(0, 5);
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
