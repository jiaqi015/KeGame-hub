/**
 * Focused verification of CustomerRuntimeState + CustomerCaseRuntime field ownership.
 * This is a subset of the unified verify-selling-houses-field-ownership-contract.ts.
 * Use the unified script for full coverage; use this one for quick customer-runtime-only checks.
 */
import assert from 'node:assert/strict';

import type { CustomerCaseRuntime, CustomerRuntimeState } from '../src/selling-houses/domain/models.js';
import {
  CUSTOMER_RUNTIME_STATE_FIELD_OWNERSHIP_ENTRIES,
  CUSTOMER_CASE_RUNTIME_FIELD_OWNERSHIP_ENTRIES,
  getCustomerRuntimeStateFieldOwnership,
  getCustomerCaseRuntimeFieldOwnership,
  CUSTOMER_RECEIPT_DIMENSION_ALIGNMENT,
} from '../src/selling-houses/core/world-state/index.js';

// ---------------------------------------------------------------------------
// CustomerRuntimeState field ownership checks
// ---------------------------------------------------------------------------

type CustomerRuntimeField = keyof CustomerRuntimeState;

const requiredCustomerRuntimeCanonicalOwners = [
  'customer-entity',
  'customer-attention-state',
  'customer-decision-pressure',
  'broker-customer-relation',
  'runtime-scratch',
] as const;

for (const owner of requiredCustomerRuntimeCanonicalOwners) {
  assert.ok(
    CUSTOMER_RUNTIME_STATE_FIELD_OWNERSHIP_ENTRIES.some((entry) => entry.canonicalOwner === owner),
    `Expected CustomerRuntimeState registry to include ${owner}`,
  );
}

// churnRisk must be customer-decision-pressure
assert.equal(
  getCustomerRuntimeStateFieldOwnership('churnRisk').canonicalOwner,
  'customer-decision-pressure',
  'churnRisk belongs to customer-decision-pressure',
);

// advisorTrust must be broker-customer-relation
assert.equal(
  getCustomerRuntimeStateFieldOwnership('advisorTrust').canonicalOwner,
  'broker-customer-relation',
  'advisorTrust belongs to broker-customer-relation',
);

// fatigue must be customer-decision-pressure
assert.equal(
  getCustomerRuntimeStateFieldOwnership('fatigue').canonicalOwner,
  'customer-decision-pressure',
  'fatigue belongs to customer-decision-pressure',
);

// status must be customer-attention-state
assert.equal(
  getCustomerRuntimeStateFieldOwnership('status').canonicalOwner,
  'customer-attention-state',
  'status belongs to customer-attention-state',
);

// decisionStyle must be customer-entity
assert.equal(
  getCustomerRuntimeStateFieldOwnership('decisionStyle').canonicalOwner,
  'customer-entity',
  'decisionStyle belongs to customer-entity (profile-derived)',
);

// lastTouchDay/lastActionNote must be runtime-scratch
for (const field of ['lastTouchDay', 'lastActionNote'] as const) {
  assert.equal(
    getCustomerRuntimeStateFieldOwnership(field).canonicalOwner,
    'runtime-scratch',
    `${field} belongs to runtime-scratch`,
  );
}

// Check ALL CustomerRuntimeState fields are covered
const allCustomerRuntimeFields: CustomerRuntimeField[] = [
  'customerId', 'status', 'decisionStyle', 'advisorTrust', 'fatigue',
  'churnRisk', 'activeCaseIds', 'caseStates', 'lastTouchDay', 'lastActionNote',
];

for (const field of allCustomerRuntimeFields) {
  assert.ok(
    CUSTOMER_RUNTIME_STATE_FIELD_OWNERSHIP_ENTRIES.some((entry) => entry.field === field),
    `CustomerRuntimeState field "${field}" is not covered by the ownership registry`,
  );
}

console.log(`  CustomerRuntimeState: ${CUSTOMER_RUNTIME_STATE_FIELD_OWNERSHIP_ENTRIES.length} fields mapped, all ${allCustomerRuntimeFields.length} fields covered`);

// ---------------------------------------------------------------------------
// CustomerCaseRuntime field ownership checks
// ---------------------------------------------------------------------------

type CustomerCaseRuntimeField = keyof CustomerCaseRuntime;

const requiredCustomerCaseRuntimeCanonicalOwners = [
  'customer-case-match',
  'customer-attention-state',
  'customer-decision-pressure',
  'customer-buying-journey',
  'runtime-scratch',
] as const;

for (const owner of requiredCustomerCaseRuntimeCanonicalOwners) {
  assert.ok(
    CUSTOMER_CASE_RUNTIME_FIELD_OWNERSHIP_ENTRIES.some((entry) => entry.canonicalOwner === owner),
    `Expected CustomerCaseRuntime registry to include ${owner}`,
  );
}

// fit must be customer-case-match
assert.equal(
  getCustomerCaseRuntimeFieldOwnership('fit').canonicalOwner,
  'customer-case-match',
  'fit belongs to customer-case-match',
);

// interest must be customer-attention-state
assert.equal(
  getCustomerCaseRuntimeFieldOwnership('interest').canonicalOwner,
  'customer-attention-state',
  'interest belongs to customer-attention-state',
);

// confidence must be customer-decision-pressure
assert.equal(
  getCustomerCaseRuntimeFieldOwnership('confidence').canonicalOwner,
  'customer-decision-pressure',
  'confidence belongs to customer-decision-pressure',
);

// stageIndex must be customer-buying-journey
assert.equal(
  getCustomerCaseRuntimeFieldOwnership('stageIndex').canonicalOwner,
  'customer-buying-journey',
  'stageIndex belongs to customer-buying-journey',
);

// viewed/offered must be customer-buying-journey
for (const field of ['viewed', 'offered'] as const) {
  assert.equal(
    getCustomerCaseRuntimeFieldOwnership(field).canonicalOwner,
    'customer-buying-journey',
    `${field} belongs to customer-buying-journey`,
  );
}

// selected must be customer-attention-state
assert.equal(
  getCustomerCaseRuntimeFieldOwnership('selected').canonicalOwner,
  'customer-attention-state',
  'selected belongs to customer-attention-state',
);

// Check ALL CustomerCaseRuntime fields are covered
const allCustomerCaseRuntimeFields: CustomerCaseRuntimeField[] = [
  'caseId', 'fit', 'interest', 'confidence', 'stageIndex',
  'interactions', 'lastActiveDay', 'viewed', 'offered', 'selected', 'competingCaseIds',
];

for (const field of allCustomerCaseRuntimeFields) {
  assert.ok(
    CUSTOMER_CASE_RUNTIME_FIELD_OWNERSHIP_ENTRIES.some((entry) => entry.field === field),
    `CustomerCaseRuntime field "${field}" is not covered by the ownership registry`,
  );
}

console.log(`  CustomerCaseRuntime: ${CUSTOMER_CASE_RUNTIME_FIELD_OWNERSHIP_ENTRIES.length} fields mapped, all ${allCustomerCaseRuntimeFields.length} fields covered`);

// ---------------------------------------------------------------------------
// C receipt dimension alignment checks
// ---------------------------------------------------------------------------

assert.ok(
  CUSTOMER_RECEIPT_DIMENSION_ALIGNMENT.length >= 5,
  'Expected at least 5 customer receipt dimension alignments',
);

// churn-risk must map to churnRisk
const churnRiskMapping = CUSTOMER_RECEIPT_DIMENSION_ALIGNMENT.find((entry) => entry.dimension === 'churn-risk');
assert.ok(churnRiskMapping, 'churn-risk dimension must have a mapping');
assert.equal(churnRiskMapping.sourceField, 'churnRisk', 'churn-risk must map to churnRisk');
assert.equal(churnRiskMapping.canonicalOwner, 'customer-decision-pressure', 'churn-risk must be customer-decision-pressure');

// confidence must map to confidence
const confidenceMapping = CUSTOMER_RECEIPT_DIMENSION_ALIGNMENT.find((entry) => entry.dimension === 'confidence');
assert.ok(confidenceMapping, 'confidence dimension must have a mapping');
assert.equal(confidenceMapping.sourceField, 'confidence', 'confidence must map to confidence');

// sentiment must map to advisorTrust
const sentimentMapping = CUSTOMER_RECEIPT_DIMENSION_ALIGNMENT.find((entry) => entry.dimension === 'sentiment');
assert.ok(sentimentMapping, 'sentiment dimension must have a mapping');
assert.equal(sentimentMapping.sourceField, 'advisorTrust', 'sentiment must map to advisorTrust');
assert.equal(sentimentMapping.canonicalOwner, 'broker-customer-relation', 'sentiment must be broker-customer-relation');

// demand-heat must map to interest
const demandHeatMapping = CUSTOMER_RECEIPT_DIMENSION_ALIGNMENT.find((entry) => entry.dimension === 'demand-heat');
assert.ok(demandHeatMapping, 'demand-heat dimension must have a mapping');
assert.equal(demandHeatMapping.sourceField, 'interest', 'demand-heat must map to interest');

console.log(`  C receipt alignment: ${CUSTOMER_RECEIPT_DIMENSION_ALIGNMENT.length} dimensions mapped`);

// ---------------------------------------------------------------------------
// Cross-registry consistency
// ---------------------------------------------------------------------------

// Every compatibility mirror must have a targetConcept
for (const entry of CUSTOMER_RUNTIME_STATE_FIELD_OWNERSHIP_ENTRIES) {
  if (entry.legacyRole === 'compatibility-mirror') {
    assert.ok(entry.targetConcept, `CustomerRuntimeState.${entry.field} is a compatibility mirror but has no targetConcept`);
  }
}

for (const entry of CUSTOMER_CASE_RUNTIME_FIELD_OWNERSHIP_ENTRIES) {
  if (entry.legacyRole === 'compatibility-mirror') {
    assert.ok(entry.targetConcept, `CustomerCaseRuntime.${entry.field} is a compatibility mirror but has no targetConcept`);
  }
}

// No field should have 'evaluation-mirror' as canonical owner
// (customer runtime fields are attention/decision/journey, not evaluation mirrors)
for (const entry of CUSTOMER_RUNTIME_STATE_FIELD_OWNERSHIP_ENTRIES) {
  assert.notEqual(
    entry.canonicalOwner,
    'evaluation-mirror' as any,
    `CustomerRuntimeState.${entry.field} should not be evaluation-mirror — customer state is attention/decision, not evaluation`,
  );
}

console.log('selling-houses customer runtime field ownership contract verification passed');
