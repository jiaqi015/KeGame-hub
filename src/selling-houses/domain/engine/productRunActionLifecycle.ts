import type { Case, GameState, ProductRun } from '../models.js';
import {
  createProductRun,
  describeRunMilestone,
  findMilestoneById,
  hasActiveProductRunForTargets,
} from '../productRuns.js';
import { recordDomainEvent } from '../runtimeState.js';

export type ActionProductRunKind = 'open-day' | 'sincere-sale';

const PRODUCT_RUN_JOURNAL_COPY: Record<ActionProductRunKind, { actor: string; title: string }> = {
  'open-day': {
    actor: '开放日产品链路',
    title: '启动开放日跨天 run',
  },
  'sincere-sale': {
    actor: '诚意卖产品链路',
    title: '启动诚意卖跨天 run',
  },
};

function appendRunEventId(run: ProductRun, eventId: string) {
  if (!run.linkedEventIds) {
    run.linkedEventIds = [];
  }
  run.linkedEventIds.push(eventId);
}

export function resolveActionProductRunTargetIds(
  state: GameState,
  actionCase: Case,
  productType: ActionProductRunKind,
) {
  const targetIds = productType === 'open-day'
    ? state.cases
        .filter((entry) => entry.status === 'active' && entry.community === actionCase.community)
        .map((entry) => entry.id)
    : [actionCase.id];

  return targetIds.length > 0 ? targetIds : [actionCase.id];
}

export function startActionProductRunIfNeeded(
  state: GameState,
  actionCase: Case,
  productType: ActionProductRunKind,
) {
  const targetIds = resolveActionProductRunTargetIds(state, actionCase, productType);

  if (hasActiveProductRunForTargets(state, productType, targetIds)) {
    return null;
  }

  const run = createProductRun(state, productType, targetIds);
  state.productRuns.unshift(run);

  const milestone = findMilestoneById(run, run.nextMilestone);
  const copy = PRODUCT_RUN_JOURNAL_COPY[productType];
  const runEvent = recordDomainEvent(state, {
    kind: 'journal',
    actor: copy.actor,
    title: copy.title,
    detail: describeRunMilestone(run, milestone?.id || run.nextMilestone),
    caseId: actionCase.id,
    tone: 'success',
    payload: {
      runId: run.id,
      productType: run.productType,
      scope: run.scope,
      targetIds: run.targetIds,
      nextMilestone: run.nextMilestone,
    },
  });
  appendRunEventId(run, runEvent.id);

  return run;
}
