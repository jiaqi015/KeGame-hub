import { describe, it, expect } from 'vitest';
import type { LegacyCaseLike } from '../legacyCaseContracts.js';
import { deriveLegacyCaseSegments, deriveLegacyCaseSegmentSummary } from '../legacy-case-segments.js';
import { deriveLegacyCaseOwnedReadModels, deriveLegacyCaseOwnedReadModelSummary } from '../legacy-case-owned-read-models.js';

describe('legacyCaseContracts', () => {
  it('LegacyCaseLike is satisfied by a minimal object with id', () => {
    const minimalCase: LegacyCaseLike = { id: 'test-1' };
    expect(minimalCase.id).toBe('test-1');
  });

  it('deriveLegacyCaseSegments works with a LegacyCaseLike input', () => {
    const minimalCase: LegacyCaseLike = {
      id: 'test-2',
      title: 'Test House',
      askPrice: 800,
      trust: 70,
      patience: 50,
      urgency: 60,
    } as LegacyCaseLike;
    const segments = deriveLegacyCaseSegments(minimalCase);
    expect(segments).toBeTruthy();
    expect(Object.isFrozen(segments)).toBe(true);
  });

  it('deriveLegacyCaseOwnedReadModels works with a LegacyCaseLike input', () => {
    const minimalCase: LegacyCaseLike = {
      id: 'test-3',
      title: 'Test House',
      askPrice: 800,
      trust: 70,
    } as LegacyCaseLike;
    const readModels = deriveLegacyCaseOwnedReadModels(minimalCase);
    expect(readModels).toBeTruthy();
    expect(readModels.legacyCaseId).toBe('test-3');
  });

  it('deriveLegacyCaseSegmentSummary works with a LegacyCaseLike input', () => {
    const minimalCase: LegacyCaseLike = { id: 'test-4' };
    const summary = deriveLegacyCaseSegmentSummary(minimalCase);
    expect(summary).toBeTruthy();
    expect(summary.totalFieldCount).toBeGreaterThanOrEqual(0);
  });

  it('deriveLegacyCaseOwnedReadModelSummary works with a LegacyCaseLike input', () => {
    const minimalCase: LegacyCaseLike = { id: 'test-5' };
    const summary = deriveLegacyCaseOwnedReadModelSummary(minimalCase);
    expect(summary).toBeTruthy();
    expect(summary.legacyCaseId).toBe('test-5');
  });

  it('legacyCaseContracts.ts does not import from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/world-state/legacyCaseContracts.ts'),
      'utf-8',
    );
    const importLines = source.split('\n').filter((l: string) => l.trimStart().startsWith('import '));
    expect(importLines.some((l: string) => l.includes('domain/'))).toBe(false);
  });

  it('legacy-case-segments.ts does not import Case from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/world-state/legacy-case-segments.ts'),
      'utf-8',
    );
    expect(source.includes("from '../../domain/models.js'")).toBe(false);
  });

  it('legacy-case-owned-read-models.ts does not import Case from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/world-state/legacy-case-owned-read-models.ts'),
      'utf-8',
    );
    expect(source.includes("from '../../domain/models.js'")).toBe(false);
  });
});
