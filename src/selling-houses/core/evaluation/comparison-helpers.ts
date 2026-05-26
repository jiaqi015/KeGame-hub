/**
 * Comparison helpers that explain how legacy D1/D2/D3/competitiveness
 * map to the new evaluation snapshot dimensions.
 *
 * These are pure read-only functions. They do not mutate any state.
 */

import type {
  AssetScoreSnapshot,
  EvaluationDimensionSnapshot,
  OwnerDecisionReadinessSnapshot,
} from './models.js';

// ---------------------------------------------------------------------------
// Structural input types (no domain import)
// ---------------------------------------------------------------------------

interface LegacyCaseScores {
  readonly id: string;
  readonly d1: number;
  readonly d2: number;
  readonly d3: number;
  readonly competitiveness: number;
}

interface LegacyCaseOwnerFields {
  readonly id: string;
  readonly trust: number;
  readonly urgency: number;
  readonly patience: number;
}

interface LegacyCaseForComparison extends LegacyCaseScores, LegacyCaseOwnerFields {
  readonly status: string;
}

interface LegacyStateForComparison {
  readonly day: number;
  readonly cases: readonly LegacyCaseForComparison[];
}

// ---------------------------------------------------------------------------
// Legacy-to-Snapshot comparison types
// ---------------------------------------------------------------------------

export interface LegacyDimensionMapping {
  readonly legacyField: string;
  readonly legacyValue: number;
  readonly snapshotDimension: string;
  readonly snapshotValue: number;
  readonly delta: number;
  readonly note: string;
}

export interface AssetScoreComparison {
  readonly caseId: string;
  readonly day: number;
  readonly legacyTotal: number;
  readonly snapshotTotal: number;
  readonly totalDelta: number;
  readonly dimensions: readonly LegacyDimensionMapping[];
  readonly d3MixedWarning: string;
  readonly summary: string;
}

export interface OwnerReadinessComparison {
  readonly caseId: string;
  readonly day: number;
  readonly legacyTrust: number;
  readonly snapshotTrust: number;
  readonly legacyUrgency: number;
  readonly snapshotUrgency: number;
  readonly legacyPatience: number;
  readonly snapshotPatience: number;
  readonly snapshotWeightedScore: number;
  readonly weights: {
    readonly trust: number;
    readonly urgency: number;
    readonly patience: number;
    readonly willingnessToAdjust: number;
    readonly decisionLoad: number;
  };
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const D3_MIXED_WARNING = 'Legacy D3 mixes pricing flexibility with owner readiness signals. The snapshot separates these into AssetScoreSnapshot (price context) and OwnerDecisionReadinessSnapshot (relationship signals). Direct numeric comparison of D3 is not semantically meaningful.';

function delta(a: number, b: number) {
  return Math.round((a - b) * 100) / 100;
}

function compareDimension(
  legacyField: string,
  legacyValue: number,
  snapshotDimension: EvaluationDimensionSnapshot,
  note: string,
): LegacyDimensionMapping {
  return {
    legacyField,
    legacyValue: Math.round(legacyValue),
    snapshotDimension: snapshotDimension.key,
    snapshotValue: snapshotDimension.score,
    delta: delta(snapshotDimension.score, Math.round(legacyValue)),
    note,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compare legacy Case D1/D2/D3/competitiveness against an AssetScoreSnapshot.
 *
 * Use this to verify that the snapshot correctly mirrors legacy scores during
 * migration, and to explain where they diverge (especially D3).
 */
export function compareLegacyScoresToAssetSnapshot(
  caseItem: LegacyCaseScores,
  snapshot: AssetScoreSnapshot,
): AssetScoreComparison {
  const dimensions: LegacyDimensionMapping[] = [
    compareDimension(
      'd1',
      caseItem.d1,
      snapshot.dimensions.d1,
      'D1 is a direct mirror of legacy demand/funnel score.',
    ),
    compareDimension(
      'd2',
      caseItem.d2,
      snapshot.dimensions.d2,
      'D2 is a direct mirror of legacy asset quality score.',
    ),
    compareDimension(
      'd3',
      caseItem.d3,
      snapshot.dimensions.d3,
      'D3 mirrors legacy mixed score. Use OwnerDecisionReadinessSnapshot for separated owner signals.',
    ),
  ];

  if (snapshot.dimensions.d4) {
    dimensions.push({
      legacyField: 'd4',
      legacyValue: 0,
      snapshotDimension: 'd4',
      snapshotValue: snapshot.dimensions.d4.score,
      delta: snapshot.dimensions.d4.score,
      note: 'D4 has no legacy equivalent. It is a new dimension for competition/service-path advantage.',
    });
  }

  const totalDelta = delta(snapshot.score, Math.round(caseItem.competitiveness));

  let summary = `Snapshot total (${snapshot.score}) vs legacy competitiveness (${Math.round(caseItem.competitiveness)}): delta ${totalDelta}.`;
  if (Math.abs(totalDelta) > 2) {
    summary += ' WARNING: Significant divergence detected — check D3 mixed signals.';
  }
  if (snapshot.blockers.length > 0) {
    summary += ` Blockers: ${snapshot.blockers.join('; ')}.`;
  }

  return Object.freeze({
    caseId: caseItem.id,
    day: snapshot.day,
    legacyTotal: Math.round(caseItem.competitiveness),
    snapshotTotal: snapshot.score,
    totalDelta,
    dimensions: Object.freeze(dimensions),
    d3MixedWarning: D3_MIXED_WARNING,
    summary,
  });
}

/**
 * Compare legacy Case relationship fields against an OwnerDecisionReadinessSnapshot.
 */
export function compareLegacyFieldsToOwnerReadinessSnapshot(
  caseItem: LegacyCaseOwnerFields,
  snapshot: OwnerDecisionReadinessSnapshot,
): OwnerReadinessComparison {
  return Object.freeze({
    caseId: caseItem.id,
    day: snapshot.day,
    legacyTrust: caseItem.trust,
    snapshotTrust: snapshot.dimensions.trust.score,
    legacyUrgency: caseItem.urgency,
    snapshotUrgency: snapshot.dimensions.urgency.score,
    legacyPatience: caseItem.patience,
    snapshotPatience: snapshot.dimensions.patience.score,
    snapshotWeightedScore: snapshot.score,
    weights: {
      trust: 0.26,
      urgency: 0.18,
      patience: 0.2,
      willingnessToAdjust: 0.2,
      decisionLoad: 0.16,
    },
    summary: `Owner readiness weighted score: ${snapshot.score}. Trust=${snapshot.dimensions.trust.score}, Urgency=${snapshot.dimensions.urgency.score}, Patience=${snapshot.dimensions.patience.score}, WillingnessToAdjust=${snapshot.dimensions.willingnessToAdjust.score}, DecisionLoad=${snapshot.dimensions.decisionLoad.score}.`,
  });
}

/**
 * Batch comparison for all active cases in a GameState.
 */
export function compareAllActiveCases(
  state: LegacyStateForComparison,
  snapshots: Map<string, AssetScoreSnapshot>,
): readonly AssetScoreComparison[] {
  // legacy_status_mirror_read: constrained legacy state shape without runtime collections
  const activeCases = state.cases.filter((c) => c.status === 'active');
  const comparisons: AssetScoreComparison[] = [];

  for (const caseItem of activeCases) {
    const snapshot = snapshots.get(caseItem.id);
    if (snapshot) {
      comparisons.push(compareLegacyScoresToAssetSnapshot(caseItem, snapshot));
    }
  }

  return Object.freeze(comparisons);
}
