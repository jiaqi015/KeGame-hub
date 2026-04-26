import type { GameState, MatterEntry, Opportunity, PriorityEntry, ScheduleEntry } from './models.js';

function buildScheduleMatter(world: GameState, entry: ScheduleEntry): MatterEntry {
  return {
    id: `matter-schedule-${entry.key}`,
    source: 'schedule',
    sourceKey: entry.key,
    caseId: entry.caseId,
    scene: 'risk_followup',
    lifecycleCategory: 'diagnose',
    title: entry.title,
    detail: entry.note,
    badge: entry.badge,
    stage: 'pending',
    template: 'schedule',
    presentation: 'inline-card',
    kind: 'case',
    urgency: entry.urgency,
    openedAtDay: world.day,
    updatedAtDay: world.day,
  };
}

function buildPriorityMatter(world: GameState, entry: PriorityEntry): MatterEntry {
  return {
    id: `matter-priority-${entry.key}`,
    source: 'priority',
    sourceKey: entry.key,
    caseId: entry.caseId,
    scene: entry.kind === 'opportunity' ? 'client_call' : 'report_to_owner',
    lifecycleCategory: 'report',
    title: entry.title,
    detail: entry.detail,
    stage: 'pending',
    template: entry.kind === 'opportunity' ? 'dialog' : 'form',
    presentation: 'inline-card',
    kind: entry.kind,
    urgency: entry.kind === 'opportunity' ? 72 : 84,
    openedAtDay: world.day,
    updatedAtDay: world.day,
  };
}

function buildNegotiationMatter(world: GameState, opportunity: Opportunity): MatterEntry {
  const caseItem = world.cases.find((entry) => entry.id === opportunity.caseId);
  const caseTitle = caseItem?.title || '房源';
  const strategyLabel = opportunity.pendingClosingStrategyId === 'close'
    ? '快成交'
    : opportunity.pendingClosingStrategyId === 'hold'
      ? '守价格'
      : '平衡谈';

  return {
    id: `matter-negotiation-${opportunity.id}`,
    source: 'negotiation',
    sourceKey: opportunity.id,
    caseId: opportunity.caseId,
    scene: 'negotiation',
    lifecycleCategory: 'negotiate',
    title: `${opportunity.customerName} 在桌上逼单了`,
    detail: `${caseTitle} 到了最后咬价格的阶段，目前咱们定的是“${strategyLabel}”的策略，就看今晚这局能不能按住。`,
    badge: `${opportunity.stageLabel}`,
    stage: 'pending',
    template: 'dialog',
    presentation: 'detail-page',
    kind: 'opportunity',
    urgency: 92,
    openedAtDay: world.day,
    updatedAtDay: world.day,
  };
}

function markResolvedMatter(existing: MatterEntry, worldDay: number): MatterEntry {
  const defaultResolutionSummary = existing.source === 'negotiation'
    ? '桌上的价格谈判已经告一段落了。'
    : '这事儿今天算是翻篇了。';

  if (existing.stage === 'completed' || existing.stage === 'abandoned') {
    return {
      ...existing,
      updatedAtDay: worldDay,
      resolvedAtDay: existing.resolvedAtDay ?? worldDay,
    };
  }

  return {
    ...existing,
    stage: 'completed',
    updatedAtDay: worldDay,
    resolvedAtDay: worldDay,
    resolutionSummary: existing.resolutionSummary || defaultResolutionSummary,
  };
}

export function deriveMatters(world: GameState): MatterEntry[] {
  const nextEntries = [
    ...world.schedule.map((entry) => buildScheduleMatter(world, entry)),
    ...world.priorities.map((entry) => buildPriorityMatter(world, entry)),
    ...world.opportunities
      .filter((entry) => entry.status === 'active' && entry.pendingClosingEvaluation)
      .map((entry) => buildNegotiationMatter(world, entry)),
  ];

  const previousById = new Map(world.matters.map((entry) => [entry.id, entry] as const));
  const nextById = new Map(nextEntries.map((entry) => [entry.id, entry] as const));

  const merged = nextEntries.map((entry) => {
    const existing = previousById.get(entry.id);
    if (!existing) {
      return entry;
    }

    return {
      ...entry,
      stage: existing.stage,
      openedAtDay: existing.openedAtDay,
      updatedAtDay: world.day,
      resolvedAtDay: existing.resolvedAtDay,
      resolutionSummary: existing.resolutionSummary,
    };
  });

  const resolved = world.matters
    .filter((entry) => !nextById.has(entry.id))
    .map((entry) => markResolvedMatter(entry, world.day));

  return [...merged, ...resolved]
    .sort((left, right) => {
      const leftResolved = left.stage === 'completed' || left.stage === 'abandoned';
      const rightResolved = right.stage === 'completed' || right.stage === 'abandoned';
      if (leftResolved !== rightResolved) {
        return leftResolved ? 1 : -1;
      }
      return (right.urgency || 0) - (left.urgency || 0);
    })
    .slice(0, 20);
}
