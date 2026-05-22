/**
 * knowledgeCompaction.ts — applies per-type compaction policies with causal integrity.
 *
 * Compaction rules by type:
 *
 *   perception:  max age 1 tick → expire immediately after next tick
 *                detail truncated on surviving entries (ephemeral data)
 *
 *   feedback:    max age 5 ticks → preserve summary but truncate detail
 *                entries within window survive but lose detail
 *
 *   decision:    no age limit → persist across ticks
 *                max 10 per case → oldest replaced when exceeded
 *                detail never truncated
 *
 *   reference:   never compacted, never expired
 *                detail never truncated
 *
 * Causal integrity:
 *   Entries that are referenced as causes by surviving entries are never removed,
 *   even if they would otherwise be expired by their type's age policy.
 *   This prevents dangling causal references that would break the evidence chain.
 */

import type { KnowledgeEntry, KnowledgeType, CompactionPolicy } from './knowledgeTypes.js';

// ══════════════════════════════════════════════════════════════════
// Compaction policies per knowledge type
// ══════════════════════════════════════════════════════════════════

/**
 * The four compaction policies, one per KnowledgeType.
 *
 * These are the single source of truth for compaction behavior.
 */
export const COMPACTION_POLICIES: Record<KnowledgeType, CompactionPolicy> = {
  perception: {
    maxTickAge: 1,
    truncateDetail: true,
  },
  feedback: {
    maxTickAge: 5,
    truncateDetail: true,
  },
  decision: {
    maxTickAge: undefined,   // never expire
    maxPerCase: 10,          // cap at 10 per case, oldest replaced
    truncateDetail: false,
  },
  reference: {
    maxTickAge: undefined,   // never expire
    maxPerCase: undefined,   // no limit
    truncateDetail: false,   // never truncate
  },
};

// ══════════════════════════════════════════════════════════════════
// compactKnowledgeByType — main compaction function
// ══════════════════════════════════════════════════════════════════

/**
 * Apply per-type compaction policies to a set of knowledge entries.
 *
 * Algorithm:
 *   1. Group entries by type
 *   2. For each type, apply the age policy (expire old entries)
 *   3. For decision type, apply per-case count limit (oldest replaced)
 *   4. Apply detail truncation for types that require it
 *   5. Preserve causal integrity: entries referenced as causes by surviving
 *      entries are never removed
 *
 * @param entries - The knowledge entries to compact
 * @param currentTickAge - The current tick age (used for age calculation)
 * @returns Compacted entries with causal integrity preserved
 */
export function compactKnowledgeByType(
  entries: readonly KnowledgeEntry[],
  currentTickAge: number,
): KnowledgeEntry[] {
  if (entries.length === 0) return [];

  // Step 1: Apply per-type age policies
  const surviving = applyAgePolicies(entries, currentTickAge);

  // Step 2: Apply per-case count limits (only decision type)
  const afterCountLimit = applyPerCaseLimits(surviving);

  // Step 3: Apply detail truncation
  const afterTruncation = applyDetailTruncation(afterCountLimit);

  // Step 4: Preserve causal integrity
  const withIntegrity = preserveCausalIntegrity(afterTruncation, entries);

  return withIntegrity;
}

// ── Step 1: Age-based expiration ─────────────────────────────────

function applyAgePolicies(
  entries: readonly KnowledgeEntry[],
  currentTickAge: number,
): KnowledgeEntry[] {
  return entries.filter((entry) => {
    const policy = COMPACTION_POLICIES[entry.type];
    if (policy.maxTickAge === undefined) return true; // never expire
    const age = currentTickAge - entry.tickAge;
    return age <= policy.maxTickAge;
  });
}

// ── Step 2: Per-case count limits ────────────────────────────────

function applyPerCaseLimits(entries: KnowledgeEntry[]): KnowledgeEntry[] {
  const result: KnowledgeEntry[] = [...entries];

  // Group decision entries by caseId
  const decisionsByCase = new Map<string, KnowledgeEntry[]>();
  for (const entry of result) {
    if (entry.type !== 'decision') continue;
    const arr = decisionsByCase.get(entry.caseId) ?? [];
    arr.push(entry);
    decisionsByCase.set(entry.caseId, arr);
  }

  // For each case with more than 10 decisions, remove the oldest
  const toRemove = new Set<string>();
  for (const [caseId, decisions] of decisionsByCase) {
    const policy = COMPACTION_POLICIES.decision;
    if (policy.maxPerCase === undefined) continue;
    if (decisions.length <= policy.maxPerCase) continue;

    // Sort by tickAge ascending (oldest first) and mark the oldest for removal
    const sorted = [...decisions].sort((a, b) => a.tickAge - b.tickAge);
    const excess = sorted.length - policy.maxPerCase;
    for (let i = 0; i < excess; i++) {
      toRemove.add(sorted[i].entryId);
    }
  }

  return result.filter((e) => !toRemove.has(e.entryId));
}

// ── Step 3: Detail truncation ────────────────────────────────────

function applyDetailTruncation(entries: KnowledgeEntry[]): KnowledgeEntry[] {
  return entries.map((entry) => {
    const policy = COMPACTION_POLICIES[entry.type];
    if (policy.truncateDetail && entry.detail.length > 0) {
      return { ...entry, detail: '' };
    }
    return entry;
  });
}

// ── Step 4: Causal integrity ─────────────────────────────────────

/**
 * Ensure entries referenced as causes by surviving entries are not removed.
 *
 * This works by:
 *   1. Collecting all entryIds in the surviving set
 *   2. For each surviving entry, checking its causeIds
 *   3. If a causeId refers to an entry that was removed (exists in original
 *      but not in surviving), adding it back
 *   4. Repeating until no more entries are added (fixpoint for transitive chains)
 *
 * The added-back entries get their detail truncated per their type policy.
 */
function preserveCausalIntegrity(
  surviving: KnowledgeEntry[],
  original: readonly KnowledgeEntry[],
): KnowledgeEntry[] {
  const survivingIds = new Set(surviving.map((e) => e.entryId));
  const originalById = new Map<string, KnowledgeEntry>();
  for (const entry of original) {
    originalById.set(entry.entryId, entry);
  }

  // Iteratively add back entries that are referenced as causes
  let changed = true;
  const result = [...surviving];

  while (changed) {
    changed = false;
    const currentIds = new Set(result.map((e) => e.entryId));

    for (const entry of result) {
      for (const causeId of entry.causeIds) {
        if (currentIds.has(causeId)) continue; // already present
        const causeEntry = originalById.get(causeId);
        if (!causeEntry) continue; // cause not in original set

        // Add back with detail truncation per its type policy
        const policy = COMPACTION_POLICIES[causeEntry.type];
        const restored: KnowledgeEntry = policy.truncateDetail && causeEntry.detail.length > 0
          ? { ...causeEntry, detail: '' }
          : causeEntry;

        result.push(restored);
        currentIds.add(causeId);
        changed = true;
      }
    }
  }

  return result;
}
