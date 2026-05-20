import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${message}`);
    return;
  }
  passed += 1;
  console.log(`PASS ${message}`);
}

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const ecosystemPolicyGate = readFileSync('scripts/verify-selling-houses-ecosystem-policy.ts', 'utf8');
const ecosystemPolicyGateClean = stripComments(ecosystemPolicyGate);

check(!ecosystemPolicyGateClean.includes('|| true'), 'ecosystem policy gate has no || true soft pass');
check(!/check\(\s*true\s*,/.test(ecosystemPolicyGateClean), 'ecosystem policy gate has no check(true) soft pass');
check(!/assert\(\s*true\s*,/.test(ecosystemPolicyGateClean), 'ecosystem policy gate has no assert(true) soft pass');

const superCr = readFileSync(
  '/Users/jiaqi/.gemini/antigravity/brain/21e60cf8-966c-44d0-8362-2f83c53f959a/global_codebase_super_cr.md',
  'utf8',
);

const forbiddenSimulationTruthPhrases = [
  '用大模型推理层取代复杂的逻辑规则',
  'LLM-Driven Action Resolver',
  '取消现有的 `isEligible`',
  '取代复杂的逻辑规则',
];

for (const phrase of forbiddenSimulationTruthPhrases) {
  check(!superCr.includes(phrase), `super CR does not recommend LLM-owned simulation truth: ${phrase}`);
}

check(
  superCr.includes('LLM text is not simulation truth') || superCr.includes('LLM 不得作为 simulation truth'),
  'super CR states LLM is not simulation truth',
);

if (failed > 0) {
  console.error(`\nselling-houses super CR hardening failed: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

console.log(`\nselling-houses super CR hardening passed: ${passed} checks`);
