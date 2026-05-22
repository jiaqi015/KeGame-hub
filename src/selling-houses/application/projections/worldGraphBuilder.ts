/**
 * WorldGraphBuilder — derive WorldGraph from GameState + BigWorldBootstrap.
 *
 * Architecture position:
 *   - Pure read-only projection over GameState (no mutations)
 *   - Only imports from domain/ and same-layer application/projections/
 *   - Does NOT import from core/, interfaces/, or ui/
 *
 * Determinism:
 *   - Same seed + same bootstrap => byte-identical graph
 *   - All IDs are deterministic: `{kind}-{seed}-{index}` or `{kind}-{entityId}`
 *   - No Math.random() or Date.now()
 *
 * Visibility:
 *   - buildWorldGraph() produces the full graph (including hidden truth)
 *   - buildPlayerVisibleWorldGraph() strips hidden truth from nodes/edges
 *     and replaces sensitive properties with aggregate-only data
 */

import type {
  GameState,
} from '../../domain/models.js';

import type {
  MicroCell,
} from '../../domain/world-model/bigWorldTypes.js';

import type {
  BrokerEntity,
} from '../../domain/world-model/brokerPopulation.js';

import type {
  ListingPopulationEntity,
} from '../../domain/world-model/listingPopulation.js';

import type {
  ACNNetworkSnapshot,
} from '../../domain/world-model/marketWorldTypes.js';

import type {
  WorldGraph,
  WorldGraphNode,
  WorldGraphEdge,
  WorldGraphSummary,
  MarketCellGraphSummary,
  PlayerVisibleWorldGraph,
  WorldGraphNodeKind,
} from './worldGraphTypes.js';

import { attributePressure } from './acnAttribution.js';
import { deriveBrandId } from '../../domain/world-model/runtime/brandIdHelper.js';

// ════════════════════════════════════════════════════════════════════════════
// Deterministic ID generation
// ════════════════════════════════════════════════════════════════════════════

function nodeId(kind: WorldGraphNodeKind, seed: number, index: number): string {
  return `wg-${kind}-${seed}-${index}`;
}

function edgeId(kind: string, seed: number, index: number): string {
  return `wge-${kind}-${seed}-${index}`;
}

// ════════════════════════════════════════════════════════════════════════════
// buildWorldGraph — main entry point
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build a WorldGraph from GameState (read-only projection).
 *
 * Derivation rules:
 *   - listing nodes:      GameState.cases
 *   - rival_listing nodes: GameState.marketShadow.rivalListings
 *   - store nodes:        GameState.marketShadow.rivalStores
 *   - market_cell nodes:  GameState.markets
 *   - customer nodes:     GameState.customerStates
 *   - acn nodes:          RunContext.bigWorldBootstrap.hiddenTruth.acnNetworks
 *   - broker nodes:       RunContext.bigWorldBootstrap.materializedEntities.brokers
 *   - shadow_listing:     RunContext.bigWorldBootstrap.materializedEntities.listings (layer=shadow)
 *   - micro_cell nodes:   RunContext.bigWorldBootstrap.hiddenTruth.microCells
 *   - owner nodes:        deduped from Case.ownerName
 *
 * Edge derivation:
 *   - belongs_to_acn:   BrokerEntity.acnId
 *   - manages:          player broker -> own cases
 *   - located_in:       Case/RivalListing.marketCellId
 *   - competes_with:    same marketCell + same priceBand/segment
 *   - co_sells_with:    same ACN listings
 *   - interested_in:    CustomerRuntimeState.activeCaseIds
 *   - watches:          customer -> market_cell (via listing located_in)
 *   - compares:         customer status=comparing -> listing
 *   - owns:             owner -> listing (from Case.ownerName)
 *   - supervised_by:    broker -> store
 *   - contains:         market_cell -> micro_cell
 */
export function buildWorldGraph(state: GameState): WorldGraph {
  const seed = state.runContext.runSeed;
  const bootstrap = state.runContext.bigWorldBootstrap;

  const nodes: WorldGraphNode[] = [];
  const edges: WorldGraphEdge[] = [];
  let nodeIndex = 0;
  let edgeIndex = 0;

  // ── Index maps for cross-referencing ──
  const nodeByEntityId = new Map<string, string>(); // entity id -> graph node id
  const listingNodeIds = new Map<string, string>(); // caseId/listingId -> graph node id
  const listingCellMap = new Map<string, string>(); // listingNodeId -> marketCellId
  const listingAcnMap = new Map<string, string>();  // listingNodeId -> acnId (if known)
  const listingPriceBand = new Map<string, string>(); // listingNodeId -> priceBand
  const ownerNodeIds = new Map<string, string>();   // ownerName -> graph node id
  const customerNodeIds = new Map<string, string>(); // customerId -> graph node id
  const marketCellNodeIds = new Map<string, string>(); // marketCellId -> graph node id
  const microCellNodeIds = new Map<string, string>(); // microCellId -> graph node id

  // ══════════════════════════════════════════════════════════════
  // 1. Market cell nodes (from GameState.markets)
  // ══════════════════════════════════════════════════════════════

  for (let i = 0; i < state.markets.length; i++) {
    const cell = state.markets[i];
    const nid = nodeId('market_cell', seed, nodeIndex++);
    nodes.push({
      id: nid,
      kind: 'market_cell',
      label: cell.name,
      properties: {
        entityId: cell.id,
        heat: cell.demandHeat,
        supplyPressure: cell.supplyPressure,
        competitivePressure: cell.competitivePressure,
        sentiment: cell.sentiment,
      },
    });
    nodeByEntityId.set(cell.id, nid);
    marketCellNodeIds.set(cell.id, nid);
  }

  // ══════════════════════════════════════════════════════════════
  // 2. ACN nodes (from bootstrap hiddenTruth)
  // ══════════════════════════════════════════════════════════════

  const acnSnapshots: readonly ACNNetworkSnapshot[] = bootstrap?.hiddenTruth.acnNetworks ?? [];
  for (let i = 0; i < acnSnapshots.length; i++) {
    const acn = acnSnapshots[i];
    const nid = nodeId('acn', seed, nodeIndex++);
    nodes.push({
      id: nid,
      kind: 'acn',
      label: acn.name,
      properties: {
        entityId: acn.id,
        role: acn.role,
        collaborationLevel: acn.collaborationLevel,
        coSaleBias: acn.coSaleBias,
      },
    });
    nodeByEntityId.set(acn.id, nid);
  }

  // ══════════════════════════════════════════════════════════════
  // 3. Broker nodes (from bootstrap materializedEntities)
  // ══════════════════════════════════════════════════════════════

  const brokers: readonly BrokerEntity[] = bootstrap?.materializedEntities.brokers ?? [];
  const storeNodeIds = new Map<string, string>(); // storeId -> graph node id
  for (let i = 0; i < brokers.length; i++) {
    const broker = brokers[i];
    const nid = nodeId('broker', seed, nodeIndex++);
    nodes.push({
      id: nid,
      kind: 'broker',
      label: broker.name,
      properties: {
        entityId: broker.brokerId,
        acnId: broker.acnId,
        visibility: broker.visibility,
        style: broker.style,
        marketCellCount: broker.marketCellIds.length,
      },
    });
    nodeByEntityId.set(broker.brokerId, nid);

    // belongs_to_acn edge
    const acnNodeId = nodeByEntityId.get(broker.acnId);
    if (acnNodeId) {
      edges.push({
        id: edgeId('belongs_to_acn', seed, edgeIndex++),
        kind: 'belongs_to_acn',
        sourceId: nid,
        targetId: acnNodeId,
        properties: {},
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 4. Listing nodes (from GameState.cases — player listings)
  // ══════════════════════════════════════════════════════════════

  // Player broker ID from bootstrap
  const playerBrokerId = bootstrap?.openingPOV.playerBroker.brokerId ?? '';
  const playerAcnId = bootstrap?.openingPOV.playerBroker.acnId ?? '';

  for (let i = 0; i < state.cases.length; i++) {
    const c = state.cases[i];
    const nid = nodeId('listing', seed, nodeIndex++);
    const priceBand = computePriceBand(c.askPrice);
    nodes.push({
      id: nid,
      kind: 'listing',
      label: c.title,
      properties: {
        entityId: c.id,
        marketCellId: c.marketCellId,
        district: c.district,
        askPrice: c.askPrice,
        priceBand,
        status: c.status,
        ownerName: c.ownerName,
      },
    });
    nodeByEntityId.set(c.id, nid);
    listingNodeIds.set(c.id, nid);
    listingCellMap.set(nid, c.marketCellId);
    listingPriceBand.set(nid, priceBand);
    if (playerAcnId) {
      listingAcnMap.set(nid, playerAcnId);
    }

    // located_in edge
    const cellNodeId = marketCellNodeIds.get(c.marketCellId);
    if (cellNodeId) {
      edges.push({
        id: edgeId('located_in', seed, edgeIndex++),
        kind: 'located_in',
        sourceId: nid,
        targetId: cellNodeId,
        properties: {},
      });
    }

    // manages edge (player broker -> listing)
    if (playerBrokerId) {
      const brokerNodeId = nodeByEntityId.get(playerBrokerId);
      if (brokerNodeId) {
        edges.push({
          id: edgeId('manages', seed, edgeIndex++),
          kind: 'manages',
          sourceId: brokerNodeId,
          targetId: nid,
          properties: {},
        });
      }
    }

    // owner node + owns edge
    const ownerName = c.ownerName;
    if (ownerName && !ownerNodeIds.has(ownerName)) {
      const ownerNid = nodeId('owner', seed, nodeIndex++);
      nodes.push({
        id: ownerNid,
        kind: 'owner',
        label: ownerName,
        properties: { name: ownerName },
      });
      ownerNodeIds.set(ownerName, ownerNid);
    }
    if (ownerName) {
      const ownerNid = ownerNodeIds.get(ownerName)!;
      edges.push({
        id: edgeId('owns', seed, edgeIndex++),
        kind: 'owns',
        sourceId: ownerNid,
        targetId: nid,
        properties: {},
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 5. Rival listing nodes (from GameState.marketShadow.rivalListings)
  // ══════════════════════════════════════════════════════════════

  for (let i = 0; i < state.marketShadow.rivalListings.length; i++) {
    const r = state.marketShadow.rivalListings[i];
    const nid = nodeId('rival_listing', seed, nodeIndex++);
    const priceBand = computePriceBand(r.askPrice);
    nodes.push({
      id: nid,
      kind: 'rival_listing',
      label: r.title,
      properties: {
        entityId: r.id,
        marketCellId: r.marketCellId,
        segment: r.segment,
        askPrice: r.askPrice,
        priceBand,
        status: r.status,
        storeId: r.storeId,
        heat: r.heat,
        freshness: r.freshness,
      },
    });
    nodeByEntityId.set(r.id, nid);
    listingNodeIds.set(r.id, nid);
    listingCellMap.set(nid, r.marketCellId);
    listingPriceBand.set(nid, priceBand);

    // located_in edge
    const cellNodeId = marketCellNodeIds.get(r.marketCellId);
    if (cellNodeId) {
      edges.push({
        id: edgeId('located_in', seed, edgeIndex++),
        kind: 'located_in',
        sourceId: nid,
        targetId: cellNodeId,
        properties: {},
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 6. Shadow listing nodes (from bootstrap materializedEntities, layer=shadow)
  // ══════════════════════════════════════════════════════════════

  const allListings: readonly ListingPopulationEntity[] = bootstrap?.materializedEntities.listings ?? [];
  const shadowListings = allListings.filter((l) => l.layer === 'shadow');

  for (let i = 0; i < shadowListings.length; i++) {
    const sl = shadowListings[i];
    const nid = nodeId('shadow_listing', seed, nodeIndex++);
    nodes.push({
      id: nid,
      kind: 'shadow_listing',
      label: `shadow-${sl.listingId}`,
      properties: {
        entityId: sl.listingId,
        marketCellId: sl.marketCellId,
        priceBand: sl.priceBand,
        layout: sl.layout,
        status: sl.status,
      },
    });
    nodeByEntityId.set(sl.listingId, nid);
    listingNodeIds.set(sl.listingId, nid);
    listingCellMap.set(nid, sl.marketCellId);
    listingPriceBand.set(nid, sl.priceBand);
    if (sl.acnId) {
      listingAcnMap.set(nid, sl.acnId);
    }

    // located_in edge
    const cellNodeId = marketCellNodeIds.get(sl.marketCellId);
    if (cellNodeId) {
      edges.push({
        id: edgeId('located_in', seed, edgeIndex++),
        kind: 'located_in',
        sourceId: nid,
        targetId: cellNodeId,
        properties: {},
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 7. Store nodes (from GameState.marketShadow.rivalStores)
  // ══════════════════════════════════════════════════════════════

  for (let i = 0; i < state.marketShadow.rivalStores.length; i++) {
    const s = state.marketShadow.rivalStores[i];
    const nid = nodeId('store', seed, nodeIndex++);
    nodes.push({
      id: nid,
      kind: 'store',
      label: s.name,
      properties: {
        entityId: s.id,
        type: s.type,
        style: s.style,
        leadCapturePower: s.leadCapturePower,
        sellerInfluencePower: s.sellerInfluencePower,
        pricingPressurePower: s.pricingPressurePower,
        activityHeat: s.activityHeat,
      },
    });
    nodeByEntityId.set(s.id, nid);
    storeNodeIds.set(s.id, nid);
  }

  // ══════════════════════════════════════════════════════════════
  // 8. Customer nodes (from GameState.customerStates)
  // ══════════════════════════════════════════════════════════════

  for (let i = 0; i < state.customerStates.length; i++) {
    const cs = state.customerStates[i];
    const nid = nodeId('customer', seed, nodeIndex++);
    nodes.push({
      id: nid,
      kind: 'customer',
      label: cs.customerId,
      properties: {
        entityId: cs.customerId,
        status: cs.status,
        fatigue: cs.fatigue,
        churnRisk: cs.churnRisk,
      },
    });
    nodeByEntityId.set(cs.customerId, nid);
    customerNodeIds.set(cs.customerId, nid);

    // interested_in edges (customer -> listing via activeCaseIds)
    for (const caseId of cs.activeCaseIds) {
      const listingNodeId = listingNodeIds.get(caseId);
      if (listingNodeId) {
        edges.push({
          id: edgeId('interested_in', seed, edgeIndex++),
          kind: 'interested_in',
          sourceId: nid,
          targetId: listingNodeId,
          properties: {},
        });
      }
    }

    // watches edges (customer -> market_cell via listing located_in)
    const watchedCellIds = new Set<string>();
    for (const caseId of cs.activeCaseIds) {
      const listingNid = listingNodeIds.get(caseId);
      if (listingNid) {
        const cellId = listingCellMap.get(listingNid);
        if (cellId) watchedCellIds.add(cellId);
      }
    }
    for (const cellId of watchedCellIds) {
      const cellNid = marketCellNodeIds.get(cellId);
      if (cellNid) {
        edges.push({
          id: edgeId('watches', seed, edgeIndex++),
          kind: 'watches',
          sourceId: nid,
          targetId: cellNid,
          properties: {},
        });
      }
    }

    // compares edges (customer status=comparing -> listing)
    if (cs.status === 'comparing') {
      for (const caseId of cs.activeCaseIds) {
        const listingNid = listingNodeIds.get(caseId);
        if (listingNid) {
          edges.push({
            id: edgeId('compares', seed, edgeIndex++),
            kind: 'compares',
            sourceId: nid,
            targetId: listingNid,
            properties: {},
          });
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 9. Micro cell nodes (from bootstrap hiddenTruth)
  // ══════════════════════════════════════════════════════════════

  const microCells: readonly MicroCell[] = bootstrap?.hiddenTruth.microCells ?? [];
  for (let i = 0; i < microCells.length; i++) {
    const mc = microCells[i];
    const nid = nodeId('micro_cell', seed, nodeIndex++);
    nodes.push({
      id: nid,
      kind: 'micro_cell',
      label: mc.name,
      properties: {
        entityId: mc.microCellId,
        parentMarketCellId: mc.parentMarketCellId,
        heat: mc.heat,
        inventoryPressure: mc.inventoryPressure,
        dealVelocity: mc.dealVelocity,
        listingCount: mc.listingCount,
      },
    });
    nodeByEntityId.set(mc.microCellId, nid);
    microCellNodeIds.set(mc.microCellId, nid);

    // contains edge (market_cell -> micro_cell)
    const parentCellNid = marketCellNodeIds.get(mc.parentMarketCellId);
    if (parentCellNid) {
      edges.push({
        id: edgeId('contains', seed, edgeIndex++),
        kind: 'contains',
        sourceId: parentCellNid,
        targetId: nid,
        properties: {},
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 10. Cross-listing edges: competes_with + co_sells_with
  // ══════════════════════════════════════════════════════════════

  // Collect all listing-type node ids with their cell and band info
  interface ListingInfo {
    nodeId: string;
    cellId: string;
    priceBand: string;
    acnId: string | undefined;
    kind: WorldGraphNodeKind;
  }
  const allListingInfos: ListingInfo[] = [];

  for (const node of nodes) {
    if (node.kind === 'listing' || node.kind === 'rival_listing' || node.kind === 'shadow_listing') {
      const cellId = listingCellMap.get(node.id);
      const band = listingPriceBand.get(node.id);
      const acnId = listingAcnMap.get(node.id);
      if (cellId && band) {
        allListingInfos.push({
          nodeId: node.id,
          cellId,
          priceBand: band,
          acnId,
          kind: node.kind,
        });
      }
    }
  }

  // Group by market cell for competes_with
  const byCell = new Map<string, ListingInfo[]>();
  for (const info of allListingInfos) {
    const arr = byCell.get(info.cellId) ?? [];
    arr.push(info);
    byCell.set(info.cellId, arr);
  }

  // competes_with: listing <-> rival_listing in same cell + same priceBand
  for (const [_cellId, infos] of byCell) {
    const playerListings = infos.filter((i) => i.kind === 'listing');
    const rivalListings = infos.filter((i) => i.kind === 'rival_listing');
    for (const pl of playerListings) {
      for (const rl of rivalListings) {
        if (pl.priceBand === rl.priceBand) {
          edges.push({
            id: edgeId('competes_with', seed, edgeIndex++),
            kind: 'competes_with',
            sourceId: pl.nodeId,
            targetId: rl.nodeId,
            properties: { reason: 'same_cell_same_price_band' },
          });
        }
      }
    }
  }

  // co_sells_with: listing <-> listing in same ACN
  // Use deterministic ordering: only add edge if leftIndex < rightIndex
  const byAcn = new Map<string, ListingInfo[]>();
  for (const info of allListingInfos) {
    if (info.acnId) {
      const arr = byAcn.get(info.acnId) ?? [];
      arr.push(info);
      byAcn.set(info.acnId, arr);
    }
  }

  for (const [_acnId, infos] of byAcn) {
    for (let i = 0; i < infos.length; i++) {
      for (let j = i + 1; j < infos.length; j++) {
        // Only co_sells_with between player listings (same ACN)
        if (infos[i].kind === 'listing' && infos[j].kind === 'listing') {
          edges.push({
            id: edgeId('co_sells_with', seed, edgeIndex++),
            kind: 'co_sells_with',
            sourceId: infos[i].nodeId,
            targetId: infos[j].nodeId,
            properties: { acnId: infos[i].acnId },
          });
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 11. supervised_by edges: broker -> store
  // ══════════════════════════════════════════════════════════════

  // For rival stores, connect named rival brokers whose marketCellIds overlap
  // with the store's districtFocus
  for (const store of state.marketShadow.rivalStores) {
    const storeNid = storeNodeIds.get(store.id);
    if (!storeNid) continue;
    for (const broker of brokers) {
      if (broker.visibility !== 'named') continue;
      const brokerNid = nodeByEntityId.get(broker.brokerId);
      if (!brokerNid) continue;
      // Connect if broker's market cells overlap with store's district focus
      const brokerDistricts = broker.marketCellIds;
      const storeDistricts = store.districtFocus;
      const hasOverlap = brokerDistricts.some((d) => storeDistricts.includes(d));
      if (hasOverlap) {
        edges.push({
          id: edgeId('supervised_by', seed, edgeIndex++),
          kind: 'supervised_by',
          sourceId: brokerNid,
          targetId: storeNid,
          properties: {},
        });
      }
    }
  }

  return { nodes, edges };
}

// ════════════════════════════════════════════════════════════════════════════
// buildWorldGraphSummary — compute graph summary
// ════════════════════════════════════════════════════════════════════════════

export function buildWorldGraphSummary(graph: WorldGraph, state: GameState): WorldGraphSummary {
  const nodesByKind = new Map<WorldGraphNodeKind, number>();
  for (const node of graph.nodes) {
    nodesByKind.set(node.kind, (nodesByKind.get(node.kind) ?? 0) + 1);
  }

  const edgesByKind = new Map<string, number>();
  for (const edge of graph.edges) {
    edgesByKind.set(edge.kind, (edgesByKind.get(edge.kind) ?? 0) + 1);
  }

  // Market cell summaries
  const marketCellSummaries: MarketCellGraphSummary[] = [];

  for (const cell of state.markets) {
    // Find all listing/rival_listing/shadow_listing nodes in this cell
    const listingNodeIdsInCell = new Set<string>();
    const rivalListingNodeIdsInCell = new Set<string>();
    const shadowListingNodeIdsInCell = new Set<string>();

    for (const node of graph.nodes) {
      if (node.kind === 'listing' && node.properties.marketCellId === cell.id) {
        listingNodeIdsInCell.add(node.id);
      }
      if (node.kind === 'rival_listing' && node.properties.marketCellId === cell.id) {
        rivalListingNodeIdsInCell.add(node.id);
      }
      if (node.kind === 'shadow_listing' && node.properties.marketCellId === cell.id) {
        shadowListingNodeIdsInCell.add(node.id);
      }
    }

    // Count active customers watching or interested in this cell
    const activeCustomerIds = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.kind === 'watches' || edge.kind === 'interested_in') {
        // Check if target is in this cell
        const targetId = edge.targetId;
        if (
          listingNodeIdsInCell.has(targetId)
          || rivalListingNodeIdsInCell.has(targetId)
        ) {
          // Find the customer node
          const sourceNode = graph.nodes.find((n) => n.id === edge.sourceId);
          if (sourceNode && sourceNode.kind === 'customer') {
            activeCustomerIds.add(sourceNode.id);
          }
        }
        // Also check market cell node directly
        const cellNode = graph.nodes.find(
          (n) => n.kind === 'market_cell' && n.properties.entityId === cell.id,
        );
        if (cellNode && edge.targetId === cellNode.id) {
          const sourceNode = graph.nodes.find((n) => n.id === edge.sourceId);
          if (sourceNode && sourceNode.kind === 'customer') {
            activeCustomerIds.add(sourceNode.id);
          }
        }
      }
    }

    // Use attributePressure for consistent pressure decomposition across all consumers
    const playerAcnId = state.bigWorldRuntime?.playerBrokerAcnId;
    const playerBrandId = deriveBrandId(playerAcnId);
    const cellPressure = attributePressure(
      state.marketShadow.rivalStores,
      state.marketShadow.rivalListings,
      cell.id,
      playerAcnId,
      playerBrandId,
    );

    const listingCount = listingNodeIdsInCell.size;
    const rivalCount = rivalListingNodeIdsInCell.size;
    const shadowCount = shadowListingNodeIdsInCell.size;

    marketCellSummaries.push({
      cellId: cell.id,
      cellName: cell.name,
      heat: cell.demandHeat,
      supplyPressure: cell.supplyPressure,
      competitivePressure: cell.competitivePressure,
      listingCount,
      rivalListingCount: rivalCount,
      shadowListingCount: shadowCount,
      activeCustomerCount: activeCustomerIds.size,
      coSalePressure: cellPressure.coSalePressure,
      internalPressure: cellPressure.internalPressure,
      rivalPressure: cellPressure.rivalPressure,
    });
  }

  return {
    acnCount: nodesByKind.get('acn') ?? 0,
    brokerCount: nodesByKind.get('broker') ?? 0,
    listingCount: nodesByKind.get('listing') ?? 0,
    shadowListingCount: nodesByKind.get('shadow_listing') ?? 0,
    rivalListingCount: nodesByKind.get('rival_listing') ?? 0,
    customerCount: nodesByKind.get('customer') ?? 0,
    marketCellCount: nodesByKind.get('market_cell') ?? 0,
    microCellCount: nodesByKind.get('micro_cell') ?? 0,
    storeCount: nodesByKind.get('store') ?? 0,
    ownerCount: nodesByKind.get('owner') ?? 0,
    coSaleEdgeCount: edgesByKind.get('co_sells_with') ?? 0,
    rivalEdgeCount: edgesByKind.get('competes_with') ?? 0,
    marketCellSummaries,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// buildPlayerVisibleWorldGraph — visibility-filtered projection
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build a player-visible projection of the world graph.
 *
 * Filtering rules:
 *   - Shadow listing nodes: remove full properties, keep only aggregate counts
 *   - Broker nodes: remove behavior profile, keep name + visibility + ACN membership
 *   - co_sells_with edges: show existence only, not specific strategy
 *   - Hidden truth nodes are not included at all
 */
export function buildPlayerVisibleWorldGraph(graph: WorldGraph, state: GameState): PlayerVisibleWorldGraph {
  const hiddenKinds = new Set<WorldGraphNodeKind>(['shadow_listing']);

  // Filter nodes
  const visibleNodes: WorldGraphNode[] = [];
  for (const node of graph.nodes) {
    if (hiddenKinds.has(node.kind)) {
      // Shadow listings: do not include individual nodes
      continue;
    }

    if (node.kind === 'broker') {
      // Strip behavior profile, keep structural info only
      visibleNodes.push({
        id: node.id,
        kind: node.kind,
        label: node.label,
        properties: {
          entityId: node.properties.entityId,
          acnId: node.properties.acnId,
          visibility: node.properties.visibility,
          // Remove: style, marketCellCount (internal strategy data)
        },
      });
      continue;
    }

    visibleNodes.push(node);
  }

  // Filter edges: remove edges that reference removed nodes
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges: WorldGraphEdge[] = [];

  for (const edge of graph.edges) {
    if (!visibleNodeIds.has(edge.sourceId) || !visibleNodeIds.has(edge.targetId)) {
      continue;
    }

    // co_sells_with: show existence but strip strategy details
    if (edge.kind === 'co_sells_with') {
      visibleEdges.push({
        id: edge.id,
        kind: edge.kind,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        properties: { sameAcn: true }, // Only reveal same-ACN existence
      });
      continue;
    }

    visibleEdges.push(edge);
  }

  // Summary is still computed from the full graph (counts include shadow entities)
  const summary = buildWorldGraphSummary(graph, state);

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    summary,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Helper: price band computation (matches listingPopulation logic)
// ════════════════════════════════════════════════════════════════════════════

function computePriceBand(price: number): string {
  if (price < 200) return 'under_200w';
  if (price < 400) return '200w_400w';
  if (price < 600) return '400w_600w';
  if (price < 800) return '600w_800w';
  if (price < 1000) return '800w_1000w';
  return 'above_1000w';
}

/**
 * Rebuild the WorldGraphSummary from a GameState and cache it on BigWorldRuntimeState.
 * Call after each daily tick.
 */
export function rebuildWorldGraphSummary(state: GameState): void {
  const graph = buildWorldGraph(state);
  const summary = buildWorldGraphSummary(graph, state);
  if (state.bigWorldRuntime) {
    (state.bigWorldRuntime as { worldGraphSummary?: WorldGraphSummary }).worldGraphSummary = summary;
  }
}
