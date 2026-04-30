import { ACTIONS } from '../constants.js';
import {
  getActionStageRelation,
  type ActionStageRelation,
  type OpportunityStageWindow,
} from '../actionStageRelations.js';

export type ActionExecutorProcessKind = 'open-day' | 'sincere-sale' | 'negotiation';

export type ActionExecutorCoverage = 'legacy-action-resolver' | 'explicit-gap';

export interface ActionExecutorContract {
  actionId: string;
  executorId: string;
  actionName: string;
  coverage: ActionExecutorCoverage;
  stageRelation: ActionStageRelation;
  touchesOwner: boolean;
  revealsOwnerState: boolean;
  opportunityBound: boolean;
  opportunityStageWindow: OpportunityStageWindow | null;
  resourcesManagedByTransaction: boolean;
  startsProcessKind: ActionExecutorProcessKind | null;
  legacyExecutorOwnsProcessRun: boolean;
  queuesPendingClosingEvaluation: boolean;
  explicitGapReason?: string;
}

export interface ActionExecutorContractReadModel {
  source: 'legacy-action-resolvers';
  resourcesBoundary: 'actionTransaction';
  actionCount: number;
  contractCount: number;
  missingActionIds: readonly string[];
  ownerTouchActionIds: readonly string[];
  opportunityBoundActionIds: readonly string[];
  revealsOwnerStateActionIds: readonly string[];
  processActionIds: readonly string[];
  legacyProcessRunActionIds: readonly string[];
}

const EXPLICIT_EXECUTOR_GAPS: Record<string, { reason: string }> = {};

const PROCESS_BOUNDARY_BY_EXECUTOR_ID: Record<string, Pick<ActionExecutorContract,
  'startsProcessKind' | 'legacyExecutorOwnsProcessRun' | 'queuesPendingClosingEvaluation'
>> = {
  'open-day': {
    startsProcessKind: 'open-day',
    legacyExecutorOwnsProcessRun: true,
    queuesPendingClosingEvaluation: false,
  },
  'sincerity-sale': {
    startsProcessKind: 'sincere-sale',
    legacyExecutorOwnsProcessRun: true,
    queuesPendingClosingEvaluation: false,
  },
  'invite-customer-negotiation': {
    startsProcessKind: 'negotiation',
    legacyExecutorOwnsProcessRun: false,
    queuesPendingClosingEvaluation: true,
  },
};

function getExecutorId(action: (typeof ACTIONS)[number]) {
  return action.executorId || action.id;
}

function getProcessBoundary(executorId: string) {
  return PROCESS_BOUNDARY_BY_EXECUTOR_ID[executorId] || {
    startsProcessKind: null,
    legacyExecutorOwnsProcessRun: false,
    queuesPendingClosingEvaluation: false,
  };
}

function buildActionExecutorContract(action: (typeof ACTIONS)[number]): ActionExecutorContract | null {
  const executorId = getExecutorId(action);
  const relation = getActionStageRelation(executorId);
  const explicitGap = EXPLICIT_EXECUTOR_GAPS[action.id];
  if (!relation) {
    return null;
  }

  const processBoundary = getProcessBoundary(executorId);
  return Object.freeze({
    actionId: action.id,
    executorId,
    actionName: action.name,
    coverage: explicitGap ? 'explicit-gap' : 'legacy-action-resolver',
    stageRelation: relation,
    touchesOwner: relation.touchesOwner === true,
    revealsOwnerState: relation.revealsOwnerState === true,
    opportunityBound: relation.availabilityKind === 'opportunity-bound',
    opportunityStageWindow: relation.opportunityStageWindow || null,
    resourcesManagedByTransaction: true,
    startsProcessKind: processBoundary.startsProcessKind,
    legacyExecutorOwnsProcessRun: processBoundary.legacyExecutorOwnsProcessRun,
    queuesPendingClosingEvaluation: processBoundary.queuesPendingClosingEvaluation,
    explicitGapReason: explicitGap?.reason,
  } satisfies ActionExecutorContract);
}

export const ACTION_EXECUTOR_CONTRACTS = Object.freeze(
  ACTIONS
    .map((action) => buildActionExecutorContract(action))
    .filter((entry): entry is ActionExecutorContract => Boolean(entry)),
);

export const ACTION_EXECUTOR_CONTRACT_BY_EXECUTOR_ID = Object.freeze(
  Object.fromEntries(ACTION_EXECUTOR_CONTRACTS.map((entry) => [entry.executorId, entry])),
) as Readonly<Record<string, ActionExecutorContract>>;

export const ACTION_EXECUTOR_CONTRACT_BY_ACTION_ID = Object.freeze(
  Object.fromEntries(ACTION_EXECUTOR_CONTRACTS.map((entry) => [entry.actionId, entry])),
) as Readonly<Record<string, ActionExecutorContract>>;

export function getActionExecutorContract(actionOrExecutorId: string) {
  return ACTION_EXECUTOR_CONTRACT_BY_ACTION_ID[actionOrExecutorId]
    || ACTION_EXECUTOR_CONTRACT_BY_EXECUTOR_ID[actionOrExecutorId]
    || null;
}

export function getActionsMissingExecutorContract() {
  return ACTIONS
    .map((action) => action.id)
    .filter((actionId) => (
      !ACTION_EXECUTOR_CONTRACT_BY_ACTION_ID[actionId]
      && !EXPLICIT_EXECUTOR_GAPS[actionId]
    ));
}

export const ACTION_EXECUTOR_CONTRACT_READ_MODEL = Object.freeze({
  source: 'legacy-action-resolvers',
  resourcesBoundary: 'actionTransaction',
  actionCount: ACTIONS.length,
  contractCount: ACTION_EXECUTOR_CONTRACTS.length,
  missingActionIds: Object.freeze(getActionsMissingExecutorContract()),
  ownerTouchActionIds: Object.freeze(ACTION_EXECUTOR_CONTRACTS.filter((entry) => entry.touchesOwner).map((entry) => entry.actionId)),
  opportunityBoundActionIds: Object.freeze(ACTION_EXECUTOR_CONTRACTS.filter((entry) => entry.opportunityBound).map((entry) => entry.actionId)),
  revealsOwnerStateActionIds: Object.freeze(ACTION_EXECUTOR_CONTRACTS.filter((entry) => entry.revealsOwnerState).map((entry) => entry.actionId)),
  processActionIds: Object.freeze(ACTION_EXECUTOR_CONTRACTS.filter((entry) => entry.startsProcessKind).map((entry) => entry.actionId)),
  legacyProcessRunActionIds: Object.freeze(ACTION_EXECUTOR_CONTRACTS.filter((entry) => entry.legacyExecutorOwnsProcessRun).map((entry) => entry.actionId)),
} satisfies ActionExecutorContractReadModel);
