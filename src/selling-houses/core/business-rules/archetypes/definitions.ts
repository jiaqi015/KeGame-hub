import { BUILT_IN_WORLD } from '../../../domain/worlds/builtinWorld.js';
import type {
  BrokerNetworkBusinessArchetypeDefinition,
  BusinessArchetypeDefinition,
  ChannelBusinessArchetypeDefinition,
  CustomerBusinessArchetypeDefinition,
  OwnerBusinessArchetypeDefinition,
  RivalListingBusinessArchetypeDefinition,
} from './types.js';

function resolveCustomerDecisionStyle(activity: number, urgency: number): CustomerBusinessArchetypeDefinition['expectedDecisionStyle'] {
  if (urgency >= 80 || activity >= 80) return 'decisive';
  if (urgency <= 60 && activity <= 65) return 'hesitant';
  return 'balanced';
}

export const OWNER_ARCHETYPE_DEFINITIONS: OwnerBusinessArchetypeDefinition[] = BUILT_IN_WORLD.ownerArchetypes.map((entry) => ({
  ...entry,
  kind: 'owner',
  definitionRole: 'seller-expectation',
}));

export const CUSTOMER_ARCHETYPE_DEFINITIONS: CustomerBusinessArchetypeDefinition[] = BUILT_IN_WORLD.customers.map((entry) => ({
  ...entry,
  kind: 'customer',
  definitionRole: 'buyer-demand',
  expectedDecisionStyle: resolveCustomerDecisionStyle(entry.activity, entry.urgency),
}));

export const CHANNEL_ARCHETYPE_DEFINITIONS: ChannelBusinessArchetypeDefinition[] = BUILT_IN_WORLD.channels.map((entry) => ({
  ...entry,
  kind: 'channel',
  definitionRole: 'lead-source',
}));

export const BROKER_NETWORK_ARCHETYPE_DEFINITIONS: BrokerNetworkBusinessArchetypeDefinition[] = (
  BUILT_IN_WORLD.rivalStoreArchetypes || []
).map((entry) => ({
  ...entry,
  kind: 'broker-network',
  definitionRole: 'co-sell-or-competitive-broker',
}));

export const RIVAL_LISTING_ARCHETYPE_DEFINITIONS: RivalListingBusinessArchetypeDefinition[] = (
  BUILT_IN_WORLD.rivalListingArchetypes || []
).map((entry) => ({
  ...entry,
  kind: 'rival-listing',
  definitionRole: 'competing-supply',
}));

export const BUSINESS_ARCHETYPE_DEFINITIONS: BusinessArchetypeDefinition[] = [
  ...OWNER_ARCHETYPE_DEFINITIONS,
  ...CUSTOMER_ARCHETYPE_DEFINITIONS,
  ...CHANNEL_ARCHETYPE_DEFINITIONS,
  ...BROKER_NETWORK_ARCHETYPE_DEFINITIONS,
  ...RIVAL_LISTING_ARCHETYPE_DEFINITIONS,
];

export const BUSINESS_ARCHETYPE_BY_ID = Object.fromEntries(
  BUSINESS_ARCHETYPE_DEFINITIONS.map((entry) => [entry.id, entry]),
) as Record<string, BusinessArchetypeDefinition>;
