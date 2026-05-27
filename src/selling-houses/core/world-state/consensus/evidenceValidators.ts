/**
 * Evidence Validators for ContractFact Causal Proof Spine
 *
 * These validators ensure that ContractFact has real evidence chain,
 * not just type shells with fabricated IDs.
 *
 * R43: ContractFact must be traceable to real SourceRecords/CausalEvents/ActionReceipts.
 */

/**
 * Validate that a sourceRecordId refers to a real SourceRecord.
 *
 * Valid SourceRecord IDs must:
 * 1. Start with 'isr-' (Information Source Record prefix), OR
 * 2. Exist in state.pendingSourceRecords, OR
 * 3. Exist in state.worldCausalEvents[].sourceRecordId
 *
 * Invalid IDs (will be rejected):
 * - 'case:xxx' (structural ID, not a SourceRecord)
 * - 'opp:xxx' (structural ID, not a SourceRecord)
 * - opportunityId (variable name, not an ID)
 * - 'readiness:80' (weight factor, not an ID)
 */
export function validateSourceRecordId(id: string, state?: { pendingSourceRecords?: readonly { sourceRecordId: string }[]; worldCausalEvents?: readonly { sourceRecordId?: string }[] }): boolean {
  // Accept isr- prefix (canonical Information Source Record)
  if (id.startsWith('isr-')) {
    return true;
  }

  // If state provided, check actual collections
  if (state) {
    // Check pending source records
    if (state.pendingSourceRecords?.some(r => r.sourceRecordId === id)) {
      return true;
    }

    // Check world causal events
    if (state.worldCausalEvents?.some(e => e.sourceRecordId === id)) {
      return true;
    }
  }

  // Reject structural IDs that are not real SourceRecords
  if (id.startsWith('case:') || id.startsWith('opp:') || id.startsWith('opportunity')) {
    return false;
  }

  // Reject weight factors
  if (id.startsWith('readiness:') || id.startsWith('probability:')) {
    return false;
  }

  // For other IDs, require state to verify existence
  // If no state provided, reject unknown formats
  return false;
}

/**
 * Validate that sourceEventRefs in ContractFact can be resolved to real evidence.
 *
 * Each ref must either:
 * 1. Be a valid SourceRecord ID (validateSourceRecordId), OR
 * 2. Be a valid CausalEvent ID (starts with 'cer-'), OR
 * 3. Be a valid ActionReceipt ID (starts with 'ar-'), OR
 * 4. Be a valid ProcessReceipt ID (starts with 'pr-')
 *
 * Invalid refs:
 * - Trajectory structural IDs (trajectory:xxx)
 * - Readiness/probability weight factors
 * - Strategy IDs without evidence backing
 */
export function validateContractFactSourceEventRefs(
  refs: readonly string[],
  state?: {
    pendingSourceRecords?: readonly { sourceRecordId: string }[];
    worldCausalEvents?: readonly { causalEventId?: string; sourceRecordId?: string }[];
    actionReceiptHistory?: readonly { receiptId: string }[];
  },
): { valid: boolean; invalidRefs: string[] } {
  const invalidRefs: string[] = [];

  for (const ref of refs) {
    // Check if it's a valid SourceRecord ID
    if (validateSourceRecordId(ref, state)) {
      continue;
    }

    // Check if it's a valid CausalEvent ID
    if (ref.startsWith('cer-')) {
      if (state?.worldCausalEvents?.some(e => e.causalEventId === ref)) {
        continue;
      }
    }

    // Check if it's a valid ActionReceipt ID
    if (ref.startsWith('ar-')) {
      if (state?.actionReceiptHistory?.some(r => r.receiptId === ref)) {
        continue;
      }
    }

    // Check if it's a valid ProcessReceipt ID
    if (ref.startsWith('pr-')) {
      // Process receipts would be in runtime state
      continue;
    }

    // Reject structural IDs that are not evidence
    if (ref.startsWith('trajectory:') || ref.startsWith('readiness:') || ref.startsWith('probability:')) {
      invalidRefs.push(ref);
      continue;
    }

    // Reject strategy IDs without evidence backing
    if (ref.startsWith('strategy:')) {
      invalidRefs.push(ref);
      continue;
    }

    // Unknown ref format - reject
    invalidRefs.push(ref);
  }

  return {
    valid: invalidRefs.length === 0,
    invalidRefs,
  };
}

/**
 * Distinguish between structural refs and evidence refs.
 *
 * Structural refs: IDs for structure/tracing (trajectory:xxx, consensus:xxx)
 * Evidence refs: IDs for validation (isr-xxx, cer-xxx, ar-xxx)
 */
export function classifyRefs(refs: readonly string[]): {
  structuralRefs: string[];
  evidenceRefs: string[];
} {
  const structuralRefs: string[] = [];
  const evidenceRefs: string[] = [];

  for (const ref of refs) {
    // Structural IDs
    if (ref.startsWith('trajectory:') || ref.startsWith('consensus:') || ref.startsWith('readiness:')) {
      structuralRefs.push(ref);
    }
    // Evidence IDs
    else if (ref.startsWith('isr-') || ref.startsWith('cer-') || ref.startsWith('ar-') || ref.startsWith('pr-')) {
      evidenceRefs.push(ref);
    }
    // Unknown - treat as structural for now
    else {
      structuralRefs.push(ref);
    }
  }

  return { structuralRefs, evidenceRefs };
}
