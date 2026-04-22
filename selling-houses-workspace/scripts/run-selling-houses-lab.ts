import { LocalAdversarialSelfPlayLab } from '../src/selling-houses/application/localAdversarialSelfPlayLab';

const scenarioId = process.argv[2] || 'standard-window-chain';
const seedArgs = process.argv.slice(3).map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
const seeds = seedArgs.length ? seedArgs : [101, 202, 303, 404, 505];

const lab = new LocalAdversarialSelfPlayLab({ scenarioId, seeds });
const report = lab.runBatch();

const headline = [
  `剧本: ${report.scenarioId}`,
  `样本: ${report.runCount} 局`,
  `平均评估分: ${report.averageEvaluationScore}`,
  `平均能力/守盘/满意: ${report.averageAbilityScore} / ${report.averageDefenseScore} / ${report.averageSatisfactionScore}`,
  `平均好/坏收尾: ${report.averageEndingGood} / ${report.averageEndingBad}`,
  `核心盘坏收尾率: ${report.coreBadRunRate}%`,
  `被截走触发率: ${report.rivalLossRunRate}%`,
  `影子商圈均值: 竞品 ${report.averageTotalRivalListings} 套，信号 ${report.averageMarketSignals} 条，入场 ${report.averageInboundCount} 次，主事件 ${report.averageDailyEventCount} 次`,
  `波动分差: ${report.scoreSpread}`,
].join('\n');

console.log(headline);
console.log('');
console.log(JSON.stringify(report, null, 2));
