import { runSelfPlayEvaluation } from './selling-houses-evaluation-runner';

runSelfPlayEvaluation({
  title: '我是王牌资产顾问 · 10000局跨难度自玩评测报告',
  outputPath: '/Users/jiaqi/Documents/开放日测算/output/10000-game-evaluation.json',
  runsPerDifficulty: 1667,
  seedBaseMultiplier: 100000,
  includeStdDev: true,
  percentileMode: 'deciles',
});
