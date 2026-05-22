/**
 * actionTaxonomy.ts — canonical definition of action category and metric types.
 *
 * Architecture position:
 *   This is the single authority for ActionCategoryId and ActionMetricKey.
 *   Domain re-exports from here; core imports from here.
 *   This prevents core→domain layer boundary violations.
 */

export const ACTION_CATEGORY_IDS = ['feedback', 'marketing', 'pricing', 'negotiation'] as const;

export type ActionCategoryId = (typeof ACTION_CATEGORY_IDS)[number];

export const ACTION_METRIC_KEYS = [
  'trust',
  'patience',
  'urgency',
  'heat',
  'competitiveness',
  'd1',
  'd2',
  'd3',
  'windowDays',
  'askPrice',
  'intent',
  'confidence',
  'promotionBudget',
  'wordOfMouth',
  'commission',
] as const;

export type ActionMetricKey = (typeof ACTION_METRIC_KEYS)[number];

const ACTION_CATEGORY_ID_SET: ReadonlySet<string> = new Set(ACTION_CATEGORY_IDS);

export function isActionCategoryId(value: unknown): value is ActionCategoryId {
  return typeof value === 'string' && ACTION_CATEGORY_ID_SET.has(value);
}

const ACTION_METRIC_KEY_SET: ReadonlySet<string> = new Set(ACTION_METRIC_KEYS);

export function isActionMetricKey(value: unknown): value is ActionMetricKey {
  return typeof value === 'string' && ACTION_METRIC_KEY_SET.has(value);
}
