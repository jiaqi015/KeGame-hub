/**
 * BusinessFlowTemplate v0 contract verification.
 *
 * Validates:
 * 1. All types compile
 * 2. Template catalog returns all 6 templates
 * 3. Each template has phases, gates, actorRoles
 * 4. Template phases are ordered correctly
 * 5. Core boundary clean
 */

import { readFileSync } from 'node:fs';

import {
  buildBusinessFlowTemplateCatalog,
  type BusinessFlowTemplate,
  type BusinessFlowTemplateKind,
  type BusinessFlowPhase,
  type BusinessFlowPhaseGate,
} from '../src/selling-houses/core/world-state/processes/index.js';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

// ---------------------------------------------------------------------------
// 1. Type compilation
// ---------------------------------------------------------------------------

console.log('=== Check 1: Type compilation ===');

const kind: BusinessFlowTemplateKind = 'price_adjustment_communication';
check(typeof kind === 'string', 'BusinessFlowTemplateKind compiles');

const phase: BusinessFlowPhase = {
  phaseId: 'test',
  label: 'test',
  description: 'test',
  order: 0,
  isTerminal: false,
  requiredEvidenceKinds: [],
};
check(typeof phase.phaseId === 'string', 'BusinessFlowPhase compiles');

const gate: BusinessFlowPhaseGate = {
  gateId: 'test',
  fromPhaseId: 'a',
  toPhaseId: 'b',
  conditionKind: 'action_completed',
  description: 'test',
  requiredEvidenceKinds: [],
};
check(typeof gate.gateId === 'string', 'BusinessFlowPhaseGate compiles');

console.log('  Type compilation: PASS');

// ---------------------------------------------------------------------------
// 2. Template catalog returns all 6 templates
// ---------------------------------------------------------------------------

console.log('=== Check 2: Template catalog ===');

const catalog = buildBusinessFlowTemplateCatalog();
check(catalog.length === 6, `catalog: 6 templates, got: ${catalog.length}`);

const expectedKinds: BusinessFlowTemplateKind[] = [
  'price_adjustment_communication',
  'showing_to_offer_conversion',
  'open_day_campaign',
  'sincerity_sale_push',
  'owner_waiting_to_commitment',
  'consensus_to_contract',
];

for (const kind of expectedKinds) {
  const found = catalog.some((t) => t.kind === kind);
  check(found, `catalog: has ${kind}`);
}

console.log('  Template catalog: PASS');

// ---------------------------------------------------------------------------
// 3. Each template has phases, gates, actorRoles
// ---------------------------------------------------------------------------

console.log('=== Check 3: Template structure ===');

for (const template of catalog) {
  check(template.phases.length >= 3, `${template.kind}: >= 3 phases`);
  check(template.gates.length >= 2, `${template.kind}: >= 2 gates`);
  check(template.actorRoles.length >= 1, `${template.kind}: >= 1 actorRole`);
  check(template.typicalDurationDays > 0, `${template.kind}: typicalDurationDays > 0`);
  check(template.templateId.length > 0, `${template.kind}: templateId not empty`);
  check(template.label.length > 0, `${template.kind}: label not empty`);
  check(template.description.length > 0, `${template.kind}: description not empty`);
}

console.log('  Template structure: PASS');

// ---------------------------------------------------------------------------
// 4. Phase ordering
// ---------------------------------------------------------------------------

console.log('=== Check 4: Phase ordering ===');

for (const template of catalog) {
  for (let i = 1; i < template.phases.length; i++) {
    check(
      template.phases[i].order > template.phases[i - 1].order,
      `${template.kind}: phase[${i}].order > phase[${i - 1}].order`,
    );
  }

  // Last phase should be terminal
  const lastPhase = template.phases[template.phases.length - 1];
  check(lastPhase.isTerminal, `${template.kind}: last phase is terminal`);
}

console.log('  Phase ordering: PASS');

// ---------------------------------------------------------------------------
// 5. Gate references valid phases
// ---------------------------------------------------------------------------

console.log('=== Check 5: Gate references ===');

for (const template of catalog) {
  const phaseIds = new Set(template.phases.map((p) => p.phaseId));
  for (const gate of template.gates) {
    check(phaseIds.has(gate.fromPhaseId), `${template.kind}: gate ${gate.gateId} fromPhaseId valid`);
    check(phaseIds.has(gate.toPhaseId), `${template.kind}: gate ${gate.gateId} toPhaseId valid`);
  }
}

console.log('  Gate references: PASS');

// ---------------------------------------------------------------------------
// 6. Core boundary
// ---------------------------------------------------------------------------

console.log('=== Check 6: Core boundary ===');

const src = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/processes/models.ts', 'utf-8');
const srcWithoutComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcWithoutComments.includes("from '../../domain"), 'no domain imports');
check(!srcWithoutComments.includes("from '../../runtime"), 'no runtime imports');
check(!srcWithoutComments.includes('Date.now'), 'no Date.now');
check(!srcWithoutComments.includes('Math.random'), 'no Math.random');

console.log('  Core boundary: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses business-flow-template contract verification passed');
  process.exit(0);
}
