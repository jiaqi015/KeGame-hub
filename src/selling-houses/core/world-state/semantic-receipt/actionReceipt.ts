/**
 * ActionReceipt v0 + CommitmentSettlement v0 — pure core read-model contract.
 *
 * Answers: what action did the broker take, what evidence did it produce,
 * which commitments changed, and which commitments need settlement.
 *
 * Mother model alignment:
 * - Section 5: Human Decision Model (DecisionState, DecisionMoment, DecisionCommitment)
 * - Section 8: Broker Service Essence (information → interpretation → recommendation)
 * - Section 9: POV And Interaction Design
 * - Section 12: Consensus Formation
 * - Section 16: High-Priority Interfaces
 * - Section 19.6: Commitment lifecycle (strength, credibility, expiry, revocability)
 *
 * Hard constraints:
 * 1. Pure types in core — no domain/runtime imports.
 * 2. No Date.now, no Math.random, no crypto, no global state.
 * 3. Deterministic: same input → same output, byte-identical.
 * 4. All refs are string IDs, not embedded objects.
 * 5. Summary/ref data only — no raw GameState/Case/Opportunity.
 * 6. All actions are receipt/intent — never executed.
 * 7. Ledger is a projection, not a replacement for GameState.
 * 8. Frozen output.
 */

// ---------------------------------------------------------------------------
// BrokerActionReceiptKind: what kind of action was taken
// ---------------------------------------------------------------------------

export type BrokerActionReceiptKind =
  | 'owner_call'              // phone/visit with owner
  | 'customer_follow_up'      // phone/visit with customer
  | 'showing'                 // property showing
  | 'price_report'            // price analysis/report to owner
  | 'negotiation'             // offer negotiation
  | 'marketing'               // marketing activity
  | 'open_day'                // open day event
  | 'sincerity_sale'          // sincerity sale activity
  | 'escalation'              // escalate to manager
  | 'observation'             // passive observation, no direct action
  | 'other';                  // other action

// ---------------------------------------------------------------------------
// BrokerActionReceiptOutcome: what happened as a result
// ---------------------------------------------------------------------------

export type BrokerActionReceiptOutcome =
  | 'success'                 // action achieved its goal
  | 'partial_success'         // action partially achieved its goal
  | 'no_effect'               // action had no meaningful effect
  | 'failed'                  // action failed to achieve its goal
  | 'blocked'                 // action was blocked by external factor
  | 'deferred'                // action was deferred to a later time
  | 'cancelled';              // action was cancelled before execution

// ---------------------------------------------------------------------------
// BrokerActionReceiptEvidenceRef: compressed evidence reference
// ---------------------------------------------------------------------------

export interface BrokerActionReceiptEvidenceRef {
  readonly refType: 'pressure_receipt' | 'consensus_receipt' | 'evaluation_snapshot'
    | 'interaction_scene' | 'event' | 'commitment' | 'belief' | 'attention'
    | 'opportunity' | 'contract_fact' | 'action_spec' | 'signal';
  readonly refId: string;
  readonly summary: string;
  readonly relevance: number; // 0..1
}

// ---------------------------------------------------------------------------
// BrokerActionReceiptCommitmentDelta: commitment change from this action
// ---------------------------------------------------------------------------

export interface BrokerActionReceiptCommitmentDelta {
  readonly commitmentId: string;
  readonly kind: string;
  readonly actorId: string;
  readonly action: 'created' | 'strengthened' | 'weakened' | 'revoked' | 'expired';
  readonly previousStrength?: number;
  readonly newStrength?: number;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// BrokerActionReceipt: receipt for one broker action
// ---------------------------------------------------------------------------

export interface BrokerActionReceipt {
  readonly receiptId: string;
  readonly actionKind: BrokerActionReceiptKind;
  readonly caseId: string;
  readonly actorId: string;
  readonly day: number;
  readonly outcome: BrokerActionReceiptOutcome;
  readonly description: string;
  readonly evidenceRefs: readonly BrokerActionReceiptEvidenceRef[];
  readonly commitmentDeltas: readonly BrokerActionReceiptCommitmentDelta[];
  readonly relatedOpportunityId?: string;
  readonly relatedActionSpecId?: string;
  readonly relatedDraftId?: string;
  readonly businessEffectSummary: string;
}

// ---------------------------------------------------------------------------
// CommitmentSettlementStatus: lifecycle state of a commitment settlement
// ---------------------------------------------------------------------------

export type CommitmentSettlementStatus =
  | 'active'                  // commitment is still in effect
  | 'resolved'                // commitment was fulfilled
  | 'expired'                 // commitment expired without fulfillment
  | 'revoked'                 // commitment was revoked by actor
  | 'escalated'               // commitment escalated to higher authority
  | 'converted_to_contract'   // commitment became a ContractFact
  | 'blocked';                // commitment blocked by external factor

// ---------------------------------------------------------------------------
// CommitmentSettlementReason: why the settlement happened
// ---------------------------------------------------------------------------

export interface CommitmentSettlementReason {
  readonly reasonType: 'action_taken' | 'time_expired' | 'actor_revoked'
    | 'consensus_formed' | 'consensus_collapsed' | 'contract_signed'
    | 'pressure_increased' | 'blocker_emerged' | 'blocker_resolved';
  readonly description: string;
  readonly sourceRefIds: readonly string[];
}

// ---------------------------------------------------------------------------
// CommitmentSettlementTrace: history of commitment state transitions
// ---------------------------------------------------------------------------

export interface CommitmentSettlementTrace {
  readonly traceId: string;
  readonly commitmentId: string;
  readonly fromStatus: CommitmentSettlementStatus;
  readonly toStatus: CommitmentSettlementStatus;
  readonly day: number;
  readonly reason: CommitmentSettlementReason;
  readonly strength?: number;
}

// ---------------------------------------------------------------------------
// CommitmentSettlement: settlement of one commitment
// ---------------------------------------------------------------------------

export interface CommitmentSettlement {
  readonly settlementId: string;
  readonly commitmentId: string;
  readonly commitmentKind: string;
  readonly actorId: string;
  readonly caseId: string;
  readonly status: CommitmentSettlementStatus;
  readonly traces: readonly CommitmentSettlementTrace[];
  readonly currentStrength: number;
  readonly credibility: number;
  readonly createdDay: number;
  readonly settledDay?: number;
  readonly expiryDay?: number;
  readonly relatedActionReceiptIds: readonly string[];
  readonly relatedConsensusId?: string;
}

// ---------------------------------------------------------------------------
// ActionReceiptLedgerLink: link between receipt and operating ledger
// ---------------------------------------------------------------------------

export interface ActionReceiptLedgerLink {
  readonly receiptId: string;
  readonly caseId: string;
  readonly ledgerEntryStatus: 'pending' | 'resolved' | 'signed' | 'closed' | 'observing' | 'risk_blocked';
  readonly day: number;
}

// ---------------------------------------------------------------------------
// ActionReceiptLedgerSummary: summary of receipts for one day
// ---------------------------------------------------------------------------

export interface ActionReceiptLedgerSummary {
  readonly day: number;
  readonly receipts: readonly BrokerActionReceipt[];
  readonly settlements: readonly CommitmentSettlement[];
  readonly receiptCount: number;
  readonly successCount: number;
  readonly failedCount: number;
  readonly blockedCount: number;
  readonly commitmentDeltaCount: number;
  readonly settlementCount: number;
  readonly resolvedSettlementCount: number;
  readonly activeSettlementCount: number;
  readonly ledgerLinks: readonly ActionReceiptLedgerLink[];
}

// ---------------------------------------------------------------------------
// Input shapes for builders
// ---------------------------------------------------------------------------

export interface BrokerActionReceiptInput {
  readonly actionKind: BrokerActionReceiptKind;
  readonly caseId: string;
  readonly actorId: string;
  readonly day: number;
  readonly outcome: BrokerActionReceiptOutcome;
  readonly description: string;
  readonly evidenceRefs?: readonly BrokerActionReceiptEvidenceRef[];
  readonly commitmentDeltas?: readonly BrokerActionReceiptCommitmentDelta[];
  readonly relatedOpportunityId?: string;
  readonly relatedActionSpecId?: string;
  readonly relatedDraftId?: string;
  readonly businessEffectSummary?: string;
}

export interface CommitmentSettlementInput {
  readonly commitmentId: string;
  readonly commitmentKind: string;
  readonly actorId: string;
  readonly caseId: string;
  readonly status: CommitmentSettlementStatus;
  readonly traces?: readonly CommitmentSettlementTrace[];
  readonly currentStrength?: number;
  readonly credibility?: number;
  readonly createdDay: number;
  readonly settledDay?: number;
  readonly expiryDay?: number;
  readonly relatedActionReceiptIds?: readonly string[];
  readonly relatedConsensusId?: string;
}

export interface ActionReceiptLedgerSummaryInput {
  readonly day: number;
  readonly receipts: readonly BrokerActionReceipt[];
  readonly settlements?: readonly CommitmentSettlement[];
}

// ---------------------------------------------------------------------------
// Builders (pure, deterministic, frozen)
// ---------------------------------------------------------------------------

export function buildEmptyBrokerActionReceiptLedger(day: number): ActionReceiptLedgerSummary {
  return Object.freeze({
    day,
    receipts: Object.freeze([]),
    settlements: Object.freeze([]),
    receiptCount: 0,
    successCount: 0,
    failedCount: 0,
    blockedCount: 0,
    commitmentDeltaCount: 0,
    settlementCount: 0,
    resolvedSettlementCount: 0,
    activeSettlementCount: 0,
    ledgerLinks: Object.freeze([]),
  });
}

export function buildBrokerActionReceipt(input: BrokerActionReceiptInput): BrokerActionReceipt {
  const receiptId = `receipt:${input.day}:${input.caseId}:${input.actionKind}`;
  return Object.freeze({
    receiptId,
    actionKind: input.actionKind,
    caseId: input.caseId,
    actorId: input.actorId,
    day: input.day,
    outcome: input.outcome,
    description: input.description,
    evidenceRefs: Object.freeze([...(input.evidenceRefs ?? [])]),
    commitmentDeltas: Object.freeze([...(input.commitmentDeltas ?? [])]),
    relatedOpportunityId: input.relatedOpportunityId,
    relatedActionSpecId: input.relatedActionSpecId,
    relatedDraftId: input.relatedDraftId,
    businessEffectSummary: input.businessEffectSummary ?? '',
  });
}

export function buildCommitmentSettlement(input: CommitmentSettlementInput): CommitmentSettlement {
  const settlementId = `settlement:${input.createdDay ?? 0}:${input.commitmentId}`;
  return Object.freeze({
    settlementId,
    commitmentId: input.commitmentId,
    commitmentKind: input.commitmentKind,
    actorId: input.actorId,
    caseId: input.caseId,
    status: input.status,
    traces: Object.freeze([...(input.traces ?? [])]),
    currentStrength: input.currentStrength ?? 0,
    credibility: input.credibility ?? 0,
    createdDay: input.createdDay,
    settledDay: input.settledDay,
    expiryDay: input.expiryDay,
    relatedActionReceiptIds: Object.freeze([...(input.relatedActionReceiptIds ?? [])]),
    relatedConsensusId: input.relatedConsensusId,
  });
}

export function summarizeActionReceiptsForLedger(
  input: ActionReceiptLedgerSummaryInput,
): ActionReceiptLedgerSummary {
  const receipts = input.receipts;
  const settlements = input.settlements ?? [];

  let successCount = 0;
  let failedCount = 0;
  let blockedCount = 0;
  let commitmentDeltaCount = 0;
  let resolvedSettlementCount = 0;
  let activeSettlementCount = 0;

  for (const r of receipts) {
    if (r.outcome === 'success' || r.outcome === 'partial_success') successCount++;
    if (r.outcome === 'failed') failedCount++;
    if (r.outcome === 'blocked') blockedCount++;
    commitmentDeltaCount += r.commitmentDeltas.length;
  }

  for (const s of settlements) {
    if (s.status === 'resolved' || s.status === 'converted_to_contract') resolvedSettlementCount++;
    if (s.status === 'active') activeSettlementCount++;
  }

  const ledgerLinks: ActionReceiptLedgerLink[] = [];
  for (const r of receipts) {
    let ledgerStatus: ActionReceiptLedgerLink['ledgerEntryStatus'] = 'pending';
    if (r.outcome === 'success' || r.outcome === 'partial_success') ledgerStatus = 'resolved';
    else if (r.outcome === 'failed') ledgerStatus = 'closed';
    else if (r.outcome === 'blocked') ledgerStatus = 'risk_blocked';
    ledgerLinks.push(Object.freeze({
      receiptId: r.receiptId,
      caseId: r.caseId,
      ledgerEntryStatus: ledgerStatus,
      day: r.day,
    }));
  }

  return Object.freeze({
    day: input.day,
    receipts: Object.freeze([...receipts]),
    settlements: Object.freeze([...settlements]),
    receiptCount: receipts.length,
    successCount,
    failedCount,
    blockedCount,
    commitmentDeltaCount,
    settlementCount: settlements.length,
    resolvedSettlementCount,
    activeSettlementCount,
    ledgerLinks: Object.freeze(ledgerLinks),
  });
}
