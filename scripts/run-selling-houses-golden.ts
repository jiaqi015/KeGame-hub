import {
  LocalAdversarialSelfPlayArena,
} from '../src/selling-houses/application/localAdversarialSelfPlayArena';
import {
  buildSelfPlayGoldenReport,
  diffSelfPlayGoldenReports,
  loadSelfPlayGoldenReport,
  saveSelfPlayGoldenReport,
  stableStringify,
} from '../src/selling-houses/application/selfPlayGolden';

const mode = process.argv[2] || 'print';
const scenarioId = process.argv[3] || 'standard-window-chain';
const seed = Number(process.argv[4] || '20260417');
const filePath = process.argv[5] || `artifacts/selling-houses-golden/${scenarioId}-${seed}.json`;

const arena = new LocalAdversarialSelfPlayArena({ scenarioId, seed });
const report = buildSelfPlayGoldenReport(arena.playOneGame());

if (mode === 'write') {
  saveSelfPlayGoldenReport(report, filePath);
  console.log(`wrote selling-houses golden report: ${filePath}`);
} else if (mode === 'diff') {
  const expected = loadSelfPlayGoldenReport(filePath);
  const diff = diffSelfPlayGoldenReports(expected, report);
  if (!diff.equal) {
    console.error(`selling-houses golden diff failed: ${filePath}`);
    console.error(diff.differences.join('\n'));
    process.exit(1);
  }
  console.log(`selling-houses golden diff passed: ${filePath}`);
} else {
  console.log(stableStringify(report));
}
