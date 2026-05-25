import { describe, it, expect } from 'vitest';

import {
  deriveWorldStateFromLegacyGameState,
  mapLegacyCaseToAssetCase,
  mapLegacyCaseToOwner,
  mapLegacyOpportunityToCustomerCaseOpportunity,
  mapLegacyOpportunityToNegotiationProcess,
} from '../adapters.js';
import type {
  LegacyCanonicalCaseLike,
  LegacyCanonicalGameStateLike,
  LegacyCanonicalOpportunityLike,
} from '../legacyCompatibilityContracts.js';

// Helper to create a valid legacy case with all required fields
function makeValidLegacyCase(overrides: Partial<LegacyCanonicalCaseLike> = {}): LegacyCanonicalCaseLike {
  return {
    id: 'test-case-1',
    housePrototypeId: 'hp-1',
    title: 'Test Case',
    community: 'Test Community',
    district: 'Test District',
    layout: '3室2厅',
    area: 100,
    askPrice: 5000000,
    marketPrice: 4800000,
    bottomPrice: 4500000,
    lastAskPrice: 5100000,
    priceGapPct: 0.04,
    heat: 0.8,
    status: 'active',
    stageIndex: 1,
    stageLabel: 'listed',
    riskFlags: [],
    goalTier: 'core',
    storylineState: 'healthy',
    viewings: 5,
    offers: 0,
    soldPrice: null,
    ownerArchetypeId: 'arch-1',
    ownerName: 'Test Owner',
    ownerMood: 'neutral',
    personality: 'pragmatic',
    trust: 0.6,
    patience: 0.5,
    urgency: 0.7,
    windowDays: 30,
    maintainerName: 'Test Broker',
    marketCellId: 'mc-1',
    story: 'Test story',
    tags: [],
    defects: [],
    touchedOwnerToday: false,
    lastOwnerTouchedDay: 0,
    competitionGroupIds: [],
    axisScores: {},
    competitiveness: 0.5,
    d1: 0.6,
    d2: 0.7,
    d3: 0.5,
    actionsToday: 0,
    touchedToday: false,
    lastTouchedDay: 0,
    hasCompletedFirstVisit: false,
    lastAction: '',
    lastPriceActionDay: 0,
    openDayCooldown: 0,
    qualityStory: 0,
    negotiationBonus: 0,
    competitivenessSnapshots: [],
    ...overrides,
  };
}

function makeValidLegacyOpportunity(overrides: Partial<LegacyCanonicalOpportunityLike> = {}): LegacyCanonicalOpportunityLike {
  return {
    id: 'opp-1',
    caseId: 'test-case-1',
    customerId: 'cust-1',
    customerName: 'Test Customer',
    profile: 'family',
    channelId: 'ch-1',
    channelName: 'Channel',
    fit: 0.8,
    intent: 0.6,
    confidence: 0.7,
    stageIndex: 2,
    stageLabel: 'interested',
    status: 'active',
    lifecycleStatus: 'active',
    leadSource: 'direct',
    visibility: 'revealed',
    brokerName: 'Test Broker',
    createdDay: 1,
    daysLeft: 20,
    touchedToday: false,
    budgetMax: 5000000,
    priceSensitivity: 0.5,
    stagnationTicks: 0,
    history: [],
    ...overrides,
  };
}

function makeValidLegacyGameState(overrides: Partial<LegacyCanonicalGameStateLike> = {}): LegacyCanonicalGameStateLike {
  return {
    runId: 'run-1',
    version: 1,
    day: 1,
    currentDate: '2026-05-22',
    cases: [makeValidLegacyCase()],
    opportunities: [makeValidLegacyOpportunity()],
    markets: [],
    customers: [],
    competitionGroups: [],
    productRuns: [],
    eventStore: [],
    ...overrides,
  };
}

describe('Adapter runtime validation', () => {
  // -------------------------------------------------------------------------
  // Case status
  // -------------------------------------------------------------------------
  it('invalid case status does not enter AssetCase.status — fallback to active', () => {
    const legacy = makeValidLegacyCase({ status: '__bad_status__' });
    const assetCase = mapLegacyCaseToAssetCase(legacy);
    expect(assetCase.status).toBe('active');
  });

  it('valid case status passes through', () => {
    const legacy = makeValidLegacyCase({ status: 'sold' });
    const assetCase = mapLegacyCaseToAssetCase(legacy);
    expect(assetCase.status).toBe('sold');
  });

  // -------------------------------------------------------------------------
  // GoalTier
  // -------------------------------------------------------------------------
  it('invalid goalTier does not enter AssetCase.goalTier — fallback to normal', () => {
    const legacy = makeValidLegacyCase({ goalTier: '__bad_tier__' });
    const assetCase = mapLegacyCaseToAssetCase(legacy);
    expect(assetCase.goalTier).toBe('normal');
  });

  it('valid goalTier passes through', () => {
    const legacy = makeValidLegacyCase({ goalTier: 'core' });
    const assetCase = mapLegacyCaseToAssetCase(legacy);
    expect(assetCase.goalTier).toBe('core');
  });

  // -------------------------------------------------------------------------
  // StorylineState
  // -------------------------------------------------------------------------
  it('invalid storylineState does not enter AssetCase.storylineState — fallback to healthy', () => {
    const legacy = makeValidLegacyCase({ storylineState: '__bad_state__' });
    const assetCase = mapLegacyCaseToAssetCase(legacy);
    expect(assetCase.storylineState).toBe('healthy');
  });

  // -------------------------------------------------------------------------
  // EndingType / EndingBucket
  // -------------------------------------------------------------------------
  it('invalid endingType becomes undefined', () => {
    const legacy = makeValidLegacyCase({ endingType: '__bad_ending__' });
    const assetCase = mapLegacyCaseToAssetCase(legacy);
    expect(assetCase.endingType).toBeUndefined();
  });

  it('invalid endingBucket becomes undefined', () => {
    const legacy = makeValidLegacyCase({ endingBucket: '__bad_bucket__' });
    const assetCase = mapLegacyCaseToAssetCase(legacy);
    expect(assetCase.endingBucket).toBeUndefined();
  });

  it('valid endingType passes through', () => {
    const legacy = makeValidLegacyCase({ endingType: 'sold_by_you_happy' });
    const assetCase = mapLegacyCaseToAssetCase(legacy);
    expect(assetCase.endingType).toBe('sold_by_you_happy');
  });

  // -------------------------------------------------------------------------
  // OwnerSatisfaction
  // -------------------------------------------------------------------------
  it('invalid ownerSatisfaction does not enter Owner.satisfaction — becomes undefined', () => {
    const legacy = makeValidLegacyCase({ ownerSatisfaction: '__bad_satisfaction__' });
    const owner = mapLegacyCaseToOwner(legacy);
    expect(owner.satisfaction).toBeUndefined();
  });

  it('valid ownerSatisfaction passes through', () => {
    const legacy = makeValidLegacyCase({ ownerSatisfaction: 'happy' });
    const owner = mapLegacyCaseToOwner(legacy);
    expect(owner.satisfaction).toBe('happy');
  });

  // -------------------------------------------------------------------------
  // OwnerPersonality
  // -------------------------------------------------------------------------
  it('invalid personality does not enter Owner.personality — fallback to pragmatic', () => {
    const legacy = makeValidLegacyCase({ personality: '__bad_personality__' });
    const owner = mapLegacyCaseToOwner(legacy);
    expect(owner.personality).toBe('pragmatic');
  });

  it('valid personality passes through', () => {
    const legacy = makeValidLegacyCase({ personality: 'emotional' });
    const owner = mapLegacyCaseToOwner(legacy);
    expect(owner.personality).toBe('emotional');
  });

  // -------------------------------------------------------------------------
  // Opportunity status / lifecycleStatus / visibility / leadSource
  // -------------------------------------------------------------------------
  it('invalid opportunity status does not enter CustomerCaseOpportunity.status — fallback to active', () => {
    const legacy = makeValidLegacyOpportunity({ status: '__bad_opp_status__' });
    const opp = mapLegacyOpportunityToCustomerCaseOpportunity(legacy);
    expect(opp.status).toBe('active');
  });

  it('invalid opportunity lifecycleStatus does not enter CustomerCaseOpportunity — fallback to active', () => {
    const legacy = makeValidLegacyOpportunity({ lifecycleStatus: '__bad_lifecycle__' });
    const opp = mapLegacyOpportunityToCustomerCaseOpportunity(legacy);
    expect(opp.lifecycleStatus).toBe('active');
  });

  it('invalid opportunity visibility does not enter CustomerCaseOpportunity — fallback to shadow', () => {
    const legacy = makeValidLegacyOpportunity({ visibility: '__bad_visibility__' });
    const opp = mapLegacyOpportunityToCustomerCaseOpportunity(legacy);
    expect(opp.visibility).toBe('shadow');
  });

  it('invalid opportunity leadSource does not enter CustomerCaseOpportunity — fallback to direct', () => {
    const legacy = makeValidLegacyOpportunity({ leadSource: '__bad_source__' });
    const opp = mapLegacyOpportunityToCustomerCaseOpportunity(legacy);
    expect(opp.leadSource).toBe('direct');
  });

  // -------------------------------------------------------------------------
  // NegotiationProcess status
  // -------------------------------------------------------------------------
  it('invalid negotiation status does not enter NegotiationProcess.status — fallback to active', () => {
    const legacy = makeValidLegacyOpportunity({
      status: '__bad_neg_status__',
      pendingClosingEvaluation: true,
    });
    const negotiation = mapLegacyOpportunityToNegotiationProcess(legacy);
    expect(negotiation).not.toBeNull();
    expect(negotiation!.status).toBe('active');
  });

  it('valid negotiation status passes through', () => {
    const legacy = makeValidLegacyOpportunity({
      status: 'won',
      pendingClosingEvaluation: true,
    });
    const negotiation = mapLegacyOpportunityToNegotiationProcess(legacy);
    expect(negotiation).not.toBeNull();
    expect(negotiation!.status).toBe('won');
  });

  // -------------------------------------------------------------------------
  // ProductRun milestones
  // -------------------------------------------------------------------------
  it('invalid ProductRun milestone values are dropped instead of cast into canonical truth', () => {
    const state = makeValidLegacyGameState({
      productRuns: [{
        id: 'run-1',
        productType: 'open-day',
        scope: 'community',
        status: 'running',
        targetIds: ['test-case-1'],
        milestones: [
          {
            id: 'valid-ms',
            title: 'Valid',
            summary: 'Valid milestone',
            day: 2,
            kind: 'event',
            settlementHint: 'settle',
          },
          {
            id: 'bad-kind',
            title: 'Bad',
            summary: 'Bad milestone',
            day: 3,
            kind: '__bad_kind__',
            settlementHint: 'settle',
          },
          {
            id: 'bad-day',
            title: 'Bad',
            summary: 'Bad milestone',
            day: Number.NaN,
            kind: 'event',
            settlementHint: 'settle',
          },
        ],
      }],
    });

    const snapshot = deriveWorldStateFromLegacyGameState(state);
    expect(snapshot.openDayRuns[0].milestones).toEqual([
      {
        id: 'valid-ms',
        title: 'Valid',
        summary: 'Valid milestone',
        day: 2,
        kind: 'event',
        settlementHint: 'settle',
      },
    ]);
  });

  it('invalid ProductRun scope/status use explicit compatibility fallbacks', () => {
    const state = makeValidLegacyGameState({
      productRuns: [{
        id: 'run-2',
        productType: 'sincere-sale',
        scope: '__bad_scope__',
        status: '__bad_status__',
        targetIds: ['test-case-1'],
        milestones: [],
      }],
    });

    const snapshot = deriveWorldStateFromLegacyGameState(state);
    expect(snapshot.sinceritySaleRuns[0].scope).toBe('listing');
    expect(snapshot.sinceritySaleRuns[0].status).toBe('running');
  });
});
