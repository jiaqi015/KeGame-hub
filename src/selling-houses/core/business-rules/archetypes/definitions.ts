import {
  OWNER_ARCHETYPE_SEEDS,
  CUSTOMER_ARCHETYPE_SEEDS,
  CHANNEL_ARCHETYPE_SEEDS,
  RIVAL_STORE_ARCHETYPE_SEEDS,
  RIVAL_LISTING_ARCHETYPE_SEEDS,
} from './archetypeSeeds.js';
import type {
  BrokerNetworkBusinessArchetypeDefinition,
  BusinessArchetypeDefinition,
  ChannelBusinessArchetypeDefinition,
  CustomerBusinessArchetypeDefinition,
  OwnerBusinessArchetypeDefinition,
  RivalListingBusinessArchetypeDefinition,
} from './types.js';
import { deepFreeze } from '../../util/deepFreeze.js';

function resolveCustomerDecisionStyle(activity: number, urgency: number): CustomerBusinessArchetypeDefinition['expectedDecisionStyle'] {
  if (urgency >= 80 || activity >= 80) return 'decisive';
  if (urgency <= 60 && activity <= 65) return 'hesitant';
  return 'balanced';
}

export const OWNER_ARCHETYPE_DEFINITIONS: readonly OwnerBusinessArchetypeDefinition[] = deepFreeze(OWNER_ARCHETYPE_SEEDS.map((entry) => ({
  ...entry,
  kind: 'owner',
  definitionRole: 'seller-expectation',
})));

export const CUSTOMER_ARCHETYPE_DEFINITIONS: readonly CustomerBusinessArchetypeDefinition[] = deepFreeze(CUSTOMER_ARCHETYPE_SEEDS.map((entry) => ({
  ...entry,
  kind: 'customer',
  definitionRole: 'buyer-demand',
  expectedDecisionStyle: resolveCustomerDecisionStyle(entry.activity, entry.urgency),
})));

export const CHANNEL_ARCHETYPE_DEFINITIONS: readonly ChannelBusinessArchetypeDefinition[] = deepFreeze(CHANNEL_ARCHETYPE_SEEDS.map((entry) => ({
  ...entry,
  kind: 'channel',
  definitionRole: 'lead-source',
})));

export const BROKER_NETWORK_ARCHETYPE_DEFINITIONS: readonly BrokerNetworkBusinessArchetypeDefinition[] = deepFreeze((
  RIVAL_STORE_ARCHETYPE_SEEDS || []
).map((entry) => ({
  ...entry,
  kind: 'broker-network',
  definitionRole: 'co-sell-or-competitive-broker',
})));

export const RIVAL_LISTING_ARCHETYPE_DEFINITIONS: readonly RivalListingBusinessArchetypeDefinition[] = deepFreeze((
  RIVAL_LISTING_ARCHETYPE_SEEDS || []
).map((entry) => ({
  ...entry,
  kind: 'rival-listing',
  definitionRole: 'competing-supply',
})));

export const BUSINESS_ARCHETYPE_DEFINITIONS: readonly BusinessArchetypeDefinition[] = deepFreeze([
  ...OWNER_ARCHETYPE_DEFINITIONS,
  ...CUSTOMER_ARCHETYPE_DEFINITIONS,
  ...CHANNEL_ARCHETYPE_DEFINITIONS,
  ...BROKER_NETWORK_ARCHETYPE_DEFINITIONS,
  ...RIVAL_LISTING_ARCHETYPE_DEFINITIONS,
]);

export const BUSINESS_ARCHETYPE_BY_ID: Readonly<Record<string, BusinessArchetypeDefinition>> = deepFreeze(
  Object.fromEntries(
    BUSINESS_ARCHETYPE_DEFINITIONS.map((entry) => [entry.id, entry]),
  ) as Record<string, BusinessArchetypeDefinition>,
);
