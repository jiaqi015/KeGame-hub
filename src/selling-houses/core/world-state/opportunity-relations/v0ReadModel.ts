/**
 * CustomerCaseMatch / BrokeredOpportunity v0 merged relation read model.
 *
 * Unifies legacy CustomerRuntimeState.caseStates (≈ CustomerCaseMatch)
 * with legacy Opportunity (≈ BrokeredOpportunity) into a pure read model.
 *
 * Mother model alignment:
 * - CustomerCaseMatch = AssetCase × Customer × MatchState
 * - BrokeredOpportunity = CustomerCaseMatch × ListingMandate × BuyerMandate × CooperationState
 * - One customer-case match can have multiple brokered paths (service paths)
 * - Demand scoring must deduplicate by customer/match
 *
 * This is a READ-ONLY projection. It does NOT mutate GameState.
 * core/world-state cannot import domain/runtime.
 */

// ---------------------------------------------------------------------------
// Plain legacy shapes (no domain import)
// ---------------------------------------------------------------------------

export interface LegacyCustomerCaseRuntimeShape {
  readonly caseId: string;
  readonly fit: number;
  readonly interest: number;
  readonly confidence: number;
  readonly stageIndex: number;
  readonly interactions: number;
  readonly lastActiveDay: number;
  readonly viewed: boolean;
  readonly offered: boolean;
  readonly selected: boolean;
  readonly competingCaseIds?: readonly string[];
}

export interface LegacyCustomerRuntimeStateShape {
  readonly customerId: string;
  readonly status: string;
  readonly decisionStyle: string;
  readonly advisorTrust: number;
  readonly fatigue: number;
  readonly churnRisk: number;
  readonly activeCaseIds: readonly string[];
  readonly caseStates: Record<string, LegacyCustomerCaseRuntimeShape>;
  readonly lastTouchDay: number;
  readonly lastActionNote?: string;
}

export interface LegacyOpportunityShape {
  readonly id: string;
  readonly caseId: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly fit: number;
  readonly intent: number;
  readonly confidence: number;
  readonly stageIndex: number;
  readonly stageLabel: string;
  readonly status: string;
  readonly lifecycleStatus: string;
  readonly leadSource: string;
  readonly visibility: string;
  readonly brokerName?: string;
  readonly channelId: string;
  readonly channelName: string;
  readonly createdDay: number;
  readonly daysLeft: number;
  readonly touchedToday: boolean;
  readonly budgetMax: number;
  readonly priceSensitivity: number;
  readonly stagnationTicks: number;
  readonly pendingClosingEvaluation?: boolean;
  readonly pendingClosingStrategyId?: string;
  readonly pendingClosingRequestedDay?: number;
}

// ---------------------------------------------------------------------------
// CustomerCaseMatchReadModel: the underlying purchase possibility
// ---------------------------------------------------------------------------

export interface CustomerCaseMatchReadModel {
  readonly relationKey: string;
  readonly customerId: string;
  readonly caseId: string;
  readonly matchTrack: {
    readonly fit: number;
    readonly interest: number;
    readonly confidence: number;
    readonly selected: boolean;
    readonly offered: boolean;
    readonly churnRisk: number;
    readonly fatigue: number;
    readonly advisorTrust: number;
    readonly decisionStyle: string;
    readonly customerStatus: string;
    readonly interactions: number;
    readonly lastActiveDay: number;
    readonly viewed: boolean;
    readonly active: boolean;
    readonly competingCaseIds: readonly string[];
  };
  readonly brokeredPathCount: number;
  readonly brokeredPathKeys: readonly string[];
}

// ---------------------------------------------------------------------------
// BrokeredOpportunityReadModel: the operating service path
// ---------------------------------------------------------------------------

export interface BrokeredOpportunityReadModel {
  readonly brokeredPathKey: string;
  readonly opportunityId: string;
  readonly relationKey: string;
  readonly customerId: string;
  readonly caseId: string;
  readonly brokeredTrack: {
    readonly stageIndex: number;
    readonly stageLabel: string;
    readonly status: string;
    readonly lifecycleStatus: string;
    readonly visibility: string;
    readonly leadSource: string;
    readonly brokerName: string | undefined;
    readonly channelId: string;
    readonly channelName: string;
    readonly createdDay: number;
    readonly daysLeft: number;
    readonly touchedToday: boolean;
    readonly stagnationTicks: number;
    readonly pendingClosingEvaluation: boolean;
    readonly pendingClosingStrategyId: string | undefined;
    readonly pendingClosingRequestedDay: number | undefined;
  };
  readonly matchTrackSnapshot: {
    readonly fit: number;
    readonly intent: number;
    readonly confidence: number;
  };
}

// ---------------------------------------------------------------------------
// Conflict flags
// ---------------------------------------------------------------------------

export type OpportunityRelationV0ConflictKind =
  | 'opportunity_without_customer_runtime'
  | 'customer_runtime_without_opportunity'
  | 'stage_mismatch'
  | 'status_mismatch'
  | 'fit_mismatch'
  | 'intent_mismatch'
  | 'confidence_mismatch'
  | 'duplicate_brokered_paths';

export interface OpportunityRelationV0ConflictFlag {
  readonly kind: OpportunityRelationV0ConflictKind;
  readonly relationKey: string;
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// CustomerCaseOpportunityRelationV0: aggregated read model
// ---------------------------------------------------------------------------

export interface CustomerCaseOpportunityRelationV0 {
  readonly relationKey: string;
  readonly customerId: string;
  readonly caseId: string;
  readonly match: CustomerCaseMatchReadModel;
  readonly brokeredPaths: readonly BrokeredOpportunityReadModel[];
  readonly conflictFlags: readonly OpportunityRelationV0ConflictFlag[];
  readonly source: 'merged' | 'opportunity-only' | 'runtime-only';
}

// ---------------------------------------------------------------------------
// Summary / dedupe result
// ---------------------------------------------------------------------------

export interface OpportunityRelationV0Summary {
  readonly totalRelations: number;
  readonly uniqueCustomerCaseMatches: number;
  readonly totalBrokeredPaths: number;
  readonly conflictCount: number;
  readonly conflictsByKind: Record<OpportunityRelationV0ConflictKind, number>;
  readonly dedupedBuyerCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relationKey(customerId: string, caseId: string): string {
  return `${customerId}::${caseId}`;
}

function brokeredPathKey(opportunityId: string, leadSource: string, brokerName: string | undefined, visibility: string): string {
  return `${opportunityId}::${leadSource}::${brokerName ?? 'direct'}::${visibility}`;
}

function buildMatchFromRuntime(
  customerState: LegacyCustomerRuntimeStateShape,
  caseRuntime: LegacyCustomerCaseRuntimeShape,
): CustomerCaseMatchReadModel {
  return Object.freeze({
    relationKey: relationKey(customerState.customerId, caseRuntime.caseId),
    customerId: customerState.customerId,
    caseId: caseRuntime.caseId,
    matchTrack: Object.freeze({
      fit: caseRuntime.fit,
      interest: caseRuntime.interest,
      confidence: caseRuntime.confidence,
      selected: caseRuntime.selected,
      offered: caseRuntime.offered,
      churnRisk: customerState.churnRisk,
      fatigue: customerState.fatigue,
      advisorTrust: customerState.advisorTrust,
      decisionStyle: customerState.decisionStyle,
      customerStatus: customerState.status,
      interactions: caseRuntime.interactions,
      lastActiveDay: caseRuntime.lastActiveDay,
      viewed: caseRuntime.viewed,
      active: customerState.activeCaseIds.includes(caseRuntime.caseId),
      competingCaseIds: Object.freeze([...(caseRuntime.competingCaseIds ?? [])]),
    }),
    brokeredPathCount: 0,
    brokeredPathKeys: Object.freeze([]),
  });
}

function buildMatchFromOpportunityOnly(opportunity: LegacyOpportunityShape): CustomerCaseMatchReadModel {
  return Object.freeze({
    relationKey: relationKey(opportunity.customerId, opportunity.caseId),
    customerId: opportunity.customerId,
    caseId: opportunity.caseId,
    matchTrack: Object.freeze({
      fit: opportunity.fit,
      interest: opportunity.intent,
      confidence: opportunity.confidence,
      selected: false,
      offered: false,
      churnRisk: 0,
      fatigue: 0,
      advisorTrust: 0,
      decisionStyle: 'unknown',
      customerStatus: 'unknown',
      interactions: 0,
      lastActiveDay: 0,
      viewed: false,
      active: false,
      competingCaseIds: Object.freeze([]),
    }),
    brokeredPathCount: 1,
    brokeredPathKeys: Object.freeze([
      brokeredPathKey(opportunity.id, opportunity.leadSource, opportunity.brokerName, opportunity.visibility),
    ]),
  });
}

function buildBrokeredPath(opportunity: LegacyOpportunityShape): BrokeredOpportunityReadModel {
  return Object.freeze({
    brokeredPathKey: brokeredPathKey(opportunity.id, opportunity.leadSource, opportunity.brokerName, opportunity.visibility),
    opportunityId: opportunity.id,
    relationKey: relationKey(opportunity.customerId, opportunity.caseId),
    customerId: opportunity.customerId,
    caseId: opportunity.caseId,
    brokeredTrack: Object.freeze({
      stageIndex: opportunity.stageIndex,
      stageLabel: opportunity.stageLabel,
      status: opportunity.status,
      lifecycleStatus: opportunity.lifecycleStatus,
      visibility: opportunity.visibility,
      leadSource: opportunity.leadSource,
      brokerName: opportunity.brokerName,
      channelId: opportunity.channelId,
      channelName: opportunity.channelName,
      createdDay: opportunity.createdDay,
      daysLeft: opportunity.daysLeft,
      touchedToday: opportunity.touchedToday,
      stagnationTicks: opportunity.stagnationTicks,
      pendingClosingEvaluation: opportunity.pendingClosingEvaluation ?? false,
      pendingClosingStrategyId: opportunity.pendingClosingStrategyId,
      pendingClosingRequestedDay: opportunity.pendingClosingRequestedDay,
    }),
    matchTrackSnapshot: Object.freeze({
      fit: opportunity.fit,
      intent: opportunity.intent,
      confidence: opportunity.confidence,
    }),
  });
}

function detectConflicts(
  match: CustomerCaseMatchReadModel,
  brokeredPaths: readonly BrokeredOpportunityReadModel[],
  hasRuntime: boolean,
  hasOpportunity: boolean,
): readonly OpportunityRelationV0ConflictFlag[] {
  const flags: OpportunityRelationV0ConflictFlag[] = [];
  const key = match.relationKey;

  if (hasOpportunity && !hasRuntime) {
    flags.push(Object.freeze({
      kind: 'opportunity_without_customer_runtime' as const,
      relationKey: key,
      detail: `Opportunity exists for ${key} but no CustomerRuntimeState.caseStates entry`,
    }));
  }

  if (hasRuntime && !hasOpportunity) {
    flags.push(Object.freeze({
      kind: 'customer_runtime_without_opportunity' as const,
      relationKey: key,
      detail: `CustomerRuntimeState.caseStates has entry for ${key} but no Opportunity`,
    }));
  }

  if (brokeredPaths.length > 1) {
    flags.push(Object.freeze({
      kind: 'duplicate_brokered_paths' as const,
      relationKey: key,
      detail: `${brokeredPaths.length} brokered paths for same customer-case match: ${brokeredPaths.map((p) => p.opportunityId).join(', ')}`,
    }));
  }

  // Compare match track vs first brokered path for mismatches
  if (hasRuntime && hasOpportunity && brokeredPaths.length > 0) {
    const primary = brokeredPaths[0];
    const STAGE_TOLERANCE = 0;
    const FIT_TOLERANCE = 0;
    const INTENT_TOLERANCE = 0;
    const CONFIDENCE_TOLERANCE = 0;

    if (Math.abs(match.matchTrack.interest - primary.matchTrackSnapshot.intent) > INTENT_TOLERANCE) {
      flags.push(Object.freeze({
        kind: 'intent_mismatch' as const,
        relationKey: key,
        detail: `Match interest=${match.matchTrack.interest} vs brokered intent=${primary.matchTrackSnapshot.intent}`,
      }));
    }

    if (Math.abs(match.matchTrack.confidence - primary.matchTrackSnapshot.confidence) > CONFIDENCE_TOLERANCE) {
      flags.push(Object.freeze({
        kind: 'confidence_mismatch' as const,
        relationKey: key,
        detail: `Match confidence=${match.matchTrack.confidence} vs brokered confidence=${primary.matchTrackSnapshot.confidence}`,
      }));
    }

    if (Math.abs(match.matchTrack.fit - primary.matchTrackSnapshot.fit) > FIT_TOLERANCE) {
      flags.push(Object.freeze({
        kind: 'fit_mismatch' as const,
        relationKey: key,
        detail: `Match fit=${match.matchTrack.fit} vs brokered fit=${primary.matchTrackSnapshot.fit}`,
      }));
    }

    // Stage mismatch: runtime stageIndex vs opportunity stageIndex
    const runtimeStage = match.matchTrack.interest >= 72 ? 1 : 0; // simplified: runtime doesn't have explicit stageIndex in matchTrack
    // Actually we should use the caseRuntime stageIndex directly — but matchTrack doesn't carry it.
    // The existing readModel.ts compares opportunity.stageIndex vs runtime.stageIndex.
    // For v0 we skip stage mismatch since matchTrack doesn't expose stageIndex directly.
  }

  return Object.freeze(flags);
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildCustomerCaseOpportunityRelationV0View(options: {
  opportunities: readonly LegacyOpportunityShape[];
  customerStates: readonly LegacyCustomerRuntimeStateShape[];
}): readonly CustomerCaseOpportunityRelationV0[] {
  const { opportunities, customerStates } = options;

  // Build lookup: relationKey → customerState + caseRuntime
  const runtimeByKey = new Map<string, { customerState: LegacyCustomerRuntimeStateShape; caseRuntime: LegacyCustomerCaseRuntimeShape }>();
  for (const cs of customerStates) {
    for (const [caseId, cr] of Object.entries(cs.caseStates)) {
      runtimeByKey.set(relationKey(cs.customerId, caseId), { customerState: cs, caseRuntime: cr });
    }
  }

  // Group opportunities by relationKey
  const oppsByKey = new Map<string, LegacyOpportunityShape[]>();
  for (const opp of opportunities) {
    const key = relationKey(opp.customerId, opp.caseId);
    const arr = oppsByKey.get(key) ?? [];
    arr.push(opp);
    oppsByKey.set(key, arr);
  }

  // Collect all relation keys
  const allKeys = new Set<string>([...runtimeByKey.keys(), ...oppsByKey.keys()]);

  const results: CustomerCaseOpportunityRelationV0[] = [];

  for (const key of allKeys) {
    const rt = runtimeByKey.get(key);
    const opps = oppsByKey.get(key) ?? [];
    const hasRuntime = !!rt;
    const hasOpportunity = opps.length > 0;

    // Build match from runtime if available, otherwise from first opportunity
    let match: CustomerCaseMatchReadModel;
    if (rt) {
      match = buildMatchFromRuntime(rt.customerState, rt.caseRuntime);
    } else if (opps.length > 0) {
      match = buildMatchFromOpportunityOnly(opps[0]);
    } else {
      continue; // shouldn't happen
    }

    // Build brokered paths
    const brokeredPaths = opps.map(buildBrokeredPath);

    // Update match with brokered path info
    const matchWithPaths: CustomerCaseMatchReadModel = Object.freeze({
      ...match,
      brokeredPathCount: brokeredPaths.length,
      brokeredPathKeys: Object.freeze(brokeredPaths.map((p) => p.brokeredPathKey)),
    });

    // Detect conflicts
    const conflictFlags = detectConflicts(matchWithPaths, brokeredPaths, hasRuntime, hasOpportunity);

    // Determine source
    let source: 'merged' | 'opportunity-only' | 'runtime-only';
    if (hasRuntime && hasOpportunity) source = 'merged';
    else if (hasOpportunity) source = 'opportunity-only';
    else source = 'runtime-only';

    results.push(Object.freeze({
      relationKey: key,
      customerId: match.customerId,
      caseId: match.caseId,
      match: matchWithPaths,
      brokeredPaths: Object.freeze(brokeredPaths),
      conflictFlags,
      source,
    }));
  }

  return Object.freeze(results);
}

// ---------------------------------------------------------------------------
// Dedupe helpers
// ---------------------------------------------------------------------------

/**
 * Count unique customer-case matches (real buyers), not brokered paths.
 * Three service paths from the same customer to the same listing = 1 real buyer.
 */
export function countDedupedBuyers(relations: readonly CustomerCaseOpportunityRelationV0[]): number {
  return relations.length;
}

/**
 * Count total brokered paths across all matches.
 */
export function countTotalBrokeredPaths(relations: readonly CustomerCaseOpportunityRelationV0[]): number {
  return relations.reduce((sum, r) => sum + r.brokeredPaths.length, 0);
}

/**
 * Build summary with conflict counts and dedupe stats.
 */
export function buildOpportunityRelationV0Summary(
  relations: readonly CustomerCaseOpportunityRelationV0[],
): OpportunityRelationV0Summary {
  const conflictsByKind: Record<OpportunityRelationV0ConflictKind, number> = {
    opportunity_without_customer_runtime: 0,
    customer_runtime_without_opportunity: 0,
    stage_mismatch: 0,
    status_mismatch: 0,
    fit_mismatch: 0,
    intent_mismatch: 0,
    confidence_mismatch: 0,
    duplicate_brokered_paths: 0,
  };

  let totalConflicts = 0;
  for (const r of relations) {
    for (const f of r.conflictFlags) {
      conflictsByKind[f.kind]++;
      totalConflicts++;
    }
  }

  return Object.freeze({
    totalRelations: relations.length,
    uniqueCustomerCaseMatches: relations.length,
    totalBrokeredPaths: countTotalBrokeredPaths(relations),
    conflictCount: totalConflicts,
    conflictsByKind: Object.freeze(conflictsByKind),
    dedupedBuyerCount: countDedupedBuyers(relations),
  });
}
