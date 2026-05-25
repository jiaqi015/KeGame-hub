import type { Case, CustomerProfile, CustomerRuntimeState, GameState, Opportunity, RivalListing } from '../models.js';
import { BALANCE } from '../config/balance.js';
import { CASE_STAGES } from '../constants.js';
import { logEvent } from '../runtimeState.js';
import { chance, clamp, intersections, randomInt } from '../utils.js';
import { applyBrokerOwnerTrustDelta } from '../trustWriteHelper.js';
import { getActiveOpportunities, MAX_ACTIVE_OPPORTUNITIES_PER_CASE, refreshOpportunityLabel } from './opportunityEngine.js';
import { getRivalOutcomeControl, scaleProbability } from './outcomeControlRuntime.js';
import { applyOpportunityIntentDeltaOnState, applyOpportunityConfidenceDeltaOnState, setOpportunityDaysLeftOnState, setOpportunityTouchedTodayOnState, setOpportunityVisibilityOnState, setOpportunityStatusOnState, setOpportunityLifecycleStatusOnState, setOpportunityStageIndexOnState, setOpportunityFit, findMatchStateForPair, ensureCustomerCaseMatchState, syncCustomerRuntimeStageMirrorFromOpportunityOnState, syncCaseStageMirrorFromCaseProgressionOnState } from '../opportunitySplitHelper.js';
import type { PressureReceiptSink } from '../../core/world-state/competition/models.js';

// ---------------------------------------------------------------------------
// R20 Customer-journey stage mirror helper
// ---------------------------------------------------------------------------
// This is the canonical write path for customer runtime.stageIndex mirrors.
// Lower stages (0-3) are customer-journey mirrors that advance with interest/confidence.
// Late stages (4+) are also permitted here as customer-journey mirrors — the
// structural truth check for negotiation/closing is on Opportunity.stageIndex,
// not runtime.stageIndex. Opportunity.stageIndex >= 4 requires trajectory evidence.
// ---------------------------------------------------------------------------

function syncCustomerJourneyStageMirror(
  runtime: { stageIndex: number },
  newStage: number,
): void {
  runtime.stageIndex = newStage;
}

function buildDecisionStyle(customer: CustomerProfile): CustomerRuntimeState['decisionStyle'] {
  if (customer.urgency >= 76 && customer.activity >= 72) {
    return 'decisive';
  }
  if (customer.priceSensitivity >= 72 || customer.activity <= 54) {
    return 'hesitant';
  }
  return 'balanced';
}

function ensureCustomerState(state: GameState, customer: CustomerProfile) {
  let existing = state.customerStates.find((entry) => entry.customerId === customer.id);
  if (existing) {
    return existing;
  }

  existing = {
    customerId: customer.id,
    status: 'idle',
    decisionStyle: buildDecisionStyle(customer),
    advisorTrust: clamp(48 + randomInt(-8, 8, state), 20, 88),
    fatigue: clamp(12 + randomInt(-6, 6, state), 0, 60),
    churnRisk: clamp(16 + randomInt(-8, 10, state), 0, 80),
    activeCaseIds: [],
    caseStates: {},
    lastTouchDay: 0,
    lastActionNote: '',
  };
  state.customerStates.push(existing);
  return existing;
}

function computeFit(caseItem: Case, customer: CustomerProfile) {
  const fitBalance = BALANCE.opportunities.fit;
  const layoutScore = customer.layouts.includes(caseItem.layout) ? fitBalance.layoutMatch : fitBalance.layoutMismatch;
  const districtScore = customer.targetDistrict === caseItem.district ? fitBalance.districtMatch : fitBalance.districtMismatch;
  const budgetCenter = (customer.budgetMin + customer.budgetMax) / 2;
  const priceGap = Math.abs(caseItem.askPrice - budgetCenter);
  const budgetScore = clamp(
    fitBalance.budgetBase - priceGap / fitBalance.budgetDivisor,
    fitBalance.budgetMin,
    fitBalance.budgetMax,
  );
  const preferenceScore = intersections(caseItem.tags, [...customer.preferences]) * fitBalance.preferenceIntersectionWeight;
  return clamp(
    layoutScore + districtScore + budgetScore + preferenceScore + caseItem.competitiveness * fitBalance.competitivenessWeight,
    0,
    100,
  );
}

function ensureCustomerCaseLink(state: GameState, customer: CustomerProfile, customerState: CustomerRuntimeState, caseItem: Case) {
  if (customerState.caseStates[caseItem.id]) {
    return customerState.caseStates[caseItem.id];
  }

  const fit = computeFit(caseItem, customer);
  const budgetPenalty = Math.max(0, caseItem.askPrice - customer.budgetMax) / 6;
  const interest = clamp(24 + fit * 0.52 + customer.activity * 0.14 - budgetPenalty + randomInt(-5, 6, state), 8, 95);
  const confidence = clamp(28 + fit * 0.34 + customer.urgency * 0.12 + randomInt(-5, 5, state), 10, 92);
  const runtime = {
    caseId: caseItem.id,
    fit,
    interest,
    confidence,
    stageIndex: interest >= 72 ? 1 : 0,
    interactions: 0,
    lastActiveDay: state.day,
    viewed: false,
    offered: false,
    selected: false,
    competingCaseIds: [],
  };
  customerState.caseStates[caseItem.id] = runtime;
  if (!customerState.activeCaseIds.includes(caseItem.id)) {
    customerState.activeCaseIds.push(caseItem.id);
  }
  return runtime;
}

function deriveCustomerStatus(customerState: CustomerRuntimeState) {
  const activeEntries = Object.values(customerState.caseStates)
    .filter((entry) => entry.interest >= 26)
    .sort((left, right) => (right.stageIndex * 100 + right.interest + right.confidence) - (left.stageIndex * 100 + left.interest + left.confidence));

  customerState.activeCaseIds = activeEntries.slice(0, 3).map((entry) => entry.caseId);

  if (!activeEntries.length) {
    customerState.status = customerState.churnRisk >= 72 ? 'lost' : 'idle';
    return;
  }

  const lead = activeEntries[0];
  if (lead.stageIndex >= 4) {
    customerState.status = 'negotiating';
    return;
  }
  if (lead.stageIndex >= 2) {
    customerState.status = 'engaged';
    return;
  }
  if ((lead.competingCaseIds?.length || 0) > 0 && lead.interest >= 42) {
    customerState.status = 'comparing';
    return;
  }
  if (activeEntries.length >= 2 && Math.abs((activeEntries[0]?.interest || 0) - (activeEntries[1]?.interest || 0)) <= 12) {
    customerState.status = 'comparing';
    return;
  }
  customerState.status = 'browsing';
}

function scoreExternalCompetitorForCustomer(
  customer: CustomerProfile,
  caseItem: Case,
  rival: RivalListing,
) {
  const sameCell = rival.marketCellId === caseItem.marketCellId ? 34 : 0;
  const sameDistrict = rival.district === caseItem.district || rival.district === customer.targetDistrict ? 20 : 0;
  const budgetGapRatio = Math.abs(rival.askPrice - Math.min(customer.budgetMax, caseItem.askPrice)) / Math.max(customer.budgetMax, 1);
  const budgetFit = Math.max(0, 22 - Math.round(budgetGapRatio * 120));
  const pull = rival.leadSiphonPower * 0.24 + rival.heat * 0.18 + rival.freshness * 0.12;
  return sameCell + sameDistrict + budgetFit + pull;
}

function getExternalCompetingListingIds(
  state: GameState,
  customer: CustomerProfile,
  caseItem: Case,
) {
  return (state.marketShadow?.rivalListings || [])
    .filter((rival) => rival.status === 'active')
    .filter((rival) => (
      rival.marketCellId === caseItem.marketCellId
      || rival.district === caseItem.district
      || rival.district === customer.targetDistrict
    ))
    .map((rival) => ({
      rival,
      score: scoreExternalCompetitorForCustomer(customer, caseItem, rival),
    }))
    .filter((entry) => entry.score >= 52)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((entry) => entry.rival.id);
}

function applyCustomerDay(state: GameState, customer: CustomerProfile, customerState: CustomerRuntimeState) {
  const funnelProgressionScale = Math.max(0, state.rules.outcomeControl.playerFunnelProgressionScale);
  const stagnationScale = Math.max(0, state.rules.outcomeControl.customerStagnationScale);
  const candidateCases = state.cases.filter((entry) =>
    entry.status === 'active' && entry.district === customer.targetDistrict,
  );
  if (!candidateCases.length) {
    customerState.status = 'idle';
    customerState.activeCaseIds = [];
    customerState.caseStates = {};
    return;
  }

  const ranked = candidateCases
    .map((caseItem) => ({
      caseItem,
      fit: computeFit(caseItem, customer),
    }))
    .sort((left, right) => right.fit - left.fit)
    .slice(0, 3);

  ranked.forEach(({ caseItem }) => {
    const runtime = ensureCustomerCaseLink(state, customer, customerState, caseItem);
    runtime.competingCaseIds = getExternalCompetingListingIds(state, customer, caseItem);
    const caseHeatBoost = (caseItem.heat - 55) / 10;
    const trustBoost = (customerState.advisorTrust - 50) / 12;
    const fatiguePenalty = (customerState.fatigue / 14) * stagnationScale;
    const comparePenalty = (customerState.status === 'comparing' && !runtime.selected ? 2.5 : 0) * stagnationScale;
    const interactionBoost = runtime.interactions > 0 ? Math.min(8, runtime.interactions * 1.5) : 0;
    const rivalryPenalty = (runtime.competingCaseIds?.length || 0) * 1.2;
    const priceAdvantage = runtime.fit >= 70 && caseItem.askPrice <= caseItem.marketPrice * 1.01 ? 2.8 : 0;

    runtime.interest = clamp(
      runtime.interest
        + caseHeatBoost
        + trustBoost
        + interactionBoost
        + priceAdvantage
        - fatiguePenalty
        - comparePenalty
        - rivalryPenalty
        + randomInt(-4, 4, state),
      0,
      100,
    );
    runtime.confidence = clamp(
      runtime.confidence
        + (caseItem.trust - 55) / 14
        + (caseItem.d3 - 50) / 16
        - (customer.priceSensitivity / 80) * stagnationScale
        - rivalryPenalty * 0.7
        + randomInt(-3, 3, state),
      0,
      100,
    );

    const advanceThreshold = customerState.decisionStyle === 'decisive'
      ? 64
      : customerState.decisionStyle === 'hesitant'
        ? 78
        : 70;
    if (runtime.stageIndex < 5 && runtime.interest >= advanceThreshold && runtime.confidence >= advanceThreshold - 6 && chance(clamp(0.28 * funnelProgressionScale, 0, 0.95), state)) {
      syncCustomerJourneyStageMirror(runtime, runtime.stageIndex + 1);
      runtime.lastActiveDay = state.day;
      if (runtime.stageIndex >= 2) {
        runtime.viewed = true;
      }
      if (runtime.stageIndex >= 4) {
        runtime.offered = true;
      }
    } else if (runtime.interest < 24 || runtime.confidence < 20) {
      syncCustomerJourneyStageMirror(runtime, Math.max(0, runtime.stageIndex - 1));
    }
  });

  deriveCustomerStatus(customerState);

  if (customerState.activeCaseIds.length >= 2) {
    const [leadCaseId, secondCaseId] = customerState.activeCaseIds;
    const lead = customerState.caseStates[leadCaseId];
    const second = customerState.caseStates[secondCaseId];
    if (lead && second) {
      const gap = (lead.interest + lead.confidence) - (second.interest + second.confidence);
      if (Math.abs(gap) <= 10) {
        customerState.status = 'comparing';
      } else if (gap > 10) {
        second.interest = clamp(second.interest - 4, 0, 100);
        second.confidence = clamp(second.confidence - 3, 0, 100);
        lead.selected = true;
        second.selected = false;
      }
    }
  }

  customerState.fatigue = clamp(
    customerState.fatigue
      + (customerState.status === 'engaged' || customerState.status === 'negotiating' ? 4 : 1) * stagnationScale
      - (customerState.lastTouchDay === state.day ? 3 : 0),
    0,
    100,
  );
  customerState.churnRisk = clamp(
    customerState.churnRisk
      + (customerState.status === 'idle' ? 4 : 0) * stagnationScale
      + (customerState.status === 'comparing' ? 3 : 0) * stagnationScale
      + (customerState.fatigue > 70 ? 4 : 0) * stagnationScale
      - (customerState.lastTouchDay === state.day ? 5 : 0),
    0,
    100,
  );
}

function syncOpportunityFromCustomer(
  state: GameState,
  customer: CustomerProfile,
  customerState: CustomerRuntimeState,
  caseItem: Case,
  runtime: CustomerRuntimeState['caseStates'][string],
) {
  let opportunity = state.opportunities.find((entry) =>
    entry.customerId === customer.id && entry.caseId === caseItem.id && entry.status === 'active',
  );

  const shouldBeVisible = runtime.interest >= 30 && runtime.confidence >= 24 && runtime.stageIndex >= 0;
  if (!shouldBeVisible) {
    if (opportunity) {
      setOpportunityStatusOnState(state, opportunity, 'lost', '客户不可见标记丢失');
      refreshOpportunityLabel(state, opportunity);
    }
    return;
  }

  if (!opportunity) {
    if (
      state.day <= 1
      || getActiveOpportunities(state, caseItem.id).length >= MAX_ACTIVE_OPPORTUNITIES_PER_CASE
    ) {
      return;
    }

    const channel = state.channels[randomInt(0, Math.max(0, state.channels.length - 1), state)] ?? state.channels[0];
    opportunity = {
      id: `${caseItem.id}-${customer.id}-${state.day}-${randomInt(100, 999, state)}`,
      caseId: caseItem.id,
      customerId: customer.id,
      customerName: customer.name,
      profile: customer.profile,
      channelId: channel?.id || 'private-referral',
      channelName: channel?.name || '客户池',
      fit: Math.round(runtime.fit),
      intent: Math.round(runtime.interest),
      confidence: Math.round(runtime.confidence),
      stageIndex: runtime.stageIndex,
      stageLabel: '线上咨询',
      status: 'active',
      lifecycleStatus: 'active',
      createdDay: state.day,
      daysLeft: 5,
      touchedToday: customerState.lastTouchDay === state.day,
      budgetMax: customer.budgetMax,
      priceSensitivity: customer.priceSensitivity,
      stagnationTicks: 0,
      history: [],
      leadSource: customerState.lastActionNote?.includes('经纪人') ? 'broker' : 'direct',
      visibility: customerState.lastActionNote?.includes('待确认') ? 'shadow' : 'revealed',
      brokerName: customerState.lastActionNote?.includes('经纪人')
        ? `链家协同${randomInt(1, 9, state)}号`
        : undefined,
    };
    state.opportunities.unshift(opportunity);
  }

  const previousStageIndex = opportunity.stageIndex;
  const previousDaysLeft = opportunity.daysLeft;

  // Sync from customer runtime to opportunity via helpers
  // Ensure canonical match state exists, then write through helper
  const match = ensureCustomerCaseMatchState(
    state,
    opportunity.customerId,
    opportunity.caseId,
    Math.round(runtime.fit),
    Math.round(runtime.interest),
    Math.round(runtime.confidence),
    opportunity.budgetMax,
    opportunity.priceSensitivity,
  );
  setOpportunityFit(state, match, Math.round(runtime.fit), '客户运行态同步匹配度');
  applyOpportunityIntentDeltaOnState(state, opportunity, Math.round(runtime.interest) - opportunity.intent, '客户运行时同步意向', 0, 100);
  applyOpportunityConfidenceDeltaOnState(state, opportunity, Math.round(runtime.confidence) - opportunity.confidence, '客户运行时同步置信度', 0, 100);
  setOpportunityStageIndexOnState(state, opportunity, Math.max(opportunity.stageIndex, runtime.stageIndex), '客户运行时同步阶段');
  syncCustomerRuntimeStageMirrorFromOpportunityOnState(state, opportunity, runtime, '客户运行时同步阶段');
  setOpportunityLifecycleStatusOnState(state, opportunity, runtime.interactions > 0 ? 'active' : opportunity.lifecycleStatus, '客户运行时同步生命周期');
  if (previousStageIndex === opportunity.stageIndex) {
    setOpportunityDaysLeftOnState(state, opportunity, previousDaysLeft, '客户运行时同步剩余天数');
  }
  setOpportunityTouchedTodayOnState(state, opportunity, customerState.lastTouchDay === state.day, '客户运行时同步今日触达');
  refreshOpportunityLabel(state, opportunity);
}

export function initializeCustomerStates(state: GameState) {
  state.customerStates = state.customers.map((customer) => ({
    customerId: customer.id,
    status: 'idle',
    decisionStyle: buildDecisionStyle(customer),
    advisorTrust: clamp(48 + randomInt(-8, 8, state), 20, 88),
    fatigue: clamp(12 + randomInt(-6, 6, state), 0, 60),
    churnRisk: clamp(16 + randomInt(-8, 10, state), 0, 80),
    activeCaseIds: [],
    caseStates: {},
    lastTouchDay: 0,
    lastActionNote: '',
  }));
}

export function progressCustomerDemand(state: GameState) {
  const customersById = new Map(state.customers.map((entry) => [entry.id, entry] as const));
  state.customers.forEach((customer) => {
    const customerState = ensureCustomerState(state, customer);
    applyCustomerDay(state, customer, customerState);
  });

  state.customerStates.forEach((customerState) => {
    const customer = customersById.get(customerState.customerId);
    if (!customer) return;
    customerState.activeCaseIds.forEach((caseId, index) => {
      const caseItem = state.cases.find((entry) => entry.id === caseId && entry.status === 'active');
      const runtime = customerState.caseStates[caseId];
      if (!caseItem || !runtime) return;
      runtime.selected = index === 0;
      syncOpportunityFromCustomer(state, customer, customerState, caseItem, runtime);
    });
  });
}

export function applyRivalPullOnCustomers(state: GameState, sink?: PressureReceiptSink) {
  const { rivalCustomerPullScale } = getRivalOutcomeControl(state);
  const activeRivals = state.marketShadow.rivalListings.filter((entry) => entry.status === 'active');
  if (!activeRivals.length) return;

  state.customerStates.forEach((customerState) => {
    const leadCaseId = customerState.activeCaseIds[0];
    if (!leadCaseId) return;
    const leadRuntime = customerState.caseStates[leadCaseId];
    const leadCase = state.cases.find((entry) => entry.id === leadCaseId && entry.status === 'active');
    if (!leadRuntime || !leadCase) return;

    const rival = activeRivals
      .filter((entry) => entry.marketCellId === leadCase.marketCellId)
      .sort((left, right) => (right.leadSiphonPower + right.heat + right.freshness) - (left.leadSiphonPower + left.heat + left.freshness))[0];
    if (!rival) return;

    const pressure = ((rival.leadSiphonPower + rival.heat + rival.freshness) / 3) * rivalCustomerPullScale;
    if (pressure < 58) return;

    const interestDelta = -pressure / 18;
    const confidenceDelta = -pressure / 24;
    const churnDelta = pressure / 22;
    leadRuntime.interest = clamp(leadRuntime.interest + interestDelta, 0, 100);
    leadRuntime.confidence = clamp(leadRuntime.confidence + confidenceDelta, 0, 100);
    customerState.churnRisk = clamp(customerState.churnRisk + churnDelta, 0, 100);

    // Receipt: collect pressure input for rival customer pull
    sink?.collectPressure({
      source: 'rival-customer-pull',
      caseId: leadCaseId,
      day: state.day,
      dimension: 'intent',
      magnitude: Math.round(interestDelta * 100) / 100,
      evidence: `客户注意力被竞品 ${rival.title} 分流（压力值 ${Math.round(pressure)}）。`,
      sourceEntityId: rival.id,
      sourceEntityLabel: rival.title,
      evidenceKind: 'rival-customer-pull-attention',
      evidenceStrength: Math.min(100, Math.round(pressure)),
      customerRuntimeIds: [customerState.customerId],
    });

    if (leadRuntime.interest < 42 && chance(scaleProbability(0.16, rivalCustomerPullScale, 0.85), state)) {
      customerState.status = 'comparing';
      customerState.lastActionNote = `被竞品 ${rival.title} 抢走注意力`;
      if (!leadRuntime.competingCaseIds?.includes(rival.id)) {
        leadRuntime.competingCaseIds = [...(leadRuntime.competingCaseIds || []), rival.id].slice(0, 3);
      }
      logEvent(state, '客户变化', `${leadCase.title} 有客户被竞品 ${rival.title} 抢走注意力，开始转去比较。`, 'danger');
    }
  });
}

export function deriveCustomerPressureSummary(state: GameState) {
  const engaged = state.customerStates.filter((entry) => entry.status === 'engaged' || entry.status === 'negotiating').length;
  const comparing = state.customerStates.filter((entry) => entry.status === 'comparing').length;
  const atRisk = state.customerStates.filter((entry) => entry.churnRisk >= 60).length;
  const strongestCaseEntries = [...state.cases]
    .filter((entry) => entry.status === 'active')
    .map((entry) => ({
      caseId: entry.id,
      title: entry.title,
      selectedCount: state.customerStates.filter((customerState) => customerState.caseStates[entry.id]?.selected).length,
    }))
    .sort((left, right) => right.selectedCount - left.selectedCount);
  const strongestCase = strongestCaseEntries[0] || null;
  const leadCaseIds = {
    engaged: pickLeadCaseId(
      state,
      (entry) => entry.status === 'engaged' || entry.status === 'negotiating',
    ),
    comparing: pickLeadCaseId(state, (entry) => entry.status === 'comparing'),
    atRisk: pickLeadCaseId(state, (entry) => entry.churnRisk >= 60),
  };

  return {
    engaged,
    comparing,
    atRisk,
    engagedCaseId: leadCaseIds.engaged,
    comparingCaseId: leadCaseIds.comparing,
    atRiskCaseId: leadCaseIds.atRisk,
    strongestCaseId: strongestCase?.caseId || null,
    strongestCaseTitle: strongestCase?.title || null,
  };
}

function pickLeadCaseId(
  state: GameState,
  predicate: (entry: CustomerRuntimeState) => boolean,
) {
  const counts = new Map<string, number>();
  state.customerStates
    .filter(predicate)
    .forEach((entry) => {
      const leadCaseId = entry.activeCaseIds[0];
      if (!leadCaseId) return;
      counts.set(leadCaseId, (counts.get(leadCaseId) || 0) + 1);
    });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])[0]?.[0] || null;
}

export function applyCustomerFeedbackToCases(state: GameState, sink?: PressureReceiptSink) {
  const caseSummaries = new Map<string, {
    activeCustomers: number;
    highIntentCustomers: number;
    comparingCustomers: number;
    negotiatingCustomers: number;
    selectedCustomers: number;
    totalInterest: number;
    totalConfidence: number;
  }>();

  state.customerStates.forEach((customerState) => {
    customerState.activeCaseIds.forEach((caseId) => {
      const runtime = customerState.caseStates[caseId];
      if (!runtime) return;
      const summary = caseSummaries.get(caseId) || {
        activeCustomers: 0,
        highIntentCustomers: 0,
        comparingCustomers: 0,
        negotiatingCustomers: 0,
        selectedCustomers: 0,
        totalInterest: 0,
        totalConfidence: 0,
      };
      summary.activeCustomers += 1;
      if (runtime.interest >= 68) summary.highIntentCustomers += 1;
      if (customerState.status === 'comparing') summary.comparingCustomers += 1;
      if (customerState.status === 'negotiating' || runtime.stageIndex >= 4) summary.negotiatingCustomers += 1;
      if (runtime.selected) summary.selectedCustomers += 1;
      summary.totalInterest += runtime.interest;
      summary.totalConfidence += runtime.confidence;
      caseSummaries.set(caseId, summary);
    });
  });

  state.cases.forEach((caseItem) => {
    if (caseItem.status !== 'active') return;
    const summary = caseSummaries.get(caseItem.id);
    if (!summary) {
      const oldHeat = caseItem.heat;
      const oldTrust = caseItem.trust;
      caseItem.heat = clamp(caseItem.heat - 3, 0, 100);
      applyBrokerOwnerTrustDelta(state, caseItem, -1.5, '无活跃客户信任自然下降', 0, 100);
      caseItem.offers = 0;

      // Receipt: no active customer feedback
      sink?.collectPressure({
        source: 'customer-feedback',
        caseId: caseItem.id,
        day: state.day,
        dimension: 'heat',
        magnitude: Math.round((caseItem.heat - oldHeat) * 100) / 100,
        evidence: `${caseItem.title} 无活跃客户，热度自然下降。`,
        evidenceKind: 'customer-no-active-leads',
        evidenceStrength: 40,
      });
      sink?.collectPressure({
        source: 'customer-feedback',
        caseId: caseItem.id,
        day: state.day,
        dimension: 'trust',
        magnitude: Math.round((caseItem.trust - oldTrust) * 100) / 100,
        evidence: `${caseItem.title} 无活跃客户，业主信心下降。`,
        evidenceKind: 'customer-no-active-leads',
        evidenceStrength: 30,
      });
      return;
    }

    const avgInterest = summary.totalInterest / Math.max(1, summary.activeCustomers);
    const avgConfidence = summary.totalConfidence / Math.max(1, summary.activeCustomers);
    const oldHeat = caseItem.heat;
    const oldTrust = caseItem.trust;
    caseItem.heat = clamp(
      caseItem.heat
        + (avgInterest - 52) / 10
        + summary.selectedCustomers * 1.2
        + summary.activeCustomers * 0.5
        - summary.comparingCustomers * 1.1,
      0,
      100,
    );
    const trustDeltaExpr = (avgConfidence - 50) / 14
      + summary.negotiatingCustomers * 0.7
      + summary.selectedCustomers * 0.5
      - summary.comparingCustomers * 0.45;
    applyBrokerOwnerTrustDelta(state, caseItem, trustDeltaExpr, '客户反馈影响信任', 0, 100);

    // Receipt: customer feedback effect on heat/trust
    const heatDelta = Math.round((caseItem.heat - oldHeat) * 100) / 100;
    const trustDelta = Math.round((caseItem.trust - oldTrust) * 100) / 100;
    if (Math.abs(heatDelta) >= 0.01 || Math.abs(trustDelta) >= 0.01) {
      const dominantSignal = summary.negotiatingCustomers > 0
        ? 'customer-high-intent-feedback'
        : summary.comparingCustomers > 0
          ? 'customer-comparing'
          : 'customer-no-active-leads';
      const dominantStrength = summary.negotiatingCustomers > 0
        ? 65
        : summary.comparingCustomers > 0
          ? 50
          : 40;
      if (Math.abs(heatDelta) >= 0.01) {
        sink?.collectPressure({
          source: 'customer-feedback',
          caseId: caseItem.id,
          day: state.day,
          dimension: 'heat',
          magnitude: heatDelta,
          evidence: `${caseItem.title} 客户反馈：${summary.activeCustomers} 活跃 / ${summary.negotiatingCustomers} 谈判中 / ${summary.comparingCustomers} 比较中。`,
          evidenceKind: dominantSignal,
          evidenceStrength: dominantStrength,
        });
      }
      if (Math.abs(trustDelta) >= 0.01) {
        sink?.collectPressure({
          source: 'customer-feedback',
          caseId: caseItem.id,
          day: state.day,
          dimension: 'trust',
          magnitude: trustDelta,
          evidence: `${caseItem.title} 客户反馈影响业主信心：${summary.activeCustomers} 活跃 / ${summary.negotiatingCustomers} 谈判中。`,
          evidenceKind: dominantSignal,
          evidenceStrength: dominantStrength,
        });
      }
    }
    caseItem.viewings = Math.max(caseItem.viewings, summary.activeCustomers);
    caseItem.offers = Math.max(caseItem.offers, summary.negotiatingCustomers > 0 ? 1 : 0);

    if (summary.negotiatingCustomers >= 1) {
      syncCaseStageMirrorFromCaseProgressionOnState(caseItem, { legacyStageIndex: Math.max(caseItem.stageIndex, 4) }, CASE_STAGES.length - 2);
    } else if (summary.highIntentCustomers >= 1) {
      syncCaseStageMirrorFromCaseProgressionOnState(caseItem, { legacyStageIndex: Math.max(caseItem.stageIndex, 3) }, CASE_STAGES.length - 2);
    } else if (summary.activeCustomers >= 2) {
      syncCaseStageMirrorFromCaseProgressionOnState(caseItem, { legacyStageIndex: Math.max(caseItem.stageIndex, 2) }, CASE_STAGES.length - 2);
    } else if (summary.activeCustomers >= 1) {
      syncCaseStageMirrorFromCaseProgressionOnState(caseItem, { legacyStageIndex: Math.max(caseItem.stageIndex, 1) }, CASE_STAGES.length - 2);
    }

    if (summary.comparingCustomers >= 2 && chance(0.1, state)) {
      logEvent(state, '客户比较', `${caseItem.title} 有一批客户正在和同类盘反复比较，价格与讲法都还需要更硬。`, 'danger');
    } else if (summary.highIntentCustomers >= 2 && chance(0.12, state)) {
      logEvent(state, '客户升温', `${caseItem.title} 这两天客户讨论明显更密，已经出现连续推进的迹象。`, 'success');
    }
  });
}

export function touchCustomersForCase(
  state: GameState,
  caseId: string,
  effect: {
    interestDelta?: number;
    confidenceDelta?: number;
    advisorTrustDelta?: number;
    stageAdvance?: number;
    revealShadow?: boolean;
    note: string;
  },
) {
  state.customerStates.forEach((customerState) => {
    const runtime = customerState.caseStates[caseId];
    if (!runtime) return;
    runtime.interest = clamp(runtime.interest + (effect.interestDelta || 0), 0, 100);
    runtime.confidence = clamp(runtime.confidence + (effect.confidenceDelta || 0), 0, 100);
    syncCustomerJourneyStageMirror(runtime, clamp(runtime.stageIndex + (effect.stageAdvance || 0), 0, 5));
    runtime.interactions += 1;
    runtime.lastActiveDay = state.day;
    customerState.advisorTrust = clamp(customerState.advisorTrust + (effect.advisorTrustDelta || 0), 0, 100);
    customerState.lastTouchDay = state.day;
    customerState.lastActionNote = effect.note;
    runtime.selected = true;
    if (!customerState.activeCaseIds.includes(caseId)) {
      customerState.activeCaseIds.unshift(caseId);
    }

    const opportunity = state.opportunities.find((entry) =>
      entry.caseId === caseId && entry.customerId === customerState.customerId && entry.status === 'active',
    );
    if (opportunity) {
      if (effect.revealShadow) {
        setOpportunityVisibilityOnState(state, opportunity, 'revealed', '客户触达揭示');
      }
      setOpportunityTouchedTodayOnState(state, opportunity, true, '客户触达标记');
      applyOpportunityIntentDeltaOnState(state, opportunity, Math.round(runtime.interest) - opportunity.intent, '客户触达同步意向', 0, 100);
      applyOpportunityConfidenceDeltaOnState(state, opportunity, Math.round(runtime.confidence) - opportunity.confidence, '客户触达同步置信度', 0, 100);
      setOpportunityStageIndexOnState(state, opportunity, Math.max(opportunity.stageIndex, runtime.stageIndex), '客户触达同步阶段');
      syncCustomerRuntimeStageMirrorFromOpportunityOnState(state, opportunity, runtime, '客户触达同步阶段');
      refreshOpportunityLabel(state, opportunity);
    }
  });
}
