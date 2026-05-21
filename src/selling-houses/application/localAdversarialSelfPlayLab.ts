import {
  LocalAdversarialSelfPlayArena,
  buildSelfPlayRunSnapshot,
  type SelfPlayReport,
} from './localAdversarialSelfPlayArena.js';
import { getScenarioSnapshotById } from '../domain/scenarioCatalog.js';
import type { DifficultyId } from '../domain/models.js';

export interface SelfPlayLabRunSummary {
  seed: number;
  evaluationScore: number;
  abilityScore: number;
  defenseScore: number;
  satisfactionScore: number;
  endingGood: number;
  endingNeutral: number;
  endingBad: number;
  coreBadCount: number;
  lostToRivalCount: number;
  activeRivalListings: number;
  totalRivalListings: number;
  marketSignals: number;
  inboundCount: number;
  dailyEventCount: number;
  rivalPressureEvents: number;
  companyPressureEvents: number;
  meshTurnCount: number;
  meshReadyCount: number;
  meshNeedsReviewCount: number;
  meshBlockedCount: number;
  meshShadowRoleCount: number;
  meshComparisonMatched: boolean | null;
  verdict: string;
  remainingActiveCases: number;
  remainingActiveOpportunities: number;
}

export interface SelfPlayLabFinding {
  severity: 'major' | 'minor';
  title: string;
  detail: string;
}

export interface SelfPlayLabReport {
  scenarioId: string;
  seeds: number[];
  runCount: number;
  averageEvaluationScore: number;
  averageAbilityScore: number;
  averageDefenseScore: number;
  averageSatisfactionScore: number;
  averageEndingGood: number;
  averageEndingBad: number;
  coreBadRunRate: number;
  rivalLossRunRate: number;
  averageTotalRivalListings: number;
  averageMarketSignals: number;
  averageInboundCount: number;
  averageDailyEventCount: number;
  averageRivalPressureEvents: number;
  averageCompanyPressureEvents: number;
  averageMeshTurnCount: number;
  averageMeshReadyCount: number;
  averageMeshNeedsReviewCount: number;
  averageMeshBlockedCount: number;
  meshTraceRunRate: number;
  meshReadyRunRate: number;
  meshComparisonMatchRunRate: number | null;
  scoreSpread: number;
  runs: SelfPlayLabRunSummary[];
  findings: SelfPlayLabFinding[];
}

interface SelfPlayLabOptions {
  scenarioId: string;
  seeds: number[];
  referenceMeshReport?: unknown;
}

export class LocalAdversarialSelfPlayLab {
  private readonly scenarioId: string;
  private readonly seeds: number[];
  private readonly difficultyId: DifficultyId;
  private readonly referenceMeshReport: unknown;

  constructor(options: SelfPlayLabOptions) {
    if (!options.seeds.length) {
      throw new Error('评测实验室至少需要一个 seed');
    }

    this.scenarioId = options.scenarioId;
    this.seeds = options.seeds;
    this.difficultyId = getScenarioSnapshotById(options.scenarioId)?.scenario.difficultyId || 'standard';
    this.referenceMeshReport = options.referenceMeshReport ?? null;
  }

  runBatch() {
    const reports = this.seeds.map((seed) => {
      const arena = new LocalAdversarialSelfPlayArena({
        scenarioId: this.scenarioId,
        seed,
        referenceMeshReport: this.referenceMeshReport,
      });
      return arena.playOneGame();
    });

    const runs = reports.map((report) => this.toRunSummary(report));
    const scores = runs.map((entry) => entry.evaluationScore);
    const abilityScores = runs.map((entry) => entry.abilityScore);
    const defenseScores = runs.map((entry) => entry.defenseScore);
    const satisfactionScores = runs.map((entry) => entry.satisfactionScore);
    const endingGoods = runs.map((entry) => entry.endingGood);
    const endingBads = runs.map((entry) => entry.endingBad);
    const totalRivalListings = runs.map((entry) => entry.totalRivalListings);
    const marketSignals = runs.map((entry) => entry.marketSignals);
    const inboundCounts = runs.map((entry) => entry.inboundCount);
    const dailyEventCounts = runs.map((entry) => entry.dailyEventCount);
    const rivalPressureEvents = runs.map((entry) => entry.rivalPressureEvents);
    const companyPressureEvents = runs.map((entry) => entry.companyPressureEvents);
    const meshTurnCounts = runs.map((entry) => entry.meshTurnCount);
    const meshReadyCounts = runs.map((entry) => entry.meshReadyCount);
    const meshNeedsReviewCounts = runs.map((entry) => entry.meshNeedsReviewCount);
    const meshBlockedCounts = runs.map((entry) => entry.meshBlockedCount);
    const coreBadRuns = runs.filter((entry) => entry.coreBadCount > 0).length;
    const rivalLossRuns = runs.filter((entry) => entry.lostToRivalCount > 0).length;
    const meshTraceRuns = runs.filter((entry) => entry.meshTurnCount > 0).length;
    const meshReadyRuns = runs.filter((entry) => entry.meshReadyCount > 0).length;
    const meshComparisonRuns = runs.filter((entry) => entry.meshComparisonMatched !== null).length;
    const meshComparisonMatchRuns = runs.filter((entry) => entry.meshComparisonMatched === true).length;

    return {
      scenarioId: this.scenarioId,
      seeds: this.seeds,
      runCount: runs.length,
      averageEvaluationScore: average(scores),
      averageAbilityScore: average(abilityScores),
      averageDefenseScore: average(defenseScores),
      averageSatisfactionScore: average(satisfactionScores),
      averageEndingGood: average(endingGoods),
      averageEndingBad: average(endingBads),
      coreBadRunRate: round((coreBadRuns / runs.length) * 100),
      rivalLossRunRate: round((rivalLossRuns / runs.length) * 100),
      averageTotalRivalListings: average(totalRivalListings),
      averageMarketSignals: average(marketSignals),
      averageInboundCount: average(inboundCounts),
      averageDailyEventCount: average(dailyEventCounts),
      averageRivalPressureEvents: average(rivalPressureEvents),
      averageCompanyPressureEvents: average(companyPressureEvents),
      averageMeshTurnCount: average(meshTurnCounts),
      averageMeshReadyCount: average(meshReadyCounts),
      averageMeshNeedsReviewCount: average(meshNeedsReviewCounts),
      averageMeshBlockedCount: average(meshBlockedCounts),
      meshTraceRunRate: round((meshTraceRuns / runs.length) * 100),
      meshReadyRunRate: round((meshReadyRuns / runs.length) * 100),
      meshComparisonMatchRunRate: meshComparisonRuns > 0
        ? round((meshComparisonMatchRuns / meshComparisonRuns) * 100)
        : null,
      scoreSpread: round(Math.max(...scores) - Math.min(...scores)),
      runs,
      findings: this.buildFindings(runs),
    } satisfies SelfPlayLabReport;
  }

  private toRunSummary(report: SelfPlayReport): SelfPlayLabRunSummary {
    const snapshot = buildSelfPlayRunSnapshot(report.finalResult);
    return {
      seed: report.seed,
      evaluationScore: report.evaluation.score,
      abilityScore: snapshot.abilityScore,
      defenseScore: snapshot.defenseScore,
      satisfactionScore: snapshot.satisfactionScore,
      endingGood: snapshot.endingGood,
      endingNeutral: snapshot.endingNeutral,
      endingBad: snapshot.endingBad,
      coreBadCount: snapshot.coreBadCount,
      lostToRivalCount: snapshot.lostToRivalCount,
      activeRivalListings: report.shadowStats.activeRivalListings,
      totalRivalListings: report.shadowStats.totalRivalListings,
      marketSignals: report.shadowStats.marketSignals,
      inboundCount: report.shadowStats.inboundCount,
      dailyEventCount: report.shadowStats.dailyEventCount,
      rivalPressureEvents: report.shadowStats.rivalPressureEvents,
      companyPressureEvents: report.shadowStats.companyPressureEvents,
      meshTurnCount: 0,
      meshReadyCount: 0,
      meshNeedsReviewCount: 0,
      meshBlockedCount: 0,
      meshShadowRoleCount: 0,
      meshComparisonMatched: null,
      verdict: report.evaluation.verdict,
      remainingActiveCases: report.remainingActiveCases,
      remainingActiveOpportunities: report.remainingActiveOpportunities,
    };
  }

  private buildFindings(runs: SelfPlayLabRunSummary[]) {
    const findings: SelfPlayLabFinding[] = [];
    const scores = runs.map((entry) => entry.evaluationScore);
    const defenseScores = runs.map((entry) => entry.defenseScore);
    const endingBadCounts = runs.map((entry) => entry.endingBad);
    const lostToRivalCounts = runs.map((entry) => entry.lostToRivalCount);
    const averageInboundCount = average(runs.map((entry) => entry.inboundCount));
    const averageDailyEventCount = average(runs.map((entry) => entry.dailyEventCount));
    const averageRivalPressureEvents = average(runs.map((entry) => entry.rivalPressureEvents));
    const averageMeshTurnCount = average(runs.map((entry) => entry.meshTurnCount));
    const averageMeshReadyCount = average(runs.map((entry) => entry.meshReadyCount));
    const averageScore = average(scores);
    const averageDefenseScore = average(defenseScores);
    const averageEndingBad = average(endingBadCounts);
    const coreBadRuns = runs.filter((entry) => entry.coreBadCount > 0).length;
    const rivalLossRuns = runs.filter((entry) => entry.lostToRivalCount > 0).length;
    const noGoodFinishRuns = runs.filter((entry) => entry.endingGood === 0).length;
    const meshTraceRuns = runs.filter((entry) => entry.meshTurnCount > 0).length;
    const meshReadyRuns = runs.filter((entry) => entry.meshReadyCount > 0).length;
    const meshComparisonRuns = runs.filter((entry) => entry.meshComparisonMatched !== null).length;
    const meshComparisonMatchRuns = runs.filter((entry) => entry.meshComparisonMatched === true).length;
    const scoreSpread = Math.max(...scores) - Math.min(...scores);
    const defenseSpread = Math.max(...defenseScores) - Math.min(...defenseScores);

    if (scoreSpread >= 25) {
      findings.push({
        severity: 'major',
        title: '跨 seed 波动过大',
        detail: `同一剧本的评估分差达到 ${round(scoreSpread)}，说明随机因子正在显著放大局势波动。`,
      });
    }

    if (defenseSpread >= 12) {
      findings.push({
        severity: 'major',
        title: '守盘结果不稳定',
        detail: `批量自玩里最高与最低守盘分相差 ${round(defenseSpread)}，说明同一剧本的守盘体感波动偏大。`,
      });
    }

    if (noGoodFinishRuns >= Math.ceil(runs.length / 3)) {
      findings.push({
        severity: 'major',
        title: '存在较多无好收尾局',
        detail: `${noGoodFinishRuns}/${runs.length} 局一套好收尾都没有，说明房源主线很难被经营到体面收尾。`,
      });
    }

    if (averageScore < 25) {
      findings.push({
        severity: 'major',
        title: '平均表现偏低',
        detail: `批量样本平均评估分只有 ${round(averageScore)}，说明当前剧本整体压力已经明显高于稳定可玩区间。`,
      });
    }

    if (coreBadRuns >= Math.ceil(runs.length / 3)) {
      findings.push({
        severity: 'major',
        title: '核心盘经常坏收尾',
        detail: `${coreBadRuns}/${runs.length} 局出现核心盘坏收尾，说明核心盘保护线还不够稳。`,
      });
    }

    const rivalLossRate = (rivalLossRuns / runs.length) * 100;
    const rivalLossCeilingByDifficulty: Record<DifficultyId, number> = {
      warmup: 15,
      easy: 35,
      standard: 75,
      advanced: 85,
      hard: 95,
      extreme: 100,
    };
    if (rivalLossRate > rivalLossCeilingByDifficulty[this.difficultyId]) {
      findings.push({
        severity: 'major',
        title: '被截走频率偏高',
        detail: `${rivalLossRuns}/${runs.length} 局出现被竞品截走，超过 ${this.difficultyId} 难度目标上限 ${rivalLossCeilingByDifficulty[this.difficultyId]}%。`,
      });
    }

    const eventCeilingByDifficulty: Record<DifficultyId, { daily: number; inbound: number; rivalPressure: number }> = {
      warmup: { daily: 2, inbound: 5, rivalPressure: 2 },
      easy: { daily: 4, inbound: 8, rivalPressure: 5 },
      standard: { daily: 5, inbound: 8, rivalPressure: 6 },
      advanced: { daily: 6, inbound: 9, rivalPressure: 8 },
      hard: { daily: 7, inbound: 9, rivalPressure: 10 },
      extreme: { daily: 8, inbound: 10, rivalPressure: 12 },
    };
    const eventCeiling = eventCeilingByDifficulty[this.difficultyId];
    if (averageDailyEventCount > eventCeiling.daily || averageInboundCount > eventCeiling.inbound) {
      findings.push({
        severity: 'major',
        title: '商圈事件密度偏高',
        detail: `平均每日事件累计 ${round(averageDailyEventCount)}，外部入场累计 ${round(averageInboundCount)}，超过 ${this.difficultyId} 难度目标密度。`,
      });
    }

    if (averageRivalPressureEvents > eventCeiling.rivalPressure) {
      findings.push({
        severity: 'major',
        title: '竞品提示过密',
        detail: `平均竞品压力事件 ${round(averageRivalPressureEvents)} 次，超过 ${this.difficultyId} 难度目标密度。`,
      });
    }

    if (averageDefenseScore < 18 || averageEndingBad >= 2) {
      findings.push({
        severity: 'major',
        title: '守盘线整体偏脆',
        detail: `平均守盘分 ${round(averageDefenseScore)}，平均坏收尾 ${round(averageEndingBad)} 套，当前剧本容易把局打成失守局。`,
      });
    }

    if (rivalLossRuns === 0 && coreBadRuns === 0 && averageEndingBad === 0) {
      findings.push({
        severity: 'minor',
        title: '难度偏软',
        detail: '样本里几乎没有出现失守和坏收尾，后续可以继续加压。',
      });
    }

    if (averageMeshTurnCount === 0) {
      findings.push({
        severity: 'minor',
        title: '没有观测到 mesh 证据',
        detail: '本批次没有任何对话 mesh trace，说明 self-play 目前还主要停留在经营动作层。',
      });
    } else if (averageMeshReadyCount === 0) {
      findings.push({
        severity: 'minor',
        title: 'mesh 准备度偏低',
        detail: '本批次虽然有对话 mesh trace，但没有 ready 记录，提示词或角色顺序还需要继续打磨。',
      });
    }

    if (meshComparisonRuns > 0 && meshComparisonMatchRuns < meshComparisonRuns) {
      findings.push({
        severity: 'minor',
        title: 'mesh 对照存在偏差',
        detail: `有 ${meshComparisonMatchRuns}/${meshComparisonRuns} 局与参考 mesh 完全一致，说明 role ordering 或 readiness 仍有漂移。`,
      });
    }

    if (!findings.length) {
      findings.push({
        severity: 'minor',
        title: '波动处于可接受范围',
        detail: '当前批量样本里，分数、收尾结构和守盘表现都还在可接受范围。',
      });
    }

    return findings;
  }
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
