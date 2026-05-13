import { describe, expect, it } from 'vitest';
import { compactWorldCausalEvents } from '../compaction.js';

describe('compactWorldCausalEvents — dangling ref cleanup', () => {
  it('removes dangling causeEventIds when referenced events are compacted away', () => {
    // Create a causal chain: root (day 1) → mid (day 2) → tip (day 3)
    // Compact to 1 event — only the tip survives, but its cause refs should be cleaned.
    const root = { id: 'evt-root', day: 1, causeEventIds: [] as readonly string[] };
    const mid = { id: 'evt-mid', day: 2, causeEventIds: ['evt-root'] as readonly string[] };
    const tip = { id: 'evt-tip', day: 3, causeEventIds: ['evt-mid', 'evt-root'] as readonly string[] };

    const result = compactWorldCausalEvents([root, mid, tip], 1);

    expect(result).toHaveLength(1);
    const surviving = result[0];
    expect(surviving.id).toBe('evt-tip');
    // Both referenced events were removed — causeEventIds should be empty
    expect(surviving.causeEventIds).toEqual([]);
  });

  it('preserves causeEventIds that reference surviving events', () => {
    const root = { id: 'evt-root', day: 1, causeEventIds: [] as readonly string[] };
    const mid = { id: 'evt-mid', day: 2, causeEventIds: ['evt-root'] as readonly string[] };
    const tip = { id: 'evt-tip', day: 3, causeEventIds: ['evt-mid'] as readonly string[] };

    // Keep 2: root gets removed (oldest root), mid and tip survive
    const result = compactWorldCausalEvents([root, mid, tip], 2);

    expect(result).toHaveLength(2);
    const ids = result.map((e) => e.id);
    expect(ids).toContain('evt-mid');
    expect(ids).toContain('evt-tip');

    const survivingMid = result.find((e) => e.id === 'evt-mid')!;
    // root was removed, so mid's cause ref should be cleaned
    expect(survivingMid.causeEventIds).toEqual([]);

    const survivingTip = result.find((e) => e.id === 'evt-tip')!;
    // mid survives, so tip's cause ref should be preserved
    expect(survivingTip.causeEventIds).toEqual(['evt-mid']);
  });

  it('returns events unchanged when under maxTotal', () => {
    const events = [
      { id: 'a', day: 1, causeEventIds: [] as readonly string[] },
      { id: 'b', day: 2, causeEventIds: ['a'] as readonly string[] },
    ];
    const result = compactWorldCausalEvents(events, 10);
    expect(result).toHaveLength(2);
    // Should return the same references (no mutation needed)
    expect(result[0]).toBe(events[0]);
    expect(result[1]).toBe(events[1]);
  });

  it('handles diamond dependency correctly', () => {
    // Diamond: root → left, root → right, tip → left + right
    const root = { id: 'root', day: 1, causeEventIds: [] as readonly string[] };
    const left = { id: 'left', day: 2, causeEventIds: ['root'] as readonly string[] };
    const right = { id: 'right', day: 2, causeEventIds: ['root'] as readonly string[] };
    const tip = { id: 'tip', day: 3, causeEventIds: ['left', 'right'] as readonly string[] };

    // Keep 2: root removed, left removed (same day, sorted by id)
    const result = compactWorldCausalEvents([root, left, right, tip], 2);

    expect(result).toHaveLength(2);
    const survivingTip = result.find((e) => e.id === 'tip')!;
    // left was removed, right survives
    expect(survivingTip.causeEventIds).toEqual(['right']);
  });

  it('never produces a result longer than maxTotal', () => {
    const events = Array.from({ length: 50 }, (_, i) => ({
      id: `evt-${i}`,
      day: i,
      causeEventIds: i > 0 ? [`evt-${i - 1}`] as readonly string[] : [] as readonly string[],
    }));

    for (const max of [1, 5, 10, 25, 50]) {
      const result = compactWorldCausalEvents(events, max);
      expect(result.length).toBeLessThanOrEqual(max);
    }
  });
});
