import { describe, expect, it } from 'vitest';

import { ACTIONS } from '../../../domain/constants.js';
import { ACTION_EXECUTOR_CONTRACTS } from '../../../domain/engine/actionExecutorContract.js';
import { ACTION_MIGRATION_PLAN, buildActionMigrationPlan } from '../action-migration-plan.js';
import {
  ACTION_SPLIT_PLAN,
  buildActionSplitPlan,
  type RuntimeActionExecutorFamilyId,
} from '../action-split-plan.js';

function expectMutationBlocked(mutate: () => void) {
  expect(mutate).toThrow(TypeError);
}

describe('runtime action split plan', () => {
  it('groups action migration queues into executor families without executing actions', () => {
    const migrationPlan = buildActionMigrationPlan();
    const before = structuredClone(migrationPlan);
    const splitPlan = buildActionSplitPlan(migrationPlan);

    expect(migrationPlan).toEqual(before);
    expect(splitPlan).toEqual(ACTION_SPLIT_PLAN);
    expect(splitPlan.source).toBe('action-migration-plan');
    expect(splitPlan.families.map((family) => family.id)).toEqual([
      'owner',
      'pricing',
      'marketing',
      'showing',
      'negotiation',
      'process',
      'misc',
    ]);
    expect(splitPlan.families.map((family) => family.familyId)).toEqual(
      splitPlan.families.map((family) => family.id),
    );

    const actionIdsFromFamilies = splitPlan.families.flatMap((family) => family.actionIds);
    expect(new Set(actionIdsFromFamilies)).toEqual(new Set(ACTIONS.map((action) => action.id)));
    expect(actionIdsFromFamilies).toHaveLength(ACTIONS.length);

    const ownerFamily = splitPlan.familiesById.owner;
    expect(ownerFamily.actionIds).toEqual(['first-visit', 'weekly-feedback', 'deep-diagnosis']);
    expect(ownerFamily.ownerTouchActionIds).toEqual(ownerFamily.actionIds);
    expect(ownerFamily.processBlockedActionIds).toEqual([]);
    expect(ownerFamily.riskLevel).toBe('medium');

    expect(splitPlan.familiesById.marketing.actionIds).toEqual([
      'story',
      'xiaohongshu-boost',
      'broker-broadcast',
      'private-referral',
      'focus-meeting-submit',
    ]);
    expect(splitPlan.familiesById.showing.actionIds).toEqual(['showing']);
    expect(splitPlan.familiesById.showing.opportunityTouchActionIds).toEqual(['showing']);
    expect(splitPlan.familiesById.process.actionIds).toEqual(['open-day']);
    expect(splitPlan.familiesById.negotiation.actionIds).toEqual([
      'sincerity-sale',
      'invite-customer-negotiation',
    ]);

    expect(splitPlan.recommendedFirstSplitFamilyIds).toEqual([
      'owner',
      'pricing',
      'marketing',
      'showing',
    ] satisfies RuntimeActionExecutorFamilyId[]);
    expect(splitPlan.blockedFamilyIds).toEqual(['negotiation', 'process']);

    expect(splitPlan.summary).toEqual({
      actionCount: ACTIONS.length,
      familyCount: 7,
      recommendedFirstSplitFamilyCount: 4,
      blockedFamilyCount: 2,
      processBlockedActionCount: migrationPlan.processManagerRequired.all.length,
    });

    expect(ACTION_EXECUTOR_CONTRACTS.length).toBe(ACTIONS.length);
  });

  it('derives wrapper and touchpoint ids from the migration plan queues', () => {
    const splitPlan = buildActionSplitPlan(ACTION_MIGRATION_PLAN);
    const immediateWrapperIds = new Set(ACTION_MIGRATION_PLAN.immediateWrapperCandidates.map((entry) => entry.actionId));
    const ownerTouchIds = new Set(ACTION_MIGRATION_PLAN.ownerRelationTouchpoints.map((entry) => entry.actionId));
    const opportunityTouchIds = new Set(ACTION_MIGRATION_PLAN.opportunityAuthorityTouchpoints.map((entry) => entry.actionId));
    const processBlockedIds = new Set(ACTION_MIGRATION_PLAN.processManagerRequired.all.map((entry) => entry.actionId));

    for (const family of splitPlan.families) {
      expect(family.immediateWrapperActionIds).toEqual(family.actionIds.filter((actionId) => immediateWrapperIds.has(actionId)));
      expect(family.ownerTouchActionIds).toEqual(family.actionIds.filter((actionId) => ownerTouchIds.has(actionId)));
      expect(family.opportunityTouchActionIds).toEqual(family.actionIds.filter((actionId) => opportunityTouchIds.has(actionId)));
      expect(family.processBlockedActionIds).toEqual(family.actionIds.filter((actionId) => processBlockedIds.has(actionId)));
    }
  });

  it('freezes the exported split plan and nested family records', () => {
    const splitPlan = buildActionSplitPlan();

    expect(Object.isFrozen(splitPlan)).toBe(true);
    expect(Object.isFrozen(splitPlan.families)).toBe(true);
    expect(Object.isFrozen(splitPlan.families[0])).toBe(true);
    expect(Object.isFrozen(splitPlan.families[0].actionIds)).toBe(true);
    expect(Object.isFrozen(splitPlan.familiesById)).toBe(true);
    expect(Object.isFrozen(splitPlan.recommendedFirstSplitFamilyIds)).toBe(true);
    expect(Object.isFrozen(splitPlan.blockedFamilyIds)).toBe(true);
    expect(Object.isFrozen(splitPlan.summary)).toBe(true);

    expectMutationBlocked(() => {
      (splitPlan.families as unknown[]).push({});
    });
    expectMutationBlocked(() => {
      (splitPlan.familiesById.owner.actionIds as string[]).push('polluted');
    });
    expectMutationBlocked(() => {
      (splitPlan.familiesById as Record<string, unknown>).owner = {};
    });
  });
});
