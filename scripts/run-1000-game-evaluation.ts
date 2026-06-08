import { runSelfPlayEvaluation } from './selling-houses-evaluation-runner';

runSelfPlayEvaluation({
  title: '我是王牌资产顾问 · 1000局跨难度自玩评测报告',
  outputPath: '/Users/jiaqi/Documents/开放日测算/output/1000-game-evaluation.json',
  runsPerDifficulty: 167,
  seedBaseMultiplier: 10000,
  includeStdDev: true,
  percentileMode: 'quartiles',
});
