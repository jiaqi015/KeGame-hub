import { describe, it, expect } from 'vitest';
import {
  LISTING_ENDING_TYPES,
  LISTING_ENDING_BUCKETS,
  OWNER_SATISFACTION_STATES,
  isListingEndingType,
  isListingEndingBucket,
  isOwnerSatisfactionState,
} from '../caseOutcomeTypes.js';

describe('caseOutcomeTypes', () => {
  it('LISTING_ENDING_TYPES has 8 values', () => {
    expect(LISTING_ENDING_TYPES).toHaveLength(8);
  });

  it('LISTING_ENDING_BUCKETS has 3 values', () => {
    expect(LISTING_ENDING_BUCKETS).toHaveLength(3);
  });

  it('OWNER_SATISFACTION_STATES has 5 values', () => {
    expect(OWNER_SATISFACTION_STATES).toHaveLength(5);
  });

  it('isListingEndingType validates correctly', () => {
    expect(isListingEndingType('sold_by_you_happy')).toBe(true);
    expect(isListingEndingType('withdrawn_unhappy')).toBe(true);
    expect(isListingEndingType('sold_unknown')).toBe(false);
  });

  it('isListingEndingBucket validates correctly', () => {
    expect(isListingEndingBucket('good')).toBe(true);
    expect(isListingEndingBucket('bad')).toBe(true);
    expect(isListingEndingBucket('great')).toBe(false);
  });

  it('isOwnerSatisfactionState validates correctly', () => {
    expect(isOwnerSatisfactionState('happy')).toBe(true);
    expect(isOwnerSatisfactionState('unhappy')).toBe(true);
    expect(isOwnerSatisfactionState('angry')).toBe(false);
  });

  it('caseOutcomeTypes.ts does not import from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/world-state/caseOutcomeTypes.ts'),
      'utf-8',
    );
    const importLines = source.split('\n').filter(l => l.trimStart().startsWith('import '));
    expect(importLines.some(l => l.includes('domain/'))).toBe(false);
  });
});
