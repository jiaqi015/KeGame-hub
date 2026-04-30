import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { ACTIONS } from '../src/selling-houses/domain/constants.js';
import {
  ACTION_BOUNDARY_REPORT,
  buildActionBoundaryReport,
  type RuntimeActionBoundaryReport,
  type RuntimeActionBoundaryReportEntry,
} from '../src/selling-houses/runtime/simulation/action-boundary-report.js';

const SOURCE_PATH = 'src/selling-houses/runtime/simulation/action-migration-plan.ts';
const IMPORT_PATH = '../src/selling-houses/runtime/simulation/action-migration-plan.js';

if (!existsSync(SOURCE_PATH)) {
  console.log(
    `selling-houses action migration plan contract skipped: ${SOURCE_PATH} not present yet`,
  );
  process.exit(0);
}

type ActionMigrationPlanEntry = Readonly<RuntimeActionBoundaryReportEntry & {
  migrationStep?: string;
  note?: string;
}>;

type ActionMigrationPlan = {
  source: 'runtime-action-boundary-report';
  resourcesBoundary: 'actionTransaction';
  missingActionIds?: readonly string[];
  immediateWrapperCandidates: readonly ActionMigrationPlanEntry[];
  processManagerRequired: Readonly<{
    all: readonly ActionMigrationPlanEntry[];
    'open-day': readonly ActionMigrationPlanEntry[];
    'sincere-sale': readonly ActionMigrationPlanEntry[];
    negotiation: readonly ActionMigrationPlanEntry[];
  }>;
  ownerRelationTouchpoints: readonly ActionMigrationPlanEntry[];
  opportunityAuthorityTouchpoints: readonly ActionMigrationPlanEntry[];
  riskNotes: readonly ActionMigrationPlanEntry[];
  summary: Readonly<{
    immediateWrapperCandidateCount: number;
    processManagerRequiredCount: number;
    ownerRelationTouchpointCount: number;
    opportunityAuthorityTouchpointCount: number;
    riskNoteCount: number;
  }>;
};

const actionMigrationPlanModule = await import(IMPORT_PATH) as {
  ACTION_MIGRATION_PLAN?: ActionMigrationPlan;
  buildActionMigrationPlan?: (report?: RuntimeActionBoundaryReport) => ActionMigrationPlan;
};

assert.equal(
  typeof actionMigrationPlanModule.buildActionMigrationPlan,
  'function',
  'Expected buildActionMigrationPlan export',
);
assert.ok(
  actionMigrationPlanModule.ACTION_MIGRATION_PLAN,
  'Expected ACTION_MIGRATION_PLAN export',
);

const buildActionMigrationPlan = actionMigrationPlanModule.buildActionMigrationPlan as (
  report?: RuntimeActionBoundaryReport
) => ActionMigrationPlan;
const ACTION_MIGRATION_PLAN = actionMigrationPlanModule.ACTION_MIGRATION_PLAN as ActionMigrationPlan;

function ids(entries: readonly { actionId: string }[]) {
  return entries.map((entry) => entry.actionId);
}

function expectMutationBlocked(label: string, mutate: () => void) {
  assert.throws(mutate, TypeError, `${label} should be read-only`);
}

const report = buildActionBoundaryReport();
const beforeReport = structuredClone(report);
const plan = buildActionMigrationPlan(report);

assert.deepEqual(report, beforeReport, 'buildActionMigrationPlan must not mutate the action boundary report');
assert.deepEqual(plan, ACTION_MIGRATION_PLAN, 'Expected exported migration plan to match builder output');
assert.equal(plan.source, 'runtime-action-boundary-report');
assert.equal(plan.resourcesBoundary, 'actionTransaction');
assert.deepEqual(
  plan.missingActionIds,
  ACTION_BOUNDARY_REPORT.missingActionIds,
  'Expected action migration plan not to lose missingActionIds from ACTION_BOUNDARY_REPORT',
);

assert.deepEqual(
  ids(plan.immediateWrapperCandidates),
  ids(report.actions.filter((entry) => entry.resourcesManagedByTransaction && entry.processKind === 'none')),
  'Expected immediate wrappers to cover non-process transaction-managed actions',
);
assert.deepEqual(
  ids(plan.processManagerRequired.all),
  report.processStartingActionIds,
  'processManagerRequired.all must match ACTION_BOUNDARY_REPORT processStartingActionIds',
);
assert.deepEqual(
  Array.from(new Set([
    ...ids(plan.immediateWrapperCandidates),
    ...ids(plan.processManagerRequired.all),
  ])).sort(),
  ACTIONS.map((entry) => entry.id).sort(),
  'Expected immediateWrapperCandidates + processManagerRequired to cover every action',
);
assert.deepEqual(
  ids(plan.processManagerRequired['open-day']),
  ids(report.byProcessKind['open-day']),
  'Expected open-day process manager queue to mirror the action boundary report',
);
assert.deepEqual(
  ids(plan.processManagerRequired['sincere-sale']),
  ids(report.byProcessKind['sincere-sale']),
  'Expected sincere-sale process manager queue to mirror the action boundary report',
);
assert.deepEqual(
  ids(plan.processManagerRequired.negotiation),
  ids(report.byProcessKind.negotiation),
  'Expected negotiation process manager queue to mirror the action boundary report',
);

assert.deepEqual(
  ids(plan.ownerRelationTouchpoints),
  ids(report.actions.filter((entry) => entry.touchesOwner || entry.revealsOwnerState)),
  'Expected owner relation touchpoints to match owner-touch/reveal actions',
);
assert.deepEqual(
  ids(plan.opportunityAuthorityTouchpoints),
  ids(report.actions.filter((entry) => entry.opportunityBound || entry.queuesPendingClosingEvaluation)),
  'Expected opportunity authority touchpoints to match opportunity-bound/closing actions',
);
assert.deepEqual(
  ids(plan.riskNotes),
  ids(report.actions.filter((entry) => entry.legacyExecutorOwnsProcessRun)),
  'Expected risk notes to track legacy process-owned actions',
);

assert.deepEqual(plan.summary, {
  immediateWrapperCandidateCount: plan.immediateWrapperCandidates.length,
  processManagerRequiredCount: plan.processManagerRequired.all.length,
  ownerRelationTouchpointCount: plan.ownerRelationTouchpoints.length,
  opportunityAuthorityTouchpointCount: plan.opportunityAuthorityTouchpoints.length,
  riskNoteCount: plan.riskNotes.length,
});

assert.ok(Object.isFrozen(plan), 'Expected migration plan root to be frozen');
assert.ok(Object.isFrozen(plan.immediateWrapperCandidates), 'Expected immediateWrapperCandidates to be frozen');
assert.ok(Object.isFrozen(plan.processManagerRequired), 'Expected processManagerRequired to be frozen');
assert.ok(Object.isFrozen(plan.processManagerRequired.all), 'Expected processManagerRequired.all to be frozen');
assert.ok(Object.isFrozen(plan.summary), 'Expected migration plan summary to be frozen');

expectMutationBlocked('migration plan root', () => {
  (plan as unknown as Record<string, unknown>).polluted = true;
});
expectMutationBlocked('process manager queue', () => {
  (plan.processManagerRequired.all as unknown[]).push({});
});
if (plan.processManagerRequired.all[0]) {
  expectMutationBlocked('process manager entry', () => {
    (plan.processManagerRequired.all[0] as { actionId: string }).actionId = 'polluted';
  });
}

console.log('selling-houses action migration plan contract verification passed');
