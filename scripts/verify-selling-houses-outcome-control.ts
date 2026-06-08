import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { buildDifficultyPresentation } from '../src/selling-houses/application/difficultyPresentation.js';
import { executeScenarioAction } from '../src/selling-houses/application/gameTransitions.js';
import { buildWeeklySummaryPresentation } from '../src/selling-houses/application/weeklySummary.js';
import { advanceDays, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { BASE_RULES, mergeRules } from '../src/selling-houses/domain/config/baseRules.js';
import { settlePendingDealClosings } from '../src/selling-houses/domain/dealClosing.js';
import { generateScenarioSnapshot, listDifficultyProfiles } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  asWritableCase,
  asWritableOpportunity,
  ensureMarketOutcomeState,
  getAvailableMarketDealSlots,
  releaseMarketDealSlotsForDay,
} from '../src/selling-houses/domain/models.js';
import { sellVisibleRivalForCase } from '../src/selling-houses/domain/rivals/rivalListingEngine.js';
import {
  readRivalOutcomeDiagnostics,
  resetRivalOutcomeDiagnostics,
  tryClaimRivalMarketDealSlot,
} from '../src/selling-houses/domain/engine/outcomeControlRuntime.js';
import { progressCustomerDemand } from '../src/selling-houses/domain/engine/customerEngine.js';
import type { Settlement } from '../src/selling-houses/domain/actions/templates.js';
import {
  evaluateOutcomeTarget,
  evaluateOutcomeTargets,
  OUTCOME_TARGET_METRICS,
  OUTCOME_TARGET_STATUS_VALUES,
  OUTCOME_TARGETS,
  type OutcomeTargetStatus,
} from './selling-houses-outcome-targets.js';
import type {
  DifficultyId,
  GameRuleOverrides,
  GameRules,
  GameState,
  OutcomeControlRules,
  ScenarioSnapshot,
} from '../src/selling-houses/domain/models.js';

const DIFFICULTY_IDS: DifficultyId[] = ['warmup', 'easy', 'standard', 'advanced', 'hard', 'extreme'];

const OUTCOME_CONTROL_FIELDS: Array<keyof OutcomeControlRules> = [
  'simulationDays',
  'marketDealCapacity21d',
  'playerBaseDealExpectation21d',
  'playerBonusDealCapacity21d',
  'playerBonusDealUnlockScore',
  'playerLeadSupplyScale',
  'playerFunnelProgressionScale',
  'playerDealClosingScale',
  'customerStagnationScale',
  'rivalStoreCapabilityScale',
  'rivalDealShareScale',
  'rivalListingSpawnScale',
  'rivalCustomerPullScale',
  'rivalOwnerPressureScale',
  'rivalCaseLossScale',
  'expectedSelfClosedDeals21d',
  'expectedRivalClosedDeals21d',
];

const MARKET_OUTCOME_FIELDS = [
  'totalCapacity21d',
  'playerBaseDealSlots',
  'playerBonusDealSlots',
  'playerClaimedDeals',
  'rivalClaimedDeals',
  'delayedDeals',
  'releasedSlots',
  'slotSchedule',
] as const;

type UnknownRecord = Record<string, unknown>;
type MarketOutcomeRecord = UnknownRecord & {
  totalCapacity21d: number;
  playerBaseDealSlots: number;
  playerBonusDealSlots: number;
  playerClaimedDeals: number;
  rivalClaimedDeals: number;
  delayedDeals: number;
  releasedSlots: number;
  slotSchedule: Array<{ day: number; slots: number }>;
};

type OutcomeControlOverride = GameRuleOverrides & {
  outcomeControl?: Partial<OutcomeControlRules>;
};

interface VerificationFailure {
  section: string;
  message: string;
}

const failures: VerificationFailure[] = [];

function verify(section: string, run: () => void) {
  try {
    run();
    console.log(`✓ ${section}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ section, message });
    console.error(`✗ ${section}: ${message}`);
  }
}

function asRecord(value: unknown, label: string): UnknownRecord {
  assert.equal(typeof value, 'object', `${label} should be an object`);
  assert.notEqual(value, null, `${label} should not be null`);
  assert.equal(Array.isArray(value), false, `${label} should not be an array`);
  return value as UnknownRecord;
}

function assertFiniteNumber(value: unknown, label: string) {
  assert.equal(typeof value, 'number', `${label} should be a number`);
  assert.ok(Number.isFinite(value), `${label} should be finite`);
}

function assertPositiveOrZero(value: unknown, label: string) {
  assertFiniteNumber(value, label);
  assert.ok((value as number) >= 0, `${label} should be >= 0`);
}

function getOutcomeControl(rules: GameRules, label: string): OutcomeControlRules {
  const record = asRecord(rules, label);
  const control = asRecord(record.outcomeControl, `${label}.outcomeControl`);
  OUTCOME_CONTROL_FIELDS.forEach((field) => {
    assertFiniteNumber(control[field], `${label}.outcomeControl.${field}`);
  });
  return control as unknown as OutcomeControlRules;
}

function getStateRecord(state: GameState): UnknownRecord {
  return state as unknown as UnknownRecord;
}

function readMarketOutcome(state: GameState, label: string): MarketOutcomeRecord {
  const stateRecord = getStateRecord(state);
  const marketOutcome = asRecord(stateRecord.marketOutcome, `${label}.marketOutcome`);
  assert.deepEqual(
    Object.keys(marketOutcome).sort(),
    [...MARKET_OUTCOME_FIELDS].sort(),
    `${label}.marketOutcome should keep the persisted structure unchanged`,
  );
  MARKET_OUTCOME_FIELDS.forEach((field) => {
    assert.ok(Object.hasOwn(marketOutcome, field), `${label}.marketOutcome.${field} should exist`);
  });
  assertPositiveOrZero(marketOutcome.totalCapacity21d, `${label}.marketOutcome.totalCapacity21d`);
  assertPositiveOrZero(marketOutcome.playerBaseDealSlots, `${label}.marketOutcome.playerBaseDealSlots`);
  assertPositiveOrZero(marketOutcome.playerBonusDealSlots, `${label}.marketOutcome.playerBonusDealSlots`);
  assertPositiveOrZero(marketOutcome.playerClaimedDeals, `${label}.marketOutcome.playerClaimedDeals`);
  assertPositiveOrZero(marketOutcome.rivalClaimedDeals, `${label}.marketOutcome.rivalClaimedDeals`);
  assertPositiveOrZero(marketOutcome.delayedDeals, `${label}.marketOutcome.delayedDeals`);
  assertPositiveOrZero(marketOutcome.releasedSlots, `${label}.marketOutcome.releasedSlots`);
  assert.ok(Array.isArray(marketOutcome.slotSchedule), `${label}.marketOutcome.slotSchedule should be an array`);
  const slotSchedule = marketOutcome.slotSchedule.map((entry, index) => {
    const record = asRecord(entry, `${label}.marketOutcome.slotSchedule[${index}]`);
    assertFiniteNumber(record.day, `${label}.marketOutcome.slotSchedule[${index}].day`);
    assertPositiveOrZero(record.slots, `${label}.marketOutcome.slotSchedule[${index}].slots`);
    return {
      day: record.day as number,
      slots: record.slots as number,
    };
  });
  return {
    ...marketOutcome,
    totalCapacity21d: marketOutcome.totalCapacity21d as number,
    playerBaseDealSlots: marketOutcome.playerBaseDealSlots as number,
    playerBonusDealSlots: marketOutcome.playerBonusDealSlots as number,
    playerClaimedDeals: marketOutcome.playerClaimedDeals as number,
    rivalClaimedDeals: marketOutcome.rivalClaimedDeals as number,
    delayedDeals: marketOutcome.delayedDeals as number,
    releasedSlots: marketOutcome.releasedSlots as number,
    slotSchedule,
  };
}

function cloneScenarioWithOutcomeControl(
  snapshot: ScenarioSnapshot,
  outcomeControl: Partial<OutcomeControlRules>,
): ScenarioSnapshot {
  return {
    ...snapshot,
    scenario: {
      ...snapshot.scenario,
      rules: {
        ...(snapshot.scenario.rules || {}),
        outcomeControl: {
          ...(snapshot.scenario.rules?.outcomeControl || {}),
          ...outcomeControl,
        },
      },
    },
  };
}

function createGeneratedState(
  difficultyId: DifficultyId = 'standard',
  seed = 20260424,
  outcomeControl?: Partial<OutcomeControlRules>,
) {
  const snapshot = generateScenarioSnapshot({ difficultyId, seed });
  const effectiveSnapshot = outcomeControl ? cloneScenarioWithOutcomeControl(snapshot, outcomeControl) : snapshot;
  const state = createInitialState(effectiveSnapshot, seed);
  seedInitialOpportunities(state);
  updateDerivedState(state);
  return state;
}

function assertCompleteOutcomeControl(control: OutcomeControlRules, label: string) {
  OUTCOME_CONTROL_FIELDS.forEach((field) => {
    assertFiniteNumber(control[field], `${label}.${field}`);
  });
}

function assertSourceIncludes(filePath: string, snippets: string[], section: string) {
  const source = readFileSync(filePath, 'utf8');
  snippets.forEach((snippet) => {
    assert.ok(source.includes(snippet), `${section} should include ${snippet} in ${filePath}`);
  });
  return source;
}

function assertSourceDoesNotInclude(filePath: string, snippets: string[], section: string) {
  const source = readFileSync(filePath, 'utf8');
  snippets.forEach((snippet) => {
    assert.equal(source.includes(snippet), false, `${section} should not include stale pattern ${snippet} in ${filePath}`);
  });
}

function assertPresentationDirection(
  difficultyId: DifficultyId,
  rules: GameRules,
) {
  const presentation = buildDifficultyPresentation({ difficultyId, rules });
  const control = rules.outcomeControl;
  const text = [
    presentation.summary,
    ...presentation.details,
    ...presentation.chips.map((entry) => entry.label),
    ...Object.values(presentation.metrics).map(String),
  ].join(' ');

  assert.equal(presentation.metrics.days, control.simulationDays || rules.maxDay, `${difficultyId} days should follow outcomeControl`);
  assert.ok(presentation.summary.length <= 70, `${difficultyId} summary should be concise`);
  presentation.details.forEach((detail, index) => {
    assert.ok(detail.length <= 32, `${difficultyId} detail[${index}] should be concise`);
  });

  if (control.playerBaseDealExpectation21d >= 2) {
    assert.match(text, /机会较高|较充足|默认约 2 套/, `${difficultyId} should present wider player deal space`);
  } else if (control.playerBaseDealExpectation21d >= 1) {
    assert.match(text, /成交转化率|默认约 1 套|默认约 1\.?\d* 套/, `${difficultyId} should present around one deal`);
  } else if (control.playerBaseDealExpectation21d >= 0.7) {
    assert.match(text, /成交转化率|略低于标准|推进到底|默认约 0\.?\d* 套/, `${difficultyId} should present tighter-than-standard deal space`);
  } else {
    assert.match(text, /成交转化率|很少|很紧|默认约 0\.?\d* 套/, `${difficultyId} should present scarce deal space`);
  }

  const rivalScale = (control.rivalStoreCapabilityScale + control.rivalDealShareScale) / 2;
  if (rivalScale < 0.85) {
    assert.match(text, /对手.*较弱|压力较弱/, `${difficultyId} should present weak rivals`);
  } else if (rivalScale <= 1.1) {
    assert.match(text, /对手.*正常|正常竞争/, `${difficultyId} should present normal rivals`);
  } else if (rivalScale <= 1.3) {
    assert.match(text, /对手.*积极|明显分流/, `${difficultyId} should present active rivals`);
  } else {
    assert.match(text, /对手.*强|拿走市场成交|抢客和成交能力强/, `${difficultyId} should present strong rivals`);
  }

  if (control.playerFunnelProgressionScale >= 1 && control.customerStagnationScale <= 1) {
    assert.match(text, /推进较顺|推进节奏正常/, `${difficultyId} should present smooth or normal customer progression`);
  } else if (control.playerFunnelProgressionScale < 0.9 || control.customerStagnationScale > 1.15) {
    assert.match(text, /卡在|停滞|流失/, `${difficultyId} should present harder customer progression`);
  }

  if (control.playerBonusDealCapacity21d <= 0) {
    assert.match(text, /无额外成交空间/, `${difficultyId} should present no bonus capacity`);
  } else {
    assert.match(text, /多争取|额外/, `${difficultyId} should present bonus capacity`);
  }

  const forbiddenWords = [
    'playerLeadSupplyScale',
    'playerFunnelProgressionScale',
    'rivalStoreCapabilityScale',
    'outcomeControl',
    '地狱',
    '爆肝',
    '极限挑战',
    '秒杀',
    '碾压',
  ];
  forbiddenWords.forEach((word) => {
    assert.equal(text.includes(word), false, `${difficultyId} presentation should not expose or over-market: ${word}`);
  });
}

function assertClaimedDealsWithinCapacity(marketOutcome: MarketOutcomeRecord, label: string) {
  const consumed = marketOutcome.playerClaimedDeals + marketOutcome.rivalClaimedDeals + marketOutcome.delayedDeals;
  assert.ok(consumed <= marketOutcome.totalCapacity21d, `${label} consumed deals should not exceed capacity`);
}

function getActiveCase(state: GameState, label: string) {
  const caseItem = state.cases.find((entry) => entry.status === 'active');
  assert.ok(caseItem, `${label} should have an active case`);
  return caseItem;
}

function getActiveOpportunityForCase(state: GameState, caseId: string, label: string) {
  const opportunity = state.opportunities.find((entry) => entry.caseId === caseId && entry.status === 'active');
  assert.ok(opportunity, `${label} should have an active opportunity`);
  return opportunity;
}

function assertRivalClaimAttemptsForDifficulty(difficultyId: DifficultyId) {
  const seeds = [20260424, 2026042501, 2026042502, 2026042503, 2026042504, 2026042505];
  let totalAttempts = 0;
  let totalSuccesses = 0;
  let totalSamples = 0;
  seeds.forEach((seed) => {
    const state = createGeneratedState(difficultyId, seed);
    resetRivalOutcomeDiagnostics(state);
    advanceDays(state, state.maxDay);
    const diagnostics = readRivalOutcomeDiagnostics(state);
    totalAttempts += diagnostics.rivalClaimAttempts;
    totalSuccesses += diagnostics.rivalClaimSuccesses;
    totalSamples += diagnostics.activeRivalListingSamples;
    assert.ok(diagnostics.noSlotRivalAttempts >= 0, `${difficultyId} should track no-slot rival attempts`);
    assert.ok(diagnostics.rivalClaimDayCount >= 0, `${difficultyId} should track rival claim days`);
    assert.ok(diagnostics.rivalListingLifespanCount >= 0, `${difficultyId} should track rival listing lifespan`);
    assertClaimedDealsWithinCapacity(readMarketOutcome(state, `${difficultyId}FullRun${seed}`), `${difficultyId}FullRun${seed}.marketOutcome`);
  });
  assert.ok(totalAttempts > 0, `${difficultyId} should produce rival claim attempts across fixed seeds`);
  assert.ok(totalSuccesses > 0, `${difficultyId} should produce rival claim successes across fixed seeds`);
  assert.ok(totalSamples > 0, `${difficultyId} should sample active rival listings across fixed seeds`);
}

verify('baseRules exposes complete outcomeControl', () => {
  const control = getOutcomeControl(BASE_RULES, 'BASE_RULES');
  assertCompleteOutcomeControl(control, 'BASE_RULES.outcomeControl');
  assert.equal(control.simulationDays, 21, 'BASE_RULES outcomeControl should default to 21 days');
});

verify('mergeRules deep merges outcomeControl overrides', () => {
  const merged = mergeRules({
    outcomeControl: {
      playerLeadSupplyScale: 1.23,
    },
  } satisfies OutcomeControlOverride);
  const mergedControl = getOutcomeControl(merged, 'mergedRules');
  assert.equal(mergedControl.playerLeadSupplyScale, 1.23, 'override should replace requested field');
  OUTCOME_CONTROL_FIELDS.filter((field) => field !== 'playerLeadSupplyScale').forEach((field) => {
    assert.equal(
      mergedControl[field],
      BASE_RULES.outcomeControl[field],
      `deep merge should preserve ${field}`,
    );
  });

  const legacyMerged = mergeRules({ initialCash: 99 });
  assertCompleteOutcomeControl(getOutcomeControl(legacyMerged, 'legacyMergedRules'), 'legacyMergedRules.outcomeControl');
});

verify('difficultyProfiles route all outcome tuning through ruleAdjustments.outcomeControl', () => {
  const profiles = listDifficultyProfiles();
  assert.deepEqual(
    profiles.map((profile) => profile.id).sort(),
    [...DIFFICULTY_IDS].sort(),
    'Expected every difficulty profile to be present',
  );

  profiles.forEach((profile) => {
    assert.equal(profile.ruleAdjustments.maxDay, 21, `${profile.id} should set formal maxDay to 21`);
    const profileRecord = asRecord(profile.ruleAdjustments, `${profile.id}.ruleAdjustments`);
    const profileControl = asRecord(profileRecord.outcomeControl, `${profile.id}.ruleAdjustments.outcomeControl`);
    assert.ok(
      Object.keys(profileControl).length >= 6,
      `${profile.id} should explicitly tune outcomeControl instead of inheriting the full default curve`,
    );
    const rules = mergeRules(profile.ruleAdjustments);
    const control = getOutcomeControl(rules, `${profile.id}.rules`);
    assertCompleteOutcomeControl(control, `${profile.id}.rules.outcomeControl`);
    assert.equal(control.simulationDays, 21, `${profile.id} should present 21-day simulation`);
  });
});

verify('outcome lab exposes target ranges and status checks', () => {
  DIFFICULTY_IDS.forEach((difficultyId) => {
    const targets = OUTCOME_TARGETS[difficultyId];
    assert.ok(targets, `${difficultyId} should have outcome targets`);
    OUTCOME_TARGET_METRICS.forEach((metric) => {
      const range = targets[metric];
      assertFiniteNumber(range.min, `${difficultyId}.${metric}.min`);
      assertFiniteNumber(range.max, `${difficultyId}.${metric}.max`);
      assert.ok(range.min <= range.max, `${difficultyId}.${metric} target range should be ordered`);
      const passCheck = evaluateOutcomeTarget(difficultyId, metric, (range.min + range.max) / 2);
      assert.ok(OUTCOME_TARGET_STATUS_VALUES.includes(passCheck.status), `${difficultyId}.${metric} status should be valid`);
      assert.ok(['PASS', 'WATCH'].includes(passCheck.status), `${difficultyId}.${metric} in-range status should be valid`);
    });
    const checks = evaluateOutcomeTargets(difficultyId, {
      averageDeals: (targets.averageDeals.min + targets.averageDeals.max) / 2,
      pAtLeastOneSelfClose21d: (targets.pAtLeastOneSelfClose21d.min + targets.pAtLeastOneSelfClose21d.max) / 2,
      averageRivalDeals: (targets.averageRivalDeals.min + targets.averageRivalDeals.max) / 2,
    });
    assert.equal(checks.length, OUTCOME_TARGET_METRICS.length, `${difficultyId} should produce one check per target metric`);
    checks.forEach((check) => {
      assert.ok(OUTCOME_TARGET_STATUS_VALUES.includes(check.status), `${difficultyId}.${check.metric} status should be PASS/WATCH/FAIL`);
    });
  });

  const labSource = assertSourceIncludes('scripts/run-selling-houses-outcome-lab.ts', [
    'targetStatus',
    'targetChecks',
    'printTargetStatusTable',
    'averageRivalListingsActive',
    'averageRivalClaimDay',
    'averageMaxDailyRivalClaims',
    'maxDailyRivalClaimsObserved',
    'averageRivalListingLifespan',
    'averageSlotReleaseDay',
    '| difficulty | metric | actual | target | status |',
  ], 'outcome lab should print target status');
  assert.ok(labSource.includes('evaluateOutcomeTargets'), 'outcome lab should use shared target status evaluation');
});

verify('outcome lab exposes rival slot-flow diagnostics', () => {
  assertSourceIncludes('scripts/run-selling-houses-outcome-lab.ts', [
    'averageAvailableSlotsAtEnd',
    'averageUnclaimedSlotsAtEnd',
    'averageRivalClaimAttempts',
    'averageRivalClaimSuccesses',
    'rivalClaimSuccessRate',
    'averageNoSlotRivalAttempts',
    'averageFailedRivalClaimRolls',
    'averageRivalListingsCreated',
    'averageRivalListingsExpired',
    'averageRivalListingsSold',
    'averageRivalListingsWithdrawn',
    'averageRivalListingsDelayed',
    'averagePlayerConsumedSlots',
    'averageMaxDailyRivalClaims',
    'maxDailyRivalClaimsObserved',
    'printRivalDiagnosticsTable',
  ], 'outcome lab should print rival slot-flow diagnostics');
});

verify('outcome lab writes JSON snapshot schema', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'selling-houses-outcome-lab-'));
  const outputPath = join(tempDir, 'snapshot.json');
  try {
    execFileSync('npx', [
      'tsx',
      'scripts/run-selling-houses-outcome-lab.ts',
      '--runs',
      '1',
      '--json',
      outputPath,
    ], { encoding: 'utf8', stdio: 'pipe' });

    const snapshot = asRecord(JSON.parse(readFileSync(outputPath, 'utf8')), 'jsonSnapshot');
    const metadata = asRecord(snapshot.metadata, 'jsonSnapshot.metadata');
    assert.equal(metadata.runs, 1, 'jsonSnapshot.metadata.runs should match requested runs');
    assert.equal(metadata.seed, 20260424, 'jsonSnapshot.metadata.seed should use default seed');
    assert.equal(typeof metadata.date, 'string', 'jsonSnapshot.metadata.date should be a string');
    assert.equal(typeof metadata.command, 'string', 'jsonSnapshot.metadata.command should be a string');
    assert.ok(String(metadata.command).includes('--json'), 'jsonSnapshot.metadata.command should include json flag');
    assert.equal(typeof metadata.gitCommit, 'string', 'jsonSnapshot.metadata.gitCommit should be a string');
    assert.deepEqual(metadata.difficultyIds, DIFFICULTY_IDS, 'jsonSnapshot.metadata.difficultyIds should list all difficulties');

    assert.ok(Array.isArray(snapshot.summaries), 'jsonSnapshot.summaries should be an array');
    assert.equal(snapshot.summaries.length, DIFFICULTY_IDS.length, 'jsonSnapshot.summaries should include every difficulty');
    snapshot.summaries.forEach((entry, index) => {
      const summary = asRecord(entry, `jsonSnapshot.summaries[${index}]`);
      assert.equal(summary.difficulty, DIFFICULTY_IDS[index], `summary ${index} difficulty should be ordered`);
      assertFiniteNumber(summary.averageDeals, `${summary.difficulty}.averageDeals`);
      assertFiniteNumber(summary.averageRivalDeals, `${summary.difficulty}.averageRivalDeals`);
      assertFiniteNumber(summary.averageNoSlotRivalAttempts, `${summary.difficulty}.averageNoSlotRivalAttempts`);
      assertFiniteNumber(summary.averageMaxDailyRivalClaims, `${summary.difficulty}.averageMaxDailyRivalClaims`);
      assertFiniteNumber(summary.maxDailyRivalClaimsObserved, `${summary.difficulty}.maxDailyRivalClaimsObserved`);
      assert.ok(
        OUTCOME_TARGET_STATUS_VALUES.includes(summary.targetStatus as OutcomeTargetStatus),
        `${summary.difficulty}.targetStatus should be valid`,
      );
      assert.ok(Array.isArray(summary.targetChecks), `${summary.difficulty}.targetChecks should be an array`);
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

verify('marketOutcome initializes deterministic 21-day shared capacity', () => {
  const first = createGeneratedState('standard', 2026042401, {
    playerBaseDealExpectation21d: 0.7,
    marketDealCapacity21d: 4,
  });
  const second = createGeneratedState('standard', 2026042401, {
    playerBaseDealExpectation21d: 0.7,
    marketDealCapacity21d: 4,
  });
  const firstMarket = readMarketOutcome(first, 'firstState');
  const secondMarket = readMarketOutcome(second, 'secondState');

  assert.deepEqual(firstMarket, secondMarket, 'same seed and rules should produce same marketOutcome');
  assert.equal(firstMarket.totalCapacity21d, 4, 'total capacity should follow rules.outcomeControl');
  assert.ok([0, 1].includes(firstMarket.playerBaseDealSlots), '0.7 expectation should deterministically resolve to 0 or 1 base slot');
  assert.equal(firstMarket.playerBonusDealSlots, first.rules.outcomeControl.playerBonusDealCapacity21d);

  const scheduledSlots = firstMarket.slotSchedule.reduce((sum, entry) => sum + entry.slots, 0);
  assert.equal(scheduledSlots, firstMarket.totalCapacity21d, 'slotSchedule should sum to totalCapacity21d');
  firstMarket.slotSchedule.forEach((entry) => {
    assert.ok(entry.day >= 1 && entry.day <= first.rules.outcomeControl.simulationDays, 'slot day should be inside simulation window');
  });
});

verify('daily tick releases market slots and respects capacity', () => {
  const state = createGeneratedState('standard', 2026042402);
  const market = readMarketOutcome(state, 'initialState');
  const firstRelease = market.slotSchedule.find((entry) => entry.slots > 0);
  assert.ok(firstRelease, 'slotSchedule should contain at least one release day');
  advanceDays(state, firstRelease.day);
  const afterRelease = readMarketOutcome(state, 'afterReleaseState');
  assert.ok(
    afterRelease.releasedSlots >= firstRelease.slots,
    'advanceDays should release slots through daily tick, not jump outside the tick loop',
  );

  advanceDays(state, Math.max(0, state.maxDay - state.day + 1));
  const finalMarket = readMarketOutcome(state, 'finalState');
  assertClaimedDealsWithinCapacity(finalMarket, 'finalState.marketOutcome');
});

verify('daily narrative uses the settled day', () => {
  const state = createGeneratedState('standard', 2026042407);
  const settledDay = state.day;
  advanceDays(state, 1);
  assert.equal(state.currentReport?.day, settledDay, 'daily report should describe the settled day');
  assert.equal(state.currentReport?.narrativeLog?.day, settledDay, 'daily narrative should use the settled day');
});

verify('rival future slot reservations delay and convert on release', () => {
  const state = createGeneratedState('hard', 2026042406);
  resetRivalOutcomeDiagnostics(state);
  const market = ensureMarketOutcomeState(state);
  market.totalCapacity21d = 1;
  market.playerClaimedDeals = 0;
  market.rivalClaimedDeals = 0;
  market.delayedDeals = 0;
  market.releasedSlots = 0;
  market.slotSchedule = [{ day: state.day, slots: 1 }];

  const blockedResult = tryClaimRivalMarketDealSlot(state);
  assert.equal(blockedResult.claimed, false, 'plain rival claim should not reserve a future slot');
  assert.equal(blockedResult.waitingForRelease, true, 'plain rival claim may wait without future reservation');
  assert.equal(market.delayedDeals, 0, 'plain rival claim should not create delayed deals');

  const futureResult = tryClaimRivalMarketDealSlot(state, { allowFutureSlot: true });
  assert.equal(futureResult.claimed, true, 'allowFutureSlot should reserve future capacity');
  assert.equal(futureResult.waitingForRelease, true, 'allowFutureSlot claim should mark waiting for release');
  assert.equal(market.delayedDeals, 1, 'future rival claim should preoccupy one delayed deal');
  assert.equal(market.rivalClaimedDeals, 0, 'future rival claim should not count as released rival deal yet');
  assert.equal(getAvailableMarketDealSlots(state), 0, 'delayed deal should occupy available capacity before release');
  assert.equal(readRivalOutcomeDiagnostics(state).delayedDealsCreated, 1, 'future rival claim should count delayed deal creation');

  assert.equal(releaseMarketDealSlotsForDay(state, state.day), 1, 'daily release should release the scheduled slot');
  assert.equal(market.delayedDeals, 0, 'released slot should clear delayed reservation');
  assert.equal(market.rivalClaimedDeals, 1, 'released delayed reservation should convert to rival claimed deal');
  assert.equal(readRivalOutcomeDiagnostics(state).delayedDealsConverted, 1, 'released delayed reservation should count conversion');
  assert.equal(readRivalOutcomeDiagnostics(state).rivalClaimedDealDayBuckets[state.day], 1, 'converted delayed deal should count actual claim day');
  assertClaimedDealsWithinCapacity(readMarketOutcome(state, 'futureSlotState'), 'futureSlotState.marketOutcome');
});

verify('rival claims consume shared slots and respect no-slot branch', () => {
  const noSlotState = createGeneratedState('hard', 2026042404);
  resetRivalOutcomeDiagnostics(noSlotState);
  const noSlotMarket = ensureMarketOutcomeState(noSlotState);
  noSlotMarket.totalCapacity21d = 1;
  noSlotMarket.releasedSlots = 0;
  noSlotMarket.playerClaimedDeals = 1;
  noSlotMarket.rivalClaimedDeals = 0;
  noSlotMarket.delayedDeals = 0;
  const noSlotCase = getActiveCase(noSlotState, 'noSlotState');
  assert.equal(
    sellVisibleRivalForCase(noSlotState, noSlotCase, 'verify no-slot rival sale'),
    false,
    'rival should not sell without an available market slot',
  );
  assert.equal(noSlotMarket.rivalClaimedDeals, 0, 'no-slot rival attempt should not consume rival claimed deals');
  assert.equal(noSlotMarket.delayedDeals, 0, 'full-capacity rival attempt should not create delayed deals');
  assert.equal(getAvailableMarketDealSlots(noSlotState), 0, 'available slots should stay non-negative');
  assert.ok(readRivalOutcomeDiagnostics(noSlotState).noSlotRivalAttempts > 0, 'no-slot branch should be diagnosed');

  const soldState = createGeneratedState('hard', 2026042405);
  resetRivalOutcomeDiagnostics(soldState);
  const soldMarket = ensureMarketOutcomeState(soldState);
  soldMarket.releasedSlots = soldMarket.totalCapacity21d;
  const soldCase = getActiveCase(soldState, 'soldState');
  const beforeRivalDeals = soldMarket.rivalClaimedDeals;
  assert.equal(
    sellVisibleRivalForCase(soldState, soldCase, 'verify rival slot consumption'),
    true,
    'rival should sell when a market slot is available',
  );
  assert.equal(soldMarket.rivalClaimedDeals, beforeRivalDeals + 1, 'rival sold should consume one market slot');
  assertClaimedDealsWithinCapacity(readMarketOutcome(soldState, 'soldState'), 'soldState.marketOutcome');
});

verify('hard and extreme create rival claim attempts', () => {
  assertRivalClaimAttemptsForDifficulty('hard');
  assertRivalClaimAttemptsForDifficulty('extreme');
});

verify('old saves without marketOutcome remain safe', () => {
  const state = createGeneratedState('standard', 2026042403);
  const stateRecord = getStateRecord(state);
  delete stateRecord.marketOutcome;
  assert.doesNotThrow(() => advanceDays(state, 1), 'legacy state without marketOutcome should advance safely');
});

verify('scenario deltas prefer linked opportunity target', () => {
  const state = createGeneratedState('standard', 2026042408);
  const caseItem = getActiveCase(state, 'scenarioDeltaState');
  const targetOpportunity = getActiveOpportunityForCase(state, caseItem.id, 'scenarioDeltaState');
  const fallbackOpportunity = {
    ...targetOpportunity,
    id: `${targetOpportunity.id}-fallback`,
    customerId: `${targetOpportunity.customerId}-fallback`,
    customerName: `${targetOpportunity.customerName} B`,
  };
  state.opportunities.unshift(fallbackOpportunity);

  caseItem.hasCompletedFirstVisit = true;
  asWritableOpportunity(targetOpportunity).stageIndex = 0;
  targetOpportunity.intent = 20;
  targetOpportunity.confidence = 30;
  fallbackOpportunity.stageIndex = 5;
  fallbackOpportunity.intent = 90;
  fallbackOpportunity.confidence = 88;

  const todayPlanItemId = 'verify-scenario-target';
  state.todayPlan = {
    day: state.day,
    playerItems: [{
      id: todayPlanItemId,
      day: state.day,
      linkedActionId: 'showing',
      linkedCaseId: caseItem.id,
      linkedCustomerId: targetOpportunity.customerId,
      linkedOpportunityId: targetOpportunity.id,
      executionMode: 'scenario',
      status: 'planned',
    }],
  };

  const settlement: Settlement = {
    outcome: 'progress',
    title: '验证情景结算',
    summary: '验证情景结算',
    details: [],
    stateDeltas: [
      { field: 'intent', value: 7, label: '意向' },
      { field: 'confidence', value: 8, label: '信心' },
    ],
    nextActionHint: '',
    finalOptionId: null,
  };

  const result = executeScenarioAction(state, 'showing', caseItem.id, settlement, undefined, todayPlanItemId);
  assert.equal(result.success, true, 'scenario action should execute');
  const nextTarget = result.nextState.opportunities.find((entry) => entry.id === targetOpportunity.id);
  const nextFallback = result.nextState.opportunities.find((entry) => entry.id === fallbackOpportunity.id);
  assert.ok(nextTarget, 'target opportunity should remain present');
  assert.ok(nextFallback, 'fallback opportunity should remain present');
  assert.equal(nextTarget.intent, 27, 'linked opportunity intent should receive scenario delta');
  assert.equal(nextTarget.confidence, 38, 'linked opportunity confidence should receive scenario delta');
  assert.equal(nextFallback.intent, 90, 'higher-ranked fallback opportunity should not receive target delta');
  assert.equal(nextFallback.confidence, 88, 'higher-ranked fallback confidence should not receive target delta');
});

verify('customer runtime sync preserves opportunity funnel authority', () => {
  const state = createGeneratedState('standard', 2026042411);
  const caseItem = getActiveCase(state, 'customerFunnelAuthorityState');
  state.cases.forEach((entry) => {
    if (entry.id !== caseItem.id) {
      asWritableCase(entry).status = 'withdrawn';
    }
  });
  const opportunity = getActiveOpportunityForCase(state, caseItem.id, 'customerFunnelAuthorityState');
  const customer = state.customers.find((entry) => entry.id === opportunity.customerId);
  assert.ok(customer, 'target customer profile should exist');
  customer.targetDistrict = caseItem.district;
  const customerState = state.customerStates.find((entry) => entry.customerId === opportunity.customerId);
  assert.ok(customerState, 'target customer runtime should exist');

  asWritableOpportunity(opportunity).stageIndex = 6;
  opportunity.daysLeft = 2;
  opportunity.intent = 88;
  opportunity.confidence = 82;
  customerState.activeCaseIds = [caseItem.id];
  customerState.lastTouchDay = 0;
  customerState.caseStates[caseItem.id] = {
    caseId: caseItem.id,
    fit: opportunity.fit,
    interest: 70,
    confidence: 70,
    stageIndex: 2,
    interactions: 1,
    lastActiveDay: state.day - 1,
    viewed: false,
    offered: false,
    selected: true,
  };

  progressCustomerDemand(state);

  assert.equal(opportunity.stageIndex, 6, 'customer runtime should not regress opportunity stage 6');
  assert.equal(opportunity.daysLeft, 2, 'customer runtime should not reset opportunity daysLeft');
  assertSourceDoesNotInclude('src/selling-houses/domain/engine/customerEngine.ts', [
    'opportunity.stageIndex = runtime.stageIndex;',
    'opportunity.daysLeft = clamp(6 - Math.min(4, runtime.stageIndex)',
  ], 'customer runtime sync should not directly overwrite opportunity funnel');
});

verify('quick matter overlays complete scenario items instead of only closing', () => {
  assertSourceIncludes('src/selling-houses/ui/features/matters/DiagnoseMatterView.tsx', [
    'buildQuickMatterScenarioCompletion',
    'onComplete(completion.settlement, completion.choices, completion.feedbacks)',
  ], 'diagnose matter should commit scenario completion');
  assertSourceIncludes('src/selling-houses/ui/features/matters/ExecuteMatterView.tsx', [
    'buildQuickMatterScenarioCompletion',
    'onComplete(completion.settlement, completion.choices, completion.feedbacks)',
  ], 'execute matter should commit scenario completion');
  assertSourceDoesNotInclude('src/selling-houses/domain/dealClosing.ts', [
    'caseItem.trust < 60',
  ], 'deal closing trust gate should not be hardcoded');
});

verify('pending closing capacity block preserves customer and owner state', () => {
  const state = createGeneratedState('standard', 2026042409);
  const caseItem = getActiveCase(state, 'pendingCapacityState');
  const opportunity = getActiveOpportunityForCase(state, caseItem.id, 'pendingCapacityState');
  asWritableCase(caseItem).trust = 88;
  caseItem.askPrice = caseItem.marketPrice;
  caseItem.competitiveness = 90;
  opportunity.intent = 94;
  opportunity.confidence = 93;
  opportunity.budgetMax = caseItem.askPrice + 100;
  opportunity.pendingClosingEvaluation = true;
  opportunity.pendingClosingStrategyId = 'balanced';
  opportunity.pendingClosingRequestedDay = state.day;

  const market = ensureMarketOutcomeState(state);
  market.totalCapacity21d = 1;
  market.releasedSlots = 0;
  market.playerClaimedDeals = 0;
  market.rivalClaimedDeals = 0;
  market.delayedDeals = 0;
  market.slotSchedule = [{ day: state.day + 1, slots: 1 }];

  const beforeIntent = opportunity.intent;
  const beforeConfidence = opportunity.confidence;
  const beforeTrust = caseItem.trust;
  settlePendingDealClosings(state);

  assert.equal(opportunity.intent, beforeIntent, 'capacity block should not lower customer intent');
  assert.equal(opportunity.confidence, beforeConfidence, 'capacity block should not lower customer confidence');
  assert.equal(caseItem.trust, beforeTrust, 'capacity block should not lower owner trust');
  assert.equal(opportunity.pendingClosingEvaluation, false, 'capacity-blocked pending closing should be cleared');
  assert.equal(state.closedDeals.length, 0, 'capacity-blocked pending closing should not create a closed deal');
  assert.ok(
    state.eventLog.some((entry) => entry.message.includes('今日成交窗口已被占满，客户意向仍在，建议明天优先跟进确认。')),
    'capacity block should be visible in player-facing event log',
  );
});

verify('weekly summary preserves seven-day operating perception', () => {
  const state = createGeneratedState('standard', 2026042410);
  seedInitialOpportunities(state);
  const before = structuredClone(state);
  const results = advanceDays(state, 7);
  const summary = buildWeeklySummaryPresentation(before, state, results);
  assert.equal(summary.settledDays, results.length, 'weekly summary should count settled daily ticks');
  assert.ok(summary.dailyHighlights.length > 0, 'weekly summary should preserve daily highlights');
  assert.ok(summary.totals.some((entry) => entry.label === '我方成交'), 'weekly summary should include player deal count');
  assert.ok(summary.totals.some((entry) => entry.label === '对手成交'), 'weekly summary should include rival deal count');
  assert.ok(summary.totals.some((entry) => entry.label === '错失机会'), 'weekly summary should include missed opportunities');
  assert.ok(summary.caseStageChanges.length > 0, 'weekly summary should include case stage changes or stable fallback');
  assert.ok(summary.customerIntentChanges.length > 0, 'weekly summary should include customer intent changes or stable fallback');
  assert.ok(summary.ownerPressureChanges.length > 0, 'weekly summary should include owner pressure changes or stable fallback');
  assert.ok(summary.marketWindow.some((entry) => entry.label === '期间释放'), 'weekly summary should include released market windows');
  assert.ok(summary.priorityActions.length > 0, 'weekly summary should include next-week priority actions');
});

verify('player-side outcome scales are observable in engine sources', () => {
  assertSourceIncludes('src/selling-houses/domain/dealClosing.ts', [
    'playerDealClosingScale',
    'closeProbability',
    'playerClaimedDeals',
    'resolveCapacityBlockedPendingClosing',
    'claimPlayerMarketDealSlot(state)',
  ], 'player deal closing outcome controls');
  assertSourceDoesNotInclude('src/selling-houses/domain/dealClosing.ts', [
    'randomInt(0, 100, state) < successScore',
  ], 'player deal closing should not use unscaled hidden successScore');
  assertSourceIncludes('src/selling-houses/domain/engine/opportunityEngine.ts', [
    'playerLeadSupplyScale',
    'playerFunnelProgressionScale',
  ], 'opportunity funnel outcome controls');
  assertSourceIncludes('src/selling-houses/domain/engine/customerEngine.ts', [
    'playerFunnelProgressionScale',
    'customerStagnationScale',
  ], 'customer funnel outcome controls');
});

verify('rival-side outcome scales are observable in engine sources', () => {
  assertSourceIncludes('src/selling-houses/domain/rivals/rivalStoreEngine.ts', [
    'rivalStoreCapabilityScale',
  ], 'rival store capability control');
  assertSourceIncludes('src/selling-houses/domain/rivals/rivalListingEngine.ts', [
    'rivalStoreCapabilityScale',
    'rivalListingSpawnScale',
    'rivalDealShareScale',
    'tryClaimRivalMarketDealSlot',
    'tryClaimOpenMarketDealForRivals',
  ], 'rival listing and shared pool controls');
  assertSourceIncludes('src/selling-houses/domain/engine/outcomeControlRuntime.ts', [
    'waitingForRelease',
    'rivalClaimDayTotal',
    'delayedDealsCreated',
    'delayedDealsConverted',
    'rivalClaimedDealDayBuckets',
    'noSlotRivalAttempts',
    'options.allowFutureSlot',
    'marketOutcome.delayedDeals += 1',
  ], 'rival claim diagnostics and no-slot waiting branch');
  assertSourceIncludes('src/selling-houses/domain/models.ts', [
    'convertDelayedMarketDealsToRivalClaims',
    'marketOutcome.delayedDeals -= convertibleDeals',
    'marketOutcome.rivalClaimedDeals += convertibleDeals',
  ], 'future rival claims should convert delayed deals when slots release');
  assertSourceIncludes('src/selling-houses/domain/engine.ts', [
    'tryClaimOpenMarketDealForRivals',
    'state.maxDay - 7',
  ], 'late-window rival open-slot claiming should be wired through daily tick');
  const engineSource = readFileSync('src/selling-houses/domain/engine.ts', 'utf8');
  const processFacadeSource = readFileSync('src/selling-houses/domain/engine/processManagerFacade.ts', 'utf8');
  const processManagerSource = readFileSync('src/selling-houses/runtime/simulation/processes/negotiationProcessManager.ts', 'utf8');
  const pendingClosingIndex = engineSource.indexOf('callSettleNegotiationProcesses(state)');
  const openClaimIndex = engineSource.indexOf('tryClaimOpenMarketDealForRivals(state)');
  assert.ok(pendingClosingIndex >= 0, 'daily tick should settle negotiation processes through the domain facade');
  assert.ok(processFacadeSource.includes('registerProcessManagers'), 'process manager facade should expose runtime registration');
  assert.ok(processFacadeSource.includes('_settleNegotiation(state)'), 'process manager facade should call the registered negotiation manager');
  assert.ok(processManagerSource.includes('settlePendingDealClosings(state)'), 'negotiation process manager should wrap pending closing settlement');
  assert.ok(openClaimIndex > pendingClosingIndex, 'player negotiation settlement should run before rival open-slot claim');
  assertSourceIncludes('src/selling-houses/domain/engine/customerEngine.ts', [
    'rivalCustomerPullScale',
  ], 'rival customer pull control');
  assertSourceIncludes('src/selling-houses/domain/rivals/rivalListingEngine.ts', [
    'rivalOwnerPressureScale',
  ], 'rival owner pressure control');
  assertSourceIncludes('src/selling-houses/domain/rivals/rivalCaseLossPolicy.ts', [
    'rivalCaseLossScale',
    'evaluateCompetitionRivalCaseLoss',
    'evaluateVisibleRivalCaseLoss',
  ], 'rival case loss policy control');
});

verify('DifficultyPresentation contract matches outcomeControl', () => {
  listDifficultyProfiles().forEach((profile) => {
    const rules = mergeRules(profile.ruleAdjustments);
    assertPresentationDirection(profile.id, rules);
  });
});

verify('difficulty UI consumes DifficultyPresentation instead of stale static copy', () => {
  assertSourceIncludes('src/selling-houses/ui/features/ScenarioSetup.tsx', [
    'buildDifficultyPresentation',
    'selectedPresentation',
  ], 'difficulty setup UI should consume presentation helper');
  assertSourceIncludes('src/selling-houses/domain/config/difficultyOptions.ts', [
    'buildDifficultyPresentation',
  ], 'difficulty options should be derived from outcomeControl presentation');
});

verify('final result shows shared market outcome as short facts', () => {
  assertSourceIncludes('src/selling-houses/application/projections/resultProjection.ts', [
    'buildMarketOutcomeProjection',
    'playerClaimedDeals',
    'rivalClaimedDeals',
    'delayedDeals',
  ], 'result projection should expose market outcome facts');
  assertSourceIncludes('src/selling-houses/ui/features/ResultOverlay.tsx', [
    'projection.marketOutcome',
    'projection.marketOutcome.title',
    '结算判定',
    '房源结局',
    '得分来源',
    '下局入口',
    '客户沉淀',
    'xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]',
  ], 'result overlay should render short market outcome facts');
});

verify('weekly overlay is wired only through src selling-houses runtime', () => {
  assertSourceIncludes('src/selling-houses/SellingHousesWorkspace.tsx', [
    'WeeklySummaryOverlay',
    'buildWeeklySummaryPresentation',
    'summary.settledResults',
  ], 'weekly summary overlay should be shown after multi-day advance');
  assertSourceIncludes('src/selling-houses/ui/features/WeeklySummaryOverlay.tsx', [
    '推进复盘',
    '市场成交窗口',
    '接下来优先动作',
  ], 'weekly summary overlay should show operating perception sections');
});

verify('outcome lab reports delayed semantics and rival claim tempo', () => {
  assertSourceIncludes('scripts/run-selling-houses-outcome-lab.ts', [
    'delayedDealsCreated',
    'delayedDealsConverted',
    'remainingDelayedDealsAtEnd',
    'rivalClaimsDay1To7',
    'rivalClaimsDay8To14',
    'rivalClaimsDay15To21',
    'last7RivalClaimShare',
    'market capacity invariant failed',
  ], 'outcome lab should split delayed deals and rival tempo diagnostics');
});

if (failures.length > 0) {
  console.error('\nselling-houses outcome-control verification failed:');
  failures.forEach((failure, index) => {
    console.error(`${index + 1}. [${failure.section}] ${failure.message}`);
  });
  process.exit(1);
}

console.log('selling-houses outcome-control verification passed');
