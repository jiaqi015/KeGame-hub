/**
 * Field Ownership Drift Audit — Agent D governance script.
 *
 * Validates that field ownership registries stay in sync with actual type fields.
 * Detects:
 * 1. Stale registry entries (field removed from type but still in registry)
 * 2. Drift (field added to type but missing from registry)
 * 3. Deprecated entries without migration targets
 * 4. Empty migration notes
 * 5. A/B/C write scope boundary compliance
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
// Helpers: extract interface fields from TypeScript source
// ---------------------------------------------------------------------------

function extractInterfaceFields(src: string, interfaceName: string): Set<string> {
  const fields = new Set<string>();
  // Match: export interface Name { ... }
  const re = new RegExp(`export interface ${interfaceName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = src.match(re);
  if (!match) return fields;
  const body = match[1];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    // Skip comments, blank lines, method signatures
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    // Match field: name? or name: ...
    const fieldMatch = trimmed.match(/^(\w+)\??\s*[:;]/);
    if (fieldMatch) {
      fields.add(fieldMatch[1]);
    }
  }
  return fields;
}

function extractTypeUnionValues(src: string, typeName: string): Set<string> {
  const values = new Set<string>();
  // Find the start of the type definition
  const startRe = new RegExp(`export type ${typeName}\\s*=`, 'm');
  const startMatch = startRe.exec(src);
  if (!startMatch) return values;

  // Read from the start until we hit a non-union line (after seeing at least one value)
  let pos = startMatch.index + startMatch[0].length;
  const remaining = src.slice(pos);
  let foundAny = false;
  for (const line of remaining.split('\n')) {
    const trimmed = line.trim();
    const valueMatch = trimmed.match(/^\|\s*['"](\w+)['"]/);
    if (valueMatch) {
      values.add(valueMatch[1]);
      foundAny = true;
    } else if (foundAny && (!trimmed || trimmed.startsWith('export ') || trimmed.startsWith('//'))) {
      break;
    }
    // Skip blank lines and comments before the first value
  }
  return values;
}

function extractRegistryKeys(src: string, registryName: string): Set<string> {
  const keys = new Set<string>();
  // Match: export const REGISTRY_NAME: Readonly<Record<...>> = { ... }
  const re = new RegExp(`export const ${registryName}[\\s\\S]*?=\\s*\\{([\\s\\S]*?)\\n\\};`, 'm');
  const match = src.match(re);
  if (!match) return keys;
  const body = match[1];
  // Match top-level keys (2-space indent, not 4-space)
  for (const line of body.split('\n')) {
    const keyMatch = line.match(/^  (\w+)\s*:\s*\{/);
    if (keyMatch) {
      keys.add(keyMatch[1]);
    }
  }
  return keys;
}

function checkRegistryEntry(
  src: string,
  registryName: string,
  field: string,
  checks: { deprecatedHasTarget?: boolean; migrationNoteNonEmpty?: boolean },
) {
  // Find the entry for this field in the registry
  const re = new RegExp(
    `export const ${registryName}[\\s\\S]*?${field}:\\s*\\{([\\s\\S]*?)\\n  \\},`,
    'm',
  );
  const match = src.match(re);
  if (!match) return;

  const entry = match[1];

  if (checks.deprecatedHasTarget) {
    if (entry.includes("canonicalOwner: 'deprecated-legacy'")) {
      check(
        entry.includes('targetConcept'),
        `${registryName}.${field}: deprecated-legacy has targetConcept`,
      );
    }
  }

  if (checks.migrationNoteNonEmpty) {
    const noteMatch = entry.match(/migrationNote:\s*'([^']*)'/);
    check(
      noteMatch !== null && noteMatch[1].length > 0,
      `${registryName}.${field}: migrationNote is non-empty`,
    );
  }
}

// ---------------------------------------------------------------------------
// Domain types source
// ---------------------------------------------------------------------------

const domainModelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/models.ts',
  'utf-8',
);

// ---------------------------------------------------------------------------
// 1. Case field ownership drift
// ---------------------------------------------------------------------------

console.log('=== Check 1: Case field ownership drift ===');

const caseOwnershipSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/legacy-case-field-ownership.ts',
  'utf-8',
);

const caseFields = extractInterfaceFields(domainModelsSrc, 'Case');
const caseRegistryKeys = extractRegistryKeys(caseOwnershipSrc, 'LEGACY_CASE_FIELD_OWNERSHIP_REGISTRY');

// Fields in type but not in registry (drift)
for (const field of caseFields) {
  check(
    caseRegistryKeys.has(field),
    `Case.${field}: registered in ownership registry`,
  );
}

// Fields in registry but not in type (stale)
for (const key of caseRegistryKeys) {
  check(
    caseFields.has(key),
    `Case ownership.${key}: still exists on Case type`,
  );
}

// Deprecated entries have migration targets
for (const key of caseRegistryKeys) {
  checkRegistryEntry(caseOwnershipSrc, 'LEGACY_CASE_FIELD_OWNERSHIP_REGISTRY', key, {
    deprecatedHasTarget: true,
    migrationNoteNonEmpty: true,
  });
}

// ---------------------------------------------------------------------------
// 2. Opportunity field ownership drift
// ---------------------------------------------------------------------------

console.log('=== Check 2: Opportunity field ownership drift ===');

const opportunityOwnershipSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/legacy-opportunity-field-ownership.ts',
  'utf-8',
);

const opportunityFields = extractInterfaceFields(domainModelsSrc, 'Opportunity');
const opportunityUnion = extractTypeUnionValues(opportunityOwnershipSrc, 'LegacyOpportunityField');
const opportunityRegistryKeys = extractRegistryKeys(opportunityOwnershipSrc, 'LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_REGISTRY');

// Union must match type fields
for (const field of opportunityFields) {
  check(
    opportunityUnion.has(field),
    `Opportunity.${field}: in LegacyOpportunityField union`,
  );
}
for (const field of opportunityUnion) {
  check(
    opportunityFields.has(field),
    `LegacyOpportunityField.${field}: still exists on Opportunity type`,
  );
}

// Registry must match union (TypeScript enforces this, but verify at runtime)
for (const field of opportunityUnion) {
  check(
    opportunityRegistryKeys.has(field),
    `Opportunity.${field}: in ownership registry`,
  );
}

// Deprecated entries
for (const key of opportunityRegistryKeys) {
  checkRegistryEntry(opportunityOwnershipSrc, 'LEGACY_OPPORTUNITY_FIELD_OWNERSHIP_REGISTRY', key, {
    deprecatedHasTarget: true,
    migrationNoteNonEmpty: true,
  });
}

// ---------------------------------------------------------------------------
// 3. ClosedDealRecord field ownership drift
// ---------------------------------------------------------------------------

console.log('=== Check 3: ClosedDealRecord field ownership drift ===');

const closedDealOwnershipSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/legacy-closed-deal-field-ownership.ts',
  'utf-8',
);

const closedDealFields = extractInterfaceFields(domainModelsSrc, 'ClosedDealRecord');
const closedDealUnion = extractTypeUnionValues(closedDealOwnershipSrc, 'LegacyClosedDealField');
const closedDealRegistryKeys = extractRegistryKeys(closedDealOwnershipSrc, 'LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_REGISTRY');

for (const field of closedDealFields) {
  check(
    closedDealUnion.has(field),
    `ClosedDealRecord.${field}: in LegacyClosedDealField union`,
  );
}
for (const field of closedDealUnion) {
  check(
    closedDealFields.has(field),
    `LegacyClosedDealField.${field}: still exists on ClosedDealRecord type`,
  );
}

for (const key of closedDealRegistryKeys) {
  checkRegistryEntry(closedDealOwnershipSrc, 'LEGACY_CLOSED_DEAL_FIELD_OWNERSHIP_REGISTRY', key, {
    deprecatedHasTarget: true,
    migrationNoteNonEmpty: true,
  });
}

// ---------------------------------------------------------------------------
// 4. GameState field ownership drift
// ---------------------------------------------------------------------------

console.log('=== Check 4: GameState field ownership drift ===');

const gameStateOwnershipSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/legacy-gamestate-field-ownership.ts',
  'utf-8',
);

const gameStateFields = extractInterfaceFields(domainModelsSrc, 'GameState');
const gameStateRegistryKeys = extractRegistryKeys(gameStateOwnershipSrc, 'LEGACY_GAMESTATE_FIELD_OWNERSHIP_REGISTRY');

// GameState registry is curated (Record<string, ...>) — not exhaustive.
// Only check that registry keys still exist on the type (no stale entries).
// Collection fields (cases[], opportunities[], etc.) are covered by element registries.
for (const key of gameStateRegistryKeys) {
  check(
    gameStateFields.has(key),
    `GameState ownership.${key}: still exists on GameState type`,
  );
}

for (const key of gameStateRegistryKeys) {
  checkRegistryEntry(gameStateOwnershipSrc, 'LEGACY_GAMESTATE_FIELD_OWNERSHIP_REGISTRY', key, {
    deprecatedHasTarget: true,
    migrationNoteNonEmpty: true,
  });
}

// ---------------------------------------------------------------------------
// 5. CustomerRuntimeState field ownership drift
// ---------------------------------------------------------------------------

console.log('=== Check 5: CustomerRuntimeState field ownership drift ===');

const customerRuntimeOwnershipSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/legacy-customer-runtime-field-ownership.ts',
  'utf-8',
);

const customerRuntimeFields = extractInterfaceFields(domainModelsSrc, 'CustomerRuntimeState');
const customerRuntimeUnion = extractTypeUnionValues(customerRuntimeOwnershipSrc, 'CustomerRuntimeStateField');
const customerRuntimeRegistryKeys = extractRegistryKeys(customerRuntimeOwnershipSrc, 'LEGACY_CUSTOMER_RUNTIME_FIELD_OWNERSHIP_REGISTRY');

for (const field of customerRuntimeFields) {
  check(
    customerRuntimeUnion.has(field),
    `CustomerRuntimeState.${field}: in CustomerRuntimeStateField union`,
  );
}
for (const field of customerRuntimeUnion) {
  check(
    customerRuntimeFields.has(field),
    `CustomerRuntimeStateField.${field}: still exists on CustomerRuntimeState type`,
  );
}

for (const key of customerRuntimeRegistryKeys) {
  checkRegistryEntry(customerRuntimeOwnershipSrc, 'LEGACY_CUSTOMER_RUNTIME_FIELD_OWNERSHIP_REGISTRY', key, {
    deprecatedHasTarget: true,
    migrationNoteNonEmpty: true,
  });
}

// ---------------------------------------------------------------------------
// 6. A/B/C write scope boundary compliance
// ---------------------------------------------------------------------------

console.log('=== Check 6: A/B/C write scope boundaries ===');

// Agent A: core/world-state/** — must not import from domain
const coreWorldStateIndex = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/index.ts',
  'utf-8',
);
// index.ts re-exports are fine; check that core/world-state modules don't import domain
// (This is already covered by layer-imports script, just verify key files)

// Agent B: core/decision/** — must not import domain or runtime
const decisionModels = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/decision/models.ts',
  'utf-8',
);
check(!decisionModels.includes("from '../../domain"), 'core/decision/models.ts: no domain import');
check(!decisionModels.includes("from '../../runtime"), 'core/decision/models.ts: no runtime import');

const decisionBoundaryGuards = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/decision/boundaryGuards.ts',
  'utf-8',
);
check(!decisionBoundaryGuards.includes("from '../../domain"), 'core/decision/boundaryGuards.ts: no domain import');
check(!decisionBoundaryGuards.includes("from '../../runtime"), 'core/decision/boundaryGuards.ts: no runtime import');

// Agent A: core/world-state/consensus/** — must not import domain
const consensusModels = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/consensus/models.ts',
  'utf-8',
);
check(!consensusModels.includes("from '../../domain"), 'core/world-state/consensus/models.ts: no domain import');
check(!consensusModels.includes("from '../../runtime"), 'core/world-state/consensus/models.ts: no runtime import');

// Agent A: core/world-state/interactions/** — must not import domain or runtime
const interactionsModels = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/interactions/models.ts',
  'utf-8',
);
check(!interactionsModels.includes("from '../../domain"), 'core/world-state/interactions/models.ts: no domain import');
check(!interactionsModels.includes("from '../../runtime"), 'core/world-state/interactions/models.ts: no runtime import');

// Agent B: core/narrative/** — must not import domain or runtime
const narrativeModels = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/narrative/models.ts',
  'utf-8',
);
check(!narrativeModels.includes("from '../../domain"), 'core/narrative/models.ts: no domain import');
check(!narrativeModels.includes("from '../../runtime"), 'core/narrative/models.ts: no runtime import');

// Agent B: core/llm-boundary/** — must not import domain or runtime
const llmModels = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/llm-boundary/models.ts',
  'utf-8',
);
check(!llmModels.includes("from '../../domain"), 'core/llm-boundary/models.ts: no domain import');
check(!llmModels.includes("from '../../runtime"), 'core/llm-boundary/models.ts: no runtime import');

// Agent A: core/world-state/attention/** — must not import domain or runtime
try {
  const attentionModels = readFileSync(
    '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/attention/types.ts',
    'utf-8',
  );
  check(!attentionModels.includes("from '../../domain"), 'core/world-state/attention/types.ts: no domain import');
  check(!attentionModels.includes("from '../../runtime"), 'core/world-state/attention/types.ts: no runtime import');
} catch {
  console.log('  ⏭️  core/world-state/attention/types.ts not found (skipped)');
}

// Agent B: core/semantic-receipt/** — must not import domain or runtime
const semanticReceiptModels = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/semantic-receipt/models.ts',
  'utf-8',
);
check(!semanticReceiptModels.includes("from '../../domain"), 'core/world-state/semantic-receipt/models.ts: no domain import');
check(!semanticReceiptModels.includes("from '../../runtime"), 'core/world-state/semantic-receipt/models.ts: no runtime import');

// ---------------------------------------------------------------------------
// 7. Workplan A/B/C/D governance
// ---------------------------------------------------------------------------

console.log('=== Check 7: Workplan governance ===');

const workplan = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/docs/selling-houses-mother-model-agent-workplan.md',
  'utf-8',
);

check(workplan.includes('Active top-level agents are A, B, C, and D'), 'Workplan declares A/B/C/D active');
check(!/### \d{4}-\d{2}-\d{2}.*Agent E/.test(workplan), 'No Agent E reports');
check(!/### \d{4}-\d{2}-\d{2}.*Agent F/.test(workplan), 'No Agent F reports');
check(workplan.includes('### Agent D Reports'), 'Agent D Reports section exists');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n=== Summary ===');
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
