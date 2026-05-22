import { describe, it, expect } from 'vitest';
import type {
  AssetCaseStatus,
  OwnerPersonality,
  OpportunityStatus,
  OpportunityLifecycleStatus,
  OpportunityVisibility,
  OpportunityHistoryEntry,
} from '../caseTypeFragments.js';

describe('caseTypeFragments', () => {
  it('AssetCaseStatus accepts valid status values', () => {
    const statuses: AssetCaseStatus[] = ['active', 'sold', 'withdrawn', 'lost_to_rival'];
    expect(statuses).toHaveLength(4);
  });

  it('OwnerPersonality accepts valid personality values', () => {
    const personalities: OwnerPersonality[] = ['pragmatic', 'emotional', 'urgent'];
    expect(personalities).toHaveLength(3);
  });

  it('OpportunityStatus accepts valid status values', () => {
    const statuses: OpportunityStatus[] = ['active', 'won', 'lost', 'closed'];
    expect(statuses).toHaveLength(4);
  });

  it('OpportunityLifecycleStatus accepts valid values', () => {
    const statuses: OpportunityLifecycleStatus[] = ['active', 'stagnated', 'lost', 'closed_by_deal', 'closed_by_case'];
    expect(statuses).toHaveLength(5);
  });

  it('OpportunityVisibility accepts valid values', () => {
    const vis: OpportunityVisibility[] = ['shadow', 'revealed'];
    expect(vis).toHaveLength(2);
  });

  it('OpportunityHistoryEntry is a valid interface', () => {
    const entry: OpportunityHistoryEntry = { day: 5, stage: 'viewed' };
    expect(entry.day).toBe(5);
  });

  it('caseTypeFragments.ts does not import from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/world-state/caseTypeFragments.ts'),
      'utf-8',
    );
    const importLines = source.split('\n').filter((l: string) => l.trimStart().startsWith('import '));
    expect(importLines.some((l: string) => l.includes('domain/'))).toBe(false);
  });
});
