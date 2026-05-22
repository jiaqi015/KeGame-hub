/**
 * knowledgeClassifier.ts — classifies knowledge entries by source kind.
 *
 * Classification rules (based on source kind and content nature):
 *
 *   perception  — market_signal, rival_action, comparable_transaction,
 *                 platform_traffic, supporting_facility_signal, micro_market_signal
 *   feedback    — owner_interview, customer_interaction, manager_message,
 *                 owner_life_event_signal, buyer_financing_signal, broker_capacity_signal
 *   decision    — player_action_receipt, process_receipt
 *   reference   — acn_network_signal
 *
 * Why these groupings:
 *
 *   perception:  These are observable market facts. They expire quickly because
 *                the next tick produces fresh readings. Keeping stale heat indices
 *                or old price data clutters the agent's working memory.
 *
 *   feedback:    These are interaction responses — what other actors said or did
 *                in response to the agent's actions or world events. They decay
 *                over a medium window because recent feedback is more actionable
 *                than old feedback, but the summary is still useful for a while.
 *
 *   decision:    These are the agent's own commitments and strategic choices.
 *                They persist because the agent needs to remember what they decided,
 *                but they're bounded per case to prevent unbounded accumulation.
 *
 *   reference:   These are permanent identifiers — which ACN, which case, which broker.
 *                They never expire because they provide the structural scaffolding
 *                for all other knowledge entries.
 */

import type { SourceKind } from '../../../../domain/world-model/informationSourceTypes.js';
import type { KnowledgeType } from './knowledgeTypes.js';

/**
 * Classify a knowledge entry by its source kind and content.
 *
 * The classification is deterministic: same sourceKind + content → same type.
 * Content is currently unused for classification but is included in the signature
 * for future content-based refinement (e.g., classifying a manager_message that
 * contains a strategic commitment as 'decision' instead of 'feedback').
 *
 * @param sourceKind - The SourceKind of the source record
 * @param content - The content/summary of the knowledge entry
 * @returns The KnowledgeType classification
 */
export function classifyKnowledge(sourceKind: SourceKind, _content: string): KnowledgeType {
  switch (sourceKind) {
    // perception: observable market facts that expire per-tick
    case 'market_signal':
    case 'rival_action':
    case 'comparable_transaction':
    case 'platform_traffic':
    case 'supporting_facility_signal':
    case 'micro_market_signal':
      return 'perception';

    // feedback: interaction responses that decay over medium windows
    case 'owner_interview':
    case 'customer_interaction':
    case 'manager_message':
    case 'owner_life_event_signal':
    case 'buyer_financing_signal':
    case 'broker_capacity_signal':
      return 'feedback';

    // decision: strategic choices that persist but are bounded per case
    case 'player_action_receipt':
    case 'process_receipt':
      return 'decision';

    // reference: permanent identifiers that are never compacted
    case 'acn_network_signal':
      return 'reference';

    // fallback: unknown source kinds treated as perception (safest default)
    default:
      return 'perception';
  }
}
