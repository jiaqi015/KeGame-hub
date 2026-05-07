/**
 * ABCD Governance Contract Verification.
 *
 * Validates the current agent governance rules:
 * 1. S is commander (总指挥). A/B/C/D are workers.
 * 2. No E/F agents are authorized.
 * 3. Agent D is a worker handling verification/governance tasks.
 * 4. No Agent E/F reports exist in the workplan.
 * 5. All "No Agent D" checks have been removed from verification scripts.
 * 6. Agent D Reports section exists in the workplan.
 * 7. A/B/C report slots have content.
 * 8. Agent prompts reference S as commander and A/B/C/D as workers.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

let passed = 0;
let failed = 0;

function check(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Workplan governance rules: S=commander, A/B/C/D=workers, E/F blocked
// ---------------------------------------------------------------------------

console.log('=== Check 1: Workplan governance rules ===');

const workplan = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/docs/selling-houses-mother-model-agent-workplan.md',
  'utf-8',
);
const projectRoot = '/Users/jiaqi/Documents/开放日测算';

function readProjectFile(path: string): string {
  return readFileSync(`${projectRoot}/${path}`, 'utf-8');
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

check(
  workplan.includes('S is the commander (总指挥). A, B, C, D are workers'),
  'Workplan declares S as commander, A/B/C/D as workers',
);
check(
  workplan.includes('Do not create Agent E/F or any extra worker threads beyond A/B/C/D'),
  'Workplan prohibits E/F and beyond',
);
check(
  workplan.includes('Agent D is a worker who handles verification/governance tasks'),
  'Workplan defines D as worker (not controller)',
);

// ---------------------------------------------------------------------------
// 2. No Agent E/F reports exist
// ---------------------------------------------------------------------------

console.log('=== Check 2: No E/F reports ===');

check(!/### \d{4}-\d{2}-\d{2}.*Agent E/.test(workplan), 'No Agent E reports');
check(!/### \d{4}-\d{2}-\d{2}.*Agent F/.test(workplan), 'No Agent F reports');

// ---------------------------------------------------------------------------
// 3. Agent D Reports section exists
// ---------------------------------------------------------------------------

console.log('=== Check 3: Agent D Reports section exists ===');

check(workplan.includes('### Agent D Reports'), 'Agent D Reports section exists');
check(
  !workplan.includes('### Retired Agent D Reports'),
  'No "Retired Agent D Reports" section (D is active)',
);

// ---------------------------------------------------------------------------
// 4. A/B/C report slots have content
// ---------------------------------------------------------------------------

console.log('=== Check 4: A/B/C report slots have content ===');

check(/### \d{4}-\d{2}-\d{2}.*Agent A/.test(workplan), 'Agent A has reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent B/.test(workplan), 'Agent B has reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent C/.test(workplan), 'Agent C has reports');

// ---------------------------------------------------------------------------
// 5. Agent prompts reference S as commander and A/B/C/D as workers
// ---------------------------------------------------------------------------

console.log('=== Check 5: Agent prompts use S=commander, A/B/C/D=workers ===');

check(
  workplan.includes('S is commander (总指挥). A/B/C/D are workers. Do not create Agent E/F or beyond.'),
  'Agent A prompt references S=commander, A/B/C/D=workers',
);
// Agent B and C prompts should also use the new language
const agentBPromptSection = workplan.substring(
  workplan.indexOf('### Agent B - Current Prompt'),
  workplan.indexOf('### Agent C - Current Prompt'),
);
check(
  agentBPromptSection.includes('S is commander (总指挥). A/B/C/D are workers'),
  'Agent B prompt references S=commander, A/B/C/D=workers',
);

const agentCPromptSection = workplan.substring(
  workplan.indexOf('### Agent C - Current Prompt'),
  workplan.indexOf('## Agent Reports'),
);
check(
  agentCPromptSection.includes('S is commander (总指挥). A/B/C/D are workers'),
  'Agent C prompt references S=commander, A/B/C/D=workers',
);

// ---------------------------------------------------------------------------
// 6. Verification scripts do NOT check "No Agent D"
// ---------------------------------------------------------------------------

console.log('=== Check 6: No "No Agent D" checks in scripts ===');

const scriptsDir = '/Users/jiaqi/Documents/开放日测算/scripts/';
const scriptFiles = readdirSync(scriptsDir)
  .filter(f => f.startsWith('verify-selling-houses-') && f.endsWith('.ts'))
  .map(f => f);

let scriptsWithNoAgentDCheck: string[] = [];

for (const file of scriptFiles) {
  const src = readFileSync(`${scriptsDir}${file}`, 'utf-8');
  // Match "No Agent D" in check() calls or comments that enforce the old rule
  if (/check\(!.*Agent D.*'No Agent D/.test(src)) {
    scriptsWithNoAgentDCheck.push(file);
  }
}

check(
  scriptsWithNoAgentDCheck.length === 0,
  `No scripts enforce "No Agent D" rule (found ${scriptsWithNoAgentDCheck.length}: ${scriptsWithNoAgentDCheck.join(', ')})`,
);

// ---------------------------------------------------------------------------
// 7. Scripts still enforce "No Agent E/F"
// ---------------------------------------------------------------------------

console.log('=== Check 7: Scripts still enforce No Agent E/F ===');

let scriptsWithAgentECheck = 0;
let scriptsWithAgentFCheck = 0;

for (const file of scriptFiles) {
  const src = readFileSync(`${scriptsDir}${file}`, 'utf-8');
  if (/check\(!.*Agent E.*'No Agent E/.test(src)) {
    scriptsWithAgentECheck++;
  }
  if (/check\(!.*Agent F.*'No Agent F/.test(src)) {
    scriptsWithAgentFCheck++;
  }
}

check(scriptsWithAgentECheck > 0, `${scriptsWithAgentECheck} scripts enforce "No Agent E" rule`);
check(scriptsWithAgentFCheck > 0, `${scriptsWithAgentFCheck} scripts enforce "No Agent F" rule`);
check(
  scriptsWithAgentECheck === scriptsWithAgentFCheck,
  'Agent E and F checks are consistent',
);

// ---------------------------------------------------------------------------
// 8. Controller check template still exists
// ---------------------------------------------------------------------------

console.log('=== Check 8: Controller check template ===');

check(workplan.includes('## Controller Check Template'), 'Controller check template exists');

// ---------------------------------------------------------------------------
// 9. Semantic scene precision cannot regress to aggregate-count inference
// ---------------------------------------------------------------------------

console.log('=== Check 9: Semantic scene precision ===');

const semanticReceiptModels = readProjectFile('src/selling-houses/core/world-state/semantic-receipt/models.ts');
const dailySemanticReceipt = readProjectFile('src/selling-houses/runtime/simulation/dailySemanticReceipt.ts');
const semanticReceiptEnrichment = readProjectFile('src/selling-houses/runtime/simulation/semanticReceiptEnrichment.ts');
const semanticWorkspaceComposer = readProjectFile('src/selling-houses/interface/interaction-workspace/semanticWorkspaceComposer.ts');

check(
  semanticReceiptModels.includes('hasServiceInteractionFlags'),
  'InteractionSceneReceiptSummary exposes per-scene serviceInteraction flags',
);
check(
  !semanticWorkspaceComposer.includes('i < isSummary.hasServiceInteractionCount'),
  'Workspace composer does not infer per-scene service interaction from aggregate count',
);
check(
  semanticWorkspaceComposer.includes('hasServiceInteractionFlags[i]'),
  'Workspace composer reads per-scene serviceInteraction flags',
);
check(
  dailySemanticReceipt.includes("caseIds.push(scene.caseId ?? '')"),
  'Daily semantic receipt keeps caseIds index-aligned with sceneIds',
);
check(
  semanticReceiptEnrichment.includes("caseIds.push(scene.caseId ?? '')"),
  'Semantic receipt enrichment keeps caseIds index-aligned with sceneIds',
);

// ---------------------------------------------------------------------------
// 10. Narrative pack hash uses canonical helper everywhere at runtime boundaries
// ---------------------------------------------------------------------------

console.log('=== Check 10: Canonical narrative pack hash ===');

const narrativeRuntimeAdapter = readProjectFile('src/selling-houses/runtime/narrative-support/narrativeSignalPackAdapter.ts');
const llmInputAdapter = readProjectFile('src/selling-houses/runtime/llm-support/llmInputPackAdapter.ts');

for (const [label, src] of [
  ['dailySemanticReceipt', dailySemanticReceipt],
  ['semanticReceiptEnrichment', semanticReceiptEnrichment],
  ['narrativeSignalPackAdapter', narrativeRuntimeAdapter],
  ['llmInputPackAdapter', llmInputAdapter],
] as const) {
  check(
    src.includes('buildNarrativeSignalPackContentHash'),
    `${label} uses canonical NarrativeSignalPack content hash helper`,
  );
  check(
    !src.includes('packHash: pack.packId'),
    `${label} does not use packId as packHash`,
  );
}
check(
  !dailySemanticReceipt.includes('function stableHash'),
  'dailySemanticReceipt has no local weak stableHash',
);
check(
  !semanticReceiptEnrichment.includes('function stableHash'),
  'semanticReceiptEnrichment has no local weak stableHash',
);

// ---------------------------------------------------------------------------
// 11. Scene-only enrichment preserves existing narrative receipt
// ---------------------------------------------------------------------------

console.log('=== Check 11: Semantic enrichment preserves existing narrative pack ===');

check(
  semanticReceiptEnrichment.includes('baseSemantic.narrativeSignalPack'),
  'semanticReceiptEnrichment can preserve base narrativeSignalPack',
);
check(
  /narrativeSignalPack\s*\?\s*buildNarrativeSignalPackSummary\(\s*narrativeSignalPack,\s*day\s*\)\s*:\s*baseSemantic\.narrativeSignalPack/s.test(semanticReceiptEnrichment),
  'scene-only enrichment does not replace existing narrativeSignalPack with empty summary',
);

// ---------------------------------------------------------------------------
// 12. Pressure receipts are deeply frozen
// ---------------------------------------------------------------------------

console.log('=== Check 12: Pressure receipt deep freeze ===');

const pressureBuffer = readProjectFile('src/selling-houses/core/world-state/competition/pressureBuffer.ts');

check(
  /signals:\s*Object\.freeze\(\s*snap\.signals\.map\(\(sig\)\s*=>\s*Object\.freeze/s.test(pressureBuffer),
  'Pressure snapshots deep-freeze signal objects',
);
check(
  /evidence:\s*Object\.freeze\(\s*snap\.evidence\.map\(\(ev\)\s*=>\s*Object\.freeze/s.test(pressureBuffer),
  'Pressure snapshots deep-freeze evidence objects',
);
check(
  pressureBuffer.includes('sourceEvidenceIds: Object.freeze([...delta.sourceEvidenceIds])'),
  'DecisionPressureDelta sourceEvidenceIds array is frozen',
);
check(
  pressureBuffer.includes('topEvidence: Object.freeze') && pressureBuffer.includes('pressuredCaseIds: Object.freeze'),
  'CompetitionPOV arrays are frozen',
);

// ---------------------------------------------------------------------------
// 13. D4 coverage source taxonomy matches current live pressure hooks
// ---------------------------------------------------------------------------

console.log('=== Check 13: D4 source taxonomy ===');

const evaluationAdapters = readProjectFile('src/selling-houses/core/evaluation/legacyAdapters.ts');

for (const source of [
  'customer-feedback',
  'rival-customer-pull',
  'rival-listing',
  'competition-group',
  'company-pressure',
  'random-event',
  'scripted-event',
]) {
  check(
    evaluationAdapters.includes(`'${source}'`),
    `D4 wired sources include ${source}`,
  );
}
check(
  /const D4_PENDING_SOURCES: readonly string\[] = \[];/.test(evaluationAdapters),
  'D4 pending sources are empty after all live pressure hooks are wired',
);
check(
  evaluationAdapters.includes("'market-signal'"),
  'market-signal remains informational, not a pressure hook',
);

// ---------------------------------------------------------------------------
// 14. Fact/evaluation/process/LLM boundaries stay guarded
// ---------------------------------------------------------------------------

console.log('=== Check 14: Boundary guardrails ===');

const semanticReceiptInputComposer = readProjectFile('src/selling-houses/runtime/simulation/semanticReceiptInputComposer.ts');
const competitionReceiptBuilder = readProjectFile('src/selling-houses/core/world-state/competition/receiptBuilder.ts');

check(
  !semanticReceiptInputComposer.includes("sourceType: 'consensus_receipt'"),
  'semanticReceiptInputComposer does not label evaluation refs as consensus_receipt',
);
check(
  semanticReceiptInputComposer.includes("sourceType: 'evaluation_snapshot'"),
  'semanticReceiptInputComposer labels evaluation refs as evaluation_snapshot',
);
check(
  !/sourceEvidenceIds.*signal:/.test(competitionReceiptBuilder),
  'DecisionPressureDelta sourceEvidenceIds do not reference signal ids',
);
check(
  competitionReceiptBuilder.includes('const evidenceId = `evidence:'),
  'DecisionPressureDelta sourceEvidenceIds reference evidence ids',
);

const llmBoundaryFiles = [
  'src/selling-houses/core/llm-boundary/models.ts',
  'src/selling-houses/core/llm-boundary/validator.ts',
  'src/selling-houses/runtime/llm-support/llmInputPackAdapter.ts',
  'src/selling-houses/runtime/llm-support/llmReplaySupport.ts',
  'src/selling-houses/runtime/narrative-support/narrativeSignalPackAdapter.ts',
];
for (const file of llmBoundaryFiles) {
  const uncommented = stripComments(readProjectFile(file));
  check(
    !/Date\.now|Math\.random|fetch\s*\(|OpenAI|apiKey/i.test(uncommented),
    `${file} has no hidden time/random/network/provider dependency in executable code`,
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n=== Summary ===');
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
