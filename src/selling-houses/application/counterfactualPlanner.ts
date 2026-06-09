import { ACTIONS } from '../domain/constants.js';
import type { ActionDefinition, Case, GameState, Opportunity } from '../domain/models.js';
import { isCaseActiveByCanonicalStatus } from '../domain/caseLifecycleStatusRead.js';
import { getPromotionBudget } from '../domain/runtimeStats.js';
import type { DecisionEvidenceEnvelope } from '../domain/world-model/actorKnowledgeTypes.js';
import { advanceGameDaysWithSummary, cloneGameState, executeGameAction } from './gameTransitions.js';

export interface CounterfactualPlannerInput {
  readonly state: GameState;
  readonly caseId: string;
  readonly actorId?: string;
  readonly decisionEnvelope?: DecisionEvidenceEnvelope | null;
  readonly candidateActionIds?: readonly string[];
  readonly candidatePaths?: readonly (readonly string[])[];
  readonly horizonDays?: number;
  readonly daysBetweenActions?: number;
  readonly maxPlans?: number;
  readonly maxSequenceLength?: number;
}

export interface CounterfactualCaseSnapshot {
  readonly day: number;
  readonly status: Case['status'] | 'missing';
  readonly sold: boolean;
  readonly soldPrice: number | null;
  readonly trust: number;
  readonly patience: number;
  readonly urgency: number;
  readonly heat: number;
  readonly competitiveness: number;
  readonly askPrice: number;
  readonly marketPrice: number;
  readonly askMarketGap: number;
  readonly windowDays: number;
  readonly stageIndex: number;
  readonly activeOpportunityCount: number;
  readonly bestOpportunityIntent: number;
  readonly bestOpportunityConfidence: number;
  readonly bestOpportunityStageIndex: number;
  readonly minOpportunityDaysLeft: number | null;
  readonly closedDealCount: number;
  readonly caseCausalEventCount: number;
  readonly caseSourceRecordCount: number;
  readonly energy: number;
  readonly promotionBudget: number;
}

export interface CounterfactualDelta {
  readonly absoluteScore: number;
  readonly baselineScore: number;
  readonly scoreLiftVsBaseline: number;
  readonly score: number;
  readonly closedDealDelta: number;
  readonly trustDelta: number;
  readonly patienceDelta: number;
  readonly urgencyDelta: number;
  readonly heatDelta: number;
  readonly competitivenessDelta: number;
  readonly intentDelta: number;
  readonly confidenceDelta: number;
  readonly stageDelta: number;
  readonly askMarketGapReduction: number;
  readonly windowDaysDelta: number;
  readonly energySpent: number;
  readonly promotionBudgetSpent: number;
  readonly failedActionCount: number;
  readonly newCausalEventCount: number;
  readonly newSourceRecordCount: number;
}

export interface CounterfactualActionTrace {
  readonly actionId: string;
  readonly actionLabel: string;
  readonly commandId?: string;
  readonly startedDay: number;
  readonly success: boolean;
  readonly beforeCausalEventCount: number;
  readonly afterCausalEventCount: number;
  readonly beforeReceiptCount: number;
  readonly afterReceiptCount: number;
  readonly beforeClosedDealCount: number;
  readonly afterClosedDealCount: number;
  readonly message: string;
}

export interface CounterfactualPlanOutcome {
  readonly planId: string;
  readonly caseId: string;
  readonly actorId: string;
  readonly horizonDays: number;
  readonly actionSequence: readonly CounterfactualActionTrace[];
  readonly startingSnapshot: CounterfactualCaseSnapshot;
  readonly outcomeSnapshot: CounterfactualCaseSnapshot;
  readonly delta: CounterfactualDelta;
  readonly evidenceRefs: {
    readonly sourceRecordIds: readonly string[];
    readonly causalEventIds: readonly string[];
    readonly actionReceiptReplayKeys: readonly string[];
  };
  readonly explanation: {
    readonly headline: string;
    readonly rationale: string;
    readonly riskNotes: readonly string[];
  };
}

export interface CounterfactualPlannerProjection {
  readonly projectionKind: 'counterfactual_planner';
  readonly readOnly: true;
  readonly caseId: string;
  readonly actorId: string;
  readonly day: number;
  readonly horizonDays: number;
  readonly comparedPlanCount: number;
  readonly baseline: {
    readonly startingSnapshot: CounterfactualCaseSnapshot;
    readonly outcomeSnapshot: CounterfactualCaseSnapshot;
    readonly delta: CounterfactualDelta;
  } | null;
  readonly topPlan: CounterfactualPlanOutcome | null;
  readonly plans: readonly CounterfactualPlanOutcome[];
  readonly rejectedPaths: readonly {
    readonly path: readonly string[];
    readonly reason: string;
  }[];
  readonly replayKey: string;
}

type CommandActionMap = Readonly<Record<string, readonly string[]>>;

const COMMAND_TO_ACTION_IDS: CommandActionMap = {
  'cmd-price-adjustment': ['pricing-advice', 'ask-psychological-price', 'adjust-listing-price'],
  'cmd-customer-acquisition': ['private-referral', 'broker-broadcast', 'xiaohongshu-boost'],
  'cmd-owner-visit': ['first-visit', 'weekly-feedback', 'deep-diagnosis'],
  'cmd-focus-meeting': ['focus-meeting-submit'],
  'cmd-escalate-manager': ['focus-meeting-submit', 'weekly-feedback'],
  'cmd-defend-listing': ['open-day', 'xiaohongshu-boost', 'broker-broadcast', 'story'],
};

const DEFAULT_SAFE_ACTION_IDS = [
  'first-visit',
  'weekly-feedback',
  'deep-diagnosis',
  'pricing-advice',
  'private-referral',
  'broker-broadcast',
] as const;

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function actionDefinition(actionId: string): ActionDefinition | null {
  return ACTIONS.find((entry) => entry.id === actionId || entry.executorId === actionId) ?? null;
}

function actionLabel(actionId: string): string {
  return actionDefinition(actionId)?.name ?? actionId;
}

function countCaseSourceRecords(state: GameState, caseId: string): number {
  const records = state.bigWorldRuntime?.persistedSourceRecords ?? [];
  return records.filter((record) => {
    const payload = record.payload as unknown as Record<string, unknown>;
    return record.entityRefs.some((ref) => ref.id === caseId)
      || payload.caseId === caseId
      || payload.targetCaseId === caseId
      || payload.listingId === caseId;
  }).length;
}

function countCaseCausalEvents(state: GameState, caseId: string): number {
  return (state.worldCausalEvents ?? []).filter((event) => {
    const payload = event.payload as unknown as Record<string, unknown>;
    return event.affectedIds.includes(caseId)
      || event.entityIds.includes(caseId)
      || payload.caseId === caseId
      || payload.targetCaseId === caseId
      || payload.listingId === caseId;
  }).length;
}

function activeOpportunitiesForCase(state: GameState, caseId: string): Opportunity[] {
  return state.opportunities.filter((entry) => (
    entry.caseId === caseId
    && entry.status === 'active'
    && entry.lifecycleStatus === 'active'
  ));
}

function bestOpportunity(opportunities: readonly Opportunity[]): Opportunity | null {
  let best: Opportunity | null = null;
  for (const opportunity of opportunities) {
    if (!best) {
      best = opportunity;
      continue;
    }
    const score = opportunity.intent + opportunity.confidence + opportunity.stageIndex * 8;
    const bestScore = best.intent + best.confidence + best.stageIndex * 8;
    if (score > bestScore) best = opportunity;
  }
  return best;
}

function captureCaseSnapshot(state: GameState, caseId: string): CounterfactualCaseSnapshot {
  const caseItem = state.cases.find((entry) => entry.id === caseId);
  const opportunities = activeOpportunitiesForCase(state, caseId);
  const best = bestOpportunity(opportunities);
  const closedDealCount = state.closedDeals.filter((entry) => entry.caseId === caseId).length;

  if (!caseItem) {
    return {
      day: state.day,
      status: 'missing',
      sold: false,
      soldPrice: null,
      trust: 0,
      patience: 0,
      urgency: 0,
      heat: 0,
      competitiveness: 0,
      askPrice: 0,
      marketPrice: 0,
      askMarketGap: 0,
      windowDays: 0,
      stageIndex: 0,
      activeOpportunityCount: 0,
      bestOpportunityIntent: 0,
      bestOpportunityConfidence: 0,
      bestOpportunityStageIndex: 0,
      minOpportunityDaysLeft: null,
      closedDealCount,
      caseCausalEventCount: countCaseCausalEvents(state, caseId),
      caseSourceRecordCount: countCaseSourceRecords(state, caseId),
      energy: state.energy,
      promotionBudget: getPromotionBudget(state),
    };
  }

  return {
    day: state.day,
    status: caseItem.status,
    sold: caseItem.status === 'sold' || closedDealCount > 0,
    soldPrice: caseItem.soldPrice,
    trust: caseItem.trust,
    patience: caseItem.patience,
    urgency: caseItem.urgency,
    heat: caseItem.heat,
    competitiveness: caseItem.competitiveness,
    askPrice: caseItem.askPrice,
    marketPrice: caseItem.marketPrice,
    askMarketGap: Math.abs(caseItem.askPrice - caseItem.marketPrice),
    windowDays: caseItem.windowDays,
    stageIndex: caseItem.stageIndex,
    activeOpportunityCount: opportunities.length,
    bestOpportunityIntent: best?.intent ?? 0,
    bestOpportunityConfidence: best?.confidence ?? 0,
    bestOpportunityStageIndex: best?.stageIndex ?? 0,
    minOpportunityDaysLeft: opportunities.length > 0
      ? Math.min(...opportunities.map((entry) => entry.daysLeft))
      : null,
    closedDealCount,
    caseCausalEventCount: countCaseCausalEvents(state, caseId),
    caseSourceRecordCount: countCaseSourceRecords(state, caseId),
    energy: state.energy,
    promotionBudget: getPromotionBudget(state),
  };
}

function scoreDelta(start: CounterfactualCaseSnapshot, end: CounterfactualCaseSnapshot, failedActionCount: number): CounterfactualDelta {
  const closedDealDelta = end.closedDealCount - start.closedDealCount;
  const trustDelta = end.trust - start.trust;
  const patienceDelta = end.patience - start.patience;
  const urgencyDelta = end.urgency - start.urgency;
  const heatDelta = end.heat - start.heat;
  const competitivenessDelta = end.competitiveness - start.competitiveness;
  const intentDelta = end.bestOpportunityIntent - start.bestOpportunityIntent;
  const confidenceDelta = end.bestOpportunityConfidence - start.bestOpportunityConfidence;
  const stageDelta = end.bestOpportunityStageIndex - start.bestOpportunityStageIndex;
  const askMarketGapReduction = start.askMarketGap - end.askMarketGap;
  const windowDaysDelta = end.windowDays - start.windowDays;
  const energySpent = Math.max(0, start.energy - end.energy);
  const promotionBudgetSpent = Math.max(0, start.promotionBudget - end.promotionBudget);
  const newCausalEventCount = end.caseCausalEventCount - start.caseCausalEventCount;
  const newSourceRecordCount = end.caseSourceRecordCount - start.caseSourceRecordCount;

  const absoluteScore = Math.round(
    (end.sold && !start.sold ? 800 : 0)
    + closedDealDelta * 420
    + intentDelta * 2.2
    + confidenceDelta * 1.8
    + stageDelta * 18
    + trustDelta * 2
    + patienceDelta * 1.2
    - urgencyDelta * 0.5
    + heatDelta * 0.9
    + competitivenessDelta * 1.3
    + askMarketGapReduction * 3
    + windowDaysDelta * 1.5
    + Math.max(0, newCausalEventCount) * 3
    + Math.max(0, newSourceRecordCount) * 2
    - energySpent * 5
    - promotionBudgetSpent * 4
    - failedActionCount * 600,
  );

  return {
    absoluteScore,
    baselineScore: 0,
    scoreLiftVsBaseline: absoluteScore,
    score: absoluteScore,
    closedDealDelta,
    trustDelta,
    patienceDelta,
    urgencyDelta,
    heatDelta,
    competitivenessDelta,
    intentDelta,
    confidenceDelta,
    stageDelta,
    askMarketGapReduction,
    windowDaysDelta,
    energySpent,
    promotionBudgetSpent,
    failedActionCount,
    newCausalEventCount,
    newSourceRecordCount,
  };
}

function scoreDeltaAgainstBaseline(
  start: CounterfactualCaseSnapshot,
  end: CounterfactualCaseSnapshot,
  failedActionCount: number,
  baseline: CounterfactualDelta,
): CounterfactualDelta {
  const raw = scoreDelta(start, end, failedActionCount);
  const scoreLiftVsBaseline = raw.absoluteScore - baseline.absoluteScore;
  return {
    ...raw,
    baselineScore: baseline.absoluteScore,
    scoreLiftVsBaseline,
    score: scoreLiftVsBaseline,
  };
}

function collectDecisionCandidateActions(envelope: DecisionEvidenceEnvelope | null | undefined): string[] {
  if (!envelope) return [];
  const commandIds = [
    envelope.recommendedCommand?.command.commandId,
    ...envelope.availableCommands.map((command) => command.commandId),
  ].filter((value): value is string => Boolean(value));

  return unique(commandIds.flatMap((commandId) => COMMAND_TO_ACTION_IDS[commandId] ?? []));
}

function resolveCandidateActionIds(input: CounterfactualPlannerInput): string[] {
  const explicit = input.candidateActionIds ?? [];
  const fromDecision = collectDecisionCandidateActions(input.decisionEnvelope);
  return unique([...explicit, ...fromDecision, ...DEFAULT_SAFE_ACTION_IDS])
    .filter((actionId) => actionDefinition(actionId) !== null)
    .slice(0, Math.max(1, input.maxPlans ?? 6));
}

function resolveCandidatePaths(input: CounterfactualPlannerInput): readonly string[][] {
  if (input.candidatePaths && input.candidatePaths.length > 0) {
    return input.candidatePaths
      .map((path) => path.filter((actionId) => actionDefinition(actionId) !== null))
      .filter((path) => path.length > 0)
      .slice(0, Math.max(1, input.maxPlans ?? 6));
  }

  const maxSequenceLength = Math.max(1, Math.min(2, input.maxSequenceLength ?? 1));
  const actionIds = resolveCandidateActionIds(input);
  const paths: string[][] = actionIds.map((actionId) => [actionId]);

  if (maxSequenceLength >= 2 && actionIds.length >= 2) {
    paths.push([actionIds[0], actionIds[1]]);
    paths.push([actionIds[1], actionIds[0]]);
  }

  return paths.slice(0, Math.max(1, input.maxPlans ?? 6));
}

function collectNewEvidenceRefs(before: GameState, after: GameState) {
  const beforeSourceIds = new Set(before.bigWorldRuntime?.persistedSourceRecords.map((record) => record.sourceId) ?? []);
  const beforeEventIds = new Set((before.worldCausalEvents ?? []).map((event) => event.id));
  const receiptKey = (receipt: unknown) => {
    const value = receipt as { replayKey?: string; receiptId?: string };
    return value.replayKey ?? value.receiptId ?? '';
  };
  const beforeReceiptKeys = new Set((before.actionReceiptHistory ?? []).map(receiptKey).filter(Boolean));

  return {
    sourceRecordIds: (after.bigWorldRuntime?.persistedSourceRecords ?? [])
      .map((record) => record.sourceId)
      .filter((sourceId) => !beforeSourceIds.has(sourceId))
      .slice(0, 12),
    causalEventIds: (after.worldCausalEvents ?? [])
      .map((event) => event.id)
      .filter((eventId) => !beforeEventIds.has(eventId))
      .slice(0, 12),
    actionReceiptReplayKeys: (after.actionReceiptHistory ?? [])
      .map(receiptKey)
      .filter(Boolean)
      .filter((replayKey) => !beforeReceiptKeys.has(replayKey))
      .slice(0, 8),
  };
}

function buildRiskNotes(delta: CounterfactualDelta, traces: readonly CounterfactualActionTrace[]): string[] {
  const notes: string[] = [];
  if (delta.failedActionCount > 0) notes.push('路径中存在不可执行或被规则阻塞的动作。');
  if (delta.energySpent > 2) notes.push(`能量消耗较高：${delta.energySpent}。`);
  if (delta.promotionBudgetSpent > 3) notes.push(`推广预算消耗较高：${delta.promotionBudgetSpent}。`);
  if (delta.patienceDelta < 0) notes.push(`业主耐心下降 ${Math.abs(delta.patienceDelta)}。`);
  if (delta.intentDelta < 0 || delta.confidenceDelta < 0) notes.push('客户意向或信心在模拟后走弱。');
  if (traces.length === 0) notes.push('没有可执行动作进入模拟。');
  return notes;
}

function buildExplanation(path: readonly string[], delta: CounterfactualDelta, traces: readonly CounterfactualActionTrace[]) {
  const firstLabel = path.length > 0 ? actionLabel(path[0]) : '无动作';
  const headline = delta.closedDealDelta > 0
    ? `${firstLabel} 路径在模拟期内形成成交结果`
    : `${firstLabel} 路径模拟得分 ${delta.score}`;
  const signed = (value: number) => `${value >= 0 ? '+' : ''}${Number(value.toFixed(1))}`;
  const rationale = [
    `相对不行动 ${signed(delta.scoreLiftVsBaseline)}`,
    `绝对分 ${delta.absoluteScore}`,
    `成交变化 ${delta.closedDealDelta}`,
    `意向 ${signed(delta.intentDelta)}`,
    `信心 ${signed(delta.confidenceDelta)}`,
    `信任 ${signed(delta.trustDelta)}`,
    `新增因果 ${delta.newCausalEventCount}`,
  ].join('，');
  return {
    headline,
    rationale,
    riskNotes: buildRiskNotes(delta, traces),
  };
}

function simulatePath(
  input: CounterfactualPlannerInput,
  path: readonly string[],
  baselineDelta: CounterfactualDelta,
): CounterfactualPlanOutcome | null {
  const horizonDays = Math.max(1, input.horizonDays ?? 3);
  const daysBetweenActions = Math.max(0, input.daysBetweenActions ?? 1);
  const actorId = input.actorId ?? 'player-broker';
  const baseState = input.state;
  const startingSnapshot = captureCaseSnapshot(baseState, input.caseId);
  let current = cloneGameState(baseState);
  const actionTrace: CounterfactualActionTrace[] = [];
  let failedActionCount = 0;

  for (let index = 0; index < path.length; index += 1) {
    const actionId = path[index];
    const beforeAction = current;
    const beforeCausalEventCount = beforeAction.worldCausalEvents?.length ?? 0;
    const beforeReceiptCount = beforeAction.actionReceiptHistory?.length ?? 0;
    const beforeClosedDealCount = beforeAction.closedDeals.length;
    const startedDay = beforeAction.day;
    let message = '';
    const result = executeGameAction(
      beforeAction,
      actionId,
      input.caseId,
      null,
      null,
      (msg) => { message = msg; },
    );

    current = result.nextState;
    const success = result.success;
    if (!success) failedActionCount += 1;
    actionTrace.push({
      actionId,
      actionLabel: actionLabel(actionId),
      commandId: undefined,
      startedDay,
      success,
      beforeCausalEventCount,
      afterCausalEventCount: current.worldCausalEvents?.length ?? 0,
      beforeReceiptCount,
      afterReceiptCount: current.actionReceiptHistory?.length ?? 0,
      beforeClosedDealCount,
      afterClosedDealCount: current.closedDeals.length,
      message: message || (success ? 'action simulated' : 'action blocked'),
    });

    if (!success) break;
    const hasNextAction = index < path.length - 1;
    if (hasNextAction && daysBetweenActions > 0) {
      current = advanceGameDaysWithSummary(current, daysBetweenActions).nextState;
    }
  }

  if (actionTrace.length === 0) return null;

  if (failedActionCount === 0) {
    current = advanceGameDaysWithSummary(current, horizonDays).nextState;
  }

  const outcomeSnapshot = captureCaseSnapshot(current, input.caseId);
  const delta = scoreDeltaAgainstBaseline(startingSnapshot, outcomeSnapshot, failedActionCount, baselineDelta);
  const evidenceRefs = collectNewEvidenceRefs(baseState, current);

  return {
    planId: `cfp-${input.caseId}-${baseState.day}-${path.join('-')}`,
    caseId: input.caseId,
    actorId,
    horizonDays,
    actionSequence: actionTrace,
    startingSnapshot,
    outcomeSnapshot,
    delta,
    evidenceRefs,
    explanation: buildExplanation(path, delta, actionTrace),
  };
}

export function buildCounterfactualPlannerProjection(
  input: CounterfactualPlannerInput,
): CounterfactualPlannerProjection {
  const actorId = input.actorId ?? 'player-broker';
  const horizonDays = Math.max(1, input.horizonDays ?? 3);
  const caseItem = input.state.cases.find((entry) => entry.id === input.caseId);
  const rejectedPaths: { path: readonly string[]; reason: string }[] = [];

  if (!caseItem) {
    return {
      projectionKind: 'counterfactual_planner',
      readOnly: true,
      caseId: input.caseId,
      actorId,
      day: input.state.day,
      horizonDays,
      comparedPlanCount: 0,
      baseline: null,
      topPlan: null,
      plans: [],
      rejectedPaths: [{ path: [], reason: 'case not found' }],
      replayKey: `cfp-${input.caseId}-${input.state.day}-empty`,
    };
  }

  if (!isCaseActiveByCanonicalStatus(input.state, caseItem)) {
    return {
      projectionKind: 'counterfactual_planner',
      readOnly: true,
      caseId: input.caseId,
      actorId,
      day: input.state.day,
      horizonDays,
      comparedPlanCount: 0,
      baseline: null,
      topPlan: null,
      plans: [],
      rejectedPaths: [{ path: [], reason: 'case is not active' }],
      replayKey: `cfp-${input.caseId}-${input.state.day}-inactive`,
    };
  }

  const paths = resolveCandidatePaths(input);
  const startingSnapshot = captureCaseSnapshot(input.state, input.caseId);
  const baselineState = advanceGameDaysWithSummary(input.state, horizonDays).nextState;
  const baselineSnapshot = captureCaseSnapshot(baselineState, input.caseId);
  const baselineDelta = scoreDelta(startingSnapshot, baselineSnapshot, 0);
  const outcomes: CounterfactualPlanOutcome[] = [];
  for (const path of paths) {
    if (path.length === 0) {
      rejectedPaths.push({ path, reason: 'empty path' });
      continue;
    }
    const outcome = simulatePath(input, path, baselineDelta);
    if (!outcome) {
      rejectedPaths.push({ path, reason: 'path produced no simulation trace' });
      continue;
    }
    outcomes.push(outcome);
  }

  const plans = outcomes
    .sort((left, right) => right.delta.score - left.delta.score)
    .map((outcome, index) => ({
      ...outcome,
      planId: `${outcome.planId}-rank-${index + 1}`,
    }));

  return {
    projectionKind: 'counterfactual_planner',
    readOnly: true,
    caseId: input.caseId,
    actorId,
    day: input.state.day,
    horizonDays,
    comparedPlanCount: plans.length,
    baseline: {
      startingSnapshot,
      outcomeSnapshot: baselineSnapshot,
      delta: baselineDelta,
    },
    topPlan: plans[0] ?? null,
    plans,
    rejectedPaths,
    replayKey: `cfp-${input.caseId}-${input.state.day}-${horizonDays}-${plans.length}`,
  };
}
