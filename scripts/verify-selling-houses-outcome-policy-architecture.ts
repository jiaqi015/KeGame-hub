import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function assertIncludes(path: string, needles: string[], note: string) {
  const source = read(path);
  needles.forEach((needle) => {
    assert.ok(source.includes(needle), `${note}: expected ${path} to include ${needle}`);
  });
}

function assertNotIncludes(path: string, needles: string[], note: string) {
  const source = read(path);
  needles.forEach((needle) => {
    assert.ok(!source.includes(needle), `${note}: expected ${path} not to include ${needle}`);
  });
}

assertIncludes('src/selling-houses/domain/engine/actionResolvers.ts', [
  'resolveWithdrawnTerminalOutcome',
], 'withdraw terminal outcome should be delegated to policy');
assertNotIncludes('src/selling-houses/domain/engine/actionResolvers.ts', [
  'neutralWithdrawalTrustThreshold',
  'noRegretWithdrawalTrustThreshold',
], 'action resolver should not own terminal-outcome thresholds');

assertIncludes('src/selling-houses/domain/engine/competitionEngine.ts', [
  'evaluateCompetitionRivalCaseLoss',
], 'competition engine should delegate rival case loss decisions to policy');
assertNotIncludes('src/selling-houses/domain/engine/competitionEngine.ts', [
  'Math.max(readCaseRelationBusinessContextFromRuntime',
  'rivalCaseLossScale',
], 'competition engine should not own trust fallback or rival loss scale logic');

assertIncludes('src/selling-houses/domain/rivals/rivalListingEngine.ts', [
  'evaluateVisibleRivalCaseLoss',
  'getRivalListingStrengthScale',
], 'visible rival listing loss should delegate to policy');
assertNotIncludes('src/selling-houses/domain/rivals/rivalListingEngine.ts', [
  'Math.max(readCaseRelationBusinessContextFromRuntime',
  'function shouldVisibleRivalClosePlayerCase',
], 'visible rival listing engine should not duplicate protection policy');

assertIncludes('src/selling-houses/domain/coreProtectionPolicy.ts', [
  'readCaseRelationBusinessContextFromRuntime',
  'trustSource',
  'evaluateCoreProtection',
  'shouldExtendExpiredCoreWindow',
], 'core protection policy should own relation-backed protection interpretation');

assertIncludes('src/selling-houses/domain/engine/marketEngine.ts', [
  'shouldExtendExpiredCoreWindow',
], 'market engine should delegate expired core window protection');
assertNotIncludes('src/selling-houses/domain/engine/marketEngine.ts', [
  'protectedCoreTrustThreshold',
  'protectedCorePipeline',
  'protectedCoreRelationship',
], 'market engine should not duplicate core protection thresholds');

assertIncludes('src/selling-houses/domain/caseTerminalOutcomePolicy.ts', [
  'evaluateCoreProtection',
  'core withdrawn without rival loss is protected from bad bucket',
], 'terminal outcome policy should delegate relation-backed withdrawal interpretation');

assertIncludes('src/selling-houses/domain/rivals/rivalCaseLossPolicy.ts', [
  'evaluateCompetitionRivalCaseLoss',
  'evaluateVisibleRivalCaseLoss',
  'evaluateCoreProtection',
  'rivalCaseLossScale',
  '../market/marketReadBoundary',
  './rivalOutcomeControlScales',
  './rivalLossProbabilityModel',
], 'rival case loss policy should own shared rival loss orchestration');
assertNotIncludes('src/selling-houses/domain/rivals/rivalCaseLossPolicy.ts', [
  'Math.max(readCaseRelationBusinessContextFromRuntime',
  '../engine/',
  'rawProbabilityBase',
  'const tierBase',
], 'rival case loss policy should use policy/model boundaries without engine imports or inline probability math');

assertIncludes('src/selling-houses/domain/rivals/rivalLossProbabilityModel.ts', [
  'rawProbabilityBase',
  'computeCompetitionRivalLossProbability',
  'computeVisibleRivalLossProbability',
], 'rival loss probability model should own probability math');

assertIncludes('src/selling-houses/domain/engine/actionResolvers.ts', [
  'executeActionWithReceipts',
  'receiptSnapshots',
], 'domain action execution should expose a structured receipt result');
assertIncludes('src/selling-houses/domain/engine.ts', [
  'executeActionWithReceipts',
], 'domain engine barrel should expose structured action execution');
assertIncludes('src/selling-houses/application/gameTransitions.ts', [
  'executeActionWithReceipts',
  'actionResult.receiptSnapshots',
], 'application transition should consume receipt snapshots from the action result');
assertNotIncludes('src/selling-houses/application/gameTransitions.ts', [
  'popPendingActionReceiptSnapshots',
], 'application transition should not depend on legacy pending receipt queue');
assertIncludes('src/selling-houses/application/localAdversarialSelfPlayArena.ts', [
  'executeActionWithReceipts',
], 'self-play should avoid legacy pending receipt queue');
assertIncludes('scripts/run-selling-houses-outcome-lab.ts', [
  'executeActionWithReceipts',
], 'outcome lab should avoid legacy pending receipt queue');

assertIncludes('src/selling-houses/domain/scenario-generation/scenarioAssembler.ts', [
  'mergeScenarioRuleAdjustments',
  'outcomeControl: {',
  '...(profile.ruleAdjustments.outcomeControl || {})',
  '...(blueprint.ruleAdjustments?.outcomeControl || {})',
], 'generated scenario rules should deep merge difficulty and blueprint outcomeControl overrides');

assertIncludes('scripts/run-50-game-evaluation.ts', [
  './selling-houses-evaluation-runner',
], '50-game evaluation should use shared runner');
assertIncludes('scripts/run-1000-game-evaluation.ts', [
  './selling-houses-evaluation-runner',
], '1000-game evaluation should use shared runner');
assertIncludes('scripts/run-10000-game-evaluation.ts', [
  './selling-houses-evaluation-runner',
], '10000-game evaluation should use shared runner');
assertIncludes('scripts/selling-houses-evaluation-runner.ts', [
  'plannedTotalRuns',
], 'shared evaluation runner should derive progress totals from the resolved seed plan');
assertNotIncludes('scripts/selling-houses-evaluation-runner.ts', [
  'totalRunsLabel',
], 'shared evaluation runner should not accept fixed run-count labels that can drift from real seeds');
assertNotIncludes('scripts/run-50-game-evaluation.ts', [
  'interface DifficultyReport',
  'function runEvaluation',
  'function generateReport',
  'totalRunsLabel',
], '50-game evaluation should not duplicate runner internals');
assertNotIncludes('scripts/run-1000-game-evaluation.ts', [
  'interface DifficultyReport',
  'function runEvaluation',
  'function generateReport',
  'totalRunsLabel',
], '1000-game evaluation should not duplicate runner internals');
assertNotIncludes('scripts/run-10000-game-evaluation.ts', [
  'interface DifficultyReport',
  'function runEvaluation',
  'function generateReport',
  'totalRunsLabel',
], '10000-game evaluation should not duplicate runner internals');

console.log('selling-houses outcome policy architecture verification passed');
