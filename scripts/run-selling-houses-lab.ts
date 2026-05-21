import fs from 'node:fs';
import { LocalAdversarialSelfPlayLab } from '../src/selling-houses/application/localAdversarialSelfPlayLab';
import type { CaseAgentMeshHarnessReport } from '../src/selling-houses/application/agents/caseMeshHarness';

const scenarioId = process.argv[2] || 'standard-window-chain';
const extraArgs = process.argv.slice(3);
const seedArgs = extraArgs
  .filter((entry) => Number.isFinite(Number(entry)))
  .map((entry) => Number(entry));
const seeds = seedArgs.length ? seedArgs : [101, 202, 303, 404, 505];
const referenceMeshArg = extraArgs.find((entry) => entry.startsWith('--reference-mesh='));
const referenceMeshPath = referenceMeshArg ? referenceMeshArg.slice('--reference-mesh='.length) : null;
const referenceMeshReport = referenceMeshPath
  ? JSON.parse(fs.readFileSync(referenceMeshPath, 'utf8')) as CaseAgentMeshHarnessReport
  : null;

const lab = new LocalAdversarialSelfPlayLab({ scenarioId, seeds, referenceMeshReport });
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
  `mesh 证据: trace ${report.averageMeshTurnCount}，ready ${report.averageMeshReadyCount}，review ${report.averageMeshNeedsReviewCount}，blocked ${report.averageMeshBlockedCount}`,
  `mesh 覆盖率: trace ${report.meshTraceRunRate}% ，ready ${report.meshReadyRunRate}% ，对照一致 ${report.meshComparisonMatchRunRate == null ? '无参考' : `${report.meshComparisonMatchRunRate}%`}`,
  `mesh 参考: ${referenceMeshPath || '无'}`,
  `波动分差: ${report.scoreSpread}`,
].join('\n');

console.log(headline);
console.log('');
console.log(JSON.stringify(report, null, 2));
