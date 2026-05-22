import { describe, it, expect } from 'vitest';
import type { MarketCell } from '../marketTypes.js';

describe('marketTypes', () => {
  it('MarketCell interface is satisfied by a well-typed object', () => {
    const cell: MarketCell = {
      id: 'mc-1',
      name: '浦东前滩',
      demandHeat: 75,
      supplyPressure: 40,
      competitivePressure: 60,
      sentiment: 55,
    };
    expect(cell.id).toBe('mc-1');
    expect(cell.monthlyFactors).toBeUndefined();
  });

  it('MarketCell with monthlyFactors is accepted', () => {
    const cell: MarketCell = {
      id: 'mc-2',
      name: '静安寺北',
      demandHeat: 80,
      supplyPressure: 35,
      competitivePressure: 70,
      sentiment: 65,
      monthlyFactors: [1.0, 1.1, 0.9],
    };
    expect(cell.monthlyFactors).toHaveLength(3);
  });

  it('marketTypes.ts does not import from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/world-state/marketTypes.ts'),
      'utf-8',
    );
    const importLines = source.split('\n').filter((l: string) => l.trimStart().startsWith('import '));
    expect(importLines.some((l: string) => l.includes('domain/'))).toBe(false);
  });
});
