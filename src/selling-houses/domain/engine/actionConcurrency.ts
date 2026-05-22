import {
  OWNER_ACTION_EXECUTOR_IDS,
} from './ownerActionExecutors.js';
import {
  PRICING_ACTION_EXECUTOR_IDS,
} from './pricingActionExecutors.js';
import {
  MARKETING_ACTION_EXECUTOR_IDS,
} from './marketingActionExecutors.js';
import {
  SHOWING_ACTION_EXECUTOR_IDS,
} from './showingActionExecutors.js';
import {
  OPEN_DAY_ACTION_EXECUTOR_IDS,
} from './openDayActionExecutors.js';
import {
  SINCERITY_SALE_ACTION_EXECUTOR_IDS,
} from './sinceritySaleActionExecutors.js';
import {
  NEGOTIATION_ACTION_EXECUTOR_IDS,
} from './negotiationActionExecutors.js';

export interface ActionConcurrencyAnnotation {
  readonly isConcurrencySafe: boolean;
  readonly isReadOnly: boolean;
  readonly isDestructive: boolean;
}

function makeAnnotation(
  isConcurrencySafe: boolean,
  isReadOnly: boolean,
  isDestructive: boolean,
): ActionConcurrencyAnnotation {
  return Object.freeze({ isConcurrencySafe, isReadOnly, isDestructive });
}

const OWNER_ANNOTATION = makeAnnotation(false, false, false);
const PRICING_ANNOTATION = makeAnnotation(false, false, false);
const MARKETING_ANNOTATION = makeAnnotation(true, false, false);
const SHOWING_ANNOTATION = makeAnnotation(true, false, false);
const OPEN_DAY_ANNOTATION = makeAnnotation(false, false, false);
const SINCERITY_SALE_ANNOTATION = makeAnnotation(false, false, true);
const NEGOTIATION_ANNOTATION = makeAnnotation(false, false, true);

function annotateFamily(ids: readonly string[], annotation: ActionConcurrencyAnnotation): Record<string, ActionConcurrencyAnnotation> {
  return Object.fromEntries(ids.map((id) => [id, annotation]));
}

export const ACTION_CONCURRENCY_ANNOTATIONS: Readonly<Record<string, ActionConcurrencyAnnotation>> = Object.freeze({
  ...annotateFamily(OWNER_ACTION_EXECUTOR_IDS, OWNER_ANNOTATION),
  ...annotateFamily(PRICING_ACTION_EXECUTOR_IDS, PRICING_ANNOTATION),
  ...annotateFamily(MARKETING_ACTION_EXECUTOR_IDS, MARKETING_ANNOTATION),
  ...annotateFamily(SHOWING_ACTION_EXECUTOR_IDS, SHOWING_ANNOTATION),
  ...annotateFamily(OPEN_DAY_ACTION_EXECUTOR_IDS, OPEN_DAY_ANNOTATION),
  ...annotateFamily(SINCERITY_SALE_ACTION_EXECUTOR_IDS, SINCERITY_SALE_ANNOTATION),
  ...annotateFamily(NEGOTIATION_ACTION_EXECUTOR_IDS, NEGOTIATION_ANNOTATION),
});

export function getActionConcurrencyAnnotation(actionId: string): ActionConcurrencyAnnotation {
  const ann = ACTION_CONCURRENCY_ANNOTATIONS[actionId];
  if (!ann) throw new Error(`No concurrency annotation for action: ${actionId}`);
  return ann;
}

export function canRunInParallel(actionIdA: string, actionIdB: string): boolean {
  return getActionConcurrencyAnnotation(actionIdA).isConcurrencySafe
    && getActionConcurrencyAnnotation(actionIdB).isConcurrencySafe;
}
