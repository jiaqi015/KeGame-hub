/**
 * Dashboard Daily Operating Loop Contract.
 *
 * Proves the dashboard layer:
 * 1. DailySummaryOverlay receives DailyTickResult (not raw GameState)
 * 2. Overlay reads from tickResult fields (not state.cases/opportunities)
 * 3. Overlay does not import GameState
 * 4. No raw GameState keys in overlay source
 * 5. No Date.now/Math.random/fetch in overlay
 * 6. Overlay handles null/undefined tickResult gracefully
 * 7. DailyTickReceipt workspace projection exists and is read-only
 * 8. No action execution in overlay (display only)
 */

import { readFileSync } from 'node:fs';

const ROOT = '/Users/jiaqi/Documents/开放日测算/src/selling-houses';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// ---------------------------------------------------------------------------
// 1. DailySummaryOverlay receives DailyTickResult
// ---------------------------------------------------------------------------

console.log('=== Check 1: Overlay receives DailyTickResult ===');

const overlaySrc = readFileSync(
  `${ROOT}/ui/features/DailySummaryOverlay.tsx`, 'utf-8');
const overlayCode = stripComments(overlaySrc);

check(overlaySrc.includes('tickResult?: DailyTickResult'), 'overlay: receives DailyTickResult prop');
check(overlaySrc.includes('import type { DailyReport, DailyTickResult, TickInvariantAlert }'),
  'overlay: imports DailyTickResult type');

console.log('  Overlay receives DailyTickResult: PASS');

// ---------------------------------------------------------------------------
// 2. Overlay reads from tickResult fields
// ---------------------------------------------------------------------------

console.log('=== Check 2: Overlay reads from tickResult ===');

check(overlayCode.includes('tickResult?.invariantAlerts'), 'overlay: reads invariantAlerts');
check(overlayCode.includes('buildImpactRows(tickResult)'), 'overlay: passes tickResult to buildImpactRows');
check(overlayCode.includes('function buildImpactRows(tickResult'), 'overlay: buildImpactRows reads tickResult');

// Check what fields buildImpactRows reads (accessed directly, not with ?.)
check(overlayCode.includes('tickResult.emittedEvents') || overlayCode.includes('tickResult?.emittedEvents'),
  'overlay: reads emittedEvents');
check(overlayCode.includes('tickResult.closedDeals') || overlayCode.includes('tickResult?.closedDeals'),
  'overlay: reads closedDeals');
check(overlayCode.includes('tickResult.dirtyScopes') || overlayCode.includes('tickResult?.dirtyScopes'),
  'overlay: reads dirtyScopes');

console.log('  Overlay reads from tickResult: PASS');

// ---------------------------------------------------------------------------
// 3. Overlay does not import GameState
// ---------------------------------------------------------------------------

console.log('=== Check 3: No GameState import ===');

check(!overlayCode.includes('GameState'), 'overlay: no GameState reference');

console.log('  No GameState import: PASS');

// ---------------------------------------------------------------------------
// 4. No raw GameState keys in overlay
// ---------------------------------------------------------------------------

console.log('=== Check 4: No raw GameState keys ===');

check(!overlayCode.includes('state.cases'), 'overlay: no state.cases');
check(!overlayCode.includes('state.opportunities'), 'overlay: no state.opportunities');
check(!overlayCode.includes('state.customers'), 'overlay: no state.customers');
check(!overlayCode.includes('state.eventStore'), 'overlay: no state.eventStore');
check(!overlayCode.includes('state.rngState'), 'overlay: no state.rngState');

console.log('  No raw GameState keys: PASS');

// ---------------------------------------------------------------------------
// 5. No side effects in overlay
// ---------------------------------------------------------------------------

console.log('=== Check 5: No side effects ===');

check(!overlayCode.includes('Date.now'), 'overlay: no Date.now');
check(!overlayCode.includes('Math.random'), 'overlay: no Math.random');
check(!overlayCode.includes('fetch('), 'overlay: no fetch');

console.log('  No side effects: PASS');

// ---------------------------------------------------------------------------
// 6. Overlay handles null tickResult
// ---------------------------------------------------------------------------

console.log('=== Check 6: Null safety ===');

check(overlayCode.includes('tickResult?.invariantAlerts || []'), 'overlay: null-safe invariantAlerts');
check(overlayCode.includes('tickResult?: DailyTickResult | null'), 'overlay: tickResult is optional');

console.log('  Null safety: PASS');

// ---------------------------------------------------------------------------
// 7. DailyTickReceipt workspace projection
// ---------------------------------------------------------------------------

console.log('=== Check 7: DailyTickReceipt projection ===');

const receiptBoundarySrc = readFileSync(
  `${ROOT}/interface/interaction-workspace/dailyTickReceiptBoundary.ts`, 'utf-8');
check(receiptBoundarySrc.includes('DailyTickReceiptWorkspaceProjection'), 'has DailyTickReceiptWorkspaceProjection');
check(receiptBoundarySrc.includes('buildDailyTickReceiptWorkspaceProjection'), 'has builder');
check(receiptBoundarySrc.includes('readonly'), 'uses readonly pattern');
check(receiptBoundarySrc.includes('buildLastDailyTickReceiptFromState'), 'reads from state');

console.log('  DailyTickReceipt projection: PASS');

// ---------------------------------------------------------------------------
// 8. No action execution in overlay
// ---------------------------------------------------------------------------

console.log('=== Check 8: Display only ===');

check(!overlayCode.includes('executeAction'), 'overlay: no executeAction');
check(!overlayCode.includes('resolveActionDefinition'), 'overlay: no resolveActionDefinition');
check(!overlayCode.includes('advanceOneDay'), 'overlay: no advanceOneDay');
check(!overlayCode.includes('setState'), 'overlay: no setState (receives data as props)');

// The overlay only calls onContinue (display-only callback)
check(overlayCode.includes('onContinue'), 'overlay: only calls onContinue callback');

console.log('  Display only: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Dashboard Daily Operating Loop Contract ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\ndashboard daily-operating-loop contract passed');
  process.exit(0);
}
