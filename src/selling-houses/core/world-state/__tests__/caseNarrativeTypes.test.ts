import { describe, it, expect } from 'vitest';
import {
  TONES,
  STORYLINE_STATES,
  GOAL_TIERS,
  isTone,
  isStorylineState,
  isGoalTier,
} from '../caseNarrativeTypes.js';

describe('caseNarrativeTypes', () => {
  it('TONES has 3 values', () => {
    expect(TONES).toHaveLength(3);
  });

  it('STORYLINE_STATES has 4 values', () => {
    expect(STORYLINE_STATES).toHaveLength(4);
  });

  it('GOAL_TIERS has 3 values', () => {
    expect(GOAL_TIERS).toHaveLength(3);
  });

  it('isTone validates correctly', () => {
    expect(isTone('accent')).toBe(true);
    expect(isTone('danger')).toBe(true);
    expect(isTone('success')).toBe(true);
    expect(isTone('info')).toBe(false);
    expect(isTone(42)).toBe(false);
  });

  it('isStorylineState validates correctly', () => {
    expect(isStorylineState('healthy')).toBe(true);
    expect(isStorylineState('fragile')).toBe(true);
    expect(isStorylineState('sliding')).toBe(true);
    expect(isStorylineState('critical')).toBe(true);
    expect(isStorylineState('broken')).toBe(false);
  });

  it('isGoalTier validates correctly', () => {
    expect(isGoalTier('core')).toBe(true);
    expect(isGoalTier('important')).toBe(true);
    expect(isGoalTier('normal')).toBe(true);
    expect(isGoalTier('premium')).toBe(false);
  });

  it('caseNarrativeTypes.ts does not import from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/world-state/caseNarrativeTypes.ts'),
      'utf-8',
    );
    const importLines = source.split('\n').filter(l => l.trimStart().startsWith('import '));
    expect(importLines.some(l => l.includes('domain/'))).toBe(false);
  });
});
