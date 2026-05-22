import { describe, expect, it } from 'vitest';
import { computeDailyResourceSnapshot } from '../marketEconomyRuntime.js';
import { runBigWorldDayTick } from '../clock.js';
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

describe('runBigWorldDayTick — old-style input without timeContext or existingRuntime', () => {
  /** Build a minimal BigWorldClockInput WITHOUT timeContext or existingRuntime. */
  function makeOldStyleInput(day: number, runSeed: number = 42): BigWorldClockInput {
    return {
      settledDay: day,
      runSeed,
      // Intentionally omit timeContext — old scripts don't provide it
      marketCells: [{ id: 'mc-1', name: 'Test Cell', demandHeat: 50, supplyPressure: 40, competitivePressure: 30, sentiment: 60 }],
      activeCases: [{
        id: 'case-1', title: 'Test Case', district: 'Test District', marketCellId: 'mc-1',
        trust: 50, patience: 60, urgency: 70, heat: 55, competitiveness: 45,
        d1: 30, d3: 40, ownerName: 'Test Owner', windowDays: 14, personality: 'steady',
      }],
      activeOpportunities: [],
      rivalListings: [{
        id: 'rl-1', storeId: 'store-1', title: 'Rival Listing', district: 'Test District',
        marketCellId: 'mc-1', segment: '3BR', askPrice: 300, heat: 50, freshness: 80,
        status: 'active', daysLeft: 20,
      }],
      rivalStores: [{
        id: 'store-1', name: 'Rival Store', type: 'external_company', style: 'steady',
        districtFocus: ['Test District'], leadCapturePower: 40, sellerInfluencePower: 35,
        pricingPressurePower: 30, activityHeat: 50, acnId: 'acn-rival-1',
      }],
      customerStates: [{
        customerId: 'cust-1', status: 'active', fatigue: 20, churnRisk: 15,
        activeCaseIds: ['case-1'],
      }],
      // Intentionally omit existingRuntime
    };
  }

  it('does not crash when timeContext is missing', () => {
    const input = makeOldStyleInput(1);
    const receipt = runBigWorldDayTick(input);
    expect(receipt).toBeDefined();
    expect(receipt.day).toBe(1);
  });

  it('does not crash when both timeContext and existingRuntime are missing', () => {
    const input = makeOldStyleInput(1);
    const receipt = runBigWorldDayTick(input);
    expect(receipt).toBeDefined();
    expect(receipt.economyReceipt).toBeDefined();
  });

  it('produces correct weekly budget allocation on day 1 (Monday) without explicit timeContext', () => {
    const input = makeOldStyleInput(1);
    const receipt = runBigWorldDayTick(input);

    expect(receipt.economyReceipt).toBeDefined();
    expect(receipt.economyReceipt!.snapshot.promotionBudgetAllocated).toBeGreaterThan(0);
    expect(receipt.economyReceipt!.snapshot.orgCreditEarned).toBe(0);
  });

  it('produces correct org credit on day 4 (Thursday) without explicit timeContext', () => {
    const input = makeOldStyleInput(4);
    const receipt = runBigWorldDayTick(input);

    expect(receipt.economyReceipt).toBeDefined();
    expect(receipt.economyReceipt!.snapshot.promotionBudgetAllocated).toBe(0);
    expect(receipt.economyReceipt!.snapshot.orgCreditEarned).toBeGreaterThan(0);
  });

  it('neither weekly budget nor org credit on day 0 (Sunday) without explicit timeContext', () => {
    const input = makeOldStyleInput(0);
    const receipt = runBigWorldDayTick(input);

    expect(receipt.economyReceipt).toBeDefined();
    expect(receipt.economyReceipt!.snapshot.promotionBudgetAllocated).toBe(0);
    expect(receipt.economyReceipt!.snapshot.orgCreditEarned).toBe(0);
  });

  it('fallback matches explicit timeContext for same day', () => {
    const inputNoTc = makeOldStyleInput(1);
    const receiptNoTc = runBigWorldDayTick(inputNoTc);

    const inputWithTc: BigWorldClockInput = {
      ...makeOldStyleInput(1),
      timeContext: buildTimeContext(1),
    };
    const receiptWithTc = runBigWorldDayTick(inputWithTc);

    expect(receiptNoTc.economyReceipt!.snapshot.promotionBudgetAllocated)
      .toBe(receiptWithTc.economyReceipt!.snapshot.promotionBudgetAllocated);
    expect(receiptNoTc.economyReceipt!.snapshot.orgCreditEarned)
      .toBe(receiptWithTc.economyReceipt!.snapshot.orgCreditEarned);
  });
});
