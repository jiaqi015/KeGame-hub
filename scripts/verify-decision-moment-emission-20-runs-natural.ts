import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceDays, executeAction } from '../src/selling-houses/domain/engine.js';
import { deriveCaseRecommendations } from '../src/selling-houses/domain/recommendationEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

const EXPECTED_MOMENT_IDS = [
  'first-visit-owner-discovery',
  'pricing-strategy-adjustment',
  'open-day-participation',
  'sincerity-sale-entry',
  'offer-acceptance-negotiation',
];

interface RunRecord {
  runId: number;
  seed: number;
  totalDays: number;
  totalMomentEvents: number;
  momentCounts: Record<string, number>;
  flowProgress: Record<string, { completedStepCount: number; currentStepId: string | null }>;
  error: string | null;
  durationMs: number;
}

function countMomentEvents(state: GameState) {
  const counts: Record<string, number> = {};
  for (const ev of state.eventStore) {
    if (ev.kind === 'decision_moment_triggered') {
      const momentId = (ev.payload as any)?.momentId;
      if (momentId) counts[momentId] = (counts[momentId] || 0) + 1;
    }
  }
  return counts;
}

function runSingleGame(seed: number, runId: number): RunRecord {
  const t0 = Date.now();
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const state = createInitialState(snapshot, seed);
  updateDerivedState(state);

  let error: string | null = null;
  try {
    while (!state.gameOver && state.day <= state.maxDay) {
      updateDerivedState(state);
      const todayTop = deriveCaseRecommendations(state).slice(0, 1);
      const rec = todayTop[0];
      if (rec) {
        const caseItem = state.cases.find((c) => c.id === rec.caseId);
        if (caseItem && caseItem.status === 'active') {
          executeAction(state, rec.primaryAction.actionId, caseItem, rec.primaryAction.optionId || null);
        }
      }
      if (!state.gameOver && state.day < state.maxDay) {
        advanceDays(state, 1);
      } else {
        break;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const momentCounts = countMomentEvents(state);
  const flowProgress: Record<string, { completedStepCount: number; currentStepId: string | null }> = {};
  if (state.flowProgress) {
    for (const [flowId, fp] of Object.entries(state.flowProgress)) {
      flowProgress[flowId] = { completedStepCount: fp.completedStepIds.length, currentStepId: fp.currentStepId };
    }
  }

  return {
    runId,
    seed,
    totalDays: state.day,
    totalMomentEvents: Object.values(momentCounts).reduce((a, b) => a + b, 0),
    momentCounts,
    flowProgress,
    error,
    durationMs: Date.now() - t0,
  };
}

function main() {
  const outDir = resolve('artifacts/decision-moment-emission');
  mkdirSync(outDir, { recursive: true });

  const records: RunRecord[] = [];

  for (let runId = 1; runId <= 20; runId++) {
    const seed = 420000 + runId * 7;
    console.log(`[natural-run ${runId}] seed=${seed} ...`);
    const record = runSingleGame(seed, runId);
    console.log(`  done: ${record.totalDays} days, ${record.totalMomentEvents} moment events, ${record.durationMs}ms`);
    if (record.error) console.log(`  ERROR: ${record.error}`);
    writeFileSync(resolve(outDir, `natural-run-${runId}.json`), JSON.stringify(record, null, 2));
    records.push(record);
  }

  const globalMomentCounts: Record<string, number> = {};
  for (const r of records) {
    for (const [k, v] of Object.entries(r.momentCounts)) {
      globalMomentCounts[k] = (globalMomentCounts[k] || 0) + v;
    }
  }

  const flowOwnerAlignmentCompleted = records.filter(
    (r) => r.flowProgress['standard-selling']?.completedStepCount >= 1,
  ).length;

  const summary = {
    type: 'natural',
    totalRuns: records.length,
    failedRuns: records.filter((r) => r.error !== null).length,
    globalMomentCounts,
    momentCoverage: Object.fromEntries(
      EXPECTED_MOMENT_IDS.map((id) => [id, (globalMomentCounts[id] || 0) > 0 ? 'covered' : 'NOT_TRIGGERED']),
    ),
    flowStats: {
      standardSelling_ownerAlignmentCompleted: `${flowOwnerAlignmentCompleted}/${records.length}`,
    },
  };

  writeFileSync(resolve(outDir, 'natural-summary.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== NATURAL SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
}

main();
