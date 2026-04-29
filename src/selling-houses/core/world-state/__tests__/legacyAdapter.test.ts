import { describe, expect, it } from 'vitest';
import type {
  Case,
  CompetitionGroup,
  CustomerProfile,
  GameState,
  MarketCell,
  Opportunity,
  ProductRun,
} from '../../../domain/models.js';
import {
  deriveWorldStateFromLegacyGameState,
  mapLegacyCaseToAssetCase,
  mapLegacyCaseToOwner,
  mapLegacyOpportunityToCustomerCaseOpportunity,
} from '../adapters.js';

function buildLegacyCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'case-1',
    housePrototypeId: 'house-1',
    ownerArchetypeId: 'owner-archetype-1',
    title: '滨江两房',
    community: '滨江花园',
    district: '滨江',
    layout: '两室一厅',
    area: 89,
    askPrice: 510,
    marketPrice: 495,
    bottomPrice: 480,
    patience: 62,
    trust: 71,
    heat: 58,
    competitiveness: 66,
    d1: 60,
    d2: 70,
    d3: 68,
    axisScores: { price: 62 },
    urgency: 74,
    windowDays: 9,
    ownerName: '李阿姨',
    ownerMood: '担心价格谈低',
    maintainerName: '小张',
    marketCellId: 'market-1',
    story: '临江次新，业主换房',
    tags: ['次新'],
    defects: ['临街'],
    status: 'active',
    stageIndex: 2,
    stageLabel: '集中带看',
    riskFlags: ['要价偏高'],
    actionsToday: 1,
    touchedToday: true,
    touchedOwnerToday: false,
    lastTouchedDay: 4,
    lastOwnerTouchedDay: 3,
    hasCompletedFirstVisit: true,
    lastAction: '做了一轮价格反馈',
    lastPriceActionDay: 3,
    openDayCooldown: 0,
    qualityStory: 12,
    negotiationBonus: 4,
    viewings: 3,
    offers: 1,
    soldPrice: null,
    priceGapPct: 3,
    competitivenessSnapshots: [],
    competitionGroupIds: ['competition-1'],
    lastAskPrice: 515,
    goalTier: 'core',
    storylineState: 'fragile',
    isFocused: true,
    personality: 'emotional',
    ...overrides,
  };
}

function buildOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'opp-1',
    caseId: 'case-1',
    customerId: 'customer-1',
    customerName: '王先生',
    profile: '预算明确，想看滨江两房',
    channelId: 'channel-1',
    channelName: '门店来访',
    fit: 82,
    intent: 76,
    confidence: 64,
    stageIndex: 2,
    stageLabel: '二次带看',
    status: 'active',
    lifecycleStatus: 'active',
    leadSource: 'broker',
    visibility: 'revealed',
    brokerName: '老周',
    createdDay: 2,
    daysLeft: 3,
    touchedToday: false,
    budgetMax: 520,
    priceSensitivity: 42,
    stagnationTicks: 1,
    history: [{ day: 2, stage: '首次沟通' }],
    ...overrides,
  };
}

describe('legacy GameState world-state adapter', () => {
  it('splits legacy case fields into asset, owner, and relations without mutating the case', () => {
    const legacyCase = buildLegacyCase();
    const before = structuredClone(legacyCase);

    const asset = mapLegacyCaseToAssetCase(legacyCase);
    const owner = mapLegacyCaseToOwner(legacyCase);

    expect(legacyCase).toEqual(before);
    expect(asset).toMatchObject({
      id: 'asset-case:case-1',
      legacyCaseId: 'case-1',
      title: '滨江两房',
      askPrice: 510,
      marketPrice: 495,
      bottomPrice: 480,
    });
    expect(owner).toMatchObject({
      id: 'owner:case-1',
      legacyCaseId: 'case-1',
      name: '李阿姨',
      trust: 71,
      patience: 62,
    });
  });

  it('derives a read-only world-state snapshot with deterministic relation and process ids', () => {
    const legacyCase = buildLegacyCase();
    const opportunity = buildOpportunity();
    const market: MarketCell = {
      id: 'market-1',
      name: '滨江板块',
      demandHeat: 68,
      supplyPressure: 44,
      competitivePressure: 57,
      sentiment: 61,
    };
    const customer: CustomerProfile = {
      id: 'customer-1',
      name: '王先生',
      profile: '预算明确',
      budgetMin: 470,
      budgetMax: 530,
      targetDistrict: '滨江',
      layouts: ['两室一厅'],
      activity: 77,
      urgency: 63,
      priceSensitivity: 42,
      preferences: ['次新'],
    };
    const competitionGroup: CompetitionGroup = {
      id: 'competition-1',
      name: '滨江两房竞争组',
      members: ['case-1', 'case-2'],
      priceElasticity: 0.6,
      customerSpillover: 0.4,
    };
    const productRun: ProductRun = {
      id: 'run-1',
      productType: 'open-day',
      scope: 'community',
      status: 'running',
      startDay: 4,
      targetIds: ['case-1'],
      nextMilestone: 'open-day-showing',
      linkedEventIds: ['event-1'],
      milestones: [],
    };
    const state = {
      version: 1,
      runId: 'legacy-run-1',
      day: 5,
      currentDate: '2026-04-29',
      cases: [legacyCase],
      opportunities: [opportunity],
      markets: [market],
      customers: [customer],
      competitionGroups: [competitionGroup],
      productRuns: [productRun],
      eventStore: [],
    } as unknown as GameState;

    const before = structuredClone(state);
    const snapshot = deriveWorldStateFromLegacyGameState(state);

    expect(state).toEqual(before);
    expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.owners).toHaveLength(1);
    expect(snapshot.customers[0]).toMatchObject({ id: 'customer:customer-1', legacyCustomerId: 'customer-1' });
    expect(snapshot.regions[0]).toMatchObject({ id: 'region:market-1', legacyMarketCellId: 'market-1' });
    expect(snapshot.brokerOwnerRelations[0]).toMatchObject({
      id: 'broker-owner:broker:maintainer:小张:owner:case-1',
      brokerId: 'broker:maintainer:小张',
      ownerId: 'owner:case-1',
    });
    expect(snapshot.ownerCaseRelations[0]).toMatchObject({
      id: 'owner-case:owner:case-1:asset-case:case-1',
      ownerId: 'owner:case-1',
      assetCaseId: 'asset-case:case-1',
    });
    expect(snapshot.customerCaseOpportunities[0]).toMatchObject({
      id: 'customer-case-opportunity:opp-1',
      brokerId: 'broker:lead:老周',
      customerId: 'customer:customer-1',
      assetCaseId: 'asset-case:case-1',
    });
    expect(snapshot.caseCompetitionRelations[0]).toMatchObject({
      id: 'case-competition:competition-1:asset-case:case-1',
      assetCaseId: 'asset-case:case-1',
    });
    expect(snapshot.openDayRuns[0]).toMatchObject({
      id: 'open-day-run:run-1',
      legacyProductRunId: 'run-1',
      targetAssetCaseIds: ['asset-case:case-1'],
    });
  });

  it('maps an opportunity to a customer-case relation using fallback customer data', () => {
    const opportunity = buildOpportunity({ customerId: '', brokerName: undefined });

    expect(mapLegacyOpportunityToCustomerCaseOpportunity(opportunity)).toMatchObject({
      id: 'customer-case-opportunity:opp-1',
      customerId: 'customer-from-opportunity:opp-1',
      brokerId: undefined,
      assetCaseId: 'asset-case:case-1',
    });
  });
});
