import { describe, expect, it } from 'vitest';
import {
  type KnowledgeType,
  type KnowledgeEntry,
  type CompactionPolicy,
} from '../knowledgeMemory/knowledgeTypes.js';
import { classifyKnowledge } from '../knowledgeMemory/knowledgeClassifier.js';
import { compactKnowledgeByType, COMPACTION_POLICIES } from '../knowledgeMemory/knowledgeCompaction.js';
import type { SourceKind } from '../sourceKinds.js';

describe('knowledgeTypes — Perception/Feedback/Decision/Reference classification', () => {
  // ── Classification by source kind ──────────────────────────────────────

  it('classifies market_signal as perception', () => {
    expect(classifyKnowledge('market_signal', '')).toBe('perception');
  });

  it('classifies platform_traffic as perception', () => {
    expect(classifyKnowledge('platform_traffic', '')).toBe('perception');
  });

  it('classifies micro_market_signal as perception', () => {
    expect(classifyKnowledge('micro_market_signal', '')).toBe('perception');
  });

  it('classifies comparable_transaction as perception', () => {
    expect(classifyKnowledge('comparable_transaction', '')).toBe('perception');
  });

  it('classifies rival_action as perception', () => {
    expect(classifyKnowledge('rival_action', '')).toBe('perception');
  });

  it('classifies supporting_facility_signal as perception', () => {
    expect(classifyKnowledge('supporting_facility_signal', '')).toBe('perception');
  });

  it('classifies customer_interaction as feedback', () => {
    expect(classifyKnowledge('customer_interaction', '')).toBe('feedback');
  });

  it('classifies owner_interview as feedback', () => {
    expect(classifyKnowledge('owner_interview', '')).toBe('feedback');
  });

  it('classifies manager_message as feedback', () => {
    expect(classifyKnowledge('manager_message', '')).toBe('feedback');
  });

  it('classifies broker_capacity_signal as feedback', () => {
    expect(classifyKnowledge('broker_capacity_signal', '')).toBe('feedback');
  });

  it('classifies owner_life_event_signal as feedback', () => {
    expect(classifyKnowledge('owner_life_event_signal', '')).toBe('feedback');
  });

  it('classifies buyer_financing_signal as feedback', () => {
    expect(classifyKnowledge('buyer_financing_signal', '')).toBe('feedback');
  });

  it('classifies player_action_receipt as decision', () => {
    expect(classifyKnowledge('player_action_receipt', '')).toBe('decision');
  });

  it('classifies process_receipt as decision', () => {
    expect(classifyKnowledge('process_receipt', '')).toBe('decision');
  });

  it('classifies acn_network_signal as reference', () => {
    expect(classifyKnowledge('acn_network_signal', '')).toBe('reference');
  });

  it('every SourceKind has a classification', () => {
    const allKinds: SourceKind[] = [
      'market_signal', 'rival_action', 'customer_interaction', 'owner_interview',
      'manager_message', 'player_action_receipt', 'process_receipt',
      'comparable_transaction', 'platform_traffic', 'acn_network_signal',
      'supporting_facility_signal', 'broker_capacity_signal',
      'owner_life_event_signal', 'buyer_financing_signal', 'micro_market_signal',
    ];
    for (const kind of allKinds) {
      const result = classifyKnowledge(kind, '');
      expect(['perception', 'feedback', 'decision', 'reference']).toContain(result);
    }
  });

  // ── Compaction policies ────────────────────────────────────────────────

  it('perception has maxTickAge 1 and aggressive truncation', () => {
    const policy = COMPACTION_POLICIES.perception;
    expect(policy.maxTickAge).toBe(1);
    expect(policy.truncateDetail).toBe(true);
  });

  it('feedback has maxTickAge 5 and preserves summary', () => {
    const policy = COMPACTION_POLICIES.feedback;
    expect(policy.maxTickAge).toBe(5);
    expect(policy.truncateDetail).toBe(true);
  });

  it('decision has no age limit but maxPerCase 10', () => {
    const policy = COMPACTION_POLICIES.decision;
    expect(policy.maxTickAge).toBeUndefined();
    expect(policy.maxPerCase).toBe(10);
  });

  it('reference is never compacted', () => {
    const policy = COMPACTION_POLICIES.reference;
    expect(policy.maxTickAge).toBeUndefined();
    expect(policy.maxPerCase).toBeUndefined();
    expect(policy.truncateDetail).toBe(false);
  });

  // ── Compaction by type ─────────────────────────────────────────────────

  const makeEntry = (
    entryId: string,
    type: KnowledgeType,
    tickAge: number,
    caseId: string,
    causeIds?: string[],
  ): KnowledgeEntry => Object.freeze({
    entryId,
    type,
    source: { sourceKind: 'market_signal' as SourceKind, subtype: 'heat_shift' },
    content: `entry-${entryId}`,
    detail: `detail-${entryId}`,
    tickAge,
    caseId,
    causeIds: Object.freeze(causeIds ?? []),
  });

  it('compacts perception entries older than 1 tick', () => {
    const entries = [
      makeEntry('p1', 'perception', 1, 'case-a'),
      makeEntry('p2', 'perception', 2, 'case-a'),
      makeEntry('p3', 'perception', 3, 'case-a'),
    ];
    const result = compactKnowledgeByType(entries, 3);
    // p1: age = 3-1 = 2 > 1 → expired
    // p2: age = 3-2 = 1 <= 1 → survives
    // p3: age = 3-3 = 0 <= 1 → survives
    expect(result.map((e) => e.entryId)).toEqual(['p2', 'p3']);
  });

  it('preserves perception entry that is cause of a surviving entry', () => {
    const entries = [
      makeEntry('p1', 'perception', 1, 'case-a'),
      makeEntry('f1', 'feedback', 3, 'case-a', ['p1']), // f1 references p1 as cause
    ];
    const result = compactKnowledgeByType(entries, 3);
    // p1 is old but f1 references it as cause — preserved for causal integrity
    expect(result.map((e) => e.entryId)).toContain('p1');
  });

  it('compacts feedback entries older than 5 ticks', () => {
    const entries = [
      makeEntry('f1', 'feedback', 1, 'case-a'),
      makeEntry('f2', 'feedback', 5, 'case-a'),
      makeEntry('f3', 'feedback', 10, 'case-a'),
    ];
    const result = compactKnowledgeByType(entries, 10);
    // f1 is 9 ticks old (>5), f2 is 5 ticks old (=5, kept), f3 is current
    expect(result.map((e) => e.entryId)).toEqual(['f2', 'f3']);
  });

  it('truncates detail on perception entries that survive', () => {
    const entries = [
      makeEntry('p1', 'perception', 3, 'case-a'), // current tick, kept
    ];
    const result = compactKnowledgeByType(entries, 3);
    const perception = result.find((e) => e.entryId === 'p1');
    expect(perception?.detail).toBe('');
  });

  it('truncates detail on feedback entries that survive', () => {
    const entries = [
      makeEntry('f1', 'feedback', 10, 'case-a'), // current tick, kept
    ];
    const result = compactKnowledgeByType(entries, 10);
    const feedback = result.find((e) => e.entryId === 'f1');
    expect(feedback?.detail).toBe('');
  });

  it('keeps decision entries up to maxPerCase limit', () => {
    const entries = Array.from({ length: 13 }, (_, i) =>
      makeEntry(`d${i}`, 'decision', i + 1, 'case-a'),
    );
    const result = compactKnowledgeByType(entries, 13);
    const decisions = result.filter((e) => e.type === 'decision');
    expect(decisions).toHaveLength(10);
    // Most recent 10 survive
    expect(decisions[0].entryId).toBe('d3');
    expect(decisions[9].entryId).toBe('d12');
  });

  it('never compacts reference entries', () => {
    const entries = [
      makeEntry('r1', 'reference', 1, 'case-a'),
      makeEntry('r2', 'reference', 50, 'case-a'),
    ];
    const result = compactKnowledgeByType(entries, 100);
    expect(result).toHaveLength(2);
  });

  it('handles mixed types correctly', () => {
    const entries = [
      makeEntry('p1', 'perception', 1, 'case-a'),    // expired
      makeEntry('f1', 'feedback', 5, 'case-a'),       // within 5 ticks
      makeEntry('d1', 'decision', 1, 'case-a'),       // kept
      makeEntry('r1', 'reference', 1, 'case-a'),      // kept
    ];
    const result = compactKnowledgeByType(entries, 5);
    expect(result.map((e) => e.entryId)).toEqual(['f1', 'd1', 'r1']);
  });

  // ── Structural: SourceKind stays in core, never re-imported from domain ──

  it('knowledgeTypes imports SourceKind from core (not domain)', async () => {
    // If this test fails, someone re-introduced a core→domain import for SourceKind.
    // The canonical SourceKind lives in core/world-state/sourceKinds.ts.
    const fs = await import('fs');
    const path = await import('path');
    const knowledgeTypesSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/selling-houses/core/world-state/knowledgeMemory/knowledgeTypes.ts'),
      'utf-8',
    );
    expect(knowledgeTypesSource).not.toContain('domain/world-model/informationSourceTypes');
    expect(knowledgeTypesSource).toContain('sourceKinds');
  });
});
