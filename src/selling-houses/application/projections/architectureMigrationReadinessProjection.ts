import type { GameState } from '../../domain/models.js';
import { ACTION_EXECUTOR_CONTRACT_READ_MODEL } from '../../domain/engine/actionExecutorContract.js';
import { buildProcessLifecycleMigrationPlan } from '../../runtime/simulation/processes/index.js';
import {
  LEGACY_CASE_COMPATIBILITY_MIRROR_FIELDS,
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES,
  type LegacyCaseCanonicalOwner,
  type LegacyCaseDomainFacet,
  type LegacyCaseFieldRole,
} from '../../core/world-state/index.js';
import { freezeProjection } from '../../interface/interaction-workspace/readOnly.js';
import {
  buildArchitectureParityProjection,
  type ArchitectureParityStatus,
  type ArchitectureParityWarning,
} from './architectureParityProjection.js';

export type ArchitectureMigrationReadiness = 'ready' | 'watch' | 'blocked';

export type ArchitectureMigrationReadinessWarningSeverity = 'watch' | 'blocking';

export type ArchitectureMigrationReadinessWarningSource =
  | 'case-field-ownership'
  | 'action-executor'
  | 'process-lifecycle'
  | 'architecture-parity'
  | 'optional-contract';

export type ArchitectureMigrationTargetId =
  | 'case-field-migration'
  | 'action-resolver-split'
  | 'process-lifecycle-ownership'
  | 'opportunity-authority-cleanup'
  | 'evaluation-model-boundary-hardening'
  | 'case-segment-read-model'
  | 'action-boundary-report';

export interface ArchitectureMigrationReadinessWarning {
  readonly code: string;
  readonly message: string;
  readonly severity: ArchitectureMigrationReadinessWarningSeverity;
  readonly source: ArchitectureMigrationReadinessWarningSource;
}

export interface CaseFieldOwnerReadiness {
  readonly owner: LegacyCaseCanonicalOwner;
  readonly fieldCount: number;
  readonly compatibilityMirrorCount: number;
  readonly futureMigrationCount: number;
}

export interface CaseFieldDomainFacetReadiness {
  readonly domainFacet: LegacyCaseDomainFacet;
  readonly fieldCount: number;
}

export interface LegacyCaseFieldOwnershipReadinessProjection {
  readonly source: 'legacy-case-field-ownership-registry';
  readonly readOnly: true;
  readonly readiness: ArchitectureMigrationReadiness;
  readonly fieldCount: number;
  readonly canonicalOwnerCount: number;
  readonly domainFacetCount: number;
  readonly compatibilityMirrorCount: number;
  readonly futureMigrationCount: number;
  readonly canonicalTemporaryCount: number;
  readonly deprecatedLegacyCount: number;
  readonly owners: readonly CaseFieldOwnerReadiness[];
  readonly domainFacets: readonly CaseFieldDomainFacetReadiness[];
  readonly compatibilityMirrorFields: readonly string[];
}

export interface ActionExecutorReadinessProjection {
  readonly source: 'legacy-action-resolvers';
  readonly resourcesBoundary: 'actionTransaction';
  readonly readOnly: true;
  readonly readiness: ArchitectureMigrationReadiness;
  readonly actionCount: number;
  readonly contractCount: number;
  readonly missingActionIds: readonly string[];
  readonly ownerTouchActionIds: readonly string[];
  readonly opportunityBoundActionIds: readonly string[];
  readonly revealsOwnerStateActionIds: readonly string[];
  readonly processActionIds: readonly string[];
  readonly legacyProcessRunActionIds: readonly string[];
}

export interface ArchitectureParityReadinessProjection {
  readonly source: 'architecture-parity-projection';
  readonly readOnly: true;
  readonly readiness: ArchitectureMigrationReadiness;
  readonly status: ArchitectureParityStatus;
  readonly activeCaseCount: number;
  readonly warningCount: number;
  readonly warnings: readonly ArchitectureParityWarning[];
  readonly missingPrimaryActionCount: number;
  readonly opportunityRelationConflictCount: number;
  readonly processManagerMutableCount: number;
  readonly negotiationPendingMigrationCount: number;
}

export interface ProcessLifecycleReadinessProjection {
  readonly source: 'runtime-simulation-processes';
  readonly readOnly: true;
  readonly readiness: ArchitectureMigrationReadiness;
  readonly processCount: number;
  readonly activeProcessCount: number;
  readonly readyProcessCount: number;
  readonly watchProcessCount: number;
  readonly blockedProcessCount: number;
  readonly pendingStepCount: number;
  readonly pendingProcessTypes: readonly string[];
}

export interface OptionalMigrationContractSignal {
  readonly status?: string;
  readonly readiness?: ArchitectureMigrationReadiness;
  readonly warningCount?: number;
  readonly blockingWarningCount?: number;
}

export interface ArchitectureMigrationReadinessOptionalSignals {
  readonly caseSegments?: OptionalMigrationContractSignal;
  readonly evaluationModelBoundaries?: OptionalMigrationContractSignal;
  readonly actionBoundaryReport?: OptionalMigrationContractSignal;
}

export interface OptionalMigrationContractReadiness {
  readonly contractName: 'case-segments' | 'evaluation-model-boundaries' | 'action-boundary-report';
  readonly linked: boolean;
  readonly readiness: ArchitectureMigrationReadiness | 'pending-contract';
  readonly status: string;
  readonly warningCount: number;
  readonly blockingWarningCount: number;
}

export interface ArchitectureMigrationTarget {
  readonly id: ArchitectureMigrationTargetId;
  readonly title: string;
  readonly readiness: ArchitectureMigrationReadiness;
  readonly rationale: string;
  readonly dependsOn: readonly string[];
  readonly blockingWarningCodes: readonly string[];
}

export interface ArchitectureMigrationReadinessProjection {
  readonly projectionKind: 'architecture_migration_readiness_projection';
  readonly source: 'legacy-game-state';
  readonly readOnly: true;
  readonly mutationPolicy: 'read-only-projection';
  readonly day: number;
  readonly caseFieldOwnership: LegacyCaseFieldOwnershipReadinessProjection;
  readonly actionExecutor: ActionExecutorReadinessProjection;
  readonly processLifecycle: ProcessLifecycleReadinessProjection;
  readonly architectureParity: ArchitectureParityReadinessProjection;
  readonly optionalContracts: {
    readonly caseSegments: OptionalMigrationContractReadiness;
    readonly evaluationModelBoundaries: OptionalMigrationContractReadiness;
    readonly actionBoundaryReport: OptionalMigrationContractReadiness;
  };
  readonly blockingWarnings: readonly ArchitectureMigrationReadinessWarning[];
  readonly nextMigrationTargets: readonly ArchitectureMigrationTarget[];
}

function countBy<T extends string>(values: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>();
  values.forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return counts;
}

function roleCount(role: LegacyCaseFieldRole) {
  return LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.filter((entry) => entry.legacyRole === role).length;
}

function buildCaseFieldOwnershipReadiness(): {
  readonly projection: LegacyCaseFieldOwnershipReadinessProjection;
  readonly warnings: readonly ArchitectureMigrationReadinessWarning[];
} {
  const warnings: ArchitectureMigrationReadinessWarning[] = [];
  const ownerCounts = countBy(LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.map((entry) => entry.canonicalOwner));
  const facetCounts = countBy(LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.map((entry) => entry.domainFacet));
  const compatibilityMirrorCount = LEGACY_CASE_COMPATIBILITY_MIRROR_FIELDS.length;
  const futureMigrationCount = roleCount('future-migration');
  const canonicalTemporaryCount = roleCount('canonical-temporary');

  if (LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.length === 0) {
    warnings.push({
      code: 'legacy_case_field_ownership_empty',
      message: 'Legacy Case field ownership registry is empty, so field migration cannot be planned.',
      severity: 'blocking',
      source: 'case-field-ownership',
    });
  }

  if (compatibilityMirrorCount === 0) {
    warnings.push({
      code: 'legacy_case_compatibility_mirrors_missing',
      message: 'Legacy Case field ownership registry has no compatibility mirrors to guide staged migration.',
      severity: 'blocking',
      source: 'case-field-ownership',
    });
  }

  const owners = Array.from(ownerCounts.entries())
    .map(([owner, fieldCount]) => {
      const ownerEntries = LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.filter((entry) => entry.canonicalOwner === owner);
      return {
        owner,
        fieldCount,
        compatibilityMirrorCount: ownerEntries.filter((entry) => entry.legacyRole === 'compatibility-mirror').length,
        futureMigrationCount: ownerEntries.filter((entry) => entry.legacyRole === 'future-migration').length,
      };
    })
    .sort((left, right) => left.owner.localeCompare(right.owner));

  const domainFacets = Array.from(facetCounts.entries())
    .map(([domainFacet, fieldCount]) => ({
      domainFacet,
      fieldCount,
    }))
    .sort((left, right) => left.domainFacet.localeCompare(right.domainFacet));

  return {
    projection: {
      source: 'legacy-case-field-ownership-registry',
      readOnly: true,
      readiness: warnings.some((warning) => warning.severity === 'blocking') ? 'blocked' : 'ready',
      fieldCount: LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.length,
      canonicalOwnerCount: ownerCounts.size,
      domainFacetCount: facetCounts.size,
      compatibilityMirrorCount,
      futureMigrationCount,
      canonicalTemporaryCount,
      deprecatedLegacyCount: ownerCounts.get('deprecated-legacy') || 0,
      owners,
      domainFacets,
      compatibilityMirrorFields: LEGACY_CASE_COMPATIBILITY_MIRROR_FIELDS.map((field) => String(field)),
    },
    warnings,
  };
}

function buildActionExecutorReadiness(): {
  readonly projection: ActionExecutorReadinessProjection;
  readonly warnings: readonly ArchitectureMigrationReadinessWarning[];
} {
  const warnings = ACTION_EXECUTOR_CONTRACT_READ_MODEL.missingActionIds.map((actionId) => ({
    code: 'action_executor_contract_missing',
    message: `Action ${actionId} does not have an executor boundary contract or explicit gap.`,
    severity: 'blocking' as const,
    source: 'action-executor' as const,
  }));

  return {
    projection: {
      source: ACTION_EXECUTOR_CONTRACT_READ_MODEL.source,
      resourcesBoundary: ACTION_EXECUTOR_CONTRACT_READ_MODEL.resourcesBoundary,
      readOnly: true,
      readiness: warnings.length > 0 ? 'blocked' : 'ready',
      actionCount: ACTION_EXECUTOR_CONTRACT_READ_MODEL.actionCount,
      contractCount: ACTION_EXECUTOR_CONTRACT_READ_MODEL.contractCount,
      missingActionIds: ACTION_EXECUTOR_CONTRACT_READ_MODEL.missingActionIds,
      ownerTouchActionIds: ACTION_EXECUTOR_CONTRACT_READ_MODEL.ownerTouchActionIds,
      opportunityBoundActionIds: ACTION_EXECUTOR_CONTRACT_READ_MODEL.opportunityBoundActionIds,
      revealsOwnerStateActionIds: ACTION_EXECUTOR_CONTRACT_READ_MODEL.revealsOwnerStateActionIds,
      processActionIds: ACTION_EXECUTOR_CONTRACT_READ_MODEL.processActionIds,
      legacyProcessRunActionIds: ACTION_EXECUTOR_CONTRACT_READ_MODEL.legacyProcessRunActionIds,
    },
    warnings,
  };
}

function readinessForParity(status: ArchitectureParityStatus): ArchitectureMigrationReadiness {
  if (status === 'gap') return 'blocked';
  if (status === 'watch') return 'watch';
  return 'ready';
}

function buildArchitectureParityReadiness(state: GameState): {
  readonly projection: ArchitectureParityReadinessProjection;
  readonly warnings: readonly ArchitectureMigrationReadinessWarning[];
} {
  const parity = buildArchitectureParityProjection(state);
  const readiness = readinessForParity(parity.status);
  const warnings = parity.status === 'gap'
    ? parity.warnings.map((warning) => ({
      code: `architecture_parity_${warning.code}`,
      message: warning.message,
      severity: 'blocking' as const,
      source: 'architecture-parity' as const,
    }))
    : [];

  return {
    projection: {
      source: 'architecture-parity-projection',
      readOnly: true,
      readiness,
      status: parity.status,
      activeCaseCount: parity.summary.activeCaseCount,
      warningCount: parity.warnings.length,
      warnings: parity.warnings,
      missingPrimaryActionCount: parity.recommendationParity.missingPrimaryActions.length,
      opportunityRelationConflictCount: parity.opportunityRelationParity.conflictCount,
      processManagerMutableCount: parity.processParity.managerMutableCount,
      negotiationPendingMigrationCount: parity.processParity.negotiationPendingMigrationCount,
    },
    warnings,
  };
}

function buildProcessLifecycleReadiness(state: GameState): {
  readonly projection: ProcessLifecycleReadinessProjection;
  readonly warnings: readonly ArchitectureMigrationReadinessWarning[];
} {
  const plan = buildProcessLifecycleMigrationPlan(state);
  const warnings = plan.blockedProcessCount > 0
    ? plan.items
      .filter((item) => item.readiness === 'blocked')
      .map((item) => ({
        code: `process_lifecycle_${item.processType}_blocked`,
        message: `${item.displayName} lifecycle migration is blocked before runtime process manager ownership can move.`,
        severity: 'blocking' as const,
        source: 'process-lifecycle' as const,
      }))
    : [];
  const pendingProcessTypes = plan.items
    .filter((item) => item.pendingStepCount > 0)
    .map((item) => item.processType);

  return {
    projection: {
      source: plan.source,
      readOnly: plan.readOnly,
      readiness: warnings.length > 0 ? 'blocked' : plan.watchProcessCount > 0 ? 'watch' : 'ready',
      processCount: plan.processCount,
      activeProcessCount: plan.activeProcessCount,
      readyProcessCount: plan.readyProcessCount,
      watchProcessCount: plan.watchProcessCount,
      blockedProcessCount: plan.blockedProcessCount,
      pendingStepCount: plan.items.reduce((sum, item) => sum + item.pendingStepCount, 0),
      pendingProcessTypes,
    },
    warnings,
  };
}

function optionalContract(
  contractName: OptionalMigrationContractReadiness['contractName'],
  signal?: OptionalMigrationContractSignal,
): OptionalMigrationContractReadiness {
  if (!signal) {
    return {
      contractName,
      linked: false,
      readiness: 'pending-contract',
      status: 'pending-contract',
      warningCount: 0,
      blockingWarningCount: 0,
    };
  }

  return {
    contractName,
    linked: true,
    readiness: signal.readiness || 'watch',
    status: signal.status || signal.readiness || 'linked',
    warningCount: signal.warningCount || 0,
    blockingWarningCount: signal.blockingWarningCount || 0,
  };
}

function warningCodesForSource(
  warnings: readonly ArchitectureMigrationReadinessWarning[],
  source: ArchitectureMigrationReadinessWarningSource,
) {
  return warnings
    .filter((warning) => warning.source === source)
    .map((warning) => warning.code);
}

function readinessFromOptionalContract(
  optionalContractReadiness: OptionalMigrationContractReadiness,
): ArchitectureMigrationReadiness {
  return optionalContractReadiness.readiness === 'pending-contract'
    ? 'watch'
    : optionalContractReadiness.readiness;
}

function buildNextMigrationTargets(
  caseFieldOwnership: LegacyCaseFieldOwnershipReadinessProjection,
  actionExecutor: ActionExecutorReadinessProjection,
  processLifecycle: ProcessLifecycleReadinessProjection,
  architectureParity: ArchitectureParityReadinessProjection,
  blockingWarnings: readonly ArchitectureMigrationReadinessWarning[],
  optionalContracts: ArchitectureMigrationReadinessProjection['optionalContracts'],
): readonly ArchitectureMigrationTarget[] {
  return [
    {
      id: 'case-field-migration',
      title: 'Case field migration',
      readiness: caseFieldOwnership.readiness,
      rationale: 'Legacy Case field ownership is registered by canonical owner, role, and domain facet.',
      dependsOn: ['legacy-case-field-ownership-registry'],
      blockingWarningCodes: warningCodesForSource(blockingWarnings, 'case-field-ownership'),
    },
    {
      id: 'action-resolver-split',
      title: 'Action resolver split',
      readiness: actionExecutor.readiness,
      rationale: 'Action executors have boundary contracts tied to actionTransaction resource ownership.',
      dependsOn: ['action-executor-contract-read-model', 'actionTransaction'],
      blockingWarningCodes: warningCodesForSource(blockingWarnings, 'action-executor'),
    },
    {
      id: 'process-lifecycle-ownership',
      title: 'Process lifecycle ownership',
      readiness: processLifecycle.readiness,
      rationale: 'Process lifecycle migration plan shows product run transition ownership is runtime-managed while negotiation settlement ownership is still pending.',
      dependsOn: ['process-lifecycle-migration-plan', 'process-workspace-projection'],
      blockingWarningCodes: warningCodesForSource(blockingWarnings, 'process-lifecycle'),
    },
    {
      id: 'opportunity-authority-cleanup',
      title: 'Opportunity authority cleanup',
      readiness: architectureParity.readiness,
      rationale: 'Architecture parity projection compares legacy opportunities, runtime case state, and workspace relation views.',
      dependsOn: ['architecture-parity-projection', 'opportunity-relation-workspace-projection'],
      blockingWarningCodes: warningCodesForSource(blockingWarnings, 'architecture-parity'),
    },
    {
      id: 'evaluation-model-boundary-hardening',
      title: 'Evaluation model boundary hardening',
      readiness: readinessFromOptionalContract(optionalContracts.evaluationModelBoundaries),
      rationale: 'Evaluation boundary contract can be attached when the parallel worker publishes it.',
      dependsOn: ['evaluation-model-boundaries-contract'],
      blockingWarningCodes: [],
    },
    {
      id: 'case-segment-read-model',
      title: 'Case segment read model',
      readiness: readinessFromOptionalContract(optionalContracts.caseSegments),
      rationale: 'Case segment contract is optional during parallel migration and should not block this projection.',
      dependsOn: ['case-segments-contract'],
      blockingWarningCodes: [],
    },
    {
      id: 'action-boundary-report',
      title: 'Action boundary report',
      readiness: readinessFromOptionalContract(optionalContracts.actionBoundaryReport),
      rationale: 'Action boundary report can fold in after its contract lands without changing this read-only projection.',
      dependsOn: ['action-boundary-report-contract'],
      blockingWarningCodes: [],
    },
  ];
}

export function buildArchitectureMigrationReadinessProjection(
  state: GameState,
  optionalSignals: ArchitectureMigrationReadinessOptionalSignals = {},
): ArchitectureMigrationReadinessProjection {
  const caseFieldOwnership = buildCaseFieldOwnershipReadiness();
  const actionExecutor = buildActionExecutorReadiness();
  const processLifecycle = buildProcessLifecycleReadiness(state);
  const architectureParity = buildArchitectureParityReadiness(state);
  const allWarnings = [
    ...caseFieldOwnership.warnings,
    ...actionExecutor.warnings,
    ...processLifecycle.warnings,
    ...architectureParity.warnings,
  ];
  const blockingWarnings = allWarnings.filter((warning) => warning.severity === 'blocking');
  const optionalContracts = {
    caseSegments: optionalContract('case-segments', optionalSignals.caseSegments),
    evaluationModelBoundaries: optionalContract('evaluation-model-boundaries', optionalSignals.evaluationModelBoundaries),
    actionBoundaryReport: optionalContract('action-boundary-report', optionalSignals.actionBoundaryReport),
  };

  return freezeProjection({
    projectionKind: 'architecture_migration_readiness_projection',
    source: 'legacy-game-state',
    readOnly: true,
    mutationPolicy: 'read-only-projection',
    day: state.day,
    caseFieldOwnership: caseFieldOwnership.projection,
    actionExecutor: actionExecutor.projection,
    processLifecycle: processLifecycle.projection,
    architectureParity: architectureParity.projection,
    optionalContracts,
    blockingWarnings,
    nextMigrationTargets: buildNextMigrationTargets(
      caseFieldOwnership.projection,
      actionExecutor.projection,
      processLifecycle.projection,
      architectureParity.projection,
      blockingWarnings,
      optionalContracts,
    ),
  }) as ArchitectureMigrationReadinessProjection;
}
