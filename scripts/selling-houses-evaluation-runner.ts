import { LocalAdversarialSelfPlayLab } from '../src/selling-houses/application/localAdversarialSelfPlayLab';
import type { SelfPlayLabRunSummary } from '../src/selling-houses/application/localAdversarialSelfPlayLab';
import fs from 'node:fs';
import path from 'node:path';

export interface DifficultyReport {
  difficultyId: string;
  scenarioId: string;
  scenarioName: string;
  runCount: number;
  averageEvaluationScore: number;
  averageAbilityScore: number;
  averageDefenseScore: number;
  averageSatisfactionScore: number;
  averageEndingGood: number;
  averageEndingBad: number;
  coreBadRunRate: number;
  rivalLossRunRate: number;
  scoreSpread: number;
  runs: SelfPlayLabRunSummary[];
  findings: string[];
}

export interface EvaluationScenario {
  id: string;
  name: string;
}

export interface EvaluationRunnerOptions {
  title: string;
  outputPath: string;
  scenarios?: Record<string, EvaluationScenario>;
  seedsPerDifficulty?: Record<string, number[]>;
  runsPerDifficulty?: number;
  seedBaseMultiplier?: number;
  includeStdDev?: boolean;
  percentileMode?: 'none' | 'quartiles' | 'deciles';
  printDesignAdvice?: boolean;
}

interface EvaluationPlanItem {
  difficultyId: string;
  scenario: EvaluationScenario;
  seeds: number[];
}

export const DEFAULT_EVALUATION_SCENARIOS: Record<string, EvaluationScenario> = {
  warmup: { id: 'warmup-clean-handoff', name: '顺手开场局' },
  easy: { id: 'easy-fresh-start', name: '前滩热身局' },
  standard: { id: 'standard-window-chain', name: '换房节奏链' },
  advanced: { id: 'advanced-window-crossfire', name: '进阶交火局' },
  hard: { id: 'hard-market-shock', name: '市场冲击局' },
  extreme: { id: 'extreme-last-stand', name: '残局识别局' },
};

function generateSeeds(difficultyIndex: number, count: number, seedBaseMultiplier: number): number[] {
  return Array.from({ length: count }, (_, index) => difficultyIndex * seedBaseMultiplier + index + 1);
}

function resolveSeeds(
  difficultyId: string,
  difficultyIndex: number,
  options: EvaluationRunnerOptions,
) {
  const provided = options.seedsPerDifficulty?.[difficultyId];
  if (provided) return provided;
  return generateSeeds(difficultyIndex, options.runsPerDifficulty ?? 1, options.seedBaseMultiplier ?? 10000);
}

function buildEvaluationPlan(options: EvaluationRunnerOptions): EvaluationPlanItem[] {
  const scenarios = options.scenarios ?? DEFAULT_EVALUATION_SCENARIOS;
  return Object.keys(scenarios).map((difficultyId, index) => ({
    difficultyId,
    scenario: scenarios[difficultyId],
    seeds: resolveSeeds(difficultyId, index, options),
  }));
}

function runEvaluation(options: EvaluationRunnerOptions): DifficultyReport[] {
  const plan = buildEvaluationPlan(options);
  const plannedTotalRuns = plan.reduce((sum, item) => sum + item.seeds.length, 0);
  const reports: DifficultyReport[] = [];
  let totalCompleted = 0;

  plan.forEach(({ difficultyId, scenario, seeds }) => {
    console.log(`\n[${totalCompleted + 1}-${totalCompleted + seeds.length}/${plannedTotalRuns}] 运行 ${difficultyId} (${scenario.name}) - ${seeds.length} 局`);

    const lab = new LocalAdversarialSelfPlayLab({
      scenarioId: scenario.id,
      seeds,
    });
    const report = lab.runBatch();

    reports.push({
      difficultyId,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      runCount: report.runCount,
      averageEvaluationScore: report.averageEvaluationScore,
      averageAbilityScore: report.averageAbilityScore,
      averageDefenseScore: report.averageDefenseScore,
      averageSatisfactionScore: report.averageSatisfactionScore,
      averageEndingGood: report.averageEndingGood,
      averageEndingBad: report.averageEndingBad,
      coreBadRunRate: report.coreBadRunRate,
      rivalLossRunRate: report.rivalLossRunRate,
      scoreSpread: report.scoreSpread,
      runs: report.runs,
      findings: report.findings.map((finding) => `[${finding.severity}] ${finding.title}: ${finding.detail}`),
    });

    console.log(`  平均评估分: ${report.averageEvaluationScore}`);
    console.log(`  好/坏收尾: ${report.averageEndingGood.toFixed(1)} / ${report.averageEndingBad.toFixed(1)}`);
    console.log(`  核心坏收尾率: ${report.coreBadRunRate}% | 被截走率: ${report.rivalLossRunRate}%`);
    totalCompleted += seeds.length;
  });

  return reports;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function stdDev(values: number[], mean = average(values)) {
  return Math.sqrt(average(values.map((value) => Math.pow(value - mean, 2))));
}

function percentile(sortedScores: number[], ratio: number) {
  return sortedScores[Math.floor(sortedScores.length * ratio)] ?? sortedScores[sortedScores.length - 1] ?? 0;
}

function printPercentiles(scores: number[], mode: EvaluationRunnerOptions['percentileMode']) {
  if (mode === 'deciles') {
    console.log(`  分位数: P10=${percentile(scores, 0.1)} | P25=${percentile(scores, 0.25)} | P50=${percentile(scores, 0.5)} | P75=${percentile(scores, 0.75)} | P90=${percentile(scores, 0.9)}`);
  } else if (mode === 'quartiles') {
    console.log(`  分位数: P25=${percentile(scores, 0.25)} | P50=${percentile(scores, 0.5)} | P75=${percentile(scores, 0.75)}`);
  }
}

function diagnosticScoreSpread(report: DifficultyReport) {
  if (report.runCount < 30) {
    return report.scoreSpread;
  }
  const scores = [...report.runs.map((run) => run.evaluationScore)].sort((a, b) => a - b);
  return percentile(scores, 0.9) - percentile(scores, 0.1);
}

function generateReport(reports: DifficultyReport[], options: EvaluationRunnerOptions) {
  const totalRuns = reports.reduce((sum, report) => sum + report.runCount, 0);
  const allScores = reports.flatMap((report) => report.runs.map((run) => run.evaluationScore));
  const overallAverage = average(allScores);
  const overallMin = Math.min(...allScores);
  const overallMax = Math.max(...allScores);
  const overallStdDev = stdDev(allScores, overallAverage);

  console.log('\n' + '='.repeat(80));
  console.log(options.title);
  console.log('='.repeat(80));
  console.log(`\n总运行局数: ${totalRuns}`);
  console.log(`全局平均评估分: ${overallAverage.toFixed(1)}`);
  if (options.includeStdDev) {
    console.log(`全局标准差: ${overallStdDev.toFixed(1)}`);
  }
  console.log(`全局分数范围: ${overallMin} - ${overallMax}`);

  console.log('\n--- 难度阶梯分析 ---');
  console.log('难度        | 样本 | 平均分 | 能力 | 守盘 | 满意 | 好收尾 | 坏收尾 | 核心坏收尾率 | 被截走率 | 分差');
  console.log('-'.repeat(110));
  reports.forEach((report) => {
    console.log(
      `${report.difficultyId.padEnd(12)} | ${report.runCount.toString().padStart(4)} | ${report.averageEvaluationScore.toFixed(1).padStart(6)} | ${report.averageAbilityScore.toFixed(1).padStart(4)} | ${report.averageDefenseScore.toFixed(1).padStart(4)} | ${report.averageSatisfactionScore.toFixed(1).padStart(4)} | ${report.averageEndingGood.toFixed(1).padStart(6)} | ${report.averageEndingBad.toFixed(1).padStart(6)} | ${(report.coreBadRunRate + '%').padStart(12)} | ${(report.rivalLossRunRate + '%').padStart(8)} | ${report.scoreSpread.toString().padStart(4)}`,
    );
  });

  console.log('\n--- 各难度详细分析 ---');
  reports.forEach((report) => {
    const scores = [...report.runs.map((run) => run.evaluationScore)].sort((a, b) => a - b);
    console.log(`\n【${report.difficultyId.toUpperCase()}】${report.scenarioName}`);
    console.log(`  剧本ID: ${report.scenarioId}`);
    console.log(`  样本数: ${report.runCount}`);
    console.log(`  平均评估分: ${report.averageEvaluationScore.toFixed(1)}${options.includeStdDev ? ` (标准差: ${stdDev(scores, report.averageEvaluationScore).toFixed(1)})` : ''}`);
    printPercentiles(scores, options.percentileMode ?? 'none');
    console.log(`  能力/守盘/满意: ${report.averageAbilityScore.toFixed(1)} / ${report.averageDefenseScore.toFixed(1)} / ${report.averageSatisfactionScore.toFixed(1)}`);
    console.log(`  好/坏收尾: ${report.averageEndingGood.toFixed(1)} / ${report.averageEndingBad.toFixed(1)}`);
    console.log(`  核心盘坏收尾率: ${report.coreBadRunRate}%`);
    console.log(`  被竞品截走率: ${report.rivalLossRunRate}%`);
    console.log(`  分数波动范围: ${report.scoreSpread}`);
    if (report.findings.length > 0) {
      console.log('  发现的问题:');
      report.findings.forEach((finding) => console.log(`    - ${finding}`));
    }
  });

  console.log('\n--- 难度曲线评估 ---');
  const scores = reports.map((report) => ({ difficulty: report.difficultyId, score: report.averageEvaluationScore }));
  const isMonotonic = scores.every((entry, index) => index === 0 || entry.score <= scores[index - 1].score);
  console.log(`难度递减曲线是否单调: ${isMonotonic ? '是' : '否'}`);
  if (!isMonotonic) {
    console.log('注意: 存在难度倒挂现象，需要检查剧本参数平衡性');
    scores.forEach((entry, index) => {
      if (index > 0 && entry.score > scores[index - 1].score) {
        console.log(`  倒挂: ${entry.difficulty}(${entry.score.toFixed(1)}) > ${scores[index - 1].difficulty}(${scores[index - 1].score.toFixed(1)})`);
      }
    });
  }

  console.log('\n--- 核心发现 ---');
  const criticalFindings: string[] = [];
  reports.forEach((report) => {
    if (report.coreBadRunRate > 50) criticalFindings.push(`${report.difficultyId}: 核心盘坏收尾率过高(${report.coreBadRunRate}%)，需要加强核心盘保护机制`);
    if (report.rivalLossRunRate > 80) criticalFindings.push(`${report.difficultyId}: 被竞品截走率过高(${report.rivalLossRunRate}%)，竞品压力可能过大`);
    if (report.averageEvaluationScore < 30) criticalFindings.push(`${report.difficultyId}: 平均评估分过低(${report.averageEvaluationScore.toFixed(1)})，难度可能过高`);
    const scoreSpreadForDiagnosis = diagnosticScoreSpread(report);
    if (scoreSpreadForDiagnosis > 40) criticalFindings.push(`${report.difficultyId}: 分数波动过大(${scoreSpreadForDiagnosis})，随机性影响过强`);
  });
  if (criticalFindings.length > 0) {
    criticalFindings.forEach((finding) => console.log(`  ⚠️ ${finding}`));
  } else {
    console.log('  ✅ 未发现严重平衡性问题');
  }

  if (options.printDesignAdvice) {
    console.log('\n--- 设计建议 ---');
    console.log('1. 难度曲线: 从warmup到extreme，平均分应呈单调递减趋势');
    console.log('2. 守盘压力: 高难度下守盘分应明显下降，但不应低于15');
    console.log('3. 满意度: 满意分应随难度下降，但不应低于12');
    console.log('4. 收尾结构: 高难度下坏收尾应增加，但核心盘坏收尾率不应超过60%');
    console.log('5. 竞品压力: 高难度下被截走率应上升，但不应超过90%');
    console.log('6. 随机性: warmup 可容许成功程度差异到35分，其余难度同难度分数波动不应超过30分');
  }

  return {
    totalRuns,
    overallAverage,
    ...(options.includeStdDev ? { overallStdDev } : {}),
    overallMin,
    overallMax,
    reports,
  };
}

export function runSelfPlayEvaluation(options: EvaluationRunnerOptions) {
  const reports = runEvaluation(options);
  const summary = generateReport(reports, options);

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\n详细结果已保存到: ${options.outputPath}`);

  return summary;
}
