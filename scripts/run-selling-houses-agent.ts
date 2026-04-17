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
  `影子商圈: 竞品 ${report.shadowStats.totalRivalListings} 套，信号 ${report.shadowStats.marketSignals} 条，入场 ${report.shadowStats.inboundCount} 次，主事件 ${report.shadowStats.dailyEventCount} 次`,
  `评估: ${report.evaluation.verdict} (score=${report.evaluation.score})`,
].join('\n');

console.log(headline);
console.log('');
console.log(JSON.stringify(report, null, 2));
