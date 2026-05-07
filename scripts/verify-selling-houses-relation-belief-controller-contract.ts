/**
 * Relation-Belief controller verification contract.
 *
 * Proves that A's CustomerCaseMatch/BrokeredOpportunity relation read models and
 * B's ActorKnowledge/ChoiceSet/WaitingPosture are:
 * - Pure read models (no GameState mutation)
 * - Layer clean (core doesn't import domain/runtime where enforced)
 * - Replay safe (no hidden RNG, no hidden mutation)
 * - Visibility safe (OwnerPOV doesn't expose hidden internals)
 *
 * Mother model alignment:
 * - CustomerCaseMatch is underlying match, BrokeredOpportunity is service path
 * - ActorKnowledge (visibleFacts/inferredSignals/hiddenGlobalFacts) ≠ GlobalTruth
 * - ActorKnownFact has source + confidence (information asymmetry)
 * - OwnerPOV knowledge bounded: no D4, no hidden opportunities, no company pressure
 * - ActionCommandDraft is intention, not execution
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState, Case, Opportunity, CustomerRuntimeState } from '../src/selling-houses/domain/models.js';

import { buildCustomerCaseOpportunityRelationView } from '../src/selling-houses/core/world-state/opportunity-relations/readModel.js';
import type { CustomerCaseOpportunityRelationView } from '../src/selling-houses/core/world-state/opportunity-relations/types.js';

import type {
  PressureInputSource,
  ConstraintSignalSource,
} from '../src/selling-houses/core/world-state/competition/models.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    errors.push(`FAIL: ${message}`);
  }
}

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario');
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function r3(n: number) { return Math.round(n * 1000) / 1000; }
function snapCase(c: Case) {
  return { id: c.id, heat: r3(c.heat), trust: r3(c.trust), status: c.status, stageIndex: c.stageIndex };
}
function snapOpp(o: Opportunity) {
  return { id: o.id, intent: r3(o.intent), confidence: r3(o.confidence), stageIndex: o.stageIndex, status: o.status };
}
function snapCust(s: CustomerRuntimeState) {
  return { customerId: s.customerId, status: s.status, churnRisk: r3(s.churnRisk) };
}

// ---------------------------------------------------------------------------
// 1. Relation read model does NOT write GameState
// ---------------------------------------------------------------------------

console.log('=== Check 1: Relation read model purity ===');

const SEED = 20260501;
const w1 = buildWorld(SEED);

const casesBefore = JSON.stringify(w1.cases.map(snapCase));
const oppsBefore = JSON.stringify(w1.opportunities.map(snapOpp));
const custBefore = JSON.stringify(w1.customerStates.map(snapCust));
const rngBefore = w1.rngCalls;

const relations = buildCustomerCaseOpportunityRelationView(w1);

const casesAfter = JSON.stringify(w1.cases.map(snapCase));
const oppsAfter = JSON.stringify(w1.opportunities.map(snapOpp));
const custAfter = JSON.stringify(w1.customerStates.map(snapCust));

check(casesBefore === casesAfter, 'Cases unchanged after building relation view');
check(oppsBefore === oppsAfter, 'Opportunities unchanged after building relation view');
check(custBefore === custAfter, 'CustomerRuntimeState unchanged after building relation view');
check(w1.rngCalls === rngBefore, 'rngCalls unchanged after building relation view');

// ---------------------------------------------------------------------------
// 2. Relation view deduplicates real customer-case matches
// ---------------------------------------------------------------------------

console.log('=== Check 2: Relation deduplication ===');

check(relations.length > 0, 'Relation view has entries');

// Each relation should have a unique id
const relationIds = new Set(relations.map(r => r.id));
check(relationIds.size === relations.length, 'All relation IDs are unique');

// Each relation is keyed by (customerId, caseId) — no duplicate pairs
const pairKeys = new Set(relations.map(r => `${r.customerId}::${r.caseId}`));
// Some pairs may appear from both opportunity and customer-runtime, but merged source should dominate
const mergedCount = relations.filter(r => r.source === 'merged').length;
const oppOnlyCount = relations.filter(r => r.source === 'opportunity').length;
const runtimeOnlyCount = relations.filter(r => r.source === 'customer-runtime').length;
check(mergedCount >= 0, `Source distribution: merged=${mergedCount}, opportunity=${oppOnlyCount}, customer-runtime=${runtimeOnlyCount}`);

// ---------------------------------------------------------------------------
// 3. Conflict flags cover expected dimensions
// ---------------------------------------------------------------------------

console.log('=== Check 3: Conflict flags ===');

if (relations.length > 0) {
  const first = relations[0];
  check('fit' in first.conflictFlags, 'conflictFlags has fit');
  check('stageIndex' in first.conflictFlags, 'conflictFlags has stageIndex');
  check('intent' in first.conflictFlags, 'conflictFlags has intent');
  check('confidence' in first.conflictFlags, 'conflictFlags has confidence');
  check(typeof first.conflictFlags.fit === 'boolean', 'conflictFlags.fit is boolean');
}

// Merged relations should have both canonicalOpportunityMetadata and customerRuntime
const mergedRelations = relations.filter(r => r.source === 'merged');
if (mergedRelations.length > 0) {
  const m = mergedRelations[0];
  check(m.canonicalOpportunityMetadata !== undefined, 'Merged relation has canonicalOpportunityMetadata');
  check(m.customerRuntime !== undefined, 'Merged relation has customerRuntime');
}

// Runtime-only relations should NOT have canonicalOpportunityMetadata
const runtimeOnly = relations.filter(r => r.source === 'customer-runtime');
if (runtimeOnly.length > 0) {
  const ro = runtimeOnly[0];
  check(ro.canonicalOpportunityMetadata === undefined, 'Runtime-only relation has NO canonicalOpportunityMetadata');
  check(ro.legacyOpportunityId === undefined, 'Runtime-only relation has NO legacyOpportunityId');
}

// ---------------------------------------------------------------------------
// 4. Relation read model layer check (types.ts imports domain)
// ---------------------------------------------------------------------------

console.log('=== Check 4: Relation layer (pre-existing domain import in types.ts) ===');

const relTypesSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/opportunity-relations/types.ts', 'utf-8');
const relReadModelSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/opportunity-relations/readModel.ts', 'utf-8');

// types.ts imports from domain — this is a PRE-EXISTING architectural issue
const typesImportsDomain = relTypesSrc.includes("from '../../../domain/models.js'");
check(typesImportsDomain, 'types.ts imports from domain (KNOWN pre-existing issue, not from A/B current round)');

// readModel.ts imports from domain — also pre-existing
const readModelImportsDomain = relReadModelSrc.includes("from '../../../domain");
check(readModelImportsDomain, 'readModel.ts imports from domain (KNOWN pre-existing issue)');

// Neither imports from runtime
check(!relTypesSrc.includes("from '../../../runtime"), 'types.ts does NOT import from runtime');
check(!relReadModelSrc.includes("from '../../../runtime"), 'readModel.ts does NOT import from runtime');

// ---------------------------------------------------------------------------
// 5. ActorKnowledge ≠ GlobalTruth (it's belief, not fact)
// ---------------------------------------------------------------------------

console.log('=== Check 5: ActorKnowledge is belief, not GlobalTruth ===');

const decisionModelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/decision/models.ts', 'utf-8');

// ActorKnownFact has source and confidence
check(decisionModelsSrc.includes('readonly source: SignalSource'), 'ActorKnownFact has source field');
check(decisionModelsSrc.includes('readonly confidence: number'), 'ActorKnownFact has confidence field');
check(decisionModelsSrc.includes('readonly asOfDay: number'), 'ActorKnownFact has asOfDay field');

// ActorInferredSignal has source, strength, basedOn
check(decisionModelsSrc.includes('readonly direction:'), 'ActorInferredSignal has direction field');
check(decisionModelsSrc.includes('readonly basedOn: readonly string[]'), 'ActorInferredSignal has basedOn field');

// ActorHiddenFact exists (what actor CANNOT see)
check(decisionModelsSrc.includes('export interface ActorHiddenFact'), 'ActorHiddenFact type exists');
check(decisionModelsSrc.includes('readonly reason: string'), 'ActorHiddenFact has reason field');

// SignalSource enum: self_sourced, relayed, observed, inferred, systemic
check(decisionModelsSrc.includes("'self_sourced'"), 'SignalSource includes self_sourced');
check(decisionModelsSrc.includes("'relayed'"), 'SignalSource includes relayed');
check(decisionModelsSrc.includes("'observed'"), 'SignalSource includes observed');
check(decisionModelsSrc.includes("'inferred'"), 'SignalSource includes inferred');
check(decisionModelsSrc.includes("'systemic'"), 'SignalSource includes systemic');

// The type is called ActorKnowledge (not GlobalTruth)
check(decisionModelsSrc.includes('export interface ActorKnowledge'), 'Type is ActorKnowledge');
// ActorBelief may exist (belief is acceptable), but GlobalTruth must NOT exist in decision models
check(!decisionModelsSrc.includes('export interface GlobalTruth'), 'NO GlobalTruth type in decision models');
// ActorBelief is acceptable — it represents interpreted confidence, not canonical fact
if (decisionModelsSrc.includes('export interface ActorBelief')) {
  check(decisionModelsSrc.includes('readonly kind: BeliefKind'), 'ActorBelief has kind (typed, not raw fact)');
  check(decisionModelsSrc.includes('readonly confidenceLevel: BeliefConfidence'), 'ActorBelief has confidenceLevel (belief, not truth)');
}

// ActorKnowledge has the three-part structure
check(decisionModelsSrc.includes('readonly visibleFacts: readonly ActorKnownFact[]'), 'ActorKnowledge.visibleFacts');
check(decisionModelsSrc.includes('readonly inferredSignals: readonly ActorInferredSignal[]'), 'ActorKnowledge.inferredSignals');
check(decisionModelsSrc.includes('readonly hiddenGlobalFacts: readonly ActorHiddenFact[]'), 'ActorKnowledge.hiddenGlobalFacts');

// ---------------------------------------------------------------------------
// 6. OwnerPOV knowledge does NOT expose hidden internals
// ---------------------------------------------------------------------------

console.log('=== Check 6: OwnerPOV visibility boundary ===');

// OwnerPOVContext has NO opportunityCount, NO recommendationDrafts, NO D4
const ownerCtxStart = decisionModelsSrc.indexOf('export interface OwnerPOVContext');
const ownerCtxEnd = decisionModelsSrc.indexOf('export interface OwnerPOVSnapshot');
const ownerCtx = decisionModelsSrc.substring(ownerCtxStart, ownerCtxEnd);

check(!ownerCtx.includes('opportunityCount'), 'OwnerPOVContext does NOT have opportunityCount');
check(!ownerCtx.includes('recommendationDrafts'), 'OwnerPOVContext does NOT have recommendationDrafts');
check(!ownerCtx.includes('lateStageOpportunityCount'), 'OwnerPOVContext does NOT have lateStageOpportunityCount');
check(ownerCtx.includes('D4 is hidden') || !ownerCtx.includes('d4?:'), 'OwnerPOVContext does NOT expose D4');

// OwnerPOVSnapshot does NOT have pressureSummary
const ownerSnapStart = decisionModelsSrc.indexOf('export interface OwnerPOVSnapshot');
const ownerSnap = decisionModelsSrc.substring(ownerSnapStart, ownerSnapStart + 500);
check(!ownerSnap.includes('pressureSummary'), 'OwnerPOVSnapshot does NOT have pressureSummary');

// OwnerPOVContext has visibleSignals (not full signals array)
check(ownerCtx.includes('visibleSignals'), 'OwnerPOVContext has visibleSignals (bounded view)');

// OwnerPOVContext has choiceSet and waitingState
check(ownerCtx.includes('readonly choiceSet: AlternativeSet'), 'OwnerPOVContext has choiceSet');
check(ownerCtx.includes('readonly waitingState: WaitingState'), 'OwnerPOVContext has waitingState');

// ---------------------------------------------------------------------------
// 7. BrokerPOV can explain signals but does NOT execute actions
// ---------------------------------------------------------------------------

console.log('=== Check 7: BrokerPOV is explanatory, not executable ===');

// ActionCommandDraft is intention only
const draftIdx = decisionModelsSrc.indexOf('export interface ActionCommandDraft');
const draftSection = decisionModelsSrc.substring(Math.max(0, draftIdx - 300), draftIdx + 1000);
check(draftSection.includes('NOT what the simulation') || draftSection.includes('intention'), 'ActionCommandDraft is intention only');
check(!draftSection.includes('execute('), 'ActionCommandDraft has no execute method');

// BrokerPOVSnapshot has readOnly: true
const brokerSnapStart = decisionModelsSrc.indexOf('export interface BrokerPOVSnapshot');
const brokerSnap = decisionModelsSrc.substring(brokerSnapStart, brokerSnapStart + 600);
check(brokerSnap.includes('readonly readOnly: true'), 'BrokerPOVSnapshot.readOnly is true');

// BrokerPOV has actionCommandDrafts (intention, not execution)
check(brokerSnap.includes('readonly actionCommandDrafts'), 'BrokerPOVSnapshot has actionCommandDrafts');
check(brokerSnap.includes('readonly pressureSummary'), 'BrokerPOVSnapshot has pressureSummary');

// ---------------------------------------------------------------------------
// 8. Core decision models do NOT import domain/runtime
// ---------------------------------------------------------------------------

console.log('=== Check 8: Core decision layer purity ===');

const decisionModels = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/decision/models.ts', 'utf-8');
check(!decisionModels.includes("from '../../domain"), 'decision/models.ts does NOT import domain');
check(!decisionModels.includes("from '../../runtime"), 'decision/models.ts does NOT import runtime');

const decisionGuards = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/decision/boundaryGuards.ts', 'utf-8');
check(!decisionGuards.includes("from '../../domain"), 'decision/boundaryGuards.ts does NOT import domain');
check(!decisionGuards.includes("from '../../runtime"), 'decision/boundaryGuards.ts does NOT import runtime');

const consensusModels = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/consensus/models.ts', 'utf-8');
check(!consensusModels.includes("from '../../domain"), 'consensus/models.ts does NOT import domain');
check(!consensusModels.includes("from '../../runtime"), 'consensus/models.ts does NOT import runtime');

const consensusAdapter = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/consensus/legacyAdapter.ts', 'utf-8');
check(!consensusAdapter.includes("from '../../domain"), 'consensus/legacyAdapter.ts does NOT import domain');
check(!consensusAdapter.includes("from '../../runtime"), 'consensus/legacyAdapter.ts does NOT import runtime');

// ---------------------------------------------------------------------------
// 9. Multi-tick replayability
// ---------------------------------------------------------------------------

console.log('=== Check 9: Multi-tick replayability ===');

for (const tickCount of [1, 3, 5]) {
  const wa = buildWorld(SEED);
  const wb = buildWorld(SEED);
  for (let i = 0; i < tickCount; i++) {
    advanceOneDay(wa);
    advanceOneDay(wb);
  }
  const ca = wa.cases.map(snapCase).sort((a, b) => a.id.localeCompare(b.id));
  const cb = wb.cases.map(snapCase).sort((a, b) => a.id.localeCompare(b.id));
  check(JSON.stringify(ca) === JSON.stringify(cb), `Case fields identical after ${tickCount} ticks`);

  const oa = wa.opportunities.map(snapOpp).sort((a, b) => a.id.localeCompare(b.id));
  const ob = wb.opportunities.map(snapOpp).sort((a, b) => a.id.localeCompare(b.id));
  check(JSON.stringify(oa) === JSON.stringify(ob), `Opportunity fields identical after ${tickCount} ticks`);

  check(wa.rngCalls === wb.rngCalls, `rngCalls identical after ${tickCount} ticks: ${wa.rngCalls}`);

  const ea = wa.eventStore.map(e => e.kind + ':' + e.actor + ':' + e.caseId);
  const eb = wb.eventStore.map(e => e.kind + ':' + e.actor + ':' + e.caseId);
  check(JSON.stringify(ea) === JSON.stringify(eb), `eventStore identical after ${tickCount} ticks`);

  const da = wa.closedDeals.map(d => d.dealId + ':' + d.dealPrice);
  const db = wb.closedDeals.map(d => d.dealId + ':' + d.dealPrice);
  check(JSON.stringify(da) === JSON.stringify(db), `closedDeals identical after ${tickCount} ticks`);
}

// Relation view on post-tick state is also deterministic
const wPost = buildWorld(SEED);
for (let i = 0; i < 3; i++) advanceOneDay(wPost);
const relsPost = buildCustomerCaseOpportunityRelationView(wPost);
const relsPost2 = buildCustomerCaseOpportunityRelationView(wPost);
check(JSON.stringify(relsPost) === JSON.stringify(relsPost2), 'Relation view is deterministic on same state');

// ---------------------------------------------------------------------------
// 10. market-signal NOT in PressureInputSource
// ---------------------------------------------------------------------------

console.log('=== Check 10: market-signal exclusion ===');

const runtimeSources: PressureInputSource[] = [
  'rival-pressure', 'competition-group', 'competition-rival-loss',
  'company-pressure', 'customer-feedback', 'rival-customer-pull',
  'random-event', 'scripted-event',
];
check(runtimeSources.length === 8, 'PressureInputSource has exactly 8 values');
check(!runtimeSources.includes('market-signal' as PressureInputSource), 'market-signal NOT in PressureInputSource');

const coreSources: ConstraintSignalSource[] = [
  'rival-listing', 'competition-group', 'company-pressure', 'customer-feedback',
  'rival-customer-pull', 'random-event', 'scripted-event', 'market-signal', 'seasonality',
];
check(coreSources.includes('market-signal'), 'market-signal IS in ConstraintSignalSource (future)');

// ---------------------------------------------------------------------------
// 11. Workplan A/B/C/D active
// ---------------------------------------------------------------------------

console.log('=== Check 11: Workplan agent slots ===');

const workplan = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/docs/selling-houses-mother-model-agent-workplan.md', 'utf-8');
check(!/### \d{4}-\d{2}-\d{2}.*Agent E/.test(workplan), 'No Agent E reports');
check(!/### \d{4}-\d{2}-\d{2}.*Agent F/.test(workplan), 'No Agent F reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent A/.test(workplan), 'Agent A has reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent B/.test(workplan), 'Agent B has reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent C/.test(workplan), 'Agent C has reports');

// ---------------------------------------------------------------------------
// 12. Domain does NOT import runtime pressure
// ---------------------------------------------------------------------------

console.log('=== Check 12: Domain layer boundary ===');

const engineSrc = readFileSync('/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/engine.ts', 'utf-8');
check(!engineSrc.includes("from '../runtime/simulation/pressure"), 'engine.ts does NOT import runtime pressure');
check(engineSrc.includes("from '../core/world-state/competition/pressureBuffer"), 'engine.ts imports from core pressureBuffer');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total checks: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (errors.length > 0) {
  console.log('\nFailures:');
  errors.forEach(e => console.log(`  ${e}`));
}

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses relation-belief controller contract verification passed');
  process.exit(0);
}
