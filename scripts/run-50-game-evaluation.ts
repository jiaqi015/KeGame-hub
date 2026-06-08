import { LocalAdversarialSelfPlayLab } from '../src/selling-houses/application/localAdversarialSelfPlayLab';
import type { SelfPlayLabReport, SelfPlayLabRunSummary } from '../src/selling-houses/application/localAdversarialSelfPlayLab';

interface DifficultyReport {
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

// 6个难度的剧本ID
const SCENARIOS: Record<string, { id: string; name: string }> = {
  warmup: { id: 'warmup-clean-handoff', name: '顺手开场局' },
  easy: { id: 'easy-fresh-start', name: '前滩热身局' },
  standard: { id: 'standard-window-chain', name: '换房节奏链' },
  advanced: { id: 'advanced-window-crossfire', name: '进阶交火局' },
  hard: { id: 'hard-market-shock', name: '市场冲击局' },
  extreme: { id: 'extreme-last-stand', name: '残局识别局' },
};

// 每个难度分配的seed数量，总计50局
const SEEDS_PER_DIFFICULTY: Record<string, number[]> = {
  warmup: [101, 202, 303, 404, 505, 606, 707, 808],
  easy: [1101, 1202, 1303, 1404, 1505, 1606, 1707, 1808],
  standard: [2101, 2202, 2303, 2404, 2505, 2606, 2707, 2808],
  advanced: [3101, 3202, 3303, 3404, 3505, 3606, 3707, 3808],
  hard: [4101, 4202, 4303, 4404, 4505, 4606, 4707, 4808],
  extreme: [5101, 5202, 5303, 5404, 5505, 5606, 5707],
};

function runEvaluation(): DifficultyReport[] {
  const reports: DifficultyReport[] = [];

  for (const [difficultyId, scenario] of Object.entries(SCENARIOS)) {
    const seeds = SEEDS_PER_DIFFICULTY[difficultyId];
    console.log(`\n=== 运行 ${difficultyId} (${scenario.name}) - ${seeds.length} 局 ===`);

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
      findings: report.findings.map((f) => `[${f.severity}] ${f.title}: ${f.detail}`),
    });

    console.log(`  平均评估分: ${report.averageEvaluationScore}`);
    console.log(`  平均能力/守盘/满意: ${report.averageAbilityScore} / ${report.averageDefenseScore} / ${report.averageSatisfactionScore}`);
    console.log(`  平均好/坏收尾: ${report.averageEndingGood} / ${report.averageEndingBad}`);
    console.log(`  核心盘坏收尾率: ${report.coreBadRunRate}%`);
    console.log(`  被截走触发率: ${report.rivalLossRunRate}%`);
  }

  return reports;
}

function generateReport(reports: DifficultyReport[]) {
  const totalRuns = reports.reduce((sum, r) => sum + r.runCount, 0);
  const allScores = reports.flatMap((r) => r.runs.map((run) => run.evaluationScore));
  const overallAverage = allScores.reduce((sum, s) => sum + s, 0) / allScores.length;
  const overallMin = Math.min(...allScores);
  const overallMax = Math.max(...allScores);

  console.log('\n' + '='.repeat(80));
  console.log('我是王牌资产顾问 · 50局跨难度自玩评测报告');
  console.log('='.repeat(80));
  console.log(`\n总运行局数: ${totalRuns}`);
  console.log(`全局平均评估分: ${overallAverage.toFixed(1)}`);
  console.log(`全局分数范围: ${overallMin} - ${overallMax}`);

  console.log('\n--- 难度阶梯分析 ---');
  console.log('难度        | 剧本名         | 样本 | 平均分 | 能力 | 守盘 | 满意 | 好收尾 | 坏收尾 | 核心坏收尾率 | 被截走率 | 分差');
  console.log('-'.repeat(110));

  for (const r of reports) {
    console.log(
      `${r.difficultyId.padEnd(12)} | ${r.scenarioName.padEnd(14)} | ${r.runCount.toString().padStart(4)} | ${r.averageEvaluationScore.toFixed(1).padStart(6)} | ${r.averageAbilityScore.toFixed(1).padStart(4)} | ${r.averageDefenseScore.toFixed(1).padStart(4)} | ${r.averageSatisfactionScore.toFixed(1).padStart(4)} | ${r.averageEndingGood.toFixed(1).padStart(6)} | ${r.averageEndingBad.toFixed(1).padStart(6)} | ${(r.coreBadRunRate + '%').padStart(12)} | ${(r.rivalLossRunRate + '%').padStart(8)} | ${r.scoreSpread.toString().padStart(4)}`
    );
  }

  console.log('\n--- 各难度详细分析 ---');
  for (const r of reports) {
    console.log(`\n【${r.difficultyId.toUpperCase()}】${r.scenarioName}`);
    console.log(`  剧本ID: ${r.scenarioId}`);
    console.log(`  样本数: ${r.runCount}`);
    console.log(`  平均评估分: ${r.averageEvaluationScore.toFixed(1)}`);
    console.log(`  平均能力分: ${r.averageAbilityScore.toFixed(1)}`);
    console.log(`  平均守盘分: ${r.averageDefenseScore.toFixed(1)}`);
    console.log(`  平均满意分: ${r.averageSatisfactionScore.toFixed(1)}`);
    console.log(`  平均好收尾: ${r.averageEndingGood.toFixed(1)}`);
    console.log(`  平均坏收尾: ${r.averageEndingBad.toFixed(1)}`);
    console.log(`  核心盘坏收尾率: ${r.coreBadRunRate}%`);
    console.log(`  被竞品截走率: ${r.rivalLossRunRate}%`);
    console.log(`  分数波动范围: ${r.scoreSpread}`);

    if (r.findings.length > 0) {
      console.log(`  发现的问题:`);
      r.findings.forEach((f) => console.log(`    - ${f}`));
    }
  }

  console.log('\n--- 难度曲线评估 ---');
  const scores = reports.map((r) => ({ difficulty: r.difficultyId, score: r.averageEvaluationScore }));
  const isMonotonic = scores.every((s, i) => i === 0 || s.score <= scores[i - 1].score);
  console.log(`难度递减曲线是否单调: ${isMonotonic ? '是' : '否'}`);

  if (!isMonotonic) {
    console.log('注意: 存在难度倒挂现象，需要检查剧本参数平衡性');
  }

  console.log('\n--- 核心发现 ---');
  const criticalFindings: string[] = [];

  for (const r of reports) {
    if (r.coreBadRunRate > 50) {
      criticalFindings.push(`${r.difficultyId}: 核心盘坏收尾率过高(${r.coreBadRunRate}%)，需要加强核心盘保护机制`);
    }
    if (r.rivalLossRunRate > 80) {
      criticalFindings.push(`${r.difficultyId}: 被竞品截走率过高(${r.rivalLossRunRate}%)，竞品压力可能过大`);
    }
    if (r.averageEvaluationScore < 30) {
      criticalFindings.push(`${r.difficultyId}: 平均评估分过低(${r.averageEvaluationScore.toFixed(1)})，难度可能过高`);
    }
    if (r.scoreSpread > 40) {
      criticalFindings.push(`${r.difficultyId}: 分数波动过大(${r.scoreSpread})，随机性影响过强`);
    }
  }

  if (criticalFindings.length > 0) {
    criticalFindings.forEach((f) => console.log(`  ⚠️ ${f}`));
  } else {
    console.log('  ✅ 未发现严重平衡性问题');
  }

  console.log('\n--- 设计建议 ---');
  console.log('1. 难度曲线: 从warmup到extreme，平均分应呈单调递减趋势');
  console.log('2. 守盘压力: 高难度下守盘分应明显下降，但不应低于15');
  console.log('3. 满意度: 满意分应随难度下降，但不应低于12');
  console.log('4. 收尾结构: 高难度下坏收尾应增加，但核心盘坏收尾率不应超过60%');
  console.log('5. 竞品压力: 高难度下被截走率应上升，但不应超过90%');
  console.log('6. 随机性: 同难度下分数波动不应超过30分');

  return {
    totalRuns,
    overallAverage,
    overallMin,
    overallMax,
    reports,
  };
}

// 主程序
const reports = runEvaluation();
const summary = generateReport(reports);

// 保存详细结果到文件
const outputPath = '/Users/jiaqi/Documents/开放日测算/output/50-game-evaluation.json';
import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');
console.log(`\n详细结果已保存到: ${outputPath}`);
