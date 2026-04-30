import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const negotiationLifecycleSource = readFileSync(
  'src/selling-houses/domain/engine/negotiationActionLifecycle.ts',
  'utf8',
);
const dealClosingSource = readFileSync(
  'src/selling-houses/domain/dealClosing.ts',
  'utf8',
);
const processAdaptersSource = readFileSync(
  'src/selling-houses/runtime/simulation/processes/legacyAdapters.ts',
  'utf8',
);
const processManagerSource = readFileSync(
  'src/selling-houses/runtime/simulation/processes/negotiationProcessManager.ts',
  'utf8',
);

assert.ok(
  negotiationLifecycleSource.includes('export function queueNegotiationProcessEvaluation'),
  'negotiationActionLifecycle must export queueNegotiationProcessEvaluation',
);
assert.ok(
  negotiationLifecycleSource.includes('queueDealClosingEvaluation(state, caseItem, opportunity, optionId || \'balanced\')'),
  'queueNegotiationProcessEvaluation must delegate to queueDealClosingEvaluation with the legacy balanced fallback',
);
assert.ok(
  negotiationLifecycleSource.includes('onMessage?.'),
  'queueNegotiationProcessEvaluation must preserve the action message side effect',
);
assert.ok(
  /export function queueDealClosingEvaluation[\s\S]*?pendingClosingEvaluation\s*=\s*true/.test(dealClosingSource),
  'queueDealClosingEvaluation must continue marking opportunities as pending closing evaluations',
);
assert.ok(
  processAdaptersSource.includes('mapPendingClosingOpportunityToNegotiationProcess'),
  'runtime process adapters must keep mapping pending closing opportunities to negotiation processes',
);
assert.ok(
  processAdaptersSource.includes("currentStepId: 'pending-closing-evaluation'"),
  'negotiation process read model must keep the pending-closing-evaluation step id',
);
assert.ok(
  processAdaptersSource.includes('runtime NegotiationProcessManager owns settlement entry; legacy deal closing owns close/fail/capacity outcome'),
  'negotiation process boundary must show runtime settlement entry with legacy outcome ownership',
);
assert.ok(
  processManagerSource.includes('settlePendingDealClosings(state)'),
  'negotiation process manager must delegate settlement outcome resolution to the legacy deal closing engine for now',
);

console.log('selling-houses negotiation action lifecycle contract verification passed');
