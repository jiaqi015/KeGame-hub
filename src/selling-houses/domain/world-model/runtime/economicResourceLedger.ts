/**
 * EconomicResourceLedger — resource balance ledger for the market economy.
 *
 * Records openingBalance / delta / closingBalance for each resource dimension,
 * per entity, per day. Every entry is traceable through:
 *   sourceRecordId → causalEventId → receiptId → replayKey
 *
 * Architecture position:
 *   bootstrap (opening balances)
 *     → daily source records (deltas from isr-eco-*)
 *       → causal events (worldCausalEvents with sourceKind)
 *         → receipts (EconomyReceipt)
 *           → ledger entries (this module)
 *             → next day opening balances
 *
 * Resource dimensions:
 *   energy          — broker physical energy
 *   promotionBudget — spendable promotion currency
 *   orgCredit       — organizational credit for focus meetings / manager support
 *   customerAttention — per-customer attention budget
 *   ownerTrust      — broker-owner trust level
 *   ownerPatience   — owner patience with selling process
 *   rivalPressure   — competitive pressure from rival actions
 *
 * Hard constraints:
 *   - Pure functions: same input → same output (deterministic)
 *   - No Date.now / Math.random / fetch / LLM
 *   - No direct mutation of case/opportunity/trust/patience fields
 *   - Every ledger entry must be traceable to source/causal/receipt
 *   - Same seed + same source records + same receipts → same ledger
 */

import type {
  InformationSourceRecord,
} from '../informationSourceTypes.js';

import type { WorldCausalEvent } from '../causalEvents.js';

import type { EconomyReceipt } from './economicReceiptWiring.js';

import type { DailyResourceSnapshot } from './marketEconomyRuntime.js';

// ════════════════════════════════════════════════════════════════════════════
// Resource Dimension — the 7 trackable resource types
// ════════════════════════════════════════════════════════════════════════════

export type ResourceDimension =
  | 'energy'
  | 'promotionBudget'
  | 'orgCredit'
  | 'customerAttention'
  | 'ownerTrust'
  | 'ownerPatience'
  | 'rivalPressure';

export const ALL_RESOURCE_DIMENSIONS: readonly ResourceDimension[] = [
  'energy',
  'promotionBudget',
  'orgCredit',
  'customerAttention',
  'ownerTrust',
  'ownerPatience',
  'rivalPressure',
];

// ════════════════════════════════════════════════════════════════════════════
// Resource Balance Entry — one change to one resource dimension
// ════════════════════════════════════════════════════════════════════════════

/**
 * A single resource balance change entry.
 *
 * Records the opening balance, the delta (change), and the closing balance
 * for one resource dimension of one entity on one day.
 *
 * Every entry is fully traceable through the causal chain.
 */
export interface ResourceBalanceEntry {
  /** Deterministic ID: `rbe-{entityId}-{dimension}-{day}-{seq}`. */
  readonly entryId: string;
  /** Entity this balance belongs to (broker ID, case ID, customer ID, etc.). */
  readonly entityId: string;
  /** Entity type for categorization. */
  readonly entityType: 'broker' | 'listing' | 'customer' | 'org' | 'owner' | 'player';
  /** Which resource dimension this entry tracks. */
  readonly dimension: ResourceDimension;
  /** Simulation day. */
  readonly day: number;

  // --- Balance ---
  /** Opening balance (start of day). */
  readonly openingBalance: number;
  /** Delta (change during the day). Positive = gained, negative = consumed. */
  readonly delta: number;
  /** Closing balance (end of day). = openingBalance + delta, clamped to [0, max]. */
  readonly closingBalance: number;
  /** Maximum capacity for this resource (0 = no cap). */
  readonly maxValue: number;

  // --- Traceability ---
  /** Source record that caused this change (from isr-eco-* pipeline). */
  readonly sourceRecordId: string | null;
  /** Causal event that resulted from the source record ingestion. */
  readonly causalEventId: string | null;
  /** Receipt that captured this resource change. */
  readonly receiptId: string | null;
  /** Deterministic replay key. */
  readonly replayKey: string;

  // --- Explanation ---
  /** Human-readable reason for this change. */
  readonly reason: string;
  /** Source kind that triggered this change. */
  readonly sourceKind: string | null;
}

// ════════════════════════════════════════════════════════════════════════════
// Entity Resource Daily Balance — all dimensions for one entity on one day
// ════════════════════════════════════════════════════════════════════════════

/**
 * All resource balance entries for one entity on one day.
 */
export interface EntityResourceDailyBalance {
  /** Entity ID. */
  readonly entityId: string;
  /** Entity type. */
  readonly entityType: 'broker' | 'listing' | 'customer' | 'org' | 'owner' | 'player';
  /** Simulation day. */
  readonly day: number;
  /** Balance entries for each resource dimension. */
  readonly entries: readonly ResourceBalanceEntry[];
  /** Replay key for this entity-day combination. */
  readonly replayKey: string;
}

// ════════════════════════════════════════════════════════════════════════════
// Economic Resource Ledger — the complete ledger
// ════════════════════════════════════════════════════════════════════════════

/**
 * The complete economic resource ledger.
 *
 * Contains all daily balances for all entities across the simulation.
 * Deterministic: same seed + same source records + same receipts → same ledger.
 */
export interface EconomicResourceLedger {
  /** All daily entity balances, ordered by day then entityId. */
  readonly dailyBalances: readonly EntityResourceDailyBalance[];
  /** Total number of balance entries across all days and entities. */
  readonly totalEntries: number;
  /** Number of distinct entities tracked. */
  readonly distinctEntityCount: number;
  /** Number of distinct days tracked. */
  readonly distinctDayCount: number;
  /** Replay key for the entire ledger. */
  readonly replayKey: string;

  // --- Indexed access ---
  /** Balance entries indexed by entityId. */
  readonly byEntityId: ReadonlyMap<string, readonly ResourceBalanceEntry[]>;
  /** Balance entries indexed by day. */
  readonly byDay: ReadonlyMap<number, readonly ResourceBalanceEntry[]>;
  /** Balance entries indexed by dimension. */
  readonly byDimension: ReadonlyMap<ResourceDimension, readonly ResourceBalanceEntry[]>;
  /** Balance entries indexed by (entityId, dimension). */
  readonly byEntityDimension: ReadonlyMap<string, readonly ResourceBalanceEntry[]>;
}

// ════════════════════════════════════════════════════════════════════════════
// Opening Balance Map — carries forward from previous day
// ════════════════════════════════════════════════════════════════════════════

/**
 * Opening balance for one entity-dimension pair.
 * Used to carry forward closing balances from day N to day N+1.
 */
export interface OpeningBalanceEntry {
  readonly entityId: string;
  readonly entityType: 'broker' | 'listing' | 'customer' | 'org' | 'owner' | 'player';
  readonly dimension: ResourceDimension;
  readonly balance: number;
  readonly maxValue: number;
}

/**
 * Map from entity-dimension key to opening balance.
 * Key format: `{entityId}:{dimension}`
 */
export type OpeningBalanceMap = ReadonlyMap<string, OpeningBalanceEntry>;

// ════════════════════════════════════════════════════════════════════════════
// Deterministic Hash
// ════════════════════════════════════════════════════════════════════════════

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// ════════════════════════════════════════════════════════════════════════════
// Opening Balance Bootstrap — extract from MarketEconomyState pools
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build opening balance map from bootstrap economy pools.
 * This extracts the initial resource balances for all entities.
 *
 * @param brokerPools - broker resource pools from MarketEconomyState
 * @param listingPools - listing resource pools (for ownerTrust)
 * @param customerPools - customer resource pools (for attention)
 * @param orgPools - org resource pools (for orgCredit)
 * @param runSeed - deterministic seed
 * @returns OpeningBalanceMap for day 1
 */
export function buildOpeningBalanceMap(params: {
  readonly brokerPools: ReadonlyArray<{
    readonly brokerId: string;
    readonly energy: { readonly current: number; readonly max: number };
    readonly promotionBudget: { readonly current: number; readonly max: number };
    readonly orgCredit: { readonly current: number; readonly max: number };
    readonly customerAttention: { readonly current: number; readonly max: number };
  }>;
  readonly listingPools: ReadonlyArray<{
    readonly listingId: string;
    readonly ownerTrust: { readonly current: number; readonly max: number };
  }>;
  readonly customerPools: ReadonlyArray<{
    readonly customerId: string;
    readonly attentionBudget: { readonly current: number; readonly max: number };
  }>;
  readonly orgPools: ReadonlyArray<{
    readonly acnId: string;
    readonly promotionPool: { readonly current: number; readonly max: number };
  }>;
  readonly ownerCases: ReadonlyArray<{
    readonly caseId: string;
    readonly trust: number;
    readonly patience: number;
  }>;
  readonly rivalPressureByCell: ReadonlyMap<string, number>;
}): OpeningBalanceMap {
  const map = new Map<string, OpeningBalanceEntry>();

  // Broker resources
  for (const pool of params.brokerPools) {
    setEntry(map, pool.brokerId, 'broker', 'energy', pool.energy.current, pool.energy.max);
    setEntry(map, pool.brokerId, 'broker', 'promotionBudget', pool.promotionBudget.current, pool.promotionBudget.max);
    setEntry(map, pool.brokerId, 'broker', 'orgCredit', pool.orgCredit.current, pool.orgCredit.max);
    setEntry(map, pool.brokerId, 'broker', 'customerAttention', pool.customerAttention.current, pool.customerAttention.max);
  }

  // Listing → owner trust
  for (const pool of params.listingPools) {
    setEntry(map, pool.listingId, 'listing', 'ownerTrust', pool.ownerTrust.current, pool.ownerTrust.max);
  }

  // Customer attention
  for (const pool of params.customerPools) {
    setEntry(map, pool.customerId, 'customer', 'customerAttention', pool.attentionBudget.current, pool.attentionBudget.max);
  }

  // Org pools
  for (const pool of params.orgPools) {
    setEntry(map, pool.acnId, 'org', 'orgCredit', pool.promotionPool.current, pool.promotionPool.max);
  }

  // Owner trust/patience from case data
  for (const owner of params.ownerCases) {
    setEntry(map, owner.caseId, 'owner', 'ownerTrust', owner.trust, 100);
    setEntry(map, owner.caseId, 'owner', 'ownerPatience', owner.patience, 100);
  }

  // Rival pressure by cell
  for (const [cellId, pressure] of params.rivalPressureByCell) {
    setEntry(map, cellId, 'listing', 'rivalPressure', pressure, 100);
  }

  return map;
}

function setEntry(
  map: Map<string, OpeningBalanceEntry>,
  entityId: string,
  entityType: OpeningBalanceEntry['entityType'],
  dimension: ResourceDimension,
  balance: number,
  maxValue: number,
): void {
  const key = `${entityId}:${dimension}`;
  map.set(key, { entityId, entityType, dimension, balance, maxValue });
}

// ════════════════════════════════════════════════════════════════════════════
// Balance Entry Builder — creates a single ledger entry
// ════════════════════════════════════════════════════════════════════════════

function buildBalanceEntry(params: {
  entityId: string;
  entityType: ResourceBalanceEntry['entityType'];
  dimension: ResourceDimension;
  day: number;
  seq: number;
  openingBalance: number;
  delta: number;
  maxValue: number;
  sourceRecordId: string | null;
  causalEventId: string | null;
  receiptId: string | null;
  reason: string;
  sourceKind: string | null;
  runSeed: number;
}): ResourceBalanceEntry {
  const closingBalance = Math.max(0, Math.min(params.maxValue, params.openingBalance + params.delta));
  const entryId = `rbe-${params.entityId}-${params.dimension}-${params.day}-${params.seq}`;
  const replayKey = `rk-rbe-${params.runSeed}-${params.entityId}-${params.dimension}-${params.day}-${params.seq}`;

  return Object.freeze({
    entryId,
    entityId: params.entityId,
    entityType: params.entityType,
    dimension: params.dimension,
    day: params.day,
    openingBalance: params.openingBalance,
    delta: params.delta,
    closingBalance,
    maxValue: params.maxValue,
    sourceRecordId: params.sourceRecordId,
    causalEventId: params.causalEventId,
    receiptId: params.receiptId,
    replayKey,
    reason: params.reason,
    sourceKind: params.sourceKind,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Source-to-Delta Extraction — extract resource deltas from source records
// ════════════════════════════════════════════════════════════════════════════

interface ResourceDelta {
  readonly entityId: string;
  readonly entityType: ResourceBalanceEntry['entityType'];
  readonly dimension: ResourceDimension;
  readonly delta: number;
  readonly sourceRecordId: string;
  readonly sourceKind: string;
  readonly reason: string;
}

/**
 * Extract resource deltas from source records for a given day.
 *
 * Each source record can produce zero or more resource deltas.
 * The mapping is deterministic: same records → same deltas.
 */
function extractResourceDeltasFromSources(
  sourceRecords: readonly InformationSourceRecord[],
  day: number,
): readonly ResourceDelta[] {
  const deltas: ResourceDelta[] = [];

  for (const record of sourceRecords) {
    if (record.day !== day) continue;

    switch (record.sourceKind) {
      case 'broker_capacity_signal': {
        const payload = record.payload as {
          brokerId?: string;
          energyLevel?: number;
          pressureMagnitude?: number;
          scheduleUtilization?: number;
        };
        const brokerId = payload.brokerId ?? record.entityRefs[0]?.id ?? 'unknown';
        const energyDelta = -(payload.pressureMagnitude ?? 0);
        if (energyDelta !== 0) {
          deltas.push({
            entityId: brokerId,
            entityType: 'broker',
            dimension: 'energy',
            delta: energyDelta,
            sourceRecordId: record.sourceId,
            sourceKind: record.sourceKind,
            reason: `精力消耗: ${payload.pressureMagnitude ?? 0} (利用率${payload.scheduleUtilization ?? 0}%)`,
          });
        }
        break;
      }

      case 'manager_message': {
        const payload = record.payload as {
          targetBrokerId?: string;
          caseIds?: readonly string[];
          priority?: number;
          subtype?: string;
        };
        const brokerId = payload.targetBrokerId ?? 'player-broker';
        // Budget allocation or org credit
        if (payload.subtype === 'resource_allocated' || payload.subtype === 'focus_case_selected') {
          deltas.push({
            entityId: brokerId,
            entityType: 'broker',
            dimension: 'orgCredit',
            delta: Math.round((payload.priority ?? 0) * 0.3),
            sourceRecordId: record.sourceId,
            sourceKind: record.sourceKind,
            reason: `组织资源分配: ${payload.subtype}`,
          });
        }
        break;
      }

      case 'customer_interaction': {
        const payload = record.payload as {
          customerId?: string;
          subtype?: string;
        };
        const customerId = payload.customerId ?? record.entityRefs[0]?.id ?? 'unknown';
        // Attention migration
        if (payload.subtype === 'dropout_detected') {
          deltas.push({
            entityId: customerId,
            entityType: 'customer',
            dimension: 'customerAttention',
            delta: -15,
            sourceRecordId: record.sourceId,
            sourceKind: record.sourceKind,
            reason: `客户注意力流失: ${payload.subtype}`,
          });
        } else if (payload.subtype === 'preference_shifted') {
          deltas.push({
            entityId: customerId,
            entityType: 'customer',
            dimension: 'customerAttention',
            delta: -8,
            sourceRecordId: record.sourceId,
            sourceKind: record.sourceKind,
            reason: `客户注意力迁移: ${payload.subtype}`,
          });
        }
        break;
      }

      case 'owner_life_event_signal': {
        const payload = record.payload as {
          ownerId?: string;
          caseId?: string;
          trustImpact?: number;
          urgencyImpact?: number;
        };
        const caseId = payload.caseId ?? record.entityRefs[0]?.id ?? 'unknown';
        if (payload.trustImpact && payload.trustImpact !== 0) {
          deltas.push({
            entityId: caseId,
            entityType: 'owner',
            dimension: 'ownerTrust',
            delta: payload.trustImpact,
            sourceRecordId: record.sourceId,
            sourceKind: record.sourceKind,
            reason: `业主信任变化: ${payload.trustImpact > 0 ? '+' : ''}${payload.trustImpact}`,
          });
        }
        if (payload.urgencyImpact && payload.urgencyImpact !== 0) {
          deltas.push({
            entityId: caseId,
            entityType: 'owner',
            dimension: 'ownerPatience',
            delta: -Math.abs(payload.urgencyImpact),
            sourceRecordId: record.sourceId,
            sourceKind: record.sourceKind,
            reason: `业主耐心变化: 紧迫度影响${payload.urgencyImpact}`,
          });
        }
        break;
      }

      case 'rival_action': {
        const payload = record.payload as {
          marketCellId?: string;
          subtype?: string;
          rivalBrokerId?: string;
        };
        const cellId = payload.marketCellId ?? record.entityRefs.find((r) => r.kind === 'market_cell')?.id ?? 'unknown';
        deltas.push({
          entityId: cellId,
          entityType: 'listing',
          dimension: 'rivalPressure',
          delta: 5,
          sourceRecordId: record.sourceId,
          sourceKind: record.sourceKind,
          reason: `竞品压力增加: ${payload.subtype ?? 'rival_action'}`,
        });
        break;
      }

      case 'buyer_financing_signal': {
        const payload = record.payload as {
          customerId?: string;
          readinessImpact?: number;
        };
        const customerId = payload.customerId ?? record.entityRefs[0]?.id ?? 'unknown';
        if (payload.readinessImpact && payload.readinessImpact !== 0) {
          deltas.push({
            entityId: customerId,
            entityType: 'customer',
            dimension: 'customerAttention',
            delta: payload.readinessImpact > 0 ? 3 : -3,
            sourceRecordId: record.sourceId,
            sourceKind: record.sourceKind,
            reason: `客户融资信号: readinessImpact=${payload.readinessImpact}`,
          });
        }
        break;
      }
    }
  }

  return deltas;
}

// ════════════════════════════════════════════════════════════════════════════
// Causal Event Matching — link deltas to causal events
// ════════════════════════════════════════════════════════════════════════════

/**
 * Find causal event IDs that correspond to source record IDs.
 * Builds a map from sourceRecordId → causalEventId.
 */
function buildSourceToCausalMap(
  causalEvents: readonly WorldCausalEvent[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const event of causalEvents) {
    const eventAny = event as WorldCausalEvent & { sourceRecordId?: string };
    if (eventAny.sourceRecordId) {
      map.set(eventAny.sourceRecordId, event.id);
    }
  }
  return map;
}

// ════════════════════════════════════════════════════════════════════════════
// Closing Balance Extraction — for carry-forward to next day
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extract closing balances from ledger entries for carry-forward.
 * Returns an OpeningBalanceMap for the next day.
 */
export function extractClosingBalances(
  entries: readonly ResourceBalanceEntry[],
): OpeningBalanceMap {
  const map = new Map<string, OpeningBalanceEntry>();
  for (const entry of entries) {
    const key = `${entry.entityId}:${entry.dimension}`;
    // Last entry per entity-dimension wins
    map.set(key, {
      entityId: entry.entityId,
      entityType: entry.entityType,
      dimension: entry.dimension,
      balance: entry.closingBalance,
      maxValue: entry.maxValue,
    });
  }
  return map;
}

// ════════════════════════════════════════════════════════════════════════════
// Main Builder — buildEconomicResourceLedger
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build the economic resource ledger for a given day.
 *
 * Takes opening balances, source records, causal events, and receipt,
 * and produces a complete ledger with traceable entries.
 *
 * @param day - simulation day
 * @param openingBalances - carry-forward from previous day (or bootstrap)
 * @param sourceRecords - source records generated today (isr-eco-*)
 * @param causalEvents - causal events from today's tick
 * @param receipt - economy receipt for today
 * @param runSeed - deterministic seed
 * @returns EntityResourceDailyBalance for the day
 */
export function buildDailyResourceLedger(params: {
  readonly day: number;
  readonly openingBalances: OpeningBalanceMap;
  readonly sourceRecords: readonly InformationSourceRecord[];
  readonly causalEvents: readonly WorldCausalEvent[];
  readonly receipt: EconomyReceipt | null;
  readonly runSeed: number;
}): EntityResourceDailyBalance[] {
  const { day, openingBalances, sourceRecords, causalEvents, receipt, runSeed } = params;

  // Step 1: Extract resource deltas from source records
  const deltas = extractResourceDeltasFromSources(sourceRecords, day);

  // Step 2: Build source → causal event mapping
  const sourceToCausal = buildSourceToCausalMap(causalEvents);

  // Step 3: Build receipt ID
  const receiptId = receipt?.replayKey ?? null;

  // Step 4: Generate balance entries
  const allEntries: ResourceBalanceEntry[] = [];
  const entityDayGroups = new Map<string, ResourceBalanceEntry[]>();

  // Process deltas
  let seq = 0;
  for (const delta of deltas) {
    seq += 1;
    const key = `${delta.entityId}:${delta.dimension}`;
    const opening = openingBalances.get(key);
    const openingBalance = opening?.balance ?? 0;
    const maxValue = opening?.maxValue ?? 100;
    const causalEventId = sourceToCausal.get(delta.sourceRecordId) ?? null;

    const entry = buildBalanceEntry({
      entityId: delta.entityId,
      entityType: delta.entityType,
      dimension: delta.dimension,
      day,
      seq,
      openingBalance,
      delta: delta.delta,
      maxValue,
      sourceRecordId: delta.sourceRecordId,
      causalEventId,
      receiptId,
      reason: delta.reason,
      sourceKind: delta.sourceKind,
      runSeed,
    });

    allEntries.push(entry);

    const groupKey = `${delta.entityId}:${day}`;
    const group = entityDayGroups.get(groupKey) ?? [];
    group.push(entry);
    entityDayGroups.set(groupKey, group);
  }

  // Step 5: For entities with opening balances but no deltas, create zero-delta entries
  // This ensures every tracked entity has a complete daily record
  for (const [key, opening] of openingBalances) {
    const [entityId, dimension] = key.split(':');
    const existingDelta = deltas.find((d) => d.entityId === entityId && d.dimension === dimension);
    if (!existingDelta) {
      seq += 1;
      const entry = buildBalanceEntry({
        entityId,
        entityType: opening.entityType,
        dimension: opening.dimension as ResourceDimension,
        day,
        seq,
        openingBalance: opening.balance,
        delta: 0,
        maxValue: opening.maxValue,
        sourceRecordId: null,
        causalEventId: null,
        receiptId,
        reason: '无变化 (carry-forward)',
        sourceKind: null,
        runSeed,
      });

      allEntries.push(entry);

      const groupKey = `${entityId}:${day}`;
      const group = entityDayGroups.get(groupKey) ?? [];
      group.push(entry);
      entityDayGroups.set(groupKey, group);
    }
  }

  // Step 6: Build EntityResourceDailyBalance per entity-day
  const dailyBalances: EntityResourceDailyBalance[] = [];
  for (const [groupKey, entries] of entityDayGroups) {
    const [entityId] = groupKey.split(':');
    const entityType = entries[0]?.entityType ?? 'broker';
    const replayKey = `rk-erd-${runSeed}-${entityId}-${day}`;

    dailyBalances.push(Object.freeze({
      entityId,
      entityType,
      day,
      entries,
      replayKey,
    }));
  }

  return dailyBalances;
}

// ════════════════════════════════════════════════════════════════════════════
// Full Ledger Builder — accumulate across multiple days
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build the complete economic resource ledger across multiple days.
 *
 * Takes an initial opening balance map and a sequence of daily inputs,
 * and produces the full ledger with indexed access.
 *
 * @param initialOpeningBalances - bootstrap opening balances
 * @param dailyInputs - one entry per simulation day
 * @param runSeed - deterministic seed
 * @returns Complete EconomicResourceLedger
 */
export function buildEconomicResourceLedger(params: {
  readonly initialOpeningBalances: OpeningBalanceMap;
  readonly dailyInputs: ReadonlyArray<{
    readonly day: number;
    readonly sourceRecords: readonly InformationSourceRecord[];
    readonly causalEvents: readonly WorldCausalEvent[];
    readonly receipt: EconomyReceipt | null;
  }>;
  readonly runSeed: number;
}): EconomicResourceLedger {
  const { initialOpeningBalances, dailyInputs, runSeed } = params;

  let currentOpeningBalances = initialOpeningBalances;
  const allDailyBalances: EntityResourceDailyBalance[] = [];

  for (const dailyInput of dailyInputs) {
    const dayBalances = buildDailyResourceLedger({
      day: dailyInput.day,
      openingBalances: currentOpeningBalances,
      sourceRecords: dailyInput.sourceRecords,
      causalEvents: dailyInput.causalEvents,
      receipt: dailyInput.receipt,
      runSeed,
    });

    allDailyBalances.push(...dayBalances);

    // Carry forward closing balances to next day
    const dayEntries = dayBalances.flatMap((b) => b.entries);
    currentOpeningBalances = extractClosingBalances(dayEntries);
  }

  // Build flat entry list
  const allEntries = allDailyBalances.flatMap((b) => b.entries);

  // Build indexes
  const byEntityId = new Map<string, ResourceBalanceEntry[]>();
  const byDay = new Map<number, ResourceBalanceEntry[]>();
  const byDimension = new Map<ResourceDimension, ResourceBalanceEntry[]>();
  const byEntityDimension = new Map<string, ResourceBalanceEntry[]>();

  for (const entry of allEntries) {
    // byEntityId
    const entityArr = byEntityId.get(entry.entityId) ?? [];
    entityArr.push(entry);
    byEntityId.set(entry.entityId, entityArr);

    // byDay
    const dayArr = byDay.get(entry.day) ?? [];
    dayArr.push(entry);
    byDay.set(entry.day, dayArr);

    // byDimension
    const dimArr = byDimension.get(entry.dimension) ?? [];
    dimArr.push(entry);
    byDimension.set(entry.dimension, dimArr);

    // byEntityDimension
    const edKey = `${entry.entityId}:${entry.dimension}`;
    const edArr = byEntityDimension.get(edKey) ?? [];
    edArr.push(entry);
    byEntityDimension.set(edKey, edArr);
  }

  const distinctEntities = new Set(allEntries.map((e) => e.entityId));
  const distinctDays = new Set(allEntries.map((e) => e.day));

  return Object.freeze({
    dailyBalances: allDailyBalances,
    totalEntries: allEntries.length,
    distinctEntityCount: distinctEntities.size,
    distinctDayCount: distinctDays.size,
    replayKey: `rk-erl-${runSeed}-${allDailyBalances.length}`,
    byEntityId,
    byDay,
    byDimension,
    byEntityDimension,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Ledger Summary — compact persistable summary
// ════════════════════════════════════════════════════════════════════════════

/**
 * Compact summary of the economic resource ledger.
 * Safe to persist in save files.
 */
export interface EconomicResourceLedgerSummary {
  readonly totalEntries: number;
  readonly distinctEntityCount: number;
  readonly distinctDayCount: number;
  readonly entriesWithSourceRecordId: number;
  readonly entriesWithCausalEventId: number;
  readonly entriesWithReceiptId: number;
  readonly sourceTraceabilityPct: number;
  readonly dimensionBreakdown: Readonly<Record<ResourceDimension, number>>;
  readonly replayKey: string;
}

/**
 * Build a compact summary from the ledger.
 */
export function buildLedgerSummary(ledger: EconomicResourceLedger): EconomicResourceLedgerSummary {
  const allEntries = ledger.dailyBalances.flatMap((b) => b.entries);

  const entriesWithSource = allEntries.filter((e) => e.sourceRecordId !== null).length;
  const entriesWithCausal = allEntries.filter((e) => e.causalEventId !== null).length;
  const entriesWithReceipt = allEntries.filter((e) => e.receiptId !== null).length;

  const dimensionBreakdown: Record<string, number> = {};
  for (const dim of ALL_RESOURCE_DIMENSIONS) {
    dimensionBreakdown[dim] = ledger.byDimension.get(dim)?.length ?? 0;
  }

  return {
    totalEntries: ledger.totalEntries,
    distinctEntityCount: ledger.distinctEntityCount,
    distinctDayCount: ledger.distinctDayCount,
    entriesWithSourceRecordId: entriesWithSource,
    entriesWithCausalEventId: entriesWithCausal,
    entriesWithReceiptId: entriesWithReceipt,
    sourceTraceabilityPct: ledger.totalEntries > 0
      ? Math.round((entriesWithSource / ledger.totalEntries) * 100)
      : 0,
    dimensionBreakdown: dimensionBreakdown as Readonly<Record<ResourceDimension, number>>,
    replayKey: ledger.replayKey,
  };
}
