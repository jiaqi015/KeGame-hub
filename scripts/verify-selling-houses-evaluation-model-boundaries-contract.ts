import assert from 'node:assert/strict';

import {
  EVALUATION_MODEL_BOUNDARIES,
  getEvaluationModelBoundary,
  type EvaluationModelBoundary,
  type SellingHousesEvaluationSnapshot,
} from '../src/selling-houses/core/evaluation/index.js';

type EvaluationModelId = SellingHousesEvaluationSnapshot['modelId'];

const EXPECTED_MODEL_IDS = {
  'asset-score': true,
  'owner-decision-readiness': true,
  'opportunity-score': true,
  'region-open-day-fit': true,
} satisfies Record<EvaluationModelId, true>;

const expectedModelIds = Object.keys(EXPECTED_MODEL_IDS).sort();
const registeredModelIds = EVALUATION_MODEL_BOUNDARIES.map((entry) => entry.modelId).sort();

assert.deepEqual(
  registeredModelIds,
  expectedModelIds,
  'All SellingHousesEvaluationSnapshot modelIds must be registered exactly once',
);

function requireBoundary(modelId: EvaluationModelId): EvaluationModelBoundary {
  const boundary = getEvaluationModelBoundary(modelId);
  assert.ok(boundary, `Expected ${modelId} boundary to be registered`);
  return boundary;
}

function allowedFields(boundary: EvaluationModelBoundary) {
  return new Set(boundary.allowedInputFacets.flatMap((entry) => entry.fields));
}

function hasForbiddenFacet(boundary: EvaluationModelBoundary, facet: string) {
  return boundary.forbiddenInputFacets.some((entry) => entry.facet === facet);
}

function hasLegacyMirror(boundary: EvaluationModelBoundary, field: string) {
  return boundary.legacyMirrorFields.some((entry) => entry.field === field);
}

const assetScore = requireBoundary('asset-score');
assert.equal(assetScore.canonicalOutputOwner, 'GoodHouseEvaluation');
assert.match(assetScore.canonicalOutputConcept, /好房分|asset/i);
assert.ok(
  hasForbiddenFacet(assetScore, 'broker-owner-relation'),
  'asset-score must forbid broker-owner-relation as canonical input',
);

for (const field of ['trust', 'urgency', 'patience']) {
  assert.ok(
    !allowedFields(assetScore).has(field),
    `${field} must not be an asset-score canonical allowed input`,
  );
}

for (const boundary of EVALUATION_MODEL_BOUNDARIES) {
  if (boundary.modelId === 'owner-decision-readiness') {
    continue;
  }
  for (const field of ['trust', 'urgency', 'patience', 'windowDays', 'lastOwnerTouchedDay']) {
    assert.ok(
      !allowedFields(boundary).has(field),
      `${field} must only be a raw canonical input for owner-decision-readiness`,
    );
  }
}

for (const field of ['d1', 'd2', 'd3', 'competitiveness']) {
  assert.ok(
    hasLegacyMirror(assetScore, field),
    `${field} must be declared as an asset-score legacy mirror field`,
  );
}

const legacyD3MixedSignals = assetScore.legacyMirrorFields.find(
  (entry) => entry.field === 'legacyD3MixedSignals',
);
assert.equal(legacyD3MixedSignals?.warningLevel, 'legacy-warning');
assert.equal(
  legacyD3MixedSignals?.futureCanonicalInput,
  false,
  'legacyD3MixedSignals can be warned on but must not become a future canonical asset-score input',
);

const ownerDecisionReadiness = requireBoundary('owner-decision-readiness');
const ownerAllowedFields = allowedFields(ownerDecisionReadiness);
for (const field of ['trust', 'urgency', 'patience', 'windowDays', 'lastOwnerTouchedDay']) {
  assert.ok(
    ownerAllowedFields.has(field),
    `owner-decision-readiness must cover ${field}`,
  );
}

requireBoundary('opportunity-score');
requireBoundary('region-open-day-fit');

console.log('selling-houses evaluation model boundaries contract verification passed');
