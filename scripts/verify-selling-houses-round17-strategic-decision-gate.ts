/**
 * Round 17 — Strategic Decision Gate
 *
 * Proves product decisions consume belief/pressure/live causal refs and expose
 * resource cost, opportunity cost, competitor risk, and time horizon impact.
 *
 * Usage: npx tsx scripts/verify-selling-houses-round17-strategic-decision-gate.ts
 */

import {
  ROUND17_SEED,
  advanceMarketEconomyWorld,
  buildMarketEconomyWorld,
  buildStrategicProjectionFromState,
  buildKnowledgeMapFromState,
  readSrc,
} from './verify-selling-houses-round17-market-economy-gate-core.js';
import { buildStrategicMarketDecisionProjection } from '../src/selling-houses/application/projections/strategicMarketDecisionProjection.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${message}`);
  } else {
    failed += 1;
    failures.push(message);
    console.error(`  ❌ ${message}`);
  }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Round 17 — Strategic Decision Gate                             ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

section('1. STRATEGIC PROJECTION — 7/14/30 day horizons');
for (const horizon of [7, 14, 30]) {
  const state = advanceMarketEconomyWorld(horizon, ROUND17_SEED);
  const strategic = buildStrategicProjectionFromState(state);
  const activeShadowRivalCount = state.marketShadow.rivalListings.filter((rivalListing) => rivalListing.status === 'active').length;

  check(strategic.brokerOpportunity.topActions.length > 0, `${horizon}d topActions > 0 (${strategic.brokerOpportunity.topActions.length})`);
  check(strategic.sharedCausalRefs !== undefined, `${horizon}d sharedCausalRefs exists`);
  check(strategic.competitivePressure.activeRivalCount > 0, `${horizon}d competitor pressure > 0 (${strategic.competitivePressure.activeRivalCount}, shadow=${activeShadowRivalCount})`);
  check(strategic.competitivePressure.topRivalAction !== null, `${horizon}d top rival action/evidence exists`);

  for (const action of strategic.brokerOpportunity.topActions) {
    check(action.safeRefs.length > 0, `${horizon}d action "${action.actionLabel}" has safeRefs`);
    check(action.sourceRecordIds.length > 0, `${horizon}d action "${action.actionLabel}" has sourceRecordIds`);
    check(action.replayKey.length > 0, `${horizon}d action "${action.actionLabel}" has replayKey`);
    check(action.confidence > 0, `${horizon}d action "${action.actionLabel}" has confidence`);
    check(action.resourceCost.energyCost >= 0 && action.resourceCost.budgetCost >= 0, `${horizon}d action has resourceCost`);
    check(action.opportunityCost.foregoneAction !== '无替代方案', `${horizon}d action has real opportunity cost`);
    check(action.opportunityCost.foregoneConfidence > 0, `${horizon}d opportunity cost has confidence`);
    check(action.competitorRisk.rivalCount > 0, `${horizon}d competitor risk has rival count`);
    check(action.competitorRisk.riskMagnitude > 0, `${horizon}d competitor risk has magnitude`);
    check(action.timeHorizonImpact.length === 4, `${horizon}d time horizon impact has 3/7/14/30`);
    check(action.timeHorizonImpact.every((impact) => impact.safeRefs.length > 0), `${horizon}d all horizon impacts have safeRefs`);
  }
}

section('2. EMPTY KNOWLEDGE — no legacy bypass');
const emptyState = buildMarketEconomyWorld(ROUND17_SEED);
const emptyStrategic = buildStrategicMarketDecisionProjection(emptyState);
check(emptyStrategic.brokerOpportunity.topActions.length === 0, 'empty knowledge → no strategic topActions');
check(emptyStrategic.sharedCausalRefs === undefined, 'empty knowledge → no sharedCausalRefs');

section('3. SOURCE CODE BOUNDARIES — no hidden truth and no fake core randomness');
const strategicSrc = readSrc('src/selling-houses/application/projections/strategicMarketDecisionProjection.ts');
const actorKnowledgeSrc = readSrc('src/selling-houses/application/projections/actorKnowledgeProjection.ts');
check(!strategicSrc.includes('queryHiddenSourceRecords'), 'strategic projection does not query hidden source records');
check(!actorKnowledgeSrc.includes('queryHiddenSourceRecords'), 'actorKnowledge projection does not query hidden source records');
check(!strategicSrc.includes('Math.random'), 'strategic projection has no Math.random');
check(!strategicSrc.includes('Date.now'), 'strategic projection has no Date.now');

section('4. WIRING — workspace consumes strategic projection');
const workspaceSrc = readSrc('src/selling-houses/application/projections/workspaceShellProjection.ts');
check(workspaceSrc.includes('buildStrategicMarketDecisionProjection(state, actorKnowledgeMap)'), 'workspace shell wires strategicDecision projection');

section('5. SELF-AUDIT — no soft pass patterns');
const gateSrc = readSrc('scripts/verify-selling-houses-round17-strategic-decision-gate.ts');
const auditStart = gateSrc.indexOf("section('5. SELF-AUDIT");
const gateSrcCore = auditStart > 0 ? gateSrc.slice(0, auditStart) : gateSrc;
const gateSrcNoComments = gateSrcCore
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
check(!gateSrcNoComments.includes('|| true'), 'gate source has no || true');
check(!gateSrcNoComments.match(/check\(\s*true\s*,/), 'gate source has no check(true, ...)');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 17 Strategic Gate Passed: ${passed} | Failed: ${failed}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\n  ❌ GATE FAILED:');
  for (const failure of failures) console.error(`    • ${failure}`);
  process.exit(1);
}

console.log('\n  ✅ GATE PASSED — strategic decisions are evidence-backed');
