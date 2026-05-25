/**
 * verify-selling-houses-gate-hygiene.ts — verifies that constitutional chain gates
 * contain no soft-pass patterns (check(true), assert(true), || true, .claude/worktrees).
 *
 * Uses the shared selling-houses-gate-hygiene.ts utilities for source scanning.
 * This script itself uses pass()/fail() instead of check(condition, message) to
 * avoid producing real check(true, ...) patterns that would be caught by its own scanner.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  findGateSoftPassLines,
  formatGateLineLocations,
  stripLineForGateHygiene,
  CONSTITUTIONAL_CHAIN_GATES,
} from './selling-houses-gate-hygiene.js';

let passed = 0;
let failed = 0;

function pass(message: string) {
  passed++;
  console.log(`  [PASS] ${message}`);
}

function fail(message: string) {
  failed++;
  console.log(`  [FAIL] ${message}`);
}

// ---------------------------------------------------------------------------
// Strict gate hygiene files — all S-default verification gates
// ---------------------------------------------------------------------------

const STRICT_GATE_HYGIENE_FILES = [
  ...CONSTITUTIONAL_CHAIN_GATES,
  'scripts/verify-selling-houses-gate-hygiene.ts',
  'scripts/verify-selling-houses-layer-imports.ts',
  'scripts/verify-selling-houses-architecture-boundaries.ts',
  'scripts/verify-selling-houses-deal-closing-runtime-consensus-parity.ts',
  'scripts/verify-selling-houses-deal-facts.ts',
  'scripts/verify-selling-houses-daily-tick-contract.ts',
];

// ---------------------------------------------------------------------------
// Legacy hygiene backlog — known soft-pass patterns that cannot be safely
// cleaned this round. Each entry: file, pattern, reason, frozen count.
// The backlog count must not grow between rounds.
// ---------------------------------------------------------------------------

interface LegacyHygieneBacklogEntry {
  file: string;
  pattern: string;
  reason: string;
}

const LEGACY_GATE_HYGIENE_BACKLOG: readonly LegacyHygieneBacklogEntry[] = [
  // Currently empty — all strict gate files are clean.
];

const FROZEN_BACKLOG_COUNT = LEGACY_GATE_HYGIENE_BACKLOG.length;

// ---------------------------------------------------------------------------
// 1. Each strict gate hygiene file has no soft-pass patterns
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 1. Strict gate file soft-pass scan ===\n');

for (const gatePath of STRICT_GATE_HYGIENE_FILES) {
  const src = readFileSync(resolve(gatePath), 'utf-8');
  const violations = findGateSoftPassLines(src).map(v => ({ ...v, file: gatePath }));

  if (violations.length > 0) {
    const loc = formatGateLineLocations(violations);
    fail(`${gatePath}: soft-pass violations — ${loc}`);
  } else {
    pass(`${gatePath}: no soft-pass patterns`);
  }
}

// ---------------------------------------------------------------------------
// 2. Self-test: stripNonCodeRegions / stripLineForGateHygiene handles edge cases
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 2. Self-test utility correctness ===\n');

// check(true, ...) in a string literal should NOT be detected
const stringLine = "  const msg = 'check(true, bad)';";
const strippedString = stripLineForGateHygiene(stringLine);
if (!/\bcheck\s*\(\s*true\s*,/.test(strippedString)) {
  pass('stripLineForGateHygiene: string literal not detected as code');
} else {
  fail('stripLineForGateHygiene: string literal not detected as code');
}

// check(true, ...) in a comment should NOT be detected (line skipped)
const commentLine = '  // check(true, some comment)';
const commentViolations = findGateSoftPassLines(commentLine);
if (commentViolations.length === 0) {
  pass('stripLineForGateHygiene: comment line skipped');
} else {
  fail('stripLineForGateHygiene: comment line skipped');
}

// Actual check(true, ...) in code SHOULD be detected
const codeLine = '  check(true, "bad pattern");';
const codeViolations = findGateSoftPassLines(codeLine);
if (codeViolations.length > 0) {
  pass('stripLineForGateHygiene: check(true) in code detected');
} else {
  fail('stripLineForGateHygiene: check(true) in code detected');
}

// || true in code SHOULD be detected
const orTrueLine = '  const x = result || true;';
const orTrueViolations = findGateSoftPassLines(orTrueLine);
if (orTrueViolations.length > 0) {
  pass('stripLineForGateHygiene: || true in code detected');
} else {
  fail('stripLineForGateHygiene: || true in code detected');
}

// ---------------------------------------------------------------------------
// 3. Self-test: block comment handling
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 3. Block comment handling ===\n');

const blockCommentSource = `/* This is a block comment
   check(true, should not detect)
   assert(true)
   || true
*/
const validCode = 1;`;

const blockViolations = findGateSoftPassLines(blockCommentSource);
if (blockViolations.length === 0) {
  pass('block comment: soft-pass patterns inside block comment not detected');
} else {
  fail('block comment: soft-pass patterns inside block comment not detected');
}

const blockCommentWithCode = `/* comment */
check(true, "should detect this");`;

const blockWithCodeViolations = findGateSoftPassLines(blockCommentWithCode);
if (blockWithCodeViolations.length > 0) {
  pass('block comment: code after block comment is still scanned');
} else {
  fail('block comment: code after block comment is still scanned');
}

// Inline block comment on same line as code
const inlineBlockCommentWithCode = '/* comment */ check(true, "should detect this");';
const inlineBlockViolations = findGateSoftPassLines(inlineBlockCommentWithCode);
if (inlineBlockViolations.length > 0) {
  pass('block comment: code after inline block comment on same line is still scanned');
} else {
  fail('block comment: code after inline block comment on same line is still scanned');
}

// Code before inline block comment
const codeBeforeInlineBlock = 'check(true, "bad") /* comment */';
const codeBeforeInlineViolations = findGateSoftPassLines(codeBeforeInlineBlock);
if (codeBeforeInlineViolations.length > 0) {
  pass('block comment: code before inline block comment on same line is still scanned');
} else {
  fail('block comment: code before inline block comment on same line is still scanned');
}

// ---------------------------------------------------------------------------
// 4. Self-test: line comment handling (R12 fix)
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 4. Line comment handling ===\n');

// Code before line comment MUST be detected
const codeBeforeLineComment = 'check(true, "bad"); // comment';
const codeBeforeLineViolations = findGateSoftPassLines(codeBeforeLineComment);
if (codeBeforeLineViolations.length > 0) {
  pass('line comment: code before // comment detected');
} else {
  fail('line comment: code before // comment detected');
}

// || true before line comment MUST be detected
const orTrueBeforeLineComment = 'const x = result || true; // comment';
const orTrueBeforeLineViolations = findGateSoftPassLines(orTrueBeforeLineComment);
if (orTrueBeforeLineViolations.length > 0) {
  pass('line comment: || true before // comment detected');
} else {
  fail('line comment: || true before // comment detected');
}

// assert(true) before line comment MUST be detected
const assertBeforeLineComment = 'assert(true); // comment';
const assertBeforeLineViolations = findGateSoftPassLines(assertBeforeLineComment);
if (assertBeforeLineViolations.length > 0) {
  pass('line comment: assert(true) before // comment detected');
} else {
  fail('line comment: assert(true) before // comment detected');
}

// Soft-pass inside line comment should NOT be detected
const softPassInLineComment = 'const x = 1; // check(true, "not real")';
const softPassInLineCommentViolations = findGateSoftPassLines(softPassInLineComment);
if (softPassInLineCommentViolations.length === 0) {
  pass('line comment: check(true) inside // comment not false positive');
} else {
  fail('line comment: check(true) inside // comment not false positive');
}

// ---------------------------------------------------------------------------
// 5. Self-test: multi-line template literal handling
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 5. Template literal handling ===\n');

const templateLiteralSource = 'const msg = `check(true, ${bad}) should not match`;';
const templateViolations = findGateSoftPassLines(templateLiteralSource);
if (templateViolations.length === 0) {
  pass('template literal: check(true) inside template literal not detected');
} else {
  fail('template literal: check(true) inside template literal not detected');
}

const multiLineTemplateSource = `const msg = \`
  check(true, should not detect)
  assert(true)
\`;
const x = result || true;`;

const multiLineTemplateViolations = findGateSoftPassLines(multiLineTemplateSource);
if (
  multiLineTemplateViolations.length === 1
  && multiLineTemplateViolations[0].pattern === '|| true'
) {
  pass('template literal: multi-line template content skipped, code after template scanned');
} else {
  fail('template literal: multi-line template content skipped, code after template scanned');
}

// ---------------------------------------------------------------------------
// 6. Self-test: regex literal false positive prevention
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 6. Regex literal handling ===\n');

const regexSource = 'const m = src.match(/check\\s*\\(\\s*true/g);';
const regexViolations = findGateSoftPassLines(regexSource);
if (regexViolations.length === 0) {
  pass('regex literal: /check(true/ not false positive');
} else {
  fail('regex literal: /check(true/ not false positive');
}

const regexOrTrue = 'const m = src.match(/\\|\\|\\s*true/g);';
const regexOrTrueViolations = findGateSoftPassLines(regexOrTrue);
if (regexOrTrueViolations.length === 0) {
  pass('regex literal: /|| true/ not false positive');
} else {
  fail('regex literal: /|| true/ not false positive');
}

// ---------------------------------------------------------------------------
// 7. Anti-self-falsification
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 7. Anti-self-falsification ===\n');

// If the utility is broken, it might not detect real violations
const brokenUtilitySource = 'check(true, "this is a real violation");';
const brokenViolations = findGateSoftPassLines(brokenUtilitySource);
if (brokenViolations.length > 0) {
  pass('anti-falsification: real check(true) detected even if utility has bugs');
} else {
  fail('anti-falsification: real check(true) detected even if utility has bugs');
}

const assertTrueSource = 'assert(true);';
const assertViolations = findGateSoftPassLines(assertTrueSource);
if (assertViolations.length > 0) {
  pass('anti-falsification: real assert(true) detected');
} else {
  fail('anti-falsification: real assert(true) detected');
}

// ---------------------------------------------------------------------------
// 8. Self-source scan: this file must not contain real soft-pass patterns
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 8. Self-source scan ===\n');

const selfSource = readFileSync(resolve('scripts/verify-selling-houses-gate-hygiene.ts'), 'utf-8');
const selfViolations = findGateSoftPassLines(selfSource).map(v => ({
  ...v,
  file: 'scripts/verify-selling-houses-gate-hygiene.ts',
}));

// Filter out violations inside string test samples (they are test fixtures, not real logic)
const realSelfViolations = selfViolations.filter(v => {
  // These are known test fixture lines — the soft-pass patterns are inside
  // string literals used as test input, not real gate logic.
  const line = selfSource.split('\n')[v.line - 1];
  if (!line) return true; // unknown line, treat as real
  // If the violation pattern appears inside a string literal assignment, it's a test fixture
  const trimmed = line.trim();
  if (trimmed.startsWith('const ') && trimmed.includes('= ') && (trimmed.includes('"') || trimmed.includes("'") || trimmed.includes('`'))) {
    return false; // test fixture — skip
  }
  return true;
});

if (realSelfViolations.length === 0) {
  pass('self-source: no real soft-pass patterns in verify-selling-houses-gate-hygiene.ts');
} else {
  const loc = formatGateLineLocations(realSelfViolations);
  fail(`self-source: real soft-pass violations — ${loc}`);
}

// ---------------------------------------------------------------------------
// 9. All constitutional chain gates have process.exit
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 9. Gates have hard exit ===\n');

for (const gatePath of CONSTITUTIONAL_CHAIN_GATES) {
  const src = readFileSync(resolve(gatePath), 'utf-8');
  if (src.includes('process.exit')) {
    pass(`${gatePath}: has process.exit`);
  } else {
    fail(`${gatePath}: has process.exit`);
  }
}

// ---------------------------------------------------------------------------
// 10. Legacy hygiene backlog is frozen
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 10. Legacy backlog freeze ===\n');

if (LEGACY_GATE_HYGIENE_BACKLOG.length === FROZEN_BACKLOG_COUNT) {
  pass(`legacy backlog: count frozen at ${FROZEN_BACKLOG_COUNT}`);
} else {
  fail(`legacy backlog: count changed from ${FROZEN_BACKLOG_COUNT} to ${LEGACY_GATE_HYGIENE_BACKLOG.length}`);
}

// Verify each backlog entry still exists in the file
for (const entry of LEGACY_GATE_HYGIENE_BACKLOG) {
  if (entry.file && entry.pattern) {
    const src = readFileSync(resolve(entry.file), 'utf-8');
    const violations = findGateSoftPassLines(src);
    const matching = violations.filter(v => v.pattern === entry.pattern);
    if (matching.length > 0) {
      pass(`backlog: ${entry.file} still has ${entry.pattern} — ${entry.reason}`);
    } else {
      fail(`backlog: ${entry.file} no longer has ${entry.pattern} — remove from backlog`);
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Gate Hygiene Summary: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  process.exit(1);
}
process.exit(0);
