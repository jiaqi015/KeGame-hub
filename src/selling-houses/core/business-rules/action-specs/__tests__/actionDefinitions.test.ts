import { describe, it, expect } from 'vitest';
import {
  ACTION_FAMILIES,
  ACTION_CATEGORIES,
  ACTIONS,
  ACTION_BY_ID,
  ACTION_CATEGORY_BY_ID,
} from '../actionDefinitions.js';
import { isActionCategoryId, isActionMetricKey } from '../actionTaxonomy.js';

describe('actionDefinitions', () => {
  it('ACTIONS has 15 entries', () => {
    expect(ACTIONS).toHaveLength(15);
  });

  it('each action has a valid categoryId', () => {
    for (const action of ACTIONS) {
      if (action.categoryId !== undefined) {
        expect(isActionCategoryId(action.categoryId)).toBe(true);
      }
    }
  });

  it('each action metricFocus entries are valid ActionMetricKeys', () => {
    for (const action of ACTIONS) {
      if (action.metricFocus) {
        for (const key of action.metricFocus) {
          expect(isActionMetricKey(key)).toBe(true);
        }
      }
    }
  });

  it('ACTION_BY_ID has same length as ACTIONS', () => {
    expect(Object.keys(ACTION_BY_ID)).toHaveLength(ACTIONS.length);
  });

  it('ACTION_CATEGORIES has 4 entries matching the category IDs', () => {
    expect(ACTION_CATEGORIES).toHaveLength(4);
    const categoryIds = ACTION_CATEGORIES.map((c) => c.id);
    expect(categoryIds).toContain('feedback');
    expect(categoryIds).toContain('marketing');
    expect(categoryIds).toContain('pricing');
    expect(categoryIds).toContain('negotiation');
  });

  it('ACTION_CATEGORY_BY_ID has same length as ACTION_CATEGORIES', () => {
    expect(Object.keys(ACTION_CATEGORY_BY_ID)).toHaveLength(ACTION_CATEGORIES.length);
  });

  it('ACTION_FAMILY values are all in ACTION_FAMILIES', () => {
    const familySet = new Set(ACTION_FAMILIES);
    for (const action of ACTIONS) {
      if (action.family !== undefined) {
        expect(familySet.has(action.family)).toBe(true);
      }
    }
  });

  it('ACTIONS is runtime immutable: push throws TypeError', () => {
    expect(() => { (ACTIONS as any[]).push({} as any); }).toThrow(TypeError);
  });

  it('ACTION_CATEGORIES is runtime immutable: push throws TypeError', () => {
    expect(() => { (ACTION_CATEGORIES as any[]).push({} as any); }).toThrow(TypeError);
  });

  it('ACTION_BY_ID is runtime immutable: adding new key throws TypeError', () => {
    expect(() => { (ACTION_BY_ID as any)['nonexistent'] = {}; }).toThrow(TypeError);
  });

  it('ACTION_CATEGORY_BY_ID is runtime immutable: overwriting key throws TypeError', () => {
    expect(() => { (ACTION_CATEGORY_BY_ID as any)['feedback'] = {}; }).toThrow(TypeError);
  });

  it('nested metricFocus arrays are runtime immutable', () => {
    const firstAction = ACTIONS.find(a => a.metricFocus && a.metricFocus.length > 0);
    expect(firstAction).toBeTruthy();
    expect(() => { (firstAction!.metricFocus as any).push('invalid' as any); }).toThrow(TypeError);
  });

  it('actionDefinitions.ts does not import from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/business-rules/action-specs/actionDefinitions.ts'),
      'utf-8',
    );
    const importLines = source.split('\n').filter((l: string) => l.trimStart().startsWith('import '));
    expect(importLines.some((l: string) => l.includes('domain/'))).toBe(false);
  });
});
