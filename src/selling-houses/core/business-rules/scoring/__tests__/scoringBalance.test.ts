import { describe, it, expect } from 'vitest';
import { SCORING_BALANCE } from '../scoringBalance.js';

describe('scoringBalance', () => {
  it('competitivenessWeights sum to 1', () => {
    const w = SCORING_BALANCE.competitivenessWeights;
    const sum = w.d1 + w.d2 + w.d3;
    expect(Math.abs(sum - 1)).toBeLessThan(0.001);
  });

  it('d2AxisWeights sum to 1', () => {
    const w = SCORING_BALANCE.d2AxisWeights;
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.001);
  });

  it('d3SignalWeights sum to 1', () => {
    const w = SCORING_BALANCE.d3SignalWeights;
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.001);
  });

  it('d1SignalWeights sum to 1', () => {
    const w = SCORING_BALANCE.d1SignalWeights;
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.001);
  });

  it('portalUrgencyWeights sum to 1', () => {
    const w = SCORING_BALANCE.portalUrgencyWeights;
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.001);
  });

  it('SCORING_BALANCE values are stable (key numeric checks)', () => {
    expect(SCORING_BALANCE.competitivenessWeights.d1).toBe(0.5);
    expect(SCORING_BALANCE.d3Normalization.priceFlexFullScale).toBe(10);
    expect(SCORING_BALANCE.d3Normalization.consistencyBaseline).toBe(80);
    expect(SCORING_BALANCE.d2AxisWeights.layout).toBe(0.2);
  });

  it('scoringBalance.ts does not import from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/business-rules/scoring/scoringBalance.ts'),
      'utf-8',
    );
    const importLines = source.split('\n').filter(l => l.trimStart().startsWith('import '));
    expect(importLines.some(l => l.includes('domain/'))).toBe(false);
  });
});
