import { describe, it, expect } from 'vitest';
import {
  ACTION_CATEGORY_IDS,
  ACTION_METRIC_KEYS,
  isActionCategoryId,
  isActionMetricKey,
} from '../actionTaxonomy.js';
import type { ActionCategoryId, ActionMetricKey } from '../actionTaxonomy.js';

describe('actionTaxonomy', () => {
  it('ACTION_CATEGORY_IDS contains 4 categories', () => {
    expect(ACTION_CATEGORY_IDS).toHaveLength(4);
    expect(ACTION_CATEGORY_IDS).toEqual(['feedback', 'marketing', 'pricing', 'negotiation']);
  });

  it('ActionCategoryId derives from ACTION_CATEGORY_IDS tuple', () => {
    const ids: ActionCategoryId[] = [...ACTION_CATEGORY_IDS];
    expect(ids).toHaveLength(4);
  });

  it('ACTION_METRIC_KEYS contains 15 keys', () => {
    expect(ACTION_METRIC_KEYS).toHaveLength(15);
  });

  it('ActionMetricKey derives from ACTION_METRIC_KEYS tuple', () => {
    const keys: ActionMetricKey[] = [...ACTION_METRIC_KEYS];
    expect(keys).toHaveLength(15);
  });

  it('isActionCategoryId returns true for valid ids', () => {
    expect(isActionCategoryId('feedback')).toBe(true);
    expect(isActionCategoryId('marketing')).toBe(true);
    expect(isActionCategoryId('pricing')).toBe(true);
    expect(isActionCategoryId('negotiation')).toBe(true);
  });

  it('isActionCategoryId returns false for invalid ids', () => {
    expect(isActionCategoryId('unknown')).toBe(false);
    expect(isActionCategoryId('')).toBe(false);
    expect(isActionCategoryId(42)).toBe(false);
    expect(isActionCategoryId(null)).toBe(false);
    expect(isActionCategoryId(undefined)).toBe(false);
  });

  it('isActionMetricKey returns true for valid keys', () => {
    expect(isActionMetricKey('trust')).toBe(true);
    expect(isActionMetricKey('commission')).toBe(true);
    expect(isActionMetricKey('d3')).toBe(true);
  });

  it('isActionMetricKey returns false for invalid keys', () => {
    expect(isActionMetricKey('unknown')).toBe(false);
    expect(isActionMetricKey('')).toBe(false);
    expect(isActionMetricKey(42)).toBe(false);
    expect(isActionMetricKey(null)).toBe(false);
  });

  it('actionTaxonomy.ts does not import from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/business-rules/action-specs/actionTaxonomy.ts'),
      'utf-8',
    );
    expect(source).not.toContain('domain/models');
    expect(source).not.toContain('domain/world-model');
  });
});
