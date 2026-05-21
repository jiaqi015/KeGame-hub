import { describe, expect, it } from 'vitest';
import { computeDailyResourceSnapshot } from '../marketEconomyRuntime.js';
import { buildTimeContext } from '../types.js';
import type { BigWorldClockInput } from '../types.js';
import type { InformationSourceRecord } from '../../informationSourceTypes.js';

describe('computeDailyResourceSnapshot — trust/patience fallback behavior', () => {
  const baseInput: BigWorldClockInput = {
    settledDay: 1,
    runSeed: 42,
    timeContext: buildTimeContext(1),
    marketCells: [],
    activeCases: [],
    activeOpportunities: [],
    rivalListings: [],
    rivalStores: [],
    customerStates: [],
  };

  it('preserves legacy fallback behavior when there are no action receipts (complete absence of observations)', () => {
    const input: BigWorldClockInput = {
      ...baseInput,
      sourceRecords: [],
    };

    const snapshot = computeDailyResourceSnapshot(input, 1, 42);

    expect(snapshot.ownerTrustNet).not.toBe(0);
    expect(snapshot.ownerPatienceNet).not.toBe(0);
  });

  it('keeps trust/patience change as 0 when action receipts are present but net changes are 0', () => {
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
        fieldDeltas: [],
        outcome: 'success',
      },
    };

    const input: BigWorldClockInput = {
      ...baseInput,
      sourceRecords: [testRecord],
    };

    const snapshot = computeDailyResourceSnapshot(input, 1, 42);

    expect(snapshot.ownerTrustNet).toBe(0);
    expect(snapshot.ownerPatienceNet).toBe(0);
  });

  it('correctly uses TimeContext for weekly budget allocation and org credit day', () => {
    // Day 1: weekdayIndex=1 → isWeeklyBudgetDay=true, isOrgCreditDay=false
    const day1Input: BigWorldClockInput = {
      ...baseInput,
      timeContext: buildTimeContext(1),
    };
    const snapshotDay1 = computeDailyResourceSnapshot(day1Input, 1, 42);
    expect(day1Input.timeContext.isWeeklyBudgetDay).toBe(true);
    expect(day1Input.timeContext.isOrgCreditDay).toBe(false);
    expect(snapshotDay1.promotionBudgetAllocated).toBeGreaterThan(0);
    expect(snapshotDay1.orgCreditEarned).toBe(0);

    // Day 4: weekdayIndex=4 → isWeeklyBudgetDay=false, isOrgCreditDay=true
    const day4Input: BigWorldClockInput = {
      ...baseInput,
      settledDay: 4,
      timeContext: buildTimeContext(4),
    };
    const snapshotDay4 = computeDailyResourceSnapshot(day4Input, 4, 42);
    expect(day4Input.timeContext.isWeeklyBudgetDay).toBe(false);
    expect(day4Input.timeContext.isOrgCreditDay).toBe(true);
    expect(snapshotDay4.promotionBudgetAllocated).toBe(0);
    expect(snapshotDay4.orgCreditEarned).toBeGreaterThan(0);
  });

  it('buildTimeContext produces correct weekday and flags', () => {
    const tc0 = buildTimeContext(0); // Sunday
    expect(tc0.weekdayIndex).toBe(0);
    expect(tc0.isWeeklyBudgetDay).toBe(false);
    expect(tc0.isOrgCreditDay).toBe(false);

    const tc1 = buildTimeContext(1); // Monday
    expect(tc1.weekdayIndex).toBe(1);
    expect(tc1.isWeeklyBudgetDay).toBe(true);
    expect(tc1.isOrgCreditDay).toBe(false);

    const tc4 = buildTimeContext(4); // Thursday
    expect(tc4.weekdayIndex).toBe(4);
    expect(tc4.isWeeklyBudgetDay).toBe(false);
    expect(tc4.isOrgCreditDay).toBe(true);

    const tc7 = buildTimeContext(7); // Next Sunday
    expect(tc7.weekdayIndex).toBe(0);
    expect(tc7.isWeeklyBudgetDay).toBe(false);
    expect(tc7.isOrgCreditDay).toBe(false);

    const tc8 = buildTimeContext(8); // Next Monday
    expect(tc8.weekdayIndex).toBe(1);
    expect(tc8.isWeeklyBudgetDay).toBe(true);
  });
});
