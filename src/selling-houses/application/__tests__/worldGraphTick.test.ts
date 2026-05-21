/**
 * WorldGraphTick test — verifies that WorldGraphSummary is a runtime product
 * of the daily tick pipeline, not a projection-layer recomputation.
 *
 * Uses the R2 WorldGraphSummary type (from worldGraphTypes.ts) which has
 * per-kind counts and MarketCellGraphSummary[].
 */

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../gameState.js';
import { advanceGameDaysWithSummary } from '../gameTransitions.js';
import { buildWorldGraph, buildWorldGraphSummary, rebuildWorldGraphSummary } from '../projections/worldGraphBuilder.js';
import { getScenarioSnapshotById } from '../../domain/scenarioCatalog.js';
import { updateDerivedState } from '../../domain/runtimeState.js';
import type { GameState } from '../../domain/models.js';
import { seedInitialOpportunities } from '../../domain/engine.js';

function createTestState(seed = 20260417): GameState {
  const snapshot = getScenarioSnapshotById('warmup-clean-handoff');
  if (!snapshot) {
    throw new Error('warmup-clean-handoff scenario not found');
  }
  const state = createInitialState(snapshot, seed);
  seedInitialOpportunities(state);
  updateDerivedState(state);
  return state;
}

describe('WorldGraph as runtime product of daily tick', () => {
  it('populates worldGraphSummary after advanceGameDays', () => {
    const state = createTestState();
    expect(state.bigWorldRuntime.worldGraphSummary).toBeUndefined();

    const result = advanceGameDaysWithSummary(state, 1);
    const nextState = result.nextState;

    const summary = nextState.bigWorldRuntime?.worldGraphSummary;
    expect(summary).toBeDefined();
    expect(summary!.listingCount).toBeGreaterThan(0);
    expect(summary!.marketCellCount).toBeGreaterThan(0);
    expect(summary!.marketCellSummaries.length).toBeGreaterThan(0);
  });

  it('summary reflects current game state, not stale from previous tick', () => {
    const state = createTestState();

    const result1 = advanceGameDaysWithSummary(state, 1);
    const summary1 = result1.nextState.bigWorldRuntime?.worldGraphSummary;
    expect(summary1).toBeDefined();

    const result2 = advanceGameDaysWithSummary(result1.nextState, 1);
    const summary2 = result2.nextState.bigWorldRuntime?.worldGraphSummary;
    expect(summary2).toBeDefined();

    // Summary should have been recomputed (different object)
    expect(summary2).not.toBe(summary1);
  });

  it('determinism: same seed + same actions → same graph summary after same ticks', () => {
    const seed = 42;

    const state1 = createTestState(seed);
    const result1 = advanceGameDaysWithSummary(state1, 3);
    const summary1 = result1.nextState.bigWorldRuntime?.worldGraphSummary;

    const state2 = createTestState(seed);
    const result2 = advanceGameDaysWithSummary(state2, 3);
    const summary2 = result2.nextState.bigWorldRuntime?.worldGraphSummary;

    expect(summary1).toBeDefined();
    expect(summary2).toBeDefined();
    expect(summary1!.listingCount).toBe(summary2!.listingCount);
    expect(summary1!.brokerCount).toBe(summary2!.brokerCount);
    expect(summary1!.acnCount).toBe(summary2!.acnCount);
  });

  it('rebuildWorldGraphSummary mutates runtime state in place', () => {
    const state = createTestState();
    expect(state.bigWorldRuntime.worldGraphSummary).toBeUndefined();

    rebuildWorldGraphSummary(state);

    const summary = state.bigWorldRuntime.worldGraphSummary;
    expect(summary).toBeDefined();
    expect(summary!.listingCount).toBeGreaterThan(0);
  });

  it('buildWorldGraph produces nodes for multiple entity kinds', () => {
    const state = createTestState();
    const graph = buildWorldGraph(state);

    const kinds = new Set(graph.nodes.map((n) => n.kind));
    expect(kinds.has('listing')).toBe(true);
    expect(kinds.has('market_cell')).toBe(true);

    for (const node of graph.nodes) {
      expect(node.id).toBeTruthy();
    }

    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.sourceId) || edge.sourceId.startsWith('wg-')).toBe(true);
    }
  });

  it('buildWorldGraphSummary includes per-kind counts and market cell summaries', () => {
    const state = createTestState();
    const graph = buildWorldGraph(state);
    const summary = buildWorldGraphSummary(graph, state);

    expect(summary.listingCount).toBeGreaterThan(0);
    expect(summary.marketCellCount).toBeGreaterThan(0);
    expect(summary.marketCellSummaries.length).toBeGreaterThan(0);

    const firstCell = summary.marketCellSummaries[0];
    expect(firstCell.cellId).toBeTruthy();
    expect(firstCell.heat).toBeGreaterThanOrEqual(0);
  });

  it('coSaleEdgeCount and rivalEdgeCount are non-negative', () => {
    const state = createTestState();
    const graph = buildWorldGraph(state);
    const summary = buildWorldGraphSummary(graph, state);

    expect(summary.coSaleEdgeCount).toBeGreaterThanOrEqual(0);
    expect(summary.rivalEdgeCount).toBeGreaterThanOrEqual(0);
  });
});
