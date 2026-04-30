import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceDays, advanceOneDay, executeAction, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { addDays } from '../src/selling-houses/domain/utils.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

const world = createInitialState(snapshot, 20260421);
seedInitialOpportunities(world);
updateDerivedState(world);

const negotiationCase = world.cases[0];
assert.ok(negotiationCase, 'Expected at least one case to prepare negotiation matter');
const negotiationOpportunity = world.opportunities.find((entry) => entry.caseId === negotiationCase.id && entry.status === 'active');
assert.ok(negotiationOpportunity, 'Expected active opportunity to prepare negotiation matter');
if (!negotiationOpportunity) {
  throw new Error('Expected active opportunity to prepare negotiation matter');
}

negotiationCase.askPrice = negotiationCase.marketPrice;
negotiationCase.trust = 100;
negotiationCase.competitiveness = 100;
negotiationCase.hasCompletedFirstVisit = true;
negotiationCase.stageIndex = 5;
negotiationCase.offers = Math.max(1, negotiationCase.offers || 0);
negotiationOpportunity.intent = 100;
negotiationOpportunity.confidence = 100;
negotiationOpportunity.stageIndex = 5;
negotiationOpportunity.daysLeft = 3;
updateDerivedState(world);

assert.equal(
  executeAction(world, 'invite-customer-negotiation', negotiationCase, 'close'),
  true,
  'Expected negotiation action to create a pending negotiation matter before daily settlement',
);

const pendingNegotiationMatter = world.matters.find((entry) => entry.scene === 'negotiation' && entry.caseId === negotiationCase.id);
assert.ok(pendingNegotiationMatter, 'Expected pending negotiation matter before daily settlement');

const startingDay = world.day;
const result = advanceOneDay(world);

assert.ok(result, 'Expected advanceOneDay to return a structured daily tick result');
assert.equal(result.day, startingDay, 'Expected daily tick result to describe the day that was just settled');
assert.ok(Array.isArray(result.emittedEvents), 'Expected daily tick result to contain emitted events');
assert.ok(Array.isArray(result.closedDeals), 'Expected daily tick result to contain closed deals');
assert.ok(result.dirtyScopes, 'Expected daily tick result to contain dirty scope summary');
assert.ok(Array.isArray(result.dirtyScopes.cases), 'Expected daily tick result to expose dirty case ids');
assert.ok(Array.isArray(result.dirtyScopes.opportunities), 'Expected daily tick result to expose dirty opportunity ids');
assert.ok(Array.isArray(result.dirtyScopes.matters), 'Expected daily tick result to expose dirty matter ids');
assert.ok(Array.isArray(result.dirtyScopes.customers), 'Expected daily tick result to expose dirty customer ids');
assert.ok(Array.isArray(result.dirtyScopes.owners), 'Expected daily tick result to expose dirty owner refs');
assert.ok(Array.isArray(result.dirtyScopes.districts), 'Expected daily tick result to expose dirty districts');
assert.ok(Array.isArray(result.dirtyScopes.marketCells), 'Expected daily tick result to expose dirty market cells');
assert.ok(Array.isArray(result.invariantAlerts), 'Expected daily tick result to contain invariant alerts array');
assert.ok(result.report, 'Expected daily tick result to contain daily report snapshot');
assert.ok(
  result.dirtyScopes.matters.includes(pendingNegotiationMatter.id),
  'Expected daily tick result to mark the resolved negotiation matter as dirty',
);
assert.ok(
  result.dirtyScopes.customers.includes(negotiationOpportunity.customerId),
  'Expected daily tick result to mark the negotiation customer as dirty',
);
assert.ok(
  result.dirtyScopes.owners.includes(negotiationCase.ownerName),
  'Expected daily tick result to mark the negotiation owner as dirty',
);
assert.ok(
  result.dirtyScopes.districts.includes(negotiationCase.district),
  'Expected daily tick result to mark the affected district as dirty',
);
assert.ok(
  result.dirtyScopes.marketCells.includes(negotiationCase.marketCellId),
  'Expected daily tick result to mark the affected market cell as dirty',
);
assert.ok(
  result.closedDeals.some((entry) => entry.sourceRelationId === negotiationOpportunity.id),
  'Expected daily tick result to expose the closed deal produced by pending negotiation settlement',
);
assert.equal(world.currentReport?.day, startingDay, 'Expected world current report to stay aligned with settled day');
assert.equal(world.lastDailyTickResult?.day, startingDay, 'Expected world to retain the latest structured daily tick result');

const world2 = createInitialState(snapshot, 20260422);
seedInitialOpportunities(world2);
updateDerivedState(world2);

advanceDays(world2, 1);
assert.equal(world2.lastDailyTickResult?.day, 1, 'Expected legacy advanceDays to keep latest daily tick result in state');

{
  const singleDayWorld = createInitialState(snapshot, 20260423);
  seedInitialOpportunities(singleDayWorld);
  updateDerivedState(singleDayWorld);

  const beforeDay = singleDayWorld.day;
  const beforeDate = singleDayWorld.currentDate;
  const results = advanceDays(singleDayWorld, 1);

  assert.equal(results.length, 1, 'Expected single-day advance to return exactly one tick result');
  if (!singleDayWorld.gameOver) {
    assert.equal(singleDayWorld.day, beforeDay + 1, 'Expected single-day advance to move to the next day');
  }
  assert.equal(singleDayWorld.currentDate, addDays(beforeDate, 1), 'Expected currentDate to advance by one calendar day');
  assert.equal(singleDayWorld.todayPlan.day, singleDayWorld.day, 'Expected todayPlan to switch to the new day');
  assert.equal(singleDayWorld.energy, singleDayWorld.maxEnergy, 'Expected energy to refill for the new day');
  assert.ok(singleDayWorld.currentReport, 'Expected currentReport after single-day settlement');
  assert.equal(singleDayWorld.lastDailyTickResult?.day, beforeDay, 'Expected lastDailyTickResult to describe the settled day');
  assert.equal(singleDayWorld.lastDailyTickResult?.nextDay, singleDayWorld.day, 'Expected lastDailyTickResult nextDay to match state.day');
}

{
  const weekWorld = createInitialState(snapshot, 20260424);
  seedInitialOpportunities(weekWorld);
  updateDerivedState(weekWorld);

  const beforeDay = weekWorld.day;
  const results = advanceDays(weekWorld, 7);

  if (!weekWorld.gameOver) {
    assert.equal(results.length, 7, 'Expected week advance to settle seven days when game is still running');
    assert.equal(weekWorld.day, beforeDay + 7, 'Expected week advance to move seven days forward');
  } else {
    assert.ok(results.length <= 7, 'Expected game-over week advance to settle no more than seven days');
    assert.ok(weekWorld.day <= weekWorld.maxDay, 'Expected game-over week advance to stop no later than maxDay');
    assert.ok(weekWorld.finalResult, 'Expected game-over week advance to produce a final result');
  }
  assert.equal(weekWorld.todayPlan.day, weekWorld.day, 'Expected week advance todayPlan to match current day');
  assert.ok(weekWorld.currentReport || weekWorld.finalResult, 'Expected week advance to leave a report or final result');
  assert.equal(weekWorld.lastDailyTickResult?.nextDay, weekWorld.day, 'Expected week advance tick nextDay to match state.day');
}

{
  const engineRoot = join(process.cwd(), 'src/selling-houses/domain/engine');
  const sourceFiles: string[] = [];
  const collectSourceFiles = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        collectSourceFiles(path);
      } else if (path.endsWith('.ts') || path.endsWith('.tsx')) {
        sourceFiles.push(path);
      }
    }
  };

  collectSourceFiles(engineRoot);

  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, 'utf8');
    assert.equal(
      /Math\.random|Date\.now/.test(source),
      false,
      `Expected deterministic engine source without Math.random/Date.now: ${sourceFile}`,
    );
  }
}

console.log('selling-houses daily tick contract verification passed');
