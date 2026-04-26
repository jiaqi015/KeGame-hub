import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceGameDaysWithSummary } from '../src/selling-houses/application/gameTransitions.js';
import { resolveDashboardSelectedDayAfterStateDayChange } from '../src/selling-houses/ui/features/Dashboard.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { addDays } from '../src/selling-houses/domain/utils.js';

function createWorld(seed: number) {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

{
  const world = createWorld(20260425);
  const beforeDay = world.day;
  const beforeDate = world.currentDate;
  const beforePlanDay = world.todayPlan.day;

  const summary = advanceGameDaysWithSummary(world, 1);
  const next = summary.nextState;

  assert.notEqual(next, world, 'Expected application transition to return a cloned state');
  assert.equal(world.day, beforeDay, 'Expected application transition not to mutate input day');
  assert.equal(world.currentDate, beforeDate, 'Expected application transition not to mutate input date');
  assert.equal(world.todayPlan.day, beforePlanDay, 'Expected application transition not to mutate input todayPlan');

  assert.equal(summary.requestedDays, 1, 'Expected single-day summary to record requested days');
  assert.equal(summary.settledDays, 1, 'Expected single-day summary to settle one day');
  assert.equal(summary.beforeDay, beforeDay, 'Expected single-day summary beforeDay to match input day');
  assert.equal(summary.afterDay, beforeDay + 1, 'Expected single-day summary afterDay to advance by one');
  assert.equal(summary.lastResult?.day, beforeDay, 'Expected single-day summary lastResult to describe settled day');
  assert.equal(summary.lastResult?.nextDay, next.day, 'Expected single-day summary lastResult nextDay to match next state');

  assert.equal(next.day, beforeDay + 1, 'Expected single-day advance to move to next day');
  assert.equal(next.currentDate, addDays(beforeDate, 1), 'Expected single-day advance to move currentDate by one day');
  assert.equal(next.todayPlan.day, next.day, 'Expected single-day todayPlan to switch to new day');
  assert.ok(next.todayPlan.playerItems.every((item) => item.day === next.day), 'Expected todayPlan items not to leak from older days');
  assert.equal(next.energy, next.maxEnergy, 'Expected energy to refill after daily advance');
  assert.ok(next.currentReport, 'Expected single-day advance to leave a daily report');
  assert.equal(next.currentReport?.day, beforeDay, 'Expected daily report to describe settled day');
  assert.equal(next.lastDailyTickResult?.day, beforeDay, 'Expected lastDailyTickResult to describe settled day');
  assert.equal(next.lastDailyTickResult?.nextDay, next.day, 'Expected lastDailyTickResult nextDay to match current day');
}

{
  const world = createWorld(20260426);
  const beforeDay = world.day;
  const beforeDate = world.currentDate;

  const summary = advanceGameDaysWithSummary(world, 7);
  const next = summary.nextState;

  assert.notEqual(next, world, 'Expected week transition to return a cloned state');
  assert.equal(world.day, beforeDay, 'Expected week transition not to mutate input day');
  assert.equal(summary.requestedDays, 7, 'Expected week summary to record requested days');

  if (!summary.gameOver) {
    assert.equal(summary.settledDays, 7, 'Expected week summary to settle seven days when game continues');
    assert.equal(summary.afterDay, beforeDay + 7, 'Expected week summary afterDay to advance by seven');
    assert.equal(next.day, beforeDay + 7, 'Expected week advance to move seven days forward');
    assert.equal(next.currentDate, addDays(beforeDate, 7), 'Expected week advance to move currentDate by seven days');
    assert.equal(next.lastDailyTickResult?.day, beforeDay + 6, 'Expected last tick to describe the seventh settled day');
  } else {
    assert.ok(summary.settledDays <= 7, 'Expected game-over week summary to settle no more than requested days');
    assert.ok(next.day <= next.maxDay, 'Expected game-over week advance to stop no later than maxDay');
    assert.ok(next.finalResult, 'Expected game-over week advance to produce final result');
  }

  assert.equal(next.todayPlan.day, next.day, 'Expected week todayPlan to match current day');
  assert.ok(next.todayPlan.playerItems.every((item) => item.day === next.day), 'Expected week todayPlan items to match current day');
  assert.equal(next.lastDailyTickResult?.nextDay, next.day, 'Expected week tick nextDay to match current day');
}

{
  const dayTwoSummary = advanceGameDaysWithSummary(createWorld(20260427), 1);
  const dayTwoWorld = dayTwoSummary.nextState;
  assert.equal(dayTwoWorld.day, 2, 'Expected setup world to reach Day 2 before week-advance contract');

  const weekSummary = advanceGameDaysWithSummary(dayTwoWorld, 7);
  const next = weekSummary.nextState;

  assert.equal(weekSummary.requestedDays, 7, 'Expected Day 2 week advance to request seven settled days');
  assert.equal(weekSummary.beforeDay, 2, 'Expected Day 2 week advance to start from Day 2');
  assert.equal(weekSummary.settledDays, 7, 'Expected Day 2 week advance to settle seven natural days');
  assert.equal(weekSummary.afterDay, 9, 'Expected Day 2 plus seven settled days to land on Day 9');
  assert.equal(next.day, 9, 'Expected Day 2 week advance to land on Day 9, not Day 7 or Day 8');
  assert.equal(next.lastDailyTickResult?.day, 8, 'Expected Day 2 week advance to settle through Day 8');
  assert.equal(next.lastDailyTickResult?.nextDay, 9, 'Expected final Day 2 week tick to point to Day 9');
}

{
  assert.equal(
    resolveDashboardSelectedDayAfterStateDayChange(1, 2, 1),
    2,
    'Expected Dashboard selected day to follow a one-day advance',
  );
  assert.equal(
    resolveDashboardSelectedDayAfterStateDayChange(5, 8, 5),
    8,
    'Expected Dashboard selected day to follow a week advance',
  );
  assert.equal(
    resolveDashboardSelectedDayAfterStateDayChange(1, 1, 1),
    1,
    'Expected Dashboard to preserve manual selected day when state day has not changed',
  );
}

console.log('selling-houses time advance invariants passed');
