import { describe, expect, it } from 'vitest';
import { computeDailyResourceSnapshot } from '../marketEconomyRuntime.js';
import type { BigWorldClockInput } from '../types.js';
import type { InformationSourceRecord } from '../../informationSourceTypes.js';

describe('computeDailyResourceSnapshot — trust/patience fallback behavior', () => {
  const baseInput: BigWorldClockInput = {
    settledDay: 1,
    runSeed: 42,
    marketCells: [],
    activeCases: [],
    activeOpportunities: [],
    rivalListings: [],
    rivalStores: [],
    customerStates: [],
  };

  it('preserves legacy fallback behavior when there are no action receipts (complete absence of observations)', () => {
    // When sourceRecords is empty (completely no observation)
    const input: BigWorldClockInput = {
      ...baseInput,
      sourceRecords: [],
    };

    const snapshot = computeDailyResourceSnapshot(input, 1, 42);

    // Should run seeded random fallback
    // Since seed=42 and day=1:
    // salt = `res-42-1`
    // seededInt(`res-42-1-trust-net`, -3, 3) must be non-zero (or at least determined by seed)
    expect(snapshot.ownerTrustNet).not.toBe(0);
    expect(snapshot.ownerPatienceNet).not.toBe(0);
  });

  it('keeps trust/patience change as 0 when action receipts are present but net changes are 0', () => {
    // When sourceRecords contains a player action receipt with fieldDeltas (observation exists)
    const testRecord: InformationSourceRecord = {
      sourceId: 'isr-ar-test',
      sourceKind: 'player_action_receipt',
      day: 1,
      phase: 'afternoon',
      entityRefs: [{ id: 'case-1', kind: 'case' }],
      actorRefs: [{ id: 'broker-1', role: 'player_broker' }],
      visibility: { scope: 'player_only', baseDelayDays: 0 },
      confidence: 0.95,
      delayDays: 0,
      replayKey: 'isr-rk-test',
      origin: 'player_action',
      payload: {
        summary: 'test',
        subtype: 'action_executed',
        actionId: 'first-visit',
        executorId: 'broker-1',
        caseId: 'case-1',
        costEnergy: 10,
        costPromotionBudget: 0,
        fieldDeltas: [], // Net change is 0
        outcome: 'success',
      },
    };

    const input: BigWorldClockInput = {
      ...baseInput,
      sourceRecords: [testRecord],
    };

    const snapshot = computeDailyResourceSnapshot(input, 1, 42);

    // Since we have observation, it must be exactly 0, not seeded random fallback
    expect(snapshot.ownerTrustNet).toBe(0);
    expect(snapshot.ownerPatienceNet).toBe(0);
  });

  it('correctly uses TimeContext for weekly budget allocation and org credit day', () => {
    // Day 1 is a weekly budget day (1 % 7 === 1) but not org credit day (4 % 7 === 4)
    const snapshotDay1 = computeDailyResourceSnapshot(baseInput, 1, 42);
    expect(snapshotDay1.promotionBudgetAllocated).toBeGreaterThan(0);
    expect(snapshotDay1.orgCreditEarned).toBe(0);

    // Day 4 is an org credit day (4 % 7 === 4) but not weekly budget day
    const snapshotDay4 = computeDailyResourceSnapshot(baseInput, 4, 42);
    expect(snapshotDay4.promotionBudgetAllocated).toBe(0);
    expect(snapshotDay4.orgCreditEarned).toBeGreaterThan(0);
  });
});
