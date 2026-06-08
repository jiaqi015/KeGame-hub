import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LocalAdversarialSelfPlayLab, type SelfPlayLabRunSummary } from '../../application/localAdversarialSelfPlayLab.js';
import { createCaseTerminalOutcomeOnState, readCaseTerminalOutcomeForCase } from '../caseOutcome.js';
import { evaluateCoreProtection } from '../coreProtectionPolicy.js';
import { getDifficultyProfile } from '../scenario-generation/difficultyProfiles.js';
import { evaluateFinalResult } from '../resultEvaluation.js';
import type { Case, GameState, Opportunity } from '../models.js';

function readSource(path: string) {
  return readFileSync(path, 'utf8');
}

function makeWithdrawnCase(overrides: Partial<Case> = {}) {
  return {
    id: 'case-withdrawn',
    title: '旧存档撤盘房源',
    status: 'withdrawn',
    marketPrice: 500,
    trust: 68,
    ...overrides,
  } as Case;
}

function makeRun(overrides: Partial<SelfPlayLabRunSummary> = {}): SelfPlayLabRunSummary {
  return {
    seed: 1,
    evaluationScore: 46,
    abilityScore: 8,
    defenseScore: 26,
    satisfactionScore: 12,
    endingGood: 1,
    endingNeutral: 5,
    endingBad: 0,
    coreBadCount: 0,
    lostToRivalCount: 0,
    activeRivalListings: 4,
    totalRivalListings: 8,
    marketSignals: 2,
    inboundCount: 8,
    dailyEventCount: 4,
    rivalPressureEvents: 5,
    companyPressureEvents: 2,
    meshTurnCount: 0,
    meshReadyCount: 0,
    meshNeedsReviewCount: 0,
    meshBlockedCount: 0,
    meshShadowRoleCount: 0,
    meshComparisonMatched: null,
    verdict: '系统张力还不够稳定',
    remainingActiveCases: 3,
    remainingActiveOpportunities: 8,
    ...overrides,
  };
}

function makeCoreProtectionState(caseItem: Case, opportunities: Opportunity[] = []) {
  return {
    day: 12,
    runContext: { difficultyId: 'hard' },
    opportunities,
    runtimeBrokerOwnerRelations: [],
    runtimeOwnerCaseReadinessStates: [],
  } as unknown as GameState;
}

function makeResultEvaluationState(cases: Case[]) {
  return {
    day: 21,
    cases,
    runtimeCaseTerminalOutcomes: [],
    runtimeContractFacts: [],
    eventStore: [],
    customerStates: [],
    budgetLedger: [],
    cash: 4,
    reputation: 56,
    auxiliaryStats: {
      promotionBudget: 4,
      commission: 0,
      wordOfMouth: 56,
      soldCount: 0,
      withdrawnCount: cases.filter((caseItem) => caseItem.status === 'withdrawn').length,
    },
    runContext: {
      scenarioSnapshot: {
        scenario: {
          goalContext: 'defense',
        },
      },
    },
  } as unknown as GameState;
}

describe('outcome policy architecture', () => {
  it('routes core protection through one shared policy instead of duplicating it across engines', () => {
    expect(existsSync('src/selling-houses/domain/coreProtectionPolicy.ts')).toBe(true);

    const marketEngine = readSource('src/selling-houses/domain/engine/marketEngine.ts');
    const rivalPolicy = readSource('src/selling-houses/domain/rivals/rivalCaseLossPolicy.ts');
    const terminalPolicy = readSource('src/selling-houses/domain/caseTerminalOutcomePolicy.ts');

    expect(marketEngine).toContain('shouldExtendExpiredCoreWindow');
    expect(rivalPolicy).toContain('evaluateCoreProtection');
    expect(terminalPolicy).toContain('evaluateCoreProtection');
    expect(marketEngine).not.toContain('protectedCoreTrustThreshold');
    expect(marketEngine).not.toContain('protectedCorePipeline');
    expect(rivalPolicy).not.toContain('core case protected by recent maintenance or owned pipeline evidence');
  });

  it('keeps rival case loss policy independent from engine internals', () => {
    const rivalPolicy = readSource('src/selling-houses/domain/rivals/rivalCaseLossPolicy.ts');

    expect(rivalPolicy).not.toContain('../engine/');
    expect(rivalPolicy).toContain('../market/marketReadBoundary');
    expect(rivalPolicy).toContain('./rivalOutcomeControlScales');
    expect(rivalPolicy).toContain('./rivalLossProbabilityModel');
    expect(rivalPolicy).not.toContain('rawProbabilityBase');
    expect(rivalPolicy).not.toContain('const tierBase');
  });

  it('routes action receipt snapshots through a structured result at runtime boundaries', () => {
    const actionResolvers = readSource('src/selling-houses/domain/engine/actionResolvers.ts');
    const engineExports = readSource('src/selling-houses/domain/engine.ts');
    const gameTransitions = readSource('src/selling-houses/application/gameTransitions.ts');
    const selfPlayArena = readSource('src/selling-houses/application/localAdversarialSelfPlayArena.ts');
    const outcomeLab = readSource('scripts/run-selling-houses-outcome-lab.ts');

    expect(actionResolvers).toContain('executeActionWithReceipts');
    expect(engineExports).toContain('executeActionWithReceipts');
    expect(gameTransitions).toContain('executeActionWithReceipts');
    expect(gameTransitions).not.toContain('popPendingActionReceiptSnapshots');
    expect(selfPlayArena).toContain('executeActionWithReceipts');
    expect(selfPlayArena).not.toContain('const ok = executeAction(');
    expect(outcomeLab).toContain('executeActionWithReceipts');
    expect(outcomeLab).not.toContain('const ok = executeAction(');
  });

  it('deep merges generated scenario rule overrides across difficulty profile and blueprint', () => {
    const assembler = readSource('src/selling-houses/domain/scenario-generation/scenarioAssembler.ts');

    expect(assembler).toContain('mergeScenarioRuleAdjustments');
    expect(assembler).toContain('outcomeControl: {');
    expect(assembler).toContain('...(profile.ruleAdjustments.outcomeControl || {})');
    expect(assembler).toContain('...(blueprint.ruleAdjustments?.outcomeControl || {})');
  });

  it('keeps self-play evaluation scripts behind one parameterized runner', () => {
    expect(existsSync('scripts/selling-houses-evaluation-runner.ts')).toBe(true);
    const runner = readSource('scripts/selling-houses-evaluation-runner.ts');
    expect(runner).toContain('plannedTotalRuns');
    expect(runner).toContain('diagnosticScoreSpread');
    expect(runner).not.toContain('totalRunsLabel');
    expect(runner).not.toContain('report.scoreSpread > 40');
    [
      'scripts/run-50-game-evaluation.ts',
      'scripts/run-1000-game-evaluation.ts',
      'scripts/run-10000-game-evaluation.ts',
    ].forEach((path) => {
      const source = readSource(path);
      expect(source).toContain('./selling-houses-evaluation-runner');
      expect(source).not.toContain('totalRunsLabel');
      expect(source).not.toContain('interface DifficultyReport');
      expect(source).not.toContain('function runEvaluation');
      expect(source).not.toContain('function generateReport');
    });
  });

  it('keeps low-difficulty terminal rival loss as soft pressure', () => {
    const warmupRules = getDifficultyProfile('warmup').ruleAdjustments;
    const easyRules = getDifficultyProfile('easy').ruleAdjustments;
    const warmupTerminalLossScale = (warmupRules.rivalLossProbabilityScale ?? 1)
      * (warmupRules.outcomeControl?.rivalCaseLossScale ?? 1);
    const easyTerminalLossScale = (easyRules.rivalLossProbabilityScale ?? 1)
      * (easyRules.outcomeControl?.rivalCaseLossScale ?? 1);

    expect(warmupTerminalLossScale).toBeLessThanOrEqual(0.01);
    expect(easyTerminalLossScale).toBeLessThanOrEqual(0.015);
    expect(warmupRules.outcomeControl?.rivalCaseLossScale).toBeLessThanOrEqual(0.1);
    expect(easyRules.outcomeControl?.rivalCaseLossScale).toBeLessThanOrEqual(0.15);
  });

  it('derives withdrawn legacy fallback as neutral when trust is not unhappy', () => {
    const caseItem = makeWithdrawnCase({ trust: 68 });

    const outcome = readCaseTerminalOutcomeForCase({ runtimeCaseTerminalOutcomes: [] } as never, caseItem, 68);

    expect(outcome.status).toBe('withdrawn');
    expect(outcome.ownerSatisfaction).toBe('regret');
    expect(outcome.endingType).toBe('not_sold_regret');
    expect(outcome.endingBucket).toBe('neutral');
  });

  it('derives active end-of-run cases with strong trust as no-regret good endings', () => {
    const caseItem = makeWithdrawnCase({
      id: 'active-trusted',
      status: 'active',
      trust: 76,
    });

    const outcome = readCaseTerminalOutcomeForCase({ runtimeCaseTerminalOutcomes: [] } as never, caseItem, 76);

    expect(outcome.status).toBe('active');
    expect(outcome.ownerSatisfaction).toBe('no_regret');
    expect(outcome.endingType).toBe('not_sold_no_regret');
    expect(outcome.endingBucket).toBe('good');
  });

  it('does not score no-regret withdrawals as zero-defense failures', () => {
    const heldCaseA = makeWithdrawnCase({ id: 'held-a', status: 'active', trust: 76 });
    const heldCaseB = makeWithdrawnCase({ id: 'held-b', status: 'active', trust: 76 });
    const noRegretWithdrawal = makeWithdrawnCase({ id: 'withdrawn-good', status: 'withdrawn', trust: 76 });
    const state = makeResultEvaluationState([heldCaseA, heldCaseB, noRegretWithdrawal]);
    createCaseTerminalOutcomeOnState(
      state,
      noRegretWithdrawal.id,
      'withdrawn',
      21,
      'withdrawn',
      'no_regret',
      'not_sold_no_regret',
      'good',
      ['test:no-regret-withdrawal'],
    );

    const result = evaluateFinalResult(state, 'test');

    expect(result.endingStats.good).toBe(3);
    expect(result.dimensions.defense.score).toBeGreaterThanOrEqual(29);
  });

  it('protects a core case with qualified owned pipeline even after pressure lowers trust', () => {
    const caseItem = makeWithdrawnCase({
      id: 'core-pipeline',
      goalTier: 'core',
      trust: 50,
      lastOwnerTouchedDay: 7,
      windowDays: 2,
    });
    const opportunity = {
      id: 'opp-qualified',
      caseId: caseItem.id,
      visibility: 'revealed',
      status: 'active',
      lifecycleStatus: 'active',
      stageIndex: 2,
    } as Opportunity;

    const protection = evaluateCoreProtection(
      makeCoreProtectionState(caseItem, [opportunity]),
      caseItem,
      'competition_rival_loss',
    );

    expect(protection.protected).toBe(true);
    expect(protection.reasons.join(' ')).toContain('qualified owned pipeline');
  });

  it('promotes high-difficulty zero rival-loss pressure to a major finding', () => {
    const lab = new LocalAdversarialSelfPlayLab({
      scenarioId: 'hard-market-shock',
      seeds: [4101, 4202, 4303, 4404],
    });
    const runs = [makeRun({ seed: 4101 }), makeRun({ seed: 4202 }), makeRun({ seed: 4303 }), makeRun({ seed: 4404 })];

    const findings = (lab as unknown as {
      buildFindings: (runs: SelfPlayLabRunSummary[]) => Array<{ severity: string; title: string }>;
    }).buildFindings(runs);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'major',
        title: '高难度竞品压力失效',
      }),
    ]));
  });

  it('does not treat warmup player lead supply as excessive market event density', () => {
    const lab = new LocalAdversarialSelfPlayLab({
      scenarioId: 'warmup-clean-handoff',
      seeds: [101, 202, 303, 404],
    });
    const runs = [
      makeRun({ seed: 101, inboundCount: 9, dailyEventCount: 1, rivalPressureEvents: 0 }),
      makeRun({ seed: 202, inboundCount: 9, dailyEventCount: 1, rivalPressureEvents: 0 }),
      makeRun({ seed: 303, inboundCount: 8, dailyEventCount: 1, rivalPressureEvents: 0 }),
      makeRun({ seed: 404, inboundCount: 8, dailyEventCount: 1, rivalPressureEvents: 0 }),
    ];

    const findings = (lab as unknown as {
      buildFindings: (runs: SelfPlayLabRunSummary[]) => Array<{ severity: string; title: string }>;
    }).buildFindings(runs);

    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'major',
        title: '商圈事件密度偏高',
      }),
    ]));
  });

  it('keeps score spread below the published 30-point randomness limit out of major findings', () => {
    const lab = new LocalAdversarialSelfPlayLab({
      scenarioId: 'easy-fresh-start',
      seeds: [1101, 1202, 1303, 1404],
    });
    const runs = [
      makeRun({ seed: 1101, evaluationScore: 50, defenseScore: 30, endingBad: 0 }),
      makeRun({ seed: 1202, evaluationScore: 58, defenseScore: 31, endingBad: 0 }),
      makeRun({ seed: 1303, evaluationScore: 64, defenseScore: 32, endingBad: 0 }),
      makeRun({ seed: 1404, evaluationScore: 77, defenseScore: 33, endingBad: 0 }),
    ];

    const findings = (lab as unknown as {
      buildFindings: (runs: SelfPlayLabRunSummary[]) => Array<{ severity: string; title: string }>;
    }).buildFindings(runs);

    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'major',
        title: '跨 seed 波动过大',
      }),
    ]));
  });

  it('does not call extreme defense fragile when defense stays above the published 15-point floor', () => {
    const lab = new LocalAdversarialSelfPlayLab({
      scenarioId: 'extreme-last-stand',
      seeds: [5101, 5202, 5303, 5404],
    });
    const runs = [
      makeRun({ seed: 5101, defenseScore: 16, endingBad: 0, lostToRivalCount: 1 }),
      makeRun({ seed: 5202, defenseScore: 17, endingBad: 0, lostToRivalCount: 1 }),
      makeRun({ seed: 5303, defenseScore: 18, endingBad: 1, lostToRivalCount: 1 }),
      makeRun({ seed: 5404, defenseScore: 19, endingBad: 0, lostToRivalCount: 0 }),
    ];

    const findings = (lab as unknown as {
      buildFindings: (runs: SelfPlayLabRunSummary[]) => Array<{ severity: string; title: string }>;
    }).buildFindings(runs);

    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'major',
        title: '守盘线整体偏脆',
      }),
    ]));
  });

  it('uses robust spread instead of min/max outliers for large self-play batches', () => {
    const lab = new LocalAdversarialSelfPlayLab({
      scenarioId: 'easy-fresh-start',
      seeds: Array.from({ length: 50 }, (_, index) => 10_000 + index),
    });
    const runs = [
      makeRun({ seed: 1, evaluationScore: 54, defenseScore: 26 }),
      ...Array.from({ length: 48 }, (_, index) => makeRun({
        seed: 2 + index,
        evaluationScore: index % 2 === 0 ? 59 : 74,
        defenseScore: 35,
      })),
      makeRun({ seed: 50, evaluationScore: 92, defenseScore: 35 }),
    ];

    const findings = (lab as unknown as {
      buildFindings: (runs: SelfPlayLabRunSummary[]) => Array<{ severity: string; title: string }>;
    }).buildFindings(runs);

    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'major',
        title: '跨 seed 波动过大',
      }),
    ]));
    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'major',
        title: '守盘结果不稳定',
      }),
    ]));
  });

  it('does not treat warmup friendly inbound supply as major event density', () => {
    const lab = new LocalAdversarialSelfPlayLab({
      scenarioId: 'warmup-clean-handoff',
      seeds: [101, 202, 303, 404],
    });
    const runs = [
      makeRun({ seed: 101, inboundCount: 12, dailyEventCount: 1, rivalPressureEvents: 0 }),
      makeRun({ seed: 202, inboundCount: 13, dailyEventCount: 1, rivalPressureEvents: 0 }),
      makeRun({ seed: 303, inboundCount: 12, dailyEventCount: 1, rivalPressureEvents: 0 }),
      makeRun({ seed: 404, inboundCount: 13, dailyEventCount: 1, rivalPressureEvents: 0 }),
    ];

    const findings = (lab as unknown as {
      buildFindings: (runs: SelfPlayLabRunSummary[]) => Array<{ severity: string; title: string }>;
    }).buildFindings(runs);

    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'major',
        title: '商圈事件密度偏高',
      }),
    ]));
  });
});
