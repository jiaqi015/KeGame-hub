import { describe, it, expect } from 'vitest';
import {
  PRODUCT_RUN_SCOPES,
  PRODUCT_RUN_STATUSES,
  PRODUCT_RUN_MILESTONE_KINDS,
  isProductRunScope,
  isProductRunStatus,
  isProductRunMilestoneKind,
} from '../productRunTypes.js';

describe('productRunTypes', () => {
  it('PRODUCT_RUN_SCOPES has 2 values', () => {
    expect(PRODUCT_RUN_SCOPES).toHaveLength(2);
  });

  it('PRODUCT_RUN_STATUSES has 3 values', () => {
    expect(PRODUCT_RUN_STATUSES).toHaveLength(3);
  });

  it('PRODUCT_RUN_MILESTONE_KINDS has 3 values', () => {
    expect(PRODUCT_RUN_MILESTONE_KINDS).toHaveLength(3);
  });

  it('isProductRunScope validates correctly', () => {
    expect(isProductRunScope('community')).toBe(true);
    expect(isProductRunScope('listing')).toBe(true);
    expect(isProductRunScope('region')).toBe(false);
  });

  it('isProductRunStatus validates correctly', () => {
    expect(isProductRunStatus('running')).toBe(true);
    expect(isProductRunStatus('completed')).toBe(true);
    expect(isProductRunStatus('paused')).toBe(false);
  });

  it('isProductRunMilestoneKind validates correctly', () => {
    expect(isProductRunMilestoneKind('event')).toBe(true);
    expect(isProductRunMilestoneKind('light_scene')).toBe(true);
    expect(isProductRunMilestoneKind('heavy_scene')).toBe(true);
    expect(isProductRunMilestoneKind('milestone')).toBe(false);
  });

  it('productRunTypes.ts does not import from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/world-state/productRunTypes.ts'),
      'utf-8',
    );
    const importLines = source.split('\n').filter(l => l.trimStart().startsWith('import '));
    expect(importLines.some(l => l.includes('domain/'))).toBe(false);
  });
});
