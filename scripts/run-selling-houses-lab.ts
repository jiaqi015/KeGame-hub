import { LocalAdversarialSelfPlayLab } from '../src/selling-houses/application/localAdversarialSelfPlayLab';

const scenarioId = process.argv[2] || 'standard-window-chain';
const seedArgs = process.argv.slice(3).map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
const seeds = seedArgs.length ? seedArgs : [101, 202, 303, 404, 505];

const lab = new LocalAdversarialSelfPlayLab({ scenarioId, seeds });
const report = lab.runBatch();

const headline = [
  `剧本: ${report.scenarioId}`,
  `样本: ${report.runCount} 局`,
  `平均成交: ${report.averageSoldCount}`,
  `平均评估分: ${report.averageEvaluationScore}`,
  `清局率: ${report.selloutRate}%`,
  `波动分差: ${report.scoreSpread}`,
].join('\n');

console.log(headline);
console.log('');
console.log(JSON.stringify(report, null, 2));
