import type { Opportunity } from '../models.js';

export type ActionExecutionResult = boolean | {
  success: boolean;
  opportunity?: Opportunity | null;
};

export function actionSuccess(opportunity?: Opportunity | null): ActionExecutionResult {
  return {
    success: true,
    opportunity,
  };
}

export function isActionExecutionSuccess(result: ActionExecutionResult) {
  return typeof result === 'boolean' ? result : result.success;
}

export function getActionExecutionOpportunity(result: ActionExecutionResult) {
  return typeof result === 'boolean' ? null : result.opportunity || null;
}
