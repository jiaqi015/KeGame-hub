/**
 * MarketOpeningPOVProjection — 大世界 POV 投影
 *
 * 核心原则：世界里可以发生 100 件事，玩家只应该看到 5 件可行动信号。
 *
 * 本文件是只读投影，不修改世界状态。
 * 它从 GameState 的 opening snapshot + shadow market + competition + events 中
 * 投影出玩家开局需要的"市场入场简报"。
 *
 * Mother-model alignment:
 *   - POV reads the world; does not mutate it (Section 1.1)
 *   - ActorPOV is not UI state (Section 0.2)
 *   - Competition evidence flows: CompetitionEvidence → CompetitionPressureSnapshot → POV (Section 10)
 *   - Signal sources: self_sourced / relayed / observed / inferred / systemic (Section 9)
 */

import type {
  CompetitionGroup,
  GameState,
  MarketCell,
  MarketSignal,
  Opportunity,
  RivalListing,
  RivalStore,
} from '../../domain/models.js';
import { isCaseActiveByCanonicalStatus } from '../../domain/caseLifecycleStatusRead.js';
import { isOpportunityActiveByCanonicalState } from '../../domain/opportunityLifecycleStatusRead.js';

import type { ActorKnowledgeSnapshot } from '../../domain/world-model/actorKnowledgeTypes.js';
import { buildDecisionEvidenceEnvelope } from './actorKnowledgeProjection.js';
import {
  buildSharedCausalRefs,
  type SharedCausalRefs,
  type EvidenceBackedReason,
  buildLegacyFallbackReason,
} from './perfectProjectionAdapters.js';

// ---------------------------------------------------------------------------
// Types: MarketOpeningPOVProjection output contract
// ---------------------------------------------------------------------------

export type POVSignalSource = 'systemic' | 'observed' | 'inferred' | 'relayed';

export interface POVCausalRef {
  /** 引用的世界事件 / market cell / listing / acn / causal event ID */
  refType: 'market-cell' | 'rival-listing' | 'rival-store' | 'case' | 'opportunity' | 'competition-group' | 'market-signal' | 'domain-event';
  refId: string;
  refLabel: string;
}

export interface POVMarketSignal {
  rank: number;
  headline: string;
  detail: string;
  source: POVSignalSource;
  /** 信号对玩家行动的影响方向 */
  actionDirection: 'pricing' | 'promotion' | 'relationship' | 'showing' | 'negotiation';
  refs: POVCausalRef[];
}

export interface POVRivalSummary {
  label: string;
  storeType: 'same_company' | 'external_company';
  style: string;
  activeListingCount: number;
  pressureHint: string;
  topRef: POVCausalRef;
}

export interface POVCustomerLeakageRisk {
  customerId: string;
  customerLabel: string;
  riskReason: string;
  refs: POVCausalRef[];
}

export interface POVOwnerExpectationIssue {
  caseId: string;
  caseTitle: string;
  issueLabel: string;
  pressureDimension: 'price-anchor' | 'trust-gap' | 'patience-drain' | 'urgency-mismatch';
  refs: POVCausalRef[];
}

export interface POVRecommendedCut {
  direction: 'pricing' | 'promotion' | 'relationship' | 'showing' | 'negotiation';
  label: string;
  reasoning: string;
  refs: POVCausalRef[];
}

export interface POVAConnectionSummary {
  label: string;
  storeType: 'same_company' | 'external_company';
  listingCount: number;
  activeListingCount: number;
  pressureLevel: 'low' | 'medium' | 'high';
}

export interface MarketOpeningPOVProjection {
  /** 一句话说明玩家进入的是哪个市场/商圈/周期 */
  openingBrief: string;
  /** 3 个 ACN（经纪合作网络/门店联盟）的玩家可理解摘要 */
  acnSummaries: POVAConnectionSummary[];
  /** Top 5 市场信号，来自 opening snapshot / causal ledger / ecosystem policy */
  topMarketSignals: POVMarketSignal[];
  /** Top 3 竞品，不展示所有 rival */
  keyRivals: POVRivalSummary[];
  /** Top 2 客户流失风险 */
  customerLeakageRisks: POVCustomerLeakageRisk[];
  /** Top 1 业主预期问题 */
  ownerExpectationIssues: POVOwnerExpectationIssue[];
  /** 今天最该切入的 1-3 个动作方向 */
  recommendedCuts: POVRecommendedCut[];
  /** 引用证据链 */
  evidenceRefs: POVCausalRef[];
  /** Evidence-backed owner expectation issues (from DecisionEvidenceEnvelope). */
  readonly evidenceBackedOwnerIssues?: readonly EvidenceBackedReason[];
  /** Evidence-backed recommended cuts (from DecisionEvidenceEnvelope). */
  readonly evidenceBackedRecommendedCuts?: readonly EvidenceBackedReason[];
  /** Shared causal refs across all sub-projections. */
  readonly sharedCausalRefs?: SharedCausalRefs;
}

// ---------------------------------------------------------------------------
// buildMarketOpeningPOVProjection
// ---------------------------------------------------------------------------

export function buildMarketOpeningPOVProjection(
  state: GameState,
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
): MarketOpeningPOVProjection {
  const scenario = state.runContext.scenarioSnapshot.scenario;
  const marketCells = state.markets;
  const rivalStores = state.marketShadow.rivalStores;
  const rivalListings = state.marketShadow.rivalListings;
  const competitionGroups = state.competitionGroups;
  const marketSignals = state.marketShadow.marketSignals;
  const domainEvents = state.eventStore;

  const openingBrief = buildOpeningBrief(state, marketCells, scenario);
  const acnSummaries = buildACNSummaries(rivalStores, rivalListings);
  const topMarketSignals = buildTopMarketSignals(state, marketCells, rivalListings, competitionGroups, marketSignals, domainEvents);
  const keyRivals = buildKeyRivals(rivalStores, rivalListings, competitionGroups);
  const customerLeakageRisks = buildCustomerLeakageRisks(state);
  const ownerExpectationIssues = buildOwnerExpectationIssues(state, actorKnowledgeMap);
  const recommendedCuts = buildRecommendedCuts(state, topMarketSignals, keyRivals, customerLeakageRisks, ownerExpectationIssues, actorKnowledgeMap);
  const evidenceRefs = collectAllEvidenceRefs(topMarketSignals, keyRivals, customerLeakageRisks, ownerExpectationIssues, recommendedCuts);

  // Build evidence-backed fields when actorKnowledgeMap is available
  let evidenceBackedOwnerIssues: EvidenceBackedReason[] | undefined;
  let evidenceBackedRecommendedCuts: EvidenceBackedReason[] | undefined;
  let sharedCausalRefs: SharedCausalRefs | undefined;

  if (actorKnowledgeMap && actorKnowledgeMap.size > 0) {
    // Use the first available knowledge to build the envelope
    const firstKnowledge = actorKnowledgeMap.values().next().value;
    if (firstKnowledge) {
      const envelope = buildDecisionEvidenceEnvelope(firstKnowledge);
      sharedCausalRefs = buildSharedCausalRefs(envelope);

      // Evidence-backed owner issues from pressure signals
      evidenceBackedOwnerIssues = [];
      for (const issue of ownerExpectationIssues) {
        const matchingSignal = envelope.pressureSignals.find((s) => {
          if (issue.pressureDimension === 'price-anchor') return s.domain === 'price_anchor';
          if (issue.pressureDimension === 'trust-gap') return s.domain === 'broker_trust';
          if (issue.pressureDimension === 'patience-drain') return s.domain === 'owner_readiness';
          if (issue.pressureDimension === 'urgency-mismatch') return s.domain === 'owner_readiness';
          return false;
        });
        if (matchingSignal) {
          evidenceBackedOwnerIssues.push({
            displayText: issue.issueLabel,
            evidenceAvailable: true,
            safeRefs: sharedCausalRefs.allRefs.slice(0, 2),
            replayKey: sharedCausalRefs.replayKey,
            sourceRecordIds: matchingSignal.sourceRecordIds.slice(0, 3),
            confidence: matchingSignal.magnitude / 100,
            evidenceStatus: 'backed',
            beliefSourceIds: matchingSignal.beliefSourceIds,
            pressureSignalIds: [matchingSignal.signalId],
          });
        } else {
          evidenceBackedOwnerIssues.push(buildLegacyFallbackReason(issue.issueLabel, sharedCausalRefs.replayKey));
        }
      }

      // Evidence-backed recommended cuts from pressure signals
      evidenceBackedRecommendedCuts = [];
      for (const cut of recommendedCuts) {
        const matchingSignal = envelope.pressureSignals.find((s) => {
          if (cut.direction === 'pricing') return s.domain === 'price_anchor' || s.domain === 'rival_threat';
          if (cut.direction === 'relationship') return s.domain === 'broker_trust' || s.domain === 'owner_readiness';
          if (cut.direction === 'showing') return s.domain === 'customer_seriousness';
          if (cut.direction === 'promotion') return s.domain === 'market_heat' || s.domain === 'rival_threat';
          if (cut.direction === 'negotiation') return s.domain === 'deal_closeability';
          return false;
        });
        if (matchingSignal) {
          evidenceBackedRecommendedCuts.push({
            displayText: `${cut.label}：${cut.reasoning}`,
            evidenceAvailable: true,
            safeRefs: sharedCausalRefs.allRefs.slice(0, 2),
            replayKey: sharedCausalRefs.replayKey,
            sourceRecordIds: matchingSignal.sourceRecordIds.slice(0, 3),
            confidence: matchingSignal.magnitude / 100,
            evidenceStatus: 'backed',
            beliefSourceIds: matchingSignal.beliefSourceIds,
            pressureSignalIds: [matchingSignal.signalId],
          });
        } else {
          evidenceBackedRecommendedCuts.push(buildLegacyFallbackReason(`${cut.label}：${cut.reasoning}`, sharedCausalRefs.replayKey));
        }
      }
    }
  }

  return {
    openingBrief,
    acnSummaries,
    topMarketSignals,
    keyRivals,
    customerLeakageRisks,
    ownerExpectationIssues,
    recommendedCuts,
    evidenceRefs,
    evidenceBackedOwnerIssues,
    evidenceBackedRecommendedCuts,
    sharedCausalRefs,
  };
}

// ---------------------------------------------------------------------------
// Opening Brief
// ---------------------------------------------------------------------------

function buildOpeningBrief(
  state: GameState,
  marketCells: MarketCell[],
  scenario: GameState['runContext']['scenarioSnapshot']['scenario'],
): string {
  const marketNames = marketCells.map((cell) => cell.name).join('、');
  const dayRange = `${state.maxDay} 天`;
  const caseCount = state.cases.length;
  const rivalCount = state.marketShadow.rivalListings.filter((r) => r.status === 'active').length;

  if (!marketNames) {
    return `你在${scenario.name}中经营 ${caseCount} 套房源，周期 ${dayRange}，市场有 ${rivalCount} 套竞品在场。`;
  }

  return `你进入${marketNames}商圈，经营 ${caseCount} 套房源，周期 ${dayRange}，${rivalCount} 套竞品正在分流客户注意力。`;
}

// ---------------------------------------------------------------------------
// ACN Summaries (Brokerage Network / 门店联盟)
// ---------------------------------------------------------------------------

function buildACNSummaries(
  rivalStores: RivalStore[],
  rivalListings: RivalListing[],
): POVAConnectionSummary[] {
  // Group rival stores by type to form ACN clusters
  const sameCompany = rivalStores.filter((s) => s.type === 'same_company');
  const externalCompany = rivalStores.filter((s) => s.type === 'external_company');

  const summaries: POVAConnectionSummary[] = [];

  // ACN 1: 本品牌（同公司）
  if (sameCompany.length > 0) {
    const listings = rivalListings.filter((l) =>
      sameCompany.some((s) => s.id === l.storeId) && l.status === 'active',
    );
    const avgHeat = listings.length > 0
      ? listings.reduce((sum, l) => sum + l.heat, 0) / listings.length
      : 0;
    summaries.push({
      label: `本品牌联盟 (${sameCompany.map((s) => s.name).join('、')})`,
      storeType: 'same_company',
      listingCount: listings.length,
      activeListingCount: listings.filter((l) => l.status === 'active').length,
      pressureLevel: avgHeat > 65 ? 'high' : avgHeat > 40 ? 'medium' : 'low',
    });
  }

  // ACN 2+: 外部品牌，按 style 分组
  const styleGroups = groupByStyle(externalCompany);
  for (const [style, stores] of styleGroups) {
    const listings = rivalListings.filter((l) =>
      stores.some((s) => s.id === l.storeId) && l.status === 'active',
    );
    const avgHeat = listings.length > 0
      ? listings.reduce((sum, l) => sum + l.heat, 0) / listings.length
      : 0;
    summaries.push({
      label: `${styleLabel(style)}联盟 (${stores.map((s) => s.name).join('、')})`,
      storeType: 'external_company',
      listingCount: listings.length,
      activeListingCount: listings.filter((l) => l.status === 'active').length,
      pressureLevel: avgHeat > 65 ? 'high' : avgHeat > 40 ? 'medium' : 'low',
    });
  }

  // 保证至少 3 个 ACN 摘要
  while (summaries.length < 3) {
    summaries.push({
      label: `市场背景势力 ${summaries.length + 1}`,
      storeType: 'external_company',
      listingCount: 0,
      activeListingCount: 0,
      pressureLevel: 'low',
    });
  }

  return summaries.slice(0, 3);
}

function groupByStyle(stores: RivalStore[]): Map<string, RivalStore[]> {
  const groups = new Map<string, RivalStore[]>();
  for (const store of stores) {
    const existing = groups.get(store.style) || [];
    existing.push(store);
    groups.set(store.style, existing);
  }
  return groups;
}

function styleLabel(style: string): string {
  if (style === 'aggressive') return '进攻型';
  if (style === 'steady') return '稳健型';
  if (style === 'relationship') return '关系型';
  if (style === 'traffic') return '流量型';
  return style;
}

// ---------------------------------------------------------------------------
// Top 5 Market Signals
// ---------------------------------------------------------------------------

function buildTopMarketSignals(
  state: GameState,
  marketCells: MarketCell[],
  rivalListings: RivalListing[],
  competitionGroups: CompetitionGroup[],
  marketSignals: MarketSignal[],
  domainEvents: GameState['eventStore'],
): POVMarketSignal[] {
  const signals: POVMarketSignal[] = [];

  // Signal 1: 竞品降价/竞争压力信号 (from competition groups + rival listings)
  for (const group of competitionGroups) {
    const rivalMembers = rivalListings.filter(
      (r) => r.status === 'active' && group.members.some((m) => r.linkedCaseId === m || r.marketCellId === m),
    );
    if (rivalMembers.length > 0) {
      const playerMembers = state.cases.filter((c) => group.members.includes(c.id) && isCaseActiveByCanonicalStatus(state, c));
      if (playerMembers.length > 0) {
        const strongestRival = [...rivalMembers].sort((a, b) => b.heat - a.heat)[0];
        const rivalRepricings = rivalMembers.filter((r) => r.freshness > 60);
        signals.push({
          rank: 0,
          headline: rivalRepricings.length > 0
            ? `${group.name} 有竞品刚调价，客户正在比较`
            : `${group.name} 竞品在场，分流客户注意力`,
          detail: `${rivalMembers.length} 套竞品 vs 你的 ${playerMembers.length} 套。最强竞品热度 ${Math.round(strongestRival.heat)}。`,
          source: 'observed',
          actionDirection: 'pricing',
          refs: [
            { refType: 'competition-group', refId: group.id, refLabel: group.name },
            { refType: 'rival-listing', refId: strongestRival.id, refLabel: strongestRival.title },
            ...playerMembers.slice(0, 2).map((c) => ({ refType: 'case' as const, refId: c.id, refLabel: c.title })),
          ],
        });
      }
    }
  }

  // Signal 2: 市场需求信号 (from market signals)
  for (const signal of marketSignals.slice(0, 3)) {
    signals.push({
      rank: 0,
      headline: signal.title,
      detail: signal.message,
      source: 'systemic',
      actionDirection: signal.type === 'buyer_demand' ? 'promotion' : signal.type === 'seller_intent' ? 'relationship' : 'showing',
      refs: [
        { refType: 'market-signal', refId: signal.id, refLabel: signal.title },
        ...(signal.district ? [{ refType: 'market-cell' as const, refId: signal.district, refLabel: signal.district }] : []),
      ],
    });
  }

  // Signal 3: 市场热度/竞争压力信号 (from market cells)
  for (const cell of marketCells) {
    if (cell.competitivePressure > 55 || cell.demandHeat > 60) {
      const playerCasesInCell = state.cases.filter((c) => c.marketCellId === cell.id && isCaseActiveByCanonicalStatus(state, c));
      if (playerCasesInCell.length > 0) {
        signals.push({
          rank: 0,
          headline: cell.competitivePressure > 55
            ? `${cell.name} 同类房竞争激烈`
            : `${cell.name} 客户需求升温`,
          detail: cell.competitivePressure > 55
            ? `竞争压力 ${Math.round(cell.competitivePressure)}，你在这里有 ${playerCasesInCell.length} 套房源需要注意定价策略。`
            : `需求热度 ${Math.round(cell.demandHeat)}，是推进客户带看的好窗口。`,
          source: 'inferred',
          actionDirection: cell.competitivePressure > 55 ? 'pricing' : 'showing',
          refs: [
            { refType: 'market-cell', refId: cell.id, refLabel: cell.name },
            ...playerCasesInCell.slice(0, 2).map((c) => ({ refType: 'case' as const, refId: c.id, refLabel: c.title })),
          ],
        });
      }
    }
  }

  // Signal 3b: 市场环境感知信号（相邻商圈，玩家暂无房源但大世界在运转）
  // 玩家没有在这些 market cell 经营，但它们仍然对客户池和竞品有溢出影响
  for (const cell of marketCells) {
    const playerCasesInCell = state.cases.filter((c) => c.marketCellId === cell.id && isCaseActiveByCanonicalStatus(state, c));
    if (playerCasesInCell.length === 0 && (cell.demandHeat > 65 || cell.competitivePressure > 50)) {
      const cellRivalListings = rivalListings.filter((l) => l.marketCellId === cell.id && l.status === 'active');
      signals.push({
        rank: 0,
        headline: `${cell.name} 市场在动，客户注意力可能外溢`,
        detail: cellRivalListings.length > 0
          ? `${cell.name} 有 ${cellRivalListings.length} 套竞品在场，需求热度 ${Math.round(cell.demandHeat)}，部分客户可能从你的商圈分流。`
          : `${cell.name} 需求热度 ${Math.round(cell.demandHeat)}，周边商圈客户可能有购买力溢出。`,
        source: 'systemic',
        actionDirection: 'showing' as const,
        refs: [
          { refType: 'market-cell' as const, refId: cell.id, refLabel: cell.name },
          ...cellRivalListings.slice(0, 1).map((l) => ({ refType: 'rival-listing' as const, refId: l.id, refLabel: l.title })),
        ],
      });
    }
  }

  // Signal 4: 域事件中的竞争/市场信号 (from causal ledger - domain events)
  // Uses actual DomainEventKind values: market_event, case_lost_to_rival, opportunity_closed
  const competitionEvents = domainEvents.filter(
    (e) => e.kind === 'market_event' || e.kind === 'case_lost_to_rival',
  ).slice(0, 3);
  for (const event of competitionEvents) {
    signals.push({
      rank: 0,
      headline: event.title,
      detail: event.detail,
      source: 'relayed',
      actionDirection: 'negotiation',
      refs: [
        { refType: 'domain-event', refId: event.id, refLabel: event.title },
      ],
    });
  }

  // Signal 5: 公司内部压力信号
  const companyPressure = state.marketShadow.companyPressure;
  if (companyPressure.sharedLeadPressure > 40 || companyPressure.internalCompetitionHeat > 50) {
    signals.push({
      rank: 0,
      headline: '公司内部资源竞争加剧',
      detail: `共线压力 ${Math.round(companyPressure.sharedLeadPressure)}，内部竞争热度 ${Math.round(companyPressure.internalCompetitionHeat)}。需要更快推进重点房源。`,
      source: 'systemic',
      actionDirection: 'promotion',
      refs: [],
    });
  }

  // Deduplicate by headline and rank top 5
  const seen = new Set<string>();
  const unique = signals.filter((s) => {
    if (seen.has(s.headline)) return false;
    seen.add(s.headline);
    return true;
  });

  return unique.slice(0, 5).map((s, i) => ({ ...s, rank: i + 1 }));
}

// ---------------------------------------------------------------------------
// Key Rivals (Top 3)
// ---------------------------------------------------------------------------

function buildKeyRivals(
  rivalStores: RivalStore[],
  rivalListings: RivalListing[],
  competitionGroups: CompetitionGroup[],
): POVRivalSummary[] {
  // Score each store by total heat of their active listings
  const storeScores = new Map<string, { store: RivalStore; totalHeat: number; activeCount: number }>();

  for (const store of rivalStores) {
    const activeListings = rivalListings.filter((l) => l.storeId === store.id && l.status === 'active');
    const totalHeat = activeListings.reduce((sum, l) => sum + l.heat, 0);
    storeScores.set(store.id, { store, totalHeat, activeCount: activeListings.length });
  }

  const ranked = [...storeScores.values()]
    .filter((entry) => entry.activeCount > 0)
    .sort((a, b) => b.totalHeat - a.totalHeat)
    .slice(0, 3);

  return ranked.map((entry) => {
    const topListing = rivalListings
      .filter((l) => l.storeId === entry.store.id && l.status === 'active')
      .sort((a, b) => b.heat - a.heat)[0];

    return {
      label: entry.store.name,
      storeType: entry.store.type,
      style: styleLabel(entry.store.style),
      activeListingCount: entry.activeCount,
      pressureHint: entry.totalHeat > 200
        ? '高压竞品，正在强势分流客户'
        : entry.totalHeat > 100
          ? '中等压力，需要关注客户流向'
          : '低压力，但不能掉以轻心',
      topRef: topListing
        ? { refType: 'rival-listing', refId: topListing.id, refLabel: topListing.title }
        : { refType: 'rival-store', refId: entry.store.id, refLabel: entry.store.name },
    };
  });
}

// ---------------------------------------------------------------------------
// Customer Leakage Risks (Top 2)
// ---------------------------------------------------------------------------

function buildCustomerLeakageRisks(state: GameState): POVCustomerLeakageRisk[] {
  const risks: POVCustomerLeakageRisk[] = [];

  const resolveCaseTitle = (caseId: string): string =>
    state.cases.find((c) => c.id === caseId)?.title || caseId;

  const buildOppLabel = (opp: Opportunity): string => {
    const caseTitle = resolveCaseTitle(opp.caseId);
    return `${opp.customerName} → ${caseTitle}`;
  };

  // 从 customerStates 找流失风险最高的客户
  for (const cs of state.customerStates) {
    if (cs.churnRisk > 55 || cs.fatigue > 65) {
      const customer = state.customers.find((c) => c.id === cs.customerId);
      const activeOpps = state.opportunities.filter(
        (o) => o.customerId === cs.customerId && isOpportunityActiveByCanonicalState(state, o),
      );
      const bestOpp = [...activeOpps].sort((a, b) => b.intent - a.intent)[0];

      if (bestOpp) {
        const caseTitle = resolveCaseTitle(bestOpp.caseId);
        risks.push({
          customerId: cs.customerId,
          customerLabel: customer?.name || bestOpp.customerName || cs.customerId,
          riskReason: cs.churnRisk > 55
            ? `流失风险 ${Math.round(cs.churnRisk)}，可能转向竞品`
            : `疲劳度 ${Math.round(cs.fatigue)}，跟进频率需要调整`,
          refs: [
            { refType: 'opportunity', refId: bestOpp.id, refLabel: buildOppLabel(bestOpp) },
            ...(bestOpp.caseId ? [{ refType: 'case' as const, refId: bestOpp.caseId, refLabel: caseTitle }] : []),
          ],
        });
      }
    }
  }

  // 从 opportunities 找 daysLeft 低的
  const urgentOpps = state.opportunities
    .filter((o) => isOpportunityActiveByCanonicalState(state, o) && o.daysLeft <= 5 && o.intent > 40)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 2);

  for (const opp of urgentOpps) {
    if (!risks.some((r) => r.customerId === opp.customerId)) {
      risks.push({
        customerId: opp.customerId || opp.id,
        customerLabel: opp.customerName || '匿名客户',
        riskReason: `只剩 ${opp.daysLeft} 天窗口，意向 ${Math.round(opp.intent)}，不推进就会流失`,
        refs: [
          { refType: 'opportunity', refId: opp.id, refLabel: buildOppLabel(opp) },
        ],
      });
    }
  }

  return risks.slice(0, 2);
}

// ---------------------------------------------------------------------------
// Owner Expectation Issues (Top 1)
// ---------------------------------------------------------------------------

function buildOwnerExpectationIssues(
  state: GameState,
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
): POVOwnerExpectationIssue[] {
  const issues: POVOwnerExpectationIssue[] = [];

  for (const caseItem of state.cases) {
    if (!isCaseActiveByCanonicalStatus(state, caseItem)) continue;

    // When actorKnowledgeMap is available, derive from belief domains
    const knowledge = actorKnowledgeMap?.get(caseItem.id);
    if (knowledge) {
      const envelope = buildDecisionEvidenceEnvelope(knowledge);

      // Derive from pressure signals (belief-backed)
      for (const signal of envelope.pressureSignals) {
        if (signal.domain === 'price_anchor' && signal.magnitude >= 40) {
          issues.push({
            caseId: caseItem.id,
            caseTitle: caseItem.title,
            issueLabel: `价格定位压力 ${signal.magnitude}%，业主价格锚定偏高`,
            pressureDimension: 'price-anchor',
            refs: [{ refType: 'case', refId: caseItem.id, refLabel: caseItem.title }],
          });
        }
        if (signal.domain === 'broker_trust' && signal.magnitude >= 40) {
          issues.push({
            caseId: caseItem.id,
            caseTitle: caseItem.title,
            issueLabel: `信任关系压力 ${signal.magnitude}%，业主对你或市场信心不足`,
            pressureDimension: 'trust-gap',
            refs: [{ refType: 'case', refId: caseItem.id, refLabel: caseItem.title }],
          });
        }
        if (signal.domain === 'owner_readiness' && signal.magnitude >= 50) {
          issues.push({
            caseId: caseItem.id,
            caseTitle: caseItem.title,
            issueLabel: `业主准备度压力 ${signal.magnitude}%，耐心或紧迫感需要关注`,
            pressureDimension: 'patience-drain',
            refs: [{ refType: 'case', refId: caseItem.id, refLabel: caseItem.title }],
          });
        }
      }

      // If no pressure signals produced an issue, skip (don't fall back to legacy)
      if (issues.length > 0) continue;
    }

    // Legacy fallback: direct reads from caseItem (only when no knowledge)
    // 价格锚定过高
    if (caseItem.priceGapPct > 12) {
      issues.push({
        caseId: caseItem.id,
        caseTitle: caseItem.title,
        issueLabel: `挂牌价高出市场 ${Math.round(caseItem.priceGapPct)}%，业主价格锚定偏高`,
        pressureDimension: 'price-anchor',
        refs: [{ refType: 'case', refId: caseItem.id, refLabel: caseItem.title }],
      });
    }

    // 信任偏低
    if (caseItem.trust < 50) {
      issues.push({
        caseId: caseItem.id,
        caseTitle: caseItem.title,
        issueLabel: `信任 ${Math.round(caseItem.trust)}，业主对你或市场信心不足`,
        pressureDimension: 'trust-gap',
        refs: [{ refType: 'case', refId: caseItem.id, refLabel: caseItem.title }],
      });
    }

    // 耐心即将耗尽
    if (caseItem.patience < 35) {
      issues.push({
        caseId: caseItem.id,
        caseTitle: caseItem.title,
        issueLabel: `耐心 ${Math.round(caseItem.patience)}，业主可能随时撤回或委托他人`,
        pressureDimension: 'patience-drain',
        refs: [{ refType: 'case', refId: caseItem.id, refLabel: caseItem.title }],
      });
    }

    // 紧迫感与策略不匹配
    if (caseItem.urgency > 70 && caseItem.askPrice > caseItem.marketPrice * 1.08) {
      issues.push({
        caseId: caseItem.id,
        caseTitle: caseItem.title,
        issueLabel: `业主很急但挂牌偏高，需要尽快管理预期`,
        pressureDimension: 'urgency-mismatch',
        refs: [{ refType: 'case', refId: caseItem.id, refLabel: caseItem.title }],
      });
    }
  }

  // 按严重程度排序，取 Top 1
  const severityOrder: Record<string, number> = {
    'patience-drain': 1,
    'urgency-mismatch': 2,
    'trust-gap': 3,
    'price-anchor': 4,
  };
  issues.sort((a, b) => (severityOrder[a.pressureDimension] ?? 5) - (severityOrder[b.pressureDimension] ?? 5));

  return issues.slice(0, 1);
}

// ---------------------------------------------------------------------------
// Recommended Cuts (1-3 action directions)
// ---------------------------------------------------------------------------

function buildRecommendedCuts(
  state: GameState,
  signals: POVMarketSignal[],
  rivals: POVRivalSummary[],
  leakageRisks: POVCustomerLeakageRisk[],
  ownerIssues: POVOwnerExpectationIssue[],
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>,
): POVRecommendedCut[] {
  const cuts: POVRecommendedCut[] = [];
  const addedDirections = new Set<string>();

  // 从 owner issues 推荐
  for (const issue of ownerIssues) {
    if (issue.pressureDimension === 'price-anchor' || issue.pressureDimension === 'urgency-mismatch') {
      if (!addedDirections.has('pricing')) {
        cuts.push({
          direction: 'pricing',
          label: '管理业主价格预期',
          reasoning: `${issue.caseTitle}: ${issue.issueLabel}`,
          refs: issue.refs,
        });
        addedDirections.add('pricing');
      }
    }
    if (issue.pressureDimension === 'trust-gap') {
      if (!addedDirections.has('relationship')) {
        cuts.push({
          direction: 'relationship',
          label: '修复业主信任',
          reasoning: `${issue.caseTitle}: ${issue.issueLabel}`,
          refs: issue.refs,
        });
        addedDirections.add('relationship');
      }
    }
  }

  // 从客户流失风险推荐
  if (leakageRisks.length > 0 && !addedDirections.has('showing')) {
    cuts.push({
      direction: 'showing',
      label: '推进关键客户带看',
      reasoning: `${leakageRisks[0].customerLabel}: ${leakageRisks[0].riskReason}`,
      refs: leakageRisks[0].refs,
    });
    addedDirections.add('showing');
  }

  // 从竞品信号推荐
  const pricingSignals = signals.filter((s) => s.actionDirection === 'pricing');
  if (pricingSignals.length > 0 && !addedDirections.has('promotion')) {
    cuts.push({
      direction: 'promotion',
      label: '用聚焦会对抗竞品分流',
      reasoning: pricingSignals[0].headline,
      refs: pricingSignals[0].refs,
    });
    addedDirections.add('promotion');
  }

  // 确保至少有 1 个推荐
  if (cuts.length === 0) {
    const activeCases = state.cases.filter((c) => isCaseActiveByCanonicalStatus(state, c));
    if (activeCases.length > 0) {
      // When knowledge available, use belief-backed recommendation
      if (actorKnowledgeMap && actorKnowledgeMap.size > 0) {
        const firstKnowledge = actorKnowledgeMap.values().next().value;
        if (firstKnowledge) {
          const envelope = buildDecisionEvidenceEnvelope(firstKnowledge);
          if (envelope.recommendedCommand) {
            cuts.push({
              direction: 'relationship',
              label: envelope.recommendedCommand.command.name,
              reasoning: envelope.explanation.summary,
              refs: envelope.causalRefs.slice(0, 2).map((r) => ({
                refType: 'market-signal' as const,
                refId: r.refId,
                refLabel: r.refLabel,
              })),
            });
          }
        }
      }

      // Legacy fallback if no knowledge-derived cut
      if (cuts.length === 0) {
        const lowestTrust = [...activeCases].sort((a, b) => a.trust - b.trust)[0];
        cuts.push({
          direction: 'relationship',
          label: '优先维护重点房源业主',
          reasoning: `${lowestTrust.title} 信任 ${Math.round(lowestTrust.trust)}，需要尽快沟通。`,
          refs: [{ refType: 'case', refId: lowestTrust.id, refLabel: lowestTrust.title }],
        });
      }
    }
  }

  return cuts.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Evidence Refs collection
// ---------------------------------------------------------------------------

function collectAllEvidenceRefs(
  signals: POVMarketSignal[],
  rivals: POVRivalSummary[],
  leakageRisks: POVCustomerLeakageRisk[],
  ownerIssues: POVOwnerExpectationIssue[],
  cuts: POVRecommendedCut[],
): POVCausalRef[] {
  const allRefs: POVCausalRef[] = [];
  const seen = new Set<string>();

  const addRef = (ref: POVCausalRef) => {
    const key = `${ref.refType}:${ref.refId}`;
    if (!seen.has(key)) {
      seen.add(key);
      allRefs.push(ref);
    }
  };

  for (const signal of signals) {
    for (const ref of signal.refs) addRef(ref);
  }
  for (const rival of rivals) {
    addRef(rival.topRef);
  }
  for (const risk of leakageRisks) {
    for (const ref of risk.refs) addRef(ref);
  }
  for (const issue of ownerIssues) {
    for (const ref of issue.refs) addRef(ref);
  }
  for (const cut of cuts) {
    for (const ref of cut.refs) addRef(ref);
  }

  return allRefs;
}
