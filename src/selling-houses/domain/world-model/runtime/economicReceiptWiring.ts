/**
 * EconomicReceiptWiring — wires resource economy receipts into the runtime pipeline.
 *
 * This module ensures that resource changes (energy, budget, org credit,
 * customer attention, owner trust, rival competition) produce receipts that
 * flow through: source → causal → actor knowledge → decision → command → receipt → feedback → replay.
 *
 * Architecture position:
 *   clock.ts tick → computeDailyResourceSnapshot → generateEconomySourceRecords
 *     → sourceIngestionAdapter.ingestSourceRecords → causal events → worldCausalEvents
 *
 * Hard constraints:
 *   - Pure function: same input → same output (deterministic)
 *   - No direct mutation of case/opportunity/trust/patience fields
 *   - All resource changes are observable in worldCausalEvents
 *   - No Date.now / Math.random / fetch / LLM provider
 */

import type {
  InformationSourceRecord,
} from '../informationSourceTypes.js';

import type {
  BigWorldClockInput,
} from './types.js';

import type { WorldCausalEvent } from '../causalEvents.js';

import {
  computeDailyResourceSnapshot,
  generateEconomySourceRecords,
} from './marketEconomyRuntime.js';

// ── Resource Receipt ─────────────────────────────────────────────

/**
 * Receipt from the economy runtime tick.
 * Contains the resource snapshot and generated source records.
 */
export interface EconomyReceipt {
  readonly day: number;
  readonly snapshot: ReturnType<typeof computeDailyResourceSnapshot>;
  readonly sourceRecords: readonly InformationSourceRecord[];
  readonly replayKey: string;
}

/**
 * Generate economy receipts for a given day.
 * This is called from clock.ts during the daily tick.
 *
 * @param input - BigWorld clock input (read-only snapshot of game state)
 * @param day - Current simulation day
 * @param runSeed - Deterministic seed
 * @returns EconomyReceipt with resource snapshot and source records
 */
export function generateEconomyReceipt(
  input: BigWorldClockInput,
  day: number,
  runSeed: number,
): EconomyReceipt {
  const snapshot = computeDailyResourceSnapshot(input, day, runSeed);
  const sourceRecords = generateEconomySourceRecords(snapshot, input, runSeed);

  return {
    day,
    snapshot,
    sourceRecords,
    replayKey: `eco-${runSeed}-${day}-${sourceRecords.length}`,
  };
}

/**
 * Summary of resource dynamics for a given day.
 * Used for diagnostics and the gate script.
 */
export function summarizeResourceSnapshot(
  snapshot: ReturnType<typeof computeDailyResourceSnapshot>,
): string {
  const parts: string[] = [];
  parts.push(`energy: -${snapshot.playerEnergyConsumed}/+${snapshot.playerEnergyReplenished}`);
  parts.push(`budget: -${snapshot.promotionBudgetConsumed}/+${snapshot.promotionBudgetAllocated}`);
  parts.push(`org: +${snapshot.orgCreditEarned}/-${snapshot.orgCreditSpent}`);
  parts.push(`attention: +${snapshot.customerAttentionGained}/-${snapshot.customerAttentionLost}/m${snapshot.customerAttentionMigrated}`);
  parts.push(`trust: ${snapshot.ownerTrustNet > 0 ? '+' : ''}${snapshot.ownerTrustNet}`);
  parts.push(`patience: ${snapshot.ownerPatienceNet > 0 ? '+' : ''}${snapshot.ownerPatienceNet}`);
  parts.push(`rivals: ${snapshot.rivalActionsToday} actions, ${snapshot.rivalResourceCompeted} competed`);
  return parts.join(' | ');
}
