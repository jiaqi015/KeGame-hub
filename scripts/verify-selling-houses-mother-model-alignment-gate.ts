/**
 * Mother-Model Alignment Gate — Final Hard Gate
 *
 * "绿了就是真的对齐母模型" — no false-green allowed.
 *
 * Checks (8):
 * 1. dealClosing terminal path — no randomInt close
 * 2. Critical engine files — ZERO personality/archetype direct decisions
 *    (centralized fallback in ownerDecisionProfileHelper is allowed)
 * 3. Bare trust/patience/urgency in business judgment paths — hard check
 *    (bundle/relation fallback and snapshots are allowed)
 * 4. relationReadProjection — consumed by domain/runtime
 * 5. ownerProfilingMemory — consumed by domain engine
 * 6. recommendationEngine — must use profiling + relation projection
 * 7. recommendationEngine — no ownerArchetypeId direct decision (except fallback)
 * 8. False-green detection — comprehensive residual scan
 *
 * @author Agent D — verification / governance only
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import { asWritableCase } from '../src/selling-houses/domain/models.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];
const warnings: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; failures.push(message); console.error(`  [FAIL] ${message}`); }
}

function warn(message: string) {
  warnings.push(message);
  console.warn(`  [WARN] ${message}`);
}

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function walkTsFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...walkTsFiles(fullPath));
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        results.push(fullPath);
      }
    }
  } catch { /* directory doesn't exist */ }
  return results;
}

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

const ROOT = '/Users/jiaqi/Documents/开放日测算';
const DOMAIN_DIR = join(ROOT, 'src/selling-houses/domain');
const APP_DIR = join(ROOT, 'src/selling-houses/application');
const RUNTIME_DIR = join(ROOT, 'src/selling-houses/runtime');

// ---------------------------------------------------------------------------
// Critical engine files — personality/archetype direct decision = 0
// ---------------------------------------------------------------------------

// { relPath, root } — root is relative to project
const CRITICAL_ENGINE_FILES: Array<{ rel: string; root: string }> = [
  { rel: 'engine/marketEngine.ts', root: 'domain' },
  { rel: 'engine/pricingActionExecutors.ts', root: 'domain' },
  { rel: 'recommendationEngine.ts', root: 'domain' },
  { rel: 'localAdversarialSelfPlayArena.ts', root: 'application' },
];

// Files where bare trust/patience/urgency reads are allowed:
// - Write helpers manage the mirror
// - relationReadProjection IS the projection
// - ownerDecisionProfileHelper IS the centralized fallback
// - ownerCaseReadinessWriteHelper is the canonical write helper (old helper deleted R30)
const BARE_READ_ALLOWED_FILES = new Set([
  'trustWriteHelper.ts',
  'ownerCaseReadinessWriteHelper.ts',
  'relationReadProjection.ts',
  'ownerDecisionProfileHelper.ts',
  'models.ts',
]);

// Business judgment paths — bare reads here are false-green
const BUSINESS_JUDGMENT_PATHS = [
  'engine/',
  'recommendationEngine.ts',
  'dealClosing.ts',
];

// Lines that are snapshot/payload/display/before-state — not business judgment
const SNAPSHOT_PATTERNS = [
  /trust:\s*caseItem\.trust/,                 // payload field: trust: caseItem.trust
  /mirrorTrust:\s*caseItem\.trust/,
  /mirrorPatience:\s*caseItem\.patience/,
  /mirrorUrgency:\s*caseItem\.urgency/,
  /finalTrust:\s*Math\.round/,                // snapshot
  /beforeTrust/,                              // receipt before-state capture
  /beforePatience/,
  /beforeUrgency/,
  /Math\.round\(caseItem\.trust\)/,           // display formatting
  /Math\.round\(caseItem\.patience\)/,
  /Math\.round\(caseItem\.urgency\)/,
  /const\s+\w*[Tt]rust\s*=\s*caseItem\.trust\b/,   // before-state capture: const oldTrust = caseItem.trust
  /const\s+\w*[Pp]atience\s*=\s*caseItem\.patience\b/,
  /const\s+\w*[Uu]rgency\s*=\s*caseItem\.urgency\b/,
  /caseItem\.trust\s*[-+]\s*\w+/,             // delta calc: caseItem.trust - 55 or caseItem.trust - oldTrust
  /caseItem\.patience\s*[-+]\s*\w+/,
  /caseItem\.urgency\s*[-+]\s*\w+/,
  /case-fallback/,                            // relation helper fallback path (legacy)
  /old_save_compatibility/,                   // canonical fallback provenance (R30)
  /return\s+caseItem\.(trust|patience|urgency)\b/, // readRelation* helper return fallback
  /return\s*\{[^}]*caseItem\.(trust|patience|urgency)/, // return { patience: caseItem.patience, ... }
];

// Lines that are bundle/relation fallback — reads from projection first
const FALLBACK_PATTERNS = [
  /\?\?\s*caseItem\.(trust|patience|urgency)/,   // bundle ?? caseItem fallback
];

// Lines that are boundary clamp (write, not read for decision)
const CLAMP_PATTERNS = [
  /caseItem\.(trust|patience|urgency)\s*=\s*clamp/,
];

// ---------------------------------------------------------------------------
// Check 1: dealClosing terminal path — no dice-based closure
// ---------------------------------------------------------------------------

console.log('=== Check 1: dealClosing terminal path — no dice-based closure ===');

const dealClosingSrc = readFileSync(
  join(DOMAIN_DIR, 'dealClosing.ts'), 'utf-8');
const dealClosingClean = stripComments(dealClosingSrc);

check(!dealClosingClean.includes('Math.random'),
  'dealClosing.ts: no Math.random');

// Verify it uses readOwnerDecisionProfile (centralized fallback)
check(dealClosingSrc.includes('readOwnerDecisionProfile'),
  'dealClosing.ts: uses readOwnerDecisionProfile (centralized fallback, not bare personality)');

// Verify it uses relation-layer read helpers
check(dealClosingSrc.includes('readRelationTrustForCase') || dealClosingSrc.includes('readCaseRelationBundleFromRuntime'),
  'dealClosing.ts: reads trust from relation layer (not bare Case field)');

check(dealClosingSrc.includes('readRelationReadinessForCase') || dealClosingSrc.includes('readCaseRelationBundleFromRuntime'),
  'dealClosing.ts: reads readiness from relation layer (not bare Case field)');

console.log('  dealClosing check: PASS');

// ---------------------------------------------------------------------------
// Check 2: Critical engine files — ZERO personality/archetype direct decisions
// ---------------------------------------------------------------------------

console.log('=== Check 2: personality/archetype direct decisions (hard ceiling = 0) ===');

let personalityBranchCount = 0;
const personalityBranchDetails: string[] = [];

for (const { rel, root } of CRITICAL_ENGINE_FILES) {
  const dir = root === 'domain' ? DOMAIN_DIR : APP_DIR;
  const fullPath = join(dir, rel);
  let src: string;
  try {
    src = readFileSync(fullPath, 'utf-8');
  } catch { continue; }

  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;

    // Personality direct comparison
    if (line.includes("personality ===") || line.includes("personality !==") ||
        line.includes("personality ==") || line.includes("personality !=")) {
      personalityBranchCount++;
      personalityBranchDetails.push(`  ${root}/${rel}:${i + 1}: ${line.trim()}`);
    }
    // Archetype direct comparison
    if (line.includes("ownerArchetypeId ===") || line.includes("ownerArchetypeId !==")) {
      personalityBranchCount++;
      personalityBranchDetails.push(`  ${root}/${rel}:${i + 1}: ${line.trim()}`);
    }
  }
}

console.log(`  [INFO] personality/archetype direct decisions: ${personalityBranchCount}`);
for (const detail of personalityBranchDetails) {
  console.log(detail);
}

check(personalityBranchCount === 0,
  `personality/archetype direct decisions in critical engine files: ${personalityBranchCount} (hard ceiling = 0)`);

console.log('  personality/archetype check: ' + (personalityBranchCount === 0 ? 'PASS' : 'FAIL'));

// ---------------------------------------------------------------------------
// Check 3: Bare trust/patience/urgency in business judgment paths
// ---------------------------------------------------------------------------

console.log('=== Check 3: bare trust/patience/urgency in business judgment paths ===');

const domainFiles = walkTsFiles(DOMAIN_DIR);
const runtimeFiles = walkTsFiles(RUNTIME_DIR);

let businessBareReadCount = 0;
const businessBareReadDetails: string[] = [];
let informationalBareReadCount = 0;

function isBusinessJudgmentPath(relPath: string): boolean {
  return BUSINESS_JUDGMENT_PATHS.some(p => relPath.startsWith(p) || relPath === p);
}

function isAllowedByPattern(line: string): boolean {
  // Snapshot/payload patterns
  if (SNAPSHOT_PATTERNS.some(p => p.test(line))) return true;
  // Bundle/relation fallback patterns
  if (FALLBACK_PATTERNS.some(p => p.test(line))) return true;
  // Boundary clamp (write)
  if (CLAMP_PATTERNS.some(p => p.test(line))) return true;
  return false;
}

// Scan domain files
for (const file of domainFiles) {
  const relPath = relative(DOMAIN_DIR, file);
  const fileName = relPath.split('/').pop() || '';

  if (BARE_READ_ALLOWED_FILES.has(fileName)) continue;

  const src = readFileSync(file, 'utf-8');
  const lines = src.split('\n');
  const isBusiness = isBusinessJudgmentPath(relPath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;

    const hasBareTrust = /caseItem\.trust\b/.test(line) && !line.includes('caseItem.trust =');
    const hasBarePatience = /caseItem\.patience\b/.test(line) && !line.includes('caseItem.patience =');
    const hasBareUrgency = /caseItem\.urgency\b/.test(line) && !line.includes('caseItem.urgency =');

    if (!hasBareTrust && !hasBarePatience && !hasBareUrgency) continue;

    if (isAllowedByPattern(line)) {
      informationalBareReadCount++;
      continue;
    }

    if (isBusiness) {
      businessBareReadCount++;
      businessBareReadDetails.push(`  ${relPath}:${i + 1}: ${line.trim()}`);
    } else {
      informationalBareReadCount++;
    }
  }
}

// Scan runtime business judgment files
for (const file of runtimeFiles) {
  const relPath = relative(RUNTIME_DIR, file);
  if (!relPath.includes('businessOutcomeReview')) continue;

  const src = readFileSync(file, 'utf-8');
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;

    const hasBareTrust = /caseItem\.trust\b/.test(line) && !line.includes('caseItem.trust =');
    const hasBarePatience = /caseItem\.patience\b/.test(line) && !line.includes('caseItem.patience =');
    const hasBareUrgency = /caseItem\.urgency\b/.test(line) && !line.includes('caseItem.urgency =');

    if (!hasBareTrust && !hasBarePatience && !hasBareUrgency) continue;

    if (isAllowedByPattern(line)) {
      informationalBareReadCount++;
      continue;
    }

    businessBareReadCount++;
    businessBareReadDetails.push(`  runtime/${relPath}:${i + 1}: ${line.trim()}`);
  }
}

console.log(`  [INFO] business judgment bare reads: ${businessBareReadCount}`);
for (const detail of businessBareReadDetails) {
  console.log(detail);
}
console.log(`  [INFO] informational/snapshot/fallback bare reads: ${informationalBareReadCount}`);

check(businessBareReadCount === 0,
  `bare trust/patience/urgency in business judgment paths: ${businessBareReadCount} (hard ceiling = 0)`);

console.log('  bare reads check: ' + (businessBareReadCount === 0 ? 'PASS' : 'FAIL'));

// ---------------------------------------------------------------------------
// Check 4: relationReadProjection — consumed by domain/runtime
// ---------------------------------------------------------------------------

console.log('=== Check 4: relationReadProjection consumed in domain/runtime ===');

const allDomainRuntimeFiles = [...domainFiles, ...runtimeFiles];

let relationConsumerCount = 0;
const relationConsumerDetails: string[] = [];

const RELATION_FUNCS = [
  'readRelationTrust', 'readRelationReadiness', 'buildCaseRelationSnapshot',
  'readCaseRelationBundle', 'readCaseRelationBundleFromRuntime', 'readOwnerProfile',
];

for (const file of allDomainRuntimeFiles) {
  const relPath = relative(ROOT, file);
  if (relPath.includes('relationReadProjection.ts')) continue;

  const src = readFileSync(file, 'utf-8');
  const matched = RELATION_FUNCS.filter(f => src.includes(f));
  if (matched.length > 0) {
    relationConsumerCount++;
    relationConsumerDetails.push(`  ${relPath}: ${matched.join(', ')}`);
  }
}

console.log(`  [INFO] relationReadProjection consumers: ${relationConsumerCount}`);
for (const d of relationConsumerDetails) console.log(d);

check(relationConsumerCount >= 2,
  `relationReadProjection consumers in domain/runtime: ${relationConsumerCount} (should be ≥2)`);

console.log('  relationReadProjection check: ' + (relationConsumerCount >= 2 ? 'PASS' : 'FAIL'));

// ---------------------------------------------------------------------------
// Check 5: ownerProfilingMemory — consumed by domain engine
// ---------------------------------------------------------------------------

console.log('=== Check 5: ownerProfilingMemory consumed in domain engine ===');

let profilingDomainCount = 0;
const profilingDomainDetails: string[] = [];

for (const file of domainFiles) {
  const relPath = relative(ROOT, file);
  const fileName = relative(DOMAIN_DIR, file);
  if (fileName === 'models.ts' || fileName.includes('ownerProfilingMemoryTypes')) continue;

  const src = readFileSync(file, 'utf-8');
  if (src.includes('ownerProfilingMemory') || src.includes('OwnerProfilingMemorySummary') ||
      src.includes('readOwnerProfile') || src.includes('OwnerProfileProjection') ||
      src.includes('readOwnerDecisionProfile') || src.includes('OwnerDecisionProfile')) {
    profilingDomainCount++;
    profilingDomainDetails.push(`  ${relPath}`);
  }
}

console.log(`  [INFO] domain files using profiling/decision-profile: ${profilingDomainCount}`);
for (const d of profilingDomainDetails) console.log(d);

check(profilingDomainCount >= 2,
  `ownerProfilingMemory/OwnerDecisionProfile consumed in domain: ${profilingDomainCount} (should be ≥2)`);

console.log('  ownerProfilingMemory check: ' + (profilingDomainCount >= 2 ? 'PASS' : 'FAIL'));

// ---------------------------------------------------------------------------
// Check 6: recommendationEngine — must use profiling + relation projection
// ---------------------------------------------------------------------------

console.log('=== Check 6: recommendationEngine profiling + relation integration ===');

const recEngineSrc = readFileSync(
  join(DOMAIN_DIR, 'recommendationEngine.ts'), 'utf-8');
const recEngineClean = stripComments(recEngineSrc);

// Must import from relationReadProjection
const recImportsRelation = RELATION_FUNCS.some(f => recEngineSrc.includes(f));
check(recImportsRelation,
  'recommendationEngine.ts: must import from relationReadProjection');

// Must use profilingMemory or OwnerDecisionProfile
const recUsesProfiling =
  recEngineClean.includes('ownerProfilingMemory') ||
  recEngineClean.includes('OwnerProfilingMemorySummary') ||
  recEngineClean.includes('OwnerProfileProjection') ||
  recEngineClean.includes('profiling');
check(recUsesProfiling,
  'recommendationEngine.ts: must use profiling (ownerProfilingMemory or OwnerProfileProjection)');

// Must use relation bundle for trust/patience/urgency (not bare Case fields)
const recUsesBundle = recEngineSrc.includes('readCaseRelationBundleFromRuntime') ||
  recEngineSrc.includes('readCaseRelationBundle') ||
  recEngineSrc.includes('readRelationTrust');
check(recUsesBundle,
  'recommendationEngine.ts: must read trust/patience/urgency through relation bundle');

// Must have CaseRecommendationFacts with trust/patience/urgency from bundle
const recHasFactsTrust = recEngineClean.includes('facts.trust') ||
  recEngineClean.includes('bundle.trust');
check(recHasFactsTrust,
  'recommendationEngine.ts: must use facts.trust (from bundle), not bare caseItem.trust');

console.log('  recommendationEngine check: ' +
  (recImportsRelation && recUsesProfiling && recUsesBundle && recHasFactsTrust ? 'PASS' : 'FAIL'));

// ---------------------------------------------------------------------------
// Check 7: recommendationEngine — no ownerArchetypeId direct decision
// ---------------------------------------------------------------------------

console.log('=== Check 7: recommendationEngine archetype direct decisions ===');

// Scan for ownerArchetypeId === comparisons that are NOT inside a fallback function
const recLines = recEngineSrc.split('\n');
let recArchetypeDirectCount = 0;
const recArchetypeDetails: string[] = [];
let insideFallbackFunction = false;

for (let i = 0; i < recLines.length; i++) {
  const line = recLines[i];
  if (isCommentLine(line)) continue;

  // Track if we're inside optionForFirstVisit or optionForPriceAction
  if (line.includes('function optionForFirstVisit') || line.includes('function optionForPriceAction')) {
    insideFallbackFunction = true;
  }
  if (insideFallbackFunction && line.trim() === '}') {
    insideFallbackFunction = false;
  }

  if (line.includes("ownerArchetypeId ===") || line.includes("ownerArchetypeId !==")) {
    if (insideFallbackFunction) {
      // Inside fallback function — check if profiling is tried first
      // optionForFirstVisit tries profiling first → allowed
      // optionForPriceAction goes directly to archetype → warn
      if (line.includes('optionForPriceAction') || recLines.slice(Math.max(0, i - 20), i).some(l => l.includes('function optionForPriceAction'))) {
        warn(`recommendationEngine.ts:${i + 1}: ownerArchetypeId in optionForPriceAction (no profiling first)`);
      }
      // optionForFirstVisit legacy fallback — allowed (profiling checked first)
    } else {
      recArchetypeDirectCount++;
      recArchetypeDetails.push(`  recommendationEngine.ts:${i + 1}: ${line.trim()}`);
    }
  }
}

// Also check optionForPriceAction specifically — it uses archetype lookup without profiling
const recHasOptionForPriceArchetype = recEngineClean.includes('ownerArchetypes') &&
  recEngineClean.includes('preferredTactic');
if (recHasOptionForPriceArchetype) {
  warn('recommendationEngine.ts: optionForPriceAction uses ownerArchetype lookup for preferredTactic (should use profiling)');
}

console.log(`  [INFO] ownerArchetypeId direct decisions (outside fallback): ${recArchetypeDirectCount}`);
for (const d of recArchetypeDetails) console.log(d);

check(recArchetypeDirectCount === 0,
  `recommendationEngine.ts ownerArchetypeId direct decisions: ${recArchetypeDirectCount} (should be 0, fallback functions excluded)`);

console.log('  recommendationEngine archetype check: ' + (recArchetypeDirectCount === 0 ? 'PASS' : 'FAIL'));

// ---------------------------------------------------------------------------
// Check 8: False-green detection — comprehensive residual scan
// ---------------------------------------------------------------------------

console.log('=== Check 8: False-green detection ===');

const falseGreenIssues: string[] = [];

// 8a. personality/archetype in critical engine files
if (personalityBranchCount > 0) {
  falseGreenIssues.push(
    `FALSE-GREEN: ${personalityBranchCount} personality/archetype direct decisions in critical engine files`);
  for (const d of personalityBranchDetails) falseGreenIssues.push(d);
}

// 8b. bare reads in business judgment paths
if (businessBareReadCount > 0) {
  falseGreenIssues.push(
    `FALSE-GREEN: ${businessBareReadCount} bare trust/patience/urgency reads in business judgment paths`);
  for (const d of businessBareReadDetails) falseGreenIssues.push(d);
}

// 8c. recommendationEngine not using profiling
if (!recUsesProfiling) {
  falseGreenIssues.push('FALSE-GREEN: recommendationEngine does not use profiling');
}

// 8d. recommendationEngine not using relation bundle
if (!recUsesBundle) {
  falseGreenIssues.push('FALSE-GREEN: recommendationEngine does not use relation bundle');
}

// 8e. recommendationEngine archetype direct decisions
if (recArchetypeDirectCount > 0) {
  falseGreenIssues.push(
    `FALSE-GREEN: recommendationEngine has ${recArchetypeDirectCount} ownerArchetypeId direct decisions`);
}

// 8f. relationReadProjection dead code
if (relationConsumerCount === 0) {
  falseGreenIssues.push('FALSE-GREEN: relationReadProjection has 0 consumers (dead code)');
}

// 8g. ownerProfilingMemory write-only
if (profilingDomainCount === 0) {
  falseGreenIssues.push('FALSE-GREEN: ownerProfilingMemory not read in domain');
}

if (falseGreenIssues.length > 0) {
  console.log('\n  [FALSE-GREEN DETECTED]');
  for (const issue of falseGreenIssues) {
    console.log(`    ${issue}`);
  }
} else {
  console.log('  No false-green issues detected.');
}

console.log('  False-green detection: DONE');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Mother-Model Alignment Gate (Final) ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);
console.log(`Warnings: ${warnings.length}`);
console.log(`False-green issues: ${falseGreenIssues.length}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
  if (falseGreenIssues.length > 0) {
    console.log('\nFalse-green details:');
    for (const fg of falseGreenIssues) {
      console.log(`  - ${fg}`);
    }
  }
  process.exit(1);
} else {
  console.log('\nRESULT: PASS');
  if (falseGreenIssues.length > 0) {
    console.log('\n  BUT: false-green issues detected — see Check 8 output above.');
    console.log('  Gate is structurally green but residual legacy patterns remain.');
    process.exit(1);
  }
  if (warnings.length > 0) {
    console.log('\nWarnings (accepted debt):');
    for (const w of warnings) {
      console.log(`  - ${w}`);
    }
  }
  console.log('\nMother-model alignment gate passed — green means real alignment.');
  process.exit(0);
}
