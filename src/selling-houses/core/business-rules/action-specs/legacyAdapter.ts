import { ACTIONS } from './actionDefinitions.js';
import type { ActionSpecDefinition } from './types.js';

const ACTION_SPEC_RELATIONSHIPS: Record<string, Pick<ActionSpecDefinition, 'decisionMomentIds' | 'businessFlowIds'>> = {
  'first-visit': {
    decisionMomentIds: ['first-visit-owner-discovery'],
    businessFlowIds: ['standard-selling'],
  },
  'weekly-feedback': {
    decisionMomentIds: [],
    businessFlowIds: ['standard-selling', 'open-day', 'sincerity-sale', 'team-listing-co-sell'],
  },
  'deep-diagnosis': {
    decisionMomentIds: [],
    businessFlowIds: ['standard-selling', 'team-listing-co-sell'],
  },
  story: {
    decisionMomentIds: [],
    businessFlowIds: ['standard-selling'],
  },
  'xiaohongshu-boost': {
    decisionMomentIds: [],
    businessFlowIds: ['standard-selling', 'open-day'],
  },
  'broker-broadcast': {
    decisionMomentIds: [],
    businessFlowIds: ['standard-selling', 'open-day', 'team-listing-co-sell'],
  },
  'private-referral': {
    decisionMomentIds: [],
    businessFlowIds: ['standard-selling', 'open-day'],
  },
  'focus-meeting-submit': {
    decisionMomentIds: [],
    businessFlowIds: ['team-listing-co-sell'],
  },
  'open-day': {
    decisionMomentIds: ['open-day-participation'],
    businessFlowIds: ['open-day'],
  },
  showing: {
    decisionMomentIds: [],
    businessFlowIds: ['standard-selling', 'open-day'],
  },
  'pricing-advice': {
    decisionMomentIds: ['pricing-strategy-adjustment'],
    businessFlowIds: ['standard-selling', 'open-day', 'sincerity-sale', 'team-listing-co-sell'],
  },
  'ask-psychological-price': {
    decisionMomentIds: ['pricing-strategy-adjustment'],
    businessFlowIds: ['standard-selling', 'sincerity-sale'],
  },
  'adjust-listing-price': {
    decisionMomentIds: ['pricing-strategy-adjustment'],
    businessFlowIds: ['standard-selling', 'sincerity-sale'],
  },
  'sincerity-sale': {
    decisionMomentIds: ['sincerity-sale-entry'],
    businessFlowIds: ['sincerity-sale'],
  },
  'invite-customer-negotiation': {
    decisionMomentIds: ['offer-acceptance-negotiation'],
    businessFlowIds: ['standard-selling', 'sincerity-sale', 'open-day'],
  },
};

export const ACTION_SPECS: ActionSpecDefinition[] = ACTIONS.map((action) => {
  const relationships = ACTION_SPEC_RELATIONSHIPS[action.id] || {
    decisionMomentIds: [],
    businessFlowIds: [],
  };

  return {
    id: action.id,
    legacyActionId: action.id,
    executorId: action.executorId || action.id,
    categoryId: action.categoryId,
    name: action.name,
    summary: action.summary,
    templateId: action.templateId,
    executionMode: action.type === 'scenario' ? 'scenario' : 'direct',
    durationHours: action.durationHours,
    costEnergy: action.costEnergy,
    costPromotionBudget: action.costPromotionBudget,
    metricFocus: action.metricFocus ? [...action.metricFocus] : [],
    decisionMomentIds: relationships.decisionMomentIds,
    businessFlowIds: relationships.businessFlowIds,
  };
});

export const ACTION_SPEC_BY_ID = Object.fromEntries(
  ACTION_SPECS.map((spec) => [spec.id, spec]),
) as Record<string, ActionSpecDefinition>;
