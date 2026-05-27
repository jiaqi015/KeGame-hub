/**
 * ActionReceiptWiring — bridges domain ActionReceiptSnapshot → runtime ActionReceipt.
 *
 * This is the adapter that connects the domain layer (which produces raw
 * ActionReceiptSnapshot) to the runtime layer (which builds ActionReceipts
 * with source records, causal events, and traceability).
 *
 * Architecture position:
 *   domain/engine/executeAction → ActionReceiptSnapshot (raw delta)
 *     → actionReceiptWiring.buildReceiptFromSnapshot (adapter)
 *       → ActionReceipt (full evidence chain)
 *         → actionReceiptWiring.applyReceiptToGameState (feedback)
 *
 * Hard constraints:
 *   - Does NOT directly modify case.trust/patience/status/opportunity fields
 *   - All world effects flow through source record → causal event
 *   - Deterministic: same snapshot + same seed → same receipt
 *   - Old saves with no bigWorldRuntime still work (safe normalize)
 *   - Receipt appends to worldCausalEvents, not to case fields
 *
 * Mother model alignment:
 *   - Section 13: Causal Transmission
 *     "source signal → actor receives → belief/pressure changes"
 *   - Section 8: Broker Service Essence
 *     raw information → interpretation → decision frame → receiver effect
 */

import type {
  ActionCommand,
  ActionReceipt,
  ActorKnowledgeSnapshot,
  NoDirectHiddenMutationProof,
  BeliefDomain,
  AvailableCommand,
} from '../actorKnowledgeTypes.js';

import type { ActionReceiptSnapshot } from '../../engine/actionReceiptSnapshot.js';
import { asWritableGameState } from '../../models.js';

import { buildActionCommand, buildActionReceipt } from './actionCommandReceipt.js';

import { ingestSourceRecords } from './sourceIngestionAdapter.js';
import type { SourceIngestionReceipt } from './sourceIngestionAdapter.js';

import type { WorldCausalEvent } from '../causalEvents.js';
import type { InformationSourceRecord } from '../informationSourceTypes.js';
import { buildPlayerActionSourceIds, buildBlockedPlayerActionSourceIds } from '../playerActionSourceIds.js';

// ════════════════════════════════════════════════════════════════════════════
// Deterministic ID generation
// ════════════════════════════════════════════════════════════════════════════

function deterministicId(prefix: string, parts: (string | number)[]): string {
  return `${prefix}-${parts.join('-')}`;
}

// ════════════════════════════════════════════════════════════════════════════
// Map action IDs to command types
// ════════════════════════════════════════════════════════════════════════════

/**
 * Map legacy action IDs to the new command types.
 * This ensures all 6 required action categories are supported.
 */
function mapActionIdToCommandType(
  actionId: string,
): ActionCommand['commandType'] {
  switch (actionId) {
    // 面访 (owner interview)
    case 'first-visit':
    case 'weekly-feedback':
    case 'deep-diagnosis':
      return 'owner_interview';
    // 带看 (showing)
    case 'showing':
      return 'showing';
    // 业主反馈 (owner feedback / pricing)
    case 'pricing-advice':
    case 'ask-psychological-price':
    case 'adjust-listing-price':
      return 'owner_interview';
    // 客户跟进 (customer followup)
    case 'xiaohongshu-boost':
    case 'broker-broadcast':
    case 'private-referral':
      return 'customer_followup';
    // 聚焦会提报 (focus meeting)
    case 'focus-meeting-submit':
      return 'focus_meeting_submit';
    // 推广推进 (promotion / open day)
    case 'open-day':
      return 'open_day';
    default:
      return 'customer_followup';
  }
}

/**
 * Map legacy action IDs to the action category for receipt building.
 */
function mapActionIdToCategory(
  actionId: string,
): AvailableCommand['category'] {
  switch (actionId) {
    case 'first-visit':
    case 'weekly-feedback':
    case 'deep-diagnosis':
      return 'relationship';
    case 'showing':
      return 'process';
    case 'xiaohongshu-boost':
    case 'broker-broadcast':
    case 'private-referral':
      return 'promotion';
    case 'focus-meeting-submit':
      return 'process';
    case 'open-day':
      return 'process';
    case 'pricing-advice':
    case 'ask-psychological-price':
    case 'adjust-listing-price':
      return 'pricing';
    case 'sincerity-sale':
    case 'invite-customer-negotiation':
      return 'process';
    default:
      return 'relationship';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// buildReceiptFromSnapshot — the core adapter
// ════════════════════════════════════════════════════════════════════════════

/**
 * Result of building a receipt from a snapshot.
 * Contains both the ActionReceipt (for actionReceiptHistory) and the
 * SourceIngestionReceipt (for worldCausalEvents).
 */
export interface ReceiptBuildResult {
  /** The full ActionReceipt with evidence chain. */
  readonly receipt: ActionReceipt;
  /** The source ingestion receipt containing causal events. */
  readonly sourceIngestionReceipt: SourceIngestionReceipt;
  /** Source records built from this receipt — for persisted source ledger. */
  readonly sourceRecords: readonly InformationSourceRecord[];
}

/**
 * Build an ActionReceipt from a domain ActionReceiptSnapshot.
 *
 * This is the key wiring function:
 *   1. Creates a synthetic ActorKnowledgeSnapshot from the snapshot
 *   2. Creates a synthetic RecommendedCommand from the snapshot
 *   3. Builds source records from the action
 *   4. Ingests source records into causal events
 *   5. Returns both the receipt AND the ingestion receipt (with causal events)
 *
 * The caller must:
 *   - Store the receipt in actionReceiptHistory
 *   - Append causal events to worldCausalEvents via the ingestion receipt
 *
 * @param snapshot - Domain-layer delta information from executeAction
 * @param seed - Deterministic seed for receipt generation
 * @returns ReceiptBuildResult with both receipt and source ingestion receipt
 */
export function buildReceiptFromSnapshot(
  snapshot: ActionReceiptSnapshot,
  seed: number,
): ReceiptBuildResult {
  const commandType = mapActionIdToCommandType(snapshot.actionId);
  const category = mapActionIdToCategory(snapshot.actionId);

  // Build a synthetic ActorKnowledgeSnapshot
  const knowledge: ActorKnowledgeSnapshot = {
    actorId: snapshot.executorId,
    actorRole: 'player_broker',
    day: snapshot.day,
    visibleSources: [],
    totalVisibleBeforeBound: 0,
    beliefs: [],
    beliefSummary: [],
    blindSpots: [],
    replayKey: deterministicId('aks', [snapshot.executorId, snapshot.day, seed]),
  };

  // Build a synthetic RecommendedCommand
  const actorRoles = ['player_broker'] as readonly ('player_broker' | 'rival_broker' | 'owner' | 'customer' | 'manager' | 'system')[];
  const recommended = {
    command: {
      commandId: snapshot.actionId,
      name: snapshot.actionId,
      category,
      targetDomains: getTargetDomains(commandType),
      pressureThreshold: 0,
      allowedRoles: actorRoles,
    },
    reasoning: snapshot.outcomeSummary,
    confidence: snapshot.outcome === 'success' ? 0.8 : 0.3,
    pressureSignalIds: [],
    beliefSourceIds: [],
    sourceRecordIds: [],
  };

  // Delegate to buildActionReceipt
  const command = buildActionCommand(recommended, knowledge, snapshot.day, seed);
  const receipt = buildActionReceipt(command, seed);

  // Build source ingestion receipt separately (to get causal events)
  // The source records are built inside buildActionReceipt via executeAction.
  // We need to re-run ingestion to get the SourceIngestionReceipt with causal events.
  // This is deterministic: same command + same seed → same source records.
  const domainSourceRecords = snapshot.outcome === 'success'
    ? extractSourceRecordsFromCommand(command, seed)
    : [];

  // R45: Enrich owner_interview records with price signals and correct identity refs
  // R46: Fix ownerId/caseId mismatch — command.targetRefs[0].id is a source record ID,
  // not an owner/case ID. Use snapshot's ownerName and caseId for canonical builder matching.
  const enrichedDomainRecords = domainSourceRecords.map(record => {
    if (record.sourceKind === 'owner_interview' && snapshot.outcome === 'success') {
      const existingPayload = record.payload as import('../informationSourceTypes.js').OwnerInterviewPayload;
      return {
        ...record,
        payload: {
          ...existingPayload,
          ownerId: snapshot.ownerName || `owner:${snapshot.caseId}`,
          caseId: snapshot.caseId,
          concessionPrice: snapshot.ownerConcessionPrice,
          priceMentioned: snapshot.ownerPriceMentioned ?? existingPayload.priceMentioned,
        },
      } as typeof record;
    }
    return record;
  });

  const actionReceiptRecord = snapshot.outcome === 'success'
    ? buildSuccessfulPlayerActionSourceRecord(snapshot, command, seed)
    : buildBlockedPlayerActionSourceRecord(snapshot, command, seed);
  const sourceRecords = [...actionReceiptRecord, ...enrichedDomainRecords];
  const sourceIngestionReceipt = ingestSourceRecords(sourceRecords, snapshot.day, seed);

  return {
    receipt,
    sourceIngestionReceipt,
    sourceRecords,
  };
}

/**
 * Extract source records from a command using the same executors as buildActionReceipt.
 * This is deterministic: same command + same seed → same source records.
 */
function extractSourceRecordsFromCommand(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  switch (command.commandType) {
    case 'owner_interview':
      return buildOwnerInterviewSourceRecord(command, seed);
    case 'defend_listing':
      return buildDefendListingSourceRecord(command, seed);
    case 'customer_followup':
      return buildCustomerFollowupSourceRecord(command, seed);
    case 'showing':
      return buildShowingSourceRecord(command, seed);
    case 'focus_meeting_submit':
      return buildFocusMeetingSubmitSourceRecord(command, seed);
    case 'open_day':
      return buildOpenDaySourceRecord(command, seed);
    default:
      return [];
  }
}

function buildSuccessfulPlayerActionSourceRecord(
  snapshot: ActionReceiptSnapshot,
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const ids = buildPlayerActionSourceIds(snapshot.day, snapshot.actionId, snapshot.caseId, seed);

  // Compute fieldDeltas from before/after values in snapshot
  const fieldDeltas: { field: string; from: string | number | boolean; to: string | number | boolean }[] = [];
  const trustDelta = Math.round((snapshot.afterTrust - snapshot.beforeTrust) * 10) / 10;
  if (trustDelta !== 0) fieldDeltas.push({ field: 'trust', from: snapshot.beforeTrust, to: snapshot.afterTrust });
  const patienceDelta = Math.round((snapshot.afterPatience - snapshot.beforePatience) * 10) / 10;
  if (patienceDelta !== 0) fieldDeltas.push({ field: 'patience', from: snapshot.beforePatience, to: snapshot.afterPatience });
  const urgencyDelta = Math.round((snapshot.afterUrgency - snapshot.beforeUrgency) * 10) / 10;
  if (urgencyDelta !== 0) fieldDeltas.push({ field: 'urgency', from: snapshot.beforeUrgency, to: snapshot.afterUrgency });
  const heatDelta = Math.round((snapshot.afterHeat - snapshot.beforeHeat) * 10) / 10;
  if (heatDelta !== 0) fieldDeltas.push({ field: 'heat', from: snapshot.beforeHeat, to: snapshot.afterHeat });
  const competitivenessDelta = Math.round((snapshot.afterCompetitiveness - snapshot.beforeCompetitiveness) * 10) / 10;
  if (competitivenessDelta !== 0) fieldDeltas.push({ field: 'competitiveness', from: snapshot.beforeCompetitiveness, to: snapshot.afterCompetitiveness });

  return [{
    sourceId: ids.sourceId,
    sourceKind: 'player_action_receipt',
    day: snapshot.day,
    phase: 'afternoon',
    entityRefs: [{ id: snapshot.caseId, kind: 'case' }],
    actorRefs: [{ id: command.actorId, role: command.actorRole }],
    visibility: { scope: 'player_only', baseDelayDays: 0 },
    confidence: 0.95,
    delayDays: 0,
    replayKey: ids.replayKey,
    origin: 'player_action',
    payload: {
      summary: snapshot.outcomeSummary,
      subtype: 'action_executed',
      actionId: snapshot.actionId,
      executorId: command.actorId,
      caseId: snapshot.caseId,
      costEnergy: snapshot.costEnergy,
      costPromotionBudget: snapshot.costPromotionBudget,
      fieldDeltas,
      outcome: 'success',
    },
  }];
}

function buildBlockedPlayerActionSourceRecord(
  snapshot: ActionReceiptSnapshot,
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const ids = buildBlockedPlayerActionSourceIds(snapshot.day, snapshot.actionId, snapshot.caseId, seed);
  return [{
    sourceId: ids.sourceId,
    sourceKind: 'player_action_receipt',
    day: snapshot.day,
    phase: 'afternoon',
    entityRefs: [{ id: snapshot.caseId, kind: 'case' }],
    actorRefs: [{ id: command.actorId, role: command.actorRole }],
    visibility: { scope: 'player_only', baseDelayDays: 0 },
    confidence: 0.9,
    delayDays: 0,
    replayKey: ids.replayKey,
    origin: 'player_action',
    payload: {
      summary: snapshot.outcomeSummary,
      subtype: 'action_blocked',
      actionId: snapshot.actionId,
      executorId: command.actorId,
      caseId: snapshot.caseId,
      costEnergy: snapshot.costEnergy,
      costPromotionBudget: snapshot.costPromotionBudget,
      fieldDeltas: [],
      outcome: 'blocked',
    },
  }];
}

function getTargetDomains(
  commandType: ActionCommand['commandType'],
): readonly BeliefDomain[] {
  switch (commandType) {
    case 'owner_interview':
      return ['broker_trust', 'price_anchor', 'owner_readiness'];
    case 'showing':
      return ['customer_seriousness', 'deal_closeability', 'service_path'];
    case 'focus_meeting_submit':
      return ['market_heat', 'broker_trust'];
    case 'open_day':
      return ['market_heat', 'customer_seriousness', 'deal_closeability'];
    case 'defend_listing':
      return ['rival_threat', 'price_anchor', 'market_heat'];
    case 'customer_followup':
      return ['customer_seriousness', 'deal_closeability', 'service_path'];
    default:
      return [];
  }
}

// ════════════════════════════════════════════════════════════════════════════
// applyReceiptToGameState — feedback loop
// ════════════════════════════════════════════════════════════════════════════

/**
 * Apply an ActionReceipt's effects to GameState.
 *
 * This function:
 *   1. Records the receipt in actionReceiptHistory
 *   2. The actual causal events are appended to worldCausalEvents by the caller
 *      (via sourceIngestionReceipt.causalEvents)
 *   3. Does NOT directly modify case.trust/patience/status
 *      (those changes flow through the source→causal→projection pipeline)
 *
 * @param state - GameState to update (mutates in place)
 * @param receipt - ActionReceipt with evidence chain
 */
export function applyReceiptToGameState(
  state: { worldCausalEvents?: readonly WorldCausalEvent[]; actionReceiptHistory?: readonly ActionReceipt[] },
  receipt: ActionReceipt,
): void {
  // 1. Record the receipt in actionReceiptHistory
  const prevHistory = Array.isArray(state.actionReceiptHistory)
    ? state.actionReceiptHistory
    : [];
  // Use asWritableGameState if the state is a full GameState; otherwise write directly
  // (the parameter type is a subset for testability)
  const writable = 'cases' in state ? asWritableGameState(state as any) : state as any;
  writable.actionReceiptHistory = [...prevHistory, receipt];
}

// ════════════════════════════════════════════════════════════════════════════
// buildCausalEventsFromReceipt — extract causal events from receipt chain
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build a synthetic ActorKnowledgeSnapshot from minimal context.
 * Used when the full knowledge chain is not available (e.g., old saves).
 */
export function buildMinimalKnowledgeSnapshot(
  actorId: string,
  day: number,
  seed: number,
): ActorKnowledgeSnapshot {
  return {
    actorId,
    actorRole: 'player_broker',
    day,
    visibleSources: [],
    totalVisibleBeforeBound: 0,
    beliefs: [],
    beliefSummary: [],
    blindSpots: [],
    replayKey: deterministicId('aks-min', [actorId, day, seed]),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Source record builders — duplicate of actionCommandReceipt executors
// These produce the same source records as the executors, ensuring
// deterministic equivalence when building from snapshot.
// ════════════════════════════════════════════════════════════════════════════

function buildOwnerInterviewSourceRecord(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const recordId = deterministicId('isr', ['owner_interview', command.actorId, command.day, seed]);
  return [{
    sourceId: recordId,
    sourceKind: 'owner_interview',
    day: command.day,
    phase: 'afternoon',
    entityRefs: command.targetRefs.slice(0, 3),
    actorRefs: [{ id: command.actorId, role: command.actorRole }],
    visibility: { scope: 'player_only', baseDelayDays: 0 },
    confidence: 0.85,
    delayDays: 0,
    replayKey: deterministicId('isr-rk', ['owner_interview', command.actorId, command.day, seed]),
    origin: 'player_action',
    payload: {
      summary: `面访业主，沟通价格预期。业主表态${command.day % 2 === 0 ? '可以谈价格' : '坚持当前报价'}。`,
      subtype: 'price_discussed',
      ownerId: command.targetRefs[0]?.id ?? 'unknown',
      caseId: command.targetRefs[0]?.id ?? 'unknown',
      brokerId: command.actorId,
      tone: command.day % 2 === 0 ? 'neutral' : 'positive',
      ownerStatement: command.day % 2 === 0
        ? '价格可以商量，但不想降太多'
        : '目前报价是合理的，市场会回暖',
      interactionMode: 'meeting',
    },
  }];
}

function buildDefendListingSourceRecord(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const recordId = deterministicId('isr', ['player_action_receipt', command.actorId, command.day, seed]);
  return [{
    sourceId: recordId,
    sourceKind: 'player_action_receipt',
    day: command.day,
    phase: 'afternoon',
    entityRefs: command.targetRefs.slice(0, 3),
    actorRefs: [{ id: command.actorId, role: command.actorRole }],
    visibility: { scope: 'player_only', baseDelayDays: 0 },
    confidence: 0.9,
    delayDays: 0,
    replayKey: deterministicId('isr-rk', ['player_action_receipt', command.actorId, command.day, seed]),
    origin: 'player_action',
    payload: {
      summary: `维护房源竞争力，准备价格证据应对竞品调价。`,
      subtype: 'action_executed',
      actionId: 'cmd-defend-listing',
      executorId: command.actorId,
      caseId: command.targetRefs[0]?.id ?? 'unknown',
      costEnergy: 15,
      costPromotionBudget: 0,
      fieldDeltas: [{ field: 'competitiveness', from: 0, to: 5 }],
      outcome: 'success',
    },
  }];
}

function buildCustomerFollowupSourceRecord(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const recordId = deterministicId('isr', ['customer_interaction', command.actorId, command.day, seed]);
  return [{
    sourceId: recordId,
    sourceKind: 'customer_interaction',
    day: command.day,
    phase: 'morning',
    entityRefs: command.targetRefs.slice(0, 3),
    actorRefs: [{ id: command.actorId, role: command.actorRole }],
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
    confidence: 0.8,
    delayDays: 0,
    replayKey: deterministicId('isr-rk', ['customer_interaction', command.actorId, command.day, seed]),
    origin: 'player_action',
    payload: {
      summary: `跟进客户，安排看房比较。客户表达了对同板块房源的兴趣。`,
      subtype: 'comparison_made',
      customerId: command.targetRefs[0]?.id ?? 'unknown',
      caseId: command.targetRefs[1]?.id ?? 'unknown',
      listingId: command.targetRefs[2]?.id ?? 'unknown',
      observationMode: 'direct',
    },
  }];
}

function buildShowingSourceRecord(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const recordId = deterministicId('isr', ['customer_interaction', command.actorId, command.day, seed]);
  return [{
    sourceId: recordId,
    sourceKind: 'customer_interaction',
    day: command.day,
    phase: 'afternoon',
    entityRefs: command.targetRefs.slice(0, 3),
    actorRefs: [{ id: command.actorId, role: command.actorRole }],
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
    confidence: 0.85,
    delayDays: 0,
    replayKey: deterministicId('isr-rk', ['customer_interaction_showing', command.actorId, command.day, seed]),
    origin: 'player_action',
    payload: {
      summary: `安排带看，客户实地看房后表达了进一步了解的意向。`,
      subtype: 'viewing_completed',
      customerId: command.targetRefs[0]?.id ?? 'unknown',
      caseId: command.targetRefs[1]?.id ?? 'unknown',
      listingId: command.targetRefs[2]?.id ?? 'unknown',
      observationMode: 'direct',
    },
  }];
}

function buildFocusMeetingSubmitSourceRecord(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const recordId = deterministicId('isr', ['manager_message', command.actorId, command.day, seed]);
  return [{
    sourceId: recordId,
    sourceKind: 'manager_message',
    day: command.day,
    phase: 'morning',
    entityRefs: command.targetRefs.slice(0, 3),
    actorRefs: [{ id: command.actorId, role: command.actorRole }],
    visibility: { scope: 'player_only', baseDelayDays: 0 },
    confidence: 0.9,
    delayDays: 0,
    replayKey: deterministicId('isr-rk', ['manager_message_focus', command.actorId, command.day, seed]),
    origin: 'player_action',
    payload: {
      summary: `提报周四聚焦会，争取重点资源支持。`,
      subtype: 'focus_case_selected',
      managerId: 'system',
      targetBrokerId: command.actorId,
      caseIds: command.targetRefs.map((ref) => ref.id).slice(0, 3),
      priority: 75,
      instruction: '周四聚焦会提报',
    },
  }];
}

function buildOpenDaySourceRecord(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const recordId = deterministicId('isr', ['process_receipt', command.actorId, command.day, seed]);
  return [{
    sourceId: recordId,
    sourceKind: 'process_receipt',
    day: command.day,
    phase: 'morning',
    entityRefs: command.targetRefs.slice(0, 3),
    actorRefs: [{ id: command.actorId, role: command.actorRole }],
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
    confidence: 0.85,
    delayDays: 0,
    replayKey: deterministicId('isr-rk', ['process_receipt_open_day', command.actorId, command.day, seed]),
    origin: 'player_action',
    payload: {
      summary: `组织开放日活动，集中拉高市场关注度。`,
      subtype: 'open_day_completed',
      processType: 'open_day',
      processId: deterministicId('proc', ['open-day', command.day, seed]),
      caseIds: command.targetRefs.map((ref) => ref.id).slice(0, 3),
      customerIds: [],
      brokerIds: [command.actorId],
      outcome: 'completed',
      metrics: {},
    },
  }];
}
