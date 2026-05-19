import type { DailyTickResult, GameState, Opportunity } from '../domain/models.js';
import type { Settlement } from '../domain/actions/templates.js';
import type { TodayPlanDraft } from './todayPlan.js';
import type { WorldCausalEvent } from '../domain/world-model/causalEvents.js';
import type { ActionReceipt } from '../domain/world-model/actorKnowledgeTypes.js';
import { advanceDays, executeAction, spendResources, resolveActionDefinition } from '../domain/engine.js';
import { getActionAvailability, recordDomainEvent, refreshOpportunityLabel } from '../domain/engine.js';
import { enrichStateWithDailyTickSemantics } from '../runtime/simulation/dailyTickSemanticEnrichmentPipeline.js';
import { popPendingActionReceiptSnapshots } from '../domain/engine/actionResolvers.js';
import { buildActionReceiptFromSnapshot, appendActionReceiptFromSnapshot } from '../runtime/simulation/actionReceiptFromSnapshotAdapter.js';
import { buildReceiptFromSnapshot, applyReceiptToGameState } from '../domain/world-model/runtime/actionReceiptWiring.js';
import { buildMinimalKnowledgeSnapshot } from '../domain/world-model/runtime/actionReceiptWiring.js';
import { buildActionCommand, buildActionReceipt } from '../domain/world-model/runtime/actionCommandReceipt.js';
import { updateDerivedState } from '../domain/runtimeState.js';
import { applyActionStageRelation, getActionStageRelation } from '../domain/actionStageRelations.js';
import { queueDealClosingEvaluation } from '../domain/dealClosing.js';
import { getOpportunityPriority } from '../domain/utils.js';
import { setBrokerOwnerTrust } from '../domain/trustWriteHelper.js';
import {
  applyOpportunityIntentDeltaOnState,
  applyOpportunityConfidenceDeltaOnState,
  setOpportunityDaysLeftOnState,
  setOpportunityStageIndexOnState,
  setOpportunityTouchedTodayOnState,
  setOpportunityVisibilityOnState,
} from '../domain/opportunitySplitHelper.js';
import { applyPatienceDelta, applyUrgencyDelta } from '../domain/ownerCaseReadinessWriteHelper.js';
import {
  createProductRun,
  describeRunMilestone,
  findMilestoneById,
  hasActiveProductRunForTargets,
} from '../domain/productRuns.js';
import {
  buildTodayPlanItem,
  getTodayPlanActionDefinition,
  getTodayPlanRemainingEnergy,
  getSlotRemainingCapacity,
  hasTodayPlanDuplicate,
  markTodayPlanItemCompletedByActionMutable,
  markTodayPlanItemCompletedMutable,
  resolveActionDurationHours,
  resolveTodayPlanExecutionMode,
  syncTodayPlanForCurrentDayMutable,
} from './todayPlan.js';
import { emitDecisionMomentTriggers, advanceFlowProgress } from '../runtime/simulation/decisionMomentEmission.js';
import { buildOwnerProfilingMemorySummary } from './projections/ownerProfilingMemory.js';
import { registerProcessManagers } from '../domain/engine/processManagerFacade.js';
import {
  settleNegotiationProcessesForDay,
  advanceProductRunProcessesForDay,
} from '../runtime/simulation/processes/index.js';
import {
  buildNegotiationProcessResultSummary,
  buildProductRunProcessResultSummary,
} from '../runtime/simulation/processes/processResultSummary.js';
import {
  settleWechatConversationTurn,
  type WechatConversationTurnInput,
} from './wechatConversation.js';

// Register runtime process managers into domain facade.
// This breaks the domain→runtime reverse dependency.
// consensusReceipts is computed in resolveOneDay from processResults array,
// not from the negotiation result directly.
registerProcessManagers({
  settleNegotiationProcesses: (state) =>
    buildNegotiationProcessResultSummary(settleNegotiationProcessesForDay(state), { day: state.day }),
  advanceProductRunProcesses: (state) =>
    buildProductRunProcessResultSummary(advanceProductRunProcessesForDay(state), { day: state.day }),
});

export function cloneGameState(state: GameState): GameState {
  return structuredClone(state);
}

export function transitionGameState(
  state: GameState,
  transition: (next: GameState) => void,
): GameState {
  const next = cloneGameState(state);
  transition(next);
  return next;
}

export interface AdvanceGameDaysSummary {
  nextState: GameState;
  requestedDays: number;
  settledDays: number;
  beforeDay: number;
  afterDay: number;
  gameOver: boolean;
  lastResult: DailyTickResult | null;
  settledResults: DailyTickResult[];
  /** Diagnostics from enrichment pipeline failures. Empty = all succeeded. */
  enrichmentDiagnostics: readonly import('../runtime/simulation/dailyTickSemanticEnrichmentPipeline.js').EnrichmentDiagnostic[];
}

export function advanceGameDaysWithSummary(
  state: GameState,
  count: number,
  onMessage?: (msg: string) => void,
): AdvanceGameDaysSummary {
  const beforeDay = state.day;
  let settledResults: DailyTickResult[] = [];
  const allDiagnostics: import('../runtime/simulation/dailyTickSemanticEnrichmentPipeline.js').EnrichmentDiagnostic[] = [];
  const nextState = transitionGameState(state, (next) => {
    settledResults = advanceDays(next, count, onMessage, (tickState, tickResult) => {
      // Runtime enrichment: semantic receipts, ledger, process runs, etc.
      // Runs after each tick, before the next day starts.
      // Does NOT alter gameplay, rngCalls, or tick order.
      const diagnostics = enrichStateWithDailyTickSemantics({
        state: tickState,
        tickResult,
        activeCaseIdsAtEnd: tickState.cases
          .filter((c) => c.status === 'active')
          .map((c) => c.id)
          .sort(),
        settledDayClosedDeals: tickResult.closedDeals,
        settledDayEmittedEvents: tickResult.emittedEvents,
        isGameOver: tickState.gameOver,
      });
      allDiagnostics.push(...diagnostics);
    });
    syncTodayPlanForCurrentDayMutable(next);
  });

  return {
    nextState,
    requestedDays: count,
    settledDays: settledResults.length,
    beforeDay,
    afterDay: nextState.day,
    gameOver: nextState.gameOver,
    lastResult: settledResults[settledResults.length - 1] || null,
    settledResults,
    enrichmentDiagnostics: allDiagnostics,
  };
}

export function advanceGameDays(
  state: GameState,
  count: number,
  onMessage?: (msg: string) => void,
): GameState {
  return advanceGameDaysWithSummary(state, count, onMessage).nextState;
}

export function executeGameAction(
  state: GameState,
  actionId: string,
  caseId: string,
  optionId: string | null = null,
  todayPlanItemId: string | null = null,
  onMessage?: (msg: string) => void,
  meta?: unknown,
) {
  let success = false;
  const nextState = transitionGameState(state, (next) => {
    const currentCase = next.cases.find((entry) => entry.id === caseId);
    if (currentCase) {
      success = executeAction(next, actionId, currentCase, optionId, onMessage, meta);
      // Runtime enrichment after domain execution:
      // 1. Decision moment emission and flow progress (moved from domain/actionResolvers)
      if (success) {
        emitDecisionMomentTriggers(next, actionId, currentCase, optionId ?? undefined);
        advanceFlowProgress(next, actionId, currentCase.id);
      }
      // 2. Build action receipts from domain snapshots
      try {
        for (const snapshot of popPendingActionReceiptSnapshots()) {
          // Legacy receipt (stored in actionReceiptHistory)
          const receipt = buildActionReceiptFromSnapshot(snapshot, next);
          appendActionReceiptFromSnapshot(next, receipt);

          // New-style ActionReceipt with source records → causal events
          // Builds the full evidence chain and writes to worldCausalEvents
          const buildResult = buildReceiptFromSnapshot(snapshot, next.runContext.runSeed);
          applyReceiptToGameState(
            next as unknown as { worldCausalEvents?: readonly WorldCausalEvent[]; actionReceiptHistory?: readonly ActionReceipt[] },
            buildResult.receipt,
          );

          // Append causal events from source ingestion to worldCausalEvents
          const sourceReceipt = buildResult.sourceIngestionReceipt;
          if (sourceReceipt.causalEvents.length > 0) {
            const prev = Array.isArray(next.worldCausalEvents) ? next.worldCausalEvents : [];
            next.worldCausalEvents = [...prev, ...sourceReceipt.causalEvents];
          }
        }
      } catch (err: unknown) {
        // Receipt building is non-invasive — must not crash gameplay.
        // Diagnostic: log warning so failures are not invisible.
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[ActionReceipt building failed] action=${actionId}: ${msg}`);
      }
      if (success) {
        if (todayPlanItemId) {
          markTodayPlanItemCompletedMutable(next, todayPlanItemId);
        } else {
          markTodayPlanItemCompletedByActionMutable(next, actionId, caseId);
        }
      }
    }
    syncTodayPlanForCurrentDayMutable(next);
  });

  return {
    nextState,
    success,
  };
}

export function sendWechatConversationReply(
  state: GameState,
  input: WechatConversationTurnInput,
): ReturnType<typeof settleWechatConversationTurn> {
  let result: ReturnType<typeof settleWechatConversationTurn> | null = null;
  const nextState = transitionGameState(state, (next) => {
    result = settleWechatConversationTurn(next, input);
  });

  if (!result?.success) {
    return {
      nextState: state,
      success: false,
      reason: result?.reason || '微信回复没有生效。',
      receipt: null,
    };
  }

  return {
    ...result,
    nextState,
  };
}

export function executeScenarioAction(
  state: GameState,
  actionId: string,
  caseId: string,
  settlement: Settlement,
  scenarioContext?: {
    choices?: Array<{ round: number; main: string; assist: string }>;
    feedbacks?: Array<{ actor: string; mood: string; message: string }>;
  },
  todayPlanItemId: string | null = null,
  onMessage?: (msg: string) => void,
) {
  let success = false;
  const nextState = transitionGameState(state, (next) => {
    const currentCase = next.cases.find((entry) => entry.id === caseId);
    if (!currentCase || currentCase.status !== 'active') {
      return;
    }

    const action = resolveActionDefinition(actionId);
    if (!action) {
      return;
    }

    const availability = getActionAvailability(next, currentCase, actionId);
    if (!availability.enabled) {
      onMessage?.(availability.reason);
      return;
    }

    const todayPlanItem = todayPlanItemId
      ? next.todayPlan.playerItems.find((entry) => entry.id === todayPlanItemId && entry.day === next.day)
      : null;
    const executorActionId = action.executorId || action.id;
    const finalOptionId = settlement.finalOptionId ?? scenarioContext?.choices?.[scenarioContext.choices.length - 1]?.main ?? null;
    const deltaTarget = resolveScenarioActionTarget(next, todayPlanItem);
    const selectedShowingOpportunityId = executorActionId === 'showing'
      ? resolveShowingOpportunityIdFromOption(finalOptionId)
      : null;
    if (selectedShowingOpportunityId && !deltaTarget.linkedOpportunityId) {
      const selectedOpportunity = next.opportunities.find((entry) =>
        entry.id === selectedShowingOpportunityId
        && entry.caseId === currentCase.id
        && entry.status === 'active',
      ) || null;
      if (selectedOpportunity) {
        deltaTarget.linkedOpportunityId = selectedOpportunity.id;
        deltaTarget.linkedCustomerId = selectedOpportunity.customerId;
      }
    }
    const scenarioActionTarget = resolveScenarioActionOpportunity(
      next,
      currentCase,
      executorActionId,
      deltaTarget,
    );
    if (!scenarioActionTarget.ok) {
      recordDomainEvent(next, {
        kind: 'journal',
        actor: '情景动作',
        title: '情景动作目标失效',
        detail: scenarioActionTarget.reason,
        caseId: currentCase.id,
        tone: 'danger',
        payload: {
          actionId,
          executorId: executorActionId,
          linkedCustomerId: deltaTarget.linkedCustomerId,
          linkedOpportunityId: deltaTarget.linkedOpportunityId,
        },
      });
      onMessage?.(scenarioActionTarget.reason);
      return;
    }

    spendResources(next, action);
    settlement.stateDeltas.forEach((delta) => {
      applyScenarioDelta(
        next,
        currentCase,
        delta,
        actionId,
        scenarioActionTarget.opportunity,
        !scenarioActionTarget.relationOpportunityBound,
      );
    });
    applyActionStageRelation(next, currentCase, executorActionId, scenarioActionTarget.opportunity);
    if (executorActionId === 'invite-customer-negotiation' && scenarioActionTarget.opportunity) {
      queueDealClosingEvaluation(
        next,
        currentCase,
        scenarioActionTarget.opportunity,
        finalOptionId ?? 'balanced',
      );
    }
    currentCase.actionsToday += 1;
    currentCase.touchedToday = true;
    currentCase.lastTouchedDay = next.day;
    currentCase.lastAction = executorActionId;
    const ownerProfilingMemory = actionId === 'first-visit'
      ? buildOwnerProfilingMemorySummary(currentCase, scenarioContext?.choices || [])
      : undefined;
    if (ownerProfilingMemory) {
      currentCase.ownerProfilingMemory = ownerProfilingMemory;
    }

    recordDomainEvent(next, {
      kind: 'action_executed',
      actor: '情景动作',
      title: `执行 ${actionId}`,
      detail: settlement.title,
      caseId,
      tone: 'accent',
      payload: {
        actionId,
        finalOptionId,
        settlementOutcome: settlement.outcome,
        settlementTitle: settlement.title,
        stateDeltas: settlement.stateDeltas,
        choices: scenarioContext?.choices || [],
        feedbacks: scenarioContext?.feedbacks || [],
        ownerProfilingMemory,
      },
    });

    emitDecisionMomentTriggers(next, actionId, currentCase, finalOptionId ?? undefined);
    advanceFlowProgress(next, actionId, currentCase.id);

    if (action.id === 'open-day') {
      const targetIds = next.cases
        .filter((entry) => entry.status === 'active' && entry.community === currentCase.community)
        .map((entry) => entry.id);
      const normalizedTargets = targetIds.length > 0 ? targetIds : [currentCase.id];
      if (!hasActiveProductRunForTargets(next, 'open-day', normalizedTargets)) {
        const run = createProductRun(next, 'open-day', normalizedTargets);
        next.productRuns.unshift(run);
        const milestone = findMilestoneById(run, run.nextMilestone);
        const runEvent = recordDomainEvent(next, {
          kind: 'journal',
          actor: '开放日产品链路',
          title: '启动开放日跨天 run',
          detail: describeRunMilestone(run, milestone?.id || run.nextMilestone),
          caseId: currentCase.id,
          tone: 'success',
          payload: {
            runId: run.id,
            productType: run.productType,
            scope: run.scope,
            targetIds: run.targetIds,
            nextMilestone: run.nextMilestone,
          },
        });
        run.linkedEventIds = [...(run.linkedEventIds || []), runEvent.id];
      }
    }

    if (todayPlanItemId) {
      markTodayPlanItemCompletedMutable(next, todayPlanItemId);
    } else {
      markTodayPlanItemCompletedByActionMutable(next, actionId, caseId);
    }

    updateDerivedState(next);
    success = true;
    syncTodayPlanForCurrentDayMutable(next);
  });

  return {
    nextState,
    success,
  };
}

export function syncTodayPlanForCurrentDay(state: GameState) {
  return transitionGameState(state, (next) => {
    syncTodayPlanForCurrentDayMutable(next);
  });
}

export function addTodayPlanItem(
  state: GameState,
  draft: TodayPlanDraft,
  onMessage?: (msg: string) => void,
) {
  let success = false;
  let reason = '';

  const nextState = transitionGameState(state, (next) => {
    syncTodayPlanForCurrentDayMutable(next);

    const action = getTodayPlanActionDefinition(draft.linkedActionId);
    if (!action) {
      reason = '这个动作暂时还没有接好。';
      onMessage?.(reason);
      return;
    }

    const caseItem = draft.linkedCaseId
      ? next.cases.find((entry) => entry.id === draft.linkedCaseId)
      : null;
    if (!caseItem || caseItem.status !== 'active') {
      reason = '这套房当前不在场，先刷新一下再试。';
      onMessage?.(reason);
      return;
    }

    if (hasTodayPlanDuplicate(next, draft)) {
      reason = '这件事今天已经排进来了。';
      onMessage?.(reason);
      return;
    }

    const availability = getActionAvailability(next, caseItem, action.id);
    if (!availability.enabled) {
      reason = availability.reason;
      onMessage?.(reason);
      return;
    }

    const targetSlot = draft.slot === 'pm' ? 'pm' : 'am';
    const actionDurationHours = resolveActionDurationHours(action.id);
    if (getSlotRemainingCapacity(next, targetSlot) < actionDurationHours) {
      reason = `${targetSlot === 'am' ? '上午' : '下午'}时段容量不足，先完成已排事项或改到另一个时段。`;
      onMessage?.(reason);
      return;
    }

    const remainingEnergy = getTodayPlanRemainingEnergy(next);
    if (remainingEnergy < action.costEnergy) {
      reason = `今天还能安排的精力不够，先完成一件已排事项。`;
      onMessage?.(reason);
      return;
    }

    next.todayPlan.playerItems.push(buildTodayPlanItem(next, {
      ...draft,
      executionMode: resolveTodayPlanExecutionMode(action.id, draft.executionMode),
    }));
    syncTodayPlanForCurrentDayMutable(next);
    success = true;
  });

  return {
    nextState: success ? nextState : state,
    success,
    reason,
  };
}

export function removeTodayPlanItem(
  state: GameState,
  itemId: string,
  onMessage?: (msg: string) => void,
) {
  let success = false;
  let reason = '';

  const nextState = transitionGameState(state, (next) => {
    syncTodayPlanForCurrentDayMutable(next);
    const before = next.todayPlan.playerItems.length;
    next.todayPlan.playerItems = next.todayPlan.playerItems.filter((entry) => !(
      entry.id === itemId
      && entry.day === next.day
      && entry.status === 'planned'
    ));
    success = next.todayPlan.playerItems.length < before;
    if (!success) {
      reason = '这个安排已经不在今天的计划里了。';
      onMessage?.(reason);
    }
  });

  return {
    nextState: success ? nextState : state,
    success,
    reason,
  };
}

export function executeTodayPlanItem(
  state: GameState,
  itemId: string,
  optionId: string | null = null,
  onMessage?: (msg: string) => void,
) {
  const item = state.todayPlan.playerItems.find((entry) => (
    entry.id === itemId
    && entry.day === state.day
    && entry.status === 'planned'
  )) || null;
  if (!item) {
    const reason = '这个安排已经不在今天的计划里了。';
    onMessage?.(reason);
    return {
      nextState: state,
      success: false,
      reason,
      outcome: 'missing' as const,
      executionMode: null,
    };
  }

  const action = getTodayPlanActionDefinition(item.linkedActionId);
  const executionMode = resolveTodayPlanExecutionMode(item.linkedActionId, item.executionMode);
  if (!action || !item.linkedCaseId) {
    const reason = '这个安排暂时还没有接好执行入口。';
    onMessage?.(reason);
    return {
      nextState: state,
      success: false,
      reason,
      outcome: 'blocked' as const,
      executionMode,
    };
  }

  if (executionMode === 'scenario') {
    return {
      nextState: state,
      success: true,
      reason: '',
      outcome: 'scenario' as const,
      executionMode,
    };
  }

  const result = executeGameAction(state, action.id, item.linkedCaseId, optionId, itemId, onMessage);
  if (!result.success) {
    return {
      nextState: state,
      success: false,
      reason: '',
      outcome: 'blocked' as const,
      executionMode,
    };
  }

  return {
    nextState: result.nextState,
    success: true,
    reason: '',
    outcome: 'executed' as const,
    executionMode,
  };
}

function clamp01to100(value: number) {
  return Math.max(0, Math.min(100, value));
}

function resolveShowingOpportunityIdFromOption(optionId: string | null | undefined) {
  const prefix = 'show-customer-';
  if (!optionId?.startsWith(prefix)) {
    return null;
  }
  return optionId.slice(prefix.length) || null;
}

function resolveScenarioActionTarget(
  state: GameState,
  todayPlanItem?: GameState['todayPlan']['playerItems'][number] | null,
) {
  const target = {
    linkedCustomerId: todayPlanItem?.linkedCustomerId,
    linkedOpportunityId: todayPlanItem?.linkedOpportunityId,
  };
  if (!todayPlanItem?.sourceMatterId || target.linkedOpportunityId) {
    return target;
  }

  const sourceMatter = state.matters.find((entry) => entry.id === todayPlanItem.sourceMatterId) || null;
  if (!sourceMatter) {
    return target;
  }

  if (sourceMatter.source === 'schedule') {
    const scheduleEntry = state.schedule.find((entry) => entry.key === sourceMatter.sourceKey) || null;
    if (scheduleEntry?.opportunityId) {
      target.linkedOpportunityId = scheduleEntry.opportunityId;
    }
  } else if (sourceMatter.kind === 'opportunity' || sourceMatter.source === 'negotiation') {
    target.linkedOpportunityId = sourceMatter.sourceKey;
  }

  if (target.linkedOpportunityId && !target.linkedCustomerId) {
    const opportunity = state.opportunities.find((entry) => entry.id === target.linkedOpportunityId) || null;
    target.linkedCustomerId = opportunity?.customerId;
  }

  return target;
}

function resolveScenarioActionOpportunity(
  state: GameState,
  currentCase: GameState['cases'][number],
  actionId: string,
  target?: {
    linkedCustomerId?: string;
    linkedOpportunityId?: string;
  },
): {
  ok: boolean;
  opportunity: Opportunity | null;
  relationOpportunityBound: boolean;
  reason: string;
} {
  const relation = getActionStageRelation(actionId);
  if (relation?.availabilityKind !== 'opportunity-bound') {
    return { ok: true, opportunity: null, relationOpportunityBound: false, reason: '' };
  }

  const activeOpportunities = state.opportunities
    .filter((entry) => entry.caseId === currentCase.id && entry.status === 'active');
  const withinRelationWindow = (opportunity: Opportunity) => {
    const window = relation.opportunityStageWindow;
    return !window || (opportunity.stageIndex >= window.min && opportunity.stageIndex <= window.max);
  };

  const explicitOpportunity = target?.linkedOpportunityId
    ? activeOpportunities.find((entry) => entry.id === target.linkedOpportunityId) || null
    : null;
  if (target?.linkedOpportunityId) {
    if (!explicitOpportunity) {
      return {
        ok: false,
        opportunity: null,
        relationOpportunityBound: true,
        reason: '这条计划绑定的客户线已经不在当前房源的活跃线索里，先刷新今日计划再执行。',
      };
    }
    if (!withinRelationWindow(explicitOpportunity)) {
      return {
        ok: false,
        opportunity: null,
        relationOpportunityBound: true,
        reason: '这条计划绑定的客户线已经不适合当前动作，先改排对应阶段的动作。',
      };
    }
    return { ok: true, opportunity: explicitOpportunity, relationOpportunityBound: true, reason: '' };
  }

  const customerOpportunity = target?.linkedCustomerId
    ? activeOpportunities.find((entry) => entry.customerId === target.linkedCustomerId && withinRelationWindow(entry)) || null
    : null;
  if (target?.linkedCustomerId && !customerOpportunity) {
    return {
      ok: false,
      opportunity: null,
      relationOpportunityBound: true,
      reason: '这条计划绑定的客户不在当前动作可推进的阶段里，先刷新今日计划再执行。',
    };
  }

  const fallbackOpportunity = [...activeOpportunities]
    .filter(withinRelationWindow)
    .sort((left, right) => getOpportunityPriority(right) - getOpportunityPriority(left))[0] || null;
  if (!customerOpportunity && !fallbackOpportunity) {
    return {
      ok: false,
      opportunity: null,
      relationOpportunityBound: true,
      reason: '当前没有适合这个动作推进的活跃客户线。',
    };
  }
  return {
    ok: true,
    opportunity: customerOpportunity || fallbackOpportunity,
    relationOpportunityBound: true,
    reason: '',
  };
}

function applyScenarioDelta(
  state: GameState,
  currentCase: GameState['cases'][number],
  delta: Settlement['stateDeltas'][number],
  actionId: string,
  targetOpportunity?: Opportunity | null,
  allowOpportunityFallback = true,
) {
  if (delta.field === 'trust') {
    // Write to canonical BrokerOwnerRelation, sync to Case mirror
    setBrokerOwnerTrust(state, currentCase, clamp01to100(currentCase.trust + delta.value), `scenario:${actionId}`);
    return;
  }
  if (delta.field === 'patience') {
    // Write to canonical OwnerCaseRelation, sync to Case mirror
    applyPatienceDelta(state, currentCase, delta.value, `scenario:${actionId}`, 0, 100);
    return;
  }
  if (delta.field === 'd1') {
    currentCase.d1 = clamp01to100(currentCase.d1 + delta.value);
    return;
  }
  if (delta.field === 'd2') {
    currentCase.d2 = clamp01to100(currentCase.d2 + delta.value);
    return;
  }
  if (delta.field === 'd3') {
    currentCase.d3 = clamp01to100(currentCase.d3 + delta.value);
    return;
  }
  if (delta.field === 'heat') {
    currentCase.heat = clamp01to100(currentCase.heat + delta.value);
    return;
  }
  if (delta.field === 'urgency') {
    // Write to canonical OwnerCaseRelation, sync to Case mirror
    applyUrgencyDelta(state, currentCase, delta.value, `scenario:${actionId}`, 0, 100);
    return;
  }
  if (delta.field === 'askPrice') {
    currentCase.askPrice += delta.value;
    return;
  }
  if (delta.field === 'viewings') {
    currentCase.viewings = Math.max(0, currentCase.viewings + Math.round(delta.value));
    if (targetOpportunity) {
      setOpportunityVisibilityOnState(state, targetOpportunity, 'revealed', '情景带看揭示客户');
      setOpportunityStageIndexOnState(state, targetOpportunity, Math.max(targetOpportunity.stageIndex, 2), '情景带看推进阶段', 0, 4);
      setOpportunityDaysLeftOnState(state, targetOpportunity, 4, '情景带看设定剩余天数');
      setOpportunityTouchedTodayOnState(state, targetOpportunity, true, '情景带看标记今日触达');
      refreshOpportunityLabel(state, targetOpportunity);
      const customerState = state.customerStates.find((entry) => entry.customerId === targetOpportunity.customerId);
      const runtime = customerState?.caseStates[currentCase.id];
      if (runtime) {
        runtime.viewed = true;
        runtime.interactions += 1;
        runtime.stageIndex = Math.max(runtime.stageIndex, Math.min(4, targetOpportunity.stageIndex));
        runtime.lastActiveDay = state.day;
        runtime.selected = true;
        customerState.lastTouchDay = state.day;
        customerState.lastActionNote = '完成带看';
      }
    }
    return;
  }
  if (delta.field === 'ownerTouch') {
    currentCase.touchedOwnerToday = true;
    currentCase.lastOwnerTouchedDay = state.day;
    return;
  }
  if (delta.field === 'intent' || delta.field === 'confidence') {
    const fallbackOpportunity = allowOpportunityFallback
      ? [...state.opportunities]
        .filter((entry) => entry.caseId === currentCase.id && entry.status === 'active')
        .sort((left, right) => (right.stageIndex + right.intent / 100) - (left.stageIndex + left.intent / 100))[0]
      : null;
    const writableOpportunity = targetOpportunity || fallbackOpportunity;
    if (!writableOpportunity) {
      recordDomainEvent(state, {
        kind: 'journal',
        actor: '情景动作',
        title: '结算字段未写回',
        detail: `${actionId} 结算包含 ${delta.field}，但当前没有可写回的活跃客户线。`,
        caseId: currentCase.id,
        tone: 'danger',
        payload: { field: delta.field, value: delta.value },
      });
      return;
    }
    if (delta.field === 'intent') {
      applyOpportunityIntentDeltaOnState(state, writableOpportunity, delta.value, '情景结算意向', 0, 100);
    } else {
      applyOpportunityConfidenceDeltaOnState(state, writableOpportunity, delta.value, '情景结算信心', 0, 100);
    }
    return;
  }
  recordDomainEvent(state, {
    kind: 'journal',
    actor: '情景动作',
    title: '结算字段未支持',
    detail: `${actionId} 结算字段 ${delta.field} 暂未支持写回，已忽略。`,
    caseId: currentCase.id,
    tone: 'danger',
    payload: { field: delta.field, value: delta.value },
  });
}
