import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceGameDays, advanceGameDaysWithSummary, executeGameAction } from '../src/selling-houses/application/gameTransitions.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { setBrokerOwnerTrust } from '../src/selling-houses/domain/trustWriteHelper.js';
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
setBrokerOwnerTrust(world, negotiationCase, 100, 'test setup: high confidence negotiation');
negotiationCase.competitiveness = 100;
negotiationCase.hasCompletedFirstVisit = true;
negotiationCase.stageIndex = 5;
negotiationCase.offers = Math.max(1, negotiationCase.offers || 0);
negotiationOpportunity.intent = 100;
negotiationOpportunity.confidence = 100;
negotiationOpportunity.stageIndex = 5;
negotiationOpportunity.daysLeft = 3;
updateDerivedState(world);

const actionResult = executeGameAction(world, 'invite-customer-negotiation', negotiationCase.id, 'close');
assert.equal(
  actionResult.success,
  true,
  'Expected negotiation action to create a pending negotiation matter before daily settlement',
);

const afterAction = actionResult.nextState;
const pendingNegotiationMatter = afterAction.matters.find((entry) => entry.scene === 'negotiation' && entry.caseId === negotiationCase.id);
assert.ok(pendingNegotiationMatter, 'Expected pending negotiation matter before daily settlement');

const startingDay = afterAction.day;
const summary = advanceGameDaysWithSummary(afterAction, 1);

assert.ok(summary.settledResults.length >= 1, 'Expected at least one settled result from single-day advance');
const result = summary.settledResults[0];

assert.ok(result, 'Expected advanceOneDay to return a structured daily tick result');
assert.equal(result.day, startingDay, 'Expected daily tick result to describe the day that was just settled');
assert.ok(Array.isArray(result.emittedEvents), 'Expected daily tick result to contain emitted events');
assert.ok(Array.isArray(result.closedDeals), 'Expected daily tick result to contain closed deals');
assert.ok(Array.isArray(result.processResults), 'Expected daily tick result to contain process manager summaries');
assert.ok(
  Array.isArray(result.settledDayProcessResults),
  'Expected daily tick result to contain settled-day process manager summaries',
);
assert.ok(
  Array.isArray(result.nextDaySetupProcessResults),
  'Expected daily tick result to contain next-day setup process manager summaries',
);
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
assert.ok(
  result.processResults.some((entry) =>
    entry.managerId === 'negotiation-process-manager'
    && entry.day === result.day
    && entry.phase === 'settled-day'
    && entry.opportunityIds.includes(negotiationOpportunity.id)
    && entry.closedDealIds.some((dealId) => dealId.includes(negotiationCase.id))),
  'Expected daily tick result to expose the negotiation process manager summary',
);
assert.deepEqual(
  result.settledDayProcessResults.map((entry) => ({ managerId: entry.managerId, day: entry.day, phase: entry.phase })),
  [{ managerId: 'negotiation-process-manager', day: result.day, phase: 'settled-day' }],
  'Expected settled-day grouped process results to contain only the negotiation settlement row',
);
assert.deepEqual(
  result.nextDaySetupProcessResults.map((entry) => ({ managerId: entry.managerId, day: entry.day, phase: entry.phase })),
  [{ managerId: 'product-run-process-manager', day: result.nextDay, phase: 'next-day-setup' }],
  'Expected next-day setup grouped process results to contain only the product-run setup row',
);
assert.equal(summary.nextState.currentReport?.day, startingDay, 'Expected world current report to stay aligned with settled day');
assert.equal(summary.nextState.lastDailyTickResult?.day, startingDay, 'Expected world to retain the latest structured daily tick result');

const world2 = createInitialState(snapshot, 20260422);
seedInitialOpportunities(world2);
updateDerivedState(world2);

const advanced2 = advanceGameDays(world2, 1);
assert.equal(advanced2.lastDailyTickResult?.day, 1, 'Expected legacy advanceDays to keep latest daily tick result in state');

{
  const singleDayWorld = createInitialState(snapshot, 20260423);
  seedInitialOpportunities(singleDayWorld);
  updateDerivedState(singleDayWorld);

  const beforeDay = singleDayWorld.day;
  const beforeDate = singleDayWorld.currentDate;
  const advanced = advanceGameDays(singleDayWorld, 1);

  if (!advanced.gameOver) {
    assert.equal(advanced.day, beforeDay + 1, 'Expected single-day advance to move to the next day');
  }
  assert.equal(advanced.currentDate, addDays(beforeDate, 1), 'Expected currentDate to advance by one calendar day');
  assert.equal(advanced.todayPlan.day, advanced.day, 'Expected todayPlan to switch to the new day');
  assert.equal(advanced.energy, advanced.maxEnergy, 'Expected energy to refill for the new day');
  assert.ok(advanced.currentReport, 'Expected currentReport after single-day settlement');
  assert.equal(advanced.lastDailyTickResult?.day, beforeDay, 'Expected lastDailyTickResult to describe the settled day');
  assert.equal(advanced.lastDailyTickResult?.nextDay, advanced.day, 'Expected lastDailyTickResult nextDay to match state.day');
}

{
  const weekWorld = createInitialState(snapshot, 20260424);
  seedInitialOpportunities(weekWorld);
  updateDerivedState(weekWorld);

  const beforeDay = weekWorld.day;
  const advanced = advanceGameDays(weekWorld, 7);

  if (!advanced.gameOver) {
    assert.equal(advanced.day, beforeDay + 7, 'Expected week advance to move seven days forward');
  } else {
    assert.ok(advanced.day <= advanced.maxDay, 'Expected game-over week advance to stop no later than maxDay');
    assert.ok(advanced.finalResult, 'Expected game-over week advance to produce a final result');
  }
  assert.equal(advanced.todayPlan.day, advanced.day, 'Expected week advance todayPlan to match current day');
  assert.ok(advanced.currentReport || advanced.finalResult, 'Expected week advance to leave a report or final result');
  assert.equal(advanced.lastDailyTickResult?.nextDay, advanced.day, 'Expected week advance tick nextDay to match state.day');
}

// Domain boundary assertion: engine.ts must not directly import runtime process managers
{
  const engineSource = readFileSync(join(process.cwd(), 'src/selling-houses/domain/engine.ts'), 'utf8');
  const hasRuntimeProcessImport = /from\s+['"].*runtime\/simulation\/processes/.test(engineSource);
  assert.equal(hasRuntimeProcessImport, false, 'Expected engine.ts not to directly import runtime process managers');
  const hasFacadeImport = /from\s+['"].*processManagerFacade/.test(engineSource);
  assert.equal(hasFacadeImport, true, 'Expected engine.ts to import processManagerFacade as the sole bridge');
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
