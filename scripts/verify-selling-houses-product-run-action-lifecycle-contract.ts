import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const productRunActionLifecycleSource = readFileSync(
  'src/selling-houses/domain/engine/productRunActionLifecycle.ts',
  'utf8',
);
const openDayActionExecutorsSource = readFileSync(
  'src/selling-houses/domain/engine/openDayActionExecutors.ts',
  'utf8',
);
const sinceritySaleActionExecutorsSource = readFileSync(
  'src/selling-houses/domain/engine/sinceritySaleActionExecutors.ts',
  'utf8',
);
const actionResolversSource = readFileSync(
  'src/selling-houses/domain/engine/actionResolvers.ts',
  'utf8',
);

function extractStringLiteralUnion(source: string, typeName: string) {
  const match = new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*([^;]+);`).exec(source);
  assert.ok(match, `${typeName} must be exported as a string literal union`);

  return Array.from(match[1].matchAll(/'([^']+)'/g), ([, value]) => value);
}

assert.ok(
  productRunActionLifecycleSource.includes('export type ActionProductRunKind'),
  'productRunActionLifecycle must export ActionProductRunKind',
);
assert.ok(
  productRunActionLifecycleSource.includes('export function resolveActionProductRunTargetIds'),
  'productRunActionLifecycle must export resolveActionProductRunTargetIds',
);
assert.ok(
  productRunActionLifecycleSource.includes('export function startActionProductRunIfNeeded'),
  'productRunActionLifecycle must export startActionProductRunIfNeeded',
);

const productRunKinds = extractStringLiteralUnion(productRunActionLifecycleSource, 'ActionProductRunKind');
assert.deepEqual(
  productRunKinds.slice().sort(),
  ['open-day', 'sincere-sale'],
  'ActionProductRunKind must support exactly open-day and sincere-sale',
);
assert.equal(
  productRunKinds.length,
  new Set(productRunKinds).size,
  'ActionProductRunKind must not contain duplicate product kinds',
);
assert.ok(
  productRunActionLifecycleSource.includes("productType === 'open-day'"),
  'resolveActionProductRunTargetIds must branch open-day target resolution',
);
assert.ok(
  productRunActionLifecycleSource.includes(': [actionCase.id]'),
  'resolveActionProductRunTargetIds must keep sincere-sale scoped to the action case',
);

assert.ok(
  /if\s*\(\s*hasActiveProductRunForTargets\s*\(\s*state\s*,\s*productType\s*,\s*targetIds\s*\)\s*\)\s*{\s*return\s+null;?\s*}/s
    .test(productRunActionLifecycleSource),
  'startActionProductRunIfNeeded must use hasActiveProductRunForTargets to avoid duplicate active runs',
);
assert.ok(
  productRunActionLifecycleSource.includes('const run = createProductRun(state, productType, targetIds)'),
  'startActionProductRunIfNeeded must create ProductRun through createProductRun',
);
assert.ok(
  /recordDomainEvent\s*\(\s*state\s*,\s*{[\s\S]*?kind:\s*'journal'/.test(productRunActionLifecycleSource),
  'startActionProductRunIfNeeded must record a journal domain event for the started run',
);
assert.ok(
  /run\.linkedEventIds\.push\s*\(\s*eventId\s*\)/.test(productRunActionLifecycleSource),
  'productRunActionLifecycle must append lifecycle event ids to run.linkedEventIds',
);
assert.ok(
  productRunActionLifecycleSource.includes('appendRunEventId(run, runEvent.id)'),
  'startActionProductRunIfNeeded must link the created journal event id back to the run',
);

assert.ok(
  openDayActionExecutorsSource.includes("startActionProductRunIfNeeded(state, caseItem, 'open-day')"),
  'openDayActionExecutors must create open-day runs through startActionProductRunIfNeeded',
);
assert.ok(
  !openDayActionExecutorsSource.includes('createProductRun('),
  'openDayActionExecutors must not duplicate ProductRun creation outside the lifecycle helper',
);
assert.ok(
  !openDayActionExecutorsSource.includes('hasActiveProductRunForTargets('),
  'openDayActionExecutors must not duplicate active ProductRun checks outside the lifecycle helper',
);

assert.ok(
  actionResolversSource.includes('...SINCERITY_SALE_ACTION_EXECUTORS'),
  'actionResolvers must register sincerity-sale through SINCERITY_SALE_ACTION_EXECUTORS after executor split',
);
assert.ok(
  sinceritySaleActionExecutorsSource.includes("startActionProductRunIfNeeded(state, caseItem, 'sincere-sale')"),
  'sinceritySaleActionExecutors must create sincere-sale runs through startActionProductRunIfNeeded',
);
assert.ok(
  !actionResolversSource.includes('createProductRun('),
  'actionResolvers must not duplicate ProductRun creation outside the lifecycle helper',
);
assert.ok(
  !actionResolversSource.includes('hasActiveProductRunForTargets('),
  'actionResolvers must not duplicate active ProductRun checks outside the lifecycle helper',
);
assert.ok(
  !sinceritySaleActionExecutorsSource.includes('createProductRun('),
  'sinceritySaleActionExecutors must not duplicate ProductRun creation outside the lifecycle helper',
);
assert.ok(
  !sinceritySaleActionExecutorsSource.includes('hasActiveProductRunForTargets('),
  'sinceritySaleActionExecutors must not duplicate active ProductRun checks outside the lifecycle helper',
);

console.log('selling-houses product run action lifecycle contract verification passed');
