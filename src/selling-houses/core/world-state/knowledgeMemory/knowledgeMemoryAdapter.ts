/**
 * knowledgeMemoryAdapter.ts — bridges typed KnowledgeEntry to existing AgentMemoryFact.
 *
 * This adapter provides a one-way conversion from the new typed knowledge system
 * to the existing AgentMemoryFact structure, enabling incremental adoption without
 * breaking existing consumers.
 *
 * The adapter does NOT replace AgentMemoryFact. It augments it:
 *   - classifyKnowledge() assigns a KnowledgeType to each source kind
 *   - compactKnowledgeByType() applies type-aware compaction
 *   - toAgentMemoryFacts() converts the result back to AgentMemoryFact[]
 *
 * Integration path:
 *   1. When building AgentMemoryFact entries from InformationSourceRecords,
 *      use classifyKnowledge() to assign the type
 *   2. Before persisting the memory store, apply compactKnowledgeByType()
 *   3. Convert back to AgentMemoryFact[] via toAgentMemoryFacts()
 *
 * The adapter preserves causal integrity through causeIds → sourceRef mapping.
 */

import type { AgentMemoryFact } from '../agents/models.js';
import type { KnowledgeEntry, KnowledgeType } from './knowledgeTypes.js';
import { isSourceKind, type SourceKind } from '../sourceKinds.js';

import { classifyKnowledge } from './knowledgeClassifier.js';
import { compactKnowledgeByType } from './knowledgeCompaction.js';

// ══════════════════════════════════════════════════════════════════
// KnowledgeEntry → AgentMemoryFact conversion
// ══════════════════════════════════════════════════════════════════

/**
 * Convert a KnowledgeEntry to an AgentMemoryFact.
 *
 * Mapping:
 *   entryId    → factId
 *   caseId     → scope.caseId
 *   content    → summary
 *   type       → kind (prefixed with 'knowledge:' for namespace separation)
 *   tickAge    → createdAtDay
 *   detail     → (encoded in sourceRef if non-empty)
 *   causeIds   → sourceRef.refId (first cause only, bounded)
 */
export function toAgentMemoryFact(entry: KnowledgeEntry): AgentMemoryFact {
  return {
    factId: entry.entryId,
    agentId: '', // filled by the caller from context
    kind: `knowledge:${entry.type}`,
    summary: entry.content,
    strength: deriveStrengthFromType(entry.type),
    scope: {
      caseId: entry.caseId,
    },
    createdAtDay: entry.tickAge,
    sourceRef: entry.causeIds.length > 0
      ? { refType: 'cause', refId: entry.causeIds[0] }
      : undefined,
  };
}

/**
 * Convert an array of KnowledgeEntry to AgentMemoryFact[].
 */
export function toAgentMemoryFacts(entries: readonly KnowledgeEntry[]): AgentMemoryFact[] {
  return entries.map(toAgentMemoryFact);
}

// ══════════════════════════════════════════════════════════════════
// AgentMemoryFact → KnowledgeEntry conversion (for migration)
// ══════════════════════════════════════════════════════════════════

/**
 * Attempt to convert an AgentMemoryFact back to a KnowledgeEntry.
 *
 * This is used for migrating existing memory stores to the typed system.
 * If the fact's kind starts with 'knowledge:', the type is extracted.
 * Otherwise, the fact is classified using its sourceRef or kind as a hint.
 *
 * Returns null if the fact cannot be meaningfully converted.
 */
export function fromAgentMemoryFact(
  fact: AgentMemoryFact,
  sourceKind?: SourceKind,
): KnowledgeEntry | null {
  // Extract type from kind prefix if available
  let type: KnowledgeType | undefined;
  if (fact.kind.startsWith('knowledge:')) {
    const extracted = fact.kind.replace('knowledge:', '');
    if (['perception', 'feedback', 'decision', 'reference'].includes(extracted)) {
      type = extracted as KnowledgeType;
    }
  }

  // Fall back to classification by source kind
  if (!type && sourceKind) {
    type = classifyKnowledge(sourceKind, fact.summary);
  }

  // Default to perception if we can't determine the type
  if (!type) {
    type = 'perception';
  }

  return {
    entryId: fact.factId,
    type,
    source: {
      sourceKind: isSourceKind(sourceKind) ? sourceKind : 'market_signal',
      subtype: fact.kind,
    },
    content: fact.summary,
    detail: '',
    tickAge: fact.createdAtDay ?? 0,
    caseId: fact.scope?.caseId ?? '',
    causeIds: fact.sourceRef ? [fact.sourceRef.refId] : [],
  };
}

/**
 * Convert an array of AgentMemoryFact to KnowledgeEntry[].
 * Facts that cannot be converted are skipped.
 */
export function fromAgentMemoryFacts(
  facts: readonly AgentMemoryFact[],
  sourceKindMap?: ReadonlyMap<string, SourceKind>,
): KnowledgeEntry[] {
  return facts
    .map((fact) => fromAgentMemoryFact(fact, sourceKindMap?.get(fact.factId)))
    .filter((entry): entry is KnowledgeEntry => entry !== null);
}

// ══════════════════════════════════════════════════════════════════
// Convenience: compact existing AgentMemoryFact[] with typed policies
// ══════════════════════════════════════════════════════════════════

/**
 * Apply typed compaction to an AgentMemoryFact array.
 *
 * This is the main integration point: existing code can call this function
 * to get the benefit of type-aware compaction without changing the memory
 * store structure.
 *
 * Steps:
 *   1. Convert AgentMemoryFact[] → KnowledgeEntry[] (with type classification)
 *   2. Apply compactKnowledgeByType()
 *   3. Convert back to AgentMemoryFact[]
 *
 * @param facts - The existing AgentMemoryFact array
 * @param currentTickAge - The current tick age for age-based expiration
 * @param sourceKindMap - Optional mapping from factId to SourceKind for classification
 * @returns Compacted AgentMemoryFact array
 */
export function compactAgentMemoryFacts(
  facts: readonly AgentMemoryFact[],
  currentTickAge: number,
  sourceKindMap?: ReadonlyMap<string, SourceKind>,
): AgentMemoryFact[] {
  const entries = fromAgentMemoryFacts(facts, sourceKindMap);
  const compacted = compactKnowledgeByType(entries, currentTickAge);
  return toAgentMemoryFacts(compacted);
}

// ══════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════

/**
 * Derive default strength from knowledge type.
 *
 * perception:  lower (ephemeral, may be stale)
 * feedback:    medium (decaying but still relevant)
 * decision:    high (persistent commitment)
 * reference:   highest (permanent structural fact)
 */
function deriveStrengthFromType(type: KnowledgeType): number {
  switch (type) {
    case 'perception': return 0.5;
    case 'feedback': return 0.7;
    case 'decision': return 0.9;
    case 'reference': return 1.0;
  }
}
