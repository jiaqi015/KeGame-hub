import type { ProductType } from '../../world-state/productTypes.js';
import type { DecisionMomentId } from '../decision-moments/types.js';

export type BusinessFlowId =
  | 'standard-selling'
  | 'open-day'
  | 'sincerity-sale'
  | 'team-listing-co-sell';

export type BusinessFlowScope = 'listing' | 'community' | 'team';

export interface BusinessFlowStepDefinition {
  id: string;
  name: string;
  summary: string;
  actionIds: string[];
  decisionMomentIds?: DecisionMomentId[];
}

export interface BusinessFlowDefinition {
  id: BusinessFlowId;
  name: string;
  summary: string;
  scope: BusinessFlowScope;
  productType?: ProductType;
  entryActionIds: string[];
  steps: BusinessFlowStepDefinition[];
}
