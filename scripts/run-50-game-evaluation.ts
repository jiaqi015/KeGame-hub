import { runSelfPlayEvaluation } from './selling-houses-evaluation-runner';

runSelfPlayEvaluation({
  title: '我是王牌资产顾问 · 50局跨难度自玩评测报告',
  outputPath: '/Users/jiaqi/Documents/开放日测算/output/50-game-evaluation.json',
  seedsPerDifficulty: {
    warmup: [101, 202, 303, 404, 505, 606, 707, 808],
    easy: [1101, 1202, 1303, 1404, 1505, 1606, 1707, 1808],
    standard: [2101, 2202, 2303, 2404, 2505, 2606, 2707, 2808],
    advanced: [3101, 3202, 3303, 3404, 3505, 3606, 3707, 3808],
    hard: [4101, 4202, 4303, 4404, 4505, 4606, 4707, 4808],
    extreme: [5101, 5202, 5303, 5404, 5505, 5606, 5707],
  },
  printDesignAdvice: true,
});
