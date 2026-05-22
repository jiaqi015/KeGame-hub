/**
 * knowledgeTypes.ts — Type definitions for typed agent knowledge categories.
 *
 * The knowledge memory system classifies every knowledge entry into one of four
 * types, each with distinct compaction semantics:
 *
 *   perception  — market signals, price data, heat indices (ephemeral, per-tick)
 *   feedback    — owner reactions, customer responses, manager messages (medium retention)
 *   decision    — strategy choices, commitment decisions (persistent but bounded per case)
 *   reference   — ACN references, case IDs, broker IDs (permanent, never compacted)
 */

import type { SourceKind } from '../sourceKinds.js';

// ══════════════════════════════════════════════════════════════════
// KnowledgeType — the four knowledge categories
// ══════════════════════════════════════════════════════════════════

/**
 * The four knowledge types with distinct compaction semantics.
 *
 * - perception:  market data that expires per-tick; aggressive truncation
 * - feedback:    interaction responses that decay over medium windows
 * - decision:    strategic choices that persist but are bounded per case
 * - reference:   permanent identifiers that are never compacted
 */
export type KnowledgeType = 'perception' | 'feedback' | 'decision' | 'reference';

// ══════════════════════════════════════════════════════════════════
// KnowledgeEntry — a single typed knowledge record
// ══════════════════════════════════════════════════════════════════

/**
 * KnowledgeEntry represents a single piece of knowledge in the agent's memory,
 * classified by type with compaction-relevant metadata.
 */
export interface KnowledgeEntry {
  /** Unique entry ID. */
  readonly entryId: string;
  /** Knowledge type (determines compaction policy). */
  readonly type: KnowledgeType;
  /** Source that produced this knowledge. */
  readonly source: {
    readonly sourceKind: SourceKind;
    readonly subtype: string;
  };
  /** Content summary (always preserved, never truncated). */
  readonly content: string;
  /** Detail field (may be truncated by compaction). */
  readonly detail: string;
  /** Tick when this entry was created (used for age calculation). */
  readonly tickAge: number;
  /** Case ID this entry belongs to (used for per-case decision limits). */
  readonly caseId: string;
  /** IDs of entries that caused this entry (causal chain). */
  readonly causeIds: readonly string[];
}

// ══════════════════════════════════════════════════════════════════
// CompactionPolicy — per-type compaction rules
// ══════════════════════════════════════════════════════════════════

/**
 * Compaction policy for a specific knowledge type.
 *
 * - maxTickAge: if set, entries older than this (in ticks) are expired
 * - maxPerCase: if set, only the newest N entries per case are kept
 * - truncateDetail: if true, detail field is cleared during compaction
 */
export interface CompactionPolicy {
  /** Max age in ticks before expiration. undefined = never expire. */
  readonly maxTickAge?: number;
  /** Max entries per case. undefined = no limit. */
  readonly maxPerCase?: number;
  /** Whether to truncate the detail field during compaction. */
  readonly truncateDetail: boolean;
}
