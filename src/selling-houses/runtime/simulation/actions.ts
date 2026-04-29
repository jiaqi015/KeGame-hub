import type { ActionDefinition, Case } from '../../domain/models';
import type { EngineRuntimeContract } from './contracts';

export type ActionExecutionStatus =
  | 'succeeded'
  | 'rejected'
  | 'failed'
  | 'rolled_back';

export type ActionExecutionFailureReason =
  | 'unknown_action'
  | 'inactive_case'
  | 'unavailable'
  | 'missing_executor'
  | 'executor_failed'
  | 'executor_threw';

export type ActionExecutionRequest = {
  actionId: string;
  caseId?: string;
  optionId?: string | null;
};

export type ActionExecutionSuccess = {
  status: 'succeeded';
  action: ActionDefinition;
  caseItem: Case;
  optionId: string | null;
  contract?: EngineRuntimeContract;
};

export type ActionExecutionFailure = {
  status: Exclude<ActionExecutionStatus, 'succeeded'>;
  reason: ActionExecutionFailureReason;
  action?: ActionDefinition;
  caseItem?: Case | null;
  optionId?: string | null;
  message?: string;
  rolledBack?: boolean;
  manuallyRefundedResources?: boolean;
  contract?: EngineRuntimeContract;
};

export type ActionExecutionResult = ActionExecutionSuccess | ActionExecutionFailure;
