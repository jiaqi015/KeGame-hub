/**
 * LLM Replay Support v0 — deterministic replay record helpers.
 *
 * Mother model alignment:
 * - Section 18.10: "Store model versions and LLM-derived structured outputs
 *   used by simulation. For replay, store action commands, seeds/RNG counters,
 *   model versions, and any LLM-derived structured outputs used by simulation."
 * - Section 20.7: "LLM output is narrative-only unless structured outputs are
 *   explicitly cached and replayed."
 *
 * Hard constraints:
 * 1. Does NOT call LLM, fetch, OpenAI, or any external provider.
 * 2. Does NOT read raw GameState, Case, Opportunity, or DomainEventEntry.
 * 3. Does NOT affect rngCalls or simulation state.
 * 4. Deterministic: no Date.now, no Math.random, no global state.
 * 5. Replay records are cache records, not re-invocations.
 * 6. No-LLM disabled replay records are always applied=false, never_apply_directly.
 * 7. What-if proposals are offline cached shells, not live mutations.
 */

import type {
  LlmReplayRecord,
  LlmOutputProposal,
  LlmInvocationEnvelope,
  LlmInputPackRef,
  LlmDisabledFallback,
  LlmValidationResult,
} from '../../core/llm-boundary/models.js';

import { buildDisabledFallback } from '../../core/llm-boundary/models.js';

// ---------------------------------------------------------------------------
// Replay record builder from disabled fallback
// ---------------------------------------------------------------------------

/**
 * Builds a LlmReplayRecord from a disabled fallback.
 * The record is always applied=false with never_apply_directly applyability.
 * Pure function: no side effects, no RNG, no network.
 */
export function buildDisabledReplayRecord(
  fallback: LlmDisabledFallback,
  inputPackRef?: LlmInputPackRef,
): LlmReplayRecord {
  return Object.freeze({
    invocation: Object.freeze({
      invocationId: 'disabled-replay',
      capabilityMode: 'disabled',
      provider: 'none',
      requestedAtDay: 0,
      requestedByActor: 'system',
      inputPackHash: inputPackRef?.packHash ?? 'disabled',
      sourcePackKind: inputPackRef?.packKind ?? 'narrative_signal_pack',
    }),
    inputPackRef: inputPackRef ?? Object.freeze({
      packKind: 'narrative_signal_pack',
      packHash: 'disabled',
      packedAtDay: 0,
      sourceSnapshotIds: Object.freeze([]),
      sourceReceiptIds: Object.freeze([]),
      summary: 'LLM disabled — no input pack',
    }),
    proposal: fallback.fallbackProposal,
    applied: false,
    systemAction: 'none — LLM disabled mode',
  });
}

// ---------------------------------------------------------------------------
// Replay record builder from proposal
// ---------------------------------------------------------------------------

/**
 * Builds a LlmReplayRecord from a proposal.
 * The record caches the proposal for deterministic replay.
 * Pure function: no side effects, no RNG, no network.
 */
export function buildReplayRecord(
  proposal: LlmOutputProposal,
  invocation: LlmInvocationEnvelope,
  inputPackRef: LlmInputPackRef,
  applied: boolean,
  systemAction?: string,
  validationResult?: LlmValidationResult,
): LlmReplayRecord {
  return Object.freeze({
    invocation: Object.freeze({ ...invocation }),
    inputPackRef: Object.freeze({ ...inputPackRef }),
    proposal: Object.freeze({ ...proposal }),
    validationResult: validationResult ? Object.freeze({ ...validationResult }) : undefined,
    applied,
    systemAction,
  });
}

// ---------------------------------------------------------------------------
// Replay record store (in-memory, per-session)
// ---------------------------------------------------------------------------

/**
 * In-memory replay record store.
 * NOT persisted to GameState. NOT a canonical fact.
 * Only exists for debugging, audit, and deterministic replay.
 */
export interface LlmReplayStore {
  readonly records: readonly LlmReplayRecord[];
}

export function createReplayStore(): LlmReplayStore {
  return Object.freeze({ records: Object.freeze([]) });
}

/**
 * Appends a replay record to the store.
 * Returns a new frozen store (immutable append).
 * Pure function: no mutation of input store.
 */
export function appendReplayRecord(
  store: LlmReplayStore,
  record: LlmReplayRecord,
): LlmReplayStore {
  return Object.freeze({
    records: Object.freeze([...store.records, Object.freeze({ ...record })]),
  });
}

// ---------------------------------------------------------------------------
// Replay validation: check if a cached record is still valid
// ---------------------------------------------------------------------------

/**
 * Checks if a replay record is valid for deterministic replay.
 * Returns true if the record can be safely replayed without re-invoking LLM.
 *
 * Criteria:
 * - Record exists and has a proposal
 * - proposalId is deterministic (no Date.now/NaN)
 * - If applied=true, systemAction is present
 * - If applied=false, applyability must be never_apply_directly or advisory_only
 */
export function isReplayRecordValid(record: LlmReplayRecord): boolean {
  if (!record.proposal) return false;
  if (!record.proposal.proposalId || record.proposal.proposalId.includes('NaN')) return false;

  if (record.applied && !record.systemAction) return false;
  if (!record.applied && record.proposal.applyability === 'validator_required') return false;

  // Hash consistency: invocation.inputPackHash must match inputPackRef.packHash
  if (record.invocation.inputPackHash !== record.inputPackRef.packHash) return false;

  return true;
}

/**
 * Checks if a replay record is from disabled/no-LLM mode.
 */
export function isDisabledReplayRecord(record: LlmReplayRecord): boolean {
  return record.invocation.capabilityMode === 'disabled'
    && record.proposal.isFallback === true;
}

// ---------------------------------------------------------------------------
// What-if proposal shell (offline cached, never applied)
// ---------------------------------------------------------------------------

/**
 * What-if proposal shell: a cached offline proposal that represents
 * "what would happen if LLM proposed this." Never applied to simulation.
 * Never affects rngCalls or game state.
 *
 * Pure function: no side effects.
 */
export function buildWhatIfProposalShell(
  proposalId: string,
  caseId: string,
  dimension: string,
  magnitude: number,
  reason: string,
): LlmOutputProposal {
  return Object.freeze({
    proposalId,
    proposalKind: 'what_if_policy_proposal',
    invocationEnvelope: Object.freeze({
      invocationId: `whatif-${caseId}-${dimension}`,
      capabilityMode: 'disabled',
      provider: 'none',
      requestedAtDay: 0,
      requestedByActor: 'system',
      inputPackHash: `whatif-${caseId}-${dimension}`,
      sourcePackKind: 'narrative_signal_pack',
    }),
    inputPackRef: Object.freeze({
      packKind: 'narrative_signal_pack',
      packHash: `whatif-${caseId}-${dimension}`,
      packedAtDay: 0,
      sourceSnapshotIds: Object.freeze([]),
      sourceReceiptIds: Object.freeze([]),
      summary: `What-if: ${dimension} delta ${magnitude} on ${caseId}`,
    }),
    evidenceRefs: Object.freeze([]),
    content: Object.freeze({
      kind: 'text',
      text: reason,
      language: 'zh',
    }),
    validationStatus: 'pending',
    applyability: 'never_apply_directly',
    isFallback: false,
  });
}

// ---------------------------------------------------------------------------
// Replay store summary (read-only, for workspace projection)
// ---------------------------------------------------------------------------

export interface LlmReplayStoreSummary {
  readonly totalRecords: number;
  readonly disabledRecords: number;
  readonly appliedRecords: number;
  readonly pendingRecords: number;
  readonly lastProposalId: string | null;
}

/**
 * Builds a read-only summary of the replay store.
 * Pure function: no side effects.
 */
export function buildReplayStoreSummary(
  store: LlmReplayStore,
): LlmReplayStoreSummary {
  const records = store.records;
  const disabled = records.filter(isDisabledReplayRecord).length;
  const applied = records.filter((r) => r.applied).length;
  const pending = records.filter((r) => !r.applied && !isDisabledReplayRecord(r)).length;
  const lastId = records.length > 0 ? records[records.length - 1].proposal.proposalId : null;

  return Object.freeze({
    totalRecords: records.length,
    disabledRecords: disabled,
    appliedRecords: applied,
    pendingRecords: pending,
    lastProposalId: lastId,
  });
}
