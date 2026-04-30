import { describe, expect, it } from 'vitest';

import {
  resolveActionProductRunTargetIds,
  startActionProductRunIfNeeded,
} from '../../../domain/engine/productRunActionLifecycle';
import type { Case, GameState } from '../../../domain/models';

function buildCase(overrides: Partial<Case> = {}): Case {
  const id = overrides.id || 'case-1';

  return {
    id,
    housePrototypeId: `${id}-house`,
    ownerArchetypeId: `${id}-owner-archetype`,
    title: `${id} test listing`,
    community: 'wutong',
    district: 'binjiang',
    layout: '2r1l',
    area: 89,
    askPrice: 510,
    marketPrice: 500,
    bottomPrice: 480,
    patience: 62,
    trust: 68,
    heat: 58,
    competitiveness: 64,
    d1: 60,
    d2: 66,
    d3: 67,
    axisScores: {},
    urgency: 55,
    windowDays: 10,
    ownerName: 'owner-a',
    ownerMood: 'steady',
    maintainerName: 'broker-a',
    marketCellId: 'market-1',
    story: 'test listing story',
    tags: [],
    defects: [],
    status: 'active',
    stageIndex: 2,
    stageLabel: 'showing',
    riskFlags: [],
    actionsToday: 0,
    touchedToday: false,
    touchedOwnerToday: false,
    lastTouchedDay: 0,
    lastOwnerTouchedDay: 0,
    hasCompletedFirstVisit: true,
    lastAction: '',
    lastPriceActionDay: -99,
    openDayCooldown: 0,
    qualityStory: 0,
    negotiationBonus: 0,
    viewings: 0,
    offers: 0,
    soldPrice: null,
    priceGapPct: 0,
    competitivenessSnapshots: [],
    competitionGroupIds: [],
    lastAskPrice: 510,
    goalTier: 'normal',
    storylineState: 'healthy',
    personality: 'pragmatic',
    ...overrides,
  };
}

function buildState(cases: Case[]): GameState {
  return {
    day: 3,
    currentDate: '2026-04-29',
    cases,
    productRuns: [],
    eventStore: [],
  } as unknown as GameState;
}

describe('product run action lifecycle', () => {
  it('targets active same-community cases for open-day only', () => {
    const anchorCase = buildCase({ id: 'case-anchor', community: 'wutong' });
    const sameCommunityCase = buildCase({ id: 'case-same-community', community: 'wutong' });
    const soldSameCommunityCase = buildCase({
      id: 'case-sold-same-community',
      community: 'wutong',
      status: 'sold',
    });
    const otherCommunityCase = buildCase({ id: 'case-other-community', community: 'jiangwan' });
    const state = buildState([
      anchorCase,
      sameCommunityCase,
      soldSameCommunityCase,
      otherCommunityCase,
    ]);

    expect(resolveActionProductRunTargetIds(state, anchorCase, 'open-day')).toEqual([
      'case-anchor',
      'case-same-community',
    ]);
  });

  it('targets only the current case for sincere-sale', () => {
    const anchorCase = buildCase({ id: 'case-anchor', community: 'wutong' });
    const sameCommunityCase = buildCase({ id: 'case-same-community', community: 'wutong' });
    const state = buildState([anchorCase, sameCommunityCase]);

    expect(resolveActionProductRunTargetIds(state, anchorCase, 'sincere-sale')).toEqual([
      'case-anchor',
    ]);
  });

  it('starts a product run once, records a journal event, and skips duplicate targets', () => {
    const anchorCase = buildCase({ id: 'case-anchor', community: 'wutong' });
    const sameCommunityCase = buildCase({ id: 'case-same-community', community: 'wutong' });
    const otherCommunityCase = buildCase({ id: 'case-other-community', community: 'jiangwan' });
    const state = buildState([anchorCase, sameCommunityCase, otherCommunityCase]);

    const run = startActionProductRunIfNeeded(state, anchorCase, 'open-day');

    expect(run).not.toBeNull();
    expect(state.productRuns).toHaveLength(1);
    expect(state.productRuns[0]).toBe(run);
    expect(run).toMatchObject({
      productType: 'open-day',
      scope: 'community',
      status: 'running',
      targetIds: ['case-anchor', 'case-same-community'],
      startDay: 3,
    });

    expect(state.eventStore).toHaveLength(1);
    const event = state.eventStore[0];
    expect(event).toMatchObject({
      kind: 'journal',
      caseId: 'case-anchor',
      tone: 'success',
    });
    expect(event.payload).toMatchObject({
      runId: run!.id,
      productType: 'open-day',
      scope: 'community',
      targetIds: ['case-anchor', 'case-same-community'],
      nextMilestone: run!.nextMilestone,
    });
    expect(run!.linkedEventIds).toEqual([event.id]);

    const duplicate = startActionProductRunIfNeeded(state, anchorCase, 'open-day');

    expect(duplicate).toBeNull();
    expect(state.productRuns).toHaveLength(1);
    expect(state.eventStore).toHaveLength(1);
  });
});
