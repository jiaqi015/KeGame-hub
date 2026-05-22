import type { ActionMetricKey } from '../action-specs/actionTaxonomy.js';

export type DecisionMomentId =
  | 'first-visit-owner-discovery'
  | 'pricing-strategy-adjustment'
  | 'open-day-participation'
  | 'sincerity-sale-entry'
  | 'offer-acceptance-negotiation';

export type DecisionMomentActor = 'owner' | 'customer' | 'advisor' | 'market' | 'broker';

export interface DecisionMomentDefinition {
  id: DecisionMomentId;
  name: string;
  summary: string;
  primaryActors: DecisionMomentActor[];
  triggerActionIds: string[];
  expectedSignals: ActionMetricKey[];
  downstreamFlowIds: string[];
}
