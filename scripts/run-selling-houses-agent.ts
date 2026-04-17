import { LocalAdversarialSelfPlayArena } from '../src/selling-houses/application/localAdversarialSelfPlayArena';

const scenarioId = process.argv[2] || 'standard-window-chain';
const seed = Number(process.argv[3] || '20260417');

const arena = new LocalAdversarialSelfPlayArena({ scenarioId, seed });
const report = arena.playOneGame();

const headline = [
  `剧本: ${report.scenarioName} (${report.scenarioId})`,
  `种子: ${report.seed}`,
  `结果: 成交 ${report.soldCount} / 撤盘 ${report.withdrawnCount} / 佣金 ${report.commission} / 声誉 ${Math.round(report.reputation)}`,
  `评估: ${report.evaluation.verdict} (score=${report.evaluation.score})`,
].join('\n');

console.log(headline);
console.log('');
console.log(JSON.stringify(report, null, 2));
