import type { LegacyEntityId, WorldEntityId } from '../models.js';

export type CustomerCaseOpportunityRelationSource = 'opportunity' | 'customer-runtime' | 'merged';

export interface CustomerCaseOpportunityRelationConflictFlags {
  readonly fit: boolean;
  readonly stageIndex: boolean;
  readonly intent: boolean;
  readonly confidence: boolean;
}

/**
 * Runtime case state is a mirror/signal source for interaction state and conflict detection.
 * It must not replace canonical Opportunity values on merged relations.
 * Plain shape — no domain import.
 */
export interface CustomerRuntimeCaseRelationMetadata {
  readonly status: string;
  readonly decisionStyle: string;
  readonly advisorTrust: number;
  readonly fatigue: number;
  readonly churnRisk: number;
  readonly active: boolean;
  readonly interactions: number;
  readonly lastActiveDay: number;
  readonly viewed: boolean;
  readonly offered: boolean;
  readonly selected: boolean;
  readonly competingAssetCaseIds: readonly WorldEntityId[];
}

/**
 * Metadata copied from the legacy Opportunity row that remains the canonical
 * customer-case relation source for read models.
 * Plain shape — no domain import.
 */
export interface CanonicalOpportunityRelationMetadata {
  readonly status: string;
  readonly lifecycleStatus: string;
  readonly leadSource: string;
  readonly visibility: string;
  readonly channelId: string;
  readonly channelName: string;
  readonly createdDay: number;
  readonly daysLeft: number;
  readonly touchedToday: boolean;
  readonly stagnationTicks: number;
  readonly brokerId?: WorldEntityId;
}

export type LegacyOpportunityRelationMetadata = CanonicalOpportunityRelationMetadata;

export interface CustomerCaseOpportunityRelationView {
  readonly id: WorldEntityId;
  readonly source: CustomerCaseOpportunityRelationSource;
  readonly customerId: WorldEntityId;
  readonly caseId: LegacyEntityId;
  readonly assetCaseId: WorldEntityId;
  readonly legacyOpportunityId?: LegacyEntityId;
  readonly fit: number;
  readonly intent: number;
  readonly confidence: number;
  readonly stageIndex: number;
  readonly stageLabel: string;
  readonly conflictFlags: CustomerCaseOpportunityRelationConflictFlags;
  readonly canonicalOpportunityMetadata?: CanonicalOpportunityRelationMetadata;
  /**
   * @deprecated Use canonicalOpportunityMetadata. Kept as a read-only compatibility alias.
   */
  readonly legacyOpportunity?: CanonicalOpportunityRelationMetadata;
  readonly customerRuntime?: CustomerRuntimeCaseRelationMetadata;
}

export interface CustomerCaseOpportunityRelationBuildOptions {
  fitConflictTolerance?: number;
  stageConflictTolerance?: number;
  intentConflictTolerance?: number;
  confidenceConflictTolerance?: number;
}

/**
 * Plain shape for CustomerCaseRuntime — no domain import.
 */
export interface CustomerCaseRuntimeEntry {
  readonly caseId: string;
  readonly fit: number;
  readonly interest: number;
  readonly confidence: number;
  readonly stageIndex: number;
  readonly interactions: number;
  readonly lastActiveDay: number;
  readonly viewed: boolean;
  readonly offered: boolean;
  readonly selected: boolean;
  readonly competingCaseIds?: readonly string[];
}
