/**
 * Customer Read Boundary — shared canonical read for broker-customer relation.
 *
 * R33: Single source of truth for reading broker-customer trust.
 * Consumers import from here, not local helpers.
 */

import type { BrokerCustomerRelation } from './brokerCustomerRelation.js';

export type CustomerTrustReadSource = 'relation' | 'legacy-customer-runtime-fallback' | 'old_save_compatibility';

export interface CustomerTrustReadResult {
  readonly trust: number;
  readonly familiarity: number;
  readonly influence: number;
  readonly relationSource: CustomerTrustReadSource;
  readonly relationId: string;
}

export interface CustomerTrustStateShape {
  readonly runtimeBrokerCustomerRelations?: readonly BrokerCustomerRelation[];
  readonly customerStates: readonly {
    readonly customerId: string;
    readonly advisorTrust?: number;
  }[];
}

/**
 * Read broker-customer trust from canonical state.
 * Priority: BrokerCustomerRelation > CustomerRuntimeState.advisorTrust > default fallback.
 */
export function readBrokerCustomerTrust(
  state: CustomerTrustStateShape,
  brokerId: string,
  customerId: string,
): CustomerTrustReadResult {
  const relations = state.runtimeBrokerCustomerRelations;
  if (relations) {
    const match = relations.find(
      (r) => r.brokerId === brokerId && r.customerId === customerId,
    );
    if (match) {
      return {
        trust: match.trust,
        familiarity: match.familiarity,
        influence: match.influence,
        relationSource: match.source === 'canonical' ? 'relation' : 'legacy-customer-runtime-fallback',
        relationId: match.relationId,
      };
    }
  }

  const customerState = state.customerStates.find(
    (cs) => cs.customerId === customerId,
  );
  if (customerState?.advisorTrust !== undefined) {
    return {
      trust: customerState.advisorTrust,
      familiarity: 20,
      influence: 30,
      relationSource: 'legacy-customer-runtime-fallback',
      relationId: `fallback:${brokerId}::${customerId}`,
    };
  }
  return {
    trust: 48,
    familiarity: 20,
    influence: 30,
    relationSource: 'old_save_compatibility',
    relationId: `fallback:${brokerId}::${customerId}`,
  };
}
