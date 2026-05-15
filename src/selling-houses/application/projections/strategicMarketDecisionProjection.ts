/**
 * StrategicMarketDecisionProjection — upgrades projection from "explain action" to "strategic decision surface".
 *
 * Answers the player's strategic questions:
 *   - Why should I do THIS now?
 *   - What resources will I spend?
 *   - What opportunity will I capture?
 *   - Who will steal it if I don't?
 *   - What's the 3/7/14/30 day impact?
 *
 * Architecture:
 *   ActorKnowledge → belief → pressure → resource constraint → command → expected outcome → receipt
 *
 * All recommendation text comes from DecisionEvidenceEnvelope pipeline.
 * Numeric display values (energy, budget) are facts, not judgments.
 *
 * Round 17 changes:
 *   - Each topAction carries opportunityCost, resourceCost, competitorRisk, timeHorizonImpact
 *   - Market radar shows resource congestion per cell
 *   - Customer pool shows attention migration reasons
 *   - Owner pool shows trust/patience/expectation causal sources
 *   - Org resource shows why/why not resource allocation
 *
 * Round 18 changes (ledger/evidence-priority):
 *   - buildCompetitorRisk: visibleRivalEvidence is primary, rivalListings is display fallback
 *   - buildResourceCongestion: judgment text from pressure signals, numeric counts as display fallback
 *   - buildStrategicCustomerPool: atRiskCount derived from customer_seriousness pressure signals
 *   - buildStrategicOwnerPool: highPressureCount derived from owner_readiness/broker_trust/price_anchor pressure
 *   - buildOrgResource: allocation reasoning from broker_capacity_signal and manager_message causal events
 *
 * Mother model alignment:
 *   - POV reads the world; does not mutate it (Section 1.1)
 *   - Decision pipeline: belief → pressure → command → explanation (Section 5.1)
 *   - Competition pressure flows: CompetitionEvidence → POV → DecisionPressureDelta (Section 10)
 *   - Broker service essence: collect → filter → interpret → frame → recommend (Section 8)
 */

import type {
  Case,
  GameState,
} from '../../domain/models.js';

import type {
  ActorKnowledgeSnapshot,
  DecisionEvidenceEnvelope,
  PressureSignal,
  BeliefDomain,
} from '../../domain/world-model/actorKnowledgeTypes.js';

import {
  buildDecisionEvidenceEnvelope,
  evaluatePressureSignals,
  filterAvailableCommands,
  rankCommands,
  buildExplanationEnvelope,
} from './actorKnowledgeProjection.js';

import {
  buildSharedCausalRefs,
  type SharedCausalRefs,
  type EvidenceBackedReason,
  buildLegacyFallbackReason,
} from './perfectProjectionAdapters.js';

import type { POVCausalRef } from './bigWorldPOVProjection.js';

// ── Strategic Top Action ─────────────────────────────────────

export interface TimeHorizonImpact {
  readonly horizonDays: number;
  readonly label: string;
  readonly expectedOutcome: string;
  readonly confidence: number;
  readonly safeRefs: readonly { readonly refType: string; readonly refId: string; readonly refLabel: string }[];
}

export interface ResourceCost {
  readonly energyCost: number;
  readonly budgetCost: number;
  readonly energyAfter: number;
  readonly budgetAfter: number;
  readonly energyLabel: string;
  readonly budgetLabel: string;
}

export interface OpportunityCost {
  readonly foregoneAction: string;
  readonly foregoneReason: string;
  readonly foregoneConfidence: number;
}

export interface CompetitorRisk {
  readonly rivalCount: number;
  readonly topRivalLabel: string;
  readonly riskDescription: string;
  readonly riskMagnitude: number;
}

export interface StrategicTopAction {
  readonly caseId: string;
  readonly caseTitle: string;
  readonly actionLabel: string;
  readonly reasoning: string;
  readonly safeRefs: readonly { readonly refType: string; readonly refId: string; readonly refLabel: string }[];
  readonly replayKey: string;
  readonly confidence: number;
  readonly sourceRecordIds: readonly string[];
  // ── Strategic fields (Round 17) ──
  readonly resourceCost: ResourceCost;
  readonly opportunityCost: OpportunityCost;
  readonly competitorRisk: CompetitorRisk;
  readonly timeHorizonImpact: readonly TimeHorizonImpact[];
}

// ── Strategic Market Radar ───────────────────────────────────

export interface ResourceCongestion {
  readonly cellId: string;
  readonly cellName: string;
  readonly activeBrokerCount: number;
  readonly activeListingCount: number;
  readonly demandSupplyRatio: number;
  readonly congestionLevel: 'low' | 'moderate' | 'high';
  readonly congestionLabel: string;
}

export interface StrategicMarketRadarCell {
  readonly cellId: string;
  readonly cellName: string;
  readonly heat: number;
  readonly heatBand: string;
  readonly priceTrend: string;
  readonly competitivePressure: number;
  readonly supplyPressure: number;
  readonly refs: readonly POVCausalRef[];
  readonly resourceCongestion: ResourceCongestion;
}

export interface StrategicMarketRadarDimension {
  readonly hotCells: readonly StrategicMarketRadarCell[];
  readonly coldCells: readonly StrategicMarketRadarCell[];
  readonly topSignal: { readonly headline: string; readonly detail: string; readonly refs: readonly POVCausalRef[] } | null;
  readonly evidenceBackedPressureItems: readonly EvidenceBackedReason[];
  readonly resourceCongestionSummary: string;
}

// ── Strategic Customer Pool ──────────────────────────────────

export interface AttentionMigrationReason {
  readonly reasonId: string;
  readonly reasonLabel: string;
  readonly detail: string;
  readonly domain: BeliefDomain;
  readonly confidence: number;
  readonly safeRefs: readonly { readonly refType: string; readonly refId: string; readonly refLabel: string }[];
}

export interface StrategicCustomerPoolDimension {
  readonly activeCount: number;
  readonly comparingCount: number;
  readonly atRiskCount: number;
  readonly migrationSignal: { readonly headline: string; readonly detail: string; readonly refs: readonly POVCausalRef[] } | null;
  readonly evidenceBackedPressureItems: readonly EvidenceBackedReason[];
  readonly attentionMigrationReasons: readonly AttentionMigrationReason[];
}

// ── Strategic Owner Pool ─────────────────────────────────────

export interface TrustPatienceCausalSource {
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly domain: BeliefDomain;
  readonly impactDescription: string;
  readonly confidence: number;
  readonly safeRefs: readonly { readonly refType: string; readonly refId: string; readonly refLabel: string }[];
}

export interface StrategicOwnerPoolDimension {
  readonly totalActive: number;
  readonly highPressureCount: number;
  readonly topOwnerIssue: { readonly headline: string; readonly detail: string; readonly refs: readonly POVCausalRef[] } | null;
  readonly evidenceBackedPressureItems: readonly EvidenceBackedReason[];
  readonly trustPatienceCausalSources: readonly TrustPatienceCausalSource[];
}

// ── Org Resource ─────────────────────────────────────────────

export interface OrgResourceAllocation {
  readonly resourceType: 'energy' | 'budget' | 'manager_attention' | 'focus_meeting_slot';
  readonly allocated: boolean;
  readonly reason: string;
  readonly confidence: number;
  readonly safeRefs: readonly { readonly refType: string; readonly refId: string; readonly refLabel: string }[];
}

export interface OrgResourceDimension {
  readonly energyRemaining: number;
  readonly budgetRemaining: number;
  readonly allocations: readonly OrgResourceAllocation[];
}

// ── Strategic Playable Market Projection ─────────────────────

export interface StrategicPlayableMarketProjection {
  readonly day: number;
  readonly marketRadar: StrategicMarketRadarDimension;
  readonly competitivePressure: {
    readonly activeRivalCount: number;
    readonly topRivalAction: { readonly headline: string; readonly detail: string; readonly refs: readonly POVCausalRef[] } | null;
    readonly pressureLevel: 'low' | 'moderate' | 'high';
    readonly evidenceBackedPressureItems: readonly EvidenceBackedReason[];
  };
  readonly customerPool: StrategicCustomerPoolDimension;
  readonly ownerPool: StrategicOwnerPoolDimension;
  readonly brokerOpportunity: {
    readonly energyRemaining: number;
    readonly budgetRemaining: number;
    readonly topActions: readonly StrategicTopAction[];
  };
  readonly orgResource: OrgResourceDimension;
  readonly sharedCausalRefs?: SharedCausalRefs;
  readonly evidenceBackedRadarItems?: readonly EvidenceBackedReason[];
}

// ── Helpers ──────────────────────────────────────────────────

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

function aggregatePressureSignals(
  actorKnowledgeMap: Map<string, ActorKnowledgeSnapshot>,
): PressureSignal[] {
  const byDomain = new Map<string, PressureSignal>();
  for (const knowledge of actorKnowledgeMap.values()) {
    const envelope = buildDecisionEvidenceEnvelope(knowledge);
    for (const signal of envelope.pressureSignals) {
      const existing = byDomain.get(signal.domain);
      if (!existing || signal.magnitude > existing.magnitude) {
        byDomain.set(signal.domain, signal);
      }
    }
  }
  return [...byDomain.values()].sort((a, b) => b.magnitude - a.magnitude);
}

function buildDimensionEvidenceFromPressure(
  signals: readonly PressureSignal[],
  domains: readonly string[],
  sharedRefs: SharedCausalRefs,
): EvidenceBackedReason[] {
  const items: EvidenceBackedReason[] = [];
  for (const signal of signals) {
    if (!domains.includes(signal.domain)) continue;
    items.push({
      displayText: signal.label,
      evidenceAvailable: true,
      safeRefs: sharedRefs.allRefs.slice(0, 2),
      replayKey: sharedRefs.replayKey,
      sourceRecordIds: signal.sourceRecordIds.slice(0, 3),
      confidence: signal.magnitude / 100,
      evidenceStatus: 'backed',
      beliefSourceIds: signal.beliefSourceIds,
      pressureSignalIds: [signal.signalId],
    });
  }
  return items.slice(0, 3);
}

function sourceRecordIdsForDomain(
  signals: readonly PressureSignal[],
  domains: readonly BeliefDomain[],
): readonly string[] {
  const ids = new Set<string>();
  for (const signal of signals) {
    if (!domains.includes(signal.domain)) continue;
    for (const sourceRecordId of signal.sourceRecordIds) {
      ids.add(sourceRecordId);
    }
  }
  return [...ids];
}

function maxPressureForDomain(
  signals: readonly PressureSignal[],
  domains: readonly BeliefDomain[],
): number {
  return signals
    .filter((signal) => domains.includes(signal.domain))
    .reduce((max, signal) => Math.max(max, signal.magnitude), 0);
}

function causalEventMatchesCell(event: unknown, cellId: string): boolean {
  const eventRecord = event as {
    readonly entityIds?: readonly string[];
    readonly payload?: Record<string, unknown>;
  };
  if (eventRecord.entityIds?.includes(cellId)) return true;
  const payload = eventRecord.payload ?? {};
  if (payload.marketCellId === cellId) return true;
  const affectedIds = payload.affectedMarketCellIds;
  return Array.isArray(affectedIds) && affectedIds.includes(cellId);
}

function buildVisibleRivalEvidence(
  state: GameState,
  cellId: string | undefined,
  pressureSignals: readonly PressureSignal[],
): {
  readonly count: number;
  readonly riskMagnitude: number;
  readonly label: string;
  readonly description: string;
  readonly refs: readonly POVCausalRef[];
} {
  const visibleSourceIds = sourceRecordIdsForDomain(pressureSignals, ['rival_threat', 'market_heat', 'service_path']);
  const relevantEvents = (state.worldCausalEvents ?? [])
    .filter((event) => {
      const eventRecord = event as typeof event & {
        readonly sourceKind?: string;
        readonly sourceRecordId?: string;
        readonly sourceRecordIds?: readonly string[];
      };
      const isRivalEvent = event.kind.startsWith('Rival') || eventRecord.sourceKind === 'rival_action';
      if (!isRivalEvent) return false;
      const isVisible = visibleSourceIds.length === 0
        || (eventRecord.sourceRecordId && visibleSourceIds.includes(eventRecord.sourceRecordId))
        || eventRecord.sourceRecordIds?.some((sourceRecordId) => visibleSourceIds.includes(sourceRecordId));
      if (!isVisible) return false;
      return !cellId || causalEventMatchesCell(event, cellId);
    })
    .slice(0, 20); // Five-x safe: bounded to 20 most relevant events

  const rivalPressure = maxPressureForDomain(pressureSignals, ['rival_threat', 'market_heat', 'service_path']);
  const latestEvent = relevantEvents
    .slice()
    .sort((left, right) => right.day - left.day)[0];
  const latestPayload = latestEvent?.payload as unknown as Record<string, unknown> | undefined;
  const latestSummary = typeof latestPayload?.summary === 'string'
    ? latestPayload.summary
    : undefined;
  const latestListingId = typeof latestPayload?.listingId === 'string'
    ? latestPayload.listingId
    : undefined;
  const topSignal = pressureSignals.find((signal) => signal.domain === 'rival_threat')
    ?? pressureSignals.find((signal) => signal.domain === 'market_heat')
    ?? pressureSignals[0];
  const fallbackCount = visibleSourceIds.length > 0 ? visibleSourceIds.length : rivalPressure > 0 ? 1 : 0;
  const count = Math.max(relevantEvents.length, fallbackCount);
  const riskMagnitude = Math.max(
    rivalPressure,
    Math.min(100, count * 12),
  );
  const label = latestSummary
    ?? (latestListingId ? `竞品 ${latestListingId}` : topSignal?.label)
    ?? '可见竞品压力';
  const refs: POVCausalRef[] = latestEvent
    ? [{ refType: 'market-signal', refId: latestEvent.id, refLabel: label }]
    : visibleSourceIds.slice(0, 3).map((sourceRecordId) => ({
      refType: 'market-signal' as const,
      refId: sourceRecordId,
      refLabel: '竞品压力来源',
    }));

  return {
    count,
    riskMagnitude,
    label,
    description: count > 0
      ? `可见因果链里有 ${count} 条竞品/市场压力来源，风险强度 ${Math.round(riskMagnitude)}。`
      : '当前可见因果链里没有明确竞品压力。',
    refs,
  };
}

function buildStrategicOpportunityCost(
  state: GameState,
  caseItem: Case,
  currentCommandId: string,
  rankedCommands: ReturnType<typeof rankCommands>,
  pressureSignals: readonly PressureSignal[],
  resourceCost: ResourceCost,
): OpportunityCost {
  const foregone = rankedCommands.find((ranked) => ranked.command.commandId !== currentCommandId);
  if (foregone) {
    return {
      foregoneAction: foregone.command.name,
      foregoneReason: foregone.reasoning,
      foregoneConfidence: foregone.confidence,
    };
  }

  const deferredCase = state.cases
    .filter((candidate) => candidate.status === 'active' && candidate.id !== caseItem.id)
    .sort((left, right) => {
      const leftPressure = left.urgency * 0.35 + (100 - left.patience) * 0.25 + left.heat * 0.2 + left.priceGapPct * 2;
      const rightPressure = right.urgency * 0.35 + (100 - right.patience) * 0.25 + right.heat * 0.2 + right.priceGapPct * 2;
      return rightPressure - leftPressure;
    })[0];
  const nextPressure = pressureSignals.find((signal) => signal.domain !== pressureSignals[0]?.domain)
    ?? pressureSignals[1]
    ?? pressureSignals[0];

  if (deferredCase) {
    const scarceResource = resourceCost.budgetCost > 0
      ? `推广金 ${resourceCost.budgetCost} 点`
      : `精力 ${Math.max(1, resourceCost.energyCost)} 点`;
    return {
      foregoneAction: `暂缓处理 ${deferredCase.title}`,
      foregoneReason: `选择当前动作会占用${scarceResource}，${deferredCase.title} 的业主/客户压力需要排到下一轮处理。`,
      foregoneConfidence: Math.max(0.45, Math.min(0.85, (nextPressure?.magnitude ?? 50) / 100)),
    };
  }

  return {
    foregoneAction: nextPressure ? `暂缓处理${nextPressure.label}` : '保留资源给下一轮市场变化',
    foregoneReason: nextPressure
      ? `当前动作会优先消耗资源，${nextPressure.label} 只能延后观察。`
      : '当前动作会消耗今日资源，下一轮市场/客户变化的响应空间会变小。',
    foregoneConfidence: Math.max(0.4, Math.min(0.75, (nextPressure?.magnitude ?? 45) / 100)),
  };
}

function buildCompetitorRisk(
  state: GameState,
  caseItem: Case,
  pressureSignals: readonly PressureSignal[],
): CompetitorRisk {
  const cellId = caseItem.marketCellId;
  const rivalListings = state.marketShadow.rivalListings.filter(
    (rivalListing) => rivalListing.status === 'active' && rivalListing.marketCellId === cellId,
  );
  const topRival = rivalListings.slice().sort((left, right) => right.heat - left.heat)[0];
  const visibleRivalEvidence = buildVisibleRivalEvidence(state, cellId, pressureSignals);

  // Evidence-first: visibleRivalEvidence from pressure signals is primary
  const hasEvidence = pressureSignals.length > 0 && visibleRivalEvidence.count > 0;
  const rivalCount = hasEvidence
    ? visibleRivalEvidence.count
    : Math.max(rivalListings.length, visibleRivalEvidence.count);
  const riskMagnitude = hasEvidence
    ? visibleRivalEvidence.riskMagnitude
    : Math.max(Math.min(100, rivalListings.length * 10), visibleRivalEvidence.riskMagnitude);

  return {
    rivalCount,
    topRivalLabel: hasEvidence
      ? visibleRivalEvidence.label
      : topRival?.title ?? visibleRivalEvidence.label,
    riskDescription: hasEvidence
      ? visibleRivalEvidence.description
      : rivalListings.length > 0
        ? `同板块 ${rivalListings.length} 套竞品正在分流客户注意力`
        : visibleRivalEvidence.description,
    riskMagnitude,
  };
}

// ── Build Resource Congestion ────────────────────────────────

function buildResourceCongestion(
  state: GameState,
  cellId: string,
  cellName: string,
  aggregatedSignals?: readonly PressureSignal[],
): ResourceCongestion {
  // Five-x safe: bounded iteration per cell
  const rivalListings = state.marketShadow.rivalListings.filter(
    (r) => r.status === 'active' && r.marketCellId === cellId,
  ).slice(0, 50); // cap at 50 per cell for five-x
  const activeBrokerCount = state.marketShadow.rivalStores.filter(
    (s) => s.districtFocus.some((d) => d === cellId),
  ).slice(0, 30).length + 1; // cap at 30 stores per cell
  const activeListingCount = rivalListings.length;
  const cellCustomers = state.customerStates.filter(
    (cs) => cs.status !== 'lost' && cs.status !== 'converted',
  );
  const demandSupplyRatio = activeListingCount > 0
    ? cellCustomers.length / activeListingCount
    : cellCustomers.length > 0 ? 10 : 0;

  // Derive congestion judgment from pressure signals when available
  const marketHeatSignal = aggregatedSignals?.find((s) => s.domain === 'market_heat');
  const servicePathSignal = aggregatedSignals?.find((s) => s.domain === 'service_path');
  const hasEvidence = (marketHeatSignal?.magnitude ?? 0) > 0 || (servicePathSignal?.magnitude ?? 0) > 0;

  let congestionLevel: ResourceCongestion['congestionLevel'] = 'low';
  let congestionLabel = '资源充裕，进入门槛低';

  if (hasEvidence) {
    const combinedPressure = (marketHeatSignal?.magnitude ?? 0) * 0.6 + (servicePathSignal?.magnitude ?? 0) * 0.4;
    if (combinedPressure >= 70) {
      congestionLevel = 'high';
      congestionLabel = `市场热度 ${Math.round(marketHeatSignal?.magnitude ?? 0)}，服务路径压力 ${Math.round(servicePathSignal?.magnitude ?? 0)}，资源高度拥挤`;
    } else if (combinedPressure >= 40) {
      congestionLevel = 'moderate';
      congestionLabel = `市场热度 ${Math.round(marketHeatSignal?.magnitude ?? 0)}，竞争中等`;
    }
  } else {
    // Display fallback: numeric counts
    if (activeBrokerCount >= 8 && activeListingCount >= 20) {
      congestionLevel = 'high';
      congestionLabel = `${activeBrokerCount} 经纪人、${activeListingCount} 挂牌在抢客，资源高度拥挤`;
    } else if (activeBrokerCount >= 4 || activeListingCount >= 10) {
      congestionLevel = 'moderate';
      congestionLabel = `${activeBrokerCount} 经纪人、${activeListingCount} 挂牌，竞争中等`;
    }
  }

  return {
    cellId,
    cellName,
    activeBrokerCount,
    activeListingCount,
    demandSupplyRatio: Math.round(demandSupplyRatio * 100) / 100,
    congestionLevel,
    congestionLabel,
  };
}

// ── Build Strategic Market Radar ──────────────────────────────

/**
 * Actor-visible cell window: only cells the actor has active cases in,
 * plus cells referenced by pressure signals. Bounded to prevent five-x explosion.
 *
 * For current-market (24 cells): returns all cells (no bounding needed).
 * For five-x (100+ cells): returns only actor-relevant cells (max ~10).
 */
function buildActorVisibleCellWindow(
  state: GameState,
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
): Set<string> {
  const visibleCells = new Set<string>();

  // Layer 1: cells where the actor has active cases
  for (const caseItem of state.cases) {
    if (caseItem.status === 'active' && caseItem.marketCellId) {
      visibleCells.add(caseItem.marketCellId);
    }
  }

  // Layer 2: cells referenced by actor knowledge (from pressure signals)
  if (actorKnowledgeMap) {
    for (const knowledge of actorKnowledgeMap.values()) {
      for (const source of knowledge.visibleSources) {
        for (const entityId of source.entityRefIds) {
          // Entity IDs that look like market cells
          if (entityId.startsWith('cell-') || entityId.startsWith('market-')) {
            visibleCells.add(entityId);
          }
        }
      }
    }
  }

  // Layer 3: if we have too few, add top cells by heat from state.markets
  // This ensures we don't miss hot cells even if actor has no cases there yet
  if (visibleCells.size < 3 && state.markets.length > 0) {
    const topByHeat = [...state.markets]
      .sort((a, b) => b.demandHeat - a.demandHeat)
      .slice(0, 3);
    for (const cell of topByHeat) {
      visibleCells.add(cell.id);
    }
  }

  return visibleCells;
}

function buildStrategicMarketRadar(
  state: GameState,
  aggregatedSignals: readonly PressureSignal[],
  sharedRefs?: SharedCausalRefs,
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
): StrategicMarketRadarDimension {
  // Actor-visible window: only iterate relevant cells (five-x safe)
  const visibleCellIds = buildActorVisibleCellWindow(state, actorKnowledgeMap);
  const cells = state.markets.filter((cell) => visibleCellIds.has(cell.id));

  const radarCells: StrategicMarketRadarCell[] = cells.map((cell) => {
    const heatBand = deriveHeatBandLabel(cell.demandHeat);
    const priceTrend = derivePriceTrendLabel(cell.supplyPressure, cell.competitivePressure);
    const resourceCongestion = buildResourceCongestion(state, cell.id, cell.name, aggregatedSignals);

    return {
      cellId: cell.id,
      cellName: cell.name,
      heat: cell.demandHeat,
      heatBand,
      priceTrend,
      competitivePressure: cell.competitivePressure,
      supplyPressure: cell.supplyPressure,
      refs: [{ refType: 'market-cell' as const, refId: cell.id, refLabel: cell.name }],
      resourceCongestion,
    };
  });

  const hotCells = radarCells
    .filter((c) => c.heat >= 60 || c.competitivePressure >= 55)
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 3);

  const coldCells = radarCells
    .filter((c) => c.heat <= 30)
    .sort((a, b) => a.heat - b.heat)
    .slice(0, 2);

  const topCell = radarCells.sort((a, b) => b.heat - a.heat)[0];
  const topSignal = topCell
    ? {
      headline: `${topCell.cellName} 需求热度 ${Math.round(topCell.heat)}`,
      detail: topCell.heat >= 60
        ? `${topCell.cellName} 客户需求活跃，竞争压力 ${Math.round(topCell.competitivePressure)}，是推进带看的好窗口。`
        : `${topCell.cellName} 市场相对平稳，需要持续观察客户动向。`,
      refs: [{ refType: 'market-cell' as const, refId: topCell.cellId, refLabel: topCell.cellName }],
    }
    : null;

  const evidenceBackedPressureItems = sharedRefs
    ? buildDimensionEvidenceFromPressure(aggregatedSignals, ['market_heat', 'price_anchor'], sharedRefs)
    : [];

  // Resource congestion summary
  const highCongestionCells = radarCells.filter((c) => c.resourceCongestion.congestionLevel === 'high');
  const resourceCongestionSummary = highCongestionCells.length > 0
    ? `${highCongestionCells.map((c) => c.cellName).join('、')} 资源高度拥挤，进入前需要差异化策略。`
    : '当前各板块资源竞争可控。';

  return { hotCells, coldCells, topSignal, evidenceBackedPressureItems, resourceCongestionSummary };
}

// ── Build Strategic Customer Pool ────────────────────────────

/**
 * Actor-visible customer window: only customers in cells the actor operates in.
 * For five-x (22000+ customers): bounded to actor-visible cells + max 200 sample.
 */
function buildActorVisibleCustomerWindow(
  state: GameState,
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
): readonly import('../../domain/models.js').CustomerRuntimeState[] {
  const visibleCellIds = buildActorVisibleCellWindow(state, actorKnowledgeMap);

  // Layer 1: customers in visible cells (from their active cases)
  const visibleCaseIds = new Set<string>();
  for (const caseItem of state.cases) {
    if (caseItem.status === 'active' && visibleCellIds.has(caseItem.marketCellId)) {
      visibleCaseIds.add(caseItem.id);
    }
  }

  const cellCustomers = state.customerStates.filter((cs) =>
    cs.activeCaseIds.some((caseId) => visibleCaseIds.has(caseId)),
  );

  // Layer 2: if too few, add customers from knowledge map
  if (cellCustomers.length < 5 && actorKnowledgeMap) {
    const knowledgeCustomerIds = new Set<string>();
    for (const knowledge of actorKnowledgeMap.values()) {
      for (const source of knowledge.visibleSources) {
        if (source.sourceKind === 'customer_interaction' || source.sourceKind === 'buyer_financing_signal') {
          for (const entityId of source.entityRefIds) {
            knowledgeCustomerIds.add(entityId);
          }
        }
      }
    }
    const knowledgeCustomers = state.customerStates.filter(
      (cs) => knowledgeCustomerIds.has(cs.customerId) && !cellCustomers.some((c) => c.customerId === cs.customerId),
    );
    return [...cellCustomers, ...knowledgeCustomers].slice(0, 200);
  }

  return cellCustomers.slice(0, 200);
}

function buildStrategicCustomerPool(
  state: GameState,
  aggregatedSignals: readonly PressureSignal[],
  sharedRefs?: SharedCausalRefs,
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
): StrategicCustomerPoolDimension {
  // Actor-visible window: only customers in relevant cells (five-x safe)
  const visibleCustomers = buildActorVisibleCustomerWindow(state, actorKnowledgeMap);
  const customerStates = visibleCustomers;
  const activeCount = customerStates.filter((cs) => cs.status !== 'lost' && cs.status !== 'converted').length;
  const comparingCount = customerStates.filter((cs) => cs.status === 'comparing').length;

  // Derive atRiskCount from pressure signals when knowledge available
  const customerSeriousnessSignals = aggregatedSignals.filter(
    (s) => s.domain === 'customer_seriousness' || s.domain === 'deal_closeability',
  );
  const hasEvidence = customerSeriousnessSignals.length > 0;
  const atRiskFromPressure = customerSeriousnessSignals.filter((s) => s.magnitude >= 60).length;
  const atRiskCount = hasEvidence
    ? Math.max(atRiskFromPressure, 1)
    : customerStates.filter((cs) => cs.churnRisk >= 60).length;

  // Migration signal from highest pressure signal when available
  const topCustomerSignal = customerSeriousnessSignals
    .slice()
    .sort((a, b) => b.magnitude - a.magnitude)[0];
  const legacyAtRiskCustomer = customerStates
    .filter((cs) => cs.churnRisk >= 60)
    .sort((a, b) => b.churnRisk - a.churnRisk)[0];

  const migrationSignal = topCustomerSignal && hasEvidence
    ? {
      headline: `${topCustomerSignal.label} 压力 ${topCustomerSignal.magnitude}%`,
      detail: `因果链显示客户注意力正在被分流，${topCustomerSignal.label} 需要今天跟进。`,
      refs: topCustomerSignal.sourceRecordIds.slice(0, 2).map((sourceRecordId) => ({
        refType: 'opportunity' as const,
        refId: sourceRecordId,
        refLabel: topCustomerSignal.label,
      })),
    }
    : legacyAtRiskCustomer
      ? {
        headline: `${legacyAtRiskCustomer.customerId} 流失风险 ${Math.round(legacyAtRiskCustomer.churnRisk)}%`,
        detail: `该客户近期活跃度下降，可能被竞品截流，需要今天跟进。`,
        refs: [{ refType: 'opportunity' as const, refId: legacyAtRiskCustomer.customerId, refLabel: legacyAtRiskCustomer.customerId }],
      }
      : null;

  const evidenceBackedPressureItems = sharedRefs
    ? buildDimensionEvidenceFromPressure(aggregatedSignals, ['customer_seriousness', 'deal_closeability'], sharedRefs)
    : [];

  // Attention migration reasons from belief pipeline
  const attentionMigrationReasons: AttentionMigrationReason[] = [];
  if (actorKnowledgeMap && actorKnowledgeMap.size > 0) {
    for (const [caseId, knowledge] of actorKnowledgeMap) {
      const envelope = buildDecisionEvidenceEnvelope(knowledge);
      for (const signal of envelope.pressureSignals) {
        if (signal.domain === 'customer_seriousness' || signal.domain === 'deal_closeability') {
          const caseItem = state.cases.find((c) => c.id === caseId);
          attentionMigrationReasons.push({
            reasonId: signal.signalId,
            reasonLabel: signal.label,
            detail: `${caseItem?.title ?? caseId}: ${signal.label} 压力 ${signal.magnitude}%`,
            domain: signal.domain,
            confidence: signal.magnitude / 100,
            safeRefs: sharedRefs?.allRefs.slice(0, 2) ?? [],
          });
        }
      }
    }
  }

  return {
    activeCount,
    comparingCount,
    atRiskCount,
    migrationSignal,
    evidenceBackedPressureItems,
    attentionMigrationReasons: attentionMigrationReasons.slice(0, 5),
  };
}

// ── Build Strategic Owner Pool ───────────────────────────────

function buildStrategicOwnerPool(
  state: GameState,
  aggregatedSignals: readonly PressureSignal[],
  sharedRefs?: SharedCausalRefs,
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
): StrategicOwnerPoolDimension {
  // Actor-visible window: only cases the actor has knowledge for (five-x safe)
  const visibleCaseIds = actorKnowledgeMap
    ? new Set(actorKnowledgeMap.keys())
    : new Set(state.cases.filter((c) => c.status === 'active').slice(0, 10).map((c) => c.id));
  const activeCases = state.cases.filter((c) => c.status === 'active' && visibleCaseIds.has(c.id));
  const totalActive = activeCases.length;

  // Derive highPressureCount from pressure signals when knowledge available
  const ownerPressureSignals = aggregatedSignals.filter(
    (s) => s.domain === 'owner_readiness' || s.domain === 'broker_trust' || s.domain === 'price_anchor',
  );
  const hasEvidence = ownerPressureSignals.length > 0;
  const highPressureFromSignals = ownerPressureSignals.filter((s) => s.magnitude >= 45).length;

  const highPressureCases = activeCases.filter((c) => {
    const gapScore = Math.min(100, c.priceGapPct * 3);
    const patienceScore = Math.max(0, 100 - c.patience);
    const compositePressure = gapScore * 0.5 + patienceScore * 0.3 + (100 - c.trust) * 0.2;
    return compositePressure > 45;
  });
  const highPressureCount = hasEvidence
    ? Math.max(highPressureFromSignals, 1)
    : highPressureCases.length;

  // Top owner issue from highest pressure signal when available
  const topOwnerSignal = ownerPressureSignals
    .slice()
    .sort((a, b) => b.magnitude - a.magnitude)[0];
  const legacyTopCase = highPressureCases.sort((a, b) => {
    const aPressure = a.priceGapPct * 3 * 0.5 + (100 - a.patience) * 0.3 + (100 - a.trust) * 0.2;
    const bPressure = b.priceGapPct * 3 * 0.5 + (100 - b.patience) * 0.3 + (100 - b.trust) * 0.2;
    return bPressure - aPressure;
  })[0];

  const topOwnerIssue = topOwnerSignal && hasEvidence
    ? {
      headline: `${topOwnerSignal.label} 压力 ${topOwnerSignal.magnitude}%`,
      detail: `因果链显示业主预期/信任/耐心存在压力，${topOwnerSignal.label} 需要关注。`,
      refs: topOwnerSignal.sourceRecordIds.slice(0, 2).map((sourceRecordId) => ({
        refType: 'case' as const,
        refId: sourceRecordId,
        refLabel: topOwnerSignal.label,
      })),
    }
    : legacyTopCase
      ? {
        headline: `${legacyTopCase.title} 业主预期压力偏高`,
        detail: `挂牌价高于市场价 ${Math.round(legacyTopCase.priceGapPct)}%，信任 ${Math.round(legacyTopCase.trust)}，耐心 ${Math.round(legacyTopCase.patience)}。`,
        refs: [{ refType: 'case' as const, refId: legacyTopCase.id, refLabel: legacyTopCase.title }],
      }
      : null;

  const evidenceBackedPressureItems = sharedRefs
    ? buildDimensionEvidenceFromPressure(aggregatedSignals, ['owner_readiness', 'broker_trust', 'price_anchor'], sharedRefs)
    : [];

  // Trust/patience causal sources from belief pipeline
  const trustPatienceCausalSources: TrustPatienceCausalSource[] = [];
  if (actorKnowledgeMap && actorKnowledgeMap.size > 0) {
    for (const [caseId, knowledge] of actorKnowledgeMap) {
      const envelope = buildDecisionEvidenceEnvelope(knowledge);
      for (const signal of envelope.pressureSignals) {
        if (signal.domain === 'owner_readiness' || signal.domain === 'broker_trust' || signal.domain === 'price_anchor') {
          const caseItem = state.cases.find((c) => c.id === caseId);
          trustPatienceCausalSources.push({
            sourceId: signal.signalId,
            sourceLabel: signal.label,
            domain: signal.domain,
            impactDescription: `${caseItem?.title ?? caseId}: ${signal.label} 影响业主信任和耐心`,
            confidence: signal.magnitude / 100,
            safeRefs: sharedRefs?.allRefs.slice(0, 2) ?? [],
          });
        }
      }
    }
  }

  return {
    totalActive,
    highPressureCount,
    topOwnerIssue,
    evidenceBackedPressureItems,
    trustPatienceCausalSources: trustPatienceCausalSources.slice(0, 5),
  };
}

// ── Build Strategic Broker Opportunity ───────────────────────

/**
 * Read the latest closing balance for a resource dimension from the economic ledger.
 * Falls back to state fields when ledger is not available.
 */
function readResourceFromLedger(
  state: GameState,
  dimension: 'energy' | 'promotionBudget',
  fallback: number,
): number {
  const ledger = state.bigWorldRuntime?.economicResourceLedger;
  if (!ledger || ledger.length === 0) return fallback;

  // Find the latest entry for this dimension
  for (let i = ledger.length - 1; i >= 0; i--) {
    const entry = ledger[i];
    if (dimension === 'energy') {
      // Reconstruct closing energy from deltas
      const consumed = ledger.slice(0, i + 1).reduce((sum, e) => sum + e.playerEnergyConsumed, 0);
      const replenished = ledger.slice(0, i + 1).reduce((sum, e) => sum + e.playerEnergyReplenished, 0);
      return Math.max(0, replenished - consumed);
    }
    if (dimension === 'promotionBudget') {
      const consumed = ledger.slice(0, i + 1).reduce((sum, e) => sum + e.promotionBudgetConsumed, 0);
      const allocated = ledger.slice(0, i + 1).reduce((sum, e) => sum + e.promotionBudgetAllocated, 0);
      return Math.max(0, allocated - consumed);
    }
  }
  return fallback;
}

function buildStrategicTopActions(
  state: GameState,
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
): StrategicTopAction[] {
  const actions: StrategicTopAction[] = [];
  const activeCases = state.cases.filter((c) => c.status === 'active');

  if (!actorKnowledgeMap || actorKnowledgeMap.size === 0) return actions;

  // Read resource balances from ledger when available, fall back to state fields
  const currentEnergy = readResourceFromLedger(state, 'energy', state.energy);
  const currentBudget = readResourceFromLedger(state, 'promotionBudget', state.auxiliaryStats?.promotionBudget ?? 0);

  for (const caseItem of activeCases) {
    const knowledge = actorKnowledgeMap.get(caseItem.id);
    if (!knowledge) continue;

    const envelope = buildDecisionEvidenceEnvelope(knowledge);
    const sharedRefs = buildSharedCausalRefs(envelope);

    if (!envelope.recommendedCommand) continue;

    const cmd = envelope.recommendedCommand;
    const pressureSignals = evaluatePressureSignals(knowledge);

    // Resource cost — derived from command structural properties + pressure signals (not static map)
    const resourceCost = deriveResourceCost(
      cmd.command.category,
      cmd.command.targetDomains,
      cmd.command.pressureThreshold,
      pressureSignals,
      currentEnergy,
      currentBudget,
    );

    // Opportunity cost: what else could be done instead
    const allRanked = rankCommands(
      filterAvailableCommands('player_broker', pressureSignals),
      pressureSignals,
    );
    const opportunityCost = buildStrategicOpportunityCost(
      state,
      caseItem,
      cmd.command.commandId,
      allRanked,
      pressureSignals,
      resourceCost,
    );

    // Competitor risk
    const competitorRisk = buildCompetitorRisk(state, caseItem, pressureSignals);

    // Time horizon impact: 3/7/14/30 days
    const timeHorizonImpact = buildTimeHorizonImpact(caseItem, cmd.command.commandId, pressureSignals, sharedRefs);

    actions.push({
      caseId: caseItem.id,
      caseTitle: caseItem.title,
      actionLabel: cmd.command.name,
      reasoning: envelope.explanation.summary,
      safeRefs: envelope.explanation.safeRefs.length > 0
        ? envelope.explanation.safeRefs
        : sharedRefs.allRefs.slice(0, 3),
      replayKey: sharedRefs.replayKey,
      confidence: cmd.confidence,
      sourceRecordIds: cmd.sourceRecordIds.slice(0, 5),
      resourceCost,
      opportunityCost,
      competitorRisk,
      timeHorizonImpact,
    });
  }

  return actions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}

/**
 * Derive resource cost from command structural properties + pressure signals + current resource state.
 *
 * Replaces static category-to-cost maps with evidence-backed derivation:
 *   - Energy base = pressureThreshold × targetDomainCount / 20 (structural complexity)
 *   - Energy scales with pressure magnitude on target domains (1.0x–1.5x)
 *   - Budget scales with promotion-category pressure (marketing spend = urgency × pressure)
 *   - Both are bounded and traceable to the pressure signals that drove them
 *
 * Hard constraints:
 *   - No hardcoded cost per commandId or per category
 *   - Base cost derived from command's own structural properties (threshold, domains)
 *   - Cost derivation traces to pressure signals (evidence-backed)
 *   - Same pressure + same command → same cost (deterministic)
 */
function deriveResourceCost(
  commandCategory: string,
  targetDomains: readonly string[],
  pressureThreshold: number,
  pressureSignals: readonly PressureSignal[],
  currentEnergy: number,
  currentBudget: number,
): ResourceCost {
  // Base energy derived from command structural properties (not a static map)
  // Higher pressure threshold = more focused effort needed to trigger this command
  // More target domains = more coordination across belief dimensions
  const baseEnergy = Math.max(1, Math.round(pressureThreshold * targetDomains.length / 20));

  // Pressure scale: higher pressure on target domains → more focused effort needed
  const targetPressure = pressureSignals
    .filter((s) => targetDomains.includes(s.domain))
    .reduce((max, s) => Math.max(max, s.magnitude), 0);
  const pressureScale = 1 + (targetPressure / 100) * 0.5; // 1.0x to 1.5x
  const energyCost = Math.max(1, Math.round(baseEnergy * pressureScale));

  // Budget cost: only for promotion category (marketing spend = f(pressure, urgency))
  // Other categories (pricing, relationship, process, escalation) don't directly spend budget
  const budgetCost = commandCategory === 'promotion'
    ? Math.max(3, Math.round(targetPressure * 0.08))
    : 0;

  return {
    energyCost,
    budgetCost,
    energyAfter: Math.max(0, currentEnergy - energyCost),
    budgetAfter: Math.max(0, currentBudget - budgetCost),
    energyLabel: `消耗 ${energyCost} 精力（阈值${pressureThreshold}×${targetDomains.length}域，压力系数 ${Math.round(pressureScale * 100)}%）`,
    budgetLabel: budgetCost > 0
      ? `消耗 ${budgetCost} 推广金（${commandCategory}类，压力 ${targetPressure}%）`
      : '不消耗推广金',
  };
}

function buildTimeHorizonImpact(
  caseItem: Case,
  commandId: string,
  pressureSignals: readonly PressureSignal[],
  sharedRefs: SharedCausalRefs,
): TimeHorizonImpact[] {
  const topPressure = pressureSignals[0];
  const pressureLabel = topPressure?.label ?? '市场压力';
  const pressureMagnitude = topPressure?.magnitude ?? 50;

  const safeRefs = sharedRefs.allRefs.slice(0, 2);

  return [
    {
      horizonDays: 3,
      label: '3天短期',
      expectedOutcome: pressureMagnitude > 60
        ? `当前${pressureLabel}偏高，3天内可能继续恶化，需要立即行动。`
        : `3天内${pressureLabel}相对可控，可观察市场反应。`,
      confidence: Math.min(0.9, pressureMagnitude / 100 + 0.2),
      safeRefs,
    },
    {
      horizonDays: 7,
      label: '7天中期',
      expectedOutcome: commandId === 'cmd-price-adjustment'
        ? `调价后7天内市场反馈将显现，客户比较行为会更新。`
        : commandId === 'cmd-owner-visit'
          ? `面访后7天内业主信任和耐心预期会有明确变化。`
          : `7天内该动作的效果将体现在客户/业主反应上。`,
      confidence: Math.min(0.8, pressureMagnitude / 100 + 0.1),
      safeRefs,
    },
    {
      horizonDays: 14,
      label: '14天中长期',
      expectedOutcome: `14天内市场板块热度和竞品动态将重新评估，当前决策的影响会累积。`,
      confidence: Math.min(0.7, pressureMagnitude / 100),
      safeRefs,
    },
    {
      horizonDays: 30,
      label: '30天长期',
      expectedOutcome: `30天内成交窗口和业主耐心窗口将收窄，当前决策链的累积效果将决定成交概率。`,
      confidence: Math.min(0.6, pressureMagnitude / 100 - 0.1),
      safeRefs,
    },
  ];
}

// ── Build Org Resource ───────────────────────────────────────

function buildOrgResource(
  state: GameState,
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
  sharedRefs?: SharedCausalRefs,
  aggregatedSignals?: readonly PressureSignal[],
): OrgResourceDimension {
  // Read resource balances from ledger when available, fall back to state fields
  const energyRemaining = readResourceFromLedger(state, 'energy', state.energy);
  const budgetRemaining = readResourceFromLedger(state, 'promotionBudget', state.auxiliaryStats?.promotionBudget ?? 0);

  // Extract capacity/manager signals from causal events when knowledge available
  const causalEvents = state.worldCausalEvents ?? [];
  const capacityEvents = actorKnowledgeMap && actorKnowledgeMap.size > 0
    ? causalEvents.filter((event) => {
      const record = event as typeof event & { readonly sourceKind?: string; readonly sourceKinds?: readonly string[] };
      return record.sourceKind === 'broker_capacity_signal'
        || record.sourceKinds?.includes('broker_capacity_signal');
    })
    : [];
  const managerEvents = actorKnowledgeMap && actorKnowledgeMap.size > 0
    ? causalEvents.filter((event) => {
      const record = event as typeof event & { readonly sourceKind?: string; readonly sourceKinds?: readonly string[] };
      return record.sourceKind === 'manager_message'
        || record.sourceKinds?.includes('manager_message');
    })
    : [];
  const hasEvidence = capacityEvents.length > 0 || managerEvents.length > 0;

  // Derive energy reasoning from capacity signals when available
  const energyCapacityEvent = capacityEvents.find((event) => {
    const payload = event.payload as unknown as Record<string, unknown>;
    return payload.subtype === 'energy_depleted' || payload.subtype === 'schedule_overloaded';
  });
  const energySignal = aggregatedSignals?.find((s) => s.domain === 'service_path' || s.domain === 'rival_threat');

  const allocations: OrgResourceAllocation[] = [];

  // Energy allocation — evidence-first
  const energyPayload = energyCapacityEvent?.payload as unknown as Record<string, unknown> | undefined;
  allocations.push({
    resourceType: 'energy',
    allocated: energyRemaining > 0,
    reason: hasEvidence && energyCapacityEvent
      ? `因果链显示 ${energyPayload?.summary ?? '精力压力'}，当前精力 ${energyRemaining}。`
      : hasEvidence && energySignal
        ? `${energySignal.label} 压力 ${energySignal.magnitude}%，当前精力 ${energyRemaining}。`
        : energyRemaining > 5
          ? `当前精力 ${energyRemaining}，仍有动作空间。`
          : energyRemaining > 0
            ? `精力仅剩 ${energyRemaining}，需优先高价值动作。`
            : '今日精力已耗尽。',
    confidence: energyRemaining > 0 ? 0.9 : 0,
    safeRefs: sharedRefs?.allRefs.slice(0, 1) ?? [],
  });

  // Budget allocation — evidence-first
  const budgetCapacityEvent = capacityEvents.find((event) => {
    const payload = event.payload as unknown as Record<string, unknown>;
    return payload.subtype === 'organizational_pressure' || payload.resourceType === 'promotionBudget';
  });
  const budgetPayload = budgetCapacityEvent?.payload as unknown as Record<string, unknown> | undefined;
  allocations.push({
    resourceType: 'budget',
    allocated: budgetRemaining > 0,
    reason: hasEvidence && budgetCapacityEvent
      ? `因果链显示 ${budgetPayload?.summary ?? '推广资源压力'}，当前推广金 ${budgetRemaining} 点。`
      : budgetRemaining > 10
        ? `推广金 ${budgetRemaining} 点，仍有投放空间。`
        : budgetRemaining > 0
          ? `推广金仅剩 ${budgetRemaining} 点，需精打细算。`
          : '推广金已耗尽，无法执行高成本动作。',
    confidence: budgetRemaining > 0 ? 0.9 : 0,
    safeRefs: sharedRefs?.allRefs.slice(0, 1) ?? [],
  });

  // Manager attention (focus meeting) — evidence-first from manager_message
  const focusMeetingCases = state.cases.filter((c) => c.isFocused);
  const focusManagerEvent = managerEvents.find((event) => {
    const payload = event.payload as unknown as Record<string, unknown>;
    return payload.subtype === 'focus_case_selected' || payload.subtype === 'resource_allocated';
  });
  const managerPayload = focusManagerEvent?.payload as unknown as Record<string, unknown> | undefined;
  allocations.push({
    resourceType: 'focus_meeting_slot',
    allocated: focusMeetingCases.length > 0,
    reason: hasEvidence && focusManagerEvent
      ? `因果链显示 ${managerPayload?.summary ?? '管理层信号'}，本周聚焦会已选定 ${focusMeetingCases.length} 套房源。`
      : focusMeetingCases.length > 0
        ? `本周聚焦会已选定 ${focusMeetingCases.length} 套房源。`
        : '本周聚焦会尚未选定房源。',
    confidence: focusMeetingCases.length > 0 ? 0.8 : 0.3,
    safeRefs: sharedRefs?.allRefs.slice(0, 1) ?? [],
  });

  return {
    energyRemaining,
    budgetRemaining,
    allocations,
  };
}

// ── Top-level builder ────────────────────────────────────────

export function buildStrategicMarketDecisionProjection(
  state: GameState,
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
): StrategicPlayableMarketProjection {
  const aggregatedSignals = actorKnowledgeMap && actorKnowledgeMap.size > 0
    ? aggregatePressureSignals(actorKnowledgeMap)
    : [];

  let sharedCausalRefs: SharedCausalRefs | undefined;
  let evidenceBackedRadarItems: EvidenceBackedReason[] | undefined;

  if (actorKnowledgeMap && actorKnowledgeMap.size > 0) {
    const primaryEnvelope = buildDecisionEvidenceEnvelope(
      actorKnowledgeMap.values().next().value!,
    );
    sharedCausalRefs = buildSharedCausalRefs(primaryEnvelope);

    evidenceBackedRadarItems = [];
    for (const signal of aggregatedSignals) {
      if (signal.domain === 'market_heat' || signal.domain === 'rival_threat') {
        evidenceBackedRadarItems.push({
          displayText: signal.label,
          evidenceAvailable: true,
          safeRefs: sharedCausalRefs.allRefs.slice(0, 2),
          replayKey: sharedCausalRefs.replayKey,
          sourceRecordIds: signal.sourceRecordIds.slice(0, 3),
          confidence: signal.magnitude / 100,
          evidenceStatus: 'backed',
          beliefSourceIds: signal.beliefSourceIds,
          pressureSignalIds: [signal.signalId],
        });
      }
    }
    if (evidenceBackedRadarItems.length === 0) {
      evidenceBackedRadarItems.push(buildLegacyFallbackReason('市场信号证据不足', sharedCausalRefs.replayKey));
    }
  }

  const marketRadar = buildStrategicMarketRadar(state, aggregatedSignals, sharedCausalRefs, actorKnowledgeMap);
  const customerPool = buildStrategicCustomerPool(state, aggregatedSignals, sharedCausalRefs, actorKnowledgeMap);
  const ownerPool = buildStrategicOwnerPool(state, aggregatedSignals, sharedCausalRefs, actorKnowledgeMap);
  const topActions = buildStrategicTopActions(state, actorKnowledgeMap);
  const orgResource = buildOrgResource(state, actorKnowledgeMap, sharedCausalRefs, aggregatedSignals);

  // Competitive pressure (pass-through with evidence)
  // Five-x safe: only rival listings in actor-visible cells
  const visibleCellIds = buildActorVisibleCellWindow(state, actorKnowledgeMap);
  const rivalListings = state.marketShadow.rivalListings.filter(
    (r) => r.status === 'active' && visibleCellIds.has(r.marketCellId),
  );
  const visibleRivalEvidence = buildVisibleRivalEvidence(state, undefined, aggregatedSignals);
  const activeRivalCount = Math.max(rivalListings.length, visibleRivalEvidence.count);
  const hotRivals = rivalListings.filter((r) => r.heat > 60 || r.freshness > 60);
  const topRival = hotRivals.sort((a, b) => b.heat - a.heat)[0];
  const topRivalAction = topRival
    ? {
      headline: `${topRival.title} 竞品热度 ${Math.round(topRival.heat)}`,
      detail: topRival.freshness > 60
        ? `该竞品近期有调价或高活跃动作，分流客户注意力。`
        : `该竞品热度较高，客户可能正在对比。`,
      refs: [{ refType: 'rival-listing' as const, refId: topRival.id, refLabel: topRival.title }],
    }
    : visibleRivalEvidence.count > 0
      ? {
        headline: visibleRivalEvidence.label,
        detail: visibleRivalEvidence.description,
        refs: visibleRivalEvidence.refs,
      }
      : null;
  const avgHeat = rivalListings.length > 0
    ? rivalListings.reduce((sum, r) => sum + r.heat, 0) / rivalListings.length
    : 0;
  const fallbackPressure = visibleRivalEvidence.riskMagnitude;
  const pressureLevel: 'low' | 'moderate' | 'high' =
    Math.max(avgHeat, fallbackPressure) > 60 ? 'high' : Math.max(avgHeat, fallbackPressure) > 40 ? 'moderate' : 'low';
  const competitivePressureEvidence = sharedCausalRefs
    ? buildDimensionEvidenceFromPressure(aggregatedSignals, ['rival_threat', 'service_path'], sharedCausalRefs)
    : [];

  return {
    day: state.day,
    marketRadar,
    competitivePressure: {
      activeRivalCount,
      topRivalAction,
      pressureLevel,
      evidenceBackedPressureItems: competitivePressureEvidence,
    },
    customerPool,
    ownerPool,
    brokerOpportunity: {
      energyRemaining: readResourceFromLedger(state, 'energy', state.energy),
      budgetRemaining: readResourceFromLedger(state, 'promotionBudget', state.auxiliaryStats?.promotionBudget ?? 0),
      topActions,
    },
    orgResource,
    sharedCausalRefs,
    evidenceBackedRadarItems,
  };
}
