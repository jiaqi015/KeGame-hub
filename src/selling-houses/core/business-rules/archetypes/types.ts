import type {
  ChannelProfile,
  CustomerDecisionStyle,
  CustomerProfile,
  LeadSourceType,
  OwnerArchetype,
  RivalListingArchetype,
  RivalStoreArchetype,
} from './archetypeTaxonomy.js';

export type BusinessArchetypeKind = 'owner' | 'customer' | 'channel' | 'broker-network' | 'rival-listing';

export interface OwnerBusinessArchetypeDefinition extends OwnerArchetype {
  kind: 'owner';
  definitionRole: 'seller-expectation';
}

export interface CustomerBusinessArchetypeDefinition
  extends Pick<CustomerProfile, 'id' | 'name' | 'profile' | 'budgetMin' | 'budgetMax' | 'targetDistrict' | 'layouts' | 'activity' | 'urgency' | 'priceSensitivity' | 'preferences'> {
  kind: 'customer';
  definitionRole: 'buyer-demand';
  expectedDecisionStyle: CustomerDecisionStyle;
}

export interface ChannelBusinessArchetypeDefinition
  extends Pick<ChannelProfile, 'id' | 'name' | 'quality' | 'controllability'> {
  kind: 'channel';
  definitionRole: 'lead-source';
  leadSource?: LeadSourceType;
}

export interface BrokerNetworkBusinessArchetypeDefinition
  extends Pick<RivalStoreArchetype, 'id' | 'name' | 'type' | 'style' | 'districtFocus' | 'leadCapturePower' | 'sellerInfluencePower' | 'pricingPressurePower'> {
  kind: 'broker-network';
  definitionRole: 'co-sell-or-competitive-broker';
}

export interface RivalListingBusinessArchetypeDefinition
  extends Pick<RivalListingArchetype, 'id' | 'titlePrefix' | 'segment' | 'sourceBias' | 'baseHeat' | 'freshness' | 'storyStrength' | 'leadSiphonPower' | 'ownerAnchorPower'> {
  kind: 'rival-listing';
  definitionRole: 'competing-supply';
}

export type BusinessArchetypeDefinition =
  | OwnerBusinessArchetypeDefinition
  | CustomerBusinessArchetypeDefinition
  | ChannelBusinessArchetypeDefinition
  | BrokerNetworkBusinessArchetypeDefinition
  | RivalListingBusinessArchetypeDefinition;
