/**
 * Relation Read Projection — read-only boundary for relation-level fields.
 *
 * Purpose:
 *   Provide a semantic read boundary for trust, patience, urgency so that
 *   consumers read through the relation layer rather than bare Case fields.
 *
 * Mother model alignment:
 * - Section 8: trust belongs to BrokerOwnerRelation, not Owner or AssetCase
 * - Section 19.1: trust is an actor belief, not an asset fact
 * - Section 5: patience/urgency are owner-case decision dimensions
 *
 * Hard constraints:
 * 1. Pure functions — no mutation of any state.
 * 2. No Date.now, no Math.random, no fetch, no LLM.
 * 3. Deterministic: same input → same output.
 * 4. Frozen output.
 * 5. Does NOT replace Case as runtime fact source.
 * 6. Provides read-only projections for semantic consumers.
 *
 * B USAGE GUIDE — which API to use instead of bare Case reads:
 * ┌─────────────────────────┬───────────────────────────────────────────────────────┐
 * │ B engine file           │ Use this API instead of bare reads                  │
 * ├─────────────────────────┼───────────────────────────────────────────────────────┤
 * │ ALL engine files        │ readCaseRelationBusinessContextFromRuntime(state, c) │
 * │                         │   .trustValue       → instead of caseItem.trust     │
 * │                         │   .patienceValue    → instead of caseItem.patience  │
 * │                         │   .urgencyValue     → instead of caseItem.urgency   │
 * │                         │   .windowDaysValue  → instead of caseItem.windowDays│
 * │                         │   .isRelationBacked → check if relation populated   │
 * │                         │   .fallbackReasons  → why fallback was used         │
 * ├─────────────────────────┼───────────────────────────────────────────────────────┤
 * │ marketEngine.ts         │ ctx.trustValue for trust threshold checks           │
 * │                         │ ctx.urgencyValue for urgency-based logic            │
 * ├─────────────────────────┼───────────────────────────────────────────────────────┤
 * │ competitionEngine.ts    │ ctx.trustValue for rival loss thresholds            │
 * │                         │ ctx.urgencyValue for window/urgency checks          │
 * ├─────────────────────────┼───────────────────────────────────────────────────────┤
 * │ opportunityEngine.ts    │ ctx.trustValue for trust confidence weights         │
 * │                         │ ctx.patienceValue for opportunity timeout logic     │
 * ├─────────────────────────┼───────────────────────────────────────────────────────┤
 * │ marketingActionExecutors│ ctx.trustValue for trust gate checks                │
 * ├─────────────────────────┼───────────────────────────────────────────────────────┤
 * │ dealClosing.ts          │ Already migrated — uses readRelationTrustForCase     │
 * └─────────────────────────┴───────────────────────────────────────────────────────┘
 */

export type RelationOwnerProfilingDimensionValue =
  | 'strong'
  | 'weak'
  | 'short'
  | 'long'
  | 'low'
  | 'high'
  | 'self_decide'
  | 'guided_or_joint'
  | 'unknown';

export type RelationOwnerProfilingConfidence = 'high' | 'medium' | 'low';
export type RelationOwnerProfilingTone = 'accent' | 'chance' | 'risk' | 'neutral';

export type RelationOwnerProfilingTypeKey =
  | 'strong-short-high-self_decide'
  | 'strong-short-high-guided_or_joint'
  | 'strong-short-low-self_decide'
  | 'strong-short-low-guided_or_joint'
  | 'strong-long-high-self_decide'
  | 'strong-long-high-guided_or_joint'
  | 'strong-long-low-self_decide'
  | 'strong-long-low-guided_or_joint'
  | 'weak-short-high-self_decide'
  | 'weak-short-high-guided_or_joint'
  | 'weak-short-low-self_decide'
  | 'weak-short-low-guided_or_joint'
  | 'weak-long-high-self_decide'
  | 'weak-long-high-guided_or_joint'
  | 'weak-long-low-self_decide'
  | 'weak-long-low-guided_or_joint';

export interface RelationOwnerProfilingDimension {
  key: 'price_anchor' | 'time_window' | 'transaction_experience' | 'decision_style';
  label: string;
  value: RelationOwnerProfilingDimensionValue;
  valueLabel: string;
  confidence: RelationOwnerProfilingConfidence;
  evidenceIds: string[];
}

export interface RelationOwnerProfilingLabel {
  name: string;
  value: string;
  confidence: RelationOwnerProfilingConfidence;
  evidenceIds: string[];
}

export interface RelationOwnerProfilingEvidence {
  id: string;
  sourceType: 'interview' | 'listing_data' | 'market_data' | 'manual';
  text: string;
  linkedDimensions: string[];
  confidence: RelationOwnerProfilingConfidence;
}

export interface RelationOwnerProfilingMemorySummary {
  ownerTypeKey: RelationOwnerProfilingTypeKey;
  ownerTypeName: string;
  ownerTypeDescription: string;
  ownerTypeTone: RelationOwnerProfilingTone;
  dimensions: RelationOwnerProfilingDimension[];
  labels: RelationOwnerProfilingLabel[];
  evidenceBank: RelationOwnerProfilingEvidence[];
  serviceStrategy: {
    primaryGoal: string;
    mainBlocker: string;
    recommendedNextAction: string;
    communicationStyle: string;
  };
  openQuestions: string[];
}

export type RelationProjectionPersonality = 'pragmatic' | 'emotional' | 'urgent';

export type RelationProjectionCaseLike = Readonly<{
  id: string;
  trust: number;
  patience: number;
  urgency: number;
  windowDays: number;
  personality: RelationProjectionPersonality;
  ownerArchetypeId?: string;
  hasCompletedFirstVisit?: boolean;
  ownerProfilingMemory?: RelationOwnerProfilingMemorySummary;
}>;

export type RelationProjectionGameStateLike = Readonly<{
  runtimeBrokerOwnerRelations?: readonly Readonly<{
    relationId: string;
    brokerId: string;
    ownerId: string;
    trust: number;
  }>[];
  runtimeOwnerCaseReadinessStates?: readonly Readonly<{
    relationId: string;
    ownerId: string;
    assetCaseId: string;
    patience: number;
    urgency: number;
  }>[];
}>;

// ---------------------------------------------------------------------------
// RelationTrustProjection: trust read through broker-owner relation
// ---------------------------------------------------------------------------

/**
 * RelationTrustProjection — trust value with source tracking.
 * Used by CaseRelationBundle and readCaseRelationBundleFromRuntime.
 */
export interface RelationTrustProjection {
  readonly relationId: string;
  readonly brokerId: string;
  readonly ownerId: string;
  readonly trust: number;
  readonly source: 'canonical-relation' | 'case-fallback';
}

/**
 * RelationReadinessProjection — patience/urgency with source tracking.
 * Used by CaseRelationBundle and readCaseRelationBundleFromRuntime.
 */
export interface RelationReadinessProjection {
  readonly relationId: string;
  readonly ownerId: string;
  readonly assetCaseId: string;
  readonly patience: number;
  readonly urgency: number;
  readonly windowDays: number;
  readonly source: 'canonical-relation' | 'case-fallback';
}

// ---------------------------------------------------------------------------
// OwnerProfileProjection: owner profiling read through semantic boundary
// ---------------------------------------------------------------------------

export interface OwnerProfileProjection {
  readonly caseId: string;
  /** 16-type profiling is the authoritative owner type source. */
  readonly profiling: RelationOwnerProfilingMemorySummary | null;
  /** Legacy 4-type personality — compatibility mirror only, not authoritative. */
  readonly legacyPersonality: RelationProjectionPersonality;
  /** Legacy ownerArchetypeId — compatibility mirror only. */
  readonly legacyArchetypeId?: string;
  /** Whether profiling has been revealed (first visit completed). */
  readonly isRevealed: boolean;
}

export function readOwnerProfile(caseItem: RelationProjectionCaseLike): OwnerProfileProjection {
  return Object.freeze({
    caseId: caseItem.id,
    profiling: caseItem.ownerProfilingMemory ?? null,
    legacyPersonality: caseItem.personality,
    legacyArchetypeId: caseItem.ownerArchetypeId,
    isRevealed: Boolean(caseItem.hasCompletedFirstVisit),
  });
}

// ---------------------------------------------------------------------------
// CaseRelationBundle: composite read for a single case
// ---------------------------------------------------------------------------

/**
 * Composite bundle of relation data for a single case.
 * Used by readCaseRelationBundleFromRuntime (runtime read path).
 */
export interface CaseRelationBundle {
  readonly assetCaseId: string;
  readonly trust: RelationTrustProjection | null;
  readonly readiness: RelationReadinessProjection | null;
  readonly ownerProfile: OwnerProfileProjection;
}

// ---------------------------------------------------------------------------
// OwnerRelationBusinessContext: flat, ready-to-use business context
// ---------------------------------------------------------------------------

export type RelationReadSource = 'canonical-relation' | 'case-fallback';

export interface OwnerRelationBusinessContext {
  /** Trust value — from canonical BrokerOwnerRelation or Case mirror fallback. */
  readonly trustValue: number;
  /** Patience value — from canonical OwnerCaseRelation readiness or Case mirror. */
  readonly patienceValue: number;
  /** Urgency value — from canonical OwnerCaseRelation readiness or Case mirror. */
  readonly urgencyValue: number;
  /** Window days — from Case (case-level fact, not relation-owned). */
  readonly windowDaysValue: number;
  /** Source of trust value. */
  readonly trustSource: RelationReadSource;
  /** Source of readiness values (patience/urgency). */
  readonly readinessSource: RelationReadSource;
  /** True when BOTH trust and readiness came from canonical runtime sources. */
  readonly isRelationBacked: boolean;
  /** Reasons why fallback was used (empty when fully relation-backed). */
  readonly fallbackReasons: readonly string[];
  /** 16-type profiling memory (authoritative owner type source). Null if not revealed. */
  readonly profiling: RelationOwnerProfilingMemorySummary | null;
  /** Legacy 4-type personality — compatibility mirror only, not authoritative. */
  readonly legacyPersonality: RelationProjectionPersonality;
}

/**
 * Alias for readOwnerRelationBusinessContext — B-facing name.
 *
 * B should use this instead of bare Case field reads:
 *   const ctx = readCaseRelationBusinessContextFromRuntime(state, caseItem)
 *   ctx.trustValue       // instead of caseItem.trust
 *   ctx.patienceValue    // instead of caseItem.patience
 *   ctx.urgencyValue     // instead of caseItem.urgency
 *   ctx.windowDaysValue  // instead of caseItem.windowDays
 *   ctx.isRelationBacked // true when relation state is populated
 *   ctx.fallbackReasons  // why fallback was used
 */
export const readCaseRelationBusinessContextFromRuntime = readOwnerRelationBusinessContext;

/**
 * Single business-facing entry point for relation + profiling data.
 *
 * Returns a flat, frozen context with trust/patience/urgency/windowDays
 * values and their sources. Engine files should call this once and use
 * the returned values instead of reading bare Case fields.
 *
 * Source tracking:
 * - 'canonical-relation': value read from runtime relation state
 * - 'case-fallback': value read from Case field (old save or early game)
 *
 * B should use: `const ctx = readOwnerRelationBusinessContext(state, caseItem)`
 * then `ctx.trustValue` instead of `caseItem.trust`.
 */
export function readOwnerRelationBusinessContext(
  state: RelationProjectionGameStateLike,
  caseItem: RelationProjectionCaseLike,
): OwnerRelationBusinessContext {
  const ownerId = `owner:${caseItem.id}`;
  const fallbackReasons: string[] = [];

  // --- Trust ---
  const runtimeTrustState = (state.runtimeBrokerOwnerRelations ?? []).find(
    (r) => r.ownerId === ownerId,
  );
  let trustValue: number;
  let trustSource: RelationReadSource;
  if (runtimeTrustState) {
    trustValue = runtimeTrustState.trust;
    trustSource = 'canonical-relation';
  } else {
    trustValue = caseItem.trust;
    trustSource = 'case-fallback';
    if (!(state.runtimeBrokerOwnerRelations ?? []).length) {
      fallbackReasons.push('runtimeBrokerOwnerRelations empty');
    } else {
      fallbackReasons.push(`no trust state for ownerId=${ownerId}`);
    }
  }

  // --- Readiness (patience / urgency) ---
  const assetCaseId = `case:${caseItem.id}`;
  const runtimeReadinessState = (state.runtimeOwnerCaseReadinessStates ?? []).find(
    (r) => r.assetCaseId === assetCaseId,
  );
  let patienceValue: number;
  let urgencyValue: number;
  let readinessSource: RelationReadSource;
  if (runtimeReadinessState) {
    patienceValue = runtimeReadinessState.patience;
    urgencyValue = runtimeReadinessState.urgency;
    readinessSource = 'canonical-relation';
  } else {
    patienceValue = caseItem.patience;
    urgencyValue = caseItem.urgency;
    readinessSource = 'case-fallback';
    if (!(state.runtimeOwnerCaseReadinessStates ?? []).length) {
      fallbackReasons.push('runtimeOwnerCaseReadinessStates empty');
    } else {
      fallbackReasons.push(`no readiness state for assetCaseId=${assetCaseId}`);
    }
  }

  // --- Window days (case-level fact, always from Case) ---
  const windowDaysValue = caseItem.windowDays;

  // --- Profiling ---
  const profiling = caseItem.ownerProfilingMemory ?? null;

  return Object.freeze({
    trustValue,
    patienceValue,
    urgencyValue,
    windowDaysValue,
    trustSource,
    readinessSource,
    isRelationBacked: trustSource === 'canonical-relation' && readinessSource === 'canonical-relation',
    fallbackReasons: Object.freeze([...fallbackReasons]),
    profiling,
    legacyPersonality: caseItem.personality,
  });
}

// ---------------------------------------------------------------------------
// readCaseRelationBundleFromRuntime: read directly from GameState runtime sources
// ---------------------------------------------------------------------------

/**
 * Reads CaseRelationBundle from GameState runtime sources.
 *
 * Authoritative read path when runtime relation state is populated:
 * - trust from runtimeBrokerOwnerRelations (canonical trust write source)
 * - patience/urgency from runtimeOwnerCaseReadinessStates (canonical readiness write source)
 * - windowDays from Case (case-level fact, not relation-owned)
 * - ownerProfile from ownerProfilingMemory (16-type profiling, authoritative)
 *
 * Falls back to bare Case fields when runtime sources are not populated
 * (old saves or early-game states before first mutation).
 */
export function readCaseRelationBundleFromRuntime(
  state: RelationProjectionGameStateLike,
  caseItem: RelationProjectionCaseLike,
): CaseRelationBundle {
  const ownerId = `owner:${caseItem.id}`;

  // Trust: read from runtime canonical source, fallback to Case mirror
  // Match by ownerId (owner:${caseId}) — the canonical relation key
  const runtimeTrustState = (state.runtimeBrokerOwnerRelations ?? []).find(
    (r) => r.ownerId === ownerId,
  );
  const trustProjection: RelationTrustProjection | null = runtimeTrustState
    ? Object.freeze({
        relationId: runtimeTrustState.relationId,
        brokerId: runtimeTrustState.brokerId,
        ownerId: runtimeTrustState.ownerId,
        trust: runtimeTrustState.trust,
        source: 'canonical-relation' as const,
      })
    : Object.freeze({
        relationId: `case-mirror:${caseItem.id}`,
        brokerId: '',
        ownerId,
        trust: caseItem.trust,
        source: 'case-fallback' as const,
      });

  // Readiness: read from runtime canonical source, fallback to Case mirror
  const assetCaseId = `case:${caseItem.id}`;
  const runtimeReadinessState = (state.runtimeOwnerCaseReadinessStates ?? []).find(
    (r) => r.assetCaseId === assetCaseId,
  );
  const readinessProjection: RelationReadinessProjection | null = Object.freeze({
    relationId: runtimeReadinessState?.relationId ?? `case-mirror:${caseItem.id}`,
    ownerId: runtimeReadinessState?.ownerId ?? ownerId,
    assetCaseId: caseItem.id,
    patience: runtimeReadinessState?.patience ?? caseItem.patience,
    urgency: runtimeReadinessState?.urgency ?? caseItem.urgency,
    windowDays: caseItem.windowDays,
    source: (runtimeReadinessState ? 'canonical-relation' : 'case-fallback') as 'canonical-relation' | 'case-fallback',
  });

  return Object.freeze({
    assetCaseId: caseItem.id,
    trust: trustProjection,
    readiness: readinessProjection,
    ownerProfile: readOwnerProfile(caseItem),
  });
}
