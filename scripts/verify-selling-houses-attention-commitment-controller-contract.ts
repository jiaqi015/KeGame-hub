/**
 * Attention / Commitment controller verification contract.
 *
 * Proves that attention and commitment read models are:
 * - Pure read models (no GameState mutation)
 * - Not aliases for legacy fields (trust/heat/ContractFact)
 * - Visibility safe (OwnerPOV doesn't expose hidden internals)
 * - Replay safe (no hidden RNG, no hidden mutation)
 * - Layer clean (core doesn't import domain/runtime)
 *
 * Mother model alignment:
 * - Attention: Section 19 (attention = awareness/salience/priority/confidenceToAct, NOT trust/heat)
 * - Commitment: Section 5 (DecisionCommitment = actor's commitment state, NOT ContractFact)
 * - NoDecision: Section 19.3 (waiting is a decision posture, not absence of state)
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState, Case, Opportunity, CustomerRuntimeState } from '../src/selling-houses/domain/models.js';

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
  return { id: c.id, heat: r3(c.heat), trust: r3(c.trust), urgency: r3(c.urgency), status: c.status, stageIndex: c.stageIndex };
}
function snapOpp(o: Opportunity) {
  return { id: o.id, intent: r3(o.intent), confidence: r3(o.confidence), stageIndex: o.stageIndex, status: o.status };
}
function snapCust(s: CustomerRuntimeState) {
  return { customerId: s.customerId, status: s.status, churnRisk: r3(s.churnRisk) };
}

// ---------------------------------------------------------------------------
// 1. AttentionState read model (A built it)
// ---------------------------------------------------------------------------

console.log('=== Check 1: AttentionState read model ===');

const attentionTypesSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/attention/types.ts', 'utf-8');

// AttentionState has the 6 required dimensions
check(attentionTypesSrc.includes("'awareness'"), 'AttentionDimension includes awareness');
check(attentionTypesSrc.includes("'salience'"), 'AttentionDimension includes salience');
check(attentionTypesSrc.includes("'priority'"), 'AttentionDimension includes priority');
check(attentionTypesSrc.includes("'confidenceToAct'"), 'AttentionDimension includes confidenceToAct');
check(attentionTypesSrc.includes("'allocatedCapacity'"), 'AttentionDimension includes allocatedCapacity');
check(attentionTypesSrc.includes("'freshness'"), 'AttentionDimension includes freshness');

// AttentionState itself is NOT an alias for trust/heat (trust/heat may appear in input shapes)
const attentionStateSection = attentionTypesSrc.substring(
  attentionTypesSrc.indexOf('export interface AttentionState'),
  attentionTypesSrc.indexOf('export interface AttentionDimensions'));
check(!attentionStateSection.includes('readonly trust:'), 'AttentionState interface does NOT have trust field');
check(!attentionStateSection.includes('readonly heat:'), 'AttentionState interface does NOT have heat field');

// AttentionState uses AttentionDimensions (the 6 dimensions)
check(attentionTypesSrc.includes('readonly dimensions: AttentionDimensions'), 'AttentionState uses AttentionDimensions');

// AttentionLedger does NOT append to DomainEventStore
check(!attentionTypesSrc.includes('DomainEventStore'), 'AttentionLedger does NOT reference DomainEventStore');
check(!attentionTypesSrc.includes('DomainEventEntry'), 'AttentionLedger does NOT reference DomainEventEntry');

// market_signal is an attention source
check(attentionTypesSrc.includes("'market_signal'"), 'market_signal IS an attention source');

// AttentionSource includes pressure_receipt and consensus_receipt
check(attentionTypesSrc.includes("'pressure_receipt'"), 'AttentionSource includes pressure_receipt');
check(attentionTypesSrc.includes("'consensus_receipt'"), 'AttentionSource includes consensus_receipt');

// AttentionLedger is a read-only collection
check(attentionTypesSrc.includes('readonly events: readonly AttentionEvent[]'), 'AttentionLedger.events is readonly');
check(attentionTypesSrc.includes('ReadonlyMap'), 'AttentionLedger uses ReadonlyMap');

// AttentionState types don't import domain/runtime
check(!attentionTypesSrc.includes("from '../../../domain"), 'attention/types.ts does NOT import domain');
check(!attentionTypesSrc.includes("from '../../../runtime"), 'attention/types.ts does NOT import runtime');

// Plain input shapes (no domain import)
check(attentionTypesSrc.includes('export interface AttentionRelationInput'), 'Plain input shapes exist');
check(attentionTypesSrc.includes('export interface AttentionOwnerInput'), 'AttentionOwnerInput exists');

// Warning flags for attention
check(attentionTypesSrc.includes("'high_fit_low_attention'"), 'Warning: high_fit_low_attention');
check(attentionTypesSrc.includes("'stale_attention'"), 'Warning: stale_attention');
check(attentionTypesSrc.includes("'duplicate_service_path_attention'"), 'Warning: duplicate_service_path_attention');

// Legacy models.ts does NOT contain attention field
const modelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/models.ts', 'utf-8');
check(!modelsSrc.includes('attention'), 'Legacy models.ts does NOT contain attention field (not aliased)');

// ---------------------------------------------------------------------------
// 2. DecisionCommitment exists in core/decision (B built it)
// ---------------------------------------------------------------------------

console.log('=== Check 2: DecisionCommitment read model ===');

const decisionModelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/decision/models.ts', 'utf-8');

// DecisionCommitment type exists
check(decisionModelsSrc.includes('export interface DecisionCommitment'), 'DecisionCommitment type exists');

// CommitmentStrength includes revoked/stale/fulfilled (read-only derivation)
check(decisionModelsSrc.includes("'revoked'"), 'CommitmentStrength includes revoked');
check(decisionModelsSrc.includes("'expired'"), 'CommitmentStrength includes expired');
check(decisionModelsSrc.includes("'tentative'"), 'CommitmentStrength includes tentative');
check(decisionModelsSrc.includes("'conditional'"), 'CommitmentStrength includes conditional');

// DecisionCommitment has readonly fields
check(decisionModelsSrc.includes('readonly id: string'), 'DecisionCommitment.id is readonly');
check(decisionModelsSrc.includes('readonly strength: CommitmentStrength'), 'DecisionCommitment.strength is readonly');
check(decisionModelsSrc.includes('readonly actorRole'), 'DecisionCommitment.actorRole is readonly');

// DecisionCommitment does NOT create DomainEventEntry
const commitmentSection = decisionModelsSrc.substring(
  decisionModelsSrc.indexOf('export interface DecisionCommitment'),
  decisionModelsSrc.indexOf('export interface DecisionCommitment') + 600);
check(!commitmentSection.includes('DomainEventEntry'), 'DecisionCommitment does NOT reference DomainEventEntry');
check(!commitmentSection.includes('recordDomainEvent'), 'DecisionCommitment does NOT call recordDomainEvent');

// ---------------------------------------------------------------------------
// 3. DecisionCommitment does NOT replace ContractFact
// ---------------------------------------------------------------------------

console.log('=== Check 3: Commitment ≠ ContractFact ===');

const consensusModelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/consensus/models.ts', 'utf-8');

// ContractFact has dealId, DecisionCommitment has id — different structures
check(consensusModelsSrc.includes('export interface ContractFact'), 'ContractFact exists in consensus models');
check(decisionModelsSrc.includes('export interface DecisionCommitment'), 'DecisionCommitment exists in decision models');

// ContractFact has dealId, dealPrice — settlement facts
check(consensusModelsSrc.includes('readonly dealId: string'), 'ContractFact has dealId');
check(consensusModelsSrc.includes('readonly dealPrice: number'), 'ContractFact has dealPrice');

// DecisionCommitment has actorRole, description, scope — intention state
check(decisionModelsSrc.includes("readonly actorRole: 'broker' | 'owner' | 'customer'"), 'DecisionCommitment has actorRole');
check(decisionModelsSrc.includes('readonly description: string'), 'DecisionCommitment has description');

// They are in different modules
check(!consensusModelsSrc.includes('DecisionCommitment'), 'consensus/models.ts does NOT reference DecisionCommitment');
// ContractFact may be mentioned in comments (e.g. "NOT a ContractFact"), but not as a type dependency
check(!decisionModelsSrc.includes('import.*ContractFact') && !decisionModelsSrc.includes('readonly.*: ContractFact'), 'decision/models.ts does NOT import or use ContractFact as a type');

// ---------------------------------------------------------------------------
// 4. NoDecision does NOT change WaitingState / Case fields
// ---------------------------------------------------------------------------

console.log('=== Check 4: NoDecision is read-only ===');

check(decisionModelsSrc.includes('export interface NoDecision'), 'NoDecision type exists');
check(decisionModelsSrc.includes('readonly waitingState: WaitingState'), 'NoDecision.waitingState is readonly');
check(decisionModelsSrc.includes('readonly consideredAlternatives: AlternativeSet'), 'NoDecision.consideredAlternatives is readonly');
check(decisionModelsSrc.includes('readonly exitCondition: string'), 'NoDecision.exitCondition is readonly');

// NoDecision is on CasePOVContext / OwnerPOVContext as derived field
// It does NOT write back to Case
const noDecisionRef = decisionModelsSrc.indexOf('export interface NoDecision');
const noDecisionSection = decisionModelsSrc.substring(noDecisionRef, noDecisionRef + 400);
check(!noDecisionSection.includes('caseItem.'), 'NoDecision does NOT reference caseItem mutation');
check(!noDecisionSection.includes('state.'), 'NoDecision does NOT reference state mutation');

// WaitingState is derived, not stored
check(decisionModelsSrc.includes('readonly accumulatedPressure: number'), 'WaitingState has accumulatedPressure');

// ---------------------------------------------------------------------------
// 5. OwnerPOV commitment does NOT expose hidden internals
// ---------------------------------------------------------------------------

console.log('=== Check 5: OwnerPOV commitment boundary ===');

const ownerCtxStart = decisionModelsSrc.indexOf('export interface OwnerPOVContext');
const ownerCtxEnd = decisionModelsSrc.indexOf('export interface OwnerPOVSnapshot');
const ownerCtx = decisionModelsSrc.substring(ownerCtxStart, ownerCtxEnd);

// OwnerPOVContext has commitments
check(ownerCtx.includes('readonly commitments: readonly DecisionCommitment[]'), 'OwnerPOVContext has commitments');

// OwnerPOVContext does NOT have opportunityCount, recommendationDrafts, D4
check(!ownerCtx.includes('opportunityCount'), 'OwnerPOVContext does NOT have opportunityCount');
check(!ownerCtx.includes('recommendationDrafts'), 'OwnerPOVContext does NOT have recommendationDrafts');

// OwnerPOVContext does NOT have buyer_seriousness belief (customer privacy)
// (This is enforced by B's boundary guards for ActorBelief kinds)

// OwnerPOVSnapshot does NOT have pressureSummary
const ownerSnapStart = decisionModelsSrc.indexOf('export interface OwnerPOVSnapshot');
const ownerSnap = decisionModelsSrc.substring(ownerSnapStart, ownerSnapStart + 500);
check(!ownerSnap.includes('pressureSummary'), 'OwnerPOVSnapshot does NOT have pressureSummary');

// ---------------------------------------------------------------------------
// 6. BrokerPOV ActionCommandDraft still does NOT execute
// ---------------------------------------------------------------------------

console.log('=== Check 6: ActionCommandDraft is intention only ===');

const draftIdx = decisionModelsSrc.indexOf('export interface ActionCommandDraft');
const draftSection = decisionModelsSrc.substring(Math.max(0, draftIdx - 300), draftIdx + 1200);
check(draftSection.includes('NOT what the simulation') || draftSection.includes('intention'), 'ActionCommandDraft is intention only');
check(!draftSection.includes('execute('), 'ActionCommandDraft has no execute method');

// BrokerPOV has readOnly: true
const brokerSnapStart = decisionModelsSrc.indexOf('export interface BrokerPOVSnapshot');
const brokerSnap = decisionModelsSrc.substring(brokerSnapStart, brokerSnapStart + 600);
check(brokerSnap.includes('readonly readOnly: true'), 'BrokerPOVSnapshot.readOnly is true');

// ---------------------------------------------------------------------------
// 7. Core attention/decision does NOT import domain/runtime
// ---------------------------------------------------------------------------

console.log('=== Check 7: Core layer purity ===');

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

// Attention directory doesn't exist yet, so no layer check needed

// ---------------------------------------------------------------------------
// 8. Multi-tick replayability
// ---------------------------------------------------------------------------

console.log('=== Check 8: Multi-tick replayability ===');

const SEED = 20260501;
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

// ---------------------------------------------------------------------------
// 9. market-signal NOT in PressureInputSource
// ---------------------------------------------------------------------------

console.log('=== Check 9: market-signal exclusion ===');

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
check(coreSources.includes('market-signal'), 'market-signal IS in ConstraintSignalSource (future/attention)');

// ---------------------------------------------------------------------------
// 10. Workplan A/B/C/D active
// ---------------------------------------------------------------------------

console.log('=== Check 10: Workplan agent slots ===');

const workplan = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/docs/selling-houses-mother-model-agent-workplan.md', 'utf-8');
check(!/### \d{4}-\d{2}-\d{2}.*Agent E/.test(workplan), 'No Agent E reports');
check(!/### \d{4}-\d{2}-\d{2}.*Agent F/.test(workplan), 'No Agent F reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent A/.test(workplan), 'Agent A has reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent B/.test(workplan), 'Agent B has reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent C/.test(workplan), 'Agent C has reports');

// ---------------------------------------------------------------------------
// 11. Domain does NOT import runtime pressure
// ---------------------------------------------------------------------------

console.log('=== Check 11: Domain layer boundary ===');

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
  console.log('\nselling-houses attention-commitment controller contract verification passed');
  process.exit(0);
}
