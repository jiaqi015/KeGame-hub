import { describe, expect, it } from 'vitest';
import { buildLiveCausalContext, buildBecauseBigProof } from '../projections/bigWorldPOVProjection.js';
import type { GameState } from '../../domain/models.js';
import type { ColdLedgerSummary } from '../../domain/world-model/runtime/types.js';

describe('bigWorldPOVProjection — ColdLedgerSummary fallback and compaction tests', () => {
  const mockCaseId = 'case-1';
  const mockCellId = 'cell-1';

  // Helper to create a bare minimum mock GameState
  function createMockGameState(overrides: Partial<GameState> = {}): GameState {
    const baseState: Partial<GameState> = {
      day: 5,
      cases: [
        {
          id: mockCaseId,
          marketCellId: mockCellId,
          title: 'Mock Case Title',
          priceGapPct: 10,
          patience: 40,
          trust: 40,
        } as any,
      ],
      worldCausalEvents: [],
      markets: [
        {
          id: mockCellId,
          name: 'Mock Market Cell',
          demandHeat: 50,
          supplyPressure: 50,
          competitivePressure: 50,
        } as any,
      ],
      marketShadow: {
        rivalListings: [],
      } as any,
      customerStates: [],
      opportunities: [],
      bigWorldRuntime: {
        dailySummaries: [],
        coldLedgerSummaries: [],
      } as any,
      runContext: {
        runSeed: 12345,
      } as any,
    };
    return { ...baseState, ...overrides } as GameState;
  }

  it('buildLiveCausalContext falls back to coldLedgerSummaries when worldCausalEvents is empty due to compaction', () => {
    // 1. Arrange: No live events, but summaries exist
    const mockColdSummary: ColdLedgerSummary = {
      fromDay: 1,
      toDay: 4,
      totalSourceRecords: 10,
      totalCausalEventsFromSources: 10,
      bySourceKind: new Map([
        ['rival_action', { count: 1, causalEventsProduced: 1 }],
        ['customer_interaction', { count: 2, causalEventsProduced: 2 }],
        ['owner_life_event_signal', { count: 1, causalEventsProduced: 1 }],
        ['manager_message', { count: 1, causalEventsProduced: 1 }],
      ]) as any,
      latestSourceIdByKind: new Map([
        ['rival_action', 'isr-rival-1'],
        ['customer_interaction', 'isr-customer-1'],
        ['owner_life_event_signal', 'isr-owner-1'],
        ['manager_message', 'isr-manager-1'],
      ]) as any,
      latestReplayKeyByKind: new Map() as any,
      totalPhaseEvents: 0,
      totalMutations: 0,
    };

    const state = createMockGameState({
      bigWorldRuntime: {
        dailySummaries: [],
        coldLedgerSummaries: [mockColdSummary],
      } as any,
    });

    // 2. Act
    const ctx = buildLiveCausalContext(state, mockCaseId);

    // 3. Assert: Verify the fallback to cold summarization works and resolves to expected fallback refs
    expect(ctx.rivalRefs).toHaveLength(1);
    expect(ctx.rivalRefs[0]).toEqual({
      refType: 'rival-listing',
      refId: 'isr-rival-1',
      refLabel: '竞品历史动作 (Day 1-4)',
    });

    expect(ctx.customerRefs).toHaveLength(1);
    expect(ctx.customerRefs[0]).toEqual({
      refType: 'market-signal',
      refId: 'isr-customer-1',
      refLabel: '客户历史需求变化 (Day 1-4)',
    });

    expect(ctx.ownerRefs).toHaveLength(1);
    expect(ctx.ownerRefs[0]).toEqual({
      refType: 'case',
      refId: 'isr-owner-1',
      refLabel: '业主历史压力感知 (Day 1-4)',
    });

    expect(ctx.recommendationRefs).toHaveLength(1);
    expect(ctx.recommendationRefs[0]).toEqual({
      refType: 'market-signal',
      refId: 'isr-manager-1',
      refLabel: '历史策略建议 (Day 1-4)',
    });
  });

  it('buildBecauseBigProof correctly integrates coldSummaries into evidence sections when compacted', () => {
    // 1. Arrange: No live events, but summaries exist
    const mockColdSummary: ColdLedgerSummary = {
      fromDay: 1,
      toDay: 4,
      totalSourceRecords: 10,
      totalCausalEventsFromSources: 10,
      bySourceKind: new Map([
        ['rival_action', { count: 3, causalEventsProduced: 3 }],
        ['customer_interaction', { count: 5, causalEventsProduced: 5 }],
        ['owner_life_event_signal', { count: 2, causalEventsProduced: 2 }],
      ]) as any,
      latestSourceIdByKind: new Map([
        ['rival_action', 'isr-rival-1'],
        ['customer_interaction', 'isr-customer-1'],
        ['owner_life_event_signal', 'isr-owner-1'],
      ]) as any,
      latestReplayKeyByKind: new Map() as any,
      totalPhaseEvents: 0,
      totalMutations: 0,
    };

    const state = createMockGameState({
      bigWorldRuntime: {
        dailySummaries: [],
        coldLedgerSummaries: [mockColdSummary],
      } as any,
    });

    // 2. Act
    const proof = buildBecauseBigProof(state, mockCaseId);

    // 3. Assert: Verify the output does not contain generic "0 条" or empty texts, and fallback descriptions are correctly populated from cold summaries
    const rivalMovement = proof.movementEvidence.find(e => e.kind === 'rival-movement');
    expect(rivalMovement).toBeDefined();
    expect(rivalMovement!.headline).toBe('历史记录 3 次竞品动作');
    expect(rivalMovement!.detail).toBe('历史归档的竞品动作记录，持续分流潜在客户注意力。');

    const demandShift = proof.movementEvidence.find(e => e.kind === 'demand-shift');
    expect(demandShift).toBeDefined();
    expect(demandShift!.headline).toBe('历史记录 5 次客户需求变动');
    expect(demandShift!.detail).toBe('历史归档的客户比对及注意力事件，表明需求正在流动。');

    const ownerPressure = proof.movementEvidence.find(e => e.kind === 'owner-pressure');
    expect(ownerPressure).toBeDefined();
    expect(ownerPressure!.headline).toBe('历史归档 2 次业主压力波动');
    expect(ownerPressure!.detail).toBe('历史压力记录表明业主对价格偏差持续敏感，建议适时面访。');
  });

  it('buildLiveCausalContext supports plain objects for map properties (de-serialization compatibility)', () => {
    // When serialized and hydrated, Maps can turn into plain objects. Let's make sure our getFromMapOrObject helper handles this correctly.
    const mockColdSummary: any = {
      fromDay: 1,
      toDay: 4,
      bySourceKind: {
        'rival_action': { count: 2 },
      },
      latestSourceIdByKind: {
        'rival_action': 'isr-rival-obj',
      },
      latestReplayKeyByKind: {},
    };

    const state = createMockGameState({
      bigWorldRuntime: {
        dailySummaries: [],
        coldLedgerSummaries: [mockColdSummary],
      } as any,
    });

    const ctx = buildLiveCausalContext(state, mockCaseId);

    expect(ctx.rivalRefs).toHaveLength(1);
    expect(ctx.rivalRefs[0].refId).toBe('isr-rival-obj');
  });
});
