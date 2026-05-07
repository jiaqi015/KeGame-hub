/**
 * POV boundary guards — validate that POV projections respect visibility rules.
 *
 * These guards are pure assertion functions for verification scripts.
 * They do NOT mutate any state.
 */

import type {
  BrokerPOVSnapshot,
  OwnerPOVSnapshot,
  CasePOVContext,
  OwnerPOVContext,
} from './models.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface POVBoundaryViolation {
  readonly rule: string;
  readonly detail: string;
  readonly path: string;
}

// ---------------------------------------------------------------------------
// BrokerPOV boundary checks
// ---------------------------------------------------------------------------

export function validateBrokerPOVBoundary(pov: BrokerPOVSnapshot): readonly POVBoundaryViolation[] {
  const violations: POVBoundaryViolation[] = [];

  if (pov.readOnly !== true) {
    violations.push({ rule: 'readOnly', detail: 'BrokerPOV must be readOnly: true', path: 'pov.readOnly' });
  }
  if (pov.role !== 'broker') {
    violations.push({ rule: 'role', detail: 'BrokerPOV must have role: broker', path: 'pov.role' });
  }
  if (typeof pov.day !== 'number' || pov.day <= 0) {
    violations.push({ rule: 'day', detail: 'BrokerPOV must have positive day', path: 'pov.day' });
  }
  if (!Array.isArray(pov.cases)) {
    violations.push({ rule: 'cases', detail: 'BrokerPOV.cases must be an array', path: 'pov.cases' });
  }
  if (!Array.isArray(pov.actionCommandDrafts)) {
    violations.push({ rule: 'drafts', detail: 'actionCommandDrafts must be an array', path: 'pov.actionCommandDrafts' });
  }
  if (!pov.pressureSummary) {
    violations.push({ rule: 'pressure', detail: 'pressureSummary must exist', path: 'pov.pressureSummary' });
  }
  if (pov.energy < 0) {
    violations.push({ rule: 'energy', detail: 'energy must be non-negative', path: 'pov.energy' });
  }

  return violations;
}

export function validateBrokerCaseBoundary(caseCtx: CasePOVContext): readonly POVBoundaryViolation[] {
  const violations: POVBoundaryViolation[] = [];

  if (!caseCtx.caseId) {
    violations.push({ rule: 'caseId', detail: 'case must have caseId', path: 'case.caseId' });
  }
  if (typeof caseCtx.assetScore.d1 !== 'number') {
    violations.push({ rule: 'd1', detail: 'assetScore must have d1', path: 'case.assetScore.d1' });
  }
  if (typeof caseCtx.assetScore.d2 !== 'number') {
    violations.push({ rule: 'd2', detail: 'assetScore must have d2', path: 'case.assetScore.d2' });
  }
  if (typeof caseCtx.assetScore.d3 !== 'number') {
    violations.push({ rule: 'd3', detail: 'assetScore must have d3', path: 'case.assetScore.d3' });
  }
  if (typeof caseCtx.ownerReadiness.trust !== 'number') {
    violations.push({ rule: 'trust', detail: 'ownerReadiness must have trust', path: 'case.ownerReadiness.trust' });
  }
  if (!Array.isArray(caseCtx.knowledge.visibleFacts)) {
    violations.push({ rule: 'visibleFacts', detail: 'knowledge must have visibleFacts array', path: 'case.knowledge.visibleFacts' });
  }
  if (!Array.isArray(caseCtx.knowledge.inferredSignals)) {
    violations.push({ rule: 'inferredSignals', detail: 'knowledge must have inferredSignals array', path: 'case.knowledge.inferredSignals' });
  }
  if (!Array.isArray(caseCtx.knowledge.hiddenGlobalFacts)) {
    violations.push({ rule: 'hiddenGlobalFacts', detail: 'knowledge must have hiddenGlobalFacts array', path: 'case.knowledge.hiddenGlobalFacts' });
  }
  if (!Array.isArray(caseCtx.knowledge.traces)) {
    violations.push({ rule: 'traces', detail: 'knowledge must have traces array', path: 'case.knowledge.traces' });
  }
  if (!Array.isArray(caseCtx.knowledge.beliefs)) {
    violations.push({ rule: 'beliefs', detail: 'knowledge must have beliefs array', path: 'case.knowledge.beliefs' });
  }
  if (!Array.isArray(caseCtx.knowledge.beliefConflicts)) {
    violations.push({ rule: 'beliefConflicts', detail: 'knowledge must have beliefConflicts array', path: 'case.knowledge.beliefConflicts' });
  }
  if (!caseCtx.choiceSet) {
    violations.push({ rule: 'choiceSet', detail: 'case must have choiceSet', path: 'case.choiceSet' });
  }
  if (!caseCtx.waitingState) {
    violations.push({ rule: 'waitingState', detail: 'case must have waitingState', path: 'case.waitingState' });
  }

  // Validate belief kinds
  const validBeliefKinds = ['price_anchor', 'broker_trust', 'market_heat', 'seller_sincerity', 'buyer_seriousness', 'financing_confidence', 'service_path_confidence'];
  for (const belief of caseCtx.knowledge.beliefs) {
    if (!validBeliefKinds.includes(belief.kind)) {
      violations.push({ rule: 'belief-kind', detail: `Invalid belief kind: ${belief.kind}`, path: 'case.knowledge.beliefs[].kind' });
    }
  }

  // Validate belief conflict kinds
  const validConflictKinds = ['belief_vs_fact', 'belief_vs_belief', 'stale_belief', 'low_confidence_interpretation'];
  for (const conflict of caseCtx.knowledge.beliefConflicts) {
    if (!validConflictKinds.includes(conflict.kind)) {
      violations.push({ rule: 'conflict-kind', detail: `Invalid conflict kind: ${conflict.kind}`, path: 'case.knowledge.beliefConflicts[].kind' });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// OwnerPOV boundary checks
// ---------------------------------------------------------------------------

export function validateOwnerPOVBoundary(pov: OwnerPOVSnapshot): readonly POVBoundaryViolation[] {
  const violations: POVBoundaryViolation[] = [];

  if (pov.readOnly !== true) {
    violations.push({ rule: 'readOnly', detail: 'OwnerPOV must be readOnly: true', path: 'pov.readOnly' });
  }
  if (pov.role !== 'owner') {
    violations.push({ rule: 'role', detail: 'OwnerPOV must have role: owner', path: 'pov.role' });
  }
  if (!Array.isArray(pov.cases)) {
    violations.push({ rule: 'cases', detail: 'OwnerPOV.cases must be an array', path: 'pov.cases' });
  }
  if (!pov.knowledge || !Array.isArray(pov.knowledge.hiddenGlobalFacts)) {
    violations.push({ rule: 'knowledge', detail: 'must have knowledge with hiddenGlobalFacts', path: 'pov.knowledge' });
  }

  return violations;
}

export function validateOwnerCaseBoundary(caseCtx: OwnerPOVContext): readonly POVBoundaryViolation[] {
  const violations: POVBoundaryViolation[] = [];

  if ((caseCtx.assetScore as any).d4 !== undefined) {
    violations.push({
      rule: 'no-d4',
      detail: 'OwnerPOV must NOT expose D4 competition data',
      path: 'case.assetScore.d4',
    });
  }
  if ('recommendationDrafts' in caseCtx && Array.isArray((caseCtx as any).recommendationDrafts)) {
    violations.push({
      rule: 'no-drafts',
      detail: 'OwnerPOV must NOT expose recommendation drafts',
      path: 'case.recommendationDrafts',
    });
  }
  if ('opportunityCount' in caseCtx) {
    violations.push({
      rule: 'no-opportunity-count',
      detail: 'OwnerPOV must NOT expose opportunity counts',
      path: 'case.opportunityCount',
    });
  }

  const hiddenKeys = caseCtx.knowledge.hiddenGlobalFacts.map((f) => f.key);
  if (!hiddenKeys.includes('d4')) {
    violations.push({
      rule: 'hidden-d4',
      detail: 'OwnerPOV knowledge must list d4 as hidden',
      path: 'case.knowledge.hiddenGlobalFacts',
    });
  }
  if (!hiddenKeys.includes('opportunity-details')) {
    violations.push({
      rule: 'hidden-opportunities',
      detail: 'OwnerPOV knowledge must list opportunity-details as hidden',
      path: 'case.knowledge.hiddenGlobalFacts',
    });
  }

  if (!caseCtx.choiceSet) {
    violations.push({
      rule: 'no-choiceset',
      detail: 'OwnerPOV must have choiceSet',
      path: 'case.choiceSet',
    });
  }
  if (!caseCtx.waitingState) {
    violations.push({
      rule: 'no-waitingstate',
      detail: 'OwnerPOV must have waitingState',
      path: 'case.waitingState',
    });
  }

  // Validate owner beliefs are limited to owner-visible kinds
  const ownerVisibleBeliefKinds = ['price_anchor', 'broker_trust', 'market_heat', 'seller_sincerity'];
  for (const belief of caseCtx.knowledge.beliefs) {
    if (!ownerVisibleBeliefKinds.includes(belief.kind)) {
      violations.push({
        rule: 'owner-belief-boundary',
        detail: `OwnerPOV must NOT have belief kind: ${belief.kind}`,
        path: 'case.knowledge.beliefs[].kind',
      });
    }
  }

  // Validate knowledge arrays exist
  if (!Array.isArray(caseCtx.knowledge.traces)) {
    violations.push({ rule: 'traces', detail: 'knowledge must have traces array', path: 'case.knowledge.traces' });
  }
  if (!Array.isArray(caseCtx.knowledge.beliefs)) {
    violations.push({ rule: 'beliefs', detail: 'knowledge must have beliefs array', path: 'case.knowledge.beliefs' });
  }
  if (!Array.isArray(caseCtx.knowledge.beliefConflicts)) {
    violations.push({ rule: 'beliefConflicts', detail: 'knowledge must have beliefConflicts array', path: 'case.knowledge.beliefConflicts' });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Combined validation
// ---------------------------------------------------------------------------

export function validateAllPOVBoundaries(
  brokerPOV: BrokerPOVSnapshot,
  ownerPOV: OwnerPOVSnapshot,
): readonly POVBoundaryViolation[] {
  const violations: POVBoundaryViolation[] = [];

  violations.push(...validateBrokerPOVBoundary(brokerPOV));
  violations.push(...validateOwnerPOVBoundary(ownerPOV));

  for (const caseCtx of brokerPOV.cases) {
    violations.push(...validateBrokerCaseBoundary(caseCtx));
  }
  for (const caseCtx of ownerPOV.cases) {
    violations.push(...validateOwnerCaseBoundary(caseCtx));
  }

  return violations;
}
