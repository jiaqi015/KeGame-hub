import { LocalAdversarialSelfPlayArena, type SelfPlayReport } from './localAdversarialSelfPlayArena';

export interface SelfPlayLabRunSummary {
  seed: number;
  soldCount: number;
  withdrawnCount: number;
  evaluationScore: number;
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
  averageSoldCount: number;
  averageWithdrawnCount: number;
  averageEvaluationScore: number;
  selloutRate: number;
  scoreSpread: number;
  runs: SelfPlayLabRunSummary[];
  findings: SelfPlayLabFinding[];
}

interface SelfPlayLabOptions {
  scenarioId: string;
  seeds: number[];
}

export class LocalAdversarialSelfPlayLab {
  private readonly scenarioId: string;
  private readonly seeds: number[];

  constructor(options: SelfPlayLabOptions) {
    if (!options.seeds.length) {
      throw new Error('评测实验室至少需要一个 seed');
    }

    this.scenarioId = options.scenarioId;
    this.seeds = options.seeds;
  }

  runBatch() {
    const reports = this.seeds.map((seed) => {
      const arena = new LocalAdversarialSelfPlayArena({
        scenarioId: this.scenarioId,
        seed,
      });
      return arena.playOneGame();
    });

    const runs = reports.map((report) => this.toRunSummary(report));
    const scores = runs.map((entry) => entry.evaluationScore);
    const soldCounts = runs.map((entry) => entry.soldCount);
    const withdrawnCounts = runs.map((entry) => entry.withdrawnCount);
    const selloutCount = runs.filter((entry) => entry.remainingActiveCases === 0 && entry.withdrawnCount === 0).length;

    return {
      scenarioId: this.scenarioId,
      seeds: this.seeds,
      runCount: runs.length,
      averageSoldCount: average(soldCounts),
      averageWithdrawnCount: average(withdrawnCounts),
      averageEvaluationScore: average(scores),
      selloutRate: round((selloutCount / runs.length) * 100),
      scoreSpread: round(Math.max(...scores) - Math.min(...scores)),
      runs,
      findings: this.buildFindings(runs),
    } satisfies SelfPlayLabReport;
  }

  private toRunSummary(report: SelfPlayReport): SelfPlayLabRunSummary {
    return {
      seed: report.seed,
      soldCount: report.soldCount,
      withdrawnCount: report.withdrawnCount,
      evaluationScore: report.evaluation.score,
      verdict: report.evaluation.verdict,
      remainingActiveCases: report.remainingActiveCases,
      remainingActiveOpportunities: report.remainingActiveOpportunities,
    };
  }

  private buildFindings(runs: SelfPlayLabRunSummary[]) {
    const findings: SelfPlayLabFinding[] = [];
    const scores = runs.map((entry) => entry.evaluationScore);
    const soldCounts = runs.map((entry) => entry.soldCount);
    const averageScore = average(scores);
    const averageSoldCount = average(soldCounts);
    const emptyRuns = runs.filter((entry) => entry.soldCount === 0).length;
    const selloutRuns = runs.filter((entry) => entry.remainingActiveCases === 0 && entry.withdrawnCount === 0).length;
    const scoreSpread = Math.max(...scores) - Math.min(...scores);
    const soldSpread = Math.max(...soldCounts) - Math.min(...soldCounts);

    if (scoreSpread >= 25) {
      findings.push({
        severity: 'major',
        title: '跨 seed 波动过大',
        detail: `同一剧本的评估分差达到 ${round(scoreSpread)}，说明随机因子正在显著放大局势波动。`,
      });
    }

    if (soldSpread >= 3) {
      findings.push({
        severity: 'major',
        title: '成交结果不稳定',
        detail: `批量自玩里最高与最低成交数相差 ${round(soldSpread)} 单，说明玩法表现对随机数过敏。`,
      });
    }

    if (emptyRuns >= Math.ceil(runs.length / 3)) {
      findings.push({
        severity: 'major',
        title: '存在较多零成交局',
        detail: `${emptyRuns}/${runs.length} 局没有任何成交，说明中后段收口机制仍然偏脆。`,
      });
    }

    if (averageScore < 25) {
      findings.push({
        severity: 'major',
        title: '平均表现偏低',
        detail: `批量样本平均评估分只有 ${round(averageScore)}，说明当前剧本整体压力已经明显高于稳定可玩区间。`,
      });
    }

    if (selloutRuns === 0 && averageSoldCount <= 2) {
      findings.push({
        severity: 'major',
        title: '收口能力不足',
        detail: `所有样本都没能清局，且平均成交仅 ${round(averageSoldCount)} 单，说明中后段成交闭环还需要补强。`,
      });
    }

    if (selloutRuns === runs.length) {
      findings.push({
        severity: 'minor',
        title: '难度偏软',
        detail: '全部样本都能无撤盘清局，后续可以继续加压。',
      });
    }

    if (!findings.length) {
      findings.push({
        severity: 'minor',
        title: '波动处于可接受范围',
        detail: '当前批量样本里没有看到特别突兀的稳定性异常。',
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
