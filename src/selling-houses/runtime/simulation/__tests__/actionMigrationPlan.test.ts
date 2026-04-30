import { describe, expect, it } from 'vitest';

import {
  ACTION_BOUNDARY_REPORT,
  buildActionBoundaryReport,
  type RuntimeActionBoundaryReport,
} from '../action-boundary-report.js';
import {
  ACTION_MIGRATION_PLAN,
  buildActionMigrationPlan,
} from '../action-migration-plan.js';

function expectMutationBlocked(mutate: () => void) {
  expect(mutate).toThrow(TypeError);
}

describe('runtime action migration plan', () => {
  it('derives wrapper/process/touchpoint queues from the action boundary report without mutating it', () => {
    const report = buildActionBoundaryReport();
    const before = structuredClone(report);
    const plan = buildActionMigrationPlan(report);

    expect(report).toEqual(before);
    expect(plan).toEqual(ACTION_MIGRATION_PLAN);
    expect(plan.source).toBe('runtime-action-boundary-report');
    expect(plan.resourcesBoundary).toBe('actionTransaction');

    expect(plan.immediateWrapperCandidates.map((entry) => entry.actionId)).toEqual(
      report.actions
        .filter((entry) => entry.resourcesManagedByTransaction && entry.processKind === 'none')
        .map((entry) => entry.actionId),
    );

    expect(plan.processManagerRequired['open-day'].map((entry) => entry.actionId)).toEqual(['open-day']);
    expect(plan.processManagerRequired['sincere-sale'].map((entry) => entry.actionId)).toEqual(['sincerity-sale']);
    expect(plan.processManagerRequired.negotiation.map((entry) => entry.actionId)).toEqual([
      'invite-customer-negotiation',
    ]);
    expect(plan.processManagerRequired.all.map((entry) => entry.actionId)).toEqual(
      report.actions.filter((entry) => entry.startsProcess).map((entry) => entry.actionId),
    );

    expect(plan.ownerRelationTouchpoints.map((entry) => entry.actionId)).toEqual(
      report.actions
        .filter((entry) => entry.touchesOwner || entry.revealsOwnerState)
        .map((entry) => entry.actionId),
    );
    expect(plan.ownerRelationTouchpoints.some((entry) => entry.revealsOwnerState)).toBe(true);

    expect(plan.opportunityAuthorityTouchpoints.map((entry) => entry.actionId)).toEqual(
      report.actions
        .filter((entry) => entry.opportunityBound || entry.queuesPendingClosingEvaluation)
        .map((entry) => entry.actionId),
    );
    expect(plan.opportunityAuthorityTouchpoints.some((entry) => entry.queuesPendingClosingEvaluation)).toBe(true);

    expect(plan.riskNotes.map((entry) => entry.actionId)).toEqual(
      report.actions
        .filter((entry) => entry.legacyExecutorOwnsProcessRun)
        .map((entry) => entry.actionId),
    );
    expect(plan.riskNotes.map((entry) => entry.actionId)).toEqual(['open-day', 'sincerity-sale']);
    expect(plan.riskNotes.every((entry) => entry.note.includes('legacy executor still owns process run lifecycle'))).toBe(true);
    expect(plan.riskNotes.every((entry) => entry.note.includes('move lifecycle ownership'))).toBe(true);

    expect(plan.summary).toEqual({
      immediateWrapperCandidateCount: plan.immediateWrapperCandidates.length,
      processManagerRequiredCount: plan.processManagerRequired.all.length,
      ownerRelationTouchpointCount: plan.ownerRelationTouchpoints.length,
      opportunityAuthorityTouchpointCount: plan.opportunityAuthorityTouchpoints.length,
      riskNoteCount: plan.riskNotes.length,
    });
  });

  it('freezes the exported plan and derived nested queues', () => {
    const plan = buildActionMigrationPlan(ACTION_BOUNDARY_REPORT);

    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.immediateWrapperCandidates)).toBe(true);
    expect(Object.isFrozen(plan.processManagerRequired)).toBe(true);
    expect(Object.isFrozen(plan.processManagerRequired['open-day'])).toBe(true);
    expect(Object.isFrozen(plan.processManagerRequired.all[0])).toBe(true);
    expect(Object.isFrozen(plan.ownerRelationTouchpoints)).toBe(true);
    expect(Object.isFrozen(plan.opportunityAuthorityTouchpoints)).toBe(true);
    expect(Object.isFrozen(plan.riskNotes)).toBe(true);
    expect(Object.isFrozen(plan.missingActionIds)).toBe(true);
    expect(Object.isFrozen(plan.summary)).toBe(true);

    expectMutationBlocked(() => {
      (plan.immediateWrapperCandidates as unknown[]).push({});
    });
    expectMutationBlocked(() => {
      (plan.missingActionIds as unknown[]).push('polluted');
    });
    expectMutationBlocked(() => {
      (plan.processManagerRequired as Record<string, unknown>)['open-day'] = [];
    });
    expectMutationBlocked(() => {
      (plan.processManagerRequired.all[0] as { actionId: string }).actionId = 'polluted';
    });
  });

  it('does not mutate caller-provided report objects', () => {
    const mutableReport = structuredClone(ACTION_BOUNDARY_REPORT) as RuntimeActionBoundaryReport;
    const before = structuredClone(mutableReport);

    const plan = buildActionMigrationPlan(mutableReport);

    expect(mutableReport).toEqual(before);
    expect(plan.immediateWrapperCandidates.length).toBeGreaterThan(0);
  });
});
