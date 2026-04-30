import assert from 'node:assert/strict';

import type { Case, ClosedDealRecord, Opportunity } from '../src/selling-houses/domain/models.js';
import {
  getLegacyCaseFieldOwnership,
  LEGACY_CASE_COMPATIBILITY_MIRROR_FIELDS,
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES,
  getLegacyOpportunityFieldOwnership,
  LEGACY_OPPORTUNITY_COMPATIBILITY_MIRROR_FIELDS,
  LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_ENTRIES,
  getLegacyClosedDealFieldOwnership,
  LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_ENTRIES,
  LEGACY_CLOSED_DEAL_COMPATIBILITY_MIRROR_FIELDS,
  LEGACY_GAMESTATE_FIELD_OWNERSHIP_ENTRIES,
  getLegacyGamestateFieldOwnership,
} from '../src/selling-houses/core/world-state/index.js';

// ---------------------------------------------------------------------------
// Case field ownership checks
// ---------------------------------------------------------------------------

type CaseField = keyof Case;

const requiredCaseCanonicalOwners = [
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

const highRiskCaseFields = [
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

assert.ok(
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.length >= highRiskCaseFields.length,
  'Expected Case ownership registry to cover at least the high-risk field set',
);

for (const owner of requiredCaseCanonicalOwners) {
  assert.ok(
    LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.some((entry) => entry.canonicalOwner === owner),
    `Expected Case ownership registry to include ${owner}`,
  );
}

for (const field of highRiskCaseFields) {
  assert.ok(getLegacyCaseFieldOwnership(field), `Expected Case ownership registry to cover ${field}`);
}

assert.notEqual(
  getLegacyCaseFieldOwnership('trust').canonicalOwner,
  'asset-case',
  'trust must not be treated as an asset-case field',
);
assert.equal(
  getLegacyCaseFieldOwnership('trust').canonicalOwner,
  'broker-owner-relation',
  'trust belongs to the broker-owner relationship mirror',
);

for (const field of ['urgency', 'patience'] as const) {
  const entry = getLegacyCaseFieldOwnership(field);
  assert.ok(
    entry.canonicalOwner === 'owner'
      || entry.canonicalOwner === 'owner-case-relation'
      || entry.targetConcept === 'OwnerDecisionReadiness',
    `${field} must belong to owner-side decision state`,
  );
  assert.notEqual(entry.canonicalOwner, 'asset-case', `${field} must not be an asset-case field`);
}

for (const field of ['d1', 'd2', 'd3', 'competitiveness'] as const) {
  const entry = getLegacyCaseFieldOwnership(field);
  assert.equal(entry.canonicalOwner, 'evaluation-mirror', `${field} must be an evaluation mirror`);
  assert.equal(entry.legacyRole, 'compatibility-mirror', `${field} must be a compatibility mirror`);
}

for (const field of ['viewings', 'offers', 'stageIndex'] as const) {
  assert.equal(
    getLegacyCaseFieldOwnership(field).canonicalOwner,
    'process-mirror',
    `${field} must be a process/lifecycle mirror`,
  );
}

for (const field of ['askPrice', 'marketPrice', 'bottomPrice'] as const) {
  const entry = getLegacyCaseFieldOwnership(field);
  assert.equal(entry.domainFacet, 'asset-pricing', `${field} must stay in the asset pricing boundary`);
  assert.ok(
    entry.canonicalOwner === 'owner-case-relation' || entry.canonicalOwner === 'evaluation-mirror',
    `${field} must belong to owner-case relation or asset pricing output`,
  );
}

const axisScores = getLegacyCaseFieldOwnership('axisScores');
assert.equal(axisScores.canonicalOwner, 'evaluation-mirror');
assert.equal(axisScores.targetConcept, 'AssetScoreSnapshot.inputs.axisScores');

assert.ok(
  LEGACY_CASE_COMPATIBILITY_MIRROR_FIELDS.length > 0,
  'Expected Case registry to expose compatibility mirror fields',
);

for (const field of LEGACY_CASE_COMPATIBILITY_MIRROR_FIELDS) {
  const entry = getLegacyCaseFieldOwnership(field);
  assert.equal(entry.legacyRole, 'compatibility-mirror', `${field} must be a compatibility mirror`);
  assert.ok(entry.targetOwner, `${field} compatibility mirror must declare a target owner`);
  assert.ok(entry.targetConcept, `${field} compatibility mirror must declare a target concept`);
}

// Check that ALL Case fields are covered
const allCaseFields: CaseField[] = [
  'id', 'housePrototypeId', 'ownerArchetypeId', 'title', 'community', 'district', 'layout', 'area',
  'askPrice', 'marketPrice', 'bottomPrice', 'patience', 'trust', 'heat', 'competitiveness',
  'd1', 'd2', 'd3', 'axisScores', 'urgency', 'windowDays', 'ownerName', 'ownerMood',
  'maintainerName', 'marketCellId', 'story', 'tags', 'defects', 'status', 'stageIndex',
  'stageLabel', 'riskFlags', 'actionsApplied', 'actionsToday', 'touchedToday', 'touchedOwnerToday',
  'lastTouchedDay', 'lastOwnerTouchedDay', 'hasCompletedFirstVisit', 'lastAction', 'lastPriceActionDay',
  'openDayCooldown', 'qualityStory', 'negotiationBonus', 'viewings', 'offers', 'soldPrice',
  'priceGapPct', 'competitivenessSnapshots', 'competitionGroupIds', 'lastAskPrice', 'lastRivalThreatDay',
  'goalTier', 'storylineState', 'relativeOutcome', 'ownerSatisfaction', 'defenseOutcome',
  'endingType', 'endingBucket', 'endingSummary', 'isFocused', 'personality',
];

for (const field of allCaseFields) {
  assert.ok(
    LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.some((entry) => entry.field === field),
    `Case field "${field}" is not covered by the ownership registry`,
  );
}

console.log(`  Case field ownership: ${LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.length} fields mapped, all ${allCaseFields.length} fields covered`);

// ---------------------------------------------------------------------------
// Opportunity field ownership checks
// ---------------------------------------------------------------------------

type OpportunityField = keyof Opportunity;

const requiredOpportunityCanonicalOwners = [
  'customer-case-match',
  'customer-profile',
  'channel',
  'match-evaluation',
  'broker-opportunity-relation',
  'opportunity-lifecycle',
  'runtime-scratch',
  'closing-evaluation',
] as const;

for (const owner of requiredOpportunityCanonicalOwners) {
  assert.ok(
    LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_ENTRIES.some((entry) => entry.canonicalOwner === owner),
    `Expected Opportunity ownership registry to include ${owner}`,
  );
}

// Check high-risk Opportunity fields
const highRiskOpportunityFields: OpportunityField[] = [
  'fit', 'intent', 'confidence', 'stageIndex', 'status', 'visibility',
  'budgetMax', 'priceSensitivity', 'stagnationTicks',
];

for (const field of highRiskOpportunityFields) {
  assert.ok(
    getLegacyOpportunityFieldOwnership(field),
    `Expected Opportunity ownership registry to cover ${field}`,
  );
}

// fit/intent/confidence must be match-evaluation
for (const field of ['fit', 'intent', 'confidence'] as const) {
  const entry = getLegacyOpportunityFieldOwnership(field);
  assert.equal(entry.canonicalOwner, 'match-evaluation', `${field} must be a match evaluation mirror`);
  assert.equal(entry.legacyRole, 'compatibility-mirror', `${field} must be a compatibility mirror`);
}

// visibility must be broker-opportunity-relation
assert.equal(
  getLegacyOpportunityFieldOwnership('visibility').canonicalOwner,
  'broker-opportunity-relation',
  'visibility belongs to broker-opportunity relation',
);

// budgetMax/priceSensitivity must be customer-profile
for (const field of ['budgetMax', 'priceSensitivity'] as const) {
  assert.equal(
    getLegacyOpportunityFieldOwnership(field).canonicalOwner,
    'customer-profile',
    `${field} must be a customer profile fact`,
  );
}

assert.ok(
  LEGACY_OPPORTUNITY_COMPATIBILITY_MIRROR_FIELDS.length > 0,
  'Expected Opportunity registry to expose compatibility mirror fields',
);

for (const field of LEGACY_OPPORTUNITY_COMPATIBILITY_MIRROR_FIELDS) {
  const entry = getLegacyOpportunityFieldOwnership(field);
  assert.equal(entry.legacyRole, 'compatibility-mirror', `${field} must be a compatibility mirror`);
  assert.ok(entry.targetConcept, `${field} compatibility mirror must declare a target concept`);
}

// Check that ALL Opportunity fields are covered
const allOpportunityFields: OpportunityField[] = [
  'id', 'caseId', 'customerId', 'customerName', 'profile', 'channelId', 'channelName',
  'fit', 'intent', 'confidence', 'stageIndex', 'stageLabel', 'status', 'lifecycleStatus',
  'leadSource', 'visibility', 'brokerName', 'createdDay', 'daysLeft', 'touchedToday',
  'budgetMax', 'priceSensitivity', 'stagnationTicks', 'pendingClosingEvaluation',
  'pendingClosingStrategyId', 'pendingClosingRequestedDay', 'history',
];

for (const field of allOpportunityFields) {
  assert.ok(
    LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_ENTRIES.some((entry) => entry.field === field),
    `Opportunity field "${field}" is not covered by the ownership registry`,
  );
}

console.log(`  Opportunity field ownership: ${LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_ENTRIES.length} fields mapped, all ${allOpportunityFields.length} fields covered`);

// ---------------------------------------------------------------------------
// ClosedDealRecord field ownership checks
// ---------------------------------------------------------------------------

type ClosedDealField = keyof ClosedDealRecord;

const requiredClosedDealCanonicalOwners = [
  'contract-fact',
  'deal-price',
  'consensus-outcome',
  'market-snapshot',
  'deprecated-legacy',
] as const;

for (const owner of requiredClosedDealCanonicalOwners) {
  assert.ok(
    LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_ENTRIES.some((entry) => entry.canonicalOwner === owner),
    `Expected ClosedDealRecord ownership registry to include ${owner}`,
  );
}

// dealPrice must be deal-price
assert.equal(
  getLegacyClosedDealFieldOwnership('dealPrice').canonicalOwner,
  'deal-price',
  'dealPrice belongs to deal-price',
);

// closeReadiness/closeProbability must be consensus-outcome
for (const field of ['closeReadiness', 'closeProbability'] as const) {
  assert.equal(
    getLegacyClosedDealFieldOwnership(field).canonicalOwner,
    'consensus-outcome',
    `${field} must be a consensus outcome mirror`,
  );
}

// blockingReasons/supportingReasons must be consensus-outcome
for (const field of ['blockingReasons', 'supportingReasons'] as const) {
  assert.equal(
    getLegacyClosedDealFieldOwnership(field).canonicalOwner,
    'consensus-outcome',
    `${field} must be a consensus outcome mirror`,
  );
}

// legacy aliases must be deprecated-legacy
for (const field of ['opportunityId', 'day', 'price'] as const) {
  assert.equal(
    getLegacyClosedDealFieldOwnership(field).canonicalOwner,
    'deprecated-legacy',
    `${field} is a deprecated legacy alias`,
  );
}

assert.ok(
  LEGACY_CLOSED_DEAL_COMPATIBILITY_MIRROR_FIELDS.length > 0,
  'Expected ClosedDealRecord registry to expose compatibility mirror fields',
);

// Check that ALL ClosedDealRecord fields are covered
const allClosedDealFields: ClosedDealField[] = [
  'dealId', 'caseId', 'customerId', 'sourceRelationId', 'opportunityId',
  'dayIndex', 'day', 'closedAt', 'dealType', 'dealPrice', 'price',
  'closeReadiness', 'closeProbability', 'blockingReasons', 'supportingReasons',
  'caseTitle', 'customerName', 'ownerName', 'maintainerName',
  'marketSnapshot', 'priceSnapshot',
];

for (const field of allClosedDealFields) {
  assert.ok(
    LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_ENTRIES.some((entry) => entry.field === field),
    `ClosedDealRecord field "${field}" is not covered by the ownership registry`,
  );
}

console.log(`  ClosedDealRecord field ownership: ${LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_ENTRIES.length} fields mapped, all ${allClosedDealFields.length} fields covered`);

// ---------------------------------------------------------------------------
// GameState top-level field ownership checks
// ---------------------------------------------------------------------------

const highRiskGamestateFields = [
  'day', 'energy', 'maxEnergy', 'cash', 'gameOver', 'focusMeeting',
  'todayPlan', 'currentReport', 'marketShadow',
];

for (const field of highRiskGamestateFields) {
  const entry = getLegacyGamestateFieldOwnership(field);
  assert.ok(entry, `Expected GameState ownership registry to cover ${field}`);
}

// cash must be deprecated-legacy
assert.equal(
  getLegacyGamestateFieldOwnership('cash')!.canonicalOwner,
  'deprecated-legacy',
  'cash is a deprecated legacy compatibility mirror',
);

// gameOver must be runtime-session
assert.equal(
  getLegacyGamestateFieldOwnership('gameOver')!.canonicalOwner,
  'runtime-session',
  'gameOver is a runtime session flag',
);

// focusMeeting must be process-state
assert.equal(
  getLegacyGamestateFieldOwnership('focusMeeting')!.canonicalOwner,
  'process-state',
  'focusMeeting is a process state',
);

// currentReport must be projection-ui
assert.equal(
  getLegacyGamestateFieldOwnership('currentReport')!.canonicalOwner,
  'projection-ui',
  'currentReport is a projection output',
);

// runId must be runtime-session
assert.equal(
  getLegacyGamestateFieldOwnership('runId')!.canonicalOwner,
  'runtime-session',
  'runId is a runtime session identity',
);

console.log(`  GameState field ownership: ${LEGACY_GAMESTATE_FIELD_OWNERSHIP_ENTRIES.length} fields mapped`);

// ---------------------------------------------------------------------------
// Cross-registry consistency checks
// ---------------------------------------------------------------------------

// Ensure no canonical owner is used with inconsistent semantics across registries
const allRegistries = [
  ...LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.map((e) => ({ ...e, registry: 'Case' })),
  ...LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_ENTRIES.map((e) => ({ ...e, registry: 'Opportunity' })),
  ...LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_ENTRIES.map((e) => ({ ...e, registry: 'ClosedDealRecord' })),
  ...LEGACY_GAMESTATE_FIELD_OWNERSHIP_ENTRIES.map((e) => ({ ...e, registry: 'GameState' })),
];

const totalFields = LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.length
  + LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_ENTRIES.length
  + LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_ENTRIES.length
  + LEGACY_GAMESTATE_FIELD_OWNERSHIP_ENTRIES.length;

console.log(`  Total fields across all registries: ${totalFields}`);

// Verify that every compatibility mirror has a targetConcept
for (const entry of allRegistries) {
  if (entry.legacyRole === 'compatibility-mirror') {
    assert.ok(
      entry.targetConcept,
      `${entry.registry}.${entry.field} is a compatibility mirror but has no targetConcept`,
    );
  }
}

console.log('selling-houses field ownership contract verification passed');
