import type { CustomerCaseRuntime, CustomerRuntimeState, Opportunity } from '../../../domain/models.js';
import type { LegacyEntityId, WorldEntityId } from '../models.js';

export type CustomerCaseOpportunityRelationSource = 'opportunity' | 'customer-runtime' | 'merged';

export interface CustomerCaseOpportunityRelationConflictFlags {
  stageIndex: boolean;
  intent: boolean;
  confidence: boolean;
}

export interface CustomerRuntimeCaseRelationMetadata {
  status: CustomerRuntimeState['status'];
  decisionStyle: CustomerRuntimeState['decisionStyle'];
  advisorTrust: number;
  fatigue: number;
  churnRisk: number;
  active: boolean;
  interactions: number;
  lastActiveDay: number;
  viewed: boolean;
  offered: boolean;
  selected: boolean;
  competingAssetCaseIds: readonly WorldEntityId[];
}

export interface LegacyOpportunityRelationMetadata {
  status: Opportunity['status'];
  lifecycleStatus: Opportunity['lifecycleStatus'];
  leadSource: Opportunity['leadSource'];
  visibility: Opportunity['visibility'];
  channelId: string;
  channelName: string;
  createdDay: number;
  daysLeft: number;
  touchedToday: boolean;
  stagnationTicks: number;
  brokerId?: WorldEntityId;
}

export interface CustomerCaseOpportunityRelationView {
  id: WorldEntityId;
  source: CustomerCaseOpportunityRelationSource;
  customerId: WorldEntityId;
  caseId: LegacyEntityId;
  assetCaseId: WorldEntityId;
  legacyOpportunityId?: LegacyEntityId;
  fit: number;
  intent: number;
  confidence: number;
  stageIndex: number;
  stageLabel: string;
  conflictFlags: CustomerCaseOpportunityRelationConflictFlags;
  legacyOpportunity?: LegacyOpportunityRelationMetadata;
  customerRuntime?: CustomerRuntimeCaseRelationMetadata;
}

export interface CustomerCaseOpportunityRelationBuildOptions {
  stageConflictTolerance?: number;
  intentConflictTolerance?: number;
  confidenceConflictTolerance?: number;
}

export type CustomerCaseRuntimeEntry = CustomerCaseRuntime;
