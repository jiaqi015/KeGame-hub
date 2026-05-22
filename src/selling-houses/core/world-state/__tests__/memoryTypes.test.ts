/**
 * memoryTypes.test.ts — TDD for typed agent knowledge categories and compaction policies.
 *
 * RED phase: these tests define the contract for:
 *   - KnowledgeType discrimination (perception / feedback / decision / reference)
 *   - classifyKnowledge() function based on source kind and content
 *   - Per-type compaction policies (max age, truncation, count limits)
 *   - compactKnowledgeByType() that applies policies with causal integrity
 */
import { describe, expect, it } from 'vitest';

// Imports will resolve once implementation exists
import type {
  KnowledgeType,
  KnowledgeEntry,
  CompactionPolicy,
} from '../knowledgeMemory/knowledgeTypes.js';

import {
  classifyKnowledge,
} from '../knowledgeMemory/knowledgeClassifier.js';

import {
  compactKnowledgeByType,
  COMPACTION_POLICIES,
} from '../knowledgeMemory/knowledgeCompaction.js';

import {
  toAgentMemoryFact,
  toAgentMemoryFacts,
  fromAgentMemoryFact,
  fromAgentMemoryFacts,
  compactAgentMemoryFacts,
} from '../knowledgeMemory/knowledgeMemoryAdapter.js';

import type { AgentMemoryFact } from '../agents/models.js';

// ── Helpers ──────────────────────────────────────────────────────

function makeEntry(overrides: Partial<KnowledgeEntry> & Pick<KnowledgeEntry, 'entryId' | 'type' | 'source' | 'content'>): KnowledgeEntry {
  return {
    tickAge: 0,
    caseId: 'case-1',
    causeIds: [],
    detail: 'some detail',
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════
// 1. KnowledgeType — type field has exactly 4 values
// ══════════════════════════════════════════════════════════════════

describe('KnowledgeType', () => {
  it('should have exactly four valid values', () => {
    const valid: KnowledgeType[] = ['perception', 'feedback', 'decision', 'reference'];
    expect(valid).toHaveLength(4);
    expect(valid).toContain('perception');
    expect(valid).toContain('feedback');
    expect(valid).toContain('decision');
    expect(valid).toContain('reference');
  });

  it('should produce a KnowledgeEntry with a type field', () => {
    const entry = makeEntry({
      entryId: 'ke-1',
      type: 'perception',
      source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
      content: '板块热度从 52 上升到 61',
    });
    expect(entry.type).toBe('perception');
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. classifyKnowledge — source kind → KnowledgeType mapping
// ══════════════════════════════════════════════════════════════════

describe('classifyKnowledge', () => {
  // --- perception: market signals, price data, heat indices ---

  it('should classify market_signal as perception', () => {
    expect(classifyKnowledge('market_signal', '板块热度从 52 上升到 61')).toBe('perception');
  });

  it('should classify micro_market_signal as perception', () => {
    expect(classifyKnowledge('micro_market_signal', '微板块供给增加')).toBe('perception');
  });

  it('should classify comparable_transaction as perception', () => {
    expect(classifyKnowledge('comparable_transaction', '和平里板块2室1厅成交价358万')).toBe('perception');
  });

  it('should classify platform_traffic as perception', () => {
    expect(classifyKnowledge('platform_traffic', '挂牌浏览量上升30%')).toBe('perception');
  });

  it('should classify supporting_facility_signal as perception', () => {
    expect(classifyKnowledge('supporting_facility_signal', '学区划分变化')).toBe('perception');
  });

  // --- feedback: owner reactions, customer responses, manager messages ---

  it('should classify owner_interview as feedback', () => {
    expect(classifyKnowledge('owner_interview', '业主期望420万但市场参考价390万')).toBe('feedback');
  });

  it('should classify customer_interaction as feedback', () => {
    expect(classifyKnowledge('customer_interaction', '客户完成带看，意向等级65')).toBe('feedback');
  });

  it('should classify manager_message as feedback', () => {
    expect(classifyKnowledge('manager_message', '经理分配聚焦房源')).toBe('feedback');
  });

  it('should classify owner_life_event_signal as feedback', () => {
    expect(classifyKnowledge('owner_life_event_signal', '业主家庭变故，急售意愿上升')).toBe('feedback');
  });

  it('should classify buyer_financing_signal as feedback', () => {
    expect(classifyKnowledge('buyer_financing_signal', '客户贷款预批通过')).toBe('feedback');
  });

  it('should classify broker_capacity_signal as feedback', () => {
    expect(classifyKnowledge('broker_capacity_signal', '经纪人精力不足')).toBe('feedback');
  });

  // --- decision: strategy choices, commitment decisions ---

  it('should classify player_action_receipt as decision', () => {
    expect(classifyKnowledge('player_action_receipt', '执行面访业主分型动作')).toBe('decision');
  });

  it('should classify process_receipt as decision', () => {
    expect(classifyKnowledge('process_receipt', '聚焦会完成，共识达成')).toBe('decision');
  });

  // --- reference: ACN, case IDs, broker IDs ---

  it('should classify acn_network_signal as reference', () => {
    expect(classifyKnowledge('acn_network_signal', 'acn-cooperative协作信号')).toBe('reference');
  });

  it('should classify rival_action as perception (observable market fact)', () => {
    expect(classifyKnowledge('rival_action', '竞品调价从380万降至365万')).toBe('perception');
  });

  it('should fallback to perception for unknown source kinds', () => {
    expect(classifyKnowledge('unknown_source_kind' as any, 'some content')).toBe('perception');
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. CompactionPolicy — per-type policies
// ══════════════════════════════════════════════════════════════════

describe('CompactionPolicy per type', () => {
  it('perception: max age 1 tick, aggressive detail truncation', () => {
    const policy = COMPACTION_POLICIES.perception;
    expect(policy.maxTickAge).toBe(1);
    expect(policy.truncateDetail).toBe(true);
    expect(policy.maxPerCase).toBeUndefined();
  });

  it('feedback: max age 5 ticks, preserve summary but truncate detail', () => {
    const policy = COMPACTION_POLICIES.feedback;
    expect(policy.maxTickAge).toBe(5);
    expect(policy.truncateDetail).toBe(true);
  });

  it('decision: no age limit, max 10 per case, oldest replaced', () => {
    const policy = COMPACTION_POLICIES.decision;
    expect(policy.maxTickAge).toBeUndefined();
    expect(policy.maxPerCase).toBe(10);
  });

  it('reference: never compacted, never expired', () => {
    const policy = COMPACTION_POLICIES.reference;
    expect(policy.maxTickAge).toBeUndefined();
    expect(policy.maxPerCase).toBeUndefined();
    expect(policy.truncateDetail).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 4. compactKnowledgeByType — applies per-type compaction
// ══════════════════════════════════════════════════════════════════

describe('compactKnowledgeByType', () => {
  it('should expire perception entries older than 1 tick', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-p1',
        type: 'perception',
        source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
        content: '板块热度从 52 上升到 61',
        tickAge: 0, // age at tick 4 = 4 > 1 → expire
      }),
      makeEntry({
        entryId: 'ke-p2',
        type: 'perception',
        source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
        content: '板块热度从 61 下降到 55',
        tickAge: 3, // age at tick 4 = 1 → keep (age <= maxTickAge)
      }),
    ];

    const result = compactKnowledgeByType(entries, /* currentTickAge */ 4);
    const surviving = result.filter((e) => e.type === 'perception');
    // ke-p1: age = 4 - 0 = 4 > 1 → expired
    // ke-p2: age = 4 - 3 = 1 <= 1 → survives
    expect(surviving).toHaveLength(1);
    expect(surviving[0].entryId).toBe('ke-p2');
  });

  it('should keep perception entries within 1 tick of age', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-p3',
        type: 'perception',
        source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
        content: '板块热度上升',
        tickAge: 2, // created at tick 2
      }),
    ];

    // currentTickAge = 2 → age = 0
    const result = compactKnowledgeByType(entries, 2);
    expect(result).toHaveLength(1);
    expect(result[0].entryId).toBe('ke-p3');
  });

  it('should truncate detail on perception entries when compacting', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-p4',
        type: 'perception',
        source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
        content: '板块热度上升',
        tickAge: 1,
        detail: 'Very long detail about market heat shift that should be truncated during compaction because perception entries are ephemeral',
      }),
    ];

    const result = compactKnowledgeByType(entries, 1);
    expect(result).toHaveLength(1);
    // perception with age 0 (tickAge=1, currentTickAge=1) survives but detail truncated
    expect(result[0].detail).toBe('');
  });

  it('should expire feedback entries older than 5 ticks', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-f1',
        type: 'feedback',
        source: { sourceKind: 'owner_interview', subtype: 'price_discussed' },
        content: '业主期望420万',
        tickAge: 0,
      }),
      makeEntry({
        entryId: 'ke-f2',
        type: 'feedback',
        source: { sourceKind: 'customer_interaction', subtype: 'viewing_completed' },
        content: '客户完成带看',
        tickAge: 2,
      }),
    ];

    // currentTickAge = 8 → f1 age = 8, f2 age = 6 → both > 5 → expire
    const result = compactKnowledgeByType(entries, 8);
    expect(result).toHaveLength(0);
  });

  it('should keep feedback entries within 5 ticks and truncate detail', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-f3',
        type: 'feedback',
        source: { sourceKind: 'owner_interview', subtype: 'price_discussed' },
        content: '业主期望420万',
        tickAge: 6,
        detail: 'Detailed owner feedback about price expectations and emotional state',
      }),
    ];

    // currentTickAge = 8 → age = 2 → keep, truncate detail
    const result = compactKnowledgeByType(entries, 8);
    expect(result).toHaveLength(1);
    expect(result[0].detail).toBe('');
  });

  it('should keep decision entries regardless of age, but cap at 10 per case', () => {
    const entries: KnowledgeEntry[] = Array.from({ length: 13 }, (_, i) =>
      makeEntry({
        entryId: `ke-d${i}`,
        type: 'decision',
        source: { sourceKind: 'player_action_receipt', subtype: 'action_executed' },
        content: `策略决策 ${i}`,
        tickAge: i,
        caseId: 'case-1',
      }),
    );

    const result = compactKnowledgeByType(entries, 12);
    const decisions = result.filter((e) => e.type === 'decision');
    expect(decisions).toHaveLength(10);
    // Oldest replaced: entries with tickAge 0, 1, 2 should be removed
    const survivingAges = decisions.map((e) => e.tickAge).sort((a, b) => a - b);
    expect(survivingAges).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('should never compact reference entries', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-r1',
        type: 'reference',
        source: { sourceKind: 'acn_network_signal', subtype: 'cooperation_opportunity' },
        content: 'acn-cooperative协作信号',
        tickAge: 0,
        detail: 'Full reference detail',
      }),
      makeEntry({
        entryId: 'ke-r2',
        type: 'reference',
        source: { sourceKind: 'acn_network_signal', subtype: 'rule_change' },
        content: 'ACN规则变化',
        tickAge: 100,
        detail: 'Another reference detail',
      }),
    ];

    const result = compactKnowledgeByType(entries, 100);
    expect(result).toHaveLength(2);
    expect(result[0].detail).toBe('Full reference detail');
    expect(result[1].detail).toBe('Another reference detail');
  });

  it('should preserve entries referenced as causes by surviving entries', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-p-old',
        type: 'perception',
        source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
        content: '旧的市场信号',
        tickAge: 0,
        causeIds: [],
      }),
      makeEntry({
        entryId: 'ke-d-new',
        type: 'decision',
        source: { sourceKind: 'player_action_receipt', subtype: 'action_executed' },
        content: '基于旧信号做出的决策',
        tickAge: 3,
        causeIds: ['ke-p-old'], // references the old perception
      }),
    ];

    // currentTickAge = 3 → perception age = 3 > 1 → would expire
    // BUT it's referenced as cause by a surviving decision → must be preserved
    const result = compactKnowledgeByType(entries, 3);
    const oldPerception = result.find((e) => e.entryId === 'ke-p-old');
    expect(oldPerception).toBeDefined();
    // Detail should still be truncated since it's a perception
    expect(oldPerception!.detail).toBe('');
  });

  it('should handle causal chains: transitive cause preservation', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-root',
        type: 'perception',
        source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
        content: '根市场信号',
        tickAge: 0,
        causeIds: [],
      }),
      makeEntry({
        entryId: 'ke-mid',
        type: 'feedback',
        source: { sourceKind: 'owner_interview', subtype: 'price_discussed' },
        content: '中间反馈',
        tickAge: 1,
        causeIds: ['ke-root'],
      }),
      makeEntry({
        entryId: 'ke-leaf',
        type: 'decision',
        source: { sourceKind: 'player_action_receipt', subtype: 'action_executed' },
        content: '最终决策',
        tickAge: 5,
        causeIds: ['ke-mid'],
      }),
    ];

    // currentTickAge = 5
    // root: perception, age=5 > 1 → would expire, but referenced by mid
    // mid: feedback, age=4 <= 5 → survives, but would it? Let me check...
    // Actually mid is tickAge=1, current=5, age=4, feedback max=5, so mid survives
    // root is referenced by surviving mid → root preserved
    const result = compactKnowledgeByType(entries, 5);
    expect(result.find((e) => e.entryId === 'ke-root')).toBeDefined();
    expect(result.find((e) => e.entryId === 'ke-mid')).toBeDefined();
    expect(result.find((e) => e.entryId === 'ke-leaf')).toBeDefined();
  });

  it('should handle mixed types with independent compaction', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-m1',
        type: 'perception',
        source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
        content: '新鲜市场信号',
        tickAge: 9,
      }),
      makeEntry({
        entryId: 'ke-m2',
        type: 'perception',
        source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
        content: '过期市场信号',
        tickAge: 5,
      }),
      makeEntry({
        entryId: 'ke-m3',
        type: 'feedback',
        source: { sourceKind: 'owner_interview', subtype: 'urgency_revealed' },
        content: '业主反馈',
        tickAge: 7,
      }),
      makeEntry({
        entryId: 'ke-m4',
        type: 'decision',
        source: { sourceKind: 'process_receipt', subtype: 'focus_meeting_completed' },
        content: '聚焦会决策',
        tickAge: 3,
      }),
      makeEntry({
        entryId: 'ke-m5',
        type: 'reference',
        source: { sourceKind: 'acn_network_signal', subtype: 'cooperation_opportunity' },
        content: 'ACN协作',
        tickAge: 1,
      }),
    ];

    // currentTickAge = 10
    // m1: perception age=1 → keep, detail truncated
    // m2: perception age=5 → expire
    // m3: feedback age=3 → keep, detail truncated
    // m4: decision → keep (no age limit)
    // m5: reference → keep (never compacted)
    const result = compactKnowledgeByType(entries, 10);
    expect(result).toHaveLength(4);
    expect(result.find((e) => e.entryId === 'ke-m2')).toBeUndefined();
    expect(result.find((e) => e.entryId === 'ke-m1')!.detail).toBe('');
    expect(result.find((e) => e.entryId === 'ke-m3')!.detail).toBe('');
    expect(result.find((e) => e.entryId === 'ke-m4')!.detail).toBe('some detail');
    expect(result.find((e) => e.entryId === 'ke-m5')!.detail).toBe('some detail');
  });

  it('should handle empty entries array', () => {
    const result = compactKnowledgeByType([], 10);
    expect(result).toEqual([]);
  });

  it('should separate decision caps per case', () => {
    const entries: KnowledgeEntry[] = [
      ...Array.from({ length: 12 }, (_, i) =>
        makeEntry({
          entryId: `ke-case1-d${i}`,
          type: 'decision',
          source: { sourceKind: 'player_action_receipt', subtype: 'action_executed' },
          content: `case-1 决策 ${i}`,
          tickAge: i,
          caseId: 'case-1',
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeEntry({
          entryId: `ke-case2-d${i}`,
          type: 'decision',
          source: { sourceKind: 'player_action_receipt', subtype: 'action_executed' },
          content: `case-2 决策 ${i}`,
          tickAge: i,
          caseId: 'case-2',
        }),
      ),
    ];

    const result = compactKnowledgeByType(entries, 11);
    const case1Decisions = result.filter((e) => e.caseId === 'case-1' && e.type === 'decision');
    const case2Decisions = result.filter((e) => e.caseId === 'case-2' && e.type === 'decision');
    expect(case1Decisions).toHaveLength(10);
    expect(case2Decisions).toHaveLength(3);
  });

  it('should not preserve cause entries that have no surviving dependents', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-old-perception',
        type: 'perception',
        source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
        content: '旧市场信号',
        tickAge: 0,
        causeIds: [],
      }),
      makeEntry({
        entryId: 'ke-old-feedback',
        type: 'feedback',
        source: { sourceKind: 'owner_interview', subtype: 'price_discussed' },
        content: '旧反馈（也过期了）',
        tickAge: 0,
        causeIds: ['ke-old-perception'],
      }),
    ];

    // Both are expired: perception age=10>1, feedback age=10>5
    // feedback references perception as cause, but feedback itself is expired
    // So neither should survive
    const result = compactKnowledgeByType(entries, 10);
    expect(result).toHaveLength(0);
  });

  it('should handle perception at exact age boundary (age = maxTickAge)', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-boundary',
        type: 'perception',
        source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
        content: '边界年龄的市场信号',
        tickAge: 5,
      }),
    ];

    // age = 6 - 5 = 1 = maxTickAge → survives (age <= maxTickAge)
    const result = compactKnowledgeByType(entries, 6);
    expect(result).toHaveLength(1);
  });

  it('should handle feedback at exact age boundary', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-fb-boundary',
        type: 'feedback',
        source: { sourceKind: 'customer_interaction', subtype: 'viewing_completed' },
        content: '边界年龄的反馈',
        tickAge: 3,
      }),
    ];

    // age = 8 - 3 = 5 = maxTickAge → survives
    const result = compactKnowledgeByType(entries, 8);
    expect(result).toHaveLength(1);
  });

  it('should preserve content field even when detail is truncated', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-content-preserved',
        type: 'feedback',
        source: { sourceKind: 'owner_interview', subtype: 'trust_expressed' },
        content: '业主表达信任',
        tickAge: 5,
        detail: 'This detail should be truncated but content must remain intact',
      }),
    ];

    const result = compactKnowledgeByType(entries, 8);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('业主表达信任');
    expect(result[0].detail).toBe('');
  });

  it('should not double-truncate entries that already have empty detail', () => {
    const entries: KnowledgeEntry[] = [
      makeEntry({
        entryId: 'ke-no-detail',
        type: 'perception',
        source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
        content: '无详情的市场信号',
        tickAge: 5,
        detail: '',
      }),
    ];

    const result = compactKnowledgeByType(entries, 5);
    expect(result).toHaveLength(1);
    expect(result[0].detail).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════
// 5. KnowledgeMemoryAdapter — bridge to existing AgentMemoryFact
// ══════════════════════════════════════════════════════════════════

describe('KnowledgeMemoryAdapter', () => {
  describe('toAgentMemoryFact', () => {
    it('should convert a KnowledgeEntry to AgentMemoryFact', () => {
      const entry = makeEntry({
        entryId: 'ke-adapter-1',
        type: 'perception',
        source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
        content: '板块热度上升',
        tickAge: 5,
        caseId: 'case-1',
      });

      const fact = toAgentMemoryFact(entry);
      expect(fact.factId).toBe('ke-adapter-1');
      expect(fact.kind).toBe('knowledge:perception');
      expect(fact.summary).toBe('板块热度上升');
      expect(fact.scope?.caseId).toBe('case-1');
      expect(fact.createdAtDay).toBe(5);
    });

    it('should map causeIds to sourceRef', () => {
      const entry = makeEntry({
        entryId: 'ke-adapter-2',
        type: 'decision',
        source: { sourceKind: 'player_action_receipt', subtype: 'action_executed' },
        content: '决策记录',
        causeIds: ['ke-cause-1', 'ke-cause-2'],
      });

      const fact = toAgentMemoryFact(entry);
      expect(fact.sourceRef).toBeDefined();
      expect(fact.sourceRef!.refType).toBe('cause');
      expect(fact.sourceRef!.refId).toBe('ke-cause-1');
    });

    it('should assign strength based on type', () => {
      const perception = toAgentMemoryFact(makeEntry({
        entryId: 'p1', type: 'perception',
        source: { sourceKind: 'market_signal', subtype: 'heat_shift' },
        content: 'p',
      }));
      const feedback = toAgentMemoryFact(makeEntry({
        entryId: 'f1', type: 'feedback',
        source: { sourceKind: 'owner_interview', subtype: 'price_discussed' },
        content: 'f',
      }));
      const decision = toAgentMemoryFact(makeEntry({
        entryId: 'd1', type: 'decision',
        source: { sourceKind: 'player_action_receipt', subtype: 'action_executed' },
        content: 'd',
      }));
      const reference = toAgentMemoryFact(makeEntry({
        entryId: 'r1', type: 'reference',
        source: { sourceKind: 'acn_network_signal', subtype: 'cooperation_opportunity' },
        content: 'r',
      }));

      expect(perception.strength).toBeLessThan(feedback.strength);
      expect(feedback.strength).toBeLessThan(decision.strength);
      expect(decision.strength).toBeLessThan(reference.strength);
    });
  });

  describe('fromAgentMemoryFact', () => {
    it('should convert a typed AgentMemoryFact back to KnowledgeEntry', () => {
      const fact: AgentMemoryFact = {
        factId: 'fact-1',
        agentId: 'broker-1',
        kind: 'knowledge:feedback',
        summary: '业主期望420万',
        strength: 0.7,
        scope: { caseId: 'case-1' },
        createdAtDay: 5,
      };

      const entry = fromAgentMemoryFact(fact, 'owner_interview');
      expect(entry).not.toBeNull();
      expect(entry!.entryId).toBe('fact-1');
      expect(entry!.type).toBe('feedback');
      expect(entry!.content).toBe('业主期望420万');
    });

    it('should classify untyped facts using sourceKind', () => {
      const fact: AgentMemoryFact = {
        factId: 'fact-2',
        agentId: 'broker-1',
        kind: 'market_observation',
        summary: '板块热度上升',
        strength: 0.8,
      };

      const entry = fromAgentMemoryFact(fact, 'market_signal');
      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('perception');
    });

    it('should default to perception for facts without type or sourceKind', () => {
      const fact: AgentMemoryFact = {
        factId: 'fact-3',
        agentId: 'broker-1',
        kind: 'generic_fact',
        summary: 'some fact',
        strength: 0.5,
      };

      const entry = fromAgentMemoryFact(fact);
      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('perception');
    });
  });

  describe('compactAgentMemoryFacts', () => {
    it('should apply typed compaction to AgentMemoryFact array', () => {
      const facts: AgentMemoryFact[] = [
        {
          factId: 'fact-perception-old',
          agentId: 'broker-1',
          kind: 'knowledge:perception',
          summary: '旧市场信号',
          strength: 0.5,
          createdAtDay: 0,
        },
        {
          factId: 'fact-perception-new',
          agentId: 'broker-1',
          kind: 'knowledge:perception',
          summary: '新市场信号',
          strength: 0.5,
          createdAtDay: 9,
        },
        {
          factId: 'fact-reference',
          agentId: 'broker-1',
          kind: 'knowledge:reference',
          summary: 'ACN协作',
          strength: 1.0,
          createdAtDay: 0,
        },
      ];

      // currentTickAge = 10
      // perception-old: age = 10 - 0 = 10 > 1 → expire
      // perception-new: age = 10 - 9 = 1 → keep
      // reference: never expire → keep
      const result = compactAgentMemoryFacts(facts, 10);
      expect(result).toHaveLength(2);
      expect(result.find((f) => f.factId === 'fact-perception-new')).toBeDefined();
      expect(result.find((f) => f.factId === 'fact-reference')).toBeDefined();
    });

    it('should handle facts without knowledge: prefix using sourceKindMap', () => {
      const facts: AgentMemoryFact[] = [
        {
          factId: 'fact-market',
          agentId: 'broker-1',
          kind: 'market_observation',
          summary: '市场观察',
          strength: 0.6,
          createdAtDay: 8,
        },
      ];

      const sourceKindMap = new Map<string, import('../../../domain/world-model/informationSourceTypes.js').SourceKind>();
      sourceKindMap.set('fact-market', 'market_signal');

      // currentTickAge = 9 → age = 1 → keep (perception maxTickAge = 1)
      const result = compactAgentMemoryFacts(facts, 9, sourceKindMap);
      expect(result).toHaveLength(1);
    });
  });
});
