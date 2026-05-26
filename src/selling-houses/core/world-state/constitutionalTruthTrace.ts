/**
 * Constitutional Truth Trace — non-UI audit utility for ContractFact constitutional chain.
 *
 * For a given ContractFact/case, traces the evidence chain:
 *   contract -> consensus -> price trajectory/offer/concession -> relation/readiness sources
 *
 * R33: Uses ContractFact proof fields (priceTrajectoryId, buyerOfferId, ownerConcessionId,
 * weightExplanations) and only reports debt when proof data is actually missing.
 */

import type { GameState } from '../../domain/models.js';
import type { ContractFactState } from './consensus/writeSource.js';
import type { WeightExplanation } from './consensus/priceTrajectory.js';

// ── Debt types ──

export type ConstitutionalTruthDebtKind =
  | 'missing-consensus'
  | 'missing-price-trajectory'
  | 'missing-offer-evidence'
  | 'missing-concession-evidence'
  | 'missing-relation-evidence'
  | 'missing-readiness-evidence'
  | 'missing-receipt-evidence'
  | 'missing-weight-explanation'
  | 'old-save-compatibility'
  | 'legacy-truth-debt';

export interface ConstitutionalTruthDebt {
  readonly kind: ConstitutionalTruthDebtKind;
  readonly description: string;
  readonly missingId?: string;
}

// ── Truth trace result ──

export interface ConstitutionalTruthTrace {
  readonly contractFactId: string;
  readonly caseId: string;
  readonly opportunityId?: string;
  readonly customerId?: string;
  readonly consensusId?: string;
  readonly priceTrajectoryId?: string;
  readonly offerIds: readonly string[];
  readonly concessionIds: readonly string[];
  readonly relationEvidenceIds: readonly string[];
  readonly readinessEvidenceIds: readonly string[];
  readonly receiptIds: readonly string[];
  readonly terminalOutcomeId?: string;
  readonly weightExplanations: readonly WeightExplanation[];
  readonly debts: readonly ConstitutionalTruthDebt[];
}

// ── Builder ──

/**
 * Build a constitutional truth trace for a ContractFact.
 * Traces the full evidence chain using proof fields, reporting debt where the path is incomplete.
 */
export function buildConstitutionalTruthTrace(
  state: GameState,
  contractFact: ContractFactState,
): ConstitutionalTruthTrace {
  const debts: ConstitutionalTruthDebt[] = [];
  const contractFactId = contractFact.contractId;
  const caseId = contractFact.caseId;

  // Find case
  const caseItem = state.cases.find((c) => c.id === caseId);
  if (!caseItem) {
    debts.push({ kind: 'legacy-truth-debt', description: `Case ${caseId} not found for contract ${contractFactId}` });
  }

  // Find consensus formation for this contract
  let consensusId: string | undefined;
  if (state.runtimeConsensusFormations) {
    const consensus = state.runtimeConsensusFormations.find(
      (cf) => cf.consensusId === contractFact.consensusId,
    );
    consensusId = consensus?.consensusId;
  }
  if (!consensusId) {
    debts.push({
      kind: 'missing-consensus',
      description: `No consensus formation found for contract ${contractFactId}`,
      missingId: contractFact.consensusId,
    });
  }

  // Find price trajectory via proof field
  let priceTrajectoryId: string | undefined = contractFact.priceTrajectoryId;
  if (!priceTrajectoryId && state.runtimePriceTrajectories) {
    const trajectory = state.runtimePriceTrajectories.find(
      (pt) => pt.caseId === caseId,
    );
    priceTrajectoryId = trajectory?.trajectoryId;
  }
  if (!priceTrajectoryId) {
    debts.push({
      kind: 'missing-price-trajectory',
      description: `No price trajectory found for case ${caseId}`,
      missingId: caseId,
    });
  }

  // Offer evidence — use buyerOfferId from proof field
  const offerIds: string[] = [];
  if (contractFact.buyerOfferId) {
    offerIds.push(contractFact.buyerOfferId);
  } else if (priceTrajectoryId && state.runtimePriceTrajectories) {
    const trajectory = state.runtimePriceTrajectories.find(
      (pt) => pt.trajectoryId === priceTrajectoryId,
    );
    if (trajectory) {
      for (const offer of trajectory.offers) {
        offerIds.push(offer.offerId);
      }
    }
  }
  if (offerIds.length === 0) {
    debts.push({
      kind: 'missing-offer-evidence',
      description: `No buyer offer evidence for contract ${contractFactId}`,
      missingId: contractFact.buyerOfferId,
    });
  }

  // Concession evidence — use ownerConcessionId from proof field
  const concessionIds: string[] = [];
  if (contractFact.ownerConcessionId) {
    concessionIds.push(contractFact.ownerConcessionId);
  } else if (priceTrajectoryId && state.runtimePriceTrajectories) {
    const trajectory = state.runtimePriceTrajectories.find(
      (pt) => pt.trajectoryId === priceTrajectoryId,
    );
    if (trajectory) {
      for (const concession of trajectory.concessions) {
        concessionIds.push(concession.concessionId);
      }
    }
  }
  if (concessionIds.length === 0) {
    debts.push({
      kind: 'missing-concession-evidence',
      description: `No owner concession evidence for contract ${contractFactId}`,
      missingId: contractFact.ownerConcessionId,
    });
  }

  // Weight explanations
  const weightExplanations: readonly WeightExplanation[] = contractFact.weightExplanations ?? [];
  if (weightExplanations.length === 0) {
    debts.push({
      kind: 'missing-weight-explanation',
      description: `No weight explanations for contract ${contractFactId}`,
    });
  }

  // Relation evidence (broker-owner trust)
  const relationEvidenceIds: string[] = [];
  if (state.runtimeBrokerOwnerRelations) {
    const relevantRelations = state.runtimeBrokerOwnerRelations.filter(
      (r) => r.relationId.includes(caseId) || r.ownerId.includes(caseId),
    );
    for (const r of relevantRelations) {
      relationEvidenceIds.push(r.relationId);
    }
  }
  if (relationEvidenceIds.length === 0) {
    debts.push({
      kind: 'missing-relation-evidence',
      description: `No broker-owner relation evidence found for case ${caseId}`,
      missingId: caseId,
    });
  }

  // Readiness evidence (owner case readiness)
  const readinessEvidenceIds: string[] = [];
  if (state.runtimeOwnerCaseReadinessStates) {
    const readiness = state.runtimeOwnerCaseReadinessStates.find(
      (r) => r.relationId === `owner-case:${caseId}`,
    );
    if (readiness) {
      readinessEvidenceIds.push(readiness.relationId);
    }
  }
  if (readinessEvidenceIds.length === 0) {
    debts.push({
      kind: 'missing-readiness-evidence',
      description: `No readiness evidence found for case ${caseId}`,
      missingId: caseId,
    });
  }

  // Receipt evidence (action receipts)
  const receiptIds: string[] = [];
  if (state.actionReceiptHistory) {
    const receipts = state.actionReceiptHistory.filter(
      (r) => r.caseId === caseId,
    );
    for (const r of receipts) {
      receiptIds.push(r.receiptId);
    }
  }

  // Terminal outcome
  let terminalOutcomeId: string | undefined;
  if (state.runtimeCaseTerminalOutcomes) {
    const outcome = state.runtimeCaseTerminalOutcomes.find(
      (t) => t.caseId === caseId,
    );
    terminalOutcomeId = outcome?.terminalOutcomeId;
  }

  // Opportunity/customer IDs
  const opportunity = state.opportunities.find((o) => o.caseId === caseId);

  return {
    contractFactId,
    caseId,
    opportunityId: opportunity?.id,
    customerId: opportunity?.customerId,
    consensusId,
    priceTrajectoryId,
    offerIds,
    concessionIds,
    relationEvidenceIds,
    readinessEvidenceIds,
    receiptIds,
    terminalOutcomeId,
    weightExplanations,
    debts,
  };
}

/**
 * Build a constitutional truth trace for a case (finds contract fact if exists).
 */
export function traceContractFactForCase(
  state: GameState,
  caseId: string,
): ConstitutionalTruthTrace | null {
  if (!state.runtimeContractFacts) return null;
  const contract = state.runtimeContractFacts.find((cf) => cf.caseId === caseId);
  if (!contract) return null;
  return buildConstitutionalTruthTrace(state, contract);
}
