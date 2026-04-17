import type {
  Case,
  CaseFinalResult,
  DefenseOutcome,
  FinalResult,
  GameState,
  GoalContextId,
  GoalTier,
  ListingEndingBucket,
  ListingEndingType,
  ListingRelativeOutcome,
  OwnerSatisfactionState,
  ScoreDimensionResult,
} from './models';

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
  if (bucket === 'good') return '好收尾';
  if (bucket === 'neutral') return '一般收尾';
  return '坏收尾';
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
  if (outcome === 'outrun') return '跑赢盘面';
  if (outcome === 'flat') return '大致打平';
  return '跑输盘面';
}

function satisfactionLabel(state: OwnerSatisfactionState) {
  if (state === 'happy') return '满意';
  if (state === 'neutral') return '无感';
  if (state === 'no_regret') return '不后悔';
  if (state === 'regret') return '后悔';
  return '不满';
}

function defenseLabel(outcome: DefenseOutcome) {
  if (outcome === 'held') return '守住了';
  if (outcome === 'at_risk') return '局末高危';
  if (outcome === 'lost_to_rival') return '被竞品截走';
  return '自己撤了';
}

function buildEndingSummary(caseItem: Case, endingType: ListingEndingType) {
  switch (endingType) {
    case 'sold_by_you_happy':
      return `${caseItem.title} 最终由你顺利收口，业主对结果和过程都买账。`;
    case 'sold_by_you_neutral':
      return `${caseItem.title} 最终收口了，业主接受结果，但情绪不算特别高。`;
    case 'sold_by_you_regret':
      return `${caseItem.title} 虽然成交了，但业主对过程和体验并不满意。`;
    case 'sold_by_other':
      return `${caseItem.title} 最终没守住，机会被别人拿走了。`;
    case 'not_sold_no_regret':
      return `${caseItem.title} 这局没卖掉，但至少没有把业主做后悔。`;
    case 'not_sold_regret':
      return `${caseItem.title} 没有收口，业主也开始怀疑这轮经营值不值得。`;
    case 'switch_to_rent_no_regret':
      return `${caseItem.title} 没按卖的主线走到底，但最后止损方式还算体面。`;
    case 'withdrawn_unhappy':
      return `${caseItem.title} 最终撤盘，而且收尾并不体面。`;
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

function buildAbilityDimension(caseResults: CaseFinalResult[]): ScoreDimensionResult {
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
  return {
    label: '能力分',
    score,
    maxScore: 40,
    summary: loseCount === 0
      ? `这局大多数房都没被盘面压着打，尤其有 ${outrunCount} 套真正做出了跑赢感。`
      : `这局有 ${outrunCount} 套房跑出了盘面，也有 ${loseCount} 套房明显被环境拖住。`,
  };
}

function buildDefenseDimension(caseResults: CaseFinalResult[]): ScoreDimensionResult {
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
  return {
    label: '守盘分',
    score,
    maxScore: 35,
    summary: lostCore
      ? '这局最伤的是核心盘没守住，整体守盘感被直接拉低了。'
      : lostCount > 0
        ? `有 ${lostCount} 套房最终失守，说明资源排序还不够狠。`
        : '关键房基本守住了，这局的盘面防守是成立的。',
  };
}

function buildSatisfactionDimension(caseResults: CaseFinalResult[]): ScoreDimensionResult {
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
  return {
    label: '满意分',
    score,
    maxScore: 25,
    summary: unhappyCount > 0
      ? `有 ${unhappyCount} 套房最后明显做出了不满，满意面没守住。`
      : `这局至少有 ${happyCount} 套房收成了真正的满意，其余大多没有做后悔。`,
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
    return `结局结构：${endingStats.good} 套好收尾、${endingStats.neutral} 套一般收尾、${endingStats.bad} 套坏收尾，最伤的是核心盘出现坏收尾。`;
  }
  if (endingStats.bad > 0) {
    return `结局结构：${endingStats.good} 套好收尾、${endingStats.neutral} 套一般收尾、${endingStats.bad} 套坏收尾，问题主要出在失守和难看收尾。`;
  }
  return `结局结构：${endingStats.good} 套好收尾、${endingStats.neutral} 套一般收尾，没有明显坏收尾。`;
}

function deriveGrade(score: number, thresholds: { pass: number; strong: number; ace: number }) {
  if (score >= thresholds.ace) {
    return { grade: '王牌', title: '这局你真正控住了局势' };
  }
  if (score >= thresholds.strong) {
    return { grade: '漂亮', title: '这局明显是你压住了节奏' };
  }
  if (score >= thresholds.pass) {
    return { grade: '过线', title: '至少把关键局面撑住了' };
  }
  return { grade: '失守', title: '这局还是被盘面带着走了' };
}

function deriveGoalSummary(goalContext: GoalContextId) {
  if (goalContext === 'defense') return '这局主看守盘，你最怕的不是少卖，而是关键房失守。';
  if (goalContext === 'satisfaction') return '这局主看满意，重点是别把业主关系和体验做崩。';
  return '这局主看能力，重点是把这些房子做得跑赢它们各自所处盘面。';
}

function buildHighlights(
  caseResults: CaseFinalResult[],
  dimensions: FinalResult['dimensions'],
  endingStats: FinalResult['endingStats'],
) {
  const highlights: string[] = [];
  const happySolds = caseResults.filter((entry) => entry.endingType === 'sold_by_you_happy');
  if (happySolds.length > 0) {
    highlights.push(`这局至少有 ${happySolds.length} 套房收成了“卖掉了，很满意”，说明你不是只会硬收口。`);
  }
  if (endingStats.good > 0 && endingStats.bad === 0) {
    highlights.push(`整局有 ${endingStats.good} 套房落在好收尾，没有房源变成坏收尾，房源主线是收住的。`);
  }
  if (dimensions.defense.score >= 28) {
    highlights.push('守盘线打得比较稳，关键房没有轻易被别人摘走。');
  }
  if (dimensions.ability.score >= 30) {
    highlights.push('这局不只是成交，而是多套房都打出了跑赢盘面的感觉。');
  }
  if (!highlights.length) {
    highlights.push('至少你把整局完整收完了，已经开始像在打真正的局，而不是乱点动作。');
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
    improvements.push('核心盘出现坏收尾，下一局要先分清哪套房绝对不能放。');
  }
  if (caseResults.some((entry) => entry.defenseOutcome === 'lost_to_rival')) {
    improvements.push('有房最终失守，下一局要更早把核心盘和能放的盘分开。');
  }
  if (dimensions.satisfaction.score <= 12) {
    improvements.push('满意面偏弱，说明你有些盘虽然在推进，但做得不够体面。');
  }
  if (dimensions.ability.score <= 20) {
    improvements.push('能力面偏低，说明这局不少房都没有真正跑赢自己所处盘面。');
  }
  if (!improvements.length) {
    improvements.push('下一局可以更极端一点拉开资源主次，练真正的舍与保。');
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
  if (world.cash <= 2) {
    notes.push('局末推广金几乎打空了，说明你在资源排序上还能更克制。');
  } else if (world.cash >= 8) {
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
    advice.push(`本局有 ${coreLossCount} 套核心盘没有守住，开局三天的资源分配直接影响了后段容错。`);
  }
  if (dimensions.satisfaction.score <= dimensions.ability.score && dimensions.satisfaction.score <= dimensions.defense.score) {
    advice.push('满意分是三轴里最低的一项，说明成交推进和业主体感没有一起被守住。');
  }
  if (dimensions.ability.score < 24) {
    advice.push('能力分偏低，说明有效推进主要集中在少数房源，更多房源停留在中前段。');
  }
  if (!advice.length) {
    advice.push('三项分数比较接近，这局没有明显单一短板，主要差异来自具体房源收尾。');
  }
  return advice;
}

export function evaluateFinalResult(world: GameState, reason: string): FinalResult {
  const caseResults = world.cases.map((caseItem) => buildCaseFinalResult(caseItem));
  const endingStats = buildEndingStats(caseResults);
  const ability = buildAbilityDimension(caseResults);
  const defense = buildDefenseDimension(caseResults);
  const satisfaction = buildSatisfactionDimension(caseResults);
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
    { label: ability.label, value: ability.score, maxValue: ability.maxScore, summary: ability.summary },
    { label: defense.label, value: defense.score, maxValue: defense.maxScore, summary: defense.summary },
    { label: satisfaction.label, value: satisfaction.score, maxValue: satisfaction.maxScore, summary: satisfaction.summary },
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
    caseResults,
    endingStats,
    stats: [
      { label: '经营天数', value: `${Math.min(world.day, world.maxDay)} / ${world.maxDay} 天` },
      { label: '目标分', value: `${targetScore}` },
      { label: '最终总分', value: `${score}` },
      { label: '房源结局', value: `${endingStats.good} 好 / ${endingStats.neutral} 一般 / ${endingStats.bad} 坏` },
      { label: '能力分', value: `${ability.score} / ${ability.maxScore}` },
      { label: '守盘分', value: `${defense.score} / ${defense.maxScore}` },
      { label: '满意分', value: `${satisfaction.score} / ${satisfaction.maxScore}` },
      { label: '结局权重', value: `${endingStats.weightedGood} 好 / ${endingStats.weightedBad} 坏` },
      { label: '剩余推广金', value: `${world.cash} 点` },
    ],
  };
}
