/**
 * verify-selling-houses-gate-hygiene.ts — verifies that constitutional chain gates
 * contain no soft-pass patterns (check(true), assert(true), || true, .claude/worktrees).
 *
 * Uses the shared selling-houses-gate-hygiene.ts utilities for source scanning.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  findGateSoftPassLines,
  formatGateLineLocations,
  stripNonCodeRegions,
  stripLineForGateHygiene,
  CONSTITUTIONAL_CHAIN_GATES,
} from './selling-houses-gate-hygiene.js';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Each constitutional chain gate has no soft-pass patterns
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 1. Constitutional chain gate soft-pass scan ===\n');

for (const gatePath of CONSTITUTIONAL_CHAIN_GATES) {
  const src = readFileSync(resolve(gatePath), 'utf-8');
  const violations = findGateSoftPassLines(src).map(v => ({ ...v, file: gatePath }));

  if (violations.length > 0) {
    const loc = formatGateLineLocations(violations);
    check(false, `${gatePath}: soft-pass violations — ${loc}`);
  } else {
    check(true, `${gatePath}: no soft-pass patterns`);
  }
}

// ---------------------------------------------------------------------------
// 2. Self-test: stripNonCodeRegions handles edge cases
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 2. Self-test utility correctness ===\n');

// check(true, ...) in a string literal should NOT be detected
const stringLine = "  const msg = 'check(true, bad)';";
const strippedString = stripLineForGateHygiene(stringLine);
check(!/\bcheck\s*\(\s*true\s*,/.test(strippedString), 'stripLineForGateHygiene: string literal not detected as code');

// check(true, ...) in a comment should NOT be detected (line skipped)
const commentLine = '  // check(true, some comment)';
const commentViolations = findGateSoftPassLines(commentLine);
check(commentViolations.length === 0, 'stripLineForGateHygiene: comment line skipped');

// Actual check(true, ...) in code SHOULD be detected
const codeLine = '  check(true, "bad pattern");';
const codeViolations = findGateSoftPassLines(codeLine);
check(codeViolations.length > 0, 'stripLineForGateHygiene: check(true) in code detected');

// || true in code SHOULD be detected
const orTrueLine = '  const x = result || true;';
const orTrueViolations = findGateSoftPassLines(orTrueLine);
check(orTrueViolations.length > 0, 'stripLineForGateHygiene: || true in code detected');

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
check(blockViolations.length === 0, 'block comment: soft-pass patterns inside block comment not detected');

const blockCommentWithCode = `/* comment */
check(true, "should detect this");`;

const blockWithCodeViolations = findGateSoftPassLines(blockCommentWithCode);
check(blockWithCodeViolations.length > 0, 'block comment: code after block comment is still scanned');

// Inline block comment on same line as code
const inlineBlockCommentWithCode = '/* comment */ check(true, "should detect this");';
const inlineBlockViolations = findGateSoftPassLines(inlineBlockCommentWithCode);
check(inlineBlockViolations.length > 0, 'block comment: code after inline block comment on same line is still scanned');

// Code before inline block comment
const codeBeforeInlineBlock = 'check(true, "bad") /* comment */';
const codeBeforeInlineViolations = findGateSoftPassLines(codeBeforeInlineBlock);
check(codeBeforeInlineViolations.length > 0, 'block comment: code before inline block comment on same line is still scanned');

// ---------------------------------------------------------------------------
// 4. Self-test: multi-line template literal handling
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 4. Template literal handling ===\n');

const templateLiteralSource = 'const msg = `check(true, ${bad}) should not match`;';
const templateViolations = findGateSoftPassLines(templateLiteralSource);
check(templateViolations.length === 0, 'template literal: check(true) inside template literal not detected');

const multiLineTemplateSource = `const msg = \`
  check(true, should not detect)
  assert(true)
\`;
const x = result || true;`;

const multiLineTemplateViolations = findGateSoftPassLines(multiLineTemplateSource);
check(
  multiLineTemplateViolations.length === 1 && multiLineTemplateViolations[0].pattern === '|| true',
  'template literal: multi-line template content skipped, code after template scanned',
);

// ---------------------------------------------------------------------------
// 5. Self-test: regex literal false positive prevention
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 5. Regex literal handling ===\n');

const regexSource = 'const m = src.match(/check\\s*\\(\\s*true/g);';
const regexViolations = findGateSoftPassLines(regexSource);
check(regexViolations.length === 0, 'regex literal: /check(true/ not false positive');

const regexOrTrue = 'const m = src.match(/\\|\\|\\s*true/g);';
const regexOrTrueViolations = findGateSoftPassLines(regexOrTrue);
check(regexOrTrueViolations.length === 0, 'regex literal: /|| true/ not false positive');

// ---------------------------------------------------------------------------
// 6. Self-test: utility cannot self-falsify
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 6. Anti-self-falsification ===\n');

// If the utility is broken, it might not detect real violations
const brokenUtilitySource = 'check(true, "this is a real violation");';
const brokenViolations = findGateSoftPassLines(brokenUtilitySource);
check(brokenViolations.length > 0, 'anti-falsification: real check(true) detected even if utility has bugs');

const assertTrueSource = 'assert(true);';
const assertViolations = findGateSoftPassLines(assertTrueSource);
check(assertViolations.length > 0, 'anti-falsification: real assert(true) detected');

// If the hygiene scanner itself used check(true), it would be caught
const selfCheckSource = `check(true, 'should not happen');`;
const selfCheckViolations = findGateSoftPassLines(selfCheckSource);
check(selfCheckViolations.length > 0, 'anti-falsification: hygiene scanner cannot use check(true) itself');

// ---------------------------------------------------------------------------
// 7. All constitutional chain gates have process.exit
// ---------------------------------------------------------------------------

console.log('\n=== Gate Hygiene: 7. Gates have hard exit ===\n');

for (const gatePath of CONSTITUTIONAL_CHAIN_GATES) {
  const src = readFileSync(resolve(gatePath), 'utf-8');
  check(src.includes('process.exit'), `${gatePath}: has process.exit`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Gate Hygiene Summary: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  process.exit(1);
}
process.exit(0);
