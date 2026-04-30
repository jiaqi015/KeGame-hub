import type { Case, GameState } from '../../domain/models.js';
import { recordDomainEvent } from '../../domain/runtimeState.js';
import {
  ACTION_SPEC_BY_ID,
  BUSINESS_FLOW_BY_ID,
} from '../../core/business-rules/index.js';

function snapshotSignals(caseItem: Case) {
  return {
    trust: caseItem.trust,
    heat: caseItem.heat,
    urgency: caseItem.urgency,
    intent: caseItem.d1,
    windowDays: caseItem.windowDays,
    stageIndex: caseItem.stageIndex,
  };
}

export function emitDecisionMomentTriggers(
  state: GameState,
  actionId: string,
  caseItem: Case,
  optionId?: string,
): void {
  const spec = ACTION_SPEC_BY_ID[actionId];
  if (!spec || !spec.decisionMomentIds?.length) return;

  for (const momentId of spec.decisionMomentIds) {
    recordDomainEvent(state, {
      kind: 'decision_moment_triggered',
      actor: 'system',
      title: '决策时刻触发',
      detail: `${actionId} → ${momentId}`,
      tone: 'accent',
      caseId: caseItem.id,
      payload: {
        momentId,
        actionId,
        optionId,
        signalsSnapshot: snapshotSignals(caseItem),
      },
    });
  }
}

export function advanceFlowProgress(
  state: GameState,
  actionId: string,
  caseId: string,
): void {
  const spec = ACTION_SPEC_BY_ID[actionId];
  if (!spec || !spec.businessFlowIds?.length) return;

  state.flowProgress ??= {};

  for (const flowId of spec.businessFlowIds) {
    const flow = BUSINESS_FLOW_BY_ID[flowId];
    if (!flow) continue;

    const progress = state.flowProgress[flowId] ?? {
      flowId,
      activatedDay: state.day,
      completedStepIds: [],
      currentStepId: null,
    };

    const matchingStep = flow.steps.find((s) => s.actionIds.includes(actionId));
    if (!matchingStep) continue;

    if (
      progress.currentStepId !== matchingStep.id
      && !progress.completedStepIds.includes(matchingStep.id)
    ) {
      if (
        progress.currentStepId
        && !progress.completedStepIds.includes(progress.currentStepId)
      ) {
        progress.completedStepIds.push(progress.currentStepId);
      }
      progress.currentStepId = matchingStep.id;

      recordDomainEvent(state, {
        kind: 'business_flow_step_advanced',
        actor: 'system',
        title: '业务流程推进',
        detail: `${flowId} → ${matchingStep.id}`,
        tone: 'accent',
        caseId,
        payload: { flowId, stepId: matchingStep.id, actionId },
      });
    }

    state.flowProgress[flowId] = progress;
  }
}
