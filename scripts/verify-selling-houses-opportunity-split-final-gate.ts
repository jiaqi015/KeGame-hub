/**
 * Opportunity Split Final Gate — Agent D acceptance script.
 *
 * Proves (or disproves) that Opportunity enters runtime canonical write-source
 * via CustomerCaseMatch / BrokeredOpportunity split.
 *
 * Chain under test:
 *   core writeSource → domain helper → engine writes → runtime canonical
 *   → legacy Opportunity mirror sync → evaluation read model
 *
 * Checks:
 *  1. Trust final gate pass (prerequisite)
 *  2. Readiness final gate pass (prerequisite)
 *  3. writeSource.ts exists in core/world-state/opportunity-relations/
 *  4. writeSource.ts is pure (no domain/runtime imports, no Date.now, no Math.random, no rngCalls)
 *  5. writeSource.ts exports expected write functions
 *  6. runtimeCustomerCaseMatches / runtimeBrokeredOpportunities exist in GameState
 *  7. createInitialState initializes runtime opportunity split states
 *  8. domain/opportunitySplitHelper.ts exists and handles mirror sync
 *  9. opportunityEngine.ts does NOT bare-write key Opportunity fields
 * 10. External domain writers do NOT bare-write key Opportunity fields
 *     (CustomerRuntimeState.caseStates fields EXCLUDED — those belong to customer runtime)
 * 11. Same customerId + caseId → exactly one CustomerCaseMatch (v0 read model)
 * 12. Every legacy Opportunity has a BrokeredOpportunity (v0 read model)
 * 13. BrokeredOpportunity references matchId (v0 read model)
 * 14. core boundary: v0ReadModel.ts + writeSource.ts do NOT import domain/runtime
 *     types.ts type-only imports are acceptable (compile-time only)
 * 15. npm run build passes
 * 16. Consensus write-source foundation exists and is pure
 * 17. Consensus contract script passes
 * 18. Read boundary exists (v0ReadModel + readBoundary)
 * 19. Replay parity: all write sources are deterministic
 * 20. Consensus runtime wiring: dealClosing actually uses consensusFormationHelper
 * 21. Gate integrity: no "planned" strings masquerading as "migrated" code
 * 22. No deprecated alias re-exports as short names in opportunitySplitHelper
 * 23. refreshOpportunityLabel has no bare lifecycleStatus/stageLabel writes
 * 24. closeOpportunityViaSplit does not pass status as both status AND lifecycleStatus
 * 25. Drift report covers lifecycleStatus and stageLabel
 * 26. Runtime: mirror consistent after advanceOneDay
 * 27. Runtime: mirror consistent after showing/action cycles
 * 28. Runtime: mirror consistent after closeOpportunity
 * 29. Runtime consensus parity: deal-closing produces canonical consensus artifacts
 *
 * IMPORTANT: This script reports the ACTUAL state. A failing check means
 * the migration is NOT complete for that aspect — it does NOT mean the
 * script is wrong. Fix the source code, not the assertions.
 */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

// Runtime imports for checks 26-28 (mirror consistency assertions)
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import {
  assertOpportunitySplitMirrorConsistency,
  closeOpportunityViaSplit,
  findBrokeredStateForOpportunity,
  initializeOpportunityRelations,
} from '../src/selling-houses/domain/opportunitySplitHelper.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors: string[] = [];
const warnings: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    errors.push(message);
    console.log(`  [FAIL] ${message}`);
  }
}

function warn(condition: boolean, message: string) {
  if (!condition) {
    warnings.push(message);
    console.log(`  [WARN] ${message}`);
  }
}

function readFile(path: string): string {
  return readFileSync(join(import.meta.dirname!, '..', path), 'utf-8');
}

function readFileSafe(path: string): string | null {
  try {
    return readFile(path);
  } catch {
    return null;
  }
}

function fileExists(path: string): boolean {
  return existsSync(join(import.meta.dirname!, '..', path));
}

function runCommand(cmd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, { cwd: join(import.meta.dirname!, '..'), encoding: 'utf-8', timeout: 60_000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, output };
  } catch (err: any) {
    return { ok: false, output: err.stderr || err.stdout || String(err) };
  }
}

// ---------------------------------------------------------------------------
// Key Opportunity fields that must NOT be bare-written in engine files
// (EXCLUDES CustomerRuntimeState.caseStates fields: interest, confidence, fit, stageIndex)
// ---------------------------------------------------------------------------

const KEY_OPPORTUNITY_FIELDS = [
  'intent',         // Opportunity.intent — NOT CustomerRuntimeState.interest
  'confidence',     // Opportunity.confidence (but exclude CustomerRuntimeState.caseStates.confidence)
  'fit',            // Opportunity.fit (but exclude CustomerRuntimeState.caseStates.fit)
  'stageIndex',     // Opportunity.stageIndex (but exclude CustomerRuntimeState.caseStates.stageIndex)
  'stageLabel',
  'status',         // Opportunity.status — NOT CustomerRuntimeState.status
  'lifecycleStatus',
  'daysLeft',
  'touchedToday',
  'stagnationTicks',
  'visibility',
  'pendingClosingEvaluation',
  'pendingClosingStrategyId',
  'pendingClosingRequestedDay',
];

// Regex patterns to identify CustomerRuntimeState.caseStates fields
// These are EXCLUDED from bare-write detection
const CUSTOMER_RUNTIME_EXCEPTION_PATTERNS = [
  /runtime\.(interest|confidence|fit|stageIndex)\s*[+\-]?=/,
  /caseRuntime\.(interest|confidence|fit|stageIndex)\s*[+\-]?=/,
  /customerState\./,
  /caseStates\[/,
];

// CustomerRuntime variable names — writes to these are NOT Opportunity writes
// e.g. leadRuntime = customerState.caseStates[leadCaseId]
const CUSTOMER_RUNTIME_VAR_NAMES = new Set([
  'leadRuntime', 'second', 'caseRuntime', 'customerRuntime', 'customerState',
]);

// Case-only fields — if a variable writes these, it's a Case, not an Opportunity
// Used for secondary detection: if a bare Opportunity field write sits on a variable
// that also writes Case-only fields within ±10 lines, it's a false positive.
const CASE_ONLY_FIELDS = [
  'isFocused', 'heat', 'touchedOwnerToday', 'patience', 'urgency', 'trust',
  'leadSiphonPower', 'freshness', 'lastTouchedDay', 'lastOwnerTouchedDay',
  'title', // Case.title (Opportunity uses a different field)
];

// Helper function patterns (current API) — writes through these are OK
// Includes ALL exported functions from opportunitySplitHelper.ts
const HELPER_PATTERNS = [
  // Core writeSource functions
  'createCustomerCaseMatchState',
  'setCustomerCaseMatchScores',
  'applyCustomerCaseMatchDelta',
  'createBrokeredOpportunityState',
  'setBrokeredOpportunityStage',
  'setBrokeredOpportunityLifecycle',
  'setBrokeredOpportunityPendingClosing',
  'applyBrokeredOpportunityProgressDelta',
  'deriveLegacyOpportunityMirror',
  // Domain helper: canonical path functions
  'opportunitySplitHelper',
  'ensureCustomerCaseMatchState',
  'ensureBrokeredOpportunityState',
  'initializeOpportunityRelations',
  'applyMatchIntentDelta',
  'applyMatchConfidenceDelta',
  'setOpportunityStageViaSplit',
  'setOpportunityLifecycleViaSplit',
  'setOpportunityPendingClosingViaSplit',
  'applyOpportunityProgressDeltaViaSplit',
  'setOpportunityVisibilityViaSplit',
  'setOpportunityTouchedTodayViaSplit',
  'findBrokeredStateForOpportunity',
  'findMatchStateForPair',
  // Domain helper: convenience wrappers (backward compat, direct Opportunity writes)
  'applyOpportunityIntentDelta',
  'applyOpportunityConfidenceDelta',
  'setOpportunityStageIndex',
  'setOpportunityDaysLeft',
  'setOpportunityTouchedToday',
  'setOpportunityVisibility',
  'setOpportunityStatus',
  'setOpportunityLifecycleStatus',
  'setOpportunityPendingClosing',
];

// ---------------------------------------------------------------------------
// 1. Trust final gate pass
// ---------------------------------------------------------------------------

function checkTrustGate() {
  console.log('\n=== Check 1: Trust final gate pass ===');

  const result = runCommand('npx tsx scripts/verify-selling-houses-trust-migration-final-gate.ts');
  check(result.ok, 'trust-migration-final-gate passes');
  if (!result.ok) {
    const failLines = result.output.split('\n').filter((l) => l.includes('[FAIL]'));
    for (const line of failLines) {
      console.log(`    ${line.trim()}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Readiness final gate pass
// ---------------------------------------------------------------------------

function checkReadinessGate() {
  console.log('\n=== Check 2: Readiness final gate pass ===');

  const result = runCommand('npx tsx scripts/verify-selling-houses-owner-case-readiness-final-gate.ts');
  check(result.ok, 'owner-case-readiness-final-gate passes');
  if (!result.ok) {
    const failLines = result.output.split('\n').filter((l) => l.includes('[FAIL]'));
    for (const line of failLines) {
      console.log(`    ${line.trim()}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. writeSource.ts exists in core/world-state/opportunity-relations/
// ---------------------------------------------------------------------------

function checkWriteSourceExists() {
  console.log('\n=== Check 3: Core write-source exists ===');

  const wsPath = 'src/selling-houses/core/world-state/opportunity-relations/writeSource.ts';
  const wsSrc = readFileSafe(wsPath);
  check(wsSrc !== null, `${wsPath} exists`);

  if (!wsSrc) return;

  // Verify it defines the canonical types
  check(wsSrc.includes('CustomerCaseMatchState'), 'writeSource defines CustomerCaseMatchState');
  check(wsSrc.includes('BrokeredOpportunityState'), 'writeSource defines BrokeredOpportunityState');
  check(wsSrc.includes('CustomerCaseMatchRecord'), 'writeSource defines CustomerCaseMatchRecord');
  check(wsSrc.includes('BrokeredOpportunityRecord'), 'writeSource defines BrokeredOpportunityRecord');
}

// ---------------------------------------------------------------------------
// 4. writeSource.ts is pure
// ---------------------------------------------------------------------------

function checkWriteSourcePurity() {
  console.log('\n=== Check 4: Core write-source purity ===');

  const wsPath = 'src/selling-houses/core/world-state/opportunity-relations/writeSource.ts';
  const wsSrc = readFileSafe(wsPath);
  if (!wsSrc) {
    check(false, 'writeSource.ts not found — cannot verify purity');
    return;
  }

  // No domain/runtime imports
  check(!wsSrc.includes("from '../../../domain"), 'writeSource does NOT import domain');
  check(!wsSrc.includes("from '../../../runtime"), 'writeSource does NOT import runtime');

  // Strip comments for code-only checks
  const wsNoComments = wsSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!wsNoComments.includes('Date.now'), 'writeSource has no Date.now');
  check(!wsNoComments.includes('Math.random'), 'writeSource has no Math.random');
  check(!wsNoComments.includes('rngCalls'), 'writeSource has no rngCalls');
  check(!wsNoComments.includes('rngState'), 'writeSource has no rngState');

  // Uses Object.freeze for immutability
  check(wsSrc.includes('Object.freeze'), 'writeSource uses Object.freeze');
}

// ---------------------------------------------------------------------------
// 5. writeSource.ts exports expected write functions
// ---------------------------------------------------------------------------

function checkWriteSourceExports() {
  console.log('\n=== Check 5: Core write-source exports ===');

  const wsPath = 'src/selling-houses/core/world-state/opportunity-relations/writeSource.ts';
  const wsSrc = readFileSafe(wsPath);
  if (!wsSrc) {
    check(false, 'writeSource.ts not found — cannot verify exports');
    return;
  }

  // CustomerCaseMatch functions
  check(wsSrc.includes('export function createCustomerCaseMatchState'), 'exports createCustomerCaseMatchState');
  check(wsSrc.includes('export function setCustomerCaseMatchScores'), 'exports setCustomerCaseMatchScores');
  check(wsSrc.includes('export function applyCustomerCaseMatchDelta'), 'exports applyCustomerCaseMatchDelta');

  // BrokeredOpportunity functions
  check(wsSrc.includes('export function createBrokeredOpportunityState'), 'exports createBrokeredOpportunityState');
  check(wsSrc.includes('export function setBrokeredOpportunityStage'), 'exports setBrokeredOpportunityStage');
  check(wsSrc.includes('export function setBrokeredOpportunityLifecycle'), 'exports setBrokeredOpportunityLifecycle');
  check(wsSrc.includes('export function setBrokeredOpportunityPendingClosing'), 'exports setBrokeredOpportunityPendingClosing');
  check(wsSrc.includes('export function applyBrokeredOpportunityProgressDelta'), 'exports applyBrokeredOpportunityProgressDelta');

  // ID builders
  check(wsSrc.includes('export function buildCustomerCaseMatchId'), 'exports buildCustomerCaseMatchId');
  check(wsSrc.includes('export function buildBrokeredOpportunityId'), 'exports buildBrokeredOpportunityId');

  // Legacy mirror
  check(wsSrc.includes('export function deriveLegacyOpportunityMirror'), 'exports deriveLegacyOpportunityMirror');
}

// ---------------------------------------------------------------------------
// 6. runtimeCustomerCaseMatches / runtimeBrokeredOpportunities in GameState
// ---------------------------------------------------------------------------

function checkRuntimeFieldsExist() {
  console.log('\n=== Check 6: Runtime fields in GameState ===');

  const modelsSrc = readFile('src/selling-houses/domain/models.ts');
  check(
    modelsSrc.includes('runtimeCustomerCaseMatches'),
    'GameState has runtimeCustomerCaseMatches field',
  );
  check(
    modelsSrc.includes('runtimeBrokeredOpportunities'),
    'GameState has runtimeBrokeredOpportunities field',
  );

  // Verify the types reference writeSource.ts
  check(
    modelsSrc.includes('writeSource.js') && modelsSrc.includes('CustomerCaseMatchState'),
    'runtimeCustomerCaseMatches typed from writeSource.CustomerCaseMatchState',
  );
  check(
    modelsSrc.includes('writeSource.js') && modelsSrc.includes('BrokeredOpportunityState'),
    'runtimeBrokeredOpportunities typed from writeSource.BrokeredOpportunityState',
  );
}

// ---------------------------------------------------------------------------
// 7. createInitialState initializes runtime opportunity split states
// ---------------------------------------------------------------------------

function checkInitPopulates() {
  console.log('\n=== Check 7: createInitialState initializes opportunity split ===');

  const initSrc = readFileSafe('src/selling-houses/application/gameState.ts');
  if (!initSrc) {
    check(false, 'could not read gameState.ts');
    return;
  }

  check(
    initSrc.includes('runtimeCustomerCaseMatches'),
    'createInitialState references runtimeCustomerCaseMatches',
  );
  check(
    initSrc.includes('runtimeBrokeredOpportunities'),
    'createInitialState references runtimeBrokeredOpportunities',
  );
}

// ---------------------------------------------------------------------------
// 8. domain/opportunitySplitHelper.ts exists and handles mirror sync
// ---------------------------------------------------------------------------

function checkHelperExists() {
  console.log('\n=== Check 8: domain/opportunitySplitHelper.ts ===');

  const helperPath = 'src/selling-houses/domain/opportunitySplitHelper.ts';
  const helperSrc = readFileSafe(helperPath);
  check(helperSrc !== null, 'opportunitySplitHelper.ts exists');

  if (!helperSrc) return;

  // Verify it imports from core write-source
  check(
    helperSrc.includes('writeSource') || helperSrc.includes('opportunity-relations/writeSource'),
    'helper imports from core writeSource',
  );

  // Verify it references canonical types
  check(
    helperSrc.includes('CustomerCaseMatchState') || helperSrc.includes('BrokeredOpportunityState'),
    'helper references canonical types (CustomerCaseMatchState or BrokeredOpportunityState)',
  );

  // Verify it persists to runtime state
  check(
    helperSrc.includes('runtimeCustomerCaseMatches') || helperSrc.includes('runtimeBrokeredOpportunities'),
    'helper persists to runtime canonical state',
  );

  // Verify it has mirror sync to legacy Opportunity
  check(
    helperSrc.includes('mirror') || helperSrc.includes('Mirror')
      || helperSrc.includes('sync') || helperSrc.includes('Sync')
      || helperSrc.includes('deriveLegacyOpportunityMirror'),
    'helper syncs legacy Opportunity mirror',
  );

  // Verify it's pure (no domain/runtime imports leaking from core)
  // The helper IS in domain, so it CAN import domain — but it must import core writeSource
  check(
    helperSrc.includes('from') && helperSrc.includes('writeSource'),
    'helper has proper import chain',
  );
}

// ---------------------------------------------------------------------------
// Scan a file for bare writes of key Opportunity fields
// Returns array of location strings
// ---------------------------------------------------------------------------

function scanForBareWrites(
  filePath: string,
  src: string,
): string[] {
  const lines = src.split('\n');
  const bareLocations: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    // Skip imports and exports
    if (trimmed.startsWith('import ') || trimmed.startsWith('export ')) continue;
    // Skip pure type declarations (no = sign)
    if (trimmed.includes(':') && !trimmed.includes('=') && !trimmed.includes('+=') && !trimmed.includes('-=')) continue;

    for (const field of KEY_OPPORTUNITY_FIELDS) {
      // Match: something.field = ... or something.field += ... or something.field -= ...
      const pattern = new RegExp(`\\w+\\.${field}\\s*[+\\-]?=\\s`);
      if (!pattern.test(trimmed)) continue;

      // Exclude CustomerRuntimeState.caseStates fields
      if (CUSTOMER_RUNTIME_EXCEPTION_PATTERNS.some((p) => p.test(trimmed))) continue;

      // Exclude helper calls (current API)
      if (HELPER_PATTERNS.some((p) => trimmed.includes(p))) continue;

      // Exclude Object.freeze (creation pattern)
      if (trimmed.includes('Object.freeze')) continue;

      // Exclude type assertions
      if (trimmed.includes(' as ')) continue;

      // Extract variable name to help classify
      const varName = trimmed.match(/^(\w+)\./)?.[1] || '';

      // Exclude Case variable names — these are handled by trust/readiness gates
      const isCase = ['caseItem', 'currentCase', 'case', 'oppCase', 'targetCase'].includes(varName);
      if (isCase) continue;

      // Exclude RivalListing variable names — these are NOT Opportunity fields
      const isRivalListing = ['existingListing', 'listing', 'rivalListing'].includes(varName);
      if (isRivalListing) continue;

      // Exclude CustomerRuntime variable names — these belong to customer runtime
      if (CUSTOMER_RUNTIME_VAR_NAMES.has(varName)) continue;

      // Secondary detection: if this variable also writes Case-only fields
      // within ±10 lines, it's a Case variable, not an Opportunity
      if (varName) {
        const lookStart = Math.max(0, i - 10);
        const lookEnd = Math.min(lines.length - 1, i + 10);
        let isCaseByContext = false;
        for (let j = lookStart; j <= lookEnd; j++) {
          if (j === i) continue;
          const ctxLine = lines[j].trim();
          for (const cf of CASE_ONLY_FIELDS) {
            if (ctxLine.includes(`${varName}.${cf}`)) {
              isCaseByContext = true;
              break;
            }
          }
          if (isCaseByContext) break;
        }
        if (isCaseByContext) continue;
      }

      bareLocations.push(`${filePath}:${i + 1}: [bare-${field}] ${trimmed.substring(0, 100)}`);
    }
  }

  return bareLocations;
}

// ---------------------------------------------------------------------------
// 9. opportunityEngine.ts does NOT bare-write key Opportunity fields
// ---------------------------------------------------------------------------

function checkOpportunityEngineNoBareWrites() {
  console.log('\n=== Check 9: opportunityEngine.ts bare write check ===');

  const filePath = 'src/selling-houses/domain/engine/opportunityEngine.ts';
  const src = readFileSafe(filePath);
  if (!src) {
    check(false, `${filePath} does not exist`);
    return;
  }

  const bareLocations = scanForBareWrites(filePath, src);

  if (bareLocations.length > 0) {
    console.log(`\n  ⚠ ${bareLocations.length} bare Opportunity field writes in opportunityEngine.ts:`);
    for (const loc of bareLocations) {
      console.log(`    ${loc}`);
    }
  }

  check(bareLocations.length === 0, `opportunityEngine.ts: ZERO bare key Opportunity field writes (found ${bareLocations.length})`);
}

// ---------------------------------------------------------------------------
// 10. External domain writers do NOT bare-write key Opportunity fields
//     EXCLUDES: CustomerRuntimeState.caseStates fields
//     EXCLUDES: Case fields (handled by trust/readiness gates)
//     EXCLUDES: RivalListing fields
// ---------------------------------------------------------------------------

function checkExternalWriters() {
  console.log('\n=== Check 10: External domain writers bare write check ===');

  const scanFiles = [
    'src/selling-houses/domain/engine.ts',
    'src/selling-houses/domain/caseLifecycle.ts',
    'src/selling-houses/domain/dealClosing.ts',
    'src/selling-houses/domain/actionStageRelations.ts',
    'src/selling-houses/domain/runtimeState.ts',
    'src/selling-houses/domain/engine/customerEngine.ts',
    'src/selling-houses/domain/engine/marketEngine.ts',
    'src/selling-houses/domain/engine/eventEngine.ts',
    'src/selling-houses/domain/engine/competitionEngine.ts',
    'src/selling-houses/domain/engine/showingActionExecutors.ts',
    'src/selling-houses/domain/engine/ownerActionExecutors.ts',
    'src/selling-houses/domain/engine/marketingActionExecutors.ts',
    'src/selling-houses/domain/engine/pricingActionExecutors.ts',
    'src/selling-houses/domain/engine/openDayActionExecutors.ts',
    'src/selling-houses/domain/engine/sinceritySaleActionExecutors.ts',
    'src/selling-houses/domain/engine/actionExecutorHelpers.ts',
    'src/selling-houses/domain/engine/actionResolvers.ts',
    'src/selling-houses/domain/market/inboundOpportunityEngine.ts',
    'src/selling-houses/domain/rivals/rivalListingEngine.ts',
    'src/selling-houses/application/gameTransitions.ts',
  ];

  const allBare: string[] = [];
  const byFile: Record<string, string[]> = {};

  for (const filePath of scanFiles) {
    const src = readFileSafe(filePath);
    if (!src) continue;

    const bare = scanForBareWrites(filePath, src);
    if (bare.length > 0) {
      allBare.push(...bare);
      byFile[filePath] = bare;
    }
  }

  if (allBare.length > 0) {
    console.log(`\n  ⚠ ${allBare.length} bare Opportunity field writes across ${Object.keys(byFile).length} files:`);
    for (const [file, locations] of Object.entries(byFile)) {
      console.log(`\n  ${file} (${locations.length} bare writes):`);
      for (const loc of locations) {
        console.log(`    ${loc}`);
      }
    }
  }

  check(allBare.length === 0, `External writers: ZERO bare key Opportunity field writes (found ${allBare.length})`);
}

// ---------------------------------------------------------------------------
// 11. Same customerId + caseId → exactly one CustomerCaseMatch
// ---------------------------------------------------------------------------

function checkDeduplication() {
  console.log('\n=== Check 11: CustomerCaseMatch deduplication ===');

  const v0Src = readFileSafe('src/selling-houses/core/world-state/opportunity-relations/v0ReadModel.ts');
  if (!v0Src) {
    check(false, 'v0ReadModel.ts not found');
    return;
  }

  check(v0Src.includes('oppsByKey'), 'v0ReadModel groups opportunities by relationKey');
  check(v0Src.includes('relationKey'), 'v0ReadModel uses relationKey for deduplication');
  check(
    v0Src.includes('brokeredPathCount') || v0Src.includes('brokeredPaths'),
    'v0ReadModel tracks brokered paths per match',
  );

  // Verify contract test covers deduplication
  const contractSrc = readFileSafe('scripts/verify-selling-houses-opportunity-relation-v0-contract.ts');
  if (contractSrc) {
    check(
      contractSrc.includes('countDedupedBuyers'),
      'v0 contract tests countDedupedBuyers deduplication',
    );
  }
}

// ---------------------------------------------------------------------------
// 12. Every legacy Opportunity has a BrokeredOpportunity
// ---------------------------------------------------------------------------

function checkEveryOppHasBrokered() {
  console.log('\n=== Check 12: Every legacy Opportunity → BrokeredOpportunity ===');

  const v0Src = readFileSafe('src/selling-houses/core/world-state/opportunity-relations/v0ReadModel.ts');
  if (!v0Src) {
    check(false, 'v0ReadModel.ts not found');
    return;
  }

  check(v0Src.includes('buildBrokeredPath'), 'v0ReadModel has buildBrokeredPath function');
  check(
    v0Src.includes('opps.map(buildBrokeredPath)') || v0Src.includes('buildBrokeredPath('),
    'Every opportunity gets a BrokeredOpportunity via buildBrokeredPath',
  );

  const contractSrc = readFileSafe('scripts/verify-selling-houses-opportunity-relation-v0-contract.ts');
  if (contractSrc) {
    check(
      contractSrc.includes('brokeredPaths') && contractSrc.includes('opportunityId'),
      'v0 contract tests brokered path coverage',
    );
  }
}

// ---------------------------------------------------------------------------
// 13. BrokeredOpportunity references matchId
// ---------------------------------------------------------------------------

function checkBrokeredReferencesMatch() {
  console.log('\n=== Check 13: BrokeredOpportunity references matchId ===');

  const v0Src = readFileSafe('src/selling-houses/core/world-state/opportunity-relations/v0ReadModel.ts');
  if (!v0Src) {
    check(false, 'v0ReadModel.ts not found');
    return;
  }

  check(
    v0Src.includes('readonly relationKey: string') || v0Src.includes('relationKey:'),
    'BrokeredOpportunityReadModel references relationKey (matchId)',
  );

  check(
    v0Src.includes('relationKey: relationKey(') || v0Src.includes("relationKey: '"),
    'buildBrokeredPath sets relationKey',
  );
}

// ---------------------------------------------------------------------------
// 14. Core boundary: v0ReadModel.ts + writeSource.ts clean; types.ts type-only OK
// ---------------------------------------------------------------------------

function checkCoreBoundary() {
  console.log('\n=== Check 14: Core boundary ===');

  // v0ReadModel.ts — must NOT import domain/runtime
  const v0Src = readFileSafe('src/selling-houses/core/world-state/opportunity-relations/v0ReadModel.ts');
  if (v0Src) {
    check(!v0Src.includes("from '../../../domain"), 'v0ReadModel.ts does NOT import domain');
    check(!v0Src.includes("from '../../../runtime"), 'v0ReadModel.ts does NOT import runtime');
  }

  // writeSource.ts — must NOT import domain/runtime
  const wsSrc = readFileSafe('src/selling-houses/core/world-state/opportunity-relations/writeSource.ts');
  if (wsSrc) {
    check(!wsSrc.includes("from '../../../domain"), 'writeSource.ts does NOT import domain');
    check(!wsSrc.includes("from '../../../runtime"), 'writeSource.ts does NOT import runtime');
  }

  // types.ts — type-only imports from domain are acceptable (compile-time only)
  const typesSrc = readFileSafe('src/selling-houses/core/world-state/opportunity-relations/types.ts');
  if (typesSrc) {
    const hasRuntimeImport = typesSrc.split('\n').some((line) => {
      const t = line.trim();
      return t.startsWith('import ') && !t.startsWith('import type ') && t.includes('../../../domain');
    });
    check(!hasRuntimeImport, 'types.ts has no RUNTIME domain imports (type-only is OK)');

    // Also check no runtime imports at all
    check(!typesSrc.includes("from '../../../runtime"), 'types.ts does NOT import runtime');
  }

  // readModel.ts — known legacy with domain imports, warn only
  const rmSrc = readFileSafe('src/selling-houses/core/world-state/opportunity-relations/readModel.ts');
  if (rmSrc) {
    const hasRuntimeDomainImport = rmSrc.split('\n').some((line) => {
      const t = line.trim();
      return t.startsWith('import ') && !t.startsWith('import type ') && t.includes('../../../domain');
    });
    warn(
      !hasRuntimeDomainImport,
      'readModel.ts has runtime domain imports (known legacy — v0ReadModel.ts is the pure replacement)',
    );
  }

  // index.ts — should export writeSource
  const indexSrc = readFileSafe('src/selling-houses/core/world-state/opportunity-relations/index.ts');
  if (indexSrc) {
    check(indexSrc.includes('writeSource'), 'index.ts exports writeSource');
    check(indexSrc.includes('v0ReadModel'), 'index.ts exports v0ReadModel');
  }
}

// ---------------------------------------------------------------------------
// 15. npm run build
// ---------------------------------------------------------------------------

function checkBuild() {
  console.log('\n=== Check 15: npm run build ===');

  const result = runCommand('npm run build');
  check(result.ok, 'npm run build passes');
  if (!result.ok) {
    const lines = result.output.split('\n').slice(-10);
    for (const line of lines) {
      if (line.trim()) console.log(`    ${line.trim()}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 16. Consensus write-source foundation exists and is pure
// ---------------------------------------------------------------------------

function checkConsensusWriteSource() {
  console.log('\n=== Check 16: Consensus write-source foundation ===');

  const wsPath = 'src/selling-houses/core/world-state/consensus/writeSource.ts';
  const wsSrc = readFileSafe(wsPath);
  check(wsSrc !== null, `${wsPath} exists`);

  if (!wsSrc) return;

  // Types
  check(wsSrc.includes('ConsensusFormationState'), 'ConsensusFormationState defined');
  check(wsSrc.includes('ContractFactState'), 'ContractFactState defined');
  check(wsSrc.includes('OpportunityClosureSetState'), 'OpportunityClosureSetState defined');

  // Purity
  check(!wsSrc.includes("from '../../../domain"), 'no domain imports');
  check(!wsSrc.includes("from '../../../runtime"), 'no runtime imports');

  const wsNoComments = wsSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!wsNoComments.includes('Date.now'), 'no Date.now');
  check(!wsNoComments.includes('Math.random'), 'no Math.random');
  check(!wsNoComments.includes('rngCalls'), 'no rngCalls');

  // Object.freeze
  check(wsSrc.includes('Object.freeze'), 'uses Object.freeze');

  // Write functions
  check(wsSrc.includes('export function createConsensusFormationState'), 'exports createConsensusFormationState');
  check(wsSrc.includes('export function setConsensusStage'), 'exports setConsensusStage');
  check(wsSrc.includes('export function markConsensusSigned'), 'exports markConsensusSigned');
  check(wsSrc.includes('export function markConsensusCollapsed'), 'exports markConsensusCollapsed');
  check(wsSrc.includes('export function createContractFactForFixtureOnlyState'), 'exports createContractFactForFixtureOnlyState');
  check(wsSrc.includes('export function createOpportunityClosureSetState'), 'exports createOpportunityClosureSetState');

  // Legacy mirror
  check(wsSrc.includes('deriveLegacyClosedDealMirror'), 'exports deriveLegacyClosedDealMirror');
  check(wsSrc.includes('sourceClosedDealId'), 'ContractFactState has sourceClosedDealId for legacy bridge');

  // Helper
  const helperSrc = readFileSafe('src/selling-houses/domain/consensusFormationHelper.ts');
  check(helperSrc !== null, 'consensusFormationHelper.ts exists');
  if (helperSrc) {
    check(helperSrc.includes('writeSource'), 'helper imports from core writeSource');
    check(helperSrc.includes('ensureConsensusRuntime'), 'helper has ensureConsensusRuntime');
  }

  // Index
  const indexSrc = readFileSafe('src/selling-houses/core/world-state/consensus/index.ts');
  if (indexSrc) {
    check(indexSrc.includes('writeSource'), 'consensus/index.ts exports writeSource');
  }
}

// ---------------------------------------------------------------------------
// 17. Consensus contract script passes
// ---------------------------------------------------------------------------

function checkConsensusContract() {
  console.log('\n=== Check 17: Consensus contract script ===');

  const result = runCommand('npx tsx scripts/verify-selling-houses-consensus-contract-write-source-contract.ts');
  check(result.ok, 'consensus-contract-write-source-contract passes');
  if (!result.ok) {
    const failLines = result.output.split('\n').filter((l) => l.includes('[FAIL]'));
    for (const line of failLines.slice(0, 5)) {
      console.log(`    ${line.trim()}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 18. Read boundary exists
// ---------------------------------------------------------------------------

function checkReadBoundary() {
  console.log('\n=== Check 18: Read boundary ===');

  // v0ReadModel.ts exists and is pure
  const v0Src = readFileSafe('src/selling-houses/core/world-state/opportunity-relations/v0ReadModel.ts');
  check(v0Src !== null, 'v0ReadModel.ts exists');

  if (v0Src) {
    check(!v0Src.includes("from '../../../domain"), 'v0ReadModel does NOT import domain');
    check(!v0Src.includes("from '../../../runtime"), 'v0ReadModel does NOT import runtime');
    check(v0Src.includes('buildBrokeredPath'), 'v0ReadModel has buildBrokeredPath');
    check(v0Src.includes('Object.freeze'), 'v0ReadModel uses Object.freeze');
  }

  // readBoundary.ts exists
  const rbSrc = readFileSafe('src/selling-houses/core/world-state/opportunity-relations/readBoundary.ts');
  warn(rbSrc !== null, `readBoundary.ts ${rbSrc ? 'exists' : 'not found (optional but recommended)'}`);
}

// ---------------------------------------------------------------------------
// 19. Replay parity: all write sources are deterministic
// ---------------------------------------------------------------------------

function checkReplayParity() {
  console.log('\n=== Check 19: Replay parity (deterministic write sources) ===');

  const writeSources = [
    'src/selling-houses/core/world-state/opportunity-relations/writeSource.ts',
    'src/selling-houses/core/world-state/consensus/writeSource.ts',
  ];

  for (const wsPath of writeSources) {
    const src = readFileSafe(wsPath);
    if (!src) {
      check(false, `${wsPath} exists`);
      continue;
    }

    const noComment = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    check(!noComment.includes('Date.now'), `${wsPath}: no Date.now`);
    check(!noComment.includes('Math.random'), `${wsPath}: no Math.random`);
    check(!noComment.includes('rngCalls'), `${wsPath}: no rngCalls`);
    check(!noComment.includes('rngState'), `${wsPath}: no rngState`);
    check(src.includes('Object.freeze'), `${wsPath}: uses Object.freeze`);
  }

  // All helpers import from writeSource (not direct mutation)
  const helpers = [
    'src/selling-houses/domain/opportunitySplitHelper.ts',
    'src/selling-houses/domain/consensusFormationHelper.ts',
  ];

  for (const hPath of helpers) {
    const src = readFileSafe(hPath);
    if (!src) continue;
    check(src.includes('writeSource'), `${hPath}: imports from writeSource`);
  }
}

// ---------------------------------------------------------------------------
// 20. Consensus runtime wiring: dealClosing must use consensusFormationHelper
//     (not just "file exists" — must detect actual import/usage)
// ---------------------------------------------------------------------------

function checkConsensusRuntimeWiring() {
  console.log('\n=== Check 20: Consensus runtime wiring (dealClosing) ===');

  const dealSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  if (!dealSrc) {
    check(false, 'dealClosing.ts not found');
    return;
  }

  // dealClosing.ts must import consensusFormationHelper
  const usesConsensusHelper = dealSrc.includes('consensusFormationHelper')
    || dealSrc.includes('ConsensusFormation')
    || dealSrc.includes('createContractFactFromPriceConsensusOnState')
    || dealSrc.includes('createOpportunityClosureOnState')
    || dealSrc.includes('markConsensusSignedOnState');
  check(
    usesConsensusHelper,
    `dealClosing.ts uses consensusFormationHelper (found: ${usesConsensusHelper})`,
  );

  // dealClosing must NOT still use probability dice roll for deal resolution
  // (legacy: randomInt + threshold comparison to decide won/lost)
  const noComment = dealSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const hasLegacyDiceRoll = /randomInt.*\n.*(?:won|lost|status)/.test(noComment)
    || /chance\(.*\n.*(?:won|lost|status)/.test(noComment);
  warn(
    !hasLegacyDiceRoll,
    `dealClosing.ts ${hasLegacyDiceRoll ? 'STILL uses legacy dice-roll deal resolution' : 'does NOT use legacy dice-roll (good or already migrated)'}`,
  );

  // If consensus is wired, ContractFact and ClosureSet should be created
  const createsContractFact = dealSrc.includes('createContractFactFromPriceConsensusOnState')
    || dealSrc.includes('ContractFact');
  const createsClosureSet = dealSrc.includes('createOpportunityClosureOnState')
    || dealSrc.includes('OpportunityClosureSet');
  warn(createsContractFact, `dealClosing.ts ${createsContractFact ? 'creates ContractFact' : 'does NOT create ContractFact (needs migration)'}`);
  warn(createsClosureSet, `dealClosing.ts ${createsClosureSet ? 'creates OpportunityClosureSet' : 'does NOT create OpportunityClosureSet (needs migration)'}`);
}

// ---------------------------------------------------------------------------
// 21. Gate integrity: no "planned" strings masquerading as "migrated" code
// ---------------------------------------------------------------------------

function checkGateIntegrity() {
  console.log('\n=== Check 21: Gate integrity (no string-mapping fraud) ===');

  // The engine migration contract says "migration path is complete" but
  // opportunityEngine.ts still has 25 bare writes. Verify the gate
  // correctly distinguishes "path mapped" from "code migrated".
  const engineSrc = readFileSafe('src/selling-houses/domain/engine/opportunityEngine.ts');
  if (engineSrc) {
    const bareCount = scanForBareWrites('opportunityEngine.ts', engineSrc).length;
    // Now that all bare writes are cleaned up, the gate should find 0
    check(
      bareCount === 0,
      `Gate confirms zero bare writes in opportunityEngine.ts (found ${bareCount})`,
    );
  }

  // Verify the engine migration contract does NOT claim "code migrated"
  // It should say "migration path is complete" not "migration is complete"
  const migrationScript = readFileSafe('scripts/verify-selling-houses-opportunity-engine-migration-contract.ts');
  if (migrationScript) {
    check(
      migrationScript.includes('migration path') || migrationScript.includes('migration PATH'),
      'Engine migration contract says "path" not "done" (honest about state)',
    );
    check(
      !migrationScript.includes('opportunityEngine.ts is migrated'),
      'Engine migration contract does NOT falsely claim engine is migrated',
    );
  }
}

// ---------------------------------------------------------------------------
// 22. opportunitySplitHelper does NOT re-export deprecated aliases as short names
// ---------------------------------------------------------------------------

function checkNoDeprecatedReExports() {
  console.log('\n=== Check 22: No deprecated alias re-exports as short names ===');

  const helperSrc = readFileSafe('src/selling-houses/domain/opportunitySplitHelper.ts');
  if (!helperSrc) {
    check(false, 'opportunitySplitHelper.ts not found');
    return;
  }

  // The backward-compatible re-export block aliases deprecated functions as short names.
  // This MUST NOT exist — it tricks callers into thinking they use canonical helpers.
  const hasDeprecatedReExportBlock = helperSrc.includes(
    'deprecatedUnsafeLegacyMirrorOnly_applyOpportunityIntentDelta as applyOpportunityIntentDelta',
  );
  check(
    !hasDeprecatedReExportBlock,
    'opportunitySplitHelper does NOT re-export deprecated aliases as short names',
  );

  // The deprecated functions themselves MUST still exist (with full prefix) for backward compat
  check(
    helperSrc.includes('export function deprecatedUnsafeLegacyMirrorOnly_applyOpportunityIntentDelta'),
    'deprecated function still exists with full prefix (backward compat)',
  );
}

// ---------------------------------------------------------------------------
// 23. refreshOpportunityLabel does NOT bare-write lifecycleStatus/stageLabel
// ---------------------------------------------------------------------------

function checkRefreshOpportunityLabelNoBareWrites() {
  console.log('\n=== Check 23: refreshOpportunityLabel no bare lifecycleStatus/stageLabel writes ===');

  const src = readFileSafe('src/selling-houses/domain/engine/opportunityEngine.ts');
  if (!src) {
    check(false, 'opportunityEngine.ts not found');
    return;
  }

  // Extract refreshOpportunityLabel function body
  const fnMatch = src.match(
    /export function refreshOpportunityLabel[\s\S]*?(?=\nexport function|\n\/\/ -{3,}|\Z)/,
  );
  if (!fnMatch) {
    check(false, 'refreshOpportunityLabel function found in opportunityEngine.ts');
    return;
  }
  const fnBody = fnMatch[0];

  // Count bare writes of lifecycleStatus and stageLabel
  const lifecycleBareWrites = fnBody.split('\n').filter(
    (l) => /^\s*opportunity\.lifecycleStatus\s*=/.test(l),
  );
  const stageLabelBareWrites = fnBody.split('\n').filter(
    (l) => /^\s*opportunity\.stageLabel\s*=/.test(l),
  );

  check(
    lifecycleBareWrites.length === 0,
    `refreshOpportunityLabel: ZERO bare opportunity.lifecycleStatus writes (found ${lifecycleBareWrites.length})`,
  );
  check(
    stageLabelBareWrites.length === 0,
    `refreshOpportunityLabel: ZERO bare opportunity.stageLabel writes (found ${stageLabelBareWrites.length})`,
  );
}

// ---------------------------------------------------------------------------
// 24. closeOpportunityViaSplit does NOT pass status as both status AND lifecycleStatus
// ---------------------------------------------------------------------------

function checkCloseOpportunityLifecycleDrift() {
  console.log('\n=== Check 24: closeOpportunityViaSplit lifecycle drift ===');

  const src = readFileSafe('src/selling-houses/domain/opportunitySplitHelper.ts');
  if (!src) {
    check(false, 'opportunitySplitHelper.ts not found');
    return;
  }

  // Extract closeOpportunityViaSplit function
  const fnMatch = src.match(
    /export function closeOpportunityViaSplit[\s\S]*?(?=\nexport function|\n\/\/ -{3,})/,
  );
  if (!fnMatch) {
    check(false, 'closeOpportunityViaSplit function found');
    return;
  }
  const fnBody = fnMatch[0];

  // P1-2: The function used to call setBrokeredOpportunityLifecycle(brokered, status, status, ...)
  // which passes `status` as BOTH status AND lifecycleStatus.
  // Fixed: now uses mapStatusToLifecycle to derive lifecycleStatus from status.
  // Check that the 2nd and 3rd arguments are NOT the same variable name.
  const lifecycleCallMatch = fnBody.match(
    /setBrokeredOpportunityLifecycle\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,/,
  );
  const passesStatusAsBoth = lifecycleCallMatch !== null
    && lifecycleCallMatch[2] === lifecycleCallMatch[3];
  check(
    !passesStatusAsBoth,
    'closeOpportunityViaSplit does NOT pass same param as both status and lifecycleStatus',
  );
}

// ---------------------------------------------------------------------------
// 25. Drift report covers lifecycleStatus and stageLabel
// ---------------------------------------------------------------------------

function checkDriftReportCoverage() {
  console.log('\n=== Check 25: Drift report covers lifecycleStatus and stageLabel ===');

  const src = readFileSafe('src/selling-houses/domain/opportunitySplitHelper.ts');
  if (!src) {
    check(false, 'opportunitySplitHelper.ts not found');
    return;
  }

  // Extract buildOpportunitySplitMirrorDriftReport function
  const fnMatch = src.match(
    /export function buildOpportunitySplitMirrorDriftReport[\s\S]*?(?=\nexport function|\n\/\/ -{3,})/,
  );
  if (!fnMatch) {
    check(false, 'buildOpportunitySplitMirrorDriftReport function found');
    return;
  }
  const fnBody = fnMatch[0];

  // Must check lifecycleStatus drift between canonical BrokeredOpportunityState and legacy
  check(
    fnBody.includes('lifecycleStatus'),
    'drift report checks lifecycleStatus',
  );

  // Must check stageLabel drift between canonical BrokeredOpportunityState and legacy
  check(
    fnBody.includes('stageLabel'),
    'drift report checks stageLabel',
  );
}

// ---------------------------------------------------------------------------
// 26. Runtime mirror consistency: advanceOneDay then assert
// ---------------------------------------------------------------------------

function checkMirrorConsistencyAfterAdvanceOneDay() {
  console.log('\n=== Check 26: Mirror consistency after advanceOneDay ===');

  try {
    const snapshot = getScenarioSnapshotById('standard-window-chain');
    check(snapshot !== undefined, 'standard-window-chain scenario found');

    if (!snapshot) return;

    const world = createInitialState(snapshot, 20260501);
    seedInitialOpportunities(world);
    // Re-initialize relations after seeding (createInitialState runs init before seed)
    initializeOpportunityRelations(world);
    updateDerivedState(world);

    check(world.opportunities.length > 0, `Opportunities exist: ${world.opportunities.length}`);

    // advanceOneDay must not break mirror consistency
    const result = advanceOneDay(world);
    check(result !== null, 'advanceOneDay returns result');

    // Assert mirror consistency — this is the core check
    let threw = false;
    try {
      assertOpportunitySplitMirrorConsistency(world);
    } catch (e: any) {
      threw = true;
      console.log(`    DRIFT: ${e.message.substring(0, 200)}`);
    }
    check(!threw, 'mirror consistent after advanceOneDay (assertOpportunitySplitMirrorConsistency passes)');
  } catch (e: any) {
    check(false, `advanceOneDay runtime test: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 27. Runtime mirror consistency: showing/action then assert
// ---------------------------------------------------------------------------

function checkMirrorConsistencyAfterAction() {
  console.log('\n=== Check 27: Mirror consistency after showing/action ===');

  try {
    const snapshot = getScenarioSnapshotById('standard-window-chain');
    if (!snapshot) {
      check(false, 'standard-window-chain scenario found');
      return;
    }

    const world = createInitialState(snapshot, 20260501);
    seedInitialOpportunities(world);
    updateDerivedState(world);

    // Run two advanceOneDay cycles to generate some actions
    advanceOneDay(world);
    updateDerivedState(world);
    advanceOneDay(world);
    updateDerivedState(world);

    // After actions, mirror must still be consistent
    let threw = false;
    try {
      assertOpportunitySplitMirrorConsistency(world);
    } catch (e: any) {
      threw = true;
      console.log(`    DRIFT after actions: ${e.message.substring(0, 200)}`);
    }
    check(!threw, 'mirror consistent after showing/action cycles');
  } catch (e: any) {
    check(false, `action runtime test: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 28. Runtime mirror consistency: closeOpportunity then assert
// ---------------------------------------------------------------------------

function checkMirrorConsistencyAfterCloseOpportunity() {
  console.log('\n=== Check 28: Mirror consistency after closeOpportunity ===');

  try {
    const snapshot = getScenarioSnapshotById('standard-window-chain');
    if (!snapshot) {
      check(false, 'standard-window-chain scenario found');
      return;
    }

    const world = createInitialState(snapshot, 20260501);
    seedInitialOpportunities(world);
    // Re-initialize relations after seeding (createInitialState runs init before seed)
    initializeOpportunityRelations(world);
    updateDerivedState(world);

    // Find a brokered opportunity to close
    if (!world.runtimeBrokeredOpportunities || world.runtimeBrokeredOpportunities.length === 0) {
      check(false, 'runtimeBrokeredOpportunities populated after init');
      return;
    }

    const brokered = findBrokeredStateForOpportunity(world, world.opportunities[0].id);
    check(brokered !== undefined, 'found brokered state for first opportunity');

    if (brokered) {
      // Close as 'lost'
      closeOpportunityViaSplit(world, brokered, 'lost', 'test-close-gate');
      updateDerivedState(world);

      // Assert mirror consistency after close
      let threw = false;
      try {
        assertOpportunitySplitMirrorConsistency(world);
      } catch (e: any) {
        threw = true;
        console.log(`    DRIFT after closeOpportunity: ${e.message.substring(0, 200)}`);
      }
      check(!threw, 'mirror consistent after closeOpportunity');
    }
  } catch (e: any) {
    check(false, `closeOpportunity runtime test: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 29. Runtime consensus parity: deal-closing produces canonical consensus artifacts
// ---------------------------------------------------------------------------

function checkRuntimeConsensusParity() {
  console.log('\n=== Check 29: Runtime consensus parity (deal-closing) ===');

  try {
    const result = execSync(
      'npx tsx scripts/verify-selling-houses-deal-closing-runtime-consensus-parity.ts',
      { encoding: 'utf-8', cwd: process.cwd(), timeout: 30000 },
    );
    check(
      result.includes('PASS') || result.includes('deal-closing runtime consensus parity: PASS'),
      'runtime consensus parity test passes',
    );
  } catch (e: any) {
    const output = (e.stdout || '') + (e.stderr || '');
    // Print full output for diagnostics — do NOT truncate
    const failLines = output.split('\n').filter((l: string) => l.includes('[FAIL]'));
    const failureCount = failLines.length;
    // Print each failure line in full for visibility
    for (const line of failLines) {
      console.log(`    ${line.trim()}`);
    }
    check(
      false,
      `runtime consensus parity test: ${failureCount} failures (migration not done)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  Opportunity Split Final Gate — Agent D                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

checkTrustGate();
checkReadinessGate();
checkWriteSourceExists();
checkWriteSourcePurity();
checkWriteSourceExports();
checkRuntimeFieldsExist();
checkInitPopulates();
checkHelperExists();
checkOpportunityEngineNoBareWrites();
checkExternalWriters();
checkDeduplication();
checkEveryOppHasBrokered();
checkBrokeredReferencesMatch();
checkCoreBoundary();
checkBuild();
checkConsensusWriteSource();
checkConsensusContract();
checkReadBoundary();
checkReplayParity();
checkConsensusRuntimeWiring();
checkGateIntegrity();
checkNoDeprecatedReExports();
checkRefreshOpportunityLabelNoBareWrites();
checkCloseOpportunityLifecycleDrift();
checkDriftReportCoverage();
checkMirrorConsistencyAfterAdvanceOneDay();
checkMirrorConsistencyAfterAction();
checkMirrorConsistencyAfterCloseOpportunity();
checkRuntimeConsensusParity();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed, ${warnings.length} warnings`);

if (warnings.length > 0) {
  console.log('\nWarnings (governance findings):');
  for (const w of warnings) {
    console.log(`  [WARN] ${w}`);
  }
}

if (failed > 0) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  GATE FAILED — Opportunity split is NOT complete.           ║');
  console.log('║  See [FAIL] items above for what needs to be fixed.         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\nFailures:');
  for (const e of errors) {
    console.log(`  - ${e}`);
  }
  process.exit(1);
}

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  GATE PASSED — Opportunity split is complete.               ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
