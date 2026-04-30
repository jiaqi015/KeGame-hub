import assert from 'node:assert/strict';

import type { Case } from '../src/selling-houses/domain/models.js';
import {
  getLegacyCaseFieldOwnership,
  LEGACY_CASE_COMPATIBILITY_MIRROR_FIELDS,
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES,
} from '../src/selling-houses/core/world-state/index.js';

type CaseField = keyof Case;

const requiredCanonicalOwners = [
  'asset-case',
  'owner',
  'owner-case-relation',
  'broker-owner-relation',
  'evaluation-mirror',
  'process-mirror',
  'runtime-scratch',
  'projection-ui',
  'deprecated-legacy',
] as const;

const highRiskFields = [
  'trust',
  'urgency',
  'patience',
  'd1',
  'd2',
  'd3',
  'competitiveness',
  'axisScores',
  'viewings',
  'offers',
  'stageIndex',
  'askPrice',
  'marketPrice',
  'bottomPrice',
  'windowDays',
  'lastOwnerTouchedDay',
  'touchedOwnerToday',
  'riskFlags',
  'isFocused',
] as const satisfies readonly CaseField[];

function ownership(field: CaseField) {
  return getLegacyCaseFieldOwnership(field);
}

assert.ok(
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.length >= highRiskFields.length,
  'Expected ownership registry to cover at least the high-risk field set',
);

for (const owner of requiredCanonicalOwners) {
  assert.ok(
    LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.some((entry) => entry.canonicalOwner === owner),
    `Expected ownership registry to include ${owner}`,
  );
}

for (const field of highRiskFields) {
  assert.ok(ownership(field), `Expected ownership registry to cover ${field}`);
}

assert.notEqual(
  ownership('trust').canonicalOwner,
  'asset-case',
  'trust must not be treated as an asset-case field',
);
assert.equal(
  ownership('trust').canonicalOwner,
  'broker-owner-relation',
  'trust belongs to the broker-owner relationship mirror, not the house fact',
);

for (const field of ['urgency', 'patience'] as const) {
  const entry = ownership(field);
  assert.ok(
    entry.canonicalOwner === 'owner'
      || entry.canonicalOwner === 'owner-case-relation'
      || entry.targetConcept === 'OwnerDecisionReadiness',
    `${field} must belong to owner-side decision state, not AssetCase`,
  );
  assert.notEqual(entry.canonicalOwner, 'asset-case', `${field} must not be an asset-case field`);
}

for (const field of ['d1', 'd2', 'd3', 'competitiveness'] as const) {
  const entry = ownership(field);
  assert.equal(entry.canonicalOwner, 'evaluation-mirror', `${field} must be an evaluation mirror`);
  assert.equal(entry.legacyRole, 'compatibility-mirror', `${field} must be marked as a compatibility mirror`);
}

for (const field of ['viewings', 'offers', 'stageIndex'] as const) {
  assert.equal(
    ownership(field).canonicalOwner,
    'process-mirror',
    `${field} must be treated as a process/lifecycle mirror`,
  );
}

for (const field of ['askPrice', 'marketPrice', 'bottomPrice'] as const) {
  const entry = ownership(field);
  assert.equal(entry.domainFacet, 'asset-pricing', `${field} must stay in the asset pricing boundary`);
  assert.ok(
    entry.canonicalOwner === 'owner-case-relation' || entry.canonicalOwner === 'evaluation-mirror',
    `${field} must belong to owner-case relation or asset pricing output`,
  );
}

const axisScores = ownership('axisScores');
assert.equal(axisScores.canonicalOwner, 'evaluation-mirror');
assert.equal(axisScores.targetConcept, 'AssetScoreSnapshot.inputs.axisScores');
assert.equal(axisScores.legacyRole, 'compatibility-mirror');

assert.ok(
  LEGACY_CASE_COMPATIBILITY_MIRROR_FIELDS.length > 0,
  'Expected registry to expose compatibility mirror fields',
);

for (const field of LEGACY_CASE_COMPATIBILITY_MIRROR_FIELDS) {
  const entry = ownership(field);
  assert.equal(entry.legacyRole, 'compatibility-mirror', `${field} must be a compatibility mirror`);
  assert.ok(entry.targetOwner, `${field} compatibility mirror must declare a target owner`);
  assert.ok(entry.targetConcept, `${field} compatibility mirror must declare a target concept`);
}

console.log('selling-houses legacy Case field ownership contract verification passed');
