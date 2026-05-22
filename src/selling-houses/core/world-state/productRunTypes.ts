import type { ProductType } from './productTypes.js';

export const PRODUCT_RUN_SCOPES = ['community', 'listing'] as const;
export type ProductRunScope = (typeof PRODUCT_RUN_SCOPES)[number];

export const PRODUCT_RUN_STATUSES = ['running', 'completed', 'cancelled'] as const;
export type ProductRunStatus = (typeof PRODUCT_RUN_STATUSES)[number];

export const PRODUCT_RUN_MILESTONE_KINDS = ['event', 'light_scene', 'heavy_scene'] as const;
export type ProductRunMilestoneKind = (typeof PRODUCT_RUN_MILESTONE_KINDS)[number];

export interface ProductRunMilestone {
  id: string;
  title: string;
  summary: string;
  day: number;
  kind: ProductRunMilestoneKind;
  settlementHint: string;
}

export interface ProductRun {
  id: string;
  productType: ProductType;
  scope: ProductRunScope;
  status: ProductRunStatus;
  startDay: number;
  endDay?: number;
  targetIds: string[];
  nextMilestone: string;
  linkedEventIds?: string[];
  milestones?: ProductRunMilestone[];
}

const PRODUCT_RUN_SCOPE_SET: ReadonlySet<string> = new Set(PRODUCT_RUN_SCOPES);
export function isProductRunScope(value: unknown): value is ProductRunScope {
  return typeof value === 'string' && PRODUCT_RUN_SCOPE_SET.has(value);
}

const PRODUCT_RUN_STATUS_SET: ReadonlySet<string> = new Set(PRODUCT_RUN_STATUSES);
export function isProductRunStatus(value: unknown): value is ProductRunStatus {
  return typeof value === 'string' && PRODUCT_RUN_STATUS_SET.has(value);
}

const PRODUCT_RUN_MILESTONE_KIND_SET: ReadonlySet<string> = new Set(PRODUCT_RUN_MILESTONE_KINDS);
export function isProductRunMilestoneKind(value: unknown): value is ProductRunMilestoneKind {
  return typeof value === 'string' && PRODUCT_RUN_MILESTONE_KIND_SET.has(value);
}
