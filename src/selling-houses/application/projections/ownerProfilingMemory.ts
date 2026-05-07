import type { Case } from '../../domain/models.js';
import type { ScenarioChoice } from '../../domain/actions/templates.js';
import type {
  OwnerProfilingTypeKey,
  OwnerProfilingConfidence,
  OwnerProfilingDimension,
  OwnerProfilingDimensionValue,
  OwnerProfilingEvidence,
  OwnerProfilingLabel,
  OwnerProfilingMemorySummary,
} from '../../domain/ownerProfilingMemoryTypes.js';
import { OWNER_TYPE_TABLE } from '../../domain/ownerProfilingMemoryTypes.js';
export type {
  OwnerProfilingTypeKey,
  OwnerProfilingConfidence,
  OwnerProfilingDimension,
  OwnerProfilingDimensionValue,
  OwnerProfilingEvidence,
  OwnerProfilingLabel,
  OwnerProfilingMemorySummary,
} from '../../domain/ownerProfilingMemoryTypes.js';

interface OwnerProfilingSignals {
  priceAnchor: 'strong' | 'weak';
  timeWindow: 'short' | 'long';
  transactionExperience: 'low' | 'high';
  decisionStyle: 'self_decide' | 'guided_or_joint';
}

const VALUE_LABELS: Record<OwnerProfilingDimensionValue, string> = {
  strong: '锚定强',
  weak: '锚定弱',
  short: '短窗口',
  long: '长窗口',
  low: '经验低',
  high: '经验高',
  self_decide: '自己拍板',
  guided_or_joint: '共同/被指导',
  unknown: '待确认',
};

export function buildOwnerProfilingMemorySummary(
  caseItem: Case,
  choices: ScenarioChoice[] = [],
): OwnerProfilingMemorySummary {
  const signals = deriveOwnerProfilingSignals(caseItem, choices);
  const evidenceBank = buildOwnerProfilingEvidenceBank(caseItem, choices, signals);
  const ownerTypeKey = `${signals.priceAnchor}-${signals.timeWindow}-${signals.transactionExperience}-${signals.decisionStyle}` as OwnerProfilingTypeKey;
  const ownerType = OWNER_TYPE_TABLE[ownerTypeKey] || OWNER_TYPE_TABLE['weak-long-low-guided_or_joint'];
  const dimensions: OwnerProfilingDimension[] = [
    buildDimension('price_anchor', '价格锚定', signals.priceAnchor, evidenceIdsFor('price_anchor', evidenceBank), confidenceForDimension('price_anchor', choices)),
    buildDimension('time_window', '时间窗口', signals.timeWindow, evidenceIdsFor('time_window', evidenceBank), confidenceForDimension('time_window', choices)),
    buildDimension('transaction_experience', '交易经验', signals.transactionExperience, evidenceIdsFor('transaction_experience', evidenceBank), confidenceForDimension('transaction_experience', choices)),
    buildDimension('decision_style', '决策方式', signals.decisionStyle, evidenceIdsFor('decision_style', evidenceBank), confidenceForDimension('decision_style', choices)),
  ];

  return {
    ownerTypeKey,
    ownerTypeName: ownerType.name,
    ownerTypeDescription: ownerType.description,
    ownerTypeTone: ownerType.tone,
    dimensions,
    labels: buildOwnerProfilingLabels(caseItem, signals, evidenceBank),
    evidenceBank,
    serviceStrategy: buildServiceStrategy(caseItem, signals, choices),
    openQuestions: buildOpenQuestions(signals, choices),
  };
}

function deriveOwnerProfilingSignals(caseItem: Case, choices: ScenarioChoice[]): OwnerProfilingSignals {
  const selectedTopicIds = new Set(choices.flatMap((choice) => choice.mainTopics?.length ? choice.mainTopics : [choice.main]));
  const priceGapRatio = (caseItem.askPrice - caseItem.marketPrice) / Math.max(caseItem.marketPrice, 1);
  const signalText = `${caseItem.ownerMood || ''} ${caseItem.story || ''}`.toLowerCase();
  const priceAnchor = selectedTopicIds.has('ask-price-anchor') || selectedTopicIds.has('test-price-flexibility')
    ? 'strong'
    : priceGapRatio >= 0.035 || /价格|竞品|总价|底价|价值|锚|涨价|降价|报价/.test(signalText)
      ? 'strong'
      : 'weak';
  const timeWindow = selectedTopicIds.has('confirm-deadline') || caseItem.urgency >= 70 || caseItem.windowDays <= 8 || /尽快|最快|年底|换房|置换|用钱|回款|入学|婚|刚需/.test(signalText)
    ? 'short'
    : 'long';
  const transactionExperience = selectedTopicIds.has('ask-selling-experience') || /流程|税|抵押|成交|带看|签约|议价|经验|数据|竞品|市场|卖房/.test(signalText)
    ? 'high'
    : 'low';
  const decisionStyle = selectedTopicIds.has('map-decision-structure') || /家人|家庭|商量|顾问|一起|老婆|老公|孩子|父母/.test(signalText)
    ? 'guided_or_joint'
    : 'self_decide';

  return { priceAnchor, timeWindow, transactionExperience, decisionStyle };
}

function buildOwnerProfilingEvidenceBank(
  caseItem: Case,
  choices: ScenarioChoice[],
  signals: OwnerProfilingSignals,
): OwnerProfilingEvidence[] {
  const topicEvidence = choices.flatMap((choice) => {
    const topicIds = choice.mainTopics?.length ? choice.mainTopics : [choice.main];
    return topicIds.map((topicId, index) => ({
      id: `ev_interview_r${choice.round}_${index + 1}`,
      sourceType: 'interview' as const,
      text: mapTopicToEvidenceText(topicId, caseItem),
      linkedDimensions: mapTopicToDimensions(topicId),
      confidence: 'medium' as const,
    }));
  });

  return [
    ...topicEvidence,
    {
      id: 'ev_listing_price_gap',
      sourceType: 'listing_data',
      text: `挂牌 ${caseItem.askPrice} 万，市场常见成交 ${caseItem.marketPrice} 万，价差约 ${Math.round(((caseItem.askPrice - caseItem.marketPrice) / Math.max(caseItem.marketPrice, 1)) * 100)}%。`,
      linkedDimensions: ['price_anchor'],
      confidence: signals.priceAnchor === 'strong' ? 'medium' : 'low',
    },
    {
      id: 'ev_time_window',
      sourceType: 'listing_data',
      text: `当前剩余可经营 ${caseItem.windowDays} 天，紧迫度 ${Math.round(caseItem.urgency)}。`,
      linkedDimensions: ['time_window'],
      confidence: signals.timeWindow === 'short' ? 'medium' : 'low',
    },
    {
      id: 'ev_owner_mood',
      sourceType: 'manual',
      text: `${caseItem.ownerName}：${caseItem.ownerMood || '首次面访前暂无更细备注'}。`,
      linkedDimensions: ['decision_style', 'time_window'],
      confidence: 'low',
    },
  ];
}

function buildDimension(
  key: OwnerProfilingDimension['key'],
  label: string,
  value: OwnerProfilingDimensionValue,
  evidenceIds: string[],
  confidence: OwnerProfilingConfidence,
): OwnerProfilingDimension {
  return {
    key,
    label,
    value,
    valueLabel: VALUE_LABELS[value],
    confidence,
    evidenceIds,
  };
}

function confidenceForDimension(dimension: OwnerProfilingDimension['key'], choices: ScenarioChoice[]): OwnerProfilingConfidence {
  const topicIds = choices.flatMap((choice) => choice.mainTopics?.length ? choice.mainTopics : [choice.main]);
  const hasDirectInterviewEvidence = topicIds.some((topicId) => mapTopicToDimensions(topicId).includes(dimension));
  return hasDirectInterviewEvidence ? 'medium' : 'low';
}

function evidenceIdsFor(dimension: string, evidenceBank: OwnerProfilingEvidence[]) {
  return evidenceBank.filter((entry) => entry.linkedDimensions.includes(dimension)).map((entry) => entry.id);
}

function buildOwnerProfilingLabels(
  caseItem: Case,
  signals: OwnerProfilingSignals,
  evidenceBank: OwnerProfilingEvidence[],
): OwnerProfilingLabel[] {
  const labels: OwnerProfilingLabel[] = [];
  if (signals.priceAnchor === 'strong') {
    labels.push({ name: 'pricing_gap', value: '定价偏高', confidence: 'medium', evidenceIds: evidenceIdsFor('price_anchor', evidenceBank) });
    labels.push({ name: 'selling_goal', value: '卖稍高价格', confidence: 'medium', evidenceIds: evidenceIdsFor('price_anchor', evidenceBank) });
  }
  if (signals.timeWindow === 'short') {
    labels.push({ name: 'selling_goal', value: '快速成交', confidence: 'medium', evidenceIds: evidenceIdsFor('time_window', evidenceBank) });
  }
  if (signals.transactionExperience === 'high' || signals.priceAnchor === 'strong') {
    labels.push({ name: 'market_focus', value: '竞品动态', confidence: 'medium', evidenceIds: ['ev_listing_price_gap'] });
    labels.push({ name: 'decision_basis', value: '客观数据', confidence: 'medium', evidenceIds: ['ev_listing_price_gap'] });
  }
  if (signals.decisionStyle === 'guided_or_joint') {
    labels.push({ name: 'decision_maker', value: '家庭共同决策', confidence: 'medium', evidenceIds: evidenceIdsFor('decision_style', evidenceBank) });
  }
  labels.push({
    name: 'participation_level',
    value: signals.decisionStyle === 'guided_or_joint' || signals.timeWindow === 'short' ? '主动参与型' : '托管型',
    confidence: 'low',
    evidenceIds: ['ev_owner_mood'],
  });
  return labels;
}

function buildServiceStrategy(
  caseItem: Case,
  signals: OwnerProfilingSignals,
  choices: ScenarioChoice[],
): OwnerProfilingMemorySummary['serviceStrategy'] {
  const comparedThemes = formatComparedThemes(choices);
  if (signals.priceAnchor === 'strong' && signals.timeWindow === 'short') {
    return {
      primaryGoal: '把高价期待转成可验证的市场动作',
      mainBlocker: '既想守价又怕时间拖长',
      recommendedNextAction: comparedThemes
        ? `下次围绕「${comparedThemes}」做价格复盘，不直接压降价。`
        : '下次用竞品、客户反馈和一周目标做价格复盘，不直接压降价。',
      communicationStyle: comparedThemes
        ? `先承认价值，再把「${comparedThemes}」做成可转述材料。`
        : '先承认价值，再给证据和备选动作。',
    };
  }
  if (signals.priceAnchor === 'weak' && signals.timeWindow === 'short') {
    return {
      primaryGoal: '快速形成可成交节奏',
      mainBlocker: '需要确定下一步行动是否真的有效',
      recommendedNextAction: comparedThemes
        ? `优先围绕「${comparedThemes}」去安排客户反馈、带看或诚意卖。`
        : '优先安排客户反馈、带看或诚意卖，把短窗口转成动作密度。',
      communicationStyle: '少铺垫，直接讲动作、时间和反馈口径。',
    };
  }
  if (signals.decisionStyle === 'guided_or_joint') {
    return {
      primaryGoal: '找到真实价格影响人',
      mainBlocker: '日常沟通人和最终拍板人可能不一致',
      recommendedNextAction: comparedThemes
        ? `准备一页可转发的市场依据，重点讲「${comparedThemes}」，给家庭共同决策使用。`
        : '准备一页可转发的市场依据，给家庭共同决策使用。',
      communicationStyle: comparedThemes
        ? `结论短、证据清楚、把「${comparedThemes}」做成方便转述的版本。`
        : '结论短、证据清楚、方便转述。',
    };
  }
  return {
    primaryGoal: '建立稳定经营共识',
    mainBlocker: caseItem.ownerMood || '业主仍在观察服务确定性',
    recommendedNextAction: comparedThemes
      ? `保持周度反馈，围绕「${comparedThemes}」持续校准预期。`
      : '保持周度反馈，用客户和竞品事实持续校准预期。',
    communicationStyle: signals.transactionExperience === 'high'
      ? '用数据和案例讲清边界。'
      : '先解释流程，再给下一步。'
  };
}

function buildOpenQuestions(signals: OwnerProfilingSignals, choices: ScenarioChoice[]) {
  const topicIds = new Set(choices.flatMap((choice) => choice.mainTopics?.length ? choice.mainTopics : [choice.main]));
  const questions: string[] = [];
  if (!topicIds.has('map-decision-structure') && signals.decisionStyle === 'self_decide') {
    questions.push('最终价格拍板是否还有家人或顾问参与？');
  }
  if (!topicIds.has('confirm-deadline') && signals.timeWindow === 'short') {
    questions.push('最晚希望在哪个时间点前卖出，资金用途是否明确？');
  }
  if (!topicIds.has('ask-price-anchor') && signals.priceAnchor === 'strong') {
    questions.push('当前心理价位来自哪套竞品、成交或家庭预期？');
  }
  if (!topicIds.has('ask-selling-experience')) {
    questions.push('过去是否独立卖过二手房，是否熟悉议价和签约流程？');
  }
  return questions.slice(0, 3);
}

function formatComparedThemes(choices: ScenarioChoice[]) {
  const mainTopics = choices.flatMap((choice) => choice.mainTopics?.length ? choice.mainTopics : [choice.main]);
  const themeLabels = mainTopics
    .map<string | null>((topicId) => {
      if (topicId === 'ask-price-anchor' || topicId === 'test-price-flexibility') return '价格锚点';
      if (topicId === 'confirm-deadline') return '时间窗口';
      if (topicId === 'map-decision-structure') return '决策结构';
      if (topicId === 'ask-selling-experience') return '交易经验';
      if (topicId === 'confirm-service-rules') return '服务规则';
      return null;
    })
    .filter((item): item is string => Boolean(item));
  return Array.from(new Set(themeLabels)).slice(0, 3).join('、');
}

function mapTopicToEvidenceText(topicId: string, caseItem: Case) {
  const map: Record<string, string> = {
    'ask-motive': `${caseItem.ownerName} 被追问卖房动机和资金用途。`,
    'ask-price-anchor': `${caseItem.ownerName} 被追问心理价位来源、可比成交和竞品锚点。`,
    'confirm-deadline': `${caseItem.ownerName} 被确认最晚成交时间和是否存在置换/用钱节点。`,
    'map-decision-structure': `${caseItem.ownerName} 被确认日常沟通人、最终拍板人和价格影响人。`,
    'ask-selling-experience': `${caseItem.ownerName} 被确认二手房售卖经验和流程熟悉度。`,
    'test-price-flexibility': `${caseItem.ownerName} 被测试在客户反馈出现后是否愿意复盘价格。`,
    'confirm-service-rules': `${caseItem.ownerName} 被确认沟通频率、看房配合和雷点规则。`,
    'commit-next-step': `${caseItem.ownerName} 已被带到下一步服务承诺。`,
  };
  return map[topicId] || `${caseItem.ownerName} 在首次面访中提供了新的经营信息。`;
}

function mapTopicToDimensions(topicId: string): string[] {
  const map: Record<string, string[]> = {
    'ask-motive': ['time_window'],
    'ask-price-anchor': ['price_anchor'],
    'confirm-deadline': ['time_window'],
    'map-decision-structure': ['decision_style'],
    'ask-selling-experience': ['transaction_experience'],
    'test-price-flexibility': ['price_anchor'],
    'confirm-service-rules': ['decision_style'],
    'commit-next-step': ['decision_style', 'time_window'],
  };
  return map[topicId] || [];
}
