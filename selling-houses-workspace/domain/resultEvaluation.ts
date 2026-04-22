import type {
  Case,
  CaseFinalResult,
  DomainEventEntry,
  DefenseOutcome,
  FinalResult,
  GameState,
  GoalContextId,
  GoalTier,
  ListingEndingBucket,
  ListingEndingType,
  ListingRelativeOutcome,
  OwnerSatisfactionState,
  ScoreAttribution,
  ScoreAttributionItem,
  ScoreDimensionResult,
} from './models.js';
import { getPromotionBudget, resolveFormalSoldCount } from './runtimeStats.js';

const ABILITY_ACTION_IDS = new Set([
  'story',
  'xiaohongshu-boost',
  'broker-broadcast',
  'private-referral',
  'open-day',
  'showing',
  'sincerity-sale',
  'invite-customer-negotiation',
  'deep-diagnosis',
]);

const OWNER_RELATION_ACTION_IDS = new Set([
  'first-visit',
  'weekly-feedback',
  'deep-diagnosis',
  'pricing-advice',
  'ask-psychological-price',
  'adjust-listing-price',
]);

type AttributionSummary = {
  actionCounts: Record<string, number>;
  kindCounts: Record<DomainEventEntry['kind'], number>;
  opportunityAdvancedCount: number;
  opportunityClosedCount: number;
  caseSoldCount: number;
  caseWithdrawnCount: number;
  caseLostToRivalCount: number;
  windowExtendedCount: number;
  marketEventCount: number;
  journalCount: number;
};

const ACTION_LABELS: Record<string, string> = {
  'first-visit': '首次面访',
  'weekly-feedback': '周度反馈',
  'deep-diagnosis': '深度诊断',
  story: '精修卖点',
  'xiaohongshu-boost': '小红书推广',
  'broker-broadcast': '经纪人投放',
  'private-referral': '私域转介绍',
  'open-day': '开放日',
  showing: '安排带看',
  'pricing-advice': '价格沟通',
  'ask-psychological-price': '询问心理价',
  'adjust-listing-price': '商讨挂牌价调整',
  'sincerity-sale': '推进诚意卖',
  'invite-customer-negotiation': '邀请和客户谈判',
};

const EVENT_LABELS: Partial<Record<DomainEventEntry['kind'], string>> = {
  opportunity_advanced: '客户阶段升格',
  opportunity_closed: '客户机会结束',
  case_sold: '房源成交',
  case_withdrawn: '房源核销',
  case_lost_to_rival: '他处成交',
  window_extended: '争取到继续推进',
  market_event: '市场事件',
  budget_changed: '推广金变化',
};

function clampScore(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeGoalTier(goalTier: GoalTier) {
  if (goalTier === 'core') return 1;
  if (goalTier === 'important') return 0.7;
  return 0.4;
}

function resolveRelativeOutcome(caseItem: Case): ListingRelativeOutcome {
  const spread = caseItem.askPrice - caseItem.marketPrice;
  if (caseItem.status === 'sold') {
    if ((caseItem.soldPrice || caseItem.askPrice) >= caseItem.marketPrice * 0.985) {
      return 'outrun';
    }
    if ((caseItem.soldPrice || caseItem.askPrice) >= caseItem.marketPrice * 0.95) {
      return 'flat';
    }
    return 'lose';
  }

  if (caseItem.status === 'withdrawn' || caseItem.status === 'lost_to_rival') {
    return 'lose';
  }

  if (caseItem.trust >= 64 && caseItem.windowDays >= 4 && spread <= Math.max(18, caseItem.marketPrice * 0.03)) {
    return 'flat';
  }

  if (caseItem.trust >= 72 && caseItem.competitiveness >= 70 && caseItem.offers > 0) {
    return 'outrun';
  }

  return 'lose';
}

function resolveDefenseOutcome(caseItem: Case): DefenseOutcome {
  if (caseItem.defenseOutcome === 'lost_to_rival') {
    return 'lost_to_rival';
  }
  if (caseItem.status === 'sold') {
    return 'held';
  }
  if (caseItem.status === 'lost_to_rival') {
    return 'lost_to_rival';
  }
  if (caseItem.status === 'withdrawn') {
    return 'withdrawn';
  }
  if (caseItem.windowDays <= 3 || caseItem.trust <= 50) {
    return 'at_risk';
  }
  return 'held';
}

function resolveOwnerSatisfaction(caseItem: Case): OwnerSatisfactionState {
  if (caseItem.ownerSatisfaction) {
    return caseItem.ownerSatisfaction;
  }

  if (caseItem.status === 'sold') {
    if (caseItem.trust >= 76 && (caseItem.soldPrice || 0) >= caseItem.marketPrice * 0.97) {
      return 'happy';
    }
    if (caseItem.trust >= 62) {
      return 'neutral';
    }
    return 'regret';
  }

  if (caseItem.status === 'lost_to_rival') {
    return caseItem.trust <= 50 ? 'unhappy' : 'regret';
  }
  if (caseItem.status === 'withdrawn') {
    return caseItem.trust <= 50 ? 'unhappy' : 'regret';
  }

  if (caseItem.trust >= 66 && caseItem.windowDays >= 4) {
    return 'no_regret';
  }
  if (caseItem.trust >= 56) {
    return 'neutral';
  }
  if (caseItem.trust >= 45) {
    return 'regret';
  }
  return 'unhappy';
}

function resolveEndingType(
  caseItem: Case,
  relativeOutcome: ListingRelativeOutcome,
  satisfaction: OwnerSatisfactionState,
  defenseOutcome: DefenseOutcome,
): ListingEndingType {
  if (caseItem.endingType) {
    return caseItem.endingType;
  }

  if (caseItem.status === 'sold') {
    if (satisfaction === 'happy') return 'sold_by_you_happy';
    if (satisfaction === 'neutral' || satisfaction === 'no_regret') return 'sold_by_you_neutral';
    return 'sold_by_you_regret';
  }

  if (defenseOutcome === 'lost_to_rival') {
    return 'sold_by_other';
  }

  if (caseItem.status === 'withdrawn') {
    return 'withdrawn_unhappy';
  }

  if (satisfaction === 'no_regret' || satisfaction === 'neutral') {
    return 'not_sold_no_regret';
  }

  return 'not_sold_regret';
}

function endingBucket(endingType: ListingEndingType): ListingEndingBucket {
  switch (endingType) {
    case 'sold_by_you_happy':
    case 'sold_by_you_neutral':
    case 'not_sold_no_regret':
    case 'switch_to_rent_no_regret':
      return 'good';
    case 'sold_by_you_regret':
    case 'not_sold_regret':
      return 'neutral';
    case 'sold_by_other':
    case 'withdrawn_unhappy':
      return 'bad';
  }
}

function endingBucketLabel(bucket: ListingEndingBucket) {
  if (bucket === 'good') return '结果不错';
  if (bucket === 'neutral') return '结果一般';
  return '结果较差';
}

function endingLabel(endingType: ListingEndingType) {
  switch (endingType) {
    case 'sold_by_you_happy':
      return '卖掉了，很满意';
    case 'sold_by_you_neutral':
      return '卖掉了，无感';
    case 'sold_by_you_regret':
      return '卖掉了，但体验不好';
    case 'sold_by_other':
      return '被别家卖掉了';
    case 'not_sold_no_regret':
      return '没卖掉，但不后悔';
    case 'not_sold_regret':
      return '没卖掉，开始后悔';
    case 'switch_to_rent_no_regret':
      return '不卖了，转租也能接受';
    case 'withdrawn_unhappy':
      return '彻底做崩了';
  }
}

function relativeLabel(outcome: ListingRelativeOutcome) {
  if (outcome === 'outrun') return '比同类房表现更好';
  if (outcome === 'flat') return '和同类房差不多';
  return '比同类房表现更差';
}

function satisfactionLabel(state: OwnerSatisfactionState) {
  if (state === 'happy') return '满意';
  if (state === 'neutral') return '无感';
  if (state === 'no_regret') return '不后悔';
  if (state === 'regret') return '后悔';
  return '不满';
}

function defenseLabel(outcome: DefenseOutcome) {
  if (outcome === 'held') return '留在自己手里';
  if (outcome === 'at_risk') return '局末高危';
  if (outcome === 'lost_to_rival') return '他处成交';
  return '已核销';
}

function buildEndingSummary(caseItem: Case, endingType: ListingEndingType) {
  switch (endingType) {
    case 'sold_by_you_happy':
      return `${caseItem.title} 最终由你顺利卖掉，业主对结果和过程都认可。`;
    case 'sold_by_you_neutral':
      return `${caseItem.title} 最终卖掉了，业主接受结果，但情绪不算特别高。`;
    case 'sold_by_you_regret':
      return `${caseItem.title} 虽然成交了，但业主对过程和体验并不满意。`;
    case 'sold_by_other':
      return `${caseItem.title} 最终没守住，机会被别人拿走了。`;
    case 'not_sold_no_regret':
      return `${caseItem.title} 这局没卖掉，但至少没有让业主后悔。`;
    case 'not_sold_regret':
      return `${caseItem.title} 没卖掉，业主也开始怀疑这轮跟进值不值得。`;
    case 'switch_to_rent_no_regret':
      return `${caseItem.title} 没按卖房走到底，但最后换成转租也还算体面。`;
    case 'withdrawn_unhappy':
      return `${caseItem.title} 最终核销，而且收尾并不体面。`;
  }
}

function buildCaseFinalResult(caseItem: Case): CaseFinalResult {
  const relativeOutcome = resolveRelativeOutcome(caseItem);
  const defenseOutcome = resolveDefenseOutcome(caseItem);
  const ownerSatisfaction = resolveOwnerSatisfaction(caseItem);
  const endingType = resolveEndingType(caseItem, relativeOutcome, ownerSatisfaction, defenseOutcome);
  const bucket = caseItem.endingBucket || endingBucket(endingType);
  const endingSummary = buildEndingSummary(caseItem, endingType);

  return {
    caseId: caseItem.id,
    title: caseItem.title,
    ownerName: caseItem.ownerName,
    community: caseItem.community,
    status: caseItem.status,
    goalTier: caseItem.goalTier,
    endingType,
    endingBucket: bucket,
    endingBucketLabel: endingBucketLabel(bucket),
    endingLabel: endingLabel(endingType),
    endingSummary,
    relativeOutcome,
    relativeOutcomeLabel: relativeLabel(relativeOutcome),
    ownerSatisfaction,
    ownerSatisfactionLabel: satisfactionLabel(ownerSatisfaction),
    defenseOutcome,
    defenseOutcomeLabel: defenseLabel(defenseOutcome),
    soldPrice: caseItem.soldPrice,
    finalTrust: Math.round(caseItem.trust),
    finalCompetitiveness: Math.round(caseItem.competitiveness),
    remainingWindowDays: caseItem.windowDays,
  };
}

function readString(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === 'string' ? payload[key] : null;
}

function countActions(attribution: AttributionSummary, actionIds: Set<string>) {
  return Object.entries(attribution.actionCounts).reduce((sum, [actionId, count]) => {
    return sum + (actionIds.has(actionId) ? count : 0);
  }, 0);
}

function topActionItems(
  attribution: AttributionSummary,
  actionIds: Set<string>,
  tone: ScoreAttributionItem['tone'] = 'positive',
) {
  return Object.entries(attribution.actionCounts)
    .filter(([actionId]) => actionIds.has(actionId))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([actionId, count]) => ({
      key: `action-${actionId}`,
      label: ACTION_LABELS[actionId] || actionId,
      count,
      tone,
    }));
}

function compactEventItems(
  items: Array<ScoreAttributionItem | null>,
) {
  return items.filter((entry): entry is ScoreAttributionItem => Boolean(entry && entry.count > 0));
}

function eventItem(
  key: DomainEventEntry['kind'],
  count: number,
  tone: ScoreAttributionItem['tone'],
  label = EVENT_LABELS[key] || key,
): ScoreAttributionItem | null {
  if (count <= 0) return null;
  return {
    key: `event-${key}`,
    label,
    count,
    tone,
  };
}

function buildAttributionSummary(events: DomainEventEntry[]): AttributionSummary {
  const summary: AttributionSummary = {
    actionCounts: {},
    kindCounts: {
      journal: 0,
      action_executed: 0,
      budget_changed: 0,
      opportunity_advanced: 0,
      opportunity_closed: 0,
      case_sold: 0,
      case_withdrawn: 0,
      case_lost_to_rival: 0,
      window_extended: 0,
      market_event: 0,
    },
    opportunityAdvancedCount: 0,
    opportunityClosedCount: 0,
    caseSoldCount: 0,
    caseWithdrawnCount: 0,
    caseLostToRivalCount: 0,
    windowExtendedCount: 0,
    marketEventCount: 0,
    journalCount: 0,
  };

  events.forEach((event) => {
    summary.kindCounts[event.kind] = (summary.kindCounts[event.kind] || 0) + 1;
    if (event.kind === 'action_executed') {
      const actionId = readString(event.payload, 'actionId');
      if (actionId) {
        summary.actionCounts[actionId] = (summary.actionCounts[actionId] || 0) + 1;
      }
      return;
    }
    if (event.kind === 'opportunity_advanced') {
      summary.opportunityAdvancedCount += 1;
      return;
    }
    if (event.kind === 'opportunity_closed') {
      summary.opportunityClosedCount += 1;
      return;
    }
    if (event.kind === 'case_sold') {
      summary.caseSoldCount += 1;
      return;
    }
    if (event.kind === 'case_withdrawn') {
      summary.caseWithdrawnCount += 1;
      return;
    }
    if (event.kind === 'case_lost_to_rival') {
      summary.caseLostToRivalCount += 1;
      return;
    }
    if (event.kind === 'window_extended') {
      summary.windowExtendedCount += 1;
      return;
    }
    if (event.kind === 'market_event') {
      summary.marketEventCount += 1;
      return;
    }
    if (event.kind === 'journal') {
      summary.journalCount += 1;
    }
  });

  return summary;
}

function buildAbilityAttribution(attribution: AttributionSummary): ScoreAttribution {
  const abilityActionCount = countActions(attribution, ABILITY_ACTION_IDS);
  return {
    headline: abilityActionCount > 0 || attribution.opportunityAdvancedCount > 0 || attribution.caseSoldCount > 0
      ? `${abilityActionCount} 次关键推进动作，${attribution.opportunityAdvancedCount} 次客户阶段升格，${attribution.caseSoldCount} 套成交。`
      : '这局缺少可归因的推进动作，能力分主要来自最终房源状态。',
    actions: topActionItems(attribution, ABILITY_ACTION_IDS),
    events: compactEventItems([
      eventItem('opportunity_advanced', attribution.opportunityAdvancedCount, 'positive'),
      eventItem('case_sold', attribution.caseSoldCount, 'positive'),
      eventItem('market_event', attribution.marketEventCount, 'neutral'),
    ]),
  };
}

function buildDefenseAttribution(attribution: AttributionSummary): ScoreAttribution {
  const defenseActionCount = countActions(attribution, OWNER_RELATION_ACTION_IDS);
  return {
    headline: attribution.caseLostToRivalCount > 0 || attribution.caseWithdrawnCount > 0
      ? `${defenseActionCount} 次守盘动作后，仍有 ${attribution.caseLostToRivalCount} 次他处成交、${attribution.caseWithdrawnCount} 次核销。`
      : `${defenseActionCount} 次守盘动作，争取到 ${attribution.windowExtendedCount} 次继续推进的机会，关键房源留在自己手里。`,
    actions: topActionItems(attribution, OWNER_RELATION_ACTION_IDS),
    events: compactEventItems([
      eventItem('window_extended', attribution.windowExtendedCount, 'positive'),
      eventItem('case_lost_to_rival', attribution.caseLostToRivalCount, 'warning'),
      eventItem('case_withdrawn', attribution.caseWithdrawnCount, 'warning'),
    ]),
  };
}

function buildSatisfactionAttribution(attribution: AttributionSummary): ScoreAttribution {
  const ownerActionCount = countActions(attribution, OWNER_RELATION_ACTION_IDS);
  return {
    headline: ownerActionCount > 0
      ? `${ownerActionCount} 次业主沟通动作沉淀到满意分。`
      : '这局缺少可归因的业主沟通动作，满意分主要来自最终信任与收尾状态。',
    actions: topActionItems(attribution, OWNER_RELATION_ACTION_IDS),
    events: compactEventItems([
      eventItem('case_sold', attribution.caseSoldCount, 'positive', '成交收尾'),
      eventItem('case_withdrawn', attribution.caseWithdrawnCount, 'warning', '核销收尾'),
      eventItem('case_lost_to_rival', attribution.caseLostToRivalCount, 'warning', '他处成交'),
    ]),
  };
}

function buildAbilityDimension(caseResults: CaseFinalResult[], attribution: AttributionSummary): ScoreDimensionResult {
  const totalWeight = caseResults.reduce((sum, entry) => sum + normalizeGoalTier(entry.goalTier), 0) || 1;
  const weightedScore = caseResults.reduce((sum, entry) => {
    const base = entry.relativeOutcome === 'outrun' ? 1 : entry.relativeOutcome === 'flat' ? 0.65 : 0.2;
    const finishModifier = entry.endingBucket === 'good'
      ? 1.05
      : entry.endingBucket === 'bad'
        ? 0.75
        : 1;
    return sum + normalizeGoalTier(entry.goalTier) * base * finishModifier;
  }, 0);
  const score = clampScore(Math.round((weightedScore / totalWeight) * 40), 0, 40);
  const outrunCount = caseResults.filter((entry) => entry.relativeOutcome === 'outrun').length;
  const loseCount = caseResults.filter((entry) => entry.relativeOutcome === 'lose').length;
  const abilityActionCount = countActions(attribution, ABILITY_ACTION_IDS);
  return {
    label: '能力分',
    score,
    maxScore: 40,
    summary: abilityActionCount > 0 || attribution.opportunityAdvancedCount > 0 || attribution.caseSoldCount > 0
      ? `本局做了 ${abilityActionCount} 次关键推进动作，带来 ${attribution.opportunityAdvancedCount} 次客户阶段升格，最终成交 ${attribution.caseSoldCount} 套。`
      : loseCount === 0
        ? `这局大多数房都没被市场压住，尤其有 ${outrunCount} 套房明显比同类房表现更好。`
        : `这局有 ${outrunCount} 套房表现比同类房更好，也有 ${loseCount} 套房被市场拖住了。`,
    attribution: buildAbilityAttribution(attribution),
  };
}

function buildDefenseDimension(caseResults: CaseFinalResult[], attribution: AttributionSummary): ScoreDimensionResult {
  const totalWeight = caseResults.reduce((sum, entry) => sum + normalizeGoalTier(entry.goalTier), 0) || 1;
  const weightedScore = caseResults.reduce((sum, entry) => {
    const value = entry.defenseOutcome === 'held'
      ? 1
      : entry.defenseOutcome === 'at_risk'
        ? 0.45
        : 0;
    return sum + normalizeGoalTier(entry.goalTier) * value;
  }, 0);
  const score = clampScore(Math.round((weightedScore / totalWeight) * 35), 0, 35);
  const lostCore = caseResults.some((entry) => entry.goalTier === 'core' && entry.defenseOutcome === 'lost_to_rival');
  const lostCount = caseResults.filter((entry) => entry.defenseOutcome === 'lost_to_rival').length;
  const defenseActionCount = countActions(attribution, OWNER_RELATION_ACTION_IDS);
  return {
    label: '保住房源分',
    score,
    maxScore: 35,
    summary: lostCore
      ? '这局最伤的是最重要的房没留在自己手里，这一项被直接拉低了。'
      : attribution.caseLostToRivalCount > 0 || attribution.caseWithdrawnCount > 0
        ? `本局做了 ${defenseActionCount} 次关键守盘动作，但仍出现 ${attribution.caseLostToRivalCount} 次他处成交、${attribution.caseWithdrawnCount} 次核销。`
        : attribution.windowExtendedCount > 0
          ? `本局做了 ${defenseActionCount} 次关键守盘动作，并换来了 ${attribution.windowExtendedCount} 次继续推进的缓冲。`
          : lostCount > 0
            ? `有 ${lostCount} 套房最后被别人抢走，说明资源分配还不够果断。`
            : '商圈聚焦房基本都留在自己手里，这一项是过关的。',
    attribution: buildDefenseAttribution(attribution),
  };
}

function buildSatisfactionDimension(caseResults: CaseFinalResult[], attribution: AttributionSummary): ScoreDimensionResult {
  const totalWeight = caseResults.reduce((sum, entry) => sum + normalizeGoalTier(entry.goalTier), 0) || 1;
  const weightedScore = caseResults.reduce((sum, entry) => {
    const value = entry.ownerSatisfaction === 'happy'
      ? 1
      : entry.ownerSatisfaction === 'neutral'
        ? 0.75
        : entry.ownerSatisfaction === 'no_regret'
          ? 0.65
          : entry.ownerSatisfaction === 'regret'
            ? 0.3
            : 0;
    return sum + normalizeGoalTier(entry.goalTier) * value;
  }, 0);
  const score = clampScore(Math.round((weightedScore / totalWeight) * 25), 0, 25);
  const unhappyCount = caseResults.filter((entry) => entry.ownerSatisfaction === 'unhappy').length;
  const happyCount = caseResults.filter((entry) => entry.ownerSatisfaction === 'happy').length;
  const ownerActionCount = countActions(attribution, OWNER_RELATION_ACTION_IDS);
  return {
    label: '满意分',
    score,
    maxScore: 25,
    summary: ownerActionCount > 0
      ? unhappyCount > 0
        ? `本局做了 ${ownerActionCount} 次业主沟通动作，但仍有 ${unhappyCount} 套房最后明显做出了不满。`
        : `本局做了 ${ownerActionCount} 次业主沟通动作，最终有 ${happyCount} 套房收成了真正的满意。`
      : `这局至少有 ${happyCount} 套房收成了真正的满意，其余大多没有做后悔。`,
    attribution: buildSatisfactionAttribution(attribution),
  };
}

function buildEndingStats(caseResults: CaseFinalResult[]): FinalResult['endingStats'] {
  const weightedGood = caseResults.reduce((sum, entry) => {
    return sum + (entry.endingBucket === 'good' ? normalizeGoalTier(entry.goalTier) : 0);
  }, 0);
  const weightedBad = caseResults.reduce((sum, entry) => {
    return sum + (entry.endingBucket === 'bad' ? normalizeGoalTier(entry.goalTier) : 0);
  }, 0);

  return {
    good: caseResults.filter((entry) => entry.endingBucket === 'good').length,
    neutral: caseResults.filter((entry) => entry.endingBucket === 'neutral').length,
    bad: caseResults.filter((entry) => entry.endingBucket === 'bad').length,
    coreBadCount: caseResults.filter((entry) => entry.goalTier === 'core' && entry.endingBucket === 'bad').length,
    importantBadCount: caseResults.filter((entry) => entry.goalTier === 'important' && entry.endingBucket === 'bad').length,
    weightedGood: Math.round(weightedGood * 10) / 10,
    weightedBad: Math.round(weightedBad * 10) / 10,
  };
}

function buildEndingStructureSummary(endingStats: FinalResult['endingStats']) {
  if (endingStats.coreBadCount > 0) {
    return `结果分布：${endingStats.good} 套结果不错、${endingStats.neutral} 套结果一般、${endingStats.bad} 套结果较差，最伤的是核心房出了差结果。`;
  }
  if (endingStats.bad > 0) {
    return `结果分布：${endingStats.good} 套结果不错、${endingStats.neutral} 套结果一般、${endingStats.bad} 套结果较差，问题主要出在被别人抢走和结尾做差了。`;
  }
  return `结果分布：${endingStats.good} 套结果不错、${endingStats.neutral} 套结果一般，没有明显差结果。`;
}

function deriveGrade(score: number, thresholds: { pass: number; strong: number; ace: number }) {
  if (score >= thresholds.ace) {
    return { grade: '王牌', title: '这局你真的把房子卖顺了' };
  }
  if (score >= thresholds.strong) {
    return { grade: '漂亮', title: '这局基本是你在带着节奏走' };
  }
  if (score >= thresholds.pass) {
    return { grade: '过线', title: '至少把最关键的部分撑住了' };
  }
  return { grade: '没保住', title: '这局还是没能把情况扳回来' };
}

function deriveGoalSummary(goalContext: GoalContextId) {
  if (goalContext === 'defense') return '这局主要看你能不能把商圈聚焦房留在自己手里，你最怕的不是少卖，而是被别人抢走。';
  if (goalContext === 'satisfaction') return '这局主看满意，重点是别把业主关系和体验做崩。';
  return '这局主看能力，重点是把这些房子做得比同类房更好卖。';
}

function buildHighlights(
  caseResults: CaseFinalResult[],
  dimensions: FinalResult['dimensions'],
  endingStats: FinalResult['endingStats'],
) {
  const highlights: string[] = [];
  const happySolds = caseResults.filter((entry) => entry.endingType === 'sold_by_you_happy');
  if (happySolds.length > 0) {
    highlights.push(`这局至少有 ${happySolds.length} 套房做到了“卖掉了，很满意”，说明你不是只会硬推成交。`);
  }
  if (endingStats.good > 0 && endingStats.bad === 0) {
    highlights.push(`整局有 ${endingStats.good} 套房结果不错，没有房源落到差结果，整体算是稳住了。`);
  }
  if (dimensions.defense.score >= 28) {
    highlights.push('商圈聚焦房基本都保住了，没有轻易被别人抢走。');
  }
  if (dimensions.ability.score >= 30) {
    highlights.push('这局不只是有成交，而是多套房都卖得比同类房更顺。');
  }
  if (!highlights.length) {
    highlights.push('至少你把整局完整跑完了，已经不是乱点动作的状态。');
  }
  return highlights;
}

function buildImprovements(
  caseResults: CaseFinalResult[],
  dimensions: FinalResult['dimensions'],
  endingStats: FinalResult['endingStats'],
) {
  const improvements: string[] = [];
  if (endingStats.coreBadCount > 0) {
    improvements.push('最重要的房出现了差结果，下一局要先分清哪套房绝对不能放。');
  }
  if (caseResults.some((entry) => entry.defenseOutcome === 'lost_to_rival')) {
    improvements.push('有房最后被别人抢走，下一局要更早把商圈聚焦房和可以后放的房分开。');
  }
  if (dimensions.satisfaction.score <= 12) {
    improvements.push('满意分偏弱，说明你有些房虽然在往前推，但过程做得不够体面。');
  }
  if (dimensions.ability.score <= 20) {
    improvements.push('能力分偏低，说明这局不少房都没有真正卖过同类房。');
  }
  if (!improvements.length) {
    improvements.push('下一局可以把资源分配拉得更开，别平均用力。');
  }
  return improvements;
}

function buildPromotionNotes(world: GameState) {
  const spentPromotion = world.budgetLedger
    .filter((entry) => entry.kind === 'action-spend')
    .reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
  const weeklyPromotion = world.budgetLedger
    .filter((entry) => entry.kind === 'weekly-allocation')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const rebatePromotion = world.budgetLedger
    .filter((entry) => entry.kind === 'sale-rebate')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const notes: string[] = [];
  if (spentPromotion > 0) {
    notes.push(`本局累计投入推广金 ${spentPromotion} 点，周度补给 ${weeklyPromotion} 点，成交返投 ${rebatePromotion} 点。推广金只解释资源打法，不直接代表这局打得好。`);
  } else {
    notes.push('这局几乎没怎么动推广金，更多是在靠基本经营动作推进。');
  }
  if (getPromotionBudget(world) <= 2) {
    notes.push('局末推广金几乎打空了，说明你在资源排序上还能更克制。');
  } else if (getPromotionBudget(world) >= 8) {
    notes.push('推广金结余比较健康，资源纪律感是在线的。');
  }
  return notes;
}

function buildCoachNotes(caseResults: CaseFinalResult[]) {
  const best = caseResults.find((entry) => entry.endingBucket === 'good') || caseResults[0];
  const risk = [...caseResults].reverse().find((entry) => entry.endingBucket === 'bad') || caseResults[caseResults.length - 1];
  const notes: string[] = [];
  if (best) {
    notes.push(`${best.title} 是这局收尾最完整的一套房，最终落在 ${best.endingLabel}。`);
  }
  if (risk && risk.caseId !== best?.caseId) {
    notes.push(`${risk.title} 是这局损失最大的房源，最终落在 ${risk.endingLabel}。`);
  }
  return notes;
}

function buildNextRunAdvice(caseResults: CaseFinalResult[], dimensions: FinalResult['dimensions']) {
  const advice: string[] = [];
  const coreLossCount = caseResults.filter((entry) => entry.goalTier === 'core' && entry.defenseOutcome !== 'held').length;
  if (coreLossCount > 0) {
    advice.push(`本局有 ${coreLossCount} 套最重要的房没留在自己手里，开局三天怎么分配资源，直接影响后面还能不能救。`);
  }
  if (dimensions.satisfaction.score <= dimensions.ability.score && dimensions.satisfaction.score <= dimensions.defense.score) {
    advice.push('满意分是三轴里最低的一项，说明成交推进和业主体感没有一起被守住。');
  }
  if (dimensions.ability.score < 24) {
    advice.push('能力分偏低，说明有效推进主要集中在少数房源，更多房源停在中间阶段。');
  }
  if (!advice.length) {
    advice.push('三项分数比较接近，这局没有明显单一短板，主要差异来自具体房源收尾。');
  }
  return advice;
}

function buildCustomerReview(world: GameState): FinalResult['customerReview'] {
  const engagedCustomers = world.customerStates.filter((entry) => entry.status === 'engaged' || entry.status === 'negotiating');
  const comparingCustomers = world.customerStates.filter((entry) => entry.status === 'comparing');
  const atRiskCustomers = world.customerStates.filter((entry) => entry.churnRisk >= 60);
  const rivalPulled = world.customerStates.filter((entry) => entry.lastActionNote?.includes('竞品')).length;

  const strongestCaseTitle = pickCustomerLeadCaseTitle(world, (entry) =>
    Object.values(entry.caseStates).some((caseState) => caseState.selected),
  );
  const mostComparedCaseTitle = pickCustomerLeadCaseTitle(world, (entry) => entry.status === 'comparing');
  const mostAtRiskCaseTitle = pickCustomerLeadCaseTitle(world, (entry) => entry.churnRisk >= 60);

  const notes: string[] = [];
  if (strongestCaseTitle) {
    notes.push(`${strongestCaseTitle} 是局末客户最愿意继续往前走的一套房。`);
  }
  if (mostComparedCaseTitle) {
    notes.push(`${mostComparedCaseTitle} 最常被客户拿去和别的盘比较，这套房最要统一价格和讲法。`);
  }
  if (mostAtRiskCaseTitle) {
    notes.push(`${mostAtRiskCaseTitle} 挂着最多容易掉线的客户，最后几步最容易掉。`);
  }
  if (rivalPulled > 0) {
    notes.push(`这局有 ${rivalPulled} 位客户一度被同类房抢走注意力。`);
  }
  if (!notes.length) {
    notes.push('这局客户推进不算厚，后面可以更早把首选客户往后几步推。');
  }

  const summary = comparingCustomers.length > 0
    ? `局末还有 ${comparingCustomers.length} 位客户在比盘，先稳住首选房，再谈最后一口价。`
    : atRiskCustomers.length > 0
      ? `局末有 ${atRiskCustomers.length} 位客户在掉线边缘，说明最后阶段的承接还不够稳。`
      : engagedCustomers.length > 0
        ? `局末还有 ${engagedCustomers.length} 位客户在推进，说明客户线没有断。`
        : '局末客户面偏薄，下一局要更早把客户线做厚。';

  return {
    engaged: engagedCustomers.length,
    comparing: comparingCustomers.length,
    atRisk: atRiskCustomers.length,
    rivalPulled,
    strongestCaseTitle,
    mostComparedCaseTitle,
    mostAtRiskCaseTitle,
    summary,
    notes,
  };
}

function getClosedDealCount(world: GameState) {
  return resolveFormalSoldCount(world);
}

function pickCustomerLeadCaseTitle(
  world: GameState,
  predicate: (entry: GameState['customerStates'][number]) => boolean,
) {
  const counts = new Map<string, number>();

  world.customerStates
    .filter(predicate)
    .forEach((entry) => {
      const selectedCaseId = Object.values(entry.caseStates).find((caseState) => caseState.selected)?.caseId
        || entry.activeCaseIds[0];
      if (!selectedCaseId) return;
      counts.set(selectedCaseId, (counts.get(selectedCaseId) || 0) + 1);
    });

  const leadCaseId = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])[0]?.[0];

  return world.cases.find((entry) => entry.id === leadCaseId)?.title || null;
}

export function evaluateFinalResult(world: GameState, reason: string): FinalResult {
  const attribution = buildAttributionSummary(Array.isArray(world.eventStore) ? world.eventStore : []);
  const caseResults = world.cases.map((caseItem) => buildCaseFinalResult(caseItem));
  const closedDealCount = getClosedDealCount(world);
  const endingStats = buildEndingStats(caseResults);
  const ability = buildAbilityDimension(caseResults, attribution);
  const defense = buildDefenseDimension(caseResults, attribution);
  const satisfaction = buildSatisfactionDimension(caseResults, attribution);
  const customerReview = buildCustomerReview(world);
  const score = ability.score + defense.score + satisfaction.score;
  const targetScore = world.runContext.scenarioSnapshot.scenario.targetScore || 72;
  const thresholds = world.runContext.scenarioSnapshot.scenario.scoreThresholds || {
    pass: Math.max(42, targetScore - 12),
    strong: Math.min(94, targetScore + 12),
    ace: Math.min(98, targetScore + 20),
  };
  const goalContext = world.runContext.scenarioSnapshot.scenario.goalContext || 'ability';
  const gradeInfo = deriveGrade(score, thresholds);

  const scoreBreakdown = [
    { label: ability.label, value: ability.score, maxValue: ability.maxScore, summary: ability.summary, attribution: ability.attribution },
    { label: defense.label, value: defense.score, maxValue: defense.maxScore, summary: defense.summary, attribution: defense.attribution },
    { label: satisfaction.label, value: satisfaction.score, maxValue: satisfaction.maxScore, summary: satisfaction.summary, attribution: satisfaction.attribution },
  ];

  return {
    title: gradeInfo.title,
    summary: `${reason} 本局目标分 ${targetScore}，最终拿到 ${score} 分。${buildEndingStructureSummary(endingStats)}${deriveGoalSummary(goalContext)}`,
    reason,
    grade: gradeInfo.grade,
    goalContext,
    targetScore,
    score,
    dimensions: {
      ability,
      defense,
      satisfaction,
    },
    scoreBreakdown,
    highlights: buildHighlights(caseResults, { ability, defense, satisfaction }, endingStats),
    improvements: buildImprovements(caseResults, { ability, defense, satisfaction }, endingStats),
    promotionNotes: buildPromotionNotes(world),
    coachNotes: buildCoachNotes(caseResults),
    nextRunAdvice: buildNextRunAdvice(caseResults, { ability, defense, satisfaction }),
    customerReview,
    caseResults,
    endingStats,
    stats: [
      { label: '经营天数', value: `${Math.min(world.day, world.maxDay)} / ${world.maxDay} 天` },
      { label: '目标分', value: `${targetScore}` },
      { label: '最终总分', value: `${score}` },
      { label: '正式成交', value: `${closedDealCount} 套` },
      { label: '房源结局', value: `${endingStats.good} 好 / ${endingStats.neutral} 一般 / ${endingStats.bad} 坏` },
      { label: '能力分', value: `${ability.score} / ${ability.maxScore}` },
      { label: '保住房源分', value: `${defense.score} / ${defense.maxScore}` },
      { label: '满意分', value: `${satisfaction.score} / ${satisfaction.maxScore}` },
      { label: '结局权重', value: `${endingStats.weightedGood} 好 / ${endingStats.weightedBad} 坏` },
      { label: '剩余推广金', value: `${getPromotionBudget(world)} 点` },
    ],
  };
}
