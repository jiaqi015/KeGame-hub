import {
  buildCaseEvaluationSnapshotsFromLegacyState,
  buildOpportunityEvaluationSnapshotsFromLegacyState,
  buildRegionOpenDayFitSnapshotFromLegacyState,
  validateEvaluationSnapshotsBoundaries,
  type EvaluationBoundaryGuardStatus,
  type EvaluationSnapshotBoundaryReport,
  type SellingHousesEvaluationSnapshot,
} from '../../core/evaluation/index.js';
import type { GameState } from '../../domain/models.js';

export type DecisionSupportEvaluationBoundaryReadiness = 'ready' | 'watch' | 'blocked';

export interface DecisionSupportEvaluationBoundaryReport {
  readonly source: 'decision-support-evaluation-snapshots';
  readonly snapshotCount: number;
  readonly statusCounts: Readonly<Record<EvaluationBoundaryGuardStatus, number>>;
  readonly warningModelIds: readonly string[];
  readonly violationModelIds: readonly string[];
  readonly reports: readonly EvaluationSnapshotBoundaryReport[];
  readonly readiness: DecisionSupportEvaluationBoundaryReadiness;
}

function freezeList<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]);
}

function buildRegionOpenDayFitSnapshots(state: GameState): SellingHousesEvaluationSnapshot[] {
  const scopes = new Map<string, { district: string; community?: string }>();
  state.cases
    .filter((caseItem) => caseItem.status === 'active')
    .forEach((caseItem) => {
      scopes.set(`district:${caseItem.district}`, { district: caseItem.district });
      scopes.set(`community:${caseItem.district}:${caseItem.community}`, {
        district: caseItem.district,
        community: caseItem.community,
      });
    });

  return Array.from(scopes.values()).map((scope) => buildRegionOpenDayFitSnapshotFromLegacyState(state, scope));
}

function buildDecisionSupportEvaluationSnapshots(state: GameState): readonly SellingHousesEvaluationSnapshot[] {
  const snapshots: SellingHousesEvaluationSnapshot[] = [];

  state.cases
    .filter((caseItem) => caseItem.status === 'active')
    .forEach((caseItem) => {
      const caseSnapshots = buildCaseEvaluationSnapshotsFromLegacyState(state, caseItem);
      snapshots.push(caseSnapshots.assetScore, caseSnapshots.ownerDecisionReadiness);

      state.opportunities
        .filter((opportunity) => opportunity.caseId === caseItem.id && opportunity.status === 'active')
        .forEach((opportunity) => {
          snapshots.push(buildOpportunityEvaluationSnapshotsFromLegacyState(state, opportunity).opportunityScore);
        });
    });

  snapshots.push(...buildRegionOpenDayFitSnapshots(state));
  return freezeList(snapshots);
}

function uniqueModelIdsForStatus(
  reports: readonly EvaluationSnapshotBoundaryReport[],
  status: EvaluationBoundaryGuardStatus,
): readonly string[] {
  const modelIds = new Set<string>();
  reports
    .filter((report) => report.status === status)
    .forEach((report) => modelIds.add(report.modelId));
  return freezeList(Array.from(modelIds));
}

function resolveReadiness(statusCounts: Readonly<Record<EvaluationBoundaryGuardStatus, number>>) {
  if (statusCounts['boundary-violation'] > 0) {
    return 'blocked';
  }
  if (statusCounts['legacy-warning'] > 0) {
    return 'watch';
  }
  return 'ready';
}

export function buildDecisionSupportEvaluationBoundaryReport(
  state: GameState,
): DecisionSupportEvaluationBoundaryReport {
  const snapshots = buildDecisionSupportEvaluationSnapshots(state);
  const reports = validateEvaluationSnapshotsBoundaries(snapshots);
  const statusCounts = Object.freeze({
    clean: reports.filter((report) => report.status === 'clean').length,
    'legacy-warning': reports.filter((report) => report.status === 'legacy-warning').length,
    'boundary-violation': reports.filter((report) => report.status === 'boundary-violation').length,
  });

  return Object.freeze({
    source: 'decision-support-evaluation-snapshots',
    snapshotCount: snapshots.length,
    statusCounts,
    warningModelIds: uniqueModelIdsForStatus(reports, 'legacy-warning'),
    violationModelIds: uniqueModelIdsForStatus(reports, 'boundary-violation'),
    reports,
    readiness: resolveReadiness(statusCounts),
  });
}
