/**
 * ProcessRun Runtime Adapter — aggregates ActionReceipts and
 * CommitmentSettlements into multi-day ProcessRun instances.
 *
 * Answers: "Is this an isolated action, or part of a business process
 * that's advancing, blocked, or converting to contract?"
 *
 * Mother model alignment:
 * - Section 3: Processes (OpenDayRun, NegotiationProcess, etc.)
 * - Section 8: Broker Service Essence
 * - Section 12: Consensus Formation lifecycle
 * - Section 18.10: replayable, deterministic
 *
 * Hard constraints:
 * 1. Pure functions for building — no side effects on GameState.
 * 2. No Date.now, no Math.random, no fetch, no LLM.
 * 3. Deterministic: same input → same output.
 * 4. Frozen output.
 * 5. No raw GameState/Case/Opportunity in ProcessRun output.
 * 6. ProcessRun.nextStep is draft-only — never executed.
 * 7. Does NOT alter rngCalls, closedDeals, opportunity lifecycle.
 * 8. Upsert by runId — no duplicate runs.
 */

import type {
  ActionReceipt,
  CommitmentSettlement,
  GameState,
} from '../../domain/models.js';

import type {
  ProcessRun,
  ProcessRunInput,
  ProcessRunSummary,
  ProcessRunAggregatedSummary,
  ProcessRunBlocker,
  ProcessRunEvidenceRef,
  ProcessRunNextStepDraft,
  ProcessRunOutcome,
  ProcessRunStatus,
  ProcessRunPhaseSnapshot,
  BusinessFlowTemplateKind,
  BusinessFlowTemplate,
} from '../../core/world-state/processes/models.js';

import {
  buildBusinessFlowTemplateCatalog,
  buildProcessRunFromInput,
  summarizeProcessRunsForCase,
  summarizeProcessRunsAcrossCases,
} from '../../core/world-state/processes/models.js';

// ---------------------------------------------------------------------------
// ActionPatternSignature — maps action sequences to flow kinds
// ---------------------------------------------------------------------------

interface ActionPatternSignature {
  readonly kind: BusinessFlowTemplateKind;
  readonly triggerActions: readonly string[];
  readonly advancingActions: readonly string[];
  readonly terminalActions: readonly string[];
  readonly terminalSettlementKinds: readonly string[];
}

const FLOW_PATTERNS: readonly ActionPatternSignature[] = Object.freeze([
  Object.freeze({
    kind: 'price_adjustment_communication',
    triggerActions: ['pricing-advice', 'ask-psychological-price'],
    advancingActions: ['weekly-feedback', 'deep-diagnosis'],
    terminalActions: ['adjust-listing-price'],
    terminalSettlementKinds: ['price_anchor'],
  }),
  Object.freeze({
    kind: 'showing_to_offer_conversion',
    triggerActions: ['showing'],
    advancingActions: ['story', 'xiaohongshu-boost', 'broker-broadcast', 'private-referral'],
    terminalActions: ['invite-customer-negotiation', 'sincerity-sale'],
    terminalSettlementKinds: ['opportunity_stage'],
  }),
  Object.freeze({
    kind: 'open_day_campaign',
    triggerActions: ['open-day'],
    advancingActions: ['story', 'xiaohongshu-boost', 'broker-broadcast'],
    terminalActions: ['showing', 'invite-customer-negotiation'],
    terminalSettlementKinds: ['opportunity_stage'],
  }),
  Object.freeze({
    kind: 'sincerity_sale_push',
    triggerActions: ['sincerity-sale'],
    advancingActions: ['pricing-advice', 'weekly-feedback'],
    terminalActions: ['invite-customer-negotiation'],
    terminalSettlementKinds: ['opportunity_stage', 'consensus_advance'],
  }),
  Object.freeze({
    kind: 'owner_waiting_to_commitment',
    triggerActions: ['weekly-feedback', 'deep-diagnosis'],
    advancingActions: ['first-visit', 'focus-meeting-submit'],
    terminalActions: ['pricing-advice', 'sincerity-sale', 'open-day'],
    terminalSettlementKinds: ['commitment_strength', 'price_anchor'],
  }),
  Object.freeze({
    kind: 'consensus_to_contract',
    triggerActions: ['invite-customer-negotiation'],
    advancingActions: ['sincerity-sale', 'pricing-advice'],
    terminalActions: [],
    terminalSettlementKinds: ['contract_signed', 'consensus_advance'],
  }),
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]) as readonly T[];
}

function groupReceiptsByCase(
  receipts: readonly ActionReceipt[],
): Map<string, readonly ActionReceipt[]> {
  const mutableMap = new Map<string, ActionReceipt[]>();
  for (const r of receipts) {
    if (!mutableMap.has(r.caseId)) mutableMap.set(r.caseId, []);
    mutableMap.get(r.caseId)!.push(r);
  }
  // Sort each group by day ascending for deterministic ordering
  const result = new Map<string, readonly ActionReceipt[]>();
  for (const [key, arr] of mutableMap) {
    arr.sort((a, b) => a.day - b.day);
    result.set(key, freezeArray(arr));
  }
  return result;
}

function groupSettlementsByCase(
  settlements: readonly CommitmentSettlement[],
): Map<string, readonly CommitmentSettlement[]> {
  const mutableMap = new Map<string, CommitmentSettlement[]>();
  for (const s of settlements) {
    if (!mutableMap.has(s.caseId)) mutableMap.set(s.caseId, []);
    mutableMap.get(s.caseId)!.push(s);
  }
  const result = new Map<string, readonly CommitmentSettlement[]>();
  for (const [key, arr] of mutableMap) {
    arr.sort((a, b) => a.day - b.day);
    result.set(key, freezeArray(arr));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Flow detection: which pattern best matches a receipt sequence?
// ---------------------------------------------------------------------------

interface FlowMatch {
  readonly kind: BusinessFlowTemplateKind;
  readonly confidence: number; // 0..1
  readonly triggerDay: number;
  readonly latestDay: number;
  readonly matchedTriggerIds: readonly string[];
  readonly matchedAdvancingIds: readonly string[];
  readonly matchedTerminalIds: readonly string[];
}

function detectFlowKind(
  receipts: readonly ActionReceipt[],
  settlements: readonly CommitmentSettlement[],
): FlowMatch | null {
  if (receipts.length === 0) return null;

  const actionIds = receipts.map((r) => r.actionId);
  const settlementKinds = settlements.map((s) => s.commitmentKind);
  const triggerDay = receipts[0].day;
  const latestDay = receipts[receipts.length - 1].day;

  let bestMatch: FlowMatch | null = null;

  for (const pattern of FLOW_PATTERNS) {
    const matchedTriggers = actionIds.filter((id) => pattern.triggerActions.includes(id));
    const matchedAdvancing = actionIds.filter((id) => pattern.advancingActions.includes(id));
    const matchedTerminals = actionIds.filter((id) => pattern.terminalActions.includes(id));
    const matchedSettlementKinds = settlementKinds.filter((k) => pattern.terminalSettlementKinds.includes(k));

    // Confidence: weighted by match quality
    const triggerScore = matchedTriggers.length > 0 ? 0.4 : 0;
    const advancingScore = matchedAdvancing.length > 0 ? Math.min(0.3, matchedAdvancing.length * 0.1) : 0;
    const terminalScore = matchedTerminals.length > 0 ? 0.2 : 0;
    const settlementScore = matchedSettlementKinds.length > 0 ? 0.1 : 0;
    const confidence = triggerScore + advancingScore + terminalScore + settlementScore;

    if (confidence > 0 && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = Object.freeze({
        kind: pattern.kind,
        confidence,
        triggerDay,
        latestDay,
        matchedTriggerIds: freezeArray(matchedTriggers),
        matchedAdvancingIds: freezeArray(matchedAdvancing),
        matchedTerminalIds: freezeArray(matchedTerminals),
      });
    }
  }

  return bestMatch;
}

// ---------------------------------------------------------------------------
// Phase detection from receipt sequence
// ---------------------------------------------------------------------------

function detectCurrentPhase(
  flowMatch: FlowMatch,
  template: BusinessFlowTemplate,
): string {
  const allTerminalMatched = flowMatch.matchedTerminalIds.length > 0;
  const hasAdvancing = flowMatch.matchedAdvancingIds.length > 0;
  const hasTriggers = flowMatch.matchedTriggerIds.length > 0;

  // Find the best matching phase based on which actions have been seen
  if (allTerminalMatched) {
    // Find terminal phases
    const terminalPhases = template.phases.filter((p) => p.isTerminal);
    // If we have settlement data suggesting contract, pick contract phase
    // Otherwise pick the first terminal
    return terminalPhases[0]?.phaseId ?? template.phases[template.phases.length - 1]?.phaseId ?? 'unknown';
  }

  if (hasAdvancing) {
    // Find mid-phases (non-terminal, non-first)
    const midPhases = template.phases.filter((p) => !p.isTerminal && p.order > 0);
    return midPhases.length > 0 ? midPhases[midPhases.length - 1].phaseId : template.phases[0]?.phaseId ?? 'unknown';
  }

  if (hasTriggers) {
    // Initial phase
    return template.phases[0]?.phaseId ?? 'unknown';
  }

  return template.phases[0]?.phaseId ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Build ProcessRun for one case
// ---------------------------------------------------------------------------

function buildProcessRunForCase(
  caseId: string,
  receipts: readonly ActionReceipt[],
  settlements: readonly CommitmentSettlement[],
  templateCatalog: readonly BusinessFlowTemplate[],
): ProcessRun | null {
  if (receipts.length === 0) return null;

  const flowMatch = detectFlowKind(receipts, settlements);
  if (!flowMatch || flowMatch.confidence < 0.3) return null;

  const template = templateCatalog.find((t) => t.kind === flowMatch.kind);
  if (!template) return null;

  const currentPhaseId = detectCurrentPhase(flowMatch, template);

  // Build phase snapshots
  const phaseSnapshots: ProcessRunPhaseSnapshot[] = [];
  for (const phase of template.phases) {
    if (phase.order === 0 || flowMatch.matchedTriggerIds.length > 0) {
      const phaseReceipts = receipts.filter((r) => {
        const allMatched = [...flowMatch.matchedTriggerIds, ...flowMatch.matchedAdvancingIds, ...flowMatch.matchedTerminalIds];
        return allMatched.includes(r.actionId);
      });
      const phaseSettlements = settlements.filter((s) =>
        template.phases.some((p) => p.requiredEvidenceKinds.includes('commitment_settlement')),
      );

      phaseSnapshots.push(Object.freeze({
        phaseId: phase.phaseId,
        enteredDay: flowMatch.triggerDay,
        exitedDay: phase.isTerminal ? flowMatch.latestDay : undefined,
        durationDays: phase.isTerminal ? flowMatch.latestDay - flowMatch.triggerDay : 0,
        actionReceiptIds: freezeArray(phaseReceipts.map((r) => r.receiptId)),
        commitmentSettlementIds: freezeArray(phaseSettlements.map((s) => s.settlementId)),
        blockers: Object.freeze([]),
      }));
    }
  }

  // Build evidence refs
  const evidenceRefs: ProcessRunEvidenceRef[] = [];
  for (const r of receipts) {
    evidenceRefs.push(Object.freeze({
      refType: 'action_receipt',
      refId: r.receiptId,
      summary: `${r.actionId}: ${r.outcomeSummary}`,
      relevance: r.outcome === 'success' ? 0.85 : r.outcome === 'blocked' ? 0.4 : 0.6,
    }));
  }
  for (const s of settlements) {
    evidenceRefs.push(Object.freeze({
      refType: 'commitment_settlement',
      refId: s.settlementId,
      summary: `${s.commitmentKind} ${s.trigger}: ${s.reason}`,
      relevance: s.trigger === 'signed' ? 0.95 : 0.7,
    }));
  }

  // Determine status
  let status: ProcessRunStatus = 'active';
  const lastReceipt = receipts[receipts.length - 1];
  if (lastReceipt.outcome === 'blocked') {
    status = 'blocked';
  }
  // Check for contract conversion
  const hasContractSettlement = settlements.some((s) => s.trigger === 'signed');
  if (hasContractSettlement) {
    status = 'converted_to_contract';
  }
  const hasCollapse = settlements.some((s) => s.trigger === 'collapsed');
  if (hasCollapse) {
    status = 'collapsed';
  }

  // Build next step drafts
  const nextStepDrafts: ProcessRunNextStepDraft[] = [];
  if (status === 'active' || status === 'blocked') {
    const nextPhase = template.phases.find((p) => p.order === template.phases.findIndex((pp) => pp.phaseId === currentPhaseId) + 1);
    if (nextPhase) {
      nextStepDrafts.push(Object.freeze({
        draftId: `draft:${flowMatch.kind}:${caseId}:${nextPhase.phaseId}`,
        actionKind: nextPhase.requiredEvidenceKinds[0] ?? 'action',
        description: `推进到 ${nextPhase.label}`,
        priority: status === 'blocked' ? 'urgent' : 'medium',
        relatedPhaseId: nextPhase.phaseId,
        rationale: nextPhase.description,
      }));
    }
  }

  // Build outcome
  let outcome: ProcessRunOutcome | undefined;
  if (status === 'converted_to_contract') {
    const signedSettlement = settlements.find((s) => s.trigger === 'signed');
    outcome = Object.freeze({
      outcomeType: 'converted_to_contract',
      description: `成交：${signedSettlement?.reason ?? '共识转签约'}`,
      relatedConsensusId: signedSettlement?.relatedEventIds?.[0],
    });
  } else if (status === 'collapsed') {
    outcome = Object.freeze({
      outcomeType: 'collapsed',
      description: settlements.find((s) => s.trigger === 'collapsed')?.reason ?? '共识破裂',
    });
  }

  // Build actor IDs from receipts
  const actorIds = new Set<string>();
  actorIds.add('broker');
  if (flowMatch.kind === 'owner_waiting_to_commitment' || flowMatch.kind === 'price_adjustment_communication') {
    actorIds.add('owner');
  }
  if (flowMatch.kind === 'showing_to_offer_conversion' || flowMatch.kind === 'consensus_to_contract') {
    actorIds.add('customer');
  }

  const input: ProcessRunInput = {
    templateId: template.templateId,
    templateKind: flowMatch.kind,
    caseId,
    actorIds: freezeArray([...actorIds]),
    status,
    currentPhaseId,
    startedDay: flowMatch.triggerDay,
    endedDay: status !== 'active' ? flowMatch.latestDay : undefined,
    phaseSnapshots: freezeArray(phaseSnapshots),
    evidenceRefs: freezeArray(evidenceRefs),
    blockers: Object.freeze([]),
    nextStepDrafts: freezeArray(nextStepDrafts),
    outcome,
  };

  return buildProcessRunFromInput(input);
}

// ---------------------------------------------------------------------------
// buildProcessRunsFromState — main entry point
// ---------------------------------------------------------------------------

/**
 * Builds ProcessRun instances from GameState's action receipt and
 * commitment settlement history.
 *
 * Reads only from already-computed history arrays.
 * Does NOT mutate GameState.
 * Pure function. Deterministic. Frozen output.
 *
 * @param state - GameState (read-only access to history arrays)
 * @returns Frozen array of ProcessRun instances
 */
export function buildProcessRunsFromState(
  state: GameState,
): readonly ProcessRun[] {
  const receipts = state.actionReceiptHistory ?? [];
  const settlements = state.commitmentSettlementHistory ?? [];

  if (receipts.length === 0) return Object.freeze([]);

  const templateCatalog = buildBusinessFlowTemplateCatalog();
  const receiptsByCase = groupReceiptsByCase(receipts);
  const settlementsByCase = groupSettlementsByCase(settlements);

  const runs: ProcessRun[] = [];

  for (const [caseId, caseReceipts] of receiptsByCase) {
    const caseSettlements = settlementsByCase.get(caseId) ?? Object.freeze([]);
    const run = buildProcessRunForCase(caseId, caseReceipts, caseSettlements, templateCatalog);
    if (run) {
      runs.push(run);
    }
  }

  // Sort by startedDay ascending, then by caseId for determinism
  runs.sort((a, b) => {
    if (a.startedDay !== b.startedDay) return a.startedDay - b.startedDay;
    return a.caseId.localeCompare(b.caseId);
  });

  return freezeArray(runs);
}

// ---------------------------------------------------------------------------
// enrichStateWithProcessRuns — upsert-safe state enrichment
// ---------------------------------------------------------------------------

/**
 * Enriches GameState with processRunHistory.
 * Uses upsert by runId to avoid duplicates.
 * Does NOT affect gameplay, RNG, tick order, or UI.
 */
export function enrichStateWithProcessRuns(
  state: GameState,
  runs: readonly ProcessRun[],
): void {
  if (!state.processRunHistory) {
    state.processRunHistory = [];
  }

  for (const run of runs) {
    const existingIndex = state.processRunHistory.findIndex(
      (entry) => entry.runId === run.runId,
    );
    if (existingIndex >= 0) {
      state.processRunHistory[existingIndex] = run;
    } else {
      state.processRunHistory.push(run);
    }
  }
}

// ---------------------------------------------------------------------------
// buildProcessRunAggregatedSummary — compressed summary for a day
// ---------------------------------------------------------------------------

export function buildProcessRunAggregatedSummary(
  state: GameState,
  day: number,
): ProcessRunAggregatedSummary {
  const runs = (state.processRunHistory ?? []).filter(
    (r) => r.startedDay <= day && (!r.endedDay || r.endedDay >= day),
  );

  // Group by caseId
  const byCase = new Map<string, ProcessRun[]>();
  for (const run of runs) {
    if (!byCase.has(run.caseId)) byCase.set(run.caseId, []);
    byCase.get(run.caseId)!.push(run);
  }

  const caseSummaries: ProcessRunSummary[] = [];
  for (const [caseId, caseRuns] of byCase) {
    caseSummaries.push(summarizeProcessRunsForCase({ caseId, runs: caseRuns }));
  }

  return summarizeProcessRunsAcrossCases(day, caseSummaries);
}

// ---------------------------------------------------------------------------
// normalizeProcessRunHistory — for save/load compatibility
// ---------------------------------------------------------------------------

export function normalizeProcessRunHistory(input: unknown): ProcessRun[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (entry): entry is ProcessRun =>
      entry != null
      && typeof entry === 'object'
      && typeof (entry as any).runId === 'string'
      && typeof (entry as any).caseId === 'string'
      && typeof (entry as any).startedDay === 'number'
      && (entry as any).startedDay > 0,
  );
}
