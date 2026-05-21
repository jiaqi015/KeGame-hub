/**
 * WorldGraphTypes — entity relationship graph core types.
 *
 * Answers the key business questions:
 *   1. How many ACN / broker / listing / shadow / rival / customer / cell / owner exist?
 *   2. What is the supply-demand / heat / competitive pressure per MarketCell?
 *   3. Which co-sale / rival / customer attention edges surround a given case?
 *
 * Architecture:
 *   - Pure type definitions, no runtime logic
 *   - application/projections/ layer — may import from domain/ and same layer
 *   - Does NOT import from core/, interfaces/, or ui/
 *
 * Determinism:
 *   - Same seed + same bootstrap => byte-identical graph
 *   - All node/edge IDs are deterministic (seed + kind + index)
 */

import type {
  WorldGraphSummary as WorldGraphSummaryBase,
  MarketCellGraphSummary as MarketCellGraphSummaryBase,
} from '../../domain/world-model/runtime/types.js';

// ════════════════════════════════════════════════════════════════════════════
// Node kinds — what entities exist in the world graph
// ════════════════════════════════════════════════════════════════════════════

export type WorldGraphNodeKind =
  | 'acn'             // ACN network
  | 'broker'          // Broker (named / shadow / player)
  | 'listing'         // Player listing (Case)
  | 'shadow_listing'  // Shadow listing from big world
  | 'rival_listing'   // Direct rival listing
  | 'customer'        // Customer
  | 'market_cell'     // Market cell (板块)
  | 'micro_cell'      // Micro cell (微板块)
  | 'store'           // Store (门店)
  | 'owner';          // Owner (业主)

// ════════════════════════════════════════════════════════════════════════════
// Edge kinds — how entities relate
// ════════════════════════════════════════════════════════════════════════════

export type WorldGraphEdgeKind =
  | 'belongs_to_acn'      // broker -> acn
  | 'manages'             // broker -> listing
  | 'located_in'          // listing / rival_listing -> market_cell
  | 'competes_with'       // listing <-> rival_listing (same cell + segment/price)
  | 'co_sells_with'       // listing <-> listing (same ACN)
  | 'interested_in'       // customer -> listing
  | 'watches'             // customer -> market_cell
  | 'compares'            // customer -> listing (comparing)
  | 'owns'                // owner -> listing
  | 'supervised_by'       // broker -> store
  | 'contains';           // market_cell -> micro_cell

// ════════════════════════════════════════════════════════════════════════════
// Graph primitives
// ════════════════════════════════════════════════════════════════════════════

export interface WorldGraphNode {
  readonly id: string;
  readonly kind: WorldGraphNodeKind;
  readonly label: string;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

export interface WorldGraphEdge {
  readonly id: string;
  readonly kind: WorldGraphEdgeKind;
  readonly sourceId: string;
  readonly targetId: string;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

export interface WorldGraph {
  readonly nodes: readonly WorldGraphNode[];
  readonly edges: readonly WorldGraphEdge[];
}

// ════════════════════════════════════════════════════════════════════════════
// Graph summary — answers key business questions
// ════════════════════════════════════════════════════════════════════════════

// Re-export summary types from runtime/types.ts — single source of truth.
// runtime/ owns the shape because WorldGraphSummary is cached on
// BigWorldRuntimeState after each daily tick.
export type WorldGraphSummary = WorldGraphSummaryBase;
export type MarketCellGraphSummary = MarketCellGraphSummaryBase;

// ════════════════════════════════════════════════════════════════════════════
// Player-visible projection — filtered, no hidden truth leakage
// ════════════════════════════════════════════════════════════════════════════

export interface PlayerVisibleWorldGraph {
  readonly nodes: readonly WorldGraphNode[];
  readonly edges: readonly WorldGraphEdge[];
  readonly summary: WorldGraphSummary;
}
