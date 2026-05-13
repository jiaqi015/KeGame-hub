/**
 * ActionCommandReceipt — bridges player action → source record → receipt → causal event.
 *
 * Architecture position:
 *   DecisionEvidenceEnvelope (what should I do?)
 *     → ActionCommand (I'm doing this)
 *       → actionExecutor (generates source records)
 *         → SourceIngestionAdapter (source → causal events)
 *           → ActionReceipt (proof of execution)
 *
 * This module implements the core of "because-big":
 *   ActorKnowledge → Belief → Pressure → AvailableCommand → ActionCommand
 *     → ActionReceipt → SourceRecord → CausalEvent → Runtime → Projection → Replay
 *
 * Hard constraints:
 *   - Does NOT directly modify case.trust/patience/status (no hidden mutation)
 *   - All world effects flow through source record → causal event pipeline
 *   - Deterministic: same command + same seed → same receipt
 *   - Bounded: max 5 targetRefs, max 5 beliefRefs, max 5 sourceRefs per command
 *   - Bounded: max 10 source records, max 20 causal events per receipt
 *   - No Date.now / Math.random / LLM provider
 *
 * Mother model alignment:
 *   - Section 8: Broker Service Essence
 *     raw information → interpretation → decision frame → receiver effect
 *   - Section 13: Causal Transmission
 *     source signal → actor receives → belief/pressure changes → action
 *   - Section 9: POV And Interaction Design
 *     ActionCommand is intent, not guaranteed outcome
 *
 * Three action vertical slices:
 *   1. Owner Interview → owner_interview source record → trust/price belief change
 *   2. Defend Listing → rival_action source record → price_anchor/rival_threat belief change
 *   3. Customer Followup → customer_interaction source record → customer_seriousness belief change
 */

import type {
  ActorKnowledgeSnapshot,
  ActionCommand,
  ActionReceipt,
  ActionOutcome,
  NoDirectHiddenMutationProof,
  AvailableCommand,
  RecommendedCommand,
  BeliefDomain,
} from '../actorKnowledgeTypes.js';

import type { ActorRole } from '../informationSourceTypes.js';

import type { EntityRef } from '../informationSourceTypes.js';
import type { InformationSourceRecord } from '../informationSourceTypes.js';
import type { WorldCausalEvent } from '../causalEvents.js';

import {
  ingestSourceRecords,
} from './sourceIngestionAdapter.js';

import type {
  BigWorldDailyEvent,
} from './types.js';

import type {
  SourceIngestionReceipt,
} from './sourceIngestionAdapter.js';

// ════════════════════════════════════════════════════════════════════════════
// Deterministic ID generation (no Date.now / Math.random)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Deterministic ID: prefix-seed-part1-part2-...
 * Same inputs always produce the same ID.
 */
function deterministicId(prefix: string, parts: (string | number)[]): string {
  return `${prefix}-${parts.join('-')}`;
}

// ════════════════════════════════════════════════════════════════════════════
// buildActionCommand — from recommendation to executable command
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build an ActionCommand from a recommended command and actor knowledge.
 *
 * The command captures intent only — it does NOT execute the action.
 * Execution happens in buildActionReceipt.
 *
 * @param recommended - the recommended command from the decision pipeline
 * @param knowledge - the actor's current knowledge snapshot
 * @param day - simulation day
 * @param seed - deterministic seed for ID generation
 * @returns ActionCommand (intent only, not executed)
 */
export function buildActionCommand(
  recommended: RecommendedCommand,
  knowledge: ActorKnowledgeSnapshot,
  day: number,
  seed: number,
): ActionCommand {
  // Map command catalog type to action type
  const commandType = mapCatalogToActionType(recommended.command.commandId);

  // Build target refs from the recommended command's evidence chain
  const targetRefs: EntityRef[] = recommended.sourceRecordIds.slice(0, 5).map((id) => ({
    id,
    kind: 'case' as const,
  }));

  // Extract belief refs and source refs from the evidence chain
  const inputBeliefRefs = recommended.beliefSourceIds.slice(0, 5);
  const inputSourceRefs = recommended.sourceRecordIds.slice(0, 5);

  const commandId = deterministicId('ac', [commandType, knowledge.actorId, day, seed]);
  const replayKey = deterministicId('acr', [commandType, knowledge.actorId, day, seed]);

  return {
    commandId,
    actorId: knowledge.actorId,
    actorRole: knowledge.actorRole,
    day,
    commandType,
    targetRefs,
    inputBeliefRefs,
    inputSourceRefs,
    expectedEffect: buildExpectedEffect(commandType, recommended),
    replayKey,
  };
}

function mapCatalogToActionType(
  commandId: string,
): ActionCommand['commandType'] {
  switch (commandId) {
    // Legacy action IDs → owner_interview
    case 'first-visit':
    case 'weekly-feedback':
    case 'deep-diagnosis':
      return 'owner_interview';
    // Legacy action IDs → customer_followup
    case 'showing':
      return 'showing';
    case 'xiaohongshu-boost':
    case 'broker-broadcast':
    case 'private-referral':
      return 'customer_followup';
    case 'focus-meeting-submit':
      return 'focus_meeting_submit';
    case 'open-day':
      return 'open_day';
    case 'pricing-advice':
    case 'ask-psychological-price':
    case 'adjust-listing-price':
      return 'owner_interview';
    // New catalog IDs
    case 'cmd-owner-visit':
      return 'owner_interview';
    case 'cmd-defend-listing':
    case 'cmd-price-adjustment':
      return 'defend_listing';
    case 'cmd-customer-acquisition':
      return 'customer_followup';
    case 'cmd-showing':
      return 'showing';
    case 'cmd-focus-meeting-submit':
      return 'focus_meeting_submit';
    case 'cmd-open-day':
      return 'open_day';
    default:
      return 'customer_followup';
  }
}

function buildExpectedEffect(
  commandType: ActionCommand['commandType'],
  recommended: RecommendedCommand,
): string {
  switch (commandType) {
    case 'owner_interview':
      return `面访业主，沟通价格预期和出售意愿。预期影响业主信任度和价格锚点。`;
    case 'defend_listing':
      return `维护房源竞争力，应对竞品调价压力。预期影响价格定位和竞品威胁感知。`;
    case 'customer_followup':
      return `跟进潜在客户，提升成交接近度。预期影响客户需求判断和信任关系。`;
    case 'showing':
      return `安排带看，把客户推进到实地看房阶段。预期影响客户意向度和成交信心。`;
    case 'focus_meeting_submit':
      return `提报周四聚焦会，争取重点资源支持。预期影响房源热度和团队关注。`;
    case 'open_day':
      return `组织开放日，集中拉高关注度和看房量。预期影响市场热度和客户质量。`;
    default:
      return recommended.reasoning;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ActionExecutors — generate source records from actions
// ════════════════════════════════════════════════════════════════════════════

/**
 * Generate source records for an owner interview action.
 *
 * Source record: owner_interview with price_discussed subtype.
 * This is the raw information the broker collects from the owner.
 */
function executeOwnerInterview(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const recordId = deterministicId('isr', ['owner_interview', command.actorId, command.day, seed]);
  const record: InformationSourceRecord = {
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
  };
  return [record];
}

/**
 * Generate source records for a defend-listing action.
 *
 * Source record: player_action_receipt with defense evidence.
 * This is the raw information about the player's competitive response.
 */
function executeDefendListing(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const recordId = deterministicId('isr', ['player_action_receipt', command.actorId, command.day, seed]);
  const record: InformationSourceRecord = {
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
      fieldDeltas: [
        { field: 'competitiveness', from: 0, to: 5 },
      ],
      outcome: 'success',
    },
  };
  return [record];
}

/**
 * Generate source records for a customer followup action.
 *
 * Source record: customer_interaction with comparison_made subtype.
 * This is the raw information about customer engagement.
 */
function executeCustomerFollowup(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const recordId = deterministicId('isr', ['customer_interaction', command.actorId, command.day, seed]);
  const record: InformationSourceRecord = {
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
  };
  return [record];
}

/**
 * Generate source records for a showing action.
 *
 * Source record: customer_interaction with viewing_completed subtype.
 * Records the customer's viewing experience and interest level.
 */
function executeShowing(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const recordId = deterministicId('isr', ['customer_interaction', command.actorId, command.day, seed]);
  const record: InformationSourceRecord = {
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
  };
  return [record];
}

/**
 * Generate source records for a focus meeting submit action.
 *
 * Source record: manager_message with focus_case_selected subtype.
 * Records the submission of a case for manager review.
 */
function executeFocusMeetingSubmit(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const recordId = deterministicId('isr', ['manager_message', command.actorId, command.day, seed]);
  const record: InformationSourceRecord = {
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
  };
  return [record];
}

/**
 * Generate source records for an open day action.
 *
 * Source record: process_receipt with open_day_completed subtype.
 * Records the open day event and its market impact.
 */
function executeOpenDay(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  const recordId = deterministicId('isr', ['process_receipt', command.actorId, command.day, seed]);
  const record: InformationSourceRecord = {
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
  };
  return [record];
}

/**
 * Dispatch to the correct action executor based on command type.
 */
function executeAction(
  command: ActionCommand,
  seed: number,
): readonly InformationSourceRecord[] {
  switch (command.commandType) {
    case 'owner_interview':
      return executeOwnerInterview(command, seed);
    case 'defend_listing':
      return executeDefendListing(command, seed);
    case 'customer_followup':
      return executeCustomerFollowup(command, seed);
    case 'showing':
      return executeShowing(command, seed);
    case 'focus_meeting_submit':
      return executeFocusMeetingSubmit(command, seed);
    case 'open_day':
      return executeOpenDay(command, seed);
    default:
      return [];
  }
}

// ════════════════════════════════════════════════════════════════════════════
// buildActionReceipt — execute command and produce receipt
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build an ActionReceipt from an ActionCommand.
 *
 * This is the core of the action→receipt pipeline:
 *   1. Execute the action (generate source records)
 *   2. Ingest source records into causal events
 *   3. Build the receipt with all traceability
 *   4. Prove no direct hidden mutation
 *
 * The receipt does NOT modify GameState directly.
 * All world effects flow through source record → causal event.
 *
 * @param command - the action command to execute
 * @param seed - deterministic seed for receipt generation
 * @returns ActionReceipt with full evidence chain
 */
export function buildActionReceipt(
  command: ActionCommand,
  seed: number,
): ActionReceipt {
  // Step 1: Execute the action — generate source records
  const sourceRecords = executeAction(command, seed);

  // Step 2: Ingest source records into causal events
  const ingestionReceipt = ingestSourceRecords(sourceRecords, command.day, seed);

  // Step 3: Compute outcome
  const outcome = computeOutcome(command, ingestionReceipt);

  // Step 4: Compute affected actor knowledge refs
  const affectedRefs = computeAffectedActorKnowledgeRefs(command, outcome);

  // Step 5: Build no-direct-mutation proof
  const noDirectMutationProof = buildNoDirectMutationProof(command);

  // Step 6: Collect generated IDs
  const sourceRecordIds = sourceRecords.map((r) => r.sourceId);
  const causalEventIds = ingestionReceipt.causalEvents.map((e) => e.id);
  const dailyEventIds = ingestionReceipt.dailyEvents.map((e) => e.id);

  // Step 7: Deterministic replay key
  const replayKey = deterministicId('ar', [command.commandId, command.day, seed]);

  return {
    commandReplayKey: command.replayKey,
    commandId: command.commandId,
    actorId: command.actorId,
    actorRole: command.actorRole,
    day: command.day,
    commandType: command.commandType,
    outcome,
    generatedSourceRecordIds: sourceRecordIds,
    generatedCausalEventIds: causalEventIds,
    generatedDailyEventIds: dailyEventIds,
    affectedActorKnowledgeRefs: affectedRefs,
    noDirectHiddenMutationProof: noDirectMutationProof,
    replayKey,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// computeOutcome — derive action outcome from ingestion result
// ════════════════════════════════════════════════════════════════════════════

function computeOutcome(
  command: ActionCommand,
  ingestionReceipt: SourceIngestionReceipt,
): ActionOutcome {
  const success = ingestionReceipt.sourcesWithEffect > 0;
  const affectedDomains = getAffectedDomains(command.commandType);

  let code: ActionOutcome['code'];
  let message: string;
  let impactMagnitude: number;

  switch (command.commandType) {
    case 'owner_interview':
      code = 'interview_completed';
      message = `面访完成，产生了 ${ingestionReceipt.sourcesWithEffect} 条有效信息源。`;
      impactMagnitude = Math.min(100, ingestionReceipt.sourcesWithEffect * 25);
      break;
    case 'defend_listing':
      code = 'listing_defended';
      message = `竞争力维护完成，准备了价格证据。`;
      impactMagnitude = Math.min(100, ingestionReceipt.causalEvents.length * 15);
      break;
    case 'customer_followup':
      code = 'followup_sent';
      message = `客户跟进完成，产生了 ${ingestionReceipt.sourcesWithEffect} 条客户交互信息。`;
      impactMagnitude = Math.min(100, ingestionReceipt.sourcesWithEffect * 20);
      break;
    case 'showing':
      code = 'followup_sent';
      message = `带看完成，客户实地看房后产生了反馈信息。`;
      impactMagnitude = Math.min(100, ingestionReceipt.sourcesWithEffect * 22);
      break;
    case 'focus_meeting_submit':
      code = 'listing_defended';
      message = `聚焦会提报完成，提交了重点房源信息。`;
      impactMagnitude = Math.min(100, ingestionReceipt.sourcesWithEffect * 18);
      break;
    case 'open_day':
      code = 'interview_completed';
      message = `开放日完成，产生了市场关注度提升信息。`;
      impactMagnitude = Math.min(100, ingestionReceipt.causalEvents.length * 20);
      break;
    default:
      code = 'failed';
      message = '未知动作类型。';
      impactMagnitude = 0;
  }

  if (!success) {
    code = 'blocked';
    message = '动作执行未产生有效信息源。';
    impactMagnitude = 0;
  }

  return {
    success,
    code,
    message,
    impactMagnitude,
    affectedDomains,
  };
}

function getAffectedDomains(
  commandType: ActionCommand['commandType'],
): readonly BeliefDomain[] {
  switch (commandType) {
    case 'owner_interview':
      return ['broker_trust', 'price_anchor', 'owner_readiness'];
    case 'defend_listing':
      return ['rival_threat', 'price_anchor', 'market_heat'];
    case 'customer_followup':
      return ['customer_seriousness', 'deal_closeability', 'service_path'];
    case 'showing':
      return ['customer_seriousness', 'deal_closeability', 'service_path'];
    case 'focus_meeting_submit':
      return ['market_heat', 'broker_trust'];
    case 'open_day':
      return ['market_heat', 'customer_seriousness', 'deal_closeability'];
    default:
      return [];
  }
}

// ════════════════════════════════════════════════════════════════════════════
// computeAffectedActorKnowledgeRefs
// ════════════════════════════════════════════════════════════════════════════

function computeAffectedActorKnowledgeRefs(
  command: ActionCommand,
  outcome: ActionOutcome,
): ActionReceipt['affectedActorKnowledgeRefs'] {
  // Map affected domains to belief confidence changes
  // The exact values would depend on the actor's profile, but for the
  // receipt we record the structural effect, not the computed value.
  return outcome.affectedDomains.map((domain) => ({
    actorId: command.actorId,
    beliefDomain: domain,
    previousConfidence: 0.5, // placeholder — real computation uses actor profile
    newConfidence: outcome.success ? 0.7 : 0.3,
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// buildNoDirectMutationProof
// ════════════════════════════════════════════════════════════════════════════

function buildNoDirectMutationProof(
  command: ActionCommand,
): NoDirectHiddenMutationProof {
  // Record which fields were explicitly NOT touched
  // This is a static proof — the executor never touches these fields
  return {
    untouchedCaseFields: ['trust', 'patience', 'urgency', 'status', 'priceGapPct'],
    untouchedOpportunityFields: ['status', 'fit', 'intent', 'confidence', 'stageIndex'],
    untouchedCustomerFields: ['fatigue', 'churnRisk', 'status'],
    worldEffectPath: 'source_record_causal_event_projection',
  };
}
