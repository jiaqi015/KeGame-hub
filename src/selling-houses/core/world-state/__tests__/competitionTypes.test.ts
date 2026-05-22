import { describe, it, expect } from 'vitest';
import type { CompetitionGroup } from '../competitionTypes.js';

describe('competitionTypes', () => {
  it('CompetitionGroup interface is satisfied by a well-typed object', () => {
    const group: CompetitionGroup = {
      id: 'cg-1',
      name: '前滩竞品组',
      members: ['case-1', 'case-2', 'case-3'],
      priceElasticity: 0.8,
      customerSpillover: 0.3,
    };
    expect(group.members).toHaveLength(3);
  });

  it('competitionTypes.ts does not import from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/world-state/competitionTypes.ts'),
      'utf-8',
    );
    const importLines = source.split('\n').filter((l: string) => l.trimStart().startsWith('import '));
    expect(importLines.some((l: string) => l.includes('domain/'))).toBe(false);
  });
});
