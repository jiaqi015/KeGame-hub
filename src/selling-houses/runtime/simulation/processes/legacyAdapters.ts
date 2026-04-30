import type { GameState, Opportunity, ProductRun } from '../../../domain/models';
import type {
  NegotiationProcessReadModel,
  OpenDayProcessRunReadModel,
  ProcessManagerContract,
  ProcessManagerType,
  ProcessRunReadModel,
  ProcessTransitionView,
  SinceritySaleProcessRunReadModel,
} from './types';

const PROCESS_LABELS: Record<ProcessManagerType, string> = {
  'open-day': '开放日',
  'sincerity-sale': '诚意卖',
  negotiation: '斡旋成交',
};

function processIdForProductRun(run: ProductRun) {
  return run.productType === 'open-day'
    ? `open-day:${run.id}`
    : `sincerity-sale:${run.id}`;
}

function findCurrentMilestone(run: ProductRun) {
  return (run.milestones || []).find((milestone) => milestone.id === run.nextMilestone) || null;
}

function buildProductRunTransitionView(
  run: ProductRun,
  processType: 'open-day' | 'sincerity-sale',
): ProcessTransitionView {
  const currentMilestone = findCurrentMilestone(run);
  return {
    processType,
    processId: processIdForProductRun(run),
    legacySource: 'legacy-product-run',
    legacySourceId: run.id,
    status: run.status,
    currentStepId: run.nextMilestone === 'completed' ? null : run.nextMilestone,
    currentStepTitle: currentMilestone?.title,
    nextTransitionOwner: 'runtime-process-manager',
    managerCanMutateNow: run.status === 'running',
    pendingTransition: run.status === 'running'
      ? 'runtime ProductRunProcessManager owns milestone movement'
      : undefined,
  };
}

export function mapLegacyProductRunToProcessReadModel(
  run: ProductRun,
): OpenDayProcessRunReadModel | SinceritySaleProcessRunReadModel | null {
  if (run.productType !== 'open-day' && run.productType !== 'sincere-sale') {
    return null;
  }

  const processType = run.productType === 'open-day' ? 'open-day' : 'sincerity-sale';
  const base = {
    processType,
    processId: processIdForProductRun(run),
    legacyProductRunId: run.id,
    legacyProductType: run.productType,
    lifecycleSource: 'legacy-product-run' as const,
    lifecycleOwner: 'legacy-product-run' as const,
    scope: run.scope,
    status: run.status,
    startDay: run.startDay,
    endDay: run.endDay,
    targetCaseIds: [...run.targetIds],
    nextMilestone: run.nextMilestone,
    linkedEventIds: [...(run.linkedEventIds || [])],
    milestones: (run.milestones || []).map((milestone) => ({ ...milestone })),
    transitionView: buildProductRunTransitionView(run, processType),
  };

  return processType === 'open-day'
    ? (base as OpenDayProcessRunReadModel)
    : (base as SinceritySaleProcessRunReadModel);
}

export function mapPendingClosingOpportunityToNegotiationProcess(
  opportunity: Opportunity,
): NegotiationProcessReadModel | null {
  if (!opportunity.pendingClosingEvaluation) {
    return null;
  }

  const processId = `negotiation:${opportunity.id}`;
  return {
    processType: 'negotiation',
    processId,
    sourceOpportunityId: opportunity.id,
    lifecycleSource: 'legacy-opportunity-pending-closing',
    lifecycleOwner: 'legacy-opportunity-pending-closing',
    caseId: opportunity.caseId,
    customerId: opportunity.customerId,
    customerName: opportunity.customerName,
    status: opportunity.status,
    stageIndex: opportunity.stageIndex,
    stageLabel: opportunity.stageLabel,
    intent: opportunity.intent,
    confidence: opportunity.confidence,
    daysLeft: opportunity.daysLeft,
    pendingClosingEvaluation: true,
    pendingClosingStrategyId: opportunity.pendingClosingStrategyId,
    pendingClosingRequestedDay: opportunity.pendingClosingRequestedDay,
    transitionView: {
      processType: 'negotiation',
      processId,
      legacySource: 'legacy-opportunity-pending-closing',
      legacySourceId: opportunity.id,
      status: opportunity.status,
      currentStepId: 'pending-closing-evaluation',
      currentStepTitle: '等待成交结算',
      nextTransitionOwner: 'legacy-opportunity-pending-closing',
      managerCanMutateNow: false,
      pendingTransition: 'runtime NegotiationProcessManager owns settlement entry; legacy deal closing owns close/fail/capacity outcome',
    },
  };
}

export function deriveProcessRunReadModelsFromLegacyState(state: Readonly<GameState>): ProcessRunReadModel[] {
  const productRunProcesses = (state.productRuns || [])
    .map(mapLegacyProductRunToProcessReadModel)
    .filter((process): process is OpenDayProcessRunReadModel | SinceritySaleProcessRunReadModel => Boolean(process));

  const negotiationProcesses = (state.opportunities || [])
    .map(mapPendingClosingOpportunityToNegotiationProcess)
    .filter((process): process is NegotiationProcessReadModel => Boolean(process));

  return [...productRunProcesses, ...negotiationProcesses];
}

export function buildProcessManagerContractsFromLegacyState(
  state: Readonly<GameState>,
): ProcessManagerContract[] {
  const readModels = deriveProcessRunReadModelsFromLegacyState(state);
  const byType = new Map<ProcessManagerType, ProcessTransitionView[]>();
  readModels.forEach((process) => {
    byType.set(process.processType, [...(byType.get(process.processType) || []), process.transitionView]);
  });

  return [
    buildContract('open-day', 'legacy-product-run', byType.get('open-day') || []),
    buildContract('sincerity-sale', 'legacy-product-run', byType.get('sincerity-sale') || []),
    buildContract('negotiation', 'legacy-opportunity-pending-closing', byType.get('negotiation') || []),
  ];
}

function buildContract(
  processType: ProcessManagerType,
  currentOwner: 'legacy-product-run' | 'legacy-opportunity-pending-closing',
  transitions: ProcessTransitionView[],
): ProcessManagerContract {
  return {
    processType,
    displayName: PROCESS_LABELS[processType],
    observes: [currentOwner],
    lifecycleOwnership: {
      currentOwner,
      futureOwner: 'runtime-process-manager',
      note: currentOwner === 'legacy-product-run'
        ? 'ProductRunProcessManager owns open-day and sincerity-sale transition mutation; product run outcome ownership remains legacy-backed.'
        : 'NegotiationProcessManager owns daily settlement entry orchestration; legacy deal closing still owns close/fail/capacity outcomes.',
    },
    reads: currentOwner === 'legacy-product-run'
      ? ['GameState.productRuns']
      : ['GameState.opportunities.pendingClosingEvaluation'],
    writes: currentOwner === 'legacy-product-run'
      ? [
        'GameState.productRuns.*.nextMilestone',
        'GameState.productRuns.*.status',
        'GameState.productRuns.*.endDay',
        'GameState.productRuns.*.linkedEventIds',
        'GameState.eventStore',
        'GameState.eventLog',
      ]
      : [],
    transitions,
  };
}
