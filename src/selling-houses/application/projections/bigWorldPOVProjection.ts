/**
 * BigWorldPOVProjection — Because-Big vertical slice projection.
 *
 * Answers the core product question:
 *   "How does the player know the big world moved and I see something different?"
 *
 * Architecture:
 *   - Pure read-only projection over GameState (no mutations)
 *   - Reads market cell, rival listings, customer demand, owner signals
 *   - Produces bounded POV signals (never exposes full hidden arrays)
 *   - Causal refs are bounded and player-safe
 *
 * Mother model alignment:
 *   - POV reads the world; does not mutate it (Section 1.1)
 *   - ActorPOV is not UI state (Section 0.2)
 *   - Competition pressure flows: CompetitionEvidence → POV → DecisionPressureDelta
 *   - Signal sources: visible / inferred / relayed / observed summaries only
 *   - No full hidden shadow listing/customer/broker arrays exposed
 */

import type {
  Case,
  CustomerRuntimeState,
  GameState,
  MarketCell,
  Opportunity,
  RivalListing,
} from '../../domain/models.js';

import {
  attributePressure,
} from './acnAttribution.js';

import type {
  ActorKnowledgeSnapshot,
} from './actorKnowledgeProjection.js';

import {
  applyKnowledgeFilterToPOV,
  buildDecisionEvidenceEnvelope,
} from './actorKnowledgeProjection.js';

import type {
  InformationSourceRegistry,
} from '../../domain/world-model/informationSourceRegistry.js';

import type {
  WorldCausalEvent,
} from '../../domain/world-model/causalEvents.js';

import {
  buildSharedCausalRefs,
  type SharedCausalRefs,
} from './perfectProjectionAdapters.js';
import { deriveBrandId } from '../../domain/world-model/runtime/brandIdHelper.js';

// ── POV signal source ────────────────────────────────────────

export type POVSignalSource = 'systemic' | 'observed' | 'inferred' | 'relayed';

// ── Causal ref (bounded, player-safe) ────────────────────────

export interface POVCausalRef {
  refType: 'market-cell' | 'rival-listing' | 'rival-store' | 'case' | 'opportunity' | 'market-signal' | 'demand-segment';
  refId: string;
  refLabel: string;
}

// ── LiveCausalContext — shared live causal refs across sub-projections ──

/**
 * LiveCausalContext holds POVCausalRefs derived from real runtime causal events.
 * The same refs are injected into multiple sub-projections so that one live causal
 * event (e.g. a rival reprice) drives multiple product surfaces simultaneously.
 *
 * Bounded: at most ~8 refs total, deduplicated by refId.
 * No raw event payload exposed — only bounded POVCausalRef triples.
 */
export interface LiveCausalContext {
  /** Rival actions affecting this case's market cell (last 3 days). */
  readonly rivalRefs: readonly POVCausalRef[];
  /** Customer attention shifts / comparisons (last 3 days). */
  readonly customerRefs: readonly POVCausalRef[];
  /** Owner perception events for this case (last 3 days). */
  readonly ownerRefs: readonly POVCausalRef[];
  /** Broker recommendation changes for this case (last 3 days). */
  readonly recommendationRefs: readonly POVCausalRef[];
  /** All deduplicated refs for cross-domain injection. */
  readonly allRefs: readonly POVCausalRef[];
}

function uniquePOVRefs(refs: readonly POVCausalRef[]): POVCausalRef[] {
  const seen = new Set<string>();
  const result: POVCausalRef[] = [];
  for (const ref of refs) {
    if (seen.has(ref.refId)) continue;
    seen.add(ref.refId);
    result.push(ref);
  }
  return result;
}

function eventMatchesCaseOrCell(event: WorldCausalEvent, caseId: string, cellId: string): boolean {
  const payload = event.payload as unknown as Record<string, unknown>;
  const affectedMarketCellIds = payload['affectedMarketCellIds'];
  return event.affectedIds.includes(caseId)
    || event.entityIds.includes(caseId)
    || (cellId.length > 0 && (event.affectedIds.includes(cellId) || event.entityIds.includes(cellId)))
    || payload['caseId'] === caseId
    || payload['targetCaseId'] === caseId
    || (cellId.length > 0 && (
      payload['marketCellId'] === cellId
      || payload['targetMarketCellId'] === cellId
      || (Array.isArray(affectedMarketCellIds) && affectedMarketCellIds.includes(cellId))
    ));
}

function eventToPOVRef(event: WorldCausalEvent): POVCausalRef {
  if (event.kind === 'RivalListingRepriced' || event.kind === 'RivalBrokerActionTaken') {
    return { refType: 'rival-listing', refId: event.id, refLabel: `竞品动作 day ${event.day}` };
  }
  if (event.kind === 'CustomerComparedListings' || event.kind === 'CustomerAttentionShifted') {
    return { refType: 'market-signal', refId: event.id, refLabel: `客户需求变化 day ${event.day}` };
  }
  if (event.kind === 'OwnerMarketPressurePerceived') {
    return { refType: 'case', refId: event.id, refLabel: `业主压力感知 day ${event.day}` };
  }
  if (event.kind === 'BrokerRecommendationChanged' || event.kind === 'MatterPriorityChanged') {
    return { refType: 'market-signal', refId: event.id, refLabel: `系统建议变化 day ${event.day}` };
  }
  return { refType: 'market-signal', refId: event.id, refLabel: `市场变化 day ${event.day}` };
}

type ColdLedgerSummaryLike = {
  readonly bySourceKind: ReadonlyMap<string, { readonly count: number; readonly causalEventsProduced: number }> | Record<string, { readonly count: number; readonly causalEventsProduced: number }>;
  readonly latestSourceIdByKind: ReadonlyMap<string, string> | Record<string, string>;
  readonly latestReplayKeyByKind: ReadonlyMap<string, string> | Record<string, string>;
  readonly fromDay: number;
  readonly toDay: number;
};

interface ColdLedgerContext {
  readonly rangeLabel: string;
  readonly rivalCount: number;
  readonly customerCount: number;
  readonly ownerCount: number;
  readonly managerCount: number;
  readonly rivalRefs: readonly POVCausalRef[];
  readonly customerRefs: readonly POVCausalRef[];
  readonly ownerRefs: readonly POVCausalRef[];
  readonly recommendationRefs: readonly POVCausalRef[];
}

function readMapLikeValue<T>(input: ReadonlyMap<string, T> | Record<string, T> | undefined | null, key: string): T | undefined {
  if (!input) return undefined;
  if (input instanceof Map) {
    return input.get(key);
  }
  return Object.prototype.hasOwnProperty.call(input, key)
    ? (input as Record<string, T>)[key]
    : undefined;
}

function buildColdLedgerContext(state: GameState): ColdLedgerContext | null {
  const summaries = Array.isArray(state.bigWorldRuntime?.coldLedgerSummaries)
    ? (state.bigWorldRuntime?.coldLedgerSummaries as readonly ColdLedgerSummaryLike[])
    : [];
  if (summaries.length === 0) return null;

  const kindKeys = ['rival_action', 'customer_interaction', 'owner_life_event_signal', 'manager_message'] as const;
  const aggregates = new Map<string, {
    count: number;
    causalEventsProduced: number;
    latestSourceId?: string;
    latestReplayKey?: string;
  }>();

  let fromDay = Number.POSITIVE_INFINITY;
  let toDay = Number.NEGATIVE_INFINITY;

  for (const summary of summaries) {
    if (!summary) continue;
    fromDay = Math.min(fromDay, summary.fromDay);
    toDay = Math.max(toDay, summary.toDay);
    for (const kind of kindKeys) {
      const entry = readMapLikeValue(summary.bySourceKind, kind);
      if (entry && entry.count > 0) {
        const existing = aggregates.get(kind) ?? {
          count: 0,
          causalEventsProduced: 0,
        };
        existing.count += entry.count;
        existing.causalEventsProduced += entry.causalEventsProduced;
        const latestSourceId = readMapLikeValue(summary.latestSourceIdByKind, kind);
        if (latestSourceId && !existing.latestSourceId) {
          existing.latestSourceId = latestSourceId;
        }
        const latestReplayKey = readMapLikeValue(summary.latestReplayKeyByKind, kind);
        if (latestReplayKey && !existing.latestReplayKey) {
          existing.latestReplayKey = latestReplayKey;
        }
        aggregates.set(kind, existing);
      }
    }
  }

  if (!Number.isFinite(fromDay) || !Number.isFinite(toDay)) return null;

  const rangeLabel = fromDay === toDay ? `Day ${fromDay}` : `Day ${fromDay}-${toDay}`;
  const rival = aggregates.get('rival_action') ?? null;
  const customer = aggregates.get('customer_interaction') ?? null;
  const owner = aggregates.get('owner_life_event_signal') ?? null;
  const manager = aggregates.get('manager_message') ?? null;

  const buildRef = (
    kind: 'rival_action' | 'customer_interaction' | 'owner_life_event_signal' | 'manager_message',
    refType: POVCausalRef['refType'],
    label: string,
  ): POVCausalRef | null => {
    const aggregate = aggregates.get(kind);
    if (!aggregate?.latestSourceId || !aggregate.count) return null;
    return {
      refType,
      refId: aggregate.latestSourceId,
      refLabel: `${label} (${rangeLabel})`,
    };
  };

  const rivalRef = buildRef('rival_action', 'rival-listing', '竞品历史动作');
  const customerRef = buildRef('customer_interaction', 'market-signal', '客户历史需求变化');
  const ownerRef = buildRef('owner_life_event_signal', 'case', '业主历史压力感知');
  const managerRef = buildRef('manager_message', 'market-signal', '历史策略建议');

  return {
    rangeLabel,
    rivalCount: rival?.count ?? 0,
    customerCount: customer?.count ?? 0,
    ownerCount: owner?.count ?? 0,
    managerCount: manager?.count ?? 0,
    rivalRefs: rivalRef ? [rivalRef] : [],
    customerRefs: customerRef ? [customerRef] : [],
    ownerRefs: ownerRef ? [ownerRef] : [],
    recommendationRefs: managerRef ? [managerRef] : [],
  };
}

function buildFallbackLiveEventRefs(
  state: GameState,
  caseId: string,
  limit = 3,
): POVCausalRef[] {
  const caseItem = state.cases.find((c) => c.id === caseId);
  const cellId = caseItem?.marketCellId ?? '';
  const events = (Array.isArray(state.worldCausalEvents) ? state.worldCausalEvents : [])
    .filter((event) => eventMatchesCaseOrCell(event, caseId, cellId))
    .sort((left, right) => right.day - left.day)
    .slice(0, limit);
  return uniquePOVRefs(events.map(eventToPOVRef));
}

function buildTraceableSafeCausalRefs(
  state: GameState,
  caseId: string,
  refs: readonly POVCausalRef[],
  limit = 5,
): POVCausalRef[] {
  const liveEventIds = new Set((Array.isArray(state.worldCausalEvents) ? state.worldCausalEvents : []).map((event) => event.id));
  const uniqueRefs = uniquePOVRefs(refs);
  const liveRefs = uniqueRefs.filter((ref) => liveEventIds.has(ref.refId));
  const fallbackLiveRefs = buildFallbackLiveEventRefs(state, caseId, limit)
    .filter((ref) => !uniqueRefs.some((existing) => existing.refId === ref.refId));
  const entityRefs = uniqueRefs.filter((ref) => !liveEventIds.has(ref.refId));
  return uniquePOVRefs([
    ...liveRefs,
    ...fallbackLiveRefs,
    ...entityRefs,
  ]).slice(0, limit);
}

function deriveRuntimeReplayKey(
  state: GameState,
  refs: readonly POVCausalRef[],
): string | undefined {
  const events = Array.isArray(state.worldCausalEvents) ? state.worldCausalEvents : [];
  const refIds = new Set(refs.map((ref) => ref.refId));
  const sourceReplayKey = events.find((event) => refIds.has(event.id) && event.sourceReplayKey)?.sourceReplayKey;
  if (sourceReplayKey) return sourceReplayKey;
  const eventIds = refs.map((ref) => ref.refId).filter(Boolean).slice(0, 4).join('|');
  if (eventIds) return `runtime-ledger:${state.runContext.runSeed}:${state.day}:${eventIds}`;
  return undefined;
}

function deriveRuntimeSourceRecordIds(
  state: GameState,
  refs: readonly POVCausalRef[],
): readonly string[] {
  const events = Array.isArray(state.worldCausalEvents) ? state.worldCausalEvents : [];
  const refIds = new Set(refs.map((ref) => ref.refId));
  return events
    .filter((event) => refIds.has(event.id) && event.sourceRecordId)
    .map((event) => event.sourceRecordId as string)
    .slice(0, 5);
}

// ── 1. CaseWorldContextPOV ───────────────────────────────────
/** "这套房属于哪个 market cell?" */

export interface CaseWorldContextPOV {
  cellId: string;
  cellName: string;
  heat: number;
  heatBand: string;
  priceTrend: string;
  inventoryPressure: number;
  dealVelocity: number;
  supplyPressure: number;
  competitivePressure: number;
  summary: string;
  refs: POVCausalRef[];
}

// ── 2. ComparableSupplyPOV ───────────────────────────────────
/** "同 cell 有什么 comparable supply?" */

export interface ComparableSupplySignal {
  rank: number;
  headline: string;
  detail: string;
  source: POVSignalSource;
  refs: POVCausalRef[];
}

export interface ComparableSupplyPOV {
  totalActiveInCell: number;
  directlyCompetingCount: number;
  avgAskPriceInCell: number;
  priceRangeLabel: string;
  topSignals: ComparableSupplySignal[];
  noSupply: boolean;
  noSupplyReason?: string;
  refs: POVCausalRef[];
}

// ── 3. BrokerActionPressurePOV ───────────────────────────────
/** "哪个竞品/对手动作现在重要?" */

export interface BrokerActionSignal {
  rank: number;
  headline: string;
  detail: string;
  source: POVSignalSource;
  refs: POVCausalRef[];
}

export interface BrokerActionPressurePOV {
  topSignals: BrokerActionSignal[];
  activeRivalStoreCount: number;
  recentRepriceCount: number;
  /** Internal pressure from same-brand different-ACN stores (semi-competitive). 0-100. */
  internalPressure: number;
  refs: POVCausalRef[];
}

// ── 4. DemandMovementPOV ─────────────────────────────────────
/** "需求是在流入还是流出这个 segment?" */

export interface DemandMovementSignal {
  rank: number;
  headline: string;
  detail: string;
  source: POVSignalSource;
  refs: POVCausalRef[];
}

export interface DemandMovementPOV {
  demandMomentum: number;
  direction: 'inflow' | 'stagnant' | 'outflow';
  activeCustomerCount: number;
  comparingCustomerCount: number;
  topSignals: DemandMovementSignal[];
  noDemand: boolean;
  noDemandReason?: string;
  refs: POVCausalRef[];
}

// ── 5. OwnerExpectationSignalPOV ─────────────────────────────
/** "业主预期压力是什么?" + "是哪个延迟市场信号造成业主压力?" */

export interface OwnerExpectationSignal {
  rank: number;
  headline: string;
  detail: string;
  source: POVSignalSource;
  refs: POVCausalRef[];
}

export interface OwnerExpectationSignalPOV {
  priceGapPct: number;
  trustLevel: number;
  patienceLevel: number;
  urgencyLevel: number;
  pressureLabel: 'none' | 'low' | 'moderate' | 'high';
  delayedMarketSignal: string;
  topSignals: OwnerExpectationSignal[];
  refs: POVCausalRef[];
}

// ── 6. BecauseBigProof ───────────────────────────────────────
/** "哪些 causal refs 可以安全展示?" + proof of world movement */

export interface BecauseBigMovementEvidence {
  kind: string;
  headline: string;
  detail: string;
  refs: POVCausalRef[];
}

export interface BecauseBigProof {
  hasMarketMovement: boolean;
  hasDemandShift: boolean;
  hasRivalMovement: boolean;
  hasOwnerPressureDelta: boolean;
  movementEvidence: BecauseBigMovementEvidence[];
  safeCausalRefs: POVCausalRef[];
}

// ── 7. BigWorldPOVSummary (top-level) ────────────────────────

export interface BigWorldPOVSummary {
  caseId: string;
  caseTitle: string;
  day: number;
  marketCell: CaseWorldContextPOV;
  comparableSupply: ComparableSupplyPOV;
  demandMovement: DemandMovementPOV;
  ownerExpectation: OwnerExpectationSignalPOV;
  brokerActionPressure: BrokerActionPressurePOV;
  becauseBigProof: BecauseBigProof;
  recommendedActionReasons: Array<{
    rank: number;
    headline: string;
    detail: string;
    refs: POVCausalRef[];
    /** Evidence-backed: safeRefs for UI display. */
    safeRefs?: readonly { readonly refType: string; readonly refId: string; readonly refLabel: string }[];
    /** Evidence-backed: source record IDs backing this reason. */
    sourceRecordIds?: readonly string[];
    /** Evidence-backed: deterministic replay key. */
    replayKey?: string;
  }>;
  /** Shared causal refs across all product surfaces (injected from DecisionEvidenceEnvelope). */
  readonly sharedCausalRefs?: SharedCausalRefs;
}

// ══════════════════════════════════════════════════════════════
// buildLiveCausalContext
// ══════════════════════════════════════════════════════════════

/**
 * Select top causal events from the live worldCausalEvents ledger that are
 * relevant to this case / marketCell / customer / rival, and convert them
 * into bounded POVCausalRefs. The same refs are injected into multiple
 * sub-projections to prove unified world context (product-big).
 *
 * Bounded: max 2 events per category, max ~8 total refs.
 * No raw payload exposed — only {refType, refId, refLabel}.
 */
export function buildLiveCausalContext(
  state: GameState,
  caseId: string,
): LiveCausalContext {
  const caseItem = state.cases.find((c) => c.id === caseId);
  const cellId = caseItem?.marketCellId ?? '';
  const coldLedgerContext = buildColdLedgerContext(state);

  const causalEvents = Array.isArray(state.worldCausalEvents) ? state.worldCausalEvents : [];
  const recentWindow = state.day - 3;

  const allRelevantEvents = causalEvents
    .filter((e) => eventMatchesCaseOrCell(e, caseId, cellId))
    .sort((left, right) => right.day - left.day);
  // Active cases should privilege recent motion; terminal / inactive cases still need
  // an explanation trail from the last live events that actually moved that case.
  const recentRelevantEvents = allRelevantEvents.filter((e) => e.day >= recentWindow);
  const relevantEvents = recentRelevantEvents.length > 0 ? recentRelevantEvents : allRelevantEvents;

  // --- Rival actions ---
  const rivalEvents = relevantEvents
    .filter((e) => e.kind === 'RivalListingRepriced' || e.kind === 'RivalBrokerActionTaken')
    .slice(0, 2);
  const rivalRefs: POVCausalRef[] = rivalEvents.map((e) => {
    const payload = e.payload as Record<string, unknown>;
    const label = e.kind === 'RivalListingRepriced'
      ? `竞品调价 day ${e.day}`
      : `竞品动作 day ${e.day}`;
    return {
      refType: 'rival-listing' as const,
      refId: e.id,
      refLabel: label,
    };
  });

  // --- Customer behavior ---
  const customerEvents = relevantEvents
    .filter((e) => e.kind === 'CustomerComparedListings' || e.kind === 'CustomerAttentionShifted')
    .slice(0, 2);
  const customerRefs: POVCausalRef[] = customerEvents.map((e) => ({
    refType: 'market-signal' as const,
    refId: e.id,
    refLabel: `客户需求变化 day ${e.day}`,
  }));

  // --- Owner perception ---
  const ownerEvents = relevantEvents
    .filter((e) => e.kind === 'OwnerMarketPressurePerceived')
    .slice(0, 2);
  const ownerRefs: POVCausalRef[] = ownerEvents.map((e) => ({
    refType: 'case' as const,
    refId: e.id,
    refLabel: `业主压力感知 day ${e.day}`,
  }));

  // --- Broker recommendations ---
  const recEvents = relevantEvents
    .filter((e) => e.kind === 'BrokerRecommendationChanged')
    .slice(0, 2);
  const recommendationRefs: POVCausalRef[] = recEvents.map((e) => ({
    refType: 'market-signal' as const,
    refId: e.id,
    refLabel: `策略建议 day ${e.day}`,
  }));

  const coldRivalRefs = coldLedgerContext?.rivalRefs ?? [];
  const coldCustomerRefs = coldLedgerContext?.customerRefs ?? [];
  const coldOwnerRefs = coldLedgerContext?.ownerRefs ?? [];
  const coldRecommendationRefs = coldLedgerContext?.recommendationRefs ?? [];

  // --- Deduplicate all refs by refId ---
  const seen = new Set<string>();
  const allRefs: POVCausalRef[] = [];
  for (const ref of [
    ...(rivalRefs.length > 0 ? rivalRefs : coldRivalRefs),
    ...(customerRefs.length > 0 ? customerRefs : coldCustomerRefs),
    ...(ownerRefs.length > 0 ? ownerRefs : coldOwnerRefs),
    ...(recommendationRefs.length > 0 ? recommendationRefs : coldRecommendationRefs),
  ]) {
    if (!seen.has(ref.refId)) {
      seen.add(ref.refId);
      allRefs.push(ref);
    }
  }

  return {
    rivalRefs: rivalRefs.length > 0 ? rivalRefs : coldRivalRefs,
    customerRefs: customerRefs.length > 0 ? customerRefs : coldCustomerRefs,
    ownerRefs: ownerRefs.length > 0 ? ownerRefs : coldOwnerRefs,
    recommendationRefs: recommendationRefs.length > 0 ? recommendationRefs : coldRecommendationRefs,
    allRefs,
  };
}

// ══════════════════════════════════════════════════════════════
// buildCaseWorldContextPOV
// ══════════════════════════════════════════════════════════════

export function buildCaseWorldContextPOV(
  state: GameState,
  caseId: string,
  _actorId?: string,
): CaseWorldContextPOV | null {
  const caseItem = state.cases.find((c) => c.id === caseId);
  if (!caseItem) return null;

  const cell = state.markets.find((m) => m.id === caseItem.marketCellId);
  if (!cell) {
    return {
      cellId: caseItem.marketCellId,
      cellName: caseItem.marketCellId,
      heat: 0,
      heatBand: 'unknown',
      priceTrend: 'unknown',
      inventoryPressure: 0,
      dealVelocity: 0,
      supplyPressure: 0,
      competitivePressure: 0,
      summary: '该板块信息尚未加载。',
      refs: [],
    };
  }

  const heatBand = deriveHeatBandLabel(cell.demandHeat);
  const priceTrend = derivePriceTrendLabel(cell.supplyPressure, cell.competitivePressure);
  const summary = buildMarketCellSummary(cell, heatBand, priceTrend);

  return {
    cellId: cell.id,
    cellName: cell.name,
    heat: cell.demandHeat,
    heatBand,
    priceTrend,
    inventoryPressure: cell.supplyPressure,
    dealVelocity: cell.sentiment,
    supplyPressure: cell.supplyPressure,
    competitivePressure: cell.competitivePressure,
    summary,
    refs: [{
      refType: 'market-cell',
      refId: cell.id,
      refLabel: cell.name,
    }],
  };
}

// ══════════════════════════════════════════════════════════════
// buildComparableSupplyPOV
// ══════════════════════════════════════════════════════════════

export function buildComparableSupplyPOV(
  state: GameState,
  caseId: string,
  _actorId?: string,
): ComparableSupplyPOV {
  const caseItem = state.cases.find((c) => c.id === caseId);
  const cellId = caseItem?.marketCellId ?? '';

  const activeRivals = state.marketShadow.rivalListings.filter(
    (r) => r.status === 'active' && r.marketCellId === cellId,
  );

  const directCompeting = activeRivals.filter(
    (r) => r.segment === caseItem?.story || r.district === caseItem?.district,
  );

  const avgAskPrice = activeRivals.length > 0
    ? Math.round(activeRivals.reduce((s, r) => s + r.askPrice, 0) / activeRivals.length)
    : 0;

  const priceMin = activeRivals.length > 0 ? Math.min(...activeRivals.map((r) => r.askPrice)) : 0;
  const priceMax = activeRivals.length > 0 ? Math.max(...activeRivals.map((r) => r.askPrice)) : 0;

  const signals: ComparableSupplySignal[] = [];
  const refs: POVCausalRef[] = [];

  if (activeRivals.length === 0) {
    return {
      totalActiveInCell: 0,
      directlyCompetingCount: 0,
      avgAskPriceInCell: 0,
      priceRangeLabel: '无竞品',
      topSignals: [],
      noSupply: true,
      noSupplyReason: '同板块目前没有活跃竞品挂牌，市场供给偏紧。',
      refs: [],
    };
  }

  const samePriceRivals = activeRivals.filter(
    (r) => Math.abs(r.askPrice - (caseItem?.askPrice ?? 0)) / (caseItem?.askPrice ?? 1) < 0.15,
  );

  if (samePriceRivals.length > 0) {
    signals.push({
      rank: 1,
      headline: `同价位竞品 ${samePriceRivals.length} 套在抢客`,
      detail: `同板块 ${samePriceRivals.length} 套相近价位竞品正在分流客户注意力，平均挂牌 ${Math.round(samePriceRivals.reduce((s, r) => s + r.askPrice, 0) / samePriceRivals.length)} 万。`,
      source: 'observed',
      refs: samePriceRivals.slice(0, 2).map((r) => ({
        refType: 'rival-listing' as const,
        refId: r.id,
        refLabel: r.title,
      })),
    });
    refs.push(...signals[0].refs);
  }

  const hotRivals = activeRivals.filter((r) => r.heat > 60);
  if (hotRivals.length > 0) {
    signals.push({
      rank: signals.length + 1,
      headline: `${hotRivals.length} 套高热度竞品活跃`,
      detail: `这 ${hotRivals.length} 套竞品近期带看和比较频次较高，客户可能正在集中关注。`,
      source: 'inferred',
      refs: hotRivals.slice(0, 2).map((r) => ({
        refType: 'rival-listing' as const,
        refId: r.id,
        refLabel: r.title,
      })),
    });
    refs.push(...signals[signals.length - 1].refs);
  }

  if (directCompeting.length > 0 && directCompeting.length !== samePriceRivals.length) {
    signals.push({
      rank: signals.length + 1,
      headline: `${directCompeting.length} 套直接竞品户型重叠`,
      detail: `户型和面积高度重叠的竞品，客户最可能拿来对比。`,
      source: 'observed',
      refs: directCompeting.slice(0, 2).map((r) => ({
        refType: 'rival-listing' as const,
        refId: r.id,
        refLabel: r.title,
      })),
    });
    refs.push(...signals[signals.length - 1].refs);
  }

  return {
    totalActiveInCell: activeRivals.length,
    directlyCompetingCount: directCompeting.length,
    avgAskPriceInCell: avgAskPrice,
    priceRangeLabel: activeRivals.length > 0 ? `${priceMin}-${priceMax} 万` : '无竞品',
    topSignals: signals.slice(0, 3),
    noSupply: false,
    refs,
  };
}

// ══════════════════════════════════════════════════════════════
// buildDemandMovementPOV
// ══════════════════════════════════════════════════════════════

export function buildDemandMovementPOV(
  state: GameState,
  caseId: string,
  _actorId?: string,
  liveCtx?: LiveCausalContext,
  actorKnowledge?: import('./actorKnowledgeProjection.js').ActorKnowledgeSnapshot,
): DemandMovementPOV {
  const caseItem = state.cases.find((c) => c.id === caseId);
  if (!caseItem) {
    return {
      demandMomentum: 0,
      direction: 'outflow',
      activeCustomerCount: 0,
      comparingCustomerCount: 0,
      topSignals: [],
      noDemand: true,
      noDemandReason: '房源不存在，无法判断需求动向。',
      refs: [],
    };
  }

  const cellId = caseItem.marketCellId;

  // ── Derive demand from knowledge beliefs when available ──
  const knowledgeSummary = actorKnowledge?.beliefSummary ?? [];
  const customerSeriousness = knowledgeSummary.find((s) => s.domain === 'customer_seriousness');
  const dealCloseability = knowledgeSummary.find((s) => s.domain === 'deal_closeability');
  const knowledgeSources = actorKnowledge?.visibleSources ?? [];

  // Layer 1: customers with a direct active relationship to this case
  const directCustomers = state.customerStates.filter(
    (cs) => cs.activeCaseIds.includes(caseId),
  );

  // Layer 2: customers who have a revealed opportunity touching this case's market cell
  const cellOpportunities = state.opportunities.filter(
    (o) => o.status === 'active'
      && o.visibility === 'revealed'
      && o.caseId !== caseId
      && state.cases.find((c) => c.id === o.caseId)?.marketCellId === cellId,
  );
  const indirectCustomerIds = new Set(cellOpportunities.map((o) => o.customerId));
  const indirectCustomers = state.customerStates.filter(
    (cs) => indirectCustomerIds.has(cs.customerId) && !directCustomers.some((d) => d.customerId === cs.customerId),
  );

  // Merge: direct always included, indirect only if revealed
  const cellCustomers = [...directCustomers, ...indirectCustomers];

  const activeCustomers = cellCustomers.filter((cs) => cs.status !== 'lost' && cs.status !== 'converted');
  const comparingCustomers = cellCustomers.filter((cs) => cs.status === 'comparing');
  const atRiskCustomers = cellCustomers.filter((cs) => cs.churnRisk >= 60);

  const signals: DemandMovementSignal[] = [];
  const refs: POVCausalRef[] = [];

  const totalActive = activeCustomers.length;
  const totalComparing = comparingCustomers.length;

  if (totalActive === 0 && !customerSeriousness) {
    return {
      demandMomentum: 0,
      direction: 'outflow',
      activeCustomerCount: 0,
      comparingCustomerCount: 0,
      topSignals: [],
      noDemand: true,
      noDemandReason: '当前没有活跃客户需求与该板块匹配，需求尚未流入。',
      refs: [],
    };
  }

  // Knowledge-derived momentum when beliefs available
  let momentum = customerSeriousness
    ? Math.round(customerSeriousness.avgConfidence * 100)
    : 50;

  // Build opportunity refs from the case's direct opportunities
  const directOpps = state.opportunities.filter(
    (o) => o.caseId === caseId && o.status === 'active',
  );
  const oppRefs: POVCausalRef[] = directOpps.slice(0, 3).map((o) => ({
    refType: 'opportunity' as const,
    refId: o.id,
    refLabel: `${o.customerName} → ${caseItem.title}`,
  }));

  // Knowledge-derived refs
  const knowledgeRefs: POVCausalRef[] = knowledgeSources.slice(0, 3).map((s) => ({
    refType: 'market-signal' as const,
    refId: s.sourceId,
    refLabel: s.summary.slice(0, 40),
  }));

  // Merge live customer causal refs into signal refs
  const liveCustomerRefs = liveCtx?.customerRefs ?? [];

  if (totalComparing > totalActive * 0.5) {
    momentum = Math.max(momentum, 70);
    const signalRefs = knowledgeRefs.length > 0
      ? knowledgeRefs.slice(0, 2)
      : liveCustomerRefs.length > 0
        ? [...liveCustomerRefs.slice(0, 1), ...oppRefs.slice(0, 1)]
        : oppRefs.length > 0 ? oppRefs : [{ refType: 'market-cell' as const, refId: cellId, refLabel: cellId }];
    signals.push({
      rank: 1,
      headline: `${totalComparing} 位客户正在积极比较`,
      detail: `超过半数客户进入比较阶段，需求热度偏高。`,
      source: 'observed',
      refs: signalRefs,
    });
    refs.push(...signals[0].refs);
  } else if (totalComparing < totalActive * 0.2) {
    momentum = Math.min(momentum, 35);
    const signalRefs = knowledgeRefs.length > 0
      ? knowledgeRefs.slice(0, 2)
      : liveCustomerRefs.length > 0
        ? [...liveCustomerRefs.slice(0, 1), ...oppRefs.slice(0, 1)]
        : oppRefs.length > 0 ? oppRefs : [{ refType: 'market-cell' as const, refId: cellId, refLabel: cellId }];
    signals.push({
      rank: 1,
      headline: '多数客户尚未进入比较',
      detail: `只有 ${totalComparing} 位在比对，需求还在观望。`,
      source: 'observed',
      refs: signalRefs,
    });
    refs.push(...signals[0].refs);
  }

  if (atRiskCustomers.length > 0) {
    const riskOpps = directOpps.filter((o) => {
      const cs = state.customerStates.find((c) => c.customerId === o.customerId);
      return cs && cs.churnRisk >= 60;
    });
    signals.push({
      rank: signals.length + 1,
      headline: `${atRiskCustomers.length} 位客户流失风险升高`,
      detail: `这些客户近期活跃度下降，可能被竞品截流。`,
      source: 'inferred',
      refs: knowledgeRefs.length > 0
        ? knowledgeRefs.slice(0, 2)
        : riskOpps.length > 0
          ? riskOpps.slice(0, 2).map((o) => ({
            refType: 'opportunity' as const,
            refId: o.id,
            refLabel: `${o.customerName} → ${caseItem.title}`,
          }))
          : liveCustomerRefs.length > 0
            ? liveCustomerRefs.slice(0, 1)
            : [{ refType: 'market-cell' as const, refId: cellId, refLabel: cellId }],
    });
    refs.push(...signals[signals.length - 1].refs);
    momentum = Math.max(20, momentum - 10);
  }

  const direction = momentum >= 60 ? 'inflow' : momentum >= 40 ? 'stagnant' : 'outflow';

  return {
    demandMomentum: momentum,
    direction,
    activeCustomerCount: totalActive,
    comparingCustomerCount: totalComparing,
    topSignals: signals.slice(0, 3),
    noDemand: false,
    refs,
  };
}

// ══════════════════════════════════════════════════════════════
// buildOwnerExpectationSignalPOV
// ══════════════════════════════════════════════════════════════

export function buildOwnerExpectationSignalPOV(
  state: GameState,
  caseId: string,
  _actorId?: string,
  liveCtx?: LiveCausalContext,
  actorKnowledge?: import('./actorKnowledgeProjection.js').ActorKnowledgeSnapshot,
): OwnerExpectationSignalPOV {
  const caseItem = state.cases.find((c) => c.id === caseId);
  if (!caseItem) {
    return {
      priceGapPct: 0,
      trustLevel: 0,
      patienceLevel: 0,
      urgencyLevel: 0,
      pressureLabel: 'none',
      delayedMarketSignal: '暂无',
      topSignals: [],
      refs: [],
    };
  }

  // ── Derive owner expectation from ActorKnowledge beliefs when available ──
  // When actorKnowledge is provided, belief-derived values replace direct field reads.
  // This ensures the broker sees owner state through the belief/pressure pipeline,
  // not by peeking at hidden GlobalTruth fields.
  const knowledgeBeliefs = actorKnowledge?.beliefs ?? [];
  const knowledgeSummary = actorKnowledge?.beliefSummary ?? [];
  const knowledgeSources = actorKnowledge?.visibleSources ?? [];

  // Derive price_gap from price_anchor belief domain
  const priceBelief = knowledgeSummary.find((s) => s.domain === 'price_anchor');
  const knowledgePriceGap = priceBelief
    ? Math.round(priceBelief.avgConfidence * 20) // scale confidence to gap estimate
    : undefined;

  // Derive trust from broker_trust belief domain
  const trustBelief = knowledgeSummary.find((s) => s.domain === 'broker_trust');
  const knowledgeTrust = trustBelief
    ? Math.round(trustBelief.avgConfidence * 100)
    : undefined;

  // Derive urgency from owner_readiness belief domain
  const readinessBelief = knowledgeSummary.find((s) => s.domain === 'owner_readiness');
  const knowledgeUrgency = readinessBelief
    ? Math.round(readinessBelief.avgConfidence * 100)
    : undefined;

  // Use knowledge-derived values when available, fall back to legacy
  const priceGapPct = knowledgePriceGap ?? caseItem.priceGapPct;
  const trust = knowledgeTrust ?? caseItem.trust;
  const patience = knowledgeUrgency !== undefined
    ? Math.max(0, 100 - knowledgeUrgency)
    : caseItem.patience;
  const urgency = knowledgeUrgency ?? caseItem.urgency;

  const signals: OwnerExpectationSignal[] = [];
  const refs: POVCausalRef[] = [];
  let delayedSignal = '暂无延迟信号';

  // Live owner perception refs from causal ledger
  const liveOwnerRefs = liveCtx?.ownerRefs ?? [];
  // Include ALL live causal refs for cross-surface sharing
  const liveAllRefs = liveCtx?.allRefs ?? [];

  // Use knowledge sources as ref backing when available
  const knowledgeRefs: POVCausalRef[] = knowledgeSources.slice(0, 3).map((s) => ({
    refType: 'market-signal' as const,
    refId: s.sourceId,
    refLabel: s.summary.slice(0, 40),
  }));

  // Collect all available refs for cross-surface sharing:
  // live causal refs (event IDs) first, then knowledge refs (source record IDs)
  const allAvailableRefs: POVCausalRef[] = [
    ...liveAllRefs,
    ...knowledgeRefs,
  ];

  if (priceGapPct > 10) {
    const signalRefs: POVCausalRef[] = allAvailableRefs.length >= 2
      ? allAvailableRefs.slice(0, 2)
      : allAvailableRefs.length > 0
        ? [...allAvailableRefs, { refType: 'case' as const, refId: caseItem.id, refLabel: caseItem.title }]
        : [{ refType: 'case' as const, refId: caseItem.id, refLabel: caseItem.title }];
    signals.push({
      rank: 1,
      headline: `挂牌价高于市场价 ${Math.round(priceGapPct)}%`,
      detail: `业主预期与市场合理价有明显差距，需要通过面访或证据逐步引导。`,
      source: 'inferred',
      refs: signalRefs,
    });
    refs.push(...signals[0].refs);
    delayedSignal = '市场成交数据和竞品调价信号滞后传导';
  }

  if (patience < 40) {
    signals.push({
      rank: signals.length + 1,
      headline: '业主耐心持续消耗',
      detail: `耐心值 ${Math.round(patience)}，低于 40 表示业主开始焦虑，需要正向反馈。`,
      source: 'inferred',
      refs: allAvailableRefs.length > 0
        ? allAvailableRefs.slice(0, 1)
        : [{ refType: 'case' as const, refId: caseItem.id, refLabel: caseItem.title }],
    });
    refs.push(signals[signals.length - 1].refs[0]);
  }

  if (trust < 50) {
    signals.push({
      rank: signals.length + 1,
      headline: '业主信任度偏低',
      detail: `信任度 ${Math.round(trust)}，业主可能对经纪人建议持保留态度。`,
      source: 'inferred',
      refs: knowledgeRefs.length > 0
        ? knowledgeRefs.slice(0, 1)
        : liveOwnerRefs.length > 0
          ? liveOwnerRefs.slice(0, 1)
          : [{ refType: 'case' as const, refId: caseItem.id, refLabel: caseItem.title }],
    });
    refs.push(signals[signals.length - 1].refs[0]);
  }

  if (urgency > 70 && patience < 50) {
    signals.push({
      rank: signals.length + 1,
      headline: '业主急售但耐心不足',
      detail: `紧迫度 ${Math.round(urgency)} 但耐心仅 ${Math.round(patience)}，面访时优先给确定性信息。`,
      source: 'inferred',
      refs: knowledgeRefs.length > 0
        ? knowledgeRefs.slice(0, 1)
        : liveOwnerRefs.length > 0
          ? liveOwnerRefs.slice(0, 1)
          : [{ refType: 'case' as const, refId: caseItem.id, refLabel: caseItem.title }],
    });
    refs.push(signals[signals.length - 1].refs[0]);
  }

  const gapScore = Math.min(100, priceGapPct * 3);
  const patienceScore = Math.max(0, 100 - patience);
  const compositePressure = (gapScore * 0.5 + patienceScore * 0.3 + (100 - trust) * 0.2);
  const pressureLabel: OwnerExpectationSignalPOV['pressureLabel'] =
    compositePressure > 70 ? 'high' :
    compositePressure > 45 ? 'moderate' :
    compositePressure > 20 ? 'low' : 'none';

  // Ensure refs always include at least one live causal ref for cross-surface sharing.
  // Even when signal branches fire with knowledge refs, we must also reference
  // live world state so that other surfaces (e.g. becauseBigProof) can share refs.
  if (refs.length > 0 && liveAllRefs.length > 0) {
    // Add a live causal ref that becauseBigProof might also reference
    const liveRef = liveAllRefs[0];
    if (!refs.some((r) => r.refId === liveRef.refId)) {
      refs.push(liveRef);
    }
  } else if (refs.length === 0 && allAvailableRefs.length > 0) {
    refs.push(allAvailableRefs[0]);
  }

  return {
    priceGapPct,
    trustLevel: trust,
    patienceLevel: patience,
    urgencyLevel: urgency,
    pressureLabel,
    delayedMarketSignal: delayedSignal,
    topSignals: signals.slice(0, 2),
    refs,
  };
}

// ══════════════════════════════════════════════════════════════
// buildBrokerActionPressurePOV
// ══════════════════════════════════════════════════════════════

export function buildBrokerActionPressurePOV(
  state: GameState,
  caseId: string,
  _actorId?: string,
  liveCtx?: LiveCausalContext,
  actorKnowledge?: import('./actorKnowledgeProjection.js').ActorKnowledgeSnapshot,
): BrokerActionPressurePOV {
  const caseItem = state.cases.find((c) => c.id === caseId);
  const cellId = caseItem?.marketCellId ?? '';
  const caseDistrict = caseItem?.district ?? '';

  // Only rival listings in the same market cell (visible to actor)
  const activeRivals = state.marketShadow.rivalListings.filter(
    (r) => r.status === 'active' && r.marketCellId === cellId,
  );

  // Only rival stores that a broker could observe: same district focus
  // A broker can see stores that operate in their district, not all stores globally
  const visibleRivalStores = state.marketShadow.rivalStores.filter(
    (s) => s.districtFocus.some((d) => d === caseDistrict),
  );

  // ── Attribute pressure into three channels via acnAttribution ──
  // Derive player's ACN from the player broker in bootstrap or from state
  const playerAcnId = state.bigWorldRuntime?.playerBrokerAcnId ?? undefined;
  const playerBrandId = deriveBrandId(playerAcnId);
  const pressureAttribution = attributePressure(
    visibleRivalStores,
    state.marketShadow.rivalListings,
    cellId,
    playerAcnId,
    playerBrandId,
  );

  const signals: BrokerActionSignal[] = [];
  const refs: POVCausalRef[] = [];

  // Live rival causal refs from runtime ledger
  const liveRivalRefs = liveCtx?.rivalRefs ?? [];

  // Knowledge-derived refs when actorKnowledge is available
  const knowledgeSources = actorKnowledge?.visibleSources ?? [];
  const knowledgeRefs: POVCausalRef[] = knowledgeSources.slice(0, 3).map((s) => ({
    refType: 'market-signal' as const,
    refId: s.sourceId,
    refLabel: s.summary.slice(0, 40),
  }));

  const recentReprices = activeRivals.filter((r) => r.freshness > 60);
  if (recentReprices.length > 0) {
    // Merge knowledge refs, live rival refs, and entity refs
    const signalRefs: POVCausalRef[] = knowledgeRefs.length > 0
      ? [...knowledgeRefs.slice(0, 1), ...recentReprices.slice(0, 1).map((r) => ({
        refType: 'rival-listing' as const,
        refId: r.id,
        refLabel: r.title,
      }))]
      : liveRivalRefs.length > 0
        ? [...liveRivalRefs.slice(0, 1), ...recentReprices.slice(0, 1).map((r) => ({
          refType: 'rival-listing' as const,
          refId: r.id,
          refLabel: r.title,
        }))]
        : recentReprices.slice(0, 2).map((r) => ({
          refType: 'rival-listing' as const,
          refId: r.id,
          refLabel: r.title,
        }));
    signals.push({
      rank: 1,
      headline: `同区竞品刚调价，${recentReprices.length} 套`,
      detail: `同板块 ${recentReprices.length} 套竞品近期有调价动作，今天先准备价格证据。`,
      source: 'observed',
      refs: signalRefs,
    });
    refs.push(...signals[0].refs);
  }

  const hotStoreRivals = visibleRivalStores.filter((s) => s.activityHeat > 60);
  if (hotStoreRivals.length > 0) {
    signals.push({
      rank: signals.length + 1,
      headline: `${hotStoreRivals.length} 家竞对门店近期活跃`,
      detail: `周边竞对门店带看量上升，客户可能被分流。`,
      source: 'inferred',
      refs: hotStoreRivals.slice(0, 1).map((s) => ({
        refType: 'rival-store' as const,
        refId: s.id,
        refLabel: s.name,
      })),
    });
    refs.push(...signals[signals.length - 1].refs);
  }

  // Add internal pressure signal when same-brand different-ACN stores are active
  if (pressureAttribution.internalPressure > 15) {
    signals.push({
      rank: signals.length + 1,
      headline: `同品牌不同ACN门店分流客户`,
      detail: `内部竞争压力 ${pressureAttribution.internalPressure}，同品牌其他ACN门店也在抢客。`,
      source: 'inferred',
      refs: visibleRivalStores
        .filter((s) => s.type === 'same_company' && s.acnId && s.acnId !== playerAcnId)
        .slice(0, 1)
        .map((s) => ({
          refType: 'rival-store' as const,
          refId: s.id,
          refLabel: s.name,
        })),
    });
    refs.push(...signals[signals.length - 1].refs);
  }

  if (caseItem && caseItem.lastRivalThreatDay && state.day - caseItem.lastRivalThreatDay <= 3) {
    signals.push({
      rank: signals.length + 1,
      headline: '近期有竞品抢客记录',
      detail: `${state.day - caseItem.lastRivalThreatDay} 天前有竞品对同客户报价或带看。`,
      source: 'observed',
      refs: liveRivalRefs.length > 0
        ? liveRivalRefs.slice(0, 1)
        : [{ refType: 'case' as const, refId: caseItem.id, refLabel: caseItem.title }],
    });
    refs.push(signals[signals.length - 1].refs[0]);
  }

  return {
    topSignals: signals.slice(0, 3),
    activeRivalStoreCount: visibleRivalStores.filter((s) => s.activityHeat > 30).length,
    recentRepriceCount: recentReprices.length,
    internalPressure: pressureAttribution.internalPressure,
    refs,
  };
}

// ══════════════════════════════════════════════════════════════
// buildBecauseBigProof
// ══════════════════════════════════════════════════════════════

export function buildBecauseBigProof(
  state: GameState,
  caseId: string,
  _actorId?: string,
  liveCtx?: LiveCausalContext,
): BecauseBigProof {
  const caseItem = state.cases.find((c) => c.id === caseId);
  const cellId = caseItem?.marketCellId ?? '';
  const coldLedgerContext = buildColdLedgerContext(state);
  const resolvedLiveCtx = liveCtx ?? buildLiveCausalContext(state, caseId);

  // --- Consume real causal data from bigWorldRuntime when available ---
  const runtimeSummaries = state.bigWorldRuntime?.dailySummaries ?? [];
  const causalEvents = Array.isArray(state.worldCausalEvents) ? state.worldCausalEvents : [];

  // Find recent causal events affecting this case's market cell or case directly
  const cellCausalEvents = causalEvents.filter((e) =>
    e.affectedIds.includes(cellId) || (caseId && e.affectedIds.includes(caseId)),
  );
  const recentSummaries = runtimeSummaries.filter((s) => s.day >= state.day - 3);

  // --- Market movement: prefer real runtime data ---
  const cell = state.markets.find((m) => m.id === cellId);
  const runtimeMarketMoved = recentSummaries.some((s) =>
    s.market.heatDelta !== 0 || s.market.risingCellCount > 0 || s.market.decliningCellCount > 0,
  );
  const hasMarketMovement = runtimeMarketMoved || (cell
    ? cell.demandHeat !== 50 || cell.supplyPressure !== 50 || cell.competitivePressure !== 50
    : false);

  // --- Rival movement: prefer causal events ---
  const rivalRepriceEvents = cellCausalEvents.filter((e) => e.kind === 'RivalListingRepriced');
  const rivalActionEvents = cellCausalEvents.filter((e) => e.kind === 'RivalBrokerActionTaken');
  const activeRivals = state.marketShadow.rivalListings.filter(
    (r) => r.status === 'active' && r.marketCellId === cellId,
  );
  const hasRivalMovement = rivalRepriceEvents.length > 0
    || rivalActionEvents.length > 0
    || activeRivals.some((r) => r.freshness > 50 || r.heat > 60)
    || (coldLedgerContext?.rivalCount ?? 0) > 0;

  // --- Demand shift: prefer causal events ---
  const demandShiftEvents = causalEvents.filter((e) =>
    (e.kind === 'CustomerComparedListings' || e.kind === 'CustomerAttentionShifted')
    && e.affectedIds.some((id) => id === cellId || id === caseId),
  );
  const activeCustomers = state.customerStates.filter(
    (cs) => cs.activeCaseIds.includes(caseId),
  );
  const comparingCount = activeCustomers.filter((cs) => cs.status === 'comparing').length;
  const hasDemandShift = demandShiftEvents.length > 0
    || comparingCount > 0
    || activeCustomers.some((cs) => cs.churnRisk > 40)
    || (coldLedgerContext?.customerCount ?? 0) > 0;

  // --- Owner pressure: prefer causal events ---
  const ownerPressureEvents = cellCausalEvents.filter((e) => e.kind === 'OwnerMarketPressurePerceived');
  const hasOwnerPressureDelta = ownerPressureEvents.length > 0
    || (caseItem ? caseItem.priceGapPct > 8 || caseItem.patience < 45 || caseItem.trust < 45 : false)
    || (coldLedgerContext?.ownerCount ?? 0) > 0;

  // --- Detect cross-domain live causal events ---
  // A cross-domain event is one whose refId appears in liveCtx.allRefs AND
  // is referenced by 2+ different sub-projection domains.
  const liveRivalIds = new Set((resolvedLiveCtx?.rivalRefs ?? []).map((r) => r.refId));
  const liveCustomerIds = new Set((resolvedLiveCtx?.customerRefs ?? []).map((r) => r.refId));
  const liveOwnerIds = new Set((resolvedLiveCtx?.ownerRefs ?? []).map((r) => r.refId));
  const liveRecIds = new Set((resolvedLiveCtx?.recommendationRefs ?? []).map((r) => r.refId));

  // Find event IDs that appear in 2+ domain sets (cross-domain proof)
  const crossDomainEventIds: string[] = [];
  const allLiveIds = new Set<string>([
    ...liveRivalIds, ...liveCustomerIds, ...liveOwnerIds, ...liveRecIds,
  ]);
  for (const id of allLiveIds) {
    const domainCount = [liveRivalIds, liveCustomerIds, liveOwnerIds, liveRecIds]
      .filter((s) => s.has(id)).length;
    if (domainCount >= 2) {
      crossDomainEventIds.push(id);
    }
  }

  // --- Build evidence with guaranteed refs ---
  const evidence: BecauseBigMovementEvidence[] = [];
  const safeRefs: POVCausalRef[] = [];

  if (hasMarketMovement && cell) {
    const marketEventRefs: POVCausalRef[] = [];
    const heatShiftEvents = cellCausalEvents.filter((e) => e.kind === 'MarketHeatShifted');
    if (heatShiftEvents.length > 0) {
      marketEventRefs.push({
        refType: 'market-signal' as const,
        refId: heatShiftEvents[0].id,
        refLabel: `板块热度变化 day ${heatShiftEvents[0].day}`,
      });
    } else {
      marketEventRefs.push({ refType: 'market-cell' as const, refId: cell.id, refLabel: cell.name });
    }
    evidence.push({
      kind: 'market-cell-movement',
      headline: `${cell.name} 板块热度 ${cell.demandHeat}，供给压力 ${cell.supplyPressure}`,
      detail: recentSummaries.length > 0
        ? `近 3 天有 ${recentSummaries.reduce((s, r) => s + r.market.heatDelta, 0).toFixed(1)} 热度变化。`
        : `板块供需状态偏离平衡点，影响客户和业主决策节奏。`,
      refs: marketEventRefs,
    });
    safeRefs.push(...evidence[0].refs);
  }

  if (hasRivalMovement) {
    const rivalEventRefs: POVCausalRef[] = [];
    // Prefer live causal refs from runtime ledger
    if (resolvedLiveCtx && resolvedLiveCtx.rivalRefs.length > 0) {
      rivalEventRefs.push(...resolvedLiveCtx.rivalRefs.slice(0, 2));
    } else if (coldLedgerContext?.rivalRefs.length) {
      rivalEventRefs.push(...coldLedgerContext.rivalRefs.slice(0, 2));
    } else {
      for (const evt of rivalRepriceEvents.slice(0, 2)) {
        const listingId = (evt.payload as Record<string, unknown>).listingId;
        if (typeof listingId === 'string') {
          const listing = activeRivals.find((r) => r.id === listingId);
          rivalEventRefs.push({
            refType: 'rival-listing' as const,
            refId: evt.id,
            refLabel: listing?.title ?? listingId,
          });
        }
      }
      if (rivalEventRefs.length === 0) {
        for (const r of activeRivals.filter((r) => r.heat > 60).slice(0, 2)) {
          rivalEventRefs.push({ refType: 'rival-listing' as const, refId: r.id, refLabel: r.title });
        }
      }
    }
    const rivalArchiveCount = coldLedgerContext?.rivalCount ?? 0;
    const rivalCount = rivalRepriceEvents.length + rivalActionEvents.length;
    evidence.push({
      kind: 'rival-movement',
      headline: rivalCount > 0
        ? `${rivalCount} 条竞品动作因果记录`
        : `历史记录 ${rivalArchiveCount} 次竞品动作`,
      detail: rivalRepriceEvents.length > 0
        ? `竞品调价因果事件，分流潜在客户注意力。`
        : rivalCount > 0
          ? `竞品近期有活跃变动，分流潜在客户注意力。`
          : '历史归档的竞品动作记录，持续分流潜在客户注意力。',
      refs: rivalEventRefs.length > 0 ? rivalEventRefs : [{
        refType: 'market-cell' as const,
        refId: cellId,
        refLabel: cellId,
      }],
    });
    safeRefs.push(...evidence[evidence.length - 1].refs);
  }

  if (hasDemandShift) {
    const demandEventRefs: POVCausalRef[] = [];
    // Prefer live causal refs
    if (resolvedLiveCtx && resolvedLiveCtx.customerRefs.length > 0) {
      demandEventRefs.push(...resolvedLiveCtx.customerRefs.slice(0, 2));
    } else if (coldLedgerContext?.customerRefs.length) {
      demandEventRefs.push(...coldLedgerContext.customerRefs.slice(0, 2));
    } else {
      for (const evt of demandShiftEvents.slice(0, 2)) {
        demandEventRefs.push({
          refType: 'market-signal' as const,
          refId: evt.id,
          refLabel: `客户需求变化 day ${evt.day}`,
        });
      }
      if (demandEventRefs.length === 0) {
        const opps = state.opportunities.filter(
          (o) => o.caseId === caseId && o.status === 'active',
        );
        for (const o of opps.slice(0, 2)) {
          demandEventRefs.push({
            refType: 'opportunity' as const,
            refId: o.id,
            refLabel: `${o.customerName} → ${caseItem?.title ?? caseId}`,
          });
        }
      }
    }
    const demandArchiveCount = coldLedgerContext?.customerCount ?? 0;
    const demandCount = demandShiftEvents.length;
    evidence.push({
      kind: 'demand-shift',
      headline: demandCount > 0
        ? `${comparingCount} 位客户处于比较阶段`
        : `历史记录 ${demandArchiveCount} 次客户需求变动`,
      detail: demandShiftEvents.length > 0
        ? `检测到 ${demandShiftEvents.length} 条客户需求比较/注意力转移因果事件。`
        : demandCount > 0
          ? `客户需求正在流动，比较阶段的客户最容易被竞品吸引。`
          : '历史归档的客户比对及注意力事件，表明需求正在流动。',
      refs: demandEventRefs.length > 0 ? demandEventRefs : [{
        refType: 'market-cell' as const,
        refId: cellId,
        refLabel: cellId,
      }],
    });
    safeRefs.push(...evidence[evidence.length - 1].refs);
  }

  if (hasOwnerPressureDelta && caseItem) {
    const ownerEventRefs: POVCausalRef[] = [];
    // Prefer live causal refs
    if (resolvedLiveCtx && resolvedLiveCtx.ownerRefs.length > 0) {
      ownerEventRefs.push(...resolvedLiveCtx.ownerRefs.slice(0, 2));
    } else if (coldLedgerContext?.ownerRefs.length) {
      ownerEventRefs.push(...coldLedgerContext.ownerRefs.slice(0, 2));
    } else {
      for (const evt of ownerPressureEvents.slice(0, 2)) {
        ownerEventRefs.push({
          refType: 'case' as const,
          refId: evt.id,
          refLabel: `业主压力感知 day ${evt.day}`,
        });
      }
      if (ownerEventRefs.length === 0) {
        ownerEventRefs.push({ refType: 'case' as const, refId: caseItem.id, refLabel: caseItem.title });
      }
    }
    const ownerArchiveCount = coldLedgerContext?.ownerCount ?? 0;
    const ownerCount = ownerPressureEvents.length;
    evidence.push({
      kind: 'owner-pressure',
      headline: ownerCount > 0
        ? '业主预期压力偏高'
        : `历史归档 ${ownerArchiveCount} 次业主压力波动`,
      detail: ownerCount > 0
        ? `挂牌价高于市场价 ${Math.round(caseItem.priceGapPct)}%，业主需要市场证据辅助判断。`
        : '历史压力记录表明业主对价格偏差持续敏感，建议适时面访。',
      refs: ownerEventRefs,
    });
    safeRefs.push(...evidence[evidence.length - 1].refs);
  }

  // --- Cross-domain proof: add evidence when same live event spans multiple surfaces ---
  if (crossDomainEventIds.length > 0) {
    const crossRefs: POVCausalRef[] = [];
    for (const id of crossDomainEventIds) {
      const allLive = resolvedLiveCtx?.allRefs ?? [];
      const found = allLive.find((r) => r.refId === id);
      if (found) crossRefs.push(found);
    }
    if (crossRefs.length > 0) {
      evidence.push({
        kind: 'cross-domain-causal',
        headline: `${crossDomainEventIds.length} 条因果事件跨领域影响`,
        detail: `同一事件同时驱动竞品动态、客户需求和业主感知，世界在联动。`,
        refs: crossRefs,
      });
      safeRefs.push(...crossRefs);
    }
  }

  return {
    hasMarketMovement,
    hasDemandShift,
    hasRivalMovement,
    hasOwnerPressureDelta,
    movementEvidence: evidence,
    safeCausalRefs: buildTraceableSafeCausalRefs(state, caseId, safeRefs),
  };
}

// ══════════════════════════════════════════════════════════════
// buildWorkspaceBigWorldModule — top-level orchestrator
// ══════════════════════════════════════════════════════════════

export function buildWorkspaceBigWorldModule(
  state: GameState,
  caseId: string,
  actorId?: string,
  actorKnowledge?: import('./actorKnowledgeProjection.js').ActorKnowledgeSnapshot,
  registry?: InformationSourceRegistry,
): BigWorldPOVSummary | null {
  const caseItem = state.cases.find((c) => c.id === caseId);
  if (!caseItem) return null;

  // Build shared live causal context from worldCausalEvents
  const liveCtx = buildLiveCausalContext(state, caseId);

  const marketCell = buildCaseWorldContextPOV(state, caseId, actorId);
  if (!marketCell) return null;

  const comparableSupply = buildComparableSupplyPOV(state, caseId, actorId);
  const demandMovement = buildDemandMovementPOV(state, caseId, actorId, liveCtx, actorKnowledge);
  const ownerExpectation = buildOwnerExpectationSignalPOV(state, caseId, actorId, liveCtx, actorKnowledge);
  const brokerActionPressure = buildBrokerActionPressurePOV(state, caseId, actorId, liveCtx, actorKnowledge);
  const becauseBigProof = buildBecauseBigProof(state, caseId, actorId, liveCtx);

  // Decision-big: use actorKnowledge pipeline when available
  let recommendedActionReasons: BigWorldPOVSummary['recommendedActionReasons'];
  let sharedCausalRefs: SharedCausalRefs | undefined;

  if (actorKnowledge) {
    // Build DecisionEvidenceEnvelope for the evidence chain
    const envelope = buildDecisionEvidenceEnvelope(actorKnowledge);
    sharedCausalRefs = buildSharedCausalRefs(envelope);

    // Decision pipeline: belief → pressure → command → explanation
    recommendedActionReasons = buildDecisionBigRecommendations(
      actorKnowledge,
      marketCell,
      comparableSupply,
      demandMovement,
      ownerExpectation,
      brokerActionPressure,
      sharedCausalRefs,
    );
  } else {
    // Fallback: legacy derivation from sub-projections
    const fallbackReasons = deriveRecommendedActionReasons(
      marketCell, comparableSupply, demandMovement, ownerExpectation, brokerActionPressure, liveCtx,
    );
    const runtimeRefs = uniquePOVRefs([
      ...becauseBigProof.safeCausalRefs,
      ...buildFallbackLiveEventRefs(state, caseId, 3),
    ]).slice(0, 3);
    const replayKey = deriveRuntimeReplayKey(state, runtimeRefs);
    const sourceRecordIds = deriveRuntimeSourceRecordIds(state, runtimeRefs);
    recommendedActionReasons = fallbackReasons.map((reason) => {
      const safeRefs = uniquePOVRefs([...reason.refs, ...runtimeRefs]).slice(0, 3);
      return {
        ...reason,
        refs: safeRefs,
        safeRefs,
        sourceRecordIds,
        replayKey,
      };
    });
  }

  let result: BigWorldPOVSummary = {
    caseId: caseItem.id,
    caseTitle: caseItem.title,
    day: state.day,
    marketCell,
    comparableSupply,
    demandMovement,
    ownerExpectation,
    brokerActionPressure,
    becauseBigProof: sharedCausalRefs
      ? {
        ...becauseBigProof,
        safeCausalRefs: uniquePOVRefs([
          ...becauseBigProof.safeCausalRefs,
          ...sharedCausalRefs.allRefs.slice(0, 3).map((r) => ({
            refType: r.refType as POVCausalRef['refType'],
            refId: r.refId,
            refLabel: r.refLabel,
          })),
        ]).slice(0, 8),
      }
      : becauseBigProof,
    recommendedActionReasons,
    sharedCausalRefs,
  };

  // If actor knowledge is provided, filter all refs through visibility rules
  if (actorKnowledge && registry) {
    result = applyKnowledgeFilterToPOV(result, actorKnowledge, registry);
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// buildDecisionBigRecommendations — decision pipeline → product surface
// ══════════════════════════════════════════════════════════════

/**
 * Convert DecisionEvidenceEnvelope's recommendation into the product surface format.
 *
 * This bridges the decision pipeline output to BigWorldPOVSummary's recommendedActionReasons.
 * The key difference from legacy: each reason traces to real source/belief/pressure evidence.
 */
function buildDecisionBigRecommendations(
  knowledge: import('./actorKnowledgeProjection.js').ActorKnowledgeSnapshot,
  marketCell: CaseWorldContextPOV,
  comparableSupply: ComparableSupplyPOV,
  demandMovement: DemandMovementPOV,
  ownerExpectation: OwnerExpectationSignalPOV,
  brokerActionPressure: BrokerActionPressurePOV,
  sharedCausalRefs: SharedCausalRefs,
): Array<{ rank: number; headline: string; detail: string; refs: POVCausalRef[]; safeRefs?: readonly { readonly refType: string; readonly refId: string; readonly refLabel: string }[]; sourceRecordIds?: readonly string[]; replayKey?: string }> {
  const envelope = buildDecisionEvidenceEnvelope(knowledge);
  const reasons: Array<{ rank: number; headline: string; detail: string; refs: POVCausalRef[]; safeRefs?: readonly { readonly refType: string; readonly refId: string; readonly refLabel: string }[]; sourceRecordIds?: readonly string[]; replayKey?: string }> = [];

  // If there's a recommended command from the decision pipeline
  if (envelope.recommendedCommand) {
    const cmd = envelope.recommendedCommand;

    // Map command back to POVCausalRef format for the product surface
    const evidenceRefs: POVCausalRef[] = cmd.sourceRecordIds.slice(0, 3).map((id) => ({
      refType: 'market-signal' as const,
      refId: id,
      refLabel: cmd.command.name,
    }));

    // Also include refs from the explanation chain
    for (const link of envelope.explanation.chain) {
      for (const refId of link.referencedIds.slice(0, 1)) {
        if (!evidenceRefs.some((r) => r.refId === refId)) {
          evidenceRefs.push({
            refType: 'market-signal' as const,
            refId,
            refLabel: link.description.slice(0, 40),
          });
        }
      }
    }

    // Bound to 3 refs
    const boundedRefs = evidenceRefs.slice(0, 3);

    reasons.push({
      rank: 1,
      headline: cmd.command.name,
      detail: envelope.explanation.summary,
      refs: boundedRefs,
      safeRefs: envelope.explanation.safeRefs.length > 0 ? envelope.explanation.safeRefs : sharedCausalRefs.allRefs.slice(0, 3),
      sourceRecordIds: cmd.sourceRecordIds.slice(0, 5),
      replayKey: sharedCausalRefs.replayKey,
    });
  }

  // Add up to 2 more reasons from the sub-projection signals, backed by shared refs
  if (ownerExpectation.pressureLabel === 'high' || ownerExpectation.pressureLabel === 'moderate') {
    reasons.push({
      rank: reasons.length + 1,
      headline: '业主预期压力需关注',
      detail: `业主预期压力${ownerExpectation.pressureLabel === 'high' ? '偏高' : '中等'}，${ownerExpectation.delayedMarketSignal}。`,
      refs: ownerExpectation.refs.slice(0, 2),
      safeRefs: sharedCausalRefs.allRefs.slice(0, 2),
      sourceRecordIds: sharedCausalRefs.sourceRecordIds.slice(0, 3),
      replayKey: sharedCausalRefs.replayKey,
    });
  }

  if (brokerActionPressure.topSignals.length > 0) {
    reasons.push({
      rank: reasons.length + 1,
      headline: brokerActionPressure.topSignals[0].headline,
      detail: brokerActionPressure.topSignals[0].detail,
      refs: brokerActionPressure.topSignals[0].refs.slice(0, 2),
      safeRefs: sharedCausalRefs.allRefs.slice(0, 2),
      sourceRecordIds: sharedCausalRefs.sourceRecordIds.slice(0, 3),
      replayKey: sharedCausalRefs.replayKey,
    });
  }

  // Bound to 3 total reasons
  return reasons.slice(0, 3);
}

// ══════════════════════════════════════════════════════════════
// Private helpers
// ══════════════════════════════════════════════════════════════

function deriveHeatBandLabel(heat: number): string {
  if (heat >= 75) return '火热';
  if (heat >= 55) return '偏热';
  if (heat >= 35) return '平稳';
  if (heat >= 15) return '偏冷';
  return '冰冷';
}

function derivePriceTrendLabel(supplyPressure: number, competitivePressure: number): string {
  const net = 50 - supplyPressure * 0.4 - competitivePressure * 0.3;
  if (net > 20) return '上行';
  if (net > 5) return '企稳';
  if (net > -10) return '横盘';
  return '承压';
}

function buildMarketCellSummary(
  cell: MarketCell,
  heatBand: string,
  priceTrend: string,
): string {
  const parts: string[] = [];
  parts.push(`${cell.name}当前${heatBand}`);
  if (cell.demandHeat > 60) {
    parts.push('需求活跃');
  } else if (cell.demandHeat < 30) {
    parts.push('需求偏弱');
  }
  if (cell.supplyPressure > 60) {
    parts.push('供给充足');
  } else if (cell.supplyPressure < 30) {
    parts.push('供给偏紧');
  }
  parts.push(`价格趋势${priceTrend}`);
  return parts.join('，') + '。';
}

function deriveRecommendedActionReasons(
  marketCell: CaseWorldContextPOV,
  comparableSupply: ComparableSupplyPOV,
  demandMovement: DemandMovementPOV,
  ownerExpectation: OwnerExpectationSignalPOV,
  brokerActionPressure: BrokerActionPressurePOV,
  liveCtx?: LiveCausalContext,
): Array<{ rank: number; headline: string; detail: string; refs: POVCausalRef[] }> {
  const reasons: Array<{ rank: number; headline: string; detail: string; refs: POVCausalRef[] }> = [];
  let rank = 1;

  // Merge live recommendation refs with sub-projection refs for cross-domain proof
  const liveRecRefs = liveCtx?.recommendationRefs ?? [];

  if (ownerExpectation.pressureLabel === 'high' || ownerExpectation.pressureLabel === 'moderate') {
    const reasonRefs: POVCausalRef[] = liveRecRefs.length > 0
      ? [...liveRecRefs.slice(0, 1), ...ownerExpectation.refs.slice(0, 1)]
      : ownerExpectation.refs;
    reasons.push({
      rank,
      headline: '这套房应该先做面访分型，再决定是否进聚焦会',
      detail: `业主预期压力${ownerExpectation.pressureLabel === 'high' ? '偏高' : '中等'}，${ownerExpectation.delayedMarketSignal}。`,
      refs: reasonRefs,
    });
    rank += 1;
  }

  if (comparableSupply.topSignals.length > 0 && comparableSupply.topSignals[0].rank === 1) {
    reasons.push({
      rank,
      headline: comparableSupply.topSignals[0].headline,
      detail: comparableSupply.topSignals[0].detail,
      refs: comparableSupply.topSignals[0].refs,
    });
    rank += 1;
  }

  if (demandMovement.direction === 'outflow') {
    const demandRefs: POVCausalRef[] = liveRecRefs.length > 1
      ? [...liveRecRefs.slice(1, 2), ...demandMovement.refs.slice(0, 1)]
      : demandMovement.refs;
    reasons.push({
      rank,
      headline: '这类客户注意力在外流，先补一组能马上约看的客户',
      detail: `需求动量 ${demandMovement.demandMomentum}，需要补充即时客户。`,
      refs: demandRefs,
    });
    rank += 1;
  } else if (demandMovement.direction === 'inflow') {
    const demandRefs: POVCausalRef[] = liveRecRefs.length > 1
      ? [...liveRecRefs.slice(1, 2), ...demandMovement.refs.slice(0, 1)]
      : demandMovement.refs;
    reasons.push({
      rank,
      headline: '需求正在流入，趁热度安排带看',
      detail: `当前需求动量 ${demandMovement.demandMomentum}，适合推进带看。`,
      refs: demandRefs,
    });
    rank += 1;
  }

  if (brokerActionPressure.topSignals.length > 0) {
    const brokerRefs: POVCausalRef[] = liveRecRefs.length > 0
      ? [...liveRecRefs.slice(0, 1), ...brokerActionPressure.topSignals[0].refs.slice(0, 1)]
      : brokerActionPressure.topSignals[0].refs;
    reasons.push({
      rank,
      headline: brokerActionPressure.topSignals[0].headline,
      detail: brokerActionPressure.topSignals[0].detail,
      refs: brokerRefs,
    });
    rank += 1;
  }

  return reasons.slice(0, 2);
}
