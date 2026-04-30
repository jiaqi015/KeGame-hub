import { ACTIONS } from '../../domain/constants.js';
import {
  getActionExecutorContract,
  type ActionExecutorContract,
} from '../../domain/engine/actionExecutorContract.js';
import {
  ACTION_MIGRATION_PLAN,
  buildActionMigrationPlan,
  type ActionMigrationPlan,
} from './action-migration-plan.js';

export type RuntimeActionExecutorFamilyId =
  | 'owner'
  | 'pricing'
  | 'marketing'
  | 'showing'
  | 'negotiation'
  | 'process'
  | 'misc';

export type RuntimeActionSplitRiskLevel = 'low' | 'medium' | 'high';

export type RuntimeActionSplitFamily = Readonly<{
  id: RuntimeActionExecutorFamilyId;
  familyId: RuntimeActionExecutorFamilyId;
  actionIds: readonly string[];
  immediateWrapperActionIds: readonly string[];
  processBlockedActionIds: readonly string[];
  ownerTouchActionIds: readonly string[];
  opportunityTouchActionIds: readonly string[];
  riskLevel: RuntimeActionSplitRiskLevel;
}>;

export type RuntimeActionSplitPlanSummary = Readonly<{
  actionCount: number;
  familyCount: number;
  recommendedFirstSplitFamilyCount: number;
  blockedFamilyCount: number;
  processBlockedActionCount: number;
}>;

export type RuntimeActionSplitPlan = Readonly<{
  source: 'action-migration-plan';
  families: readonly RuntimeActionSplitFamily[];
  familiesById: Readonly<Record<RuntimeActionExecutorFamilyId, RuntimeActionSplitFamily>>;
  recommendedFirstSplitFamilyIds: readonly RuntimeActionExecutorFamilyId[];
  blockedFamilyIds: readonly RuntimeActionExecutorFamilyId[];
  summary: RuntimeActionSplitPlanSummary;
}>;

const FAMILY_ORDER = Object.freeze([
  'owner',
  'pricing',
  'marketing',
  'showing',
  'negotiation',
  'process',
  'misc',
] satisfies RuntimeActionExecutorFamilyId[]);

function freezeArray<T>(items: T[]) {
  return Object.freeze(items);
}

function getActionFamily(action: (typeof ACTIONS)[number], contract: ActionExecutorContract | null) {
  if (contract?.startsProcessKind === 'open-day') {
    return 'process';
  }
  if (action.id === 'showing' || contract?.executorId === 'showing') {
    return 'showing';
  }
  if (action.categoryId === 'negotiation' || contract?.startsProcessKind === 'sincere-sale' || contract?.startsProcessKind === 'negotiation') {
    return 'negotiation';
  }
  if (action.categoryId === 'pricing') {
    return 'pricing';
  }
  if (action.categoryId === 'marketing') {
    return 'marketing';
  }
  if (action.categoryId === 'feedback' || contract?.touchesOwner || contract?.revealsOwnerState) {
    return 'owner';
  }
  return 'misc';
}

function riskLevelForFamily(
  actionIds: readonly string[],
  processBlockedActionIds: readonly string[],
  ownerTouchActionIds: readonly string[],
  opportunityTouchActionIds: readonly string[],
): RuntimeActionSplitRiskLevel {
  if (processBlockedActionIds.length > 0) {
    return 'high';
  }
  if (opportunityTouchActionIds.length > 0 || ownerTouchActionIds.length > 0) {
    return 'medium';
  }
  return actionIds.length > 0 ? 'low' : 'low';
}

function intersectActionIds(actionIds: readonly string[], candidates: ReadonlySet<string>) {
  return freezeArray(actionIds.filter((actionId) => candidates.has(actionId)));
}

export function buildActionSplitPlan(
  plan: ActionMigrationPlan = buildActionMigrationPlan(),
): RuntimeActionSplitPlan {
  const actionIdsByFamily = new Map<RuntimeActionExecutorFamilyId, string[]>(
    FAMILY_ORDER.map((familyId) => [familyId, []]),
  );

  for (const action of ACTIONS) {
    const contract = getActionExecutorContract(action.id);
    actionIdsByFamily.get(getActionFamily(action, contract))?.push(action.id);
  }

  const immediateWrapperActionIds = new Set(plan.immediateWrapperCandidates.map((entry) => entry.actionId));
  const processBlockedActionIds = new Set(plan.processManagerRequired.all.map((entry) => entry.actionId));
  const ownerTouchActionIds = new Set(plan.ownerRelationTouchpoints.map((entry) => entry.actionId));
  const opportunityTouchActionIds = new Set(plan.opportunityAuthorityTouchpoints.map((entry) => entry.actionId));

  const families = freezeArray(
    FAMILY_ORDER.map((familyId) => {
      const actionIds = freezeArray([...(actionIdsByFamily.get(familyId) || [])]);
      const immediateWrapperIds = intersectActionIds(actionIds, immediateWrapperActionIds);
      const blockedIds = intersectActionIds(actionIds, processBlockedActionIds);
      const ownerIds = intersectActionIds(actionIds, ownerTouchActionIds);
      const opportunityIds = intersectActionIds(actionIds, opportunityTouchActionIds);

      return Object.freeze({
        id: familyId,
        familyId,
        actionIds,
        immediateWrapperActionIds: immediateWrapperIds,
        processBlockedActionIds: blockedIds,
        ownerTouchActionIds: ownerIds,
        opportunityTouchActionIds: opportunityIds,
        riskLevel: riskLevelForFamily(actionIds, blockedIds, ownerIds, opportunityIds),
      } satisfies RuntimeActionSplitFamily);
    }),
  );

  const familiesById = Object.freeze(
    Object.fromEntries(families.map((family) => [family.id, family])),
  ) as Readonly<Record<RuntimeActionExecutorFamilyId, RuntimeActionSplitFamily>>;
  const recommendedFirstSplitFamilyIds = freezeArray(
    families
      .filter((family) => (
        family.actionIds.length > 0
        && family.processBlockedActionIds.length === 0
        && family.immediateWrapperActionIds.length === family.actionIds.length
      ))
      .map((family) => family.id),
  );
  const blockedFamilyIds = freezeArray(
    families
      .filter((family) => family.processBlockedActionIds.length > 0)
      .map((family) => family.id),
  );
  const summary = Object.freeze({
    actionCount: ACTIONS.length,
    familyCount: families.length,
    recommendedFirstSplitFamilyCount: recommendedFirstSplitFamilyIds.length,
    blockedFamilyCount: blockedFamilyIds.length,
    processBlockedActionCount: plan.processManagerRequired.all.length,
  } satisfies RuntimeActionSplitPlanSummary);

  return Object.freeze({
    source: 'action-migration-plan',
    families,
    familiesById,
    recommendedFirstSplitFamilyIds,
    blockedFamilyIds,
    summary,
  } satisfies RuntimeActionSplitPlan);
}

export const ACTION_SPLIT_PLAN = buildActionSplitPlan(ACTION_MIGRATION_PLAN);
