export interface DailyCityStoryResult {
  readonly storyId: string;
  readonly source: 'ai' | 'fallback';
  readonly headline: string;
  readonly deck: string;
  readonly cityStory: {
    readonly paragraphs: readonly string[];
    readonly wordCount: number;
  };
  readonly todayBridge: {
    readonly label: string;
    readonly value: string;
    readonly actionCue: string;
  };
  readonly evidenceLabels: readonly string[];
  readonly citedEventIds: readonly string[];
  readonly citedCaseIds: readonly string[];
  readonly citedCustomerIds: readonly string[];
  readonly citedOwnerIds: readonly string[];
  readonly safety: {
    readonly hiddenTruthUsed: false;
    readonly inventedFacts: false;
    readonly needsFallback: boolean;
    readonly fallbackReason?: string;
  };
}

export const FORBIDDEN_WORDS = [
  'LLM', 'fallback', '规则置信度', '模型', '算法', '训练', '教学', '任务', '打卡',
  '主矛盾', '画像', '锚点', '盘面', '闭环', '抓手',
];

export const MIN_PARAGRAPHS = 4;
export const MAX_PARAGRAPHS = 6;
export const MIN_WORD_COUNT = 450;
export const MAX_WORD_COUNT = 1000;
export const MAX_HEADLINE_LENGTH = 24;
export const MAX_DECK_LENGTH = 70;
export const MAX_ACTION_CUE_LENGTH = 60;
export const MAX_EVIDENCE_LABEL_LENGTH = 12;
export const MIN_EVIDENCE_LABELS = 3;
export const MAX_EVIDENCE_LABELS = 5;
