/**
 * Canonical Store Kernel — shared types for canonical store write provenance and audit.
 *
 * Every write to a canonical runtime store must carry provenance and,
 * where practical, return a receipt. This module defines the shared vocabulary.
 *
 * Store boundary modules (trustWriteHelper, ownerCaseReadinessWriteHelper,
 * consensusFormationHelper, etc.) are the ONLY production files permitted to
 * import asWritableGameState and mutate canonical store arrays.
 *
 * R32: Distinguished canonical stores from legacy mirror/projection stores.
 * closedDeals is a legacy mirror, not a canonical store — receipts must be honest.
 */

// ── Canonical store names (runtime truth collections) ──

export type CanonicalStoreName =
  | 'runtimeBrokerOwnerRelations'
  | 'runtimeBrokerCustomerRelations'
  | 'runtimeOwnerCaseReadinessStates'
  | 'runtimeCustomerCaseMatches'
  | 'runtimeBrokeredOpportunities'
  | 'runtimeConsensusFormations'
  | 'runtimeContractFacts'
  | 'runtimeOpportunityClosureSets'
  | 'runtimePriceTrajectories'
  | 'runtimePriceConsensusReadinesses'
  | 'runtimeCaseTerminalOutcomes';

// ── Legacy mirror/projection store names ──

export type LegacyMirrorStoreName =
  | 'closedDeals'           // mirror of ContractFactState
  | 'eventLog'              // mirror of DomainEventEntry
  | 'eventStore'            // canonical event log
  | 'weeklyReviews'         // weekly summary projections
  | 'budgetLedger'          // budget transaction log
  | 'operatingLedgerDays'   // operating summaries
  | 'actionReceiptHistory'  // action audit trail
  | 'commitmentSettlementHistory'
  | 'processRunHistory'
  | 'ownerDecisionMomentHistory'
  | 'strategyForkHistory'
  | 'managerInterventionReceiptHistory'
  | 'negotiationReplayHistory'
  | 'businessOutcomeReviewHistory'
  | 'wechatConversationHistory';

// ── Combined store name ──

export type StoreName = CanonicalStoreName | LegacyMirrorStoreName;

// ── Write operations ──

export type CanonicalStoreWriteOperation =
  | 'ensure'         // initialize store if absent
  | 'append'         // push new record
  | 'replace'        // replace record at index
  | 'upsert'         // replace or append
  | 'mirror-prepend' // prepend to legacy mirror store
  | 'append-log';    // append to audit/log store

// ── Write provenance ──

export type CanonicalStoreWriteProvenance =
  | 'canonical-bootstrap'     // initial game setup
  | 'old_save_compatibility'  // hydration from legacy fields
  | 'canonical-delta'         // runtime state change
  | 'contract-fact'           // contract formation path
  | 'terminal-outcome'        // terminal outcome closure
  | 'fixture-only'            // test/fixture escape hatch
  | 'legacy_truth_debt';     // known incomplete constitutional chain

// ── Canonical store write receipt ──

export interface CanonicalStoreWriteReceipt {
  readonly store: CanonicalStoreName;
  readonly operation: CanonicalStoreWriteOperation;
  readonly provenance: CanonicalStoreWriteProvenance;
  readonly recordId?: string;
  readonly previousCount?: number;
  readonly nextCount?: number;
}

// ── Legacy mirror write receipt ──

export interface LegacyMirrorWriteReceipt {
  readonly store: LegacyMirrorStoreName;
  readonly operation: CanonicalStoreWriteOperation;
  readonly provenance: CanonicalStoreWriteProvenance;
  readonly canonicalSourceId?: string;
  readonly recordId?: string;
  readonly previousCount?: number;
  readonly nextCount?: number;
}

// ── Combined receipt type ──

export type StoreWriteReceipt = CanonicalStoreWriteReceipt | LegacyMirrorWriteReceipt;

// ── Helper: build canonical receipt ──

export function makeStoreWriteReceipt(
  store: CanonicalStoreName,
  operation: CanonicalStoreWriteOperation,
  provenance: CanonicalStoreWriteProvenance,
  opts?: { recordId?: string; previousCount?: number; nextCount?: number },
): CanonicalStoreWriteReceipt {
  return {
    store,
    operation,
    provenance,
    recordId: opts?.recordId,
    previousCount: opts?.previousCount,
    nextCount: opts?.nextCount,
  };
}

// ── Helper: build legacy mirror receipt ──

export function makeLegacyMirrorWriteReceipt(
  store: LegacyMirrorStoreName,
  operation: CanonicalStoreWriteOperation,
  provenance: CanonicalStoreWriteProvenance,
  opts?: { canonicalSourceId?: string; recordId?: string; previousCount?: number; nextCount?: number },
): LegacyMirrorWriteReceipt {
  return {
    store,
    operation,
    provenance,
    canonicalSourceId: opts?.canonicalSourceId,
    recordId: opts?.recordId,
    previousCount: opts?.previousCount,
    nextCount: opts?.nextCount,
  };
}
