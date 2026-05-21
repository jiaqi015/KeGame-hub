/**
 * WorldGraph tests — graph node/edge generation, determinism, visibility, and summary.
 *
 * Test coverage:
 *   1. Graph node/edge generation — verify counts from a populated GameState
 *   2. Deterministic — same seed + same bootstrap => identical graph twice
 *   3. Hidden truth does not leak to player-visible projection
 *   4. Market cell summary correctness
 *   5. co_sale vs rival distinction
 *   6. No domain -> application reverse dependency
 */

import { describe, it, expect } from 'vitest';

import type { GameState, MarketCell, Case, RivalListing, RivalStore, CustomerRuntimeState } from '../../domain/models.ts';
import type { BigWorldBootstrap, MicroCell } from '../../domain/world-model/bigWorldTypes.ts';
import type { BrokerEntity } from '../../domain/world-model/brokerPopulation.ts';
import type { ListingPopulationEntity } from '../../domain/world-model/listingPopulation.ts';
import type { ACNNetworkSnapshot } from '../../domain/world-model/marketWorldTypes.ts';

import { buildWorldGraph, buildWorldGraphSummary, buildPlayerVisibleWorldGraph } from '../projections/worldGraphBuilder.ts';

// ════════════════════════════════════════════════════════════════════════════
// Test data factories
// ════════════════════════════════════════════════════════════════════════════

function makeMarketCells(): MarketCell[] {
  return [
    { id: 'cell-A', name: '和平里', demandHeat: 65, supplyPressure: 45, competitivePressure: 55, sentiment: 50 },
    { id: 'cell-B', name: '望京', demandHeat: 80, supplyPressure: 60, competitivePressure: 70, sentiment: 55 },
    { id: 'cell-C', name: '朝阳门', demandHeat: 40, supplyPressure: 30, competitivePressure: 35, sentiment: 45 },
  ];
}

function makeCases(): Case[] {
  return [
    {
      id: 'case-1', housePrototypeId: 'hp-1', ownerArchetypeId: 'oa-1',
      title: '和平里两居室', community: '和平里小区', district: '东城',
      layout: '2室1厅', area: 75, askPrice: 350, marketPrice: 340,
      bottomPrice: 310, patience: 50, trust: 60, heat: 55,
      competitiveness: 65, d1: 60, d2: 55, d3: 50, axisScores: {},
      urgency: 40, windowDays: 21, ownerName: '张三', ownerMood: 'neutral',
      maintainerName: '经纪人A', marketCellId: 'cell-A', story: '标准两居',
      tags: [], defects: [], status: 'active', stageIndex: 1, stageLabel: '挂牌',
      riskFlags: [], actionsToday: 0, touchedToday: false, touchedOwnerToday: false,
      lastTouchedDay: 0, lastOwnerTouchedDay: 0, hasCompletedFirstVisit: false,
      lastAction: '', lastPriceActionDay: 0, openDayCooldown: 0,
      qualityStory: 50, negotiationBonus: 0, viewings: 0, offers: 0,
      soldPrice: null, priceGapPct: 3, competitivenessSnapshots: [],
      competitionGroupIds: [], lastAskPrice: 350, goalTier: 'core',
      storylineState: 'healthy', personality: 'pragmatic',
    },
    {
      id: 'case-2', housePrototypeId: 'hp-2', ownerArchetypeId: 'oa-2',
      title: '望京三居室', community: '望京花园', district: '朝阳',
      layout: '3室2厅', area: 120, askPrice: 550, marketPrice: 530,
      bottomPrice: 490, patience: 45, trust: 55, heat: 70,
      competitiveness: 60, d1: 55, d2: 50, d3: 60, axisScores: {},
      urgency: 55, windowDays: 18, ownerName: '李四', ownerMood: 'anxious',
      maintainerName: '经纪人A', marketCellId: 'cell-B', story: '改善三居',
      tags: [], defects: [], status: 'active', stageIndex: 2, stageLabel: '推广',
      riskFlags: [], actionsToday: 0, touchedToday: false, touchedOwnerToday: false,
      lastTouchedDay: 0, lastOwnerTouchedDay: 0, hasCompletedFirstVisit: false,
      lastAction: '', lastPriceActionDay: 0, openDayCooldown: 0,
      qualityStory: 60, negotiationBonus: 0, viewings: 2, offers: 0,
      soldPrice: null, priceGapPct: 4, competitivenessSnapshots: [],
      competitionGroupIds: [], lastAskPrice: 550, goalTier: 'important',
      storylineState: 'healthy', personality: 'emotional',
    },
  ];
}

function makeRivalListings(): RivalListing[] {
  return [
    {
      id: 'rival-1', storeId: 'store-1', title: '和平里竞品A',
      district: '东城', marketCellId: 'cell-A', segment: '标准两居',
      askPrice: 360, heat: 50, freshness: 70, storyStrength: 40,
      leadSiphonPower: 30, ownerAnchorPower: 25, status: 'active',
      daysLeft: 20, source: 'seed',
    },
    {
      id: 'rival-2', storeId: 'store-1', title: '望京竞品B',
      district: '朝阳', marketCellId: 'cell-B', segment: '改善三居',
      askPrice: 580, heat: 65, freshness: 55, storyStrength: 50,
      leadSiphonPower: 45, ownerAnchorPower: 35, status: 'active',
      daysLeft: 15, source: 'seed',
    },
    {
      id: 'rival-3', storeId: 'store-2', title: '朝阳门竞品C',
      district: '朝阳', marketCellId: 'cell-C', segment: '一居室',
      askPrice: 250, heat: 30, freshness: 40, storyStrength: 20,
      leadSiphonPower: 15, ownerAnchorPower: 10, status: 'active',
      daysLeft: 25, source: 'daily_event',
    },
  ];
}

function makeRivalStores(): RivalStore[] {
  return [
    {
      id: 'store-1', name: '链家望京店', type: 'external_company',
      style: 'aggressive', districtFocus: ['东城', '朝阳'],
      leadCapturePower: 70, sellerInfluencePower: 60,
      pricingPressurePower: 50, activityHeat: 65,
    },
    {
      id: 'store-2', name: '我爱我家朝阳门店', type: 'external_company',
      style: 'steady', districtFocus: ['朝阳'],
      leadCapturePower: 55, sellerInfluencePower: 45,
      pricingPressurePower: 40, activityHeat: 40,
    },
  ];
}

function makeCustomerStates(): CustomerRuntimeState[] {
  return [
    {
      customerId: 'cust-1', status: 'comparing', decisionStyle: 'balanced',
      advisorTrust: 50, fatigue: 20, churnRisk: 30,
      activeCaseIds: ['case-1'], caseStates: {}, lastTouchDay: 5,
    },
    {
      customerId: 'cust-2', status: 'engaged', decisionStyle: 'decisive',
      advisorTrust: 60, fatigue: 10, churnRisk: 15,
      activeCaseIds: ['case-2'], caseStates: {}, lastTouchDay: 6,
    },
    {
      customerId: 'cust-3', status: 'browsing', decisionStyle: 'hesitant',
      advisorTrust: 40, fatigue: 30, churnRisk: 45,
      activeCaseIds: ['case-1', 'case-2'], caseStates: {}, lastTouchDay: 3,
    },
  ];
}

function makeAcnSnapshots(): ACNNetworkSnapshot[] {
  return [
    {
      id: 'acn-cooperative', name: '联卖协作网', role: 'player_acn',
      collaborationLevel: 82, listingOpenness: 78, infoSpeed: 76,
      competitionAggression: 28, coSaleBias: 74,
    },
    {
      id: 'acn-aggressive', name: '快攻竞争网', role: 'strong_rival_acn',
      collaborationLevel: 22, listingOpenness: 30, infoSpeed: 82,
      competitionAggression: 85, coSaleBias: 15,
    },
    {
      id: 'acn-local', name: '熟人关系网', role: 'local_relational',
      collaborationLevel: 55, listingOpenness: 42, infoSpeed: 38,
      competitionAggression: 35, coSaleBias: 48,
    },
  ];
}

function makeBrokers(): BrokerEntity[] {
  return [
    {
      brokerId: 'player-broker', acnId: 'acn-cooperative', visibility: 'named',
      name: '玩家经纪人', style: 'co_sale_builder', marketCellIds: ['cell-A', 'cell-B'],
      energyBudget: 80, energyRemaining: 80, listingPoolSize: 6,
      customerPoolSize: 8, actionBias: -5,
    },
    {
      brokerId: 'nb-acn-aggressive-0', acnId: 'acn-aggressive', visibility: 'named',
      name: '快攻经纪人1号', style: 'price_attacker', marketCellIds: ['cell-B'],
      energyBudget: 72, energyRemaining: 72, listingPoolSize: 6,
      customerPoolSize: 10, actionBias: 25,
    },
    {
      brokerId: 'sb-acn-aggressive-0', acnId: 'acn-aggressive', visibility: 'shadow',
      name: '快攻影子1号', style: 'speed_runner', marketCellIds: ['cell-A'],
      energyBudget: 45, energyRemaining: 45, listingPoolSize: 3,
      customerPoolSize: 4, actionBias: 15,
    },
  ];
}

function makeShadowListings(): ListingPopulationEntity[] {
  return [
    {
      listingId: 'shadow-1', layer: 'shadow', brokerId: 'sb-acn-aggressive-0',
      acnId: 'acn-aggressive', marketCellId: 'cell-A', district: '东城',
      layout: '2室1厅', areaSqm: 70, askPrice: 320, marketPrice: 310,
      bottomPrice: 290, priceBand: '200w_400w', competitiveness: 45,
      liquidity: 50, ownerRigidity: 60, ownerNegotiability: 40,
      status: 'active', daysOnMarket: 15,
    },
    {
      listingId: 'shadow-2', layer: 'shadow', brokerId: 'sb-acn-aggressive-0',
      acnId: 'acn-aggressive', marketCellId: 'cell-B', district: '朝阳',
      layout: '3室2厅', areaSqm: 110, askPrice: 520, marketPrice: 500,
      bottomPrice: 470, priceBand: '400w_600w', competitiveness: 55,
      liquidity: 60, ownerRigidity: 50, ownerNegotiability: 50,
      status: 'active', daysOnMarket: 20,
    },
  ];
}

function makeMicroCells(): MicroCell[] {
  return [
    {
      microCellId: 'mc-cell-A-0', parentMarketCellId: 'cell-A',
      name: '和平里北', heat: 60, inventoryPressure: 40,
      dealVelocity: 55, listingCount: 5,
    },
    {
      microCellId: 'mc-cell-A-1', parentMarketCellId: 'cell-A',
      name: '和平里南', heat: 45, inventoryPressure: 35,
      dealVelocity: 40, listingCount: 3,
    },
  ];
}

/**
 * Build a minimal BigWorldBootstrap for testing.
 * Uses type assertion to avoid populating deeply nested optional fields
 * that the graph builder does not access (e.g. marketFormation economy).
 */
function makeBootstrap(seed: number): BigWorldBootstrap {
  const cityCycle = {
    phase: 'flat' as const, heatIndex: 50, heatDirection: 'stable' as const, label: '平稳期',
  };
  const marketCellSnapshots = makeMarketCells().map((c) => ({
    id: c.id, name: c.name, heat: c.demandHeat,
    heatBand: 'warm' as const, inventoryPressure: c.supplyPressure,
    dealVelocity: c.sentiment, rentHeat: 30,
    priceTrend: 'stable' as const, schoolSignal: 'moderate' as const,
    commuteSignal: 'moderate' as const,
  }));

  return {
    version: 1,
    hiddenTruth: {
      cityCycle,
      marketCells: marketCellSnapshots,
      microCells: makeMicroCells(),
      acnNetworks: makeAcnSnapshots(),
      acnProfiles: [],
      supportingInfo: [],
      ownerProfilePriors: [],
      ownerExpectationAnchors: [],
      ownerPerceptionLags: [],
      marketFormation: {
        listingPool: [],
        ownerPool: [],
        customerPool: [],
        brokerPool: [],
        cellThickness: [],
        totalActiveSupply: 0,
        totalActiveDemand: 0,
        totalBrokers: 3,
        avgLiquidity: 50,
        avgRivalPressure: 30,
        listingStateDistribution: { fresh: 0, hot: 0, warm: 0, cold: 0, price_reduced: 0, stale: 0, scarce: 0 },
        ownerStateDistribution: { urgent: 0, watchful: 0, stubborn: 0, cooperative: 0, upgrading: 0, financial_stress: 0, emotional: 0 },
        customerStateDistribution: { first_home: 0, upgrade: 0, school_district: 0, investment: 0, budget_sensitive: 0, time_sensitive: 0, hesitant: 0 },
        brokerStateDistribution: { listing_maintenance: 0, customer_hunting: 0, cooperation_focused: 0, competition_focused: 0, resource_constrained: 0, balanced: 0 },
        replayKey: 'test-replay',
        economy: {
          brokerPools: [],
          listingPools: [],
          customerPools: [],
          orgPools: [],
          opportunityCosts: [],
          avgBrokerUtilization: 0,
          avgListingVelocity: 0,
          avgConversionProbability: 0,
          totalOpportunityCosts: 0,
          bottleneckedBrokerCount: 0,
          atRiskCustomerCount: 0,
          totalDailyEnergyInflow: 0,
          totalDailyEnergyOutflow: 0,
          totalWeeklyBudgetInflow: 0,
          totalWeeklyBudgetOutflow: 0,
          replayKey: 'test-economy',
        },
      },
    },
    materializedEntities: {
      brokers: makeBrokers(),
      listings: makeShadowListings(),
      customers: [],
      attentions: [],
    },
    coldAggregate: {
      shadowDemandClusters: [],
      historicalTransactions: [],
    },
    openingPOV: {
      cityCycle,
      marketCells: marketCellSnapshots,
      acnNetworks: makeAcnSnapshots(),
      namedRivalBrokers: makeBrokers().filter((b) => b.visibility === 'named' && b.brokerId !== 'player-broker'),
      directRivalListings: [],
      aggregateDemandSegments: ['first_home', 'upgrade'],
      recentWorldEvents: [],
      playerBroker: makeBrokers()[0],
    },
    causalBaseline: {
      seed,
      scenarioName: 'test-scenario',
      difficultyId: 'standard',
      scalePolicy: {
        minMarketCells: 3, maxMarketCells: 5, acnCount: 3,
        namedBrokersPerAcn: 2, shadowBrokersPerAcn: 4,
        shadowListingsPerCell: 4, directRivalListingsPerCell: 2,
        ownerProfilePriorCount: 3, customerCaseRatio: 3,
      },
      spec: {
        version: 1,
        scale: {
          minMarketCells: 3, maxMarketCells: 5, acnCount: 3,
          namedBrokersPerAcn: 2, shadowBrokersPerAcn: 4,
          shadowListingsPerCell: 4, directRivalListingsPerCell: 2,
          ownerProfilePriorCount: 3, customerCaseRatio: 3,
        },
        domain: { demandSegments: [], priceBands: [], brokerStyles: [], listingLayers: [] },
        hiddenBoundary: {
          maxInformationDelayDays: 3, maxOwnerPerceptionLagDays: 5,
          shadowSupplyVisible: false, shadowDemandVisible: false,
          rivalBrokerInternalsVisible: false,
        },
        visibleBoundary: {
          playerListingsVisible: true, directRivalListingsVisible: true,
          namedRivalBrokersVisible: true, aggregateDemandVisible: true,
          recentWorldEventsVisible: true, cityCycleVisible: true,
        },
        invariants: {
          minMarketCells: 3, minRivalBrokers: 2, minComparableSupply: 6,
          minDemandUnits: 10, minOwnerProfilePriors: 3, minAcnNetworks: 2,
          deterministicReplay: true,
        },
        caps: {
          maxNamedBrokers: 20, maxMaterializedCustomers: 30,
          maxMaterializedListings: 100, maxRecentWorldEvents: 50,
        },
      },
      recentWorldEvents: [],
    },
    marketOpeningSnapshot: {
      version: 1, seed, scenarioName: 'test-scenario', difficultyId: 'standard',
      playerCaseCount: 2,
      cityCycle,
      marketCells: marketCellSnapshots,
      acnNetworks: makeAcnSnapshots(),
      listingInventory: {
        playerListingCount: 2, directRivalListingCount: 3,
        shadowListingCount: 2, recentTransactionCount: 0,
        avgDaysOnMarket: 18, avgDiscountPct: 5,
      },
      customerDemand: {
        shadowCustomerCount: 0, segments: [], priceBands: [],
        demandMomentum: 50,
      },
      brokerNetwork: {
        namedBrokers: makeBrokers().filter((b) => b.visibility === 'named' && b.brokerId !== 'player-broker').map((b) => ({
          id: b.brokerId, name: b.name, acnId: b.acnId, style: 'aggressive' as const,
          infoSpeed: 50, actionIntensity: 60, cooperationTendency: 30, competitionAggression: 70,
        })),
        shadowBrokerCount: 1,
        styleDistribution: [],
        totalBrokerCount: 3,
      },
      recentWorldEvents: [],
    },
  };
}

function makeGameState(seed: number = 42): GameState {
  return {
    version: 1,
    runId: 'test-run',
    localRevision: 1,
    clientUpdatedAt: '2026-01-01',
    saveSource: 'local',
    runContext: {
      scenarioId: 'test-scenario',
      scenarioName: 'Test Scenario',
      difficultyId: 'standard',
      worldId: 'test-world',
      worldVersion: 1,
      runSeed: seed,
      rngSeed: seed,
      createdAt: '2026-01-01',
      scenarioSnapshot: {
        world: {
          id: 'test-world', version: 1, name: 'Test',
          marketCells: makeMarketCells(),
          customers: [], channels: [],
          ownerArchetypes: [], housePrototypes: [],
          randomEventTemplates: [],
        },
        scenario: {
          id: 'test-scenario', worldId: 'test-world', worldVersion: 1,
          difficultyId: 'standard', name: 'Test', theme: 'test',
          description: 'Test', startMonth: 1, startDay: 1, maxDay: 21,
          cases: [], competitionGroups: [], scriptedEvents: [],
          randomEventPool: [], published: true,
        },
        source: 'builtin',
      },
      bigWorldBootstrap: makeBootstrap(seed),
    },
    day: 5,
    maxDay: 21,
    currentDate: '2026-01-05',
    maxEnergy: 100,
    energy: 80,
    cash: 5000,
    auxiliaryStats: {
      commission: 0, wordOfMouth: 50, soldCount: 0,
      withdrawnCount: 0, promotionBudget: 3000,
    },
    selectedCaseId: null,
    gameOver: false,
    finalResult: null,
    lastMessage: '',
    rules: {
      maxDay: 21, baseMaxEnergy: 100, initialCash: 5000,
      weeklyBudgetAllowance: 1000, promotionRebateRatio: 0.1,
      promotionRebateFloor: 50, initialWordOfMouth: 50,
      initialCommission: 0, initialEnergy: 80,
      passiveLeadBaseMultiplier: 1, passiveLeadFocusedMultiplier: 2,
      randomEventProbability: 0.3, seasonalityImpact: 0.2,
      competitionPressureThreshold: 50, competitionHeatPenaltyMin: 5,
      competitionHeatPenaltyMax: 15, competitionTrustLossChance: 0.1,
      competitionLogChance: 0.3, rivalLossProbabilityScale: 1,
      ownerUntouchedTrustLoss: 2, urgentOwnerUntouchedTrustLoss: 3,
      ownerPatienceDecayAfterDays: 10, ownerPatienceDecayAmount: 5,
      scriptedEventImpactScale: 1, dailyMarketEventProbability: 0.2,
      rivalListingSpawnChance: 0.15, rivalPressureHeatImpact: 5,
      rivalPressureTrustImpact: 3, companySharedLeadPressureBase: 10,
      companyReferralChanceBase: 0.1, marketSignalDecayDays: 7,
      marketSignalMaxVisible: 3, outcomeControl: {
        simulationDays: 21, marketDealCapacity21d: 6,
        playerBaseDealExpectation21d: 2, playerBonusDealCapacity21d: 1,
        playerBonusDealUnlockScore: 70, playerLeadSupplyScale: 1,
        playerFunnelProgressionScale: 1, playerDealClosingScale: 1,
        customerStagnationScale: 1, rivalStoreCapabilityScale: 1,
        rivalDealShareScale: 1, rivalListingSpawnScale: 1,
        rivalCustomerPullScale: 1, rivalOwnerPressureScale: 1,
        rivalCaseLossScale: 1,
      },
    },
    scheduledEvents: [],
    competitionGroups: [],
    rngState: seed,
    rngCalls: 0,
    cases: makeCases(),
    opportunities: [],
    budgetLedger: [],
    eventLog: [],
    eventStore: [],
    weeklyReviews: [],
    markets: makeMarketCells(),
    customers: [],
    customerStates: makeCustomerStates(),
    channels: [],
    schedule: [],
    priorities: [],
    matters: [],
    todayPlan: { day: 5, playerItems: [] },
    focusMeeting: {
      submissionDay: null, submittedCaseIds: [], selectedCaseIds: [],
    },
    productRuns: [],
    closedDeals: [],
    metrics: {
      activeCaseCount: 2, activeOpportunityCount: 0,
      averageTrust: 57, averageD1: 57, averageD3: 55,
      topConversion: '',
    },
    currentReport: null,
    marketShadow: {
      rivalStores: makeRivalStores(),
      rivalListings: makeRivalListings(),
      companyPressure: {
        sharedLeadPressure: 10, focusSlotPressure: 5,
        internalReferralChance: 0.1, internalCompetitionHeat: 20,
      },
      marketSignals: [],
      dailyMarketEvent: null,
      activeRuleEffects: [],
      inboundQueue: [],
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════════════

describe('WorldGraph', () => {
  it('generates correct node and edge counts from a populated GameState', () => {
    const state = makeGameState(42);
    const graph = buildWorldGraph(state);

    // Node kind counts
    const nodesByKind = new Map<string, number>();
    for (const node of graph.nodes) {
      nodesByKind.set(node.kind, (nodesByKind.get(node.kind) ?? 0) + 1);
    }

    // 3 market cells
    expect(nodesByKind.get('market_cell')).toBe(3);
    // 3 ACN networks
    expect(nodesByKind.get('acn')).toBe(3);
    // 3 brokers (player + 1 named + 1 shadow)
    expect(nodesByKind.get('broker')).toBe(3);
    // 2 player listings
    expect(nodesByKind.get('listing')).toBe(2);
    // 3 rival listings
    expect(nodesByKind.get('rival_listing')).toBe(3);
    // 2 shadow listings
    expect(nodesByKind.get('shadow_listing')).toBe(2);
    // 2 stores
    expect(nodesByKind.get('store')).toBe(2);
    // 3 customers
    expect(nodesByKind.get('customer')).toBe(3);
    // 2 micro cells
    expect(nodesByKind.get('micro_cell')).toBe(2);
    // 2 unique owners (张三, 李四)
    expect(nodesByKind.get('owner')).toBe(2);

    // Edge kind counts
    const edgesByKind = new Map<string, number>();
    for (const edge of graph.edges) {
      edgesByKind.set(edge.kind, (edgesByKind.get(edge.kind) ?? 0) + 1);
    }

    // belongs_to_acn: 3 brokers -> 3 ACN edges
    expect(edgesByKind.get('belongs_to_acn')).toBe(3);
    // located_in: 2 listings + 3 rival + 2 shadow = 7
    expect(edgesByKind.get('located_in')).toBe(7);
    // manages: player broker -> 2 listings
    expect(edgesByKind.get('manages')).toBe(2);
    // contains: 2 micro cells -> 2 contains edges (both in cell-A)
    expect(edgesByKind.get('contains')).toBe(2);
    // owns: 2 owners -> 2 listings
    expect(edgesByKind.get('owns')).toBe(2);

    // Total node count
    const totalNodes = 3 + 3 + 3 + 2 + 3 + 2 + 2 + 3 + 2 + 2; // 25
    expect(graph.nodes.length).toBe(totalNodes);
  });

  it('produces deterministic results for the same seed and bootstrap', () => {
    const state1 = makeGameState(42);
    const state2 = makeGameState(42);

    const graph1 = buildWorldGraph(state1);
    const graph2 = buildWorldGraph(state2);

    // Node IDs must match exactly
    const nodeIds1 = graph1.nodes.map((n) => n.id);
    const nodeIds2 = graph2.nodes.map((n) => n.id);
    expect(nodeIds1).toEqual(nodeIds2);

    // Edge IDs must match exactly
    const edgeIds1 = graph1.edges.map((e) => e.id);
    const edgeIds2 = graph2.edges.map((e) => e.id);
    expect(edgeIds1).toEqual(edgeIds2);

    // Node properties must match
    for (let i = 0; i < graph1.nodes.length; i++) {
      expect(graph1.nodes[i].properties).toEqual(graph2.nodes[i].properties);
    }
  });

  it('does not leak hidden truth to player-visible projection', () => {
    const state = makeGameState(42);
    const graph = buildWorldGraph(state);
    const visible = buildPlayerVisibleWorldGraph(graph, state);

    // Shadow listing nodes should NOT appear in player-visible projection
    const shadowNodes = visible.nodes.filter((n) => n.kind === 'shadow_listing');
    expect(shadowNodes.length).toBe(0);

    // Broker nodes should NOT contain style/behavior profile
    const brokerNodes = visible.nodes.filter((n) => n.kind === 'broker');
    for (const broker of brokerNodes) {
      expect(broker.properties).not.toHaveProperty('style');
      expect(broker.properties).not.toHaveProperty('marketCellCount');
      // Should still have structural info
      expect(broker.properties).toHaveProperty('acnId');
      expect(broker.properties).toHaveProperty('visibility');
    }

    // co_sells_with edges should only show sameAcn=true, not strategy details
    const coSaleEdges = visible.edges.filter((e) => e.kind === 'co_sells_with');
    for (const edge of coSaleEdges) {
      expect(edge.properties).toHaveProperty('sameAcn', true);
      // Should NOT have acnId in properties (which would reveal internal mapping)
      expect(edge.properties).not.toHaveProperty('acnId');
    }

    // Summary still includes shadow listing counts (aggregate data is OK)
    expect(visible.summary.shadowListingCount).toBe(2);
  });

  it('computes correct market cell summaries', () => {
    const state = makeGameState(42);
    const graph = buildWorldGraph(state);
    const summary = buildWorldGraphSummary(graph, state);

    expect(summary.marketCellCount).toBe(3);

    // Cell-A: 1 player listing + 1 rival listing + 1 shadow listing
    const cellA = summary.marketCellSummaries.find((s) => s.cellId === 'cell-A');
    expect(cellA).toBeDefined();
    expect(cellA!.listingCount).toBe(1);
    expect(cellA!.rivalListingCount).toBe(1);
    expect(cellA!.shadowListingCount).toBe(1);
    expect(cellA!.heat).toBe(65);

    // Cell-B: 1 player listing + 1 rival listing + 1 shadow listing
    const cellB = summary.marketCellSummaries.find((s) => s.cellId === 'cell-B');
    expect(cellB).toBeDefined();
    expect(cellB!.listingCount).toBe(1);
    expect(cellB!.rivalListingCount).toBe(1);
    expect(cellB!.shadowListingCount).toBe(1);

    // Cell-C: 0 player listings + 1 rival listing + 0 shadow listings
    const cellC = summary.marketCellSummaries.find((s) => s.cellId === 'cell-C');
    expect(cellC).toBeDefined();
    expect(cellC!.listingCount).toBe(0);
    expect(cellC!.rivalListingCount).toBe(1);
    expect(cellC!.shadowListingCount).toBe(0);
  });

  it('distinguishes co_sells_with from competes_with edges', () => {
    const state = makeGameState(42);
    const graph = buildWorldGraph(state);

    const coSaleEdges = graph.edges.filter((e) => e.kind === 'co_sells_with');
    const rivalEdges = graph.edges.filter((e) => e.kind === 'competes_with');

    // co_sells_with: only between player listings in same ACN
    // Both case-1 and case-2 belong to player ACN (acn-cooperative), so they should have a co_sells_with edge
    for (const edge of coSaleEdges) {
      const sourceNode = graph.nodes.find((n) => n.id === edge.sourceId);
      const targetNode = graph.nodes.find((n) => n.id === edge.targetId);
      expect(sourceNode?.kind).toBe('listing');
      expect(targetNode?.kind).toBe('listing');
      // Same ACN
      expect(edge.properties).toHaveProperty('acnId');
    }

    // competes_with: between player listing and rival listing in same cell + same price band
    for (const edge of rivalEdges) {
      const sourceNode = graph.nodes.find((n) => n.id === edge.sourceId);
      const targetNode = graph.nodes.find((n) => n.id === edge.targetId);
      // One should be listing, the other should be rival_listing
      const kinds = new Set([sourceNode?.kind, targetNode?.kind]);
      expect(kinds.has('listing')).toBe(true);
      expect(kinds.has('rival_listing')).toBe(true);
      expect(edge.properties).toHaveProperty('reason', 'same_cell_same_price_band');
    }

    // With 2 player listings in the same ACN: expect 1 co_sells_with edge
    expect(coSaleEdges.length).toBeGreaterThanOrEqual(1);

    // With rival listings in overlapping price bands: expect some competes_with edges
    // case-1 (350w, cell-A) vs rival-1 (360w, cell-A) — same price band (200w_400w)
    // case-2 (550w, cell-B) vs rival-2 (580w, cell-B) — same price band (400w_600w)
    expect(rivalEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('does not introduce domain -> application reverse dependency', async () => {
    // This test verifies the import structure by checking that the builder
    // module only imports from domain/ and same-layer application/projections/
    // We verify this structurally by checking the imports of the module source
    const fs = await import('fs');
    const path = await import('path');
    const builderSource = fs.readFileSync(
      path.resolve(__dirname, '../projections/worldGraphBuilder.ts'),
      'utf-8',
    );

    // Should not import from core/
    expect(builderSource).not.toMatch(/from\s+['"].*\/core\//);
    // Should not import from interfaces/
    expect(builderSource).not.toMatch(/from\s+['"].*\/interfaces\//);
    // Should not import from ui/
    expect(builderSource).not.toMatch(/from\s+['"].*\/ui\//);

    // Should import from domain/
    expect(builderSource).toMatch(/from\s+['"].*\/domain\//);
    // Should import from same-layer projections/ (or relative ./ which is same dir)
    expect(builderSource).toMatch(/from\s+['"].*(?:\/projections\/|\.\/)/);
  });
});
