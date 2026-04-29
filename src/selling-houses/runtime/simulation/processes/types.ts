import type {
  Opportunity,
  ProductRunMilestone,
  ProductRunScope,
  ProductRunStatus,
  ProductType,
} from '../../../domain/models';

export type ProcessManagerType = 'open-day' | 'sincerity-sale' | 'negotiation';

export type ProcessLifecycleSource =
  | 'legacy-product-run'
  | 'legacy-opportunity-pending-closing';

export type ProcessLifecycleOwner =
  | ProcessLifecycleSource
  | 'runtime-process-manager';

export type ProcessTransitionOwnership = {
  currentOwner: ProcessLifecycleSource;
  futureOwner: 'runtime-process-manager';
  note: string;
};

export type ProcessManagerContract = {
  processType: ProcessManagerType;
  displayName: string;
  observes: readonly ProcessLifecycleSource[];
  lifecycleOwnership: ProcessTransitionOwnership;
  reads: readonly string[];
  writes: readonly [];
  transitions: readonly ProcessTransitionView[];
};

export type ProcessTransitionView = {
  processType: ProcessManagerType;
  processId: string;
  legacySource: ProcessLifecycleSource;
  legacySourceId: string;
  status: ProductRunStatus | Opportunity['status'];
  currentStepId: string | null;
  currentStepTitle?: string;
  nextTransitionOwner: ProcessLifecycleOwner;
  managerCanMutateNow: false;
  pendingTransition?: string;
};

export type ProductRunProcessReadModel = {
  processType: 'open-day' | 'sincerity-sale';
  processId: string;
  legacyProductRunId: string;
  legacyProductType: ProductType;
  lifecycleSource: 'legacy-product-run';
  lifecycleOwner: 'legacy-product-run';
  scope: ProductRunScope;
  status: ProductRunStatus;
  startDay: number;
  endDay?: number;
  targetCaseIds: readonly string[];
  nextMilestone: string;
  linkedEventIds: readonly string[];
  milestones: readonly ProductRunMilestone[];
  transitionView: ProcessTransitionView;
};

export type OpenDayProcessRunReadModel = ProductRunProcessReadModel & {
  processType: 'open-day';
  legacyProductType: 'open-day';
};

export type SinceritySaleProcessRunReadModel = ProductRunProcessReadModel & {
  processType: 'sincerity-sale';
  legacyProductType: 'sincere-sale';
};

export type NegotiationProcessReadModel = {
  processType: 'negotiation';
  processId: string;
  sourceOpportunityId: string;
  lifecycleSource: 'legacy-opportunity-pending-closing';
  lifecycleOwner: 'legacy-opportunity-pending-closing';
  caseId: string;
  customerId: string;
  customerName: string;
  status: Opportunity['status'];
  stageIndex: number;
  stageLabel: string;
  intent: number;
  confidence: number;
  daysLeft: number;
  pendingClosingEvaluation: true;
  pendingClosingStrategyId?: string;
  pendingClosingRequestedDay?: number;
  transitionView: ProcessTransitionView;
};

export type ProcessRunReadModel =
  | OpenDayProcessRunReadModel
  | SinceritySaleProcessRunReadModel
  | NegotiationProcessReadModel;

