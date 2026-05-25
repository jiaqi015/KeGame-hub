/**
 * Deal Closing Runtime Consensus Parity Test
 *
 * Constructs an actual GameState, exercises the full deal-closing flow
 * (queue → settle), and asserts that canonical ConsensusFormation arrays
 * are populated and legacy mirrors are traceable.
 *
 * This is a BEHAVIORAL gate, not a string-matching gate.
 * If dealClosing.ts has not been migrated to use ConsensusFormation,
 * this test WILL FAIL — that is the intended behavior.
 *
 * Checks:
 * 1. constructClosableState: world has opportunities + brokered states
 * 2. queueDealClosingEvaluation: runtimeConsensusFormations length increases
 * 3. queueDealClosingEvaluation: consensus has meaningful stage/evaluation
 * 4. settlePendingDealClosings success: runtimeContractFacts increases
 * 5. settlePendingDealClosings success: runtimeOpportunityClosures increases
 * 6. settlePendingDealClosings success: closedDeals increases
 * 7. Legacy closedDeals[0].dealId/sourceRelationId/opportunityId traceable to canonical
 * 8. Same seed → same closedAt (determinism proof)
 * 9. buildClosedDealRecord: no Date.now / new Date (source code check)
 * 10. Consensus lifecycle completeness: signed → ContractFact + ClosureSet created
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { queueDealClosingEvaluation, settlePendingDealClosings, buildClosedDealRecord } from '../src/selling-houses/domain/dealClosing.js';
import { ensureConsensusRuntime, findConsensusForOpportunity } from '../src/selling-houses/domain/consensusFormationHelper.js';
import { findBrokeredStateForOpportunity, initializeOpportunityRelations } from '../src/selling-houses/domain/opportunitySplitHelper.js';
import { asWritableCase, ensureMarketOutcomeState } from '../src/selling-houses/domain/models.js';
import type { GameState, Opportunity } from '../src/selling-houses/domain/models.js';
import type { ContractFactState, OpportunityClosureSetState } from '../src/selling-houses/core/world-state/consensus/writeSource.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors: string[] = [];

function pass(message: string) {
  passed += 1;
  console.log(`  [PASS] ${message}`);
}

function check(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    console.log(`  [PASS] ${message}`);
  } else {
    failed += 1;
    errors.push(message);
    console.log(`  [FAIL] ${message}`);
  }
}

const SEED = 20260506;

/**
 * Build a GameState with closeable opportunities:
 * - High intent/confidence on opportunities
 * - Active case with high trust/competitiveness
 * - Ask price near market price (no blocking)
 */
function buildClosableState(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario');
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  initializeOpportunityRelations(world);
  updateDerivedState(world);

  // Ensure we have opportunities
  check(world.opportunities.length > 0, 'world has opportunities');

  // Make the first opportunity highly closable
  if (world.opportunities.length > 0) {
    const opp = world.opportunities[0];
    opp.intent = 95;
    opp.confidence = 90;
    opp.daysLeft = 10;
    opp.touchedToday = true;
    opp.budgetMax = 999999; // No budget blocking

    // Make its case closable: high trust, high competitiveness, askPrice ≤ marketPrice
    const caseItem = world.cases.find((c) => c.id === opp.caseId);
    if (caseItem) {
      asWritableCase(caseItem).trust = 80;
      caseItem.competitiveness = 70;
      caseItem.askPrice = Math.min(caseItem.askPrice, caseItem.marketPrice);
      asWritableCase(caseItem).status = 'active';
    }
  }

  // Ensure market has available deal slots (otherwise evaluation is always blocked)
  const marketOutcome = ensureMarketOutcomeState(world);
  marketOutcome.releasedSlots = Math.max(marketOutcome.releasedSlots, 10);
  marketOutcome.playerClaimedDeals = 0;

  // Ensure brokered states exist
  const brokeredExists = world.opportunities.some(
    (opp) => findBrokeredStateForOpportunity(world, opp.id) !== undefined,
  );
  check(brokeredExists, 'brokered states exist for at least one opportunity');

  return world;
}

/**
 * Find an active case for the opportunity, or return undefined.
 */
function findActiveCaseFor(world: GameState, opp: Opportunity) {
  const caseItem = world.cases.find((c) => c.id === opp.caseId);
  return caseItem && caseItem.status === 'active' ? caseItem : undefined;
}

// ---------------------------------------------------------------------------
// Source code check: buildClosedDealRecord has no Date.now / new Date
// ---------------------------------------------------------------------------

console.log('\n=== Check 9: buildClosedDealRecord source code replay safety ===');

try {
  const dealSrc = readFileSync('src/selling-houses/domain/dealClosing.ts', 'utf-8');
  const noComment = dealSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // This checks the actual source, not the runtime behavior
  check(!noComment.includes('Date.now'), 'buildClosedDealRecord source: no Date.now');
  // Allow new Date() in buildClosedDealRecord only if it's deterministic
  // (Currently line 342: `const closedAt = new Date().toISOString();` — this IS a P1-4 violation)
  const buildBody = dealSrc.split('\n');
  const buildFnStart = buildBody.findIndex((l) => l.includes('export function buildClosedDealRecord'));
  if (buildFnStart >= 0) {
    // Extract buildClosedDealRecord body
    let braceCount = 0;
    let started = false;
    const fnLines: string[] = [];
    for (let i = buildFnStart; i < buildBody.length; i++) {
      fnLines.push(buildBody[i]);
      for (const ch of buildBody[i]) {
        if (ch === '{') { braceCount++; started = true; }
        if (ch === '}') braceCount--;
      }
      if (started && braceCount <= 0) break;
    }
    const fnSrc = fnLines.join('\n').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    check(
      !fnSrc.includes('new Date'),
      'buildClosedDealRecord body: no new Date() (replay safe)',
    );
  }
} catch (e: any) {
  check(false, `source code check: ${e.message}`);
}

// ---------------------------------------------------------------------------
// Runtime behavioral checks
// ---------------------------------------------------------------------------

console.log('\n=== Check 1-8 & 10: Runtime behavioral parity ===');

const world = buildClosableState(SEED);

// Snapshot consensus runtime state before queue
const { formations: preFormations, contracts: preContracts, closures: preClosures } =
  ensureConsensusRuntime(world);
const preFormationCount = preFormations.length;
const preContractCount = preContracts.length;
const preClosureCount = preClosures.length;
const preClosedDealCount = world.closedDeals.length;

// Find the opportunity we made closable
const targetOpp = world.opportunities[0];
const targetCase = findActiveCaseFor(world, targetOpp);
check(targetCase !== undefined, `found active case for opportunity ${targetOpp.id}`);

if (targetCase) {
  // --- Check 2 & 3: queueDealClosingEvaluation populates consensus ---
  console.log('\n  --- queueDealClosingEvaluation ---');

  // First, find the brokered opportunity for consensus lookup
  const brokered = findBrokeredStateForOpportunity(world, targetOpp.id);
  check(brokered !== undefined, 'found brokered state for target opportunity');

  queueDealClosingEvaluation(world, targetCase, targetOpp, 'balanced');

  const { formations: postQueueFormations } = ensureConsensusRuntime(world);
  const queueFormationDelta = postQueueFormations.length - preFormationCount;

  check(
    queueFormationDelta > 0,
    `queueDealClosingEvaluation: runtimeConsensusFormations increased by ${queueFormationDelta} (expected > 0)`,
  );

  // Check consensus has meaningful data
  if (queueFormationDelta > 0) {
    // Note: findConsensusForOpportunity uses brokeredOpportunityId, but
    // dealClosing.ts currently creates consensus with legacy opportunity.id.
    // Search formations directly to find the newly created consensus.
    const consensus = postQueueFormations.find(
      (f) => f.brokeredOpportunityId === targetOpp.id
        || f.consensusId.includes(targetOpp.id),
    );
    check(consensus !== undefined, 'consensus found for queued opportunity');
    if (consensus) {
      check(
        typeof consensus.stage === 'string' && consensus.stage.length > 0,
        `consensus has meaningful stage: ${consensus.stage}`,
      );
      check(
        consensus.consensusId.includes(targetOpp.id),
        `consensus ID contains opportunity ID: ${consensus.consensusId}`,
      );
    }
  }

  // --- Check 4-7: settlePendingDealClosings produces canonical + legacy ---
  console.log('\n  --- settlePendingDealClosings ---');

  // The settle function uses randomInt for resolution.
  // With 95 closeProbability and seed 20260506, success is very likely but not guaranteed.
  // We check AFTER settle regardless of outcome.

  settlePendingDealClosings(world);

  const { formations: postSettleFormations, contracts: postContracts, closures: postClosures } =
    ensureConsensusRuntime(world);

  // Check if consensus was updated (evaluation + terminal stage)
  // Search directly since dealClosing.ts uses legacy opportunity.id for consensus creation
  const settledConsensus = postSettleFormations.find(
    (f) => f.brokeredOpportunityId === targetOpp.id
      || f.consensusId.includes(targetOpp.id),
  );
  if (settledConsensus) {
    const isSigned = settledConsensus.stage === 'signed';
    const isCollapsed = settledConsensus.stage === 'collapsed';
    check(
      isSigned || isCollapsed,
      `consensus reached terminal stage: ${settledConsensus.stage}`,
    );

    // If signed (success path), check canonical artifacts
    if (isSigned) {
      console.log('\n  --- Success path (consensus signed) ---');

      // Check 4: runtimeContractFacts increased
      const contractDelta = postContracts.length - preContractCount;
      check(
        contractDelta > 0,
        `runtimeContractFacts increased by ${contractDelta} (expected > 0 on success)`,
      );

      // Check 5: runtimeOpportunityClosures increased
      const closureDelta = postClosures.length - preClosureCount;
      check(
        closureDelta > 0,
        `runtimeOpportunityClosures increased by ${closureDelta} (expected > 0 on success)`,
      );

      // Check 6: closedDeals increased
      const closedDealDelta = world.closedDeals.length - preClosedDealCount;
      check(
        closedDealDelta > 0,
        `closedDeals increased by ${closedDealDelta} (expected > 0 on success)`,
      );

      // Check 7: Legacy closedDeals[0] traceable to canonical
      if (world.closedDeals.length > 0 && postContracts.length > 0) {
        const legacyDeal = world.closedDeals[0];
        const latestContract = postContracts[postContracts.length - 1] as ContractFactState;
        const latestClosure = postClosures.length > 0
          ? (postClosures[postClosures.length - 1] as OpportunityClosureSetState)
          : undefined;

        check(
          typeof legacyDeal.dealId === 'string' && legacyDeal.dealId.length > 0,
          `legacy closedDeals[0].dealId is non-empty: ${legacyDeal.dealId}`,
        );
        check(
          legacyDeal.sourceRelationId === targetOpp.id,
          `legacy sourceRelationId matches opportunity: ${legacyDeal.sourceRelationId} === ${targetOpp.id}`,
        );
        check(
          legacyDeal.opportunityId === targetOpp.id,
          `legacy opportunityId matches: ${legacyDeal.opportunityId} === ${targetOpp.id}`,
        );
        // Traceable to canonical contract
        check(
          latestContract.brokeredOpportunityId === targetOpp.id
            || latestContract.caseId === targetCase.id,
          `canonical contract references opportunity/case (contractOpp=${latestContract.brokeredOpportunityId}, contractCase=${latestContract.caseId})`,
        );

        // Check 7b: ContractFact.sourceClosedDealId traces to closedDeals[0].dealId
        check(
          latestContract.sourceClosedDealId === legacyDeal.dealId,
          `ContractFact.sourceClosedDealId === closedDeals[0].dealId (${latestContract.sourceClosedDealId} === ${legacyDeal.dealId})`,
        );

        // Check 7c: ClosureSet.closedOpportunityIds contains winning opportunity
        if (latestClosure) {
          check(
            latestClosure.closedOpportunityIds.includes(targetOpp.id),
            `ClosureSet.closedOpportunityIds contains winning opportunity (${targetOpp.id})`,
          );

          // Check 7d: ClosureSet.closedOpportunityIds contains losing opportunity IDs
          const losingOpps = world.opportunities.filter(
            (o) => o.caseId === targetCase.id && o.id !== targetOpp.id && o.status === 'closed',
          );
          if (losingOpps.length > 0) {
            const allLosingIncluded = losingOpps.every(
              (o) => latestClosure.closedOpportunityIds.includes(o.id),
            );
            check(
              allLosingIncluded,
              `ClosureSet.closedOpportunityIds includes all ${losingOpps.length} losing opportunities`,
            );
          } else {
            // No losing opportunities is valid for single-buyer cases
            pass('no losing opportunities to verify in ClosureSet (single-buyer case)');
          }
        } else {
          check(false, 'OpportunityClosureSet created on success path');
        }
      }
    } else {
      console.log('\n  --- Failure path (consensus collapsed) ---');
      check(
        settledConsensus.stage === 'collapsed',
        `consensus collapsed as expected on failure path`,
      );
      // On failure, ContractFact and ClosureSet should NOT be created
      const contractDelta = postContracts.length - preContractCount;
      check(
        contractDelta === 0,
        `failure path: runtimeContractFacts NOT increased (${contractDelta})`,
      );
    }
  }

  // --- Check 10: Consensus lifecycle completeness ---
  console.log('\n  --- Check 10: Consensus lifecycle completeness ---');

  if (settledConsensus) {
    // Check that consensus has evaluation data recorded
    const hasEvaluation = typeof settledConsensus.closeReadiness === 'number'
      && typeof settledConsensus.closeProbability === 'number'
      && Array.isArray(settledConsensus.blockers)
      && Array.isArray(settledConsensus.supportingFactors);
    check(
      hasEvaluation,
      'settled consensus has evaluation data recorded (closeReadiness, closeProbability, blockers, supportingFactors)',
    );
  }
}

// ---------------------------------------------------------------------------
// Check 8: Same seed → same closedAt (determinism proof)
// ---------------------------------------------------------------------------

console.log('\n=== Check 8: Seed determinism (closedAt parity) ===');

// Rebuild world with same seed and run the same operations
const world2 = buildClosableState(SEED);
const targetOpp2 = world2.opportunities[0];
const targetCase2 = findActiveCaseFor(world2, targetOpp2);

if (targetCase2) {
  queueDealClosingEvaluation(world2, targetCase2, targetOpp2, 'balanced');
  settlePendingDealClosings(world2);

  // Both worlds should have same number of closed deals
  check(
    world.closedDeals.length === world2.closedDeals.length,
    `same seed: closedDeals count matches (${world.closedDeals.length} === ${world2.closedDeals.length})`,
  );

  if (world.closedDeals.length > 0 && world2.closedDeals.length > 0) {
    // Compare closedAt (must be identical with same seed if deterministic)
    const closedAt1 = world.closedDeals[0].closedAt;
    const closedAt2 = world2.closedDeals[0].closedAt;
    check(
      closedAt1 === closedAt2,
      `same seed: closedAt matches (${closedAt1} === ${closedAt2})`,
    );

    // Compare contractId (must be identical with same seed)
    const { contracts: c1 } = ensureConsensusRuntime(world);
    const { contracts: c2 } = ensureConsensusRuntime(world2);
    if (c1.length > 0 && c2.length > 0) {
      check(
        (c1[c1.length - 1] as ContractFactState).contractId === (c2[c2.length - 1] as ContractFactState).contractId,
        `same seed: contractId matches`,
      );
    }

    // Compare closureSetId (must be identical with same seed)
    const { closures: cl1 } = ensureConsensusRuntime(world);
    const { closures: cl2 } = ensureConsensusRuntime(world2);
    if (cl1.length > 0 && cl2.length > 0) {
      check(
        (cl1[cl1.length - 1] as OpportunityClosureSetState).closureSetId === (cl2[cl2.length - 1] as OpportunityClosureSetState).closureSetId,
        `same seed: closureSetId matches`,
      );
    }
  }

  // Compare consensus states
  const { formations: f1 } = ensureConsensusRuntime(world);
  const { formations: f2 } = ensureConsensusRuntime(world2);
  check(
    f1.length === f2.length,
    `same seed: consensus formations count matches (${f1.length} === ${f2.length})`,
  );
  if (f1.length > 0 && f2.length > 0) {
    check(
      f1[0].stage === f2[0].stage,
      `same seed: consensus stage matches (${f1[0].stage} === ${f2[0].stage})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total checks: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (errors.length > 0) {
  console.log('\nFailures:');
  for (const e of errors) {
    console.log(`  [FAIL] ${e}`);
  }
}

if (failed > 0) {
  console.log('\ndeal-closing runtime consensus parity: FAIL');
  console.log('(If failures are about consensus arrays being empty, the migration is not done yet)');
  process.exit(1);
} else {
  console.log('\ndeal-closing runtime consensus parity: PASS');
  process.exit(0);
}
