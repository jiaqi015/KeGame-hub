export type OwnerProfilingDimensionValue =
  | 'strong'
  | 'weak'
  | 'short'
  | 'long'
  | 'low'
  | 'high'
  | 'self_decide'
  | 'guided_or_joint'
  | 'unknown';

export type OwnerProfilingConfidence = 'high' | 'medium' | 'low';

export type OwnerProfilingTone = 'accent' | 'chance' | 'risk' | 'neutral';

export type OwnerProfilingTypeKey =
  | 'strong-short-high-self_decide'
  | 'strong-short-high-guided_or_joint'
  | 'strong-short-low-self_decide'
  | 'strong-short-low-guided_or_joint'
  | 'strong-long-high-self_decide'
  | 'strong-long-high-guided_or_joint'
  | 'strong-long-low-self_decide'
  | 'strong-long-low-guided_or_joint'
  | 'weak-short-high-self_decide'
  | 'weak-short-high-guided_or_joint'
  | 'weak-short-low-self_decide'
  | 'weak-short-low-guided_or_joint'
  | 'weak-long-high-self_decide'
  | 'weak-long-high-guided_or_joint'
  | 'weak-long-low-self_decide'
  | 'weak-long-low-guided_or_joint';

export interface OwnerProfilingTypeEntry {
  name: string;
  description: string;
  tone: OwnerProfilingTone;
}

export const OWNER_TYPE_TABLE: Record<OwnerProfilingTypeKey, OwnerProfilingTypeEntry> = {
  'strong-short-high-self_decide': { name: '博弈硬控型', description: '懂市场但不愿让步，会反复试探边界。', tone: 'risk' },
  'strong-short-high-guided_or_joint': { name: '策略摇摆型', description: '有认知但依赖他人，容易被不同意见拉扯。', tone: 'risk' },
  'strong-short-low-self_decide': { name: '情绪硬扛型', description: '又急又不懂，还坚持己见。', tone: 'risk' },
  'strong-short-low-guided_or_joint': { name: '高风险失控型', description: '压力大且判断弱，需要专业兜底。', tone: 'risk' },
  'strong-long-high-self_decide': { name: '强势控盘型', description: '完全按自己节奏来，不接受外部干预。', tone: 'accent' },
  'strong-long-high-guided_or_joint': { name: '理性外包型', description: '有认知但不亲自决策，关键在影响其信任对象。', tone: 'chance' },
  'strong-long-low-self_decide': { name: '自信盲区型', description: '不急但判断可能错误，容易长期卡在错误预期。', tone: 'neutral' },
  'strong-long-low-guided_or_joint': { name: '佛系幻想型', description: '不急、不懂、靠运气等待。', tone: 'neutral' },
  'weak-short-high-self_decide': { name: '高效执行型', description: '目标清晰、行动果断，是优质成交对象。', tone: 'chance' },
  'weak-short-high-guided_or_joint': { name: '专业配合型', description: '认知正确且愿意配合，是理想业主。', tone: 'chance' },
  'weak-short-low-self_decide': { name: '快速试错型', description: '不专业但能快速调整策略。', tone: 'neutral' },
  'weak-short-low-guided_or_joint': { name: '强依赖成交型', description: '高度依赖推动，容易被专业服务驱动成交。', tone: 'chance' },
  'weak-long-high-self_decide': { name: '稳健控节奏型', description: '有能力但不着急，需要机会触发。', tone: 'neutral' },
  'weak-long-high-guided_or_joint': { name: '理性托管型', description: '愿意交给专业的人，是优质潜力业主。', tone: 'chance' },
  'weak-long-low-self_decide': { name: '谨慎观望型', description: '不激进但缺行动力，容易长期不动。', tone: 'neutral' },
  'weak-long-low-guided_or_joint': { name: '被动随缘型', description: '没目标、没判断，成交完全随缘。', tone: 'neutral' },
};

export interface OwnerProfilingDimension {
  key: 'price_anchor' | 'time_window' | 'transaction_experience' | 'decision_style';
  label: string;
  value: OwnerProfilingDimensionValue;
  valueLabel: string;
  confidence: OwnerProfilingConfidence;
  evidenceIds: string[];
}

export interface OwnerProfilingLabel {
  name: string;
  value: string;
  confidence: OwnerProfilingConfidence;
  evidenceIds: string[];
}

export interface OwnerProfilingEvidence {
  id: string;
  sourceType: 'interview' | 'listing_data' | 'market_data' | 'manual';
  text: string;
  linkedDimensions: string[];
  confidence: OwnerProfilingConfidence;
}

export interface OwnerProfilingMemorySummary {
  ownerTypeKey: OwnerProfilingTypeKey;
  ownerTypeName: string;
  ownerTypeDescription: string;
  ownerTypeTone: OwnerProfilingTone;
  dimensions: OwnerProfilingDimension[];
  labels: OwnerProfilingLabel[];
  evidenceBank: OwnerProfilingEvidence[];
  serviceStrategy: {
    primaryGoal: string;
    mainBlocker: string;
    recommendedNextAction: string;
    communicationStyle: string;
  };
  openQuestions: string[];
}
