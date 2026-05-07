/**
 * BusinessFlowTemplate v0 + ProcessRun v0 — pure core read-model contract.
 *
 * Answers: which multi-day business process is running on a case,
 * what phase is it in, what evidence supports it, and what's next.
 *
 * Mother model alignment:
 * - Section 8: Broker Service Essence (information → interpretation → recommendation)
 * - Section 9: POV And Interaction Design
 * - Section 12: Consensus Formation (pending → aligned → signed / collapsed)
 * - Section 16: High-Priority Interfaces (ActorKnowledge, SignalSource)
 * - Section 18.10: replay, store action commands, seeds/RNG counters
 *
 * Hard constraints:
 * 1. Pure types in core — no domain/runtime imports.
 * 2. No Date.now, no Math.random, no crypto, no global state.
 * 3. Deterministic: same input → same output, byte-identical.
 * 4. All refs are string IDs, not embedded objects.
 * 5. Summary/ref data only — no raw GameState/Case/Opportunity.
 * 6. All next steps are draft — never executed.
 * 7. ProcessRun is a projection, not a replacement for GameState.
 * 8. Frozen output.
 * 9. ProcessRun does NOT become a source of gameplay truth.
 */

// ---------------------------------------------------------------------------
// BusinessFlowTemplateKind: which business flow
// ---------------------------------------------------------------------------

export type BusinessFlowTemplateKind =
  | 'price_adjustment_communication'   // 调价沟通
  | 'showing_to_offer_conversion'      // 带看转意向
  | 'open_day_campaign'                // 开放日推进
  | 'sincerity_sale_push'              // 诚意售推进
  | 'owner_waiting_to_commitment'      // 业主等待转承诺
  | 'consensus_to_contract';           // 共识转成交

// ---------------------------------------------------------------------------
// BusinessFlowPhase: phase within a business flow
// ---------------------------------------------------------------------------

export interface BusinessFlowPhase {
  readonly phaseId: string;
  readonly label: string;
  readonly description: string;
  readonly order: number; // 0-based
  readonly isTerminal: boolean;
  readonly requiredEvidenceKinds: readonly string[];
}

// ---------------------------------------------------------------------------
// BusinessFlowPhaseGate: condition to advance to next phase
// ---------------------------------------------------------------------------

export interface BusinessFlowPhaseGate {
  readonly gateId: string;
  readonly fromPhaseId: string;
  readonly toPhaseId: string;
  readonly conditionKind: 'action_completed' | 'commitment_created' | 'consensus_shifted'
    | 'blocker_resolved' | 'time_elapsed' | 'contract_signed' | 'opportunity_closed';
  readonly description: string;
  readonly requiredEvidenceKinds: readonly string[];
}

// ---------------------------------------------------------------------------
// BusinessFlowActorRole: actor role in the flow
// ---------------------------------------------------------------------------

export type BusinessFlowActorRole =
  | 'broker'
  | 'owner'
  | 'customer'
  | 'manager'
  | 'buyer_broker'
  | 'system';

// ---------------------------------------------------------------------------
// BusinessFlowTemplate: template for a business flow
// ---------------------------------------------------------------------------

export interface BusinessFlowTemplate {
  readonly templateId: string;
  readonly kind: BusinessFlowTemplateKind;
  readonly label: string;
  readonly description: string;
  readonly phases: readonly BusinessFlowPhase[];
  readonly gates: readonly BusinessFlowPhaseGate[];
  readonly actorRoles: readonly BusinessFlowActorRole[];
  readonly typicalDurationDays: number;
}

// ---------------------------------------------------------------------------
// ProcessRunStatus: lifecycle state of a process run
// ---------------------------------------------------------------------------

export type ProcessRunStatus =
  | 'active'                // running
  | 'resolved'              // achieved goal
  | 'blocked'               // blocked by external factor
  | 'collapsed'             // failed / abandoned
  | 'converted_to_contract' // became a ContractFact
  | 'expired'               // ran out of time
  | 'superseded';           // replaced by another process

// ---------------------------------------------------------------------------
// ProcessRunPhaseSnapshot: snapshot of a phase in a process run
// ---------------------------------------------------------------------------

export interface ProcessRunPhaseSnapshot {
  readonly phaseId: string;
  readonly enteredDay: number;
  readonly exitedDay?: number;
  readonly durationDays: number;
  readonly actionReceiptIds: readonly string[];
  readonly commitmentSettlementIds: readonly string[];
  readonly blockers: readonly ProcessRunBlocker[];
}

// ---------------------------------------------------------------------------
// ProcessRunEvidenceRef: compressed evidence reference
// ---------------------------------------------------------------------------

export interface ProcessRunEvidenceRef {
  readonly refType: 'action_receipt' | 'commitment_settlement' | 'consensus_receipt'
    | 'contract_fact' | 'pressure_receipt' | 'evaluation_snapshot'
    | 'interaction_scene' | 'event' | 'belief' | 'opportunity';
  readonly refId: string;
  readonly summary: string;
  readonly relevance: number; // 0..1
}

// ---------------------------------------------------------------------------
// ProcessRunBlocker: blocker within a process run
// ---------------------------------------------------------------------------

export interface ProcessRunBlocker {
  readonly blockerId: string;
  readonly kind: string;
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly emergedDay: number;
  readonly resolvedDay?: number;
  readonly resolved: boolean;
  readonly relatedPhaseId?: string;
}

// ---------------------------------------------------------------------------
// ProcessRunNextStepDraft: draft next step recommendation
// ---------------------------------------------------------------------------

export interface ProcessRunNextStepDraft {
  readonly draftId: string;
  readonly actionKind: string;
  readonly description: string;
  readonly priority: 'urgent' | 'high' | 'medium' | 'low' | 'deferred';
  readonly relatedPhaseId?: string;
  readonly relatedBlockerId?: string;
  readonly rationale: string;
}

// ---------------------------------------------------------------------------
// ProcessRunOutcome: outcome of a process run
// ---------------------------------------------------------------------------

export interface ProcessRunOutcome {
  readonly outcomeType: 'resolved' | 'blocked' | 'collapsed'
    | 'converted_to_contract' | 'expired' | 'superseded';
  readonly description: string;
  readonly relatedConsensusId?: string;
  readonly relatedContractFactId?: string;
  readonly relatedClosureSetId?: string;
}

// ---------------------------------------------------------------------------
// ProcessRun: a running or completed multi-day business process
// ---------------------------------------------------------------------------

export interface ProcessRun {
  readonly runId: string;
  readonly templateId: string;
  readonly templateKind: BusinessFlowTemplateKind;
  readonly caseId: string;
  readonly actorIds: readonly string[];
  readonly status: ProcessRunStatus;
  readonly currentPhaseId: string;
  readonly startedDay: number;
  readonly endedDay?: number;
  readonly durationDays: number;
  readonly phaseSnapshots: readonly ProcessRunPhaseSnapshot[];
  readonly evidenceRefs: readonly ProcessRunEvidenceRef[];
  readonly blockers: readonly ProcessRunBlocker[];
  readonly nextStepDrafts: readonly ProcessRunNextStepDraft[];
  readonly outcome?: ProcessRunOutcome;
}

// ---------------------------------------------------------------------------
// ProcessRunSummary: summary of process runs for a case
// ---------------------------------------------------------------------------

export interface ProcessRunSummary {
  readonly caseId: string;
  readonly runs: readonly ProcessRun[];
  readonly activeCount: number;
  readonly resolvedCount: number;
  readonly blockedCount: number;
  readonly collapsedCount: number;
  readonly convertedCount: number;
}

// ---------------------------------------------------------------------------
// ProcessRunAggregatedSummary: summary across all cases
// ---------------------------------------------------------------------------

export interface ProcessRunAggregatedSummary {
  readonly day: number;
  readonly totalRuns: number;
  readonly activeRuns: number;
  readonly resolvedRuns: number;
  readonly blockedRuns: number;
  readonly collapsedRuns: number;
  readonly convertedRuns: number;
  readonly expiredRuns: number;
  readonly supersededRuns: number;
  readonly totalBlockers: number;
  readonly unresolvedBlockers: number;
  readonly totalNextStepDrafts: number;
  readonly caseSummaries: readonly ProcessRunSummary[];
}

// ---------------------------------------------------------------------------
// Input shapes for builders
// ---------------------------------------------------------------------------

export interface ProcessRunPhaseInput {
  readonly phaseId: string;
  readonly enteredDay: number;
  readonly exitedDay?: number;
  readonly actionReceiptIds?: readonly string[];
  readonly commitmentSettlementIds?: readonly string[];
  readonly blockers?: readonly ProcessRunBlocker[];
}

export interface ProcessRunInput {
  readonly templateId: string;
  readonly templateKind: BusinessFlowTemplateKind;
  readonly caseId: string;
  readonly actorIds?: readonly string[];
  readonly status?: ProcessRunStatus;
  readonly currentPhaseId: string;
  readonly startedDay: number;
  readonly endedDay?: number;
  readonly phaseSnapshots?: readonly ProcessRunPhaseInput[];
  readonly evidenceRefs?: readonly ProcessRunEvidenceRef[];
  readonly blockers?: readonly ProcessRunBlocker[];
  readonly nextStepDrafts?: readonly ProcessRunNextStepDraft[];
  readonly outcome?: ProcessRunOutcome;
}

export interface ProcessRunSummaryInput {
  readonly caseId: string;
  readonly runs: readonly ProcessRun[];
}

// ---------------------------------------------------------------------------
// Template catalog
// ---------------------------------------------------------------------------

export function buildBusinessFlowTemplateCatalog(): readonly BusinessFlowTemplate[] {
  return Object.freeze([
    Object.freeze({
      templateId: 'tpl-price-adjustment',
      kind: 'price_adjustment_communication',
      label: '调价沟通',
      description: '从业主报价偏高到接受调价的沟通过程',
      phases: Object.freeze([
        Object.freeze({ phaseId: 'price-gap-identified', label: '价格差距识别', description: '发现报价与市场价差距', order: 0, isTerminal: false, requiredEvidenceKinds: Object.freeze(['evaluation_snapshot']) }),
        Object.freeze({ phaseId: 'market-evidence-presented', label: '市场依据呈现', description: '向业主展示市场数据', order: 1, isTerminal: false, requiredEvidenceKinds: Object.freeze(['action_receipt', 'evaluation_snapshot']) }),
        Object.freeze({ phaseId: 'owner-considering', label: '业主考虑中', description: '业主在考虑调价建议', order: 2, isTerminal: false, requiredEvidenceKinds: Object.freeze(['commitment_settlement']) }),
        Object.freeze({ phaseId: 'price-adjusted', label: '价格已调整', description: '业主接受调价', order: 3, isTerminal: true, requiredEvidenceKinds: Object.freeze(['action_receipt', 'commitment_settlement']) }),
        Object.freeze({ phaseId: 'price-rejected', label: '调价被拒', description: '业主拒绝调价', order: 4, isTerminal: true, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
      ]),
      gates: Object.freeze([
        Object.freeze({ gateId: 'gate-price-gap-to-evidence', fromPhaseId: 'price-gap-identified', toPhaseId: 'market-evidence-presented', conditionKind: 'action_completed', description: '完成市场依据展示', requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ gateId: 'gate-evidence-to-considering', fromPhaseId: 'market-evidence-presented', toPhaseId: 'owner-considering', conditionKind: 'commitment_created', description: '业主进入考虑阶段', requiredEvidenceKinds: Object.freeze(['commitment_settlement']) }),
        Object.freeze({ gateId: 'gate-considering-to-adjusted', fromPhaseId: 'owner-considering', toPhaseId: 'price-adjusted', conditionKind: 'action_completed', description: '业主接受调价', requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ gateId: 'gate-considering-to-rejected', fromPhaseId: 'owner-considering', toPhaseId: 'price-rejected', conditionKind: 'action_completed', description: '业主拒绝调价', requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
      ]),
      actorRoles: Object.freeze(['broker', 'owner'] as const),
      typicalDurationDays: 7,
    }),
    Object.freeze({
      templateId: 'tpl-showing-to-offer',
      kind: 'showing_to_offer_conversion',
      label: '带看转意向',
      description: '从带看到客户下意向的过程',
      phases: Object.freeze([
        Object.freeze({ phaseId: 'showing-scheduled', label: '带看已安排', description: '已安排带看', order: 0, isTerminal: false, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ phaseId: 'showing-completed', label: '带看完成', description: '带看已完成', order: 1, isTerminal: false, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ phaseId: 'customer-evaluating', label: '客户评估中', description: '客户在考虑', order: 2, isTerminal: false, requiredEvidenceKinds: Object.freeze(['commitment_settlement']) }),
        Object.freeze({ phaseId: 'offer-submitted', label: '意向已提交', description: '客户提交意向', order: 3, isTerminal: true, requiredEvidenceKinds: Object.freeze(['action_receipt', 'consensus_receipt']) }),
        Object.freeze({ phaseId: 'customer-declined', label: '客户放弃', description: '客户放弃', order: 4, isTerminal: true, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
      ]),
      gates: Object.freeze([
        Object.freeze({ gateId: 'gate-scheduled-to-completed', fromPhaseId: 'showing-scheduled', toPhaseId: 'showing-completed', conditionKind: 'action_completed', description: '完成带看', requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ gateId: 'gate-completed-to-evaluating', fromPhaseId: 'showing-completed', toPhaseId: 'customer-evaluating', conditionKind: 'commitment_created', description: '客户进入评估', requiredEvidenceKinds: Object.freeze(['commitment_settlement']) }),
        Object.freeze({ gateId: 'gate-evaluating-to-offer', fromPhaseId: 'customer-evaluating', toPhaseId: 'offer-submitted', conditionKind: 'consensus_shifted', description: '客户提交意向', requiredEvidenceKinds: Object.freeze(['consensus_receipt']) }),
        Object.freeze({ gateId: 'gate-evaluating-to-declined', fromPhaseId: 'customer-evaluating', toPhaseId: 'customer-declined', conditionKind: 'action_completed', description: '客户放弃', requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
      ]),
      actorRoles: Object.freeze(['broker', 'customer'] as const),
      typicalDurationDays: 5,
    }),
    Object.freeze({
      templateId: 'tpl-open-day',
      kind: 'open_day_campaign',
      label: '开放日推进',
      description: '从策划开放日到收集客户意向的过程',
      phases: Object.freeze([
        Object.freeze({ phaseId: 'open-day-planned', label: '开放日已策划', description: '已安排开放日', order: 0, isTerminal: false, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ phaseId: 'open-day-executed', label: '开放日已执行', description: '开放日已完成', order: 1, isTerminal: false, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ phaseId: 'leads-collected', label: '线索已收集', description: '收集到客户线索', order: 2, isTerminal: false, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ phaseId: 'leads-converted', label: '线索已转化', description: '线索转化为意向', order: 3, isTerminal: true, requiredEvidenceKinds: Object.freeze(['consensus_receipt']) }),
        Object.freeze({ phaseId: 'open-day-failed', label: '开放日效果差', description: '未收集到有效线索', order: 4, isTerminal: true, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
      ]),
      gates: Object.freeze([
        Object.freeze({ gateId: 'gate-planned-to-executed', fromPhaseId: 'open-day-planned', toPhaseId: 'open-day-executed', conditionKind: 'action_completed', description: '完成开放日', requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ gateId: 'gate-executed-to-collected', fromPhaseId: 'open-day-executed', toPhaseId: 'leads-collected', conditionKind: 'action_completed', description: '收集线索', requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ gateId: 'gate-collected-to-converted', fromPhaseId: 'leads-collected', toPhaseId: 'leads-converted', conditionKind: 'consensus_shifted', description: '线索转化', requiredEvidenceKinds: Object.freeze(['consensus_receipt']) }),
        Object.freeze({ gateId: 'gate-collected-to-failed', fromPhaseId: 'leads-collected', toPhaseId: 'open-day-failed', conditionKind: 'time_elapsed', description: '未转化', requiredEvidenceKinds: Object.freeze([]) }),
      ]),
      actorRoles: Object.freeze(['broker', 'owner', 'customer'] as const),
      typicalDurationDays: 14,
    }),
    Object.freeze({
      templateId: 'tpl-sincerity-sale',
      kind: 'sincerity_sale_push',
      label: '诚意售推进',
      description: '从业主同意诚意售到成交的过程',
      phases: Object.freeze([
        Object.freeze({ phaseId: 'sincerity-agreed', label: '业主同意诚意售', description: '业主同意进入诚意售', order: 0, isTerminal: false, requiredEvidenceKinds: Object.freeze(['commitment_settlement']) }),
        Object.freeze({ phaseId: 'price-announced', label: '价格已公布', description: '诚意售价格已公布', order: 1, isTerminal: false, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ phaseId: 'customers-engaged', label: '客户已接触', description: '已接触目标客户', order: 2, isTerminal: false, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ phaseId: 'deal-closed', label: '成交', description: '诚意售成交', order: 3, isTerminal: true, requiredEvidenceKinds: Object.freeze(['consensus_receipt', 'contract_fact']) }),
        Object.freeze({ phaseId: 'sincerity-failed', label: '诚意售失败', description: '未达成成交', order: 4, isTerminal: true, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
      ]),
      gates: Object.freeze([
        Object.freeze({ gateId: 'gate-agreed-to-announced', fromPhaseId: 'sincerity-agreed', toPhaseId: 'price-announced', conditionKind: 'action_completed', description: '公布价格', requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ gateId: 'gate-announced-to-engaged', fromPhaseId: 'price-announced', toPhaseId: 'customers-engaged', conditionKind: 'action_completed', description: '接触客户', requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ gateId: 'gate-engaged-to-closed', fromPhaseId: 'customers-engaged', toPhaseId: 'deal-closed', conditionKind: 'contract_signed', description: '成交', requiredEvidenceKinds: Object.freeze(['consensus_receipt', 'contract_fact']) }),
        Object.freeze({ gateId: 'gate-engaged-to-failed', fromPhaseId: 'customers-engaged', toPhaseId: 'sincerity-failed', conditionKind: 'time_elapsed', description: '未成交', requiredEvidenceKinds: Object.freeze([]) }),
      ]),
      actorRoles: Object.freeze(['broker', 'owner', 'customer'] as const),
      typicalDurationDays: 10,
    }),
    Object.freeze({
      templateId: 'tpl-owner-waiting',
      kind: 'owner_waiting_to_commitment',
      label: '业主等待转承诺',
      description: '从业主犹豫到形成明确承诺的过程',
      phases: Object.freeze([
        Object.freeze({ phaseId: 'owner-hesitating', label: '业主犹豫中', description: '业主在犹豫', order: 0, isTerminal: false, requiredEvidenceKinds: Object.freeze(['belief']) }),
        Object.freeze({ phaseId: 'evidence-presented', label: '依据已展示', description: '已展示市场依据', order: 1, isTerminal: false, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ phaseId: 'commitment-formed', label: '承诺已形成', description: '业主形成明确承诺', order: 2, isTerminal: true, requiredEvidenceKinds: Object.freeze(['commitment_settlement']) }),
        Object.freeze({ phaseId: 'owner-withdrawn', label: '业主撤回', description: '业主撤回', order: 3, isTerminal: true, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
      ]),
      gates: Object.freeze([
        Object.freeze({ gateId: 'gate-hesitating-to-evidence', fromPhaseId: 'owner-hesitating', toPhaseId: 'evidence-presented', conditionKind: 'action_completed', description: '展示依据', requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ gateId: 'gate-evidence-to-commitment', fromPhaseId: 'evidence-presented', toPhaseId: 'commitment-formed', conditionKind: 'commitment_created', description: '形成承诺', requiredEvidenceKinds: Object.freeze(['commitment_settlement']) }),
        Object.freeze({ gateId: 'gate-evidence-to-withdrawn', fromPhaseId: 'evidence-presented', toPhaseId: 'owner-withdrawn', conditionKind: 'action_completed', description: '业主撤回', requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
      ]),
      actorRoles: Object.freeze(['broker', 'owner'] as const),
      typicalDurationDays: 14,
    }),
    Object.freeze({
      templateId: 'tpl-consensus-to-contract',
      kind: 'consensus_to_contract',
      label: '共识转成交',
      description: '从共识形成到签约成交的过程',
      phases: Object.freeze([
        Object.freeze({ phaseId: 'consensus-formed', label: '共识已形成', description: '价格/条件共识形成', order: 0, isTerminal: false, requiredEvidenceKinds: Object.freeze(['consensus_receipt']) }),
        Object.freeze({ phaseId: 'offer-submitted', label: '报价已提交', description: '正式报价已提交', order: 1, isTerminal: false, requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ phaseId: 'negotiation-active', label: '谈判进行中', description: '双方在谈判', order: 2, isTerminal: false, requiredEvidenceKinds: Object.freeze(['action_receipt', 'consensus_receipt']) }),
        Object.freeze({ phaseId: 'contract-signed', label: '签约成交', description: '签约成交', order: 3, isTerminal: true, requiredEvidenceKinds: Object.freeze(['contract_fact']) }),
        Object.freeze({ phaseId: 'consensus-collapsed', label: '共识破裂', description: '共识破裂', order: 4, isTerminal: true, requiredEvidenceKinds: Object.freeze(['consensus_receipt']) }),
      ]),
      gates: Object.freeze([
        Object.freeze({ gateId: 'gate-formed-to-submitted', fromPhaseId: 'consensus-formed', toPhaseId: 'offer-submitted', conditionKind: 'action_completed', description: '提交报价', requiredEvidenceKinds: Object.freeze(['action_receipt']) }),
        Object.freeze({ gateId: 'gate-submitted-to-negotiating', fromPhaseId: 'offer-submitted', toPhaseId: 'negotiation-active', conditionKind: 'consensus_shifted', description: '进入谈判', requiredEvidenceKinds: Object.freeze(['consensus_receipt']) }),
        Object.freeze({ gateId: 'gate-negotiating-to-signed', fromPhaseId: 'negotiation-active', toPhaseId: 'contract-signed', conditionKind: 'contract_signed', description: '签约', requiredEvidenceKinds: Object.freeze(['contract_fact']) }),
        Object.freeze({ gateId: 'gate-negotiating-to-collapsed', fromPhaseId: 'negotiation-active', toPhaseId: 'consensus-collapsed', conditionKind: 'consensus_shifted', description: '共识破裂', requiredEvidenceKinds: Object.freeze(['consensus_receipt']) }),
      ]),
      actorRoles: Object.freeze(['broker', 'owner', 'customer'] as const),
      typicalDurationDays: 7,
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Builders (pure, deterministic, frozen)
// ---------------------------------------------------------------------------

export function buildEmptyProcessRunSummary(day: number): ProcessRunAggregatedSummary {
  return Object.freeze({
    day,
    totalRuns: 0,
    activeRuns: 0,
    resolvedRuns: 0,
    blockedRuns: 0,
    collapsedRuns: 0,
    convertedRuns: 0,
    expiredRuns: 0,
    supersededRuns: 0,
    totalBlockers: 0,
    unresolvedBlockers: 0,
    totalNextStepDrafts: 0,
    caseSummaries: Object.freeze([]),
  });
}

export function buildProcessRunFromInput(input: ProcessRunInput): ProcessRun {
  const runId = `run:${input.templateKind}:${input.caseId}:${input.startedDay}`;
  const durationDays = input.endedDay
    ? input.endedDay - input.startedDay
    : 0;

  const phaseSnapshots: ProcessRunPhaseSnapshot[] = [];
  for (const phase of input.phaseSnapshots ?? []) {
    const blockers = phase.blockers ?? [];
    phaseSnapshots.push(Object.freeze({
      phaseId: phase.phaseId,
      enteredDay: phase.enteredDay,
      exitedDay: phase.exitedDay,
      durationDays: phase.exitedDay ? phase.exitedDay - phase.enteredDay : 0,
      actionReceiptIds: Object.freeze([...(phase.actionReceiptIds ?? [])]),
      commitmentSettlementIds: Object.freeze([...(phase.commitmentSettlementIds ?? [])]),
      blockers: Object.freeze([...blockers]),
    }));
  }

  return Object.freeze({
    runId,
    templateId: input.templateId,
    templateKind: input.templateKind,
    caseId: input.caseId,
    actorIds: Object.freeze([...(input.actorIds ?? [])]),
    status: input.status ?? 'active',
    currentPhaseId: input.currentPhaseId,
    startedDay: input.startedDay,
    endedDay: input.endedDay,
    durationDays,
    phaseSnapshots: Object.freeze(phaseSnapshots),
    evidenceRefs: Object.freeze([...(input.evidenceRefs ?? [])]),
    blockers: Object.freeze([...(input.blockers ?? [])]),
    nextStepDrafts: Object.freeze([...(input.nextStepDrafts ?? [])]),
    outcome: input.outcome,
  });
}

export function summarizeProcessRunsForCase(
  input: ProcessRunSummaryInput,
): ProcessRunSummary {
  let activeCount = 0;
  let resolvedCount = 0;
  let blockedCount = 0;
  let collapsedCount = 0;
  let convertedCount = 0;

  for (const run of input.runs) {
    switch (run.status) {
      case 'active': activeCount++; break;
      case 'resolved': resolvedCount++; break;
      case 'blocked': blockedCount++; break;
      case 'collapsed': collapsedCount++; break;
      case 'converted_to_contract': convertedCount++; break;
    }
  }

  return Object.freeze({
    caseId: input.caseId,
    runs: Object.freeze([...input.runs]),
    activeCount,
    resolvedCount,
    blockedCount,
    collapsedCount,
    convertedCount,
  });
}

export function summarizeProcessRunsAcrossCases(
  day: number,
  caseSummaries: readonly ProcessRunSummary[],
): ProcessRunAggregatedSummary {
  let totalRuns = 0;
  let activeRuns = 0;
  let resolvedRuns = 0;
  let blockedRuns = 0;
  let collapsedRuns = 0;
  let convertedRuns = 0;
  let expiredRuns = 0;
  let supersededRuns = 0;
  let totalBlockers = 0;
  let unresolvedBlockers = 0;
  let totalNextStepDrafts = 0;

  for (const cs of caseSummaries) {
    totalRuns += cs.runs.length;
    activeRuns += cs.activeCount;
    resolvedRuns += cs.resolvedCount;
    blockedRuns += cs.blockedCount;
    collapsedRuns += cs.collapsedCount;
    convertedRuns += cs.convertedCount;

    for (const run of cs.runs) {
      if (run.status === 'expired') expiredRuns++;
      if (run.status === 'superseded') supersededRuns++;
      totalBlockers += run.blockers.length;
      unresolvedBlockers += run.blockers.filter((b) => !b.resolved).length;
      totalNextStepDrafts += run.nextStepDrafts.length;
    }
  }

  return Object.freeze({
    day,
    totalRuns,
    activeRuns,
    resolvedRuns,
    blockedRuns,
    collapsedRuns,
    convertedRuns,
    expiredRuns,
    supersededRuns,
    totalBlockers,
    unresolvedBlockers,
    totalNextStepDrafts,
    caseSummaries: Object.freeze([...caseSummaries]),
  });
}
