import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceDays, executeAction, getActionAvailability } from '../src/selling-houses/domain/engine.js';
import { deriveCaseRecommendations } from '../src/selling-houses/domain/recommendationEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { DECISION_MOMENTS } from '../src/selling-houses/core/business-rules/index.js';
import { refreshOpportunityLabel } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

const EXPECTED_MOMENT_IDS = [
  'first-visit-owner-discovery',
  'pricing-strategy-adjustment',
  'open-day-participation',
  'sincerity-sale-entry',
  'offer-acceptance-negotiation',
];

function buildTriggerLookup(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const moment of DECISION_MOMENTS) {
    for (const actionId of moment.triggerActionIds) {
      (map[actionId] ??= []).push(moment.id);
    }
  }
  return map;
}

const TRIGGER_LOOKUP = buildTriggerLookup();

const ALL_MOMENT_TRIGGER_ACTION_IDS = [...new Set(
  DECISION_MOMENTS.flatMap((m) => m.triggerActionIds),
)];

interface RunRecord {
  runId: number;
  difficulty: string;
  seed: number;
  totalDays: number;
  totalMomentEvents: number;
  momentCounts: Record<string, number>;
  flowProgress: Record<string, { completedStepCount: number; currentStepId: string | null }>;
  error: string | null;
  consistencyViolations: string[];
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

function checkConsistency(state: GameState): string[] {
  const violations: string[] = [];
  for (const ev of state.eventStore) {
    if (ev.kind !== 'decision_moment_triggered') continue;
    const actionId = (ev.payload as any)?.actionId;
    const momentId = (ev.payload as any)?.momentId;
    if (!actionId || !momentId) {
      violations.push(`Event ${ev.id}: missing actionId or momentId in payload`);
      continue;
    }
    const allowedMoments = TRIGGER_LOOKUP[actionId];
    if (!allowedMoments || !allowedMoments.includes(momentId)) {
      violations.push(`Event ${ev.id}: actionId '${actionId}' not in triggerActionIds for momentId '${momentId}'`);
    }
  }
  return violations;
}

function forceUnlockAction(state: GameState, actionId: string): boolean {
  const activeCases = state.cases.filter((c) => c.status === 'active');
  for (const caseItem of activeCases) {
    if (caseItem.touchedOwnerToday) caseItem.touchedOwnerToday = false;
    if (caseItem.touchedToday) caseItem.touchedToday = false;
    caseItem.actionsToday = 0;

    if (actionId === 'open-day') {
      caseItem.hasCompletedFirstVisit = true;
      caseItem.openDayCooldown = 0;
      caseItem.stageIndex = Math.max(caseItem.stageIndex, 2);
      state.energy = Math.max(state.energy, 3);
    }
    if (actionId === 'sincerity-sale') {
      caseItem.hasCompletedFirstVisit = true;
      caseItem.stageIndex = Math.max(caseItem.stageIndex, 4);
      caseItem.offers = Math.max(caseItem.offers, 1);
      for (const opp of state.opportunities) {
        if (opp.caseId === caseItem.id && opp.status === 'active') {
          opp.stageIndex = Math.max(opp.stageIndex, 4);
          refreshOpportunityLabel(state, opp);
        }
      }
    }
    if (actionId === 'invite-customer-negotiation') {
      caseItem.hasCompletedFirstVisit = true;
      caseItem.stageIndex = Math.max(caseItem.stageIndex, 5);
      caseItem.offers = Math.max(caseItem.offers, 1);
      for (const opp of state.opportunities) {
        if (opp.caseId === caseItem.id && opp.status === 'active') {
          opp.stageIndex = Math.max(opp.stageIndex, 5);
          refreshOpportunityLabel(state, opp);
        }
      }
    }
    if (actionId === 'ask-psychological-price') {
      caseItem.hasCompletedFirstVisit = true;
    }

    updateDerivedState(state);
    const availability = getActionAvailability(state, caseItem, actionId);
    if (availability.enabled) {
      const ok = executeAction(state, actionId, caseItem);
      if (ok) return true;
    }
  }
  return false;
}

function tryMomentTriggeringActions(state: GameState): void {
  const alreadyTriggered = new Set<string>();
  for (const ev of state.eventStore) {
    if (ev.kind === 'decision_moment_triggered') {
      alreadyTriggered.add((ev.payload as any)?.actionId);
    }
  }
  for (const actionId of ALL_MOMENT_TRIGGER_ACTION_IDS) {
    if (alreadyTriggered.has(actionId)) continue;

    const activeCases = state.cases.filter((c) => c.status === 'active');
    let executed = false;
    for (const caseItem of activeCases) {
      const availability = getActionAvailability(state, caseItem, actionId);
      if (!availability.enabled) continue;
      const ok = executeAction(state, actionId, caseItem);
      if (ok) { executed = true; break; }
    }
    if (!executed) {
      forceUnlockAction(state, actionId);
    }
  }
}

function runSingleGame(difficulty: string, seed: number, runId: number): RunRecord {
  const t0 = Date.now();
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const state = createInitialState(snapshot, seed);
  updateDerivedState(state);

  let error: string | null = null;
  try {
    while (!state.gameOver && state.day <= state.maxDay) {
      updateDerivedState(state);

      tryMomentTriggeringActions(state);

      const allRecs = deriveCaseRecommendations(state);
      for (const rec of allRecs) {
        const caseItem = state.cases.find((c) => c.id === rec.caseId);
        if (!caseItem || caseItem.status !== 'active') continue;
        const ok = executeAction(state, rec.primaryAction.actionId, caseItem, rec.primaryAction.optionId || null);
        if (ok) break;
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
  const consistencyViolations = checkConsistency(state);
  const flowProgress: Record<string, { completedStepCount: number; currentStepId: string | null }> = {};
  if (state.flowProgress) {
    for (const [flowId, fp] of Object.entries(state.flowProgress)) {
      flowProgress[flowId] = { completedStepCount: fp.completedStepIds.length, currentStepId: fp.currentStepId };
    }
  }

  return {
    runId,
    difficulty,
    seed,
    totalDays: state.day,
    totalMomentEvents: Object.values(momentCounts).reduce((a, b) => a + b, 0),
    momentCounts,
    flowProgress,
    error,
    consistencyViolations,
    durationMs: Date.now() - t0,
  };
}

const RUN_PLAN: Array<{ difficulty: string; count: number }> = [
  { difficulty: 'warmup', count: 1 },
  { difficulty: 'easy', count: 1 },
  { difficulty: 'standard', count: 14 },
  { difficulty: 'advanced', count: 1 },
  { difficulty: 'hard', count: 2 },
  { difficulty: 'extreme', count: 1 },
];

function main() {
  const outDir = resolve('artifacts/decision-moment-emission');
  mkdirSync(outDir, { recursive: true });

  const records: RunRecord[] = [];
  let runId = 1;
  let baselineDuration: number | null = null;

  for (const plan of RUN_PLAN) {
    for (let i = 0; i < plan.count; i++) {
      const seed = 420000 + runId * 7;
      console.log(`[run ${runId}] difficulty=${plan.difficulty} seed=${seed} ...`);
      const record = runSingleGame(plan.difficulty, seed, runId);
      if (runId === 1) baselineDuration = record.durationMs;
      console.log(`  done: ${record.totalDays} days, ${record.totalMomentEvents} moment events, ${record.durationMs}ms`);
      if (record.error) console.log(`  ERROR: ${record.error}`);
      if (record.consistencyViolations.length > 0) console.log(`  CONSISTENCY VIOLATIONS: ${record.consistencyViolations.length}`);
      writeFileSync(resolve(outDir, `run-${runId}.json`), JSON.stringify(record, null, 2));
      records.push(record);
      runId++;
    }
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
    totalRuns: records.length,
    distribution: RUN_PLAN.map((p) => `${p.difficulty}: ${p.count}`).join(', '),
    averageDurationMs: Math.round(records.reduce((a, r) => a + r.durationMs, 0) / records.length),
    baselineDurationMs: baselineDuration,
    maxDurationMs: Math.max(...records.map((r) => r.durationMs)),
    failedRuns: records.filter((r) => r.error !== null).length,
    globalMomentCounts,
    momentCoverage: Object.fromEntries(
      EXPECTED_MOMENT_IDS.map((id) => [id, (globalMomentCounts[id] || 0) > 0 ? 'covered' : 'MISSING']),
    ),
    flowStats: {
      standardSelling_ownerAlignmentCompleted: `${flowOwnerAlignmentCompleted}/${records.length}`,
    },
    consistencyViolations: records.reduce((a, r) => a + r.consistencyViolations.length, 0),
    passCriteria: {
      noCrash: records.every((r) => r.error === null),
      momentCoverage: EXPECTED_MOMENT_IDS.every((id) => (globalMomentCounts[id] || 0) > 0),
      consistency: records.every((r) => r.consistencyViolations.length === 0),
      flowProgress: flowOwnerAlignmentCompleted >= 5,
      performanceBaseline: baselineDuration !== null && baselineDuration > 0
        ? `baseline=${baselineDuration}ms, 1.5x=${Math.round(baselineDuration * 1.5)}ms, max=${Math.max(...records.map((r => r.durationMs)))}ms`
        : 'N/A',
    },
  };

  writeFileSync(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));

  const allPass = summary.passCriteria.noCrash
    && summary.passCriteria.momentCoverage
    && summary.passCriteria.consistency
    && summary.passCriteria.flowProgress
    && (baselineDuration === null || summary.maxDurationMs <= baselineDuration * 1.5);

  if (allPass) {
    console.log('\n✅ ALL CRITERIA PASSED');
  } else {
    console.log('\n❌ SOME CRITERIA FAILED - see summary');
    process.exit(1);
  }
}

main();
