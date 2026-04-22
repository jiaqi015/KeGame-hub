import { Case, GameState, Opportunity } from '../../domain/models';
import { getActiveOpportunities } from '../../domain/engine/opportunityEngine';

export type FollowUpPriorityType = 'owner-risk' | 'competition-risk' | 'closing-opportunity';
export type FollowUpPriorityGroupId = 'ownerRisk' | 'competitionRisk' | 'closingOpportunity';
export type FollowUpPriorityTone = 'risk' | 'chance' | 'neutral';

export type FollowUpPrioritySummary = {
  type: FollowUpPriorityType;
  label: string;
  score: number;
  reason: string;
  shortReason: string;
  metric: string;
};

export interface FollowUpPriorityItemProjection {
  caseId: string;
  caseTitle: string;
  type: FollowUpPriorityType;
  label: string;
  score: number;
  reason: string;
  shortReason: string;
  metric: string;
  tone: FollowUpPriorityTone;
}

export interface FollowUpPriorityGroupProjection {
  id: FollowUpPriorityGroupId;
  label: string;
  summary: string;
  leadCaseId: string | null;
  leadCaseTitle: string | null;
  leadReason: string;
  items: FollowUpPriorityItemProjection[];
}

export interface FollowUpPriorityProjection {
  generatedDay: number;
  topCaseId: string | null;
  topCaseTitle: string | null;
  topReason: string;
  groups: Record<FollowUpPriorityGroupId, FollowUpPriorityGroupProjection>;
}

export function deriveCaseFollowUpPriority(state: GameState, caseItem: Case): FollowUpPrioritySummary {
  const opportunities = getActiveOpportunities(state, caseItem.id);
  const ownerRisk = scoreOwnerRisk(caseItem);
  const competitionRisk = scoreCompetitionRisk(caseItem, opportunities);
  const closingOpportunity = scoreClosingOpportunity(caseItem, opportunities);

  const ranking: FollowUpPrioritySummary[] = [
    buildOwnerRiskSummary(caseItem, ownerRisk),
    buildCompetitionRiskSummary(caseItem, opportunities, competitionRisk),
    buildClosingOpportunitySummary(caseItem, opportunities, closingOpportunity),
  ];

  return ranking.sort((left, right) => right.score - left.score)[0];
}

export function buildFollowUpPriorityProjection(state: GameState): FollowUpPriorityProjection {
  const activeCases = state.cases.filter((entry) => entry.status === 'active');
  const items = activeCases.map((caseItem) => {
    const priority = deriveCaseFollowUpPriority(state, caseItem);

    return {
      caseId: caseItem.id,
      caseTitle: caseItem.title,
      type: priority.type,
      label: priority.label,
      score: priority.score,
      reason: priority.reason,
      shortReason: priority.shortReason,
      metric: priority.metric,
      tone: derivePriorityTone(priority.type),
    } satisfies FollowUpPriorityItemProjection;
  });

  const sorted = items.slice().sort((left, right) => right.score - left.score);
  const groups = {
    ownerRisk: buildPriorityGroup('ownerRisk', '业主关系风险', items.filter((entry) => entry.type === 'owner-risk')),
    competitionRisk: buildPriorityGroup('competitionRisk', '竞争截胡风险', items.filter((entry) => entry.type === 'competition-risk')),
    closingOpportunity: buildPriorityGroup('closingOpportunity', '成交线索', items.filter((entry) => entry.type === 'closing-opportunity')),
  } satisfies Record<FollowUpPriorityGroupId, FollowUpPriorityGroupProjection>;

  return {
    generatedDay: state.day,
    topCaseId: sorted[0]?.caseId || null,
    topCaseTitle: sorted[0]?.caseTitle || null,
    topReason: sorted[0]?.reason || '当前还没有需要单独拎出来的优先房源。',
    groups,
  };
}

export function deriveGroupedPriorities(state: GameState) {
  const projection = buildFollowUpPriorityProjection(state);
  const activeCaseById = new Map(
    state.cases
      .filter((entry) => entry.status === 'active')
      .map((caseItem) => [caseItem.id, caseItem]),
  );

  const toLegacyEntries = (items: FollowUpPriorityItemProjection[]) => items
    .map((item) => {
      const caseItem = activeCaseById.get(item.caseId);
      if (!caseItem) return null;

      return {
        caseItem,
        priority: {
          type: item.type,
          label: item.label,
          score: item.score,
          reason: item.reason,
          shortReason: item.shortReason,
          metric: item.metric,
        } satisfies FollowUpPrioritySummary,
      };
    })
    .filter((entry): entry is { caseItem: Case; priority: FollowUpPrioritySummary } => Boolean(entry));

  return {
    ownerRisk: toLegacyEntries(projection.groups.ownerRisk.items),
    competitionRisk: toLegacyEntries(projection.groups.competitionRisk.items),
    closingOpportunity: toLegacyEntries(projection.groups.closingOpportunity.items),
  };
}

function buildPriorityGroup(
  id: FollowUpPriorityGroupId,
  label: string,
  items: FollowUpPriorityItemProjection[],
): FollowUpPriorityGroupProjection {
  const sorted = items.slice().sort((left, right) => right.score - left.score);
  const lead = sorted[0] || null;

  return {
    id,
    label,
    summary: buildGroupSummary(id, sorted),
    leadCaseId: lead?.caseId || null,
    leadCaseTitle: lead?.caseTitle || null,
    leadReason: lead?.reason || buildEmptyGroupReason(id),
    items: sorted,
  };
}

function buildGroupSummary(id: FollowUpPriorityGroupId, items: FollowUpPriorityItemProjection[]) {
  if (items.length === 0) {
    return buildEmptyGroupReason(id);
  }

  const lead = items[0];
  if (!lead) {
    return buildEmptyGroupReason(id);
  }

  if (items.length === 1) {
    return `${lead.caseTitle} 当前最值得处理。`;
  }

  return `${lead.caseTitle} 领头，另外还有 ${items.length - 1} 套房也在这一组。`;
}

function buildEmptyGroupReason(id: FollowUpPriorityGroupId) {
  if (id === 'ownerRisk') return '当前没有单独突出的业主关系风险。';
  if (id === 'competitionRisk') return '当前没有特别集中的竞争截胡风险。';
  return '当前没有特别突出的高成交机会。';
}

function derivePriorityTone(type: FollowUpPriorityType): FollowUpPriorityTone {
  if (type === 'closing-opportunity') return 'chance';
  if (type === 'owner-risk' || type === 'competition-risk') return 'risk';
  return 'neutral';
}

function scoreOwnerRisk(caseItem: Case) {
  let score = 0;
  if (caseItem.trust <= 45) score += 95;
  else if (caseItem.trust <= 55) score += 70;
  else if (caseItem.trust <= 62) score += 45;

  if (caseItem.patience <= 45) score += 30;
  if (caseItem.lastOwnerTouchedDay >= 3) score += 28;
  if (caseItem.ownerMood?.includes('急') || caseItem.ownerMood?.includes('不满') || caseItem.ownerMood?.includes('焦')) score += 18;
  return score;
}

function scoreCompetitionRisk(caseItem: Case, opportunities: Opportunity[]) {
  let score = 0;
  if (caseItem.windowDays <= 2) score += 100;
  else if (caseItem.windowDays <= 4) score += 72;
  else if (caseItem.windowDays <= 6) score += 42;

  if (caseItem.competitionGroupIds.length > 0) score += 30;
  if (caseItem.storylineState === 'critical') score += 38;
  else if (caseItem.storylineState === 'sliding') score += 24;
  if (!opportunities.length) score += 16;
  return score;
}

function scoreClosingOpportunity(caseItem: Case, opportunities: Opportunity[]) {
  let score = 0;
  const engaged = opportunities.filter((entry) => entry.visibility !== 'shadow');
  const highestStage = engaged.length ? Math.max(...engaged.map((entry) => entry.stageIndex)) : 0;
  const bestIntent = engaged.length ? Math.max(...engaged.map((entry) => entry.intent)) : 0;

  if (highestStage >= 4) score += 100;
  else if (highestStage >= 3) score += 72;
  else if (highestStage >= 2) score += 36;

  if (bestIntent >= 80) score += 24;
  else if (bestIntent >= 65) score += 12;

  if (caseItem.askPrice <= caseItem.marketPrice * 1.03) score += 16;
  return score;
}

function buildOwnerRiskSummary(caseItem: Case, score: number): FollowUpPrioritySummary {
  if (caseItem.trust <= 45) {
    return {
      type: 'owner-risk',
      label: '业主关系风险',
      score,
      reason: `${caseItem.title} 的业主已经不太信你了，今天必须给回应。`,
      shortReason: '业主已经不太信了',
      metric: '今天必须反馈',
    };
  }

  if (caseItem.lastOwnerTouchedDay >= 3) {
    return {
      type: 'owner-risk',
      label: '业主关系风险',
      score,
      reason: `${caseItem.title} 已经 ${caseItem.lastOwnerTouchedDay} 天没给业主反馈，再拖就要问责了。`,
      shortReason: `${caseItem.lastOwnerTouchedDay} 天没反馈`,
      metric: '关系在变冷',
    };
  }

  return {
    type: 'owner-risk',
    label: '业主关系风险',
    score,
    reason: `${caseItem.title} 的业主已经有点不耐烦了，今天要把进展讲清楚。`,
    shortReason: '业主耐心在掉',
    metric: caseItem.patience <= 45 ? '今天要稳住业主' : '尽快补一次反馈',
  };
}

function buildCompetitionRiskSummary(caseItem: Case, opportunities: Opportunity[], score: number): FollowUpPrioritySummary {
  if (caseItem.windowDays <= 2) {
    return {
      type: 'competition-risk',
      label: '竞争截胡风险',
      score,
      reason: `${caseItem.title} 只剩 ${caseItem.windowDays} 天窗口，再慢就容易被别人抢走。`,
      shortReason: `只剩 ${caseItem.windowDays} 天`,
      metric: '今天要抢时间',
    };
  }

  if (caseItem.competitionGroupIds.length > 0) {
    return {
      type: 'competition-risk',
      label: '竞争截胡风险',
      score,
      reason: `${caseItem.title} 已经被同类房拿去比较了，客户很容易被分走。`,
      shortReason: '同类房在抢客户',
      metric: `${caseItem.competitionGroupIds.length} 组同类房在场`,
    };
  }

  return {
    type: 'competition-risk',
    label: '竞争截胡风险',
    score,
    reason: `${caseItem.title} 现在承接不够，竞争一上来就容易掉队。`,
    shortReason: opportunities.length === 0 ? '现在没客户接上' : '这套房在走弱',
    metric: opportunities.length === 0 ? '先补客户' : caseItem.storylineState === 'critical' ? '已经很危险' : '今天要补动作',
  };
}

function buildClosingOpportunitySummary(caseItem: Case, opportunities: Opportunity[], score: number): FollowUpPrioritySummary {
  const engaged = opportunities.filter((entry) => entry.visibility !== 'shadow');
  const best = engaged
    .slice()
    .sort((left, right) => (right.stageIndex + right.intent / 100) - (left.stageIndex + left.intent / 100))[0];

  if (best?.stageIndex >= 3) {
    return {
      type: 'closing-opportunity',
      label: '成交线索',
      score,
      reason: `${caseItem.title} 已经有客户走到 ${best.stageLabel}，这套房有机会尽快成交。`,
      shortReason: `客户已到${best.stageLabel}`,
      metric: best.intent >= 80 ? '客户意向很高' : '客户意向在升',
    };
  }

  return {
    type: 'closing-opportunity',
    label: '成交线索',
    score,
    reason: `${caseItem.title} 已经开始往成交走了，继续推容易出结果。`,
    shortReason: '这套房在起量',
    metric: caseItem.askPrice <= caseItem.marketPrice * 1.03 ? '价格还能谈' : '离成交不远',
  };
}
