import type { GameState, ProductRun } from '../../../domain/models.js';
import {
  describeRunMilestone,
  findMilestoneById,
  type ProductRunTransition,
} from '../../../domain/productRuns.js';
import { logEvent, recordDomainEvent } from '../../../domain/runtimeState.js';

export interface ProductRunProcessManagerResult {
  readonly managerId: 'product-run-process-manager';
  readonly transitionOwner: 'runtime-process-manager';
  readonly transitions: readonly ProductRunTransition[];
  readonly eventIds: readonly string[];
}

function productRunDisplayName(run: ProductRun) {
  return run.productType === 'open-day' ? '开放日' : '诚意卖';
}

function appendRunEventId(run: ProductRun, eventId: string) {
  if (!run.linkedEventIds) {
    run.linkedEventIds = [];
  }
  run.linkedEventIds.push(eventId);
}

function findCurrentProcessMilestone(run: ProductRun, day: number) {
  const milestones = run.milestones || [];
  if (!milestones.length) {
    return null;
  }

  const current = milestones.find((entry) => entry.day >= day);
  return current || null;
}

function advanceProductRunProcessStateForDay(state: GameState): ProductRunTransition[] {
  const transitions: ProductRunTransition[] = [];

  state.productRuns.forEach((run) => {
    if (run.status !== 'running') {
      return;
    }

    const beforeMilestone = run.nextMilestone;
    const currentMilestone = findCurrentProcessMilestone(run, state.day);

    if (!currentMilestone) {
      run.status = 'completed';
      run.endDay = state.day;
      run.nextMilestone = 'completed';
      transitions.push({
        runId: run.id,
        productType: run.productType,
        fromMilestone: beforeMilestone,
        toMilestone: null,
        completed: true,
      });
      return;
    }

    run.nextMilestone = currentMilestone.id;
    if (beforeMilestone !== run.nextMilestone) {
      transitions.push({
        runId: run.id,
        productType: run.productType,
        fromMilestone: beforeMilestone,
        toMilestone: run.nextMilestone,
        completed: false,
      });
    }
  });

  return transitions;
}

function recordProductRunTransition(
  state: GameState,
  transition: ProductRunTransition,
) {
  const run = state.productRuns.find((entry) => entry.id === transition.runId);
  if (!run) {
    return null;
  }

  const displayName = productRunDisplayName(run);
  const title = transition.completed
    ? `${displayName} run 完成`
    : `${displayName} run 进入下一节点`;
  const detail = transition.completed
    ? describeRunMilestone(run, null)
    : describeRunMilestone(run, transition.toMilestone);
  const milestone = transition.toMilestone ? findMilestoneById(run, transition.toMilestone) : null;
  const event = recordDomainEvent(state, {
    kind: 'journal',
    actor: run.productType === 'open-day' ? '开放日产品链路' : '诚意卖产品链路',
    title,
    detail,
    caseId: run.targetIds[0],
    tone: transition.completed ? 'accent' : 'success',
    payload: {
      runId: run.id,
      productType: run.productType,
      fromMilestone: transition.fromMilestone,
      toMilestone: transition.toMilestone,
      completed: transition.completed,
      sceneKind: milestone?.kind,
      transitionOwner: 'runtime-process-manager',
    },
  });
  appendRunEventId(run, event.id);
  logEvent(state, displayName, detail, transition.completed ? 'accent' : 'success');

  return event.id;
}

export function advanceProductRunProcessesForDay(state: GameState): ProductRunProcessManagerResult {
  const transitions = advanceProductRunProcessStateForDay(state);
  const eventIds = transitions
    .map((transition) => recordProductRunTransition(state, transition))
    .filter((eventId): eventId is string => Boolean(eventId));

  return Object.freeze({
    managerId: 'product-run-process-manager',
    transitionOwner: 'runtime-process-manager',
    transitions: Object.freeze([...transitions]),
    eventIds: Object.freeze(eventIds),
  } satisfies ProductRunProcessManagerResult);
}
