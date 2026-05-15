import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import '../src/selling-houses/application/gameTransitions.js';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceDays, executeAction, findBestOpportunity, getActionAvailability, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { generateScenarioSnapshot } from '../src/selling-houses/domain/scenarioCatalog.js';
import { getPromotionBudget, resolveFormalSoldCount } from '../src/selling-houses/domain/runtimeStats.js';
import { buildSelfPlayRunSnapshot } from '../src/selling-houses/application/localAdversarialSelfPlayArena.js';
import { getAvailableMarketDealSlots } from '../src/selling-houses/domain/models.js';
import type { Case, DifficultyId, GameState, Opportunity } from '../src/selling-houses/domain/models.js';
import {
  readRivalOutcomeDiagnostics,
  resetRivalOutcomeDiagnostics,
} from '../src/selling-houses/domain/engine/outcomeControlRuntime.js';
import {
  evaluateOutcomeTargets,
  formatOutcomeTargetRange,
  summarizeOutcomeTargetStatus,
  type OutcomeTargetCheck,
  type OutcomeTargetStatus,
} from './selling-houses-outcome-targets.js';

const DIFFICULTY_IDS: DifficultyId[] = ['warmup', 'easy', 'standard', 'advanced', 'hard', 'extreme'];

type UnknownRecord = Record<string, unknown>;

interface CandidateDecision {
  actionId: string;
  optionId: string | null;
  rationale: string;
  weight: number;
}

interface PlannedMove {
  caseItem: Case;
  decision: CandidateDecision;
  combinedWeight: number;
}

type CountMap = Record<string, number>;

interface OutcomeRunDiagnosis {
  actionAttempts: CountMap;
  actionSuccesses: CountMap;
  actionFailures: CountMap;
  negotiationActionSuccesses: number;
  pendingClosingCreated: number;
  maxPendingClosingCount: number;
  negotiationProcessRows: number;
  negotiationProcessedCount: number;
  negotiationResolvedCount: number;
  consensusStageCounts: CountMap;
  blockerCounts: CountMap;
  averageConsensusCloseReadiness: number;
  averageConsensusCloseProbability: number;
}

interface OutcomeRunMetrics {
  difficulty: DifficultyId;
  seed: number;
  score: number;
  deals: number;
  rivalDeals: number;
  delayedDeals: number;
  marketCapacity: number;
  releasedSlots: number;
  playerClaimedDeals: number;
  rivalClaimedDeals: number;
  availableSlotsAtEnd: number;
  unclaimedSlotsAtEnd: number;
  playerConsumedSlots: number;
  maxOpportunityStage: number;
  stageDistribution: Record<string, number>;
  stagnatedOpportunities: number;
  lostOpportunities: number;
  rivalLossRun: boolean;
  rivalClaimAttempts: number;
  rivalClaimSuccesses: number;
  noSlotRivalAttempts: number;
  failedRivalClaimRolls: number;
  rivalListingsCreated: number;
  rivalListingsExpired: number;
  rivalListingsSold: number;
  rivalListingsWithdrawn: number;
  rivalListingsDelayed: number;
  rivalListingsActive: number;
  averageSlotReleaseDay: number;
  averageRivalClaimDay: number;
  maxDailyRivalClaims: number;
  averageRivalListingLifespan: number;
  delayedDealsCreated: number;
  delayedDealsConverted: number;
  remainingDelayedDealsAtEnd: number;
  rivalClaimsDay1To7: number;
  rivalClaimsDay8To14: number;
  rivalClaimsDay15To21: number;
  last7RivalClaimShare: number;
  diagnosis: OutcomeRunDiagnosis;
}

interface OutcomeLabSummary {
  difficulty: DifficultyId;
  runs: number;
  averageScore: number;
  averageDeals: number;
  medianDeals: number;
  pAtLeastOneSelfClose21d: number;
  averageRivalDeals: number;
  averageDelayedDeals: number;
  averageMarketCapacity: number;
  averageReleasedSlots: number;
  averagePlayerClaimedDeals: number;
  averageRivalClaimedDeals: number;
  averageAvailableSlotsAtEnd: number;
  averageUnclaimedSlotsAtEnd: number;
  averagePlayerConsumedSlots: number;
  averageRivalClaimAttempts: number;
  averageRivalClaimSuccesses: number;
  rivalClaimSuccessRate: number;
  averageNoSlotRivalAttempts: number;
  averageFailedRivalClaimRolls: number;
  averageRivalListingsCreated: number;
  averageRivalListingsExpired: number;
  averageRivalListingsSold: number;
  averageRivalListingsWithdrawn: number;
  averageRivalListingsDelayed: number;
  averageRivalListingsActive: number;
  averageSlotReleaseDay: number;
  averageRivalClaimDay: number;
  averageMaxDailyRivalClaims: number;
  maxDailyRivalClaimsObserved: number;
  averageRivalListingLifespan: number;
  averageDelayedDealsCreated: number;
  averageDelayedDealsConverted: number;
  averageRemainingDelayedDealsAtEnd: number;
  averageRivalClaimsDay1To7: number;
  averageRivalClaimsDay8To14: number;
  averageRivalClaimsDay15To21: number;
  last7RivalClaimShare: number;
  averageMaxOpportunityStage: number;
  stageDistribution: Record<string, number>;
  averageStagnatedOpportunities: number;
  averageLostOpportunities: number;
  rivalLossRunRate: number;
  difficultyCliffFromPrevious: number;
  targetStatus: OutcomeTargetStatus;
  targetChecks: OutcomeTargetCheck[];
  diagnosis: OutcomeRunDiagnosis;
}

interface CliOptions {
  runs: number;
  seed: number;
  json: boolean;
  jsonPath: string | null;
}

interface OutcomeLabSnapshot {
  metadata: {
    date: string;
    runs: number;
    seed: number;
    command: string;
    gitCommit: string;
    difficultyIds: DifficultyId[];
  };
  summaries: OutcomeLabSummary[];
}

function parseOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    runs: 10,
    seed: 20260424,
    json: false,
    jsonPath: null,
  };

  argv.forEach((arg, index) => {
    if (arg === '--runs') {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        options.runs = Math.floor(value);
      }
    } else if (arg.startsWith('--runs=')) {
      const value = Number(arg.slice('--runs='.length));
      if (Number.isFinite(value) && value > 0) {
        options.runs = Math.floor(value);
      }
    } else if (arg === '--seed') {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value)) {
        options.seed = Math.floor(value);
      }
    } else if (arg.startsWith('--seed=')) {
      const value = Number(arg.slice('--seed='.length));
      if (Number.isFinite(value)) {
        options.seed = Math.floor(value);
      }
    } else if (arg === '--json') {
      options.json = true;
      const nextArg = argv[index + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        options.jsonPath = nextArg;
      }
    } else if (arg.startsWith('--json=')) {
      options.json = true;
      options.jsonPath = arg.slice('--json='.length) || null;
    }
  });

  return options;
}

function playOutcomeRun(difficulty: DifficultyId, seed: number): OutcomeRunMetrics {
  const snapshot = generateScenarioSnapshot({ difficultyId: difficulty, seed });
  const state = createInitialState(snapshot, seed);
  const diagnosis = createEmptyRunDiagnosis();
  resetRivalOutcomeDiagnostics(state);
  const initialRivalListingCount = state.marketShadow.rivalListings.length;
  seedInitialOpportunities(state);
  updateDerivedState(state);

  while (!state.gameOver && state.day <= state.maxDay) {
    playOneDay(state, diagnosis);
  }

  updateDerivedState(state);
  return collectRunMetrics(difficulty, seed, state, initialRivalListingCount, diagnosis);
}

function playOneDay(state: GameState, diagnosis: OutcomeRunDiagnosis) {
  let safetyCounter = 0;
  while (!state.gameOver && state.energy > 0 && safetyCounter < 20) {
    updateDerivedState(state);
    const plannedMove = pickPlannedMove(state);
    if (!plannedMove) {
      break;
    }

    incrementCount(diagnosis.actionAttempts, plannedMove.decision.actionId);
    const pendingBefore = countPendingClosing(state);
    const ok = executeAction(state, plannedMove.decision.actionId, plannedMove.caseItem, plannedMove.decision.optionId);
    if (!ok) {
      incrementCount(diagnosis.actionFailures, plannedMove.decision.actionId);
      break;
    }
    incrementCount(diagnosis.actionSuccesses, plannedMove.decision.actionId);
    if (plannedMove.decision.actionId === 'invite-customer-negotiation') {
      diagnosis.negotiationActionSuccesses += 1;
    }
    const pendingAfter = countPendingClosing(state);
    diagnosis.pendingClosingCreated += Math.max(0, pendingAfter - pendingBefore);
    diagnosis.maxPendingClosingCount = Math.max(diagnosis.maxPendingClosingCount, pendingAfter);
    safetyCounter += 1;
  }

  if (!state.gameOver) {
    const pendingBeforeAdvance = countPendingClosing(state);
    advanceDays(state, 1);
    diagnosis.maxPendingClosingCount = Math.max(diagnosis.maxPendingClosingCount, pendingBeforeAdvance, countPendingClosing(state));
    const negotiationRows = state.lastDailyTickResult?.processResults
      .filter((entry) => entry.managerId === 'negotiation-process-manager') ?? [];
    diagnosis.negotiationProcessRows += negotiationRows.length;
    diagnosis.negotiationProcessedCount += negotiationRows.reduce((sum, entry) => sum + entry.processedCount, 0);
    diagnosis.negotiationResolvedCount += negotiationRows.reduce((sum, entry) => sum + entry.resolvedCount, 0);
  }
}

function pickPlannedMove(state: GameState): PlannedMove | null {
  const activeCases = state.cases
    .filter((entry) => entry.status === 'active')
    .sort((left, right) => scoreCase(right, state) - scoreCase(left, state));

  let bestMove: PlannedMove | null = null;
  activeCases.forEach((caseItem) => {
    const decision = pickDecision(state, caseItem);
    if (!decision) {
      return;
    }
    const combinedWeight = scoreCase(caseItem, state) + decision.weight;
    if (!bestMove || combinedWeight > bestMove.combinedWeight) {
      bestMove = { caseItem, decision, combinedWeight };
    }
  });

  return bestMove;
}

function scoreCase(caseItem: Case, state: GameState) {
  const activeOpps = state.opportunities.filter((entry) => entry.caseId === caseItem.id && entry.status === 'active');
  const shadowCount = activeOpps.filter((entry) => entry.visibility === 'shadow').length;
  const lateStageCount = activeOpps.filter((entry) => entry.stageIndex >= 3).length;
  const pricePressure = Math.max(0, caseItem.askPrice - caseItem.marketPrice) / 2;

  return (100 - caseItem.windowDays * 8)
    + (65 - caseItem.trust)
    + (58 - caseItem.heat)
    + pricePressure
    + shadowCount * 8
    + lateStageCount * 10;
}

function pickDecision(state: GameState, caseItem: Case): CandidateDecision | null {
  const candidates: CandidateDecision[] = [];
  const shadowLead = state.opportunities.find((entry) => entry.caseId === caseItem.id && entry.status === 'active' && entry.visibility === 'shadow');
  const lateOpportunity = findBestOpportunity(state, caseItem.id, 3);
  const showingOpportunity = findBestOpportunity(state, caseItem.id, 0, 2);

  if (shadowLead) {
    candidates.push({ actionId: 'deep-diagnosis', optionId: null, rationale: '确认影子线索', weight: 98 });
  }
  if (lateOpportunity) {
    candidates.push({ actionId: 'invite-customer-negotiation', optionId: pickNegotiationOption(caseItem, lateOpportunity), rationale: '收口高阶段机会', weight: 95 });
  }
  if (caseItem.windowDays <= 4 || caseItem.trust < 56) {
    candidates.push({ actionId: caseItem.hasCompletedFirstVisit ? 'weekly-feedback' : 'first-visit', optionId: null, rationale: '保盘', weight: 90 });
  }
  if (caseItem.askPrice > caseItem.marketPrice * 1.04 || caseItem.priceGapPct > 5) {
    candidates.push({ actionId: 'adjust-listing-price', optionId: pickPriceOption(caseItem), rationale: '处理价格锚', weight: 88 });
  }
  if (caseItem.askPrice > caseItem.marketPrice * 1.02 && caseItem.d3 < 68) {
    candidates.push({ actionId: 'pricing-advice', optionId: null, rationale: '解释价格与竞争', weight: 80 });
  }
  if (showingOpportunity) {
    candidates.push({ actionId: 'showing', optionId: null, rationale: '推进带看', weight: 82 });
  }
  if (caseItem.heat < 52 && caseItem.openDayCooldown === 0 && getPromotionBudget(state) >= 5 && state.energy >= 2) {
    candidates.push({ actionId: 'open-day', optionId: null, rationale: '拉热度', weight: 72 });
  }
  if (caseItem.competitiveness < 68) {
    candidates.push({ actionId: 'story', optionId: null, rationale: '补讲法', weight: 64 });
  }
  if (getPromotionBudget(state) >= 2 && caseItem.heat < 58) {
    candidates.push({ actionId: 'xiaohongshu-boost', optionId: null, rationale: '补公开进线', weight: 54 });
  }
  if (getPromotionBudget(state) >= 3 && !state.opportunities.some((entry) => entry.caseId === caseItem.id && entry.status === 'active' && entry.visibility === 'shadow')) {
    candidates.push({ actionId: 'broker-broadcast', optionId: null, rationale: '补经纪人网络', weight: 51 });
  }
  if (getPromotionBudget(state) >= 2 && caseItem.trust >= 62 && caseItem.qualityStory >= 1) {
    candidates.push({ actionId: 'private-referral', optionId: null, rationale: '私域找高质量客户', weight: 49 });
  }
  if (state.opportunities.some((entry) => entry.caseId === caseItem.id && entry.status === 'active' && entry.stageIndex >= 2 && entry.visibility !== 'shadow')) {
    candidates.push({ actionId: 'sincerity-sale', optionId: null, rationale: '成熟客户搭桌', weight: 66 });
  }
  candidates.push({ actionId: caseItem.hasCompletedFirstVisit ? 'weekly-feedback' : 'first-visit', optionId: null, rationale: '保底维护', weight: 20 });

  return candidates
    .filter((entry, index, list) => list.findIndex((candidate) => candidate.actionId === entry.actionId && candidate.optionId === entry.optionId) === index)
    .sort((left, right) => right.weight - left.weight)
    .find((entry) => getActionAvailability(state, caseItem, entry.actionId).enabled) ?? null;
}

function pickPriceOption(caseItem: Case) {
  const priceGap = caseItem.askPrice - caseItem.marketPrice;
  if (caseItem.windowDays <= 4 || caseItem.trust < 45 || priceGap > 35) {
    return 'deep-cut';
  }
  if (priceGap > 10 || caseItem.personality === 'pragmatic' || caseItem.personality === 'urgent') {
    return 'small-cut';
  }
  return 'hold-story';
}

function pickNegotiationOption(caseItem: Case, opportunity: Opportunity) {
  if (opportunity.intent >= 90 && opportunity.confidence >= 85) {
    return 'hold';
  }
  if (caseItem.windowDays <= 3 || caseItem.trust < 52) {
    return 'close';
  }
  return 'balanced';
}

function collectRunMetrics(
  difficulty: DifficultyId,
  seed: number,
  state: GameState,
  initialRivalListingCount: number,
  diagnosis: OutcomeRunDiagnosis,
): OutcomeRunMetrics {
  const snapshot = buildSelfPlayRunSnapshot(state.finalResult);
  const marketOutcome = readOptionalMarketOutcome(state);
  const finalCaseResults = state.finalResult?.caseResults ?? [];
  const fallbackRivalDeals = finalCaseResults.filter((entry) => entry.defenseOutcome === 'lost_to_rival' || entry.endingType === 'sold_by_other').length;
  const stageDistribution = buildStageDistribution(state);
  const diagnostics = readRivalOutcomeDiagnostics(state);
  const marketCapacity = marketOutcome?.totalCapacity21d ?? state.rules.outcomeControl.marketDealCapacity21d;
  const playerClaimedDeals = marketOutcome?.playerClaimedDeals ?? resolveFormalSoldCount(state);
  const rivalClaimedDeals = marketOutcome?.rivalClaimedDeals ?? fallbackRivalDeals;
  const delayedDeals = marketOutcome?.delayedDeals ?? 0;
  const consumedCapacity = playerClaimedDeals + rivalClaimedDeals + delayedDeals;
  if (consumedCapacity > marketCapacity) {
    throw new Error(`${difficulty} seed=${seed} market capacity invariant failed: ${consumedCapacity}/${marketCapacity}`);
  }
  const actualClaimBuckets = diagnostics.rivalClaimedDealDayBuckets;
  const rivalClaimsDay1To7 = sumRivalClaimsInDayRange(actualClaimBuckets, 1, 7);
  const rivalClaimsDay8To14 = sumRivalClaimsInDayRange(actualClaimBuckets, 8, 14);
  const rivalClaimsDay15To21 = sumRivalClaimsInDayRange(actualClaimBuckets, 15, 21);

  return {
    difficulty,
    seed,
    score: snapshot.score,
    deals: resolveFormalSoldCount(state),
    rivalDeals: rivalClaimedDeals,
    delayedDeals,
    marketCapacity,
    releasedSlots: marketOutcome?.releasedSlots ?? 0,
    playerClaimedDeals,
    rivalClaimedDeals,
    availableSlotsAtEnd: getAvailableMarketDealSlots(state),
    unclaimedSlotsAtEnd: Math.max(0, marketCapacity - playerClaimedDeals - rivalClaimedDeals - delayedDeals),
    playerConsumedSlots: playerClaimedDeals,
    maxOpportunityStage: Math.max(0, ...state.opportunities.map((entry) => entry.stageIndex)),
    stageDistribution,
    stagnatedOpportunities: state.opportunities.filter((entry) => entry.lifecycleStatus === 'stagnated').length,
    lostOpportunities: state.opportunities.filter((entry) => entry.status === 'lost' || entry.lifecycleStatus === 'lost').length,
    rivalLossRun: fallbackRivalDeals > 0,
    rivalClaimAttempts: diagnostics.rivalClaimAttempts,
    rivalClaimSuccesses: diagnostics.rivalClaimSuccesses,
    noSlotRivalAttempts: diagnostics.noSlotRivalAttempts,
    failedRivalClaimRolls: diagnostics.failedRivalClaimRolls,
    rivalListingsCreated: diagnostics.rivalListingsCreated + initialRivalListingCount,
    rivalListingsExpired: diagnostics.rivalListingsExpired,
    rivalListingsSold: diagnostics.rivalListingsSold,
    rivalListingsWithdrawn: diagnostics.rivalListingsWithdrawn,
    rivalListingsDelayed: diagnostics.rivalListingsDelayed,
    rivalListingsActive: diagnostics.activeRivalListingSamples > 0
      ? round(diagnostics.activeRivalListingTotal / diagnostics.activeRivalListingSamples)
      : state.marketShadow.rivalListings.filter((entry) => entry.status === 'active').length,
    averageSlotReleaseDay: calculateAverageSlotReleaseDay(state),
    averageRivalClaimDay: diagnostics.rivalClaimedDealDayCount > 0
      ? round(diagnostics.rivalClaimedDealDayTotal / diagnostics.rivalClaimedDealDayCount)
      : 0,
    maxDailyRivalClaims: calculateMaxDailyRivalClaims(actualClaimBuckets),
    averageRivalListingLifespan: diagnostics.rivalListingLifespanCount > 0
      ? round(diagnostics.rivalListingLifespanTotal / diagnostics.rivalListingLifespanCount)
      : 0,
    delayedDealsCreated: diagnostics.delayedDealsCreated,
    delayedDealsConverted: diagnostics.delayedDealsConverted,
    remainingDelayedDealsAtEnd: delayedDeals,
    rivalClaimsDay1To7,
    rivalClaimsDay8To14,
    rivalClaimsDay15To21,
    last7RivalClaimShare: percentage(rivalClaimsDay15To21, rivalClaimsDay1To7 + rivalClaimsDay8To14 + rivalClaimsDay15To21),
    diagnosis: finalizeRunDiagnosis(state, diagnosis),
  };
}

function createEmptyRunDiagnosis(): OutcomeRunDiagnosis {
  return {
    actionAttempts: {},
    actionSuccesses: {},
    actionFailures: {},
    negotiationActionSuccesses: 0,
    pendingClosingCreated: 0,
    maxPendingClosingCount: 0,
    negotiationProcessRows: 0,
    negotiationProcessedCount: 0,
    negotiationResolvedCount: 0,
    consensusStageCounts: {},
    blockerCounts: {},
    averageConsensusCloseReadiness: 0,
    averageConsensusCloseProbability: 0,
  };
}

function countPendingClosing(state: GameState) {
  return state.opportunities.filter((entry) => entry.status === 'active' && entry.pendingClosingEvaluation).length;
}

function incrementCount(target: CountMap, key: string, amount = 1) {
  target[key] = (target[key] || 0) + amount;
}

function finalizeRunDiagnosis(state: GameState, diagnosis: OutcomeRunDiagnosis): OutcomeRunDiagnosis {
  const consensusFormations = state.runtimeConsensusFormations || [];
  const consensusStageCounts: CountMap = {};
  const blockerCounts: CountMap = {};
  let readinessTotal = 0;
  let probabilityTotal = 0;
  let evaluatedCount = 0;

  consensusFormations.forEach((formation) => {
    incrementCount(consensusStageCounts, formation.stage);
    if (formation.closeReadiness > 0 || formation.closeProbability > 0 || formation.blockers.length > 0) {
      readinessTotal += formation.closeReadiness;
      probabilityTotal += formation.closeProbability;
      evaluatedCount += 1;
    }
    formation.blockers.forEach((blocker) => incrementCount(blockerCounts, blocker));
  });

  return {
    ...diagnosis,
    consensusStageCounts,
    blockerCounts,
    averageConsensusCloseReadiness: evaluatedCount > 0 ? round(readinessTotal / evaluatedCount) : 0,
    averageConsensusCloseProbability: evaluatedCount > 0 ? round(probabilityTotal / evaluatedCount) : 0,
  };
}

function calculateAverageSlotReleaseDay(state: GameState) {
  const schedule = state.marketOutcome?.slotSchedule ?? [];
  const totalSlots = schedule.reduce((sum, entry) => sum + entry.slots, 0);
  if (totalSlots <= 0) {
    return 0;
  }
  return round(schedule.reduce((sum, entry) => sum + entry.day * entry.slots, 0) / totalSlots);
}

function calculateMaxDailyRivalClaims(dayBuckets: Record<string, number>) {
  const values = Object.values(dayBuckets);
  return values.length > 0 ? Math.max(...values) : 0;
}

function sumRivalClaimsInDayRange(dayBuckets: Record<string, number>, startDay: number, endDay: number) {
  return Object.entries(dayBuckets).reduce((sum, [day, count]) => {
    const dayNumber = Number(day);
    if (!Number.isFinite(dayNumber) || dayNumber < startDay || dayNumber > endDay) {
      return sum;
    }
    return sum + count;
  }, 0);
}

function readOptionalMarketOutcome(state: GameState) {
  const value = (state as unknown as UnknownRecord).marketOutcome;
  if (!isRecord(value)) {
    return null;
  }

  const totalCapacity21d = readNumber(value.totalCapacity21d);
  const playerClaimedDeals = readNumber(value.playerClaimedDeals);
  const rivalClaimedDeals = readNumber(value.rivalClaimedDeals);
  const delayedDeals = readNumber(value.delayedDeals);
  const releasedSlots = readNumber(value.releasedSlots);
  if ([totalCapacity21d, playerClaimedDeals, rivalClaimedDeals, delayedDeals, releasedSlots].some((entry) => entry === null)) {
    return null;
  }

  return {
    totalCapacity21d: totalCapacity21d ?? 0,
    playerClaimedDeals: playerClaimedDeals ?? 0,
    rivalClaimedDeals: rivalClaimedDeals ?? 0,
    delayedDeals: delayedDeals ?? 0,
    releasedSlots: releasedSlots ?? 0,
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildStageDistribution(state: GameState) {
  return state.opportunities.reduce<Record<string, number>>((acc, opportunity) => {
    const key = `stage${opportunity.stageIndex}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function summarizeDifficulty(difficulty: DifficultyId, runs: OutcomeRunMetrics[], previous?: OutcomeLabSummary): OutcomeLabSummary {
  const stageDistribution = mergeStageDistributions(runs.map((entry) => entry.stageDistribution));
  const averageDeals = average(runs.map((entry) => entry.deals));
  const summaryBase = {
    difficulty,
    runs: runs.length,
    averageScore: average(runs.map((entry) => entry.score)),
    averageDeals,
    medianDeals: median(runs.map((entry) => entry.deals)),
    pAtLeastOneSelfClose21d: percentage(runs.filter((entry) => entry.deals >= 1).length, runs.length),
    averageRivalDeals: average(runs.map((entry) => entry.rivalDeals)),
    averageDelayedDeals: average(runs.map((entry) => entry.delayedDeals)),
    averageMarketCapacity: average(runs.map((entry) => entry.marketCapacity)),
    averageReleasedSlots: average(runs.map((entry) => entry.releasedSlots)),
    averagePlayerClaimedDeals: average(runs.map((entry) => entry.playerClaimedDeals)),
    averageRivalClaimedDeals: average(runs.map((entry) => entry.rivalClaimedDeals)),
    averageAvailableSlotsAtEnd: average(runs.map((entry) => entry.availableSlotsAtEnd)),
    averageUnclaimedSlotsAtEnd: average(runs.map((entry) => entry.unclaimedSlotsAtEnd)),
    averagePlayerConsumedSlots: average(runs.map((entry) => entry.playerConsumedSlots)),
    averageRivalClaimAttempts: average(runs.map((entry) => entry.rivalClaimAttempts)),
    averageRivalClaimSuccesses: average(runs.map((entry) => entry.rivalClaimSuccesses)),
    rivalClaimSuccessRate: percentage(
      runs.reduce((sum, entry) => sum + entry.rivalClaimSuccesses, 0),
      runs.reduce((sum, entry) => sum + entry.rivalClaimAttempts, 0),
    ),
    averageNoSlotRivalAttempts: average(runs.map((entry) => entry.noSlotRivalAttempts)),
    averageFailedRivalClaimRolls: average(runs.map((entry) => entry.failedRivalClaimRolls)),
    averageRivalListingsCreated: average(runs.map((entry) => entry.rivalListingsCreated)),
    averageRivalListingsExpired: average(runs.map((entry) => entry.rivalListingsExpired)),
    averageRivalListingsSold: average(runs.map((entry) => entry.rivalListingsSold)),
    averageRivalListingsWithdrawn: average(runs.map((entry) => entry.rivalListingsWithdrawn)),
    averageRivalListingsDelayed: average(runs.map((entry) => entry.rivalListingsDelayed)),
    averageRivalListingsActive: average(runs.map((entry) => entry.rivalListingsActive)),
    averageSlotReleaseDay: average(runs.map((entry) => entry.averageSlotReleaseDay)),
    averageRivalClaimDay: average(runs.map((entry) => entry.averageRivalClaimDay)),
    averageMaxDailyRivalClaims: average(runs.map((entry) => entry.maxDailyRivalClaims)),
    maxDailyRivalClaimsObserved: Math.max(0, ...runs.map((entry) => entry.maxDailyRivalClaims)),
    averageRivalListingLifespan: average(runs.map((entry) => entry.averageRivalListingLifespan)),
    averageDelayedDealsCreated: average(runs.map((entry) => entry.delayedDealsCreated)),
    averageDelayedDealsConverted: average(runs.map((entry) => entry.delayedDealsConverted)),
    averageRemainingDelayedDealsAtEnd: average(runs.map((entry) => entry.remainingDelayedDealsAtEnd)),
    averageRivalClaimsDay1To7: average(runs.map((entry) => entry.rivalClaimsDay1To7)),
    averageRivalClaimsDay8To14: average(runs.map((entry) => entry.rivalClaimsDay8To14)),
    averageRivalClaimsDay15To21: average(runs.map((entry) => entry.rivalClaimsDay15To21)),
    last7RivalClaimShare: percentage(
      runs.reduce((sum, entry) => sum + entry.rivalClaimsDay15To21, 0),
      runs.reduce((sum, entry) => sum + entry.rivalClaimsDay1To7 + entry.rivalClaimsDay8To14 + entry.rivalClaimsDay15To21, 0),
    ),
    averageMaxOpportunityStage: average(runs.map((entry) => entry.maxOpportunityStage)),
    stageDistribution,
    averageStagnatedOpportunities: average(runs.map((entry) => entry.stagnatedOpportunities)),
    averageLostOpportunities: average(runs.map((entry) => entry.lostOpportunities)),
    rivalLossRunRate: percentage(runs.filter((entry) => entry.rivalLossRun).length, runs.length),
    difficultyCliffFromPrevious: previous ? round(previous.averageDeals - averageDeals) : 0,
  };
  const targetChecks = buildTargetChecks(difficulty, summaryBase);
  return {
    ...summaryBase,
    targetStatus: summarizeOutcomeTargetStatus(targetChecks),
    targetChecks,
    diagnosis: summarizeRunDiagnoses(runs.map((entry) => entry.diagnosis)),
  };
}

function summarizeRunDiagnoses(diagnoses: OutcomeRunDiagnosis[]): OutcomeRunDiagnosis {
  return {
    actionAttempts: mergeCountMaps(diagnoses.map((entry) => entry.actionAttempts)),
    actionSuccesses: mergeCountMaps(diagnoses.map((entry) => entry.actionSuccesses)),
    actionFailures: mergeCountMaps(diagnoses.map((entry) => entry.actionFailures)),
    negotiationActionSuccesses: sum(diagnoses.map((entry) => entry.negotiationActionSuccesses)),
    pendingClosingCreated: sum(diagnoses.map((entry) => entry.pendingClosingCreated)),
    maxPendingClosingCount: Math.max(0, ...diagnoses.map((entry) => entry.maxPendingClosingCount)),
    negotiationProcessRows: sum(diagnoses.map((entry) => entry.negotiationProcessRows)),
    negotiationProcessedCount: sum(diagnoses.map((entry) => entry.negotiationProcessedCount)),
    negotiationResolvedCount: sum(diagnoses.map((entry) => entry.negotiationResolvedCount)),
    consensusStageCounts: mergeCountMaps(diagnoses.map((entry) => entry.consensusStageCounts)),
    blockerCounts: mergeCountMaps(diagnoses.map((entry) => entry.blockerCounts)),
    averageConsensusCloseReadiness: average(diagnoses.map((entry) => entry.averageConsensusCloseReadiness).filter((entry) => entry > 0)),
    averageConsensusCloseProbability: average(diagnoses.map((entry) => entry.averageConsensusCloseProbability).filter((entry) => entry > 0)),
  };
}

function buildTargetChecks(
  difficulty: DifficultyId,
  summary: Pick<OutcomeLabSummary, 'averageDeals' | 'pAtLeastOneSelfClose21d' | 'averageRivalDeals'>,
) {
  return evaluateOutcomeTargets(difficulty, summary);
}

function mergeStageDistributions(distributions: Array<Record<string, number>>) {
  const merged: Record<string, number> = {};
  distributions.forEach((distribution) => {
    Object.entries(distribution).forEach(([key, value]) => {
      merged[key] = (merged[key] || 0) + value;
    });
  });
  return merged;
}

function mergeCountMaps(maps: CountMap[]) {
  const merged: CountMap = {};
  maps.forEach((map) => {
    Object.entries(map).forEach(([key, value]) => incrementCount(merged, key, value));
  });
  return merged;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return round(sorted[middle]);
  }
  return round((sorted[middle - 1] + sorted[middle]) / 2);
}

function percentage(count: number, total: number) {
  if (!total) {
    return 0;
  }
  return round((count / total) * 100);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function printMarkdownTable(summaries: OutcomeLabSummary[]) {
  console.log('| difficulty | runs | averageScore | averageDeals | medianDeals | pAtLeastOneSelfClose21d | averageRivalDeals | averageDelayedDeals | averageMarketCapacity | averageReleasedSlots | averagePlayerClaimedDeals | averageRivalClaimedDeals | averageMaxOpportunityStage | rivalLossRunRate | difficultyCliffFromPrevious | targetStatus |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  summaries.forEach((entry) => {
    console.log(`| ${entry.difficulty} | ${entry.runs} | ${entry.averageScore} | ${entry.averageDeals} | ${entry.medianDeals} | ${entry.pAtLeastOneSelfClose21d}% | ${entry.averageRivalDeals} | ${entry.averageDelayedDeals} | ${entry.averageMarketCapacity} | ${entry.averageReleasedSlots} | ${entry.averagePlayerClaimedDeals} | ${entry.averageRivalClaimedDeals} | ${entry.averageMaxOpportunityStage} | ${entry.rivalLossRunRate}% | ${entry.difficultyCliffFromPrevious} | ${entry.targetStatus} |`);
  });
}

function printTargetStatusTable(summaries: OutcomeLabSummary[]) {
  console.log('| difficulty | metric | actual | target | status | note |');
  console.log('|---|---|---:|---|---|---|');
  summaries.flatMap((entry) => entry.targetChecks).forEach((check) => {
    const actual = check.metric === 'pAtLeastOneSelfClose21d' ? `${check.actual}%` : String(check.actual);
    const target = check.metric === 'pAtLeastOneSelfClose21d'
      ? `${formatOutcomeTargetRange(check.target)}%`
      : formatOutcomeTargetRange(check.target);
    console.log(`| ${check.difficulty} | ${check.metric} | ${actual} | ${target} | ${check.status} | ${check.note} |`);
  });
}

function printRivalDiagnosticsTable(summaries: OutcomeLabSummary[]) {
  console.log('| difficulty | averageAvailableSlotsAtEnd | averageUnclaimedSlotsAtEnd | averageRivalClaimAttempts | averageRivalClaimSuccesses | rivalClaimSuccessRate | averageNoSlotRivalAttempts | averageFailedRivalClaimRolls | averageRivalListingsCreated | averageRivalListingsActive | averageRivalListingsExpired | averageRivalListingsSold | averageRivalListingsWithdrawn | averageRivalListingsDelayed | averagePlayerConsumedSlots | averageSlotReleaseDay | averageRivalClaimDay | averageMaxDailyRivalClaims | maxDailyRivalClaimsObserved | averageRivalListingLifespan | averageDelayedDealsCreated | averageDelayedDealsConverted | averageRemainingDelayedDealsAtEnd |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  summaries.forEach((entry) => {
    console.log(`| ${entry.difficulty} | ${entry.averageAvailableSlotsAtEnd} | ${entry.averageUnclaimedSlotsAtEnd} | ${entry.averageRivalClaimAttempts} | ${entry.averageRivalClaimSuccesses} | ${entry.rivalClaimSuccessRate}% | ${entry.averageNoSlotRivalAttempts} | ${entry.averageFailedRivalClaimRolls} | ${entry.averageRivalListingsCreated} | ${entry.averageRivalListingsActive} | ${entry.averageRivalListingsExpired} | ${entry.averageRivalListingsSold} | ${entry.averageRivalListingsWithdrawn} | ${entry.averageRivalListingsDelayed} | ${entry.averagePlayerConsumedSlots} | ${entry.averageSlotReleaseDay} | ${entry.averageRivalClaimDay} | ${entry.averageMaxDailyRivalClaims} | ${entry.maxDailyRivalClaimsObserved} | ${entry.averageRivalListingLifespan} | ${entry.averageDelayedDealsCreated} | ${entry.averageDelayedDealsConverted} | ${entry.averageRemainingDelayedDealsAtEnd} |`);
  });
}

function printDelayedDealSemanticsTable(summaries: OutcomeLabSummary[]) {
  console.log('| difficulty | delayedDealsCreated | delayedDealsConverted | remainingDelayedDealsAtEnd | note |');
  console.log('|---|---:|---:|---:|---|');
  summaries.forEach((entry) => {
    const note = entry.averageRemainingDelayedDealsAtEnd > 0
      ? '尾部残留，不视为容量越界'
      : '无尾部残留';
    console.log(`| ${entry.difficulty} | ${entry.averageDelayedDealsCreated} | ${entry.averageDelayedDealsConverted} | ${entry.averageRemainingDelayedDealsAtEnd} | ${note} |`);
  });
}

function printRivalClaimTempoTable(summaries: OutcomeLabSummary[]) {
  console.log('| difficulty | rivalClaimsDay1To7 | rivalClaimsDay8To14 | rivalClaimsDay15To21 | last7RivalClaimShare | diagnosis |');
  console.log('|---|---:|---:|---:|---:|---|');
  summaries.forEach((entry) => {
    console.log(`| ${entry.difficulty} | ${entry.averageRivalClaimsDay1To7} | ${entry.averageRivalClaimsDay8To14} | ${entry.averageRivalClaimsDay15To21} | ${entry.last7RivalClaimShare}% | ${buildRivalTempoDiagnosis(entry)} |`);
  });
}

function printPlayerClosingDiagnosisTable(summaries: OutcomeLabSummary[]) {
  console.log('| difficulty | negotiationActions | pendingClosingCreated | negotiationProcessed | negotiationResolved | maxPendingClosing | avgConsensusReadiness | avgConsensusProbability | topActions | topBlockers | consensusStages | diagnosis |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|');
  summaries.forEach((entry) => {
    const diagnosis = entry.diagnosis;
    console.log(`| ${entry.difficulty} | ${diagnosis.negotiationActionSuccesses} | ${diagnosis.pendingClosingCreated} | ${diagnosis.negotiationProcessedCount} | ${diagnosis.negotiationResolvedCount} | ${diagnosis.maxPendingClosingCount} | ${diagnosis.averageConsensusCloseReadiness} | ${diagnosis.averageConsensusCloseProbability} | ${formatTopCounts(diagnosis.actionSuccesses, 3)} | ${formatTopCounts(diagnosis.blockerCounts, 3)} | ${formatTopCounts(diagnosis.consensusStageCounts, 3)} | ${buildPlayerClosingDiagnosis(entry)} |`);
  });
}

function formatTopCounts(counts: CountMap, limit: number) {
  const entries = Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit);
  return entries.length > 0 ? entries.map(([key, value]) => `${key}:${value}`).join(', ') : '-';
}

function buildPlayerClosingDiagnosis(entry: OutcomeLabSummary) {
  const diagnosis = entry.diagnosis;
  if (diagnosis.negotiationActionSuccesses === 0) {
    return '未执行成交收口动作，优先查 selfplay action selection / availability';
  }
  if (diagnosis.pendingClosingCreated === 0) {
    return '收口动作执行但未创建 pending closing，优先查 action lifecycle';
  }
  if (diagnosis.negotiationProcessedCount === 0) {
    return 'pending closing 未被日结算处理，优先查 process manager / advanceDays';
  }
  if (entry.averageDeals === 0 && Object.keys(diagnosis.blockerCounts).length > 0) {
    return '已进入成交评估但被 blocker 挡住，优先查 topBlockers 单变量';
  }
  if (entry.averageDeals === 0 && entry.averagePlayerConsumedSlots === 0) {
    return '玩家未消耗成交槽位，优先查成交评估到 capacity claim 的桥';
  }
  return '成交链路有产出，进入小步 calibration';
}

function buildRivalTempoDiagnosis(entry: OutcomeLabSummary) {
  if ((entry.difficulty === 'hard' || entry.difficulty === 'extreme') && entry.last7RivalClaimShare >= 70) {
    return '末段集中偏高，继续观察成交窗口节奏';
  }
  return entry.last7RivalClaimShare >= 55 ? '末段压力明显' : '节奏分布可接受';
}

function buildSnapshot(options: CliOptions, summaries: OutcomeLabSummary[]): OutcomeLabSnapshot {
  return {
    metadata: {
      date: new Date().toISOString(),
      runs: options.runs,
      seed: options.seed,
      command: `npm run selfplay:outcome-lab -- ${process.argv.slice(2).join(' ')}`.trim(),
      gitCommit: readGitCommit(),
      difficultyIds: DIFFICULTY_IDS,
    },
    summaries,
  };
}

function readGitCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function writeJsonSnapshot(filePath: string, snapshot: OutcomeLabSnapshot) {
  const outputPath = resolve(filePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`JSON snapshot written: ${filePath}`);
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const summaries: OutcomeLabSummary[] = [];

  DIFFICULTY_IDS.forEach((difficulty, difficultyIndex) => {
    const runs = Array.from({ length: options.runs }, (_, runIndex) => {
      const seed = options.seed + difficultyIndex * 100_000 + runIndex * 7_919;
      return playOutcomeRun(difficulty, seed);
    });
    const summary = summarizeDifficulty(difficulty, runs, summaries[summaries.length - 1]);
    summaries.push(summary);
  });

  const snapshot = buildSnapshot(options, summaries);

  if (options.jsonPath) {
    writeJsonSnapshot(options.jsonPath, snapshot);
  }

  if (options.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  console.log(`selling-houses outcome lab · runs=${options.runs} · seed=${options.seed}`);
  printMarkdownTable(summaries);
  console.log('');
  printTargetStatusTable(summaries);
  console.log('');
  printRivalDiagnosticsTable(summaries);
  console.log('');
  printDelayedDealSemanticsTable(summaries);
  console.log('');
  printRivalClaimTempoTable(summaries);
  console.log('');
  printPlayerClosingDiagnosisTable(summaries);
  console.log('');
  console.log(JSON.stringify(snapshot, null, 2));
}

main();
