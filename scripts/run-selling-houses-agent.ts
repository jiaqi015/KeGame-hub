import { LocalAdversarialSelfPlayArena, buildSelfPlayRunSnapshot } from '../src/selling-houses/application/localAdversarialSelfPlayArena';

const scenarioId = process.argv[2] || 'standard-window-chain';
const seed = Number(process.argv[3] || '20260417');

const arena = new LocalAdversarialSelfPlayArena({ scenarioId, seed });
const report = arena.playOneGame();
const snapshot = buildSelfPlayRunSnapshot(report.finalResult);

const headline = [
  `剧本: ${report.scenarioName} (${report.scenarioId})`,
  `种子: ${report.seed}`,
  `结果: 总分 ${snapshot.score}，能力/守盘/满意 ${snapshot.abilityScore} / ${snapshot.defenseScore} / ${snapshot.satisfactionScore}`,
  `收尾: 好 ${snapshot.endingGood} / 一般 ${snapshot.endingNeutral} / 坏 ${snapshot.endingBad}，核心盘坏收尾 ${snapshot.coreBadCount}，被截走 ${snapshot.lostToRivalCount}`,
  `评估: ${report.evaluation.verdict} (score=${report.evaluation.score})`,
].join('\n');

console.log(headline);
console.log('');
console.log(JSON.stringify(report, null, 2));
