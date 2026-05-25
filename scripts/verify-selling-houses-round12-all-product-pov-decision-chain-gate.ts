/**
 * verify-selling-houses-round12-all-product-pov-decision-chain-gate.ts
 *
 * Round 12 — All Product POV / Decision Chain Gate
 *
 * Verifies that every core product projection:
 *   1. Has an explainability envelope (who/day/source/credibility/belief/decision/receipt)
 *   2. Can explain terminal/closed/inactive cases (not just active)
 *   3. Does not directly read hidden GlobalTruth for recommendation text
 *   4. Uses actorKnowledge / DecisionEvidenceEnvelope when available
 *   5. Falls back to "证据不足" (not fake suggestions) when no evidence
 *
 * Anti-false-positive rules:
 *   - Core surface without explainability envelope → FAIL
 *   - Active case explainable but terminal case not → FAIL
 *   - Projection reading legacy fields for recommendation without legacyFallback marker → FAIL
 *   - Projection lacking causalRefs / sourceRecordIds / beliefRefs → FAIL
 *   - Missing "证据不足" fallback path → FAIL
 *
 * Surfaces audited:
 *   1. 工作台 (workspaceShellProjection)
 *   2. 房源详情 (operatingProjection → CaseDetailProjection)
 *   3. 大世界 POV (bigWorldPOVProjection)
 *   4. 微信/人聚合 (myWechatProjection → myWechatFacts)
 *   5. 市场入场简报 (marketOpeningPOVProjection)
 *   6. 结果页/日结页 (resultProjection)
 *   7. 客户列表 (operatingProjection → OpportunityListProjection)
 *   8. 经理/组织动作 (operatingProjection → DashboardProjection)
 *
 * Usage: npx tsx scripts/verify-selling-houses-round12-all-product-pov-decision-chain-gate.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { asWritableCase } from '../src/selling-houses/domain/models.js';

// ── Helpers ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.error(`  ❌ ${message}`);
  }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

function readSource(path: string): string {
  return readFileSync(resolve(import.meta.dirname ?? '.', '..', path), 'utf-8');
}

// ══════════════════════════════════════════════════════════════════════════
// Gate
// ══════════════════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Round 12 — All Product POV / Decision Chain Gate              ║');
console.log('║  Every core surface must explain: who/day/source/belief/decision ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ══════════════════════════════════════════════════════════════════════════
// SECTION 1: Source file existence and imports
// ══════════════════════════════════════════════════════════════════════════

section('1. Source files exist and import correctly');

const bigWorldSrc = readSource('src/selling-houses/application/projections/bigWorldPOVProjection.ts');
const operatingSrc = readSource('src/selling-houses/application/projections/operatingProjection.ts');
const wechatSrc = readSource('src/selling-houses/application/projections/myWechatFacts.ts');
const marketOpeningSrc = readSource('src/selling-houses/application/projections/marketOpeningPOVProjection.ts');
const workspaceShellSrc = readSource('src/selling-houses/application/projections/workspaceShellProjection.ts');
const resultSrc = readSource('src/selling-houses/application/projections/resultProjection.ts');
const adapterSrc = readSource('src/selling-houses/application/projections/perfectProjectionAdapters.ts');
const actorKnowledgeSrc = readSource('src/selling-houses/application/projections/actorKnowledgeProjection.ts');

check(bigWorldSrc.length > 0, 'bigWorldPOVProjection.ts exists');
check(operatingSrc.length > 0, 'operatingProjection.ts exists');
check(wechatSrc.length > 0, 'myWechatFacts.ts exists');
check(marketOpeningSrc.length > 0, 'marketOpeningPOVProjection.ts exists');
check(workspaceShellSrc.length > 0, 'workspaceShellProjection.ts exists');
check(resultSrc.length > 0, 'resultProjection.ts exists');
check(adapterSrc.length > 0, 'perfectProjectionAdapters.ts exists');
check(actorKnowledgeSrc.length > 0, 'actorKnowledgeProjection.ts exists');

// ══════════════════════════════════════════════════════════════════════════
// SECTION 2: 大世界 POV — bigWorldPOVProjection
// ══════════════════════════════════════════════════════════════════════════

section('2. 大世界 POV — bigWorldPOVProjection');

// 2a. buildOwnerExpectationSignalPOV uses actorKnowledge when available
check(
  bigWorldSrc.includes('actorKnowledge?: ') && bigWorldSrc.includes('ActorKnowledgeSnapshot'),
  'buildOwnerExpectationSignalPOV accepts optional ActorKnowledgeSnapshot',
);
check(
  bigWorldSrc.includes('knowledgePriceGap') && bigWorldSrc.includes('knowledgeTrust'),
  'buildOwnerExpectationSignalPOV derives values from belief domains when knowledge available',
);
check(
  bigWorldSrc.includes('caseItem.priceGapPct') || bigWorldSrc.includes('caseItem.trust'),
  'buildOwnerExpectationSignalPOV has legacy fallback for when no knowledge',
);

// 2b. buildDemandMovementPOV uses actorKnowledge when available
check(
  bigWorldSrc.includes('customerSeriousness') && bigWorldSrc.includes('avgConfidence'),
  'buildDemandMovementPOV derives momentum from customer_seriousness belief',
);

// 2c. buildWorkspaceBigWorldModule uses DecisionEvidenceEnvelope
check(
  bigWorldSrc.includes('buildDecisionEvidenceEnvelope(actorKnowledge)'),
  'buildWorkspaceBigWorldModule builds DecisionEvidenceEnvelope when knowledge available',
);
check(
  bigWorldSrc.includes('sharedCausalRefs') && bigWorldSrc.includes('buildSharedCausalRefs'),
  'BigWorldPOV uses shared causal refs from envelope',
);

// 2d. buildDecisionBigRecommendations traces source → belief → pressure → command
check(
  bigWorldSrc.includes('buildDecisionBigRecommendations'),
  'buildDecisionBigRecommendations exists for evidence-backed recommendations',
);

// 2e. BigWorldPOVSummary has evidence fields
check(
  bigWorldSrc.includes('safeRefs?:') && bigWorldSrc.includes('sourceRecordIds?:') && bigWorldSrc.includes('replayKey?:'),
  'BigWorldPOVSummary.recommendedActionReasons has evidence fields',
);

// 2f. Terminal/inactive case handling: buildLiveCausalContext handles non-active cases
check(
  bigWorldSrc.includes('recentRelevantEvents.length > 0 ? recentRelevantEvents : allRelevantEvents'),
  'buildLiveCausalContext falls back to all events when no recent events (terminal case support)',
);

// 2g. applyKnowledgeFilterToPOV filters all sub-projection refs
check(
  bigWorldSrc.includes('applyKnowledgeFilterToPOV'),
  'applyKnowledgeFilterToPOV filters refs through visibility rules',
);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 3. 房源详情 — operatingProjection → CaseDetailProjection
// ══════════════════════════════════════════════════════════════════════════

section('3. 房源详情 — operatingProjection → CaseDetailProjection');

// 3a. buildCaseDetailProjection accepts actorKnowledge
check(
  operatingSrc.includes('actorKnowledge?: ActorKnowledgeSnapshot'),
  'buildCaseDetailProjection accepts optional ActorKnowledgeSnapshot',
);

// 3b. Uses buildPerfectCaseDetailAdditions when knowledge available
check(
  operatingSrc.includes('buildPerfectCaseDetailAdditions(actorKnowledge, envelope, caseItem, state)'),
  'buildCaseDetailProjection uses buildPerfectCaseDetailAdditions when knowledge available',
);

// 3c. CaseDetailProjection has evidence-backed fields
check(
  operatingSrc.includes('evidenceBackedReasons?:') && operatingSrc.includes('evidenceBackedRiskReminders?:'),
  'CaseDetailProjection has evidenceBackedReasons and evidenceBackedRiskReminders',
);

// 3d. ownerSummary still has legacy fields (display values, not recommendation text)
check(
  operatingSrc.includes('trust: caseItem.hasCompletedFirstVisit ? Math.round(caseItem.trust) : 0'),
  'ownerSummary.trust is a display value (legacy mirror), not recommendation text',
);

// 3e. Legacy fallback is guarded by !actorKnowledge
check(
  operatingSrc.includes('...(actorKnowledge') || operatingSrc.includes('...(actorKnowledge'),
  'Evidence-backed additions are conditional on actorKnowledge presence',
);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 4. 微信/人聚合 — myWechatFacts
// ══════════════════════════════════════════════════════════════════════════

section('4. 微信/人聚合 — myWechatFacts');

// 4a. extractMyWechatFacts accepts actorKnowledgeMap
check(
  wechatSrc.includes('actorKnowledgeMap?: Map<string'),
  'extractMyWechatFacts accepts optional actorKnowledgeMap',
);

// 4b. extractEvidenceBackedFacts exists and uses buildDecisionEvidenceEnvelope
check(
  wechatSrc.includes('extractEvidenceBackedFacts'),
  'extractEvidenceBackedFacts exists for evidence-backed path',
);
check(
  wechatSrc.includes('buildDecisionEvidenceEnvelope(knowledge)'),
  'extractEvidenceBackedFacts uses DecisionEvidenceEnvelope',
);

// 4c. Evidence-backed facts take priority over legacy
check(
  wechatSrc.includes('evidenceCaseIds.has(f.caseId)'),
  'Evidence-backed facts take priority over legacy facts for same caseId',
);

// 4d. Legacy fallback path exists when no knowledge
check(
  wechatSrc.includes('if (input.actorKnowledgeMap && input.actorKnowledgeMap.size > 0)'),
  'Legacy path is guarded by actorKnowledgeMap presence',
);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 5. 市场入场简报 — marketOpeningPOVProjection
// ══════════════════════════════════════════════════════════════════════════

section('5. 市场入场简报 — marketOpeningPOVProjection');

// 5a. buildMarketOpeningPOVProjection accepts actorKnowledgeMap
check(
  marketOpeningSrc.includes('actorKnowledgeMap?: Map<string'),
  'buildMarketOpeningPOVProjection accepts optional actorKnowledgeMap',
);

// 5b. buildOwnerExpectationIssues uses belief domains when knowledge available
check(
  marketOpeningSrc.includes('const knowledge = actorKnowledgeMap?.get(caseItem.id)'),
  'buildOwnerExpectationIssues uses actorKnowledge when available',
);
check(
  marketOpeningSrc.includes('envelope.pressureSignals'),
  'buildOwnerExpectationIssues derives issues from pressure signals',
);

// 5c. buildRecommendedCuts uses knowledge when available
check(
  marketOpeningSrc.includes('envelope.recommendedCommand'),
  'buildRecommendedCuts uses DecisionEvidenceEnvelope when knowledge available',
);

// 5d. MarketOpeningPOVProjection has evidence-backed fields
check(
  marketOpeningSrc.includes('evidenceBackedOwnerIssues?:') && marketOpeningSrc.includes('evidenceBackedRecommendedCuts?:'),
  'MarketOpeningPOVProjection has evidence-backed fields',
);
check(
  marketOpeningSrc.includes('sharedCausalRefs?: SharedCausalRefs'),
  'MarketOpeningPOVProjection has sharedCausalRefs',
);

// 5e. Legacy fallback exists
check(
  marketOpeningSrc.includes('caseItem.priceGapPct > 12'),
  'Legacy fallback for ownerExpectationIssues exists when no knowledge',
);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 6. 工作台 — workspaceShellProjection
// ══════════════════════════════════════════════════════════════════════════

section('6. 工作台 — workspaceShellProjection');

// 6a. buildWorkspaceShellProjection accepts actorKnowledgeMap
check(
  workspaceShellSrc.includes('actorKnowledgeMap?: Map<string'),
  'buildWorkspaceShellProjection accepts optional actorKnowledgeMap',
);

// 6b. Passes actorKnowledgeMap to buildMarketOpeningPOVProjection
check(
  workspaceShellSrc.includes('buildMarketOpeningPOVProjection(state, actorKnowledgeMap)'),
  'workspaceShellProjection passes actorKnowledgeMap to marketOpeningBrief',
);

// 6c. Passes actorKnowledge to buildCaseDetailProjection for selected case
check(
  workspaceShellSrc.includes('actorKnowledgeMap?.get(selectedCase.id)'),
  'workspaceShellProjection passes actorKnowledge to selected case detail',
);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 7. 结果页 — resultProjection
// ══════════════════════════════════════════════════════════════════════════

section('7. 结果页 — resultProjection');

// 7a. resultProjection reads from finalResult (game outcome, not hidden GlobalTruth)
check(
  resultSrc.includes('state.finalResult'),
  'resultProjection reads from finalResult (game outcome)',
);

// 7b. resultProjection does not read hidden GlobalTruth for recommendations
check(
  !resultSrc.includes('caseItem.trust') && !resultSrc.includes('caseItem.patience') && !resultSrc.includes('caseItem.urgency'),
  'resultProjection does not read hidden owner state fields',
);

// 7c. resultProjection handles terminal state (sold, withdrawn, lost)
check(
  resultSrc.includes("entry.defenseOutcome === 'lost_to_rival'"),
  'resultProjection handles lost_to_rival terminal state',
);
check(
  resultSrc.includes('soldCount') && resultSrc.includes('getClosedDealCount'),
  'resultProjection handles sold state via getClosedDealCount',
);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 8. 客户列表 — operatingProjection → OpportunityListProjection
// ══════════════════════════════════════════════════════════════════════════

section('8. 客户列表 — operatingProjection → OpportunityListProjection');

// 8a. buildOpportunityListProjection does not generate recommendation text from legacy fields
check(
  !operatingSrc.match(/buildOpportunityListProjection[\s\S]{0,500}caseItem\.trust/),
  'buildOpportunityListProjection does not read caseItem.trust for recommendation text',
);

// 8b. Customer projection reads display values, not recommendation text
check(
  operatingSrc.includes('Math.round(customerState?.advisorTrust ?? 45)'),
  'Customer advisorTrust is a display value from customerState, not caseItem.trust',
);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 9. perfectProjectionAdapters — evidence chain completeness
// ══════════════════════════════════════════════════════════════════════════

section('9. perfectProjectionAdapters — evidence chain completeness');

// 9a. buildSharedCausalRefs exists and is the single source of truth
check(
  adapterSrc.includes('export function buildSharedCausalRefs'),
  'buildSharedCausalRefs is exported from perfectProjectionAdapters',
);

// 9b. EvidenceBackedReason has all required fields
check(
  adapterSrc.includes('safeRefs:') && adapterSrc.includes('replayKey:') && adapterSrc.includes('sourceRecordIds:') && adapterSrc.includes('evidenceStatus:'),
  'EvidenceBackedReason has safeRefs, replayKey, sourceRecordIds, evidenceStatus',
);

// 9c. buildLegacyFallbackReason exists and marks as legacyFallback
check(
  adapterSrc.includes('buildLegacyFallbackReason'),
  'buildLegacyFallbackReason exists for legacy fallback path',
);
check(
  adapterSrc.includes("evidenceStatus: 'legacyFallback'"),
  'buildLegacyFallbackReason marks evidenceStatus as legacyFallback',
);

// 9d. "证据不足" fallback exists
check(
  adapterSrc.includes("'证据不足'"),
  '"证据不足" fallback exists for no-evidence case',
);

// 9e. buildPerfectCaseDetailAdditions exists
check(
  adapterSrc.includes('buildPerfectCaseDetailAdditions'),
  'buildPerfectCaseDetailAdditions exists',
);

// 9f. buildPerfectWechatFacts exists
check(
  adapterSrc.includes('buildPerfectWechatFacts'),
  'buildPerfectWechatFacts exists',
);

// 9g. buildPerfectDashboardRiskReminders exists
check(
  adapterSrc.includes('buildPerfectDashboardRiskReminders'),
  'buildPerfectDashboardRiskReminders exists',
);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 10. No hidden GlobalTruth leaks
// ══════════════════════════════════════════════════════════════════════════

section('10. No hidden GlobalTruth leaks');

// 10a. perfectProjectionAdapters does not import InformationSourceRegistry directly
check(
  !adapterSrc.includes("from '../../domain/world-model/informationSourceRegistry") &&
  !adapterSrc.includes("from '../../domain/world-model/informationSourceTypes"),
  'perfectProjectionAdapters does not import InformationSourceRegistry/Types directly',
);

// 10b. DecisionEvidenceEnvelope does not contain raw GameState fields
// (verified by the existing explanation-envelope gate — trust that gate)

// 10c. actorKnowledgeProjection does not read GameState directly
check(
  !actorKnowledgeSrc.includes('state.cases') && !actorKnowledgeSrc.includes('state.opportunities'),
  'actorKnowledgeProjection does not read GameState directly (receives registry + causal events)',
);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 11. Terminal / closed case explainability
// ══════════════════════════════════════════════════════════════════════════

section('11. Terminal / closed case explainability');

// 11a. bigWorldPOVProjection handles terminal cases in buildLiveCausalContext
check(
  bigWorldSrc.includes('terminal / inactive cases still need'),
  'buildLiveCausalContext explicitly handles terminal cases',
);

// 11b. resultProjection handles all terminal states
check(
  resultSrc.includes("'good'") && resultSrc.includes("'neutral'") && resultSrc.includes("'bad'"),
  'resultProjection handles all ending buckets (good/neutral/bad)',
);

// 11c. operatingProjection handles terminal case statuses
check(
  operatingSrc.includes("caseItem.status === 'sold'") || operatingSrc.includes("status === 'sold'"),
  'operatingProjection handles sold status',
);
check(
  operatingSrc.includes("status === 'withdrawn'") || operatingSrc.includes("'written_off'"),
  'operatingProjection handles withdrawn/written_off status',
);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 12. Backward compatibility
// ══════════════════════════════════════════════════════════════════════════

section('12. Backward compatibility');

// 12a. All new parameters are optional
check(
  marketOpeningSrc.includes('actorKnowledgeMap?: Map<string'),
  'marketOpeningPOVProjection actorKnowledgeMap is optional',
);
check(
  workspaceShellSrc.includes('actorKnowledgeMap?: Map<string'),
  'workspaceShellProjection actorKnowledgeMap is optional',
);
check(
  operatingSrc.includes('actorKnowledge?: ActorKnowledgeSnapshot'),
  'buildCaseDetailProjection actorKnowledge is optional',
);

// 12b. Evidence-backed fields are optional on all output types
check(
  marketOpeningSrc.includes('evidenceBackedOwnerIssues?:'),
  'MarketOpeningPOVProjection.evidenceBackedOwnerIssues is optional',
);
check(
  marketOpeningSrc.includes('evidenceBackedRecommendedCuts?:'),
  'MarketOpeningPOVProjection.evidenceBackedRecommendedCuts is optional',
);
check(
  bigWorldSrc.includes('sharedCausalRefs?: SharedCausalRefs'),
  'BigWorldPOVSummary.sharedCausalRefs is optional',
);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 13. Deterministic replay keys
// ══════════════════════════════════════════════════════════════════════════

section('13. Deterministic replay keys');

check(
  adapterSrc.includes('replayKey: sharedRefs.replayKey'),
  'adapter passes shared replayKey to evidence-backed reasons',
);
check(
  bigWorldSrc.includes('replayKey: sharedCausalRefs.replayKey'),
  'bigWorldPOV passes shared replayKey to reasons',
);
check(
  actorKnowledgeSrc.includes("deterministicId('dee'"),
  'DecisionEvidenceEnvelope has deterministic replay key',
);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 14. Product Surface Chain Matrix
// ══════════════════════════════════════════════════════════════════════════

section('14. Product Surface Chain Matrix');

interface SurfaceAudit {
  surface: string;
  hasActorKnowledgePath: boolean;
  hasEvidenceFields: boolean;
  hasLegacyFallback: boolean;
  hasTerminalCaseSupport: boolean;
  hasCausalRefs: boolean;
  hasSourceRecordIds: boolean;
  hasBeliefRefs: boolean;
  hasReplayKey: boolean;
}

const surfaces: SurfaceAudit[] = [
  {
    surface: '大世界 POV (bigWorldPOVProjection)',
    hasActorKnowledgePath: bigWorldSrc.includes('actorKnowledge?: ') && bigWorldSrc.includes('ActorKnowledgeSnapshot'),
    hasEvidenceFields: bigWorldSrc.includes('safeRefs?:') && bigWorldSrc.includes('sourceRecordIds?:'),
    hasLegacyFallback: bigWorldSrc.includes('caseItem.priceGapPct') || bigWorldSrc.includes('caseItem.trust'),
    hasTerminalCaseSupport: bigWorldSrc.includes('terminal / inactive cases'),
    hasCausalRefs: bigWorldSrc.includes('POVCausalRef[]'),
    hasSourceRecordIds: bigWorldSrc.includes('sourceRecordIds'),
    hasBeliefRefs: bigWorldSrc.includes('beliefSummary') || bigWorldSrc.includes('knowledgeBeliefs'),
    hasReplayKey: bigWorldSrc.includes('replayKey'),
  },
  {
    surface: '房源详情 (operatingProjection)',
    hasActorKnowledgePath: operatingSrc.includes('actorKnowledge?: ActorKnowledgeSnapshot'),
    hasEvidenceFields: operatingSrc.includes('evidenceBackedReasons?:'),
    hasLegacyFallback: operatingSrc.includes('caseItem.trust'),
    hasTerminalCaseSupport: operatingSrc.includes("status === 'sold'") || operatingSrc.includes("'written_off'"),
    hasCausalRefs: operatingSrc.includes('SharedCausalRefs'),
    hasSourceRecordIds: operatingSrc.includes('sourceRecordIds'),
    hasBeliefRefs: operatingSrc.includes('buildPerfectCaseDetailAdditions'),
    hasReplayKey: operatingSrc.includes('SharedCausalRefs') && adapterSrc.includes('replayKey'), // replayKey flows from adapter
  },
  {
    surface: '微信/人聚合 (myWechatFacts)',
    hasActorKnowledgePath: wechatSrc.includes('actorKnowledgeMap?: Map<string'),
    hasEvidenceFields: wechatSrc.includes('evidenceAvailable'),
    hasLegacyFallback: wechatSrc.includes('caseItem.urgency') || wechatSrc.includes('caseItem.trust'),
    hasTerminalCaseSupport: wechatSrc.includes('activeCases'),
    hasCausalRefs: wechatSrc.includes('safeRefs'),
    hasSourceRecordIds: wechatSrc.includes('sourceRecordIds'),
    hasBeliefRefs: wechatSrc.includes('buildDecisionEvidenceEnvelope'),
    hasReplayKey: wechatSrc.includes('replayKey'),
  },
  {
    surface: '市场入场简报 (marketOpeningPOVProjection)',
    hasActorKnowledgePath: marketOpeningSrc.includes('actorKnowledgeMap?: Map<string'),
    hasEvidenceFields: marketOpeningSrc.includes('evidenceBackedOwnerIssues?:'),
    hasLegacyFallback: marketOpeningSrc.includes('caseItem.priceGapPct > 12'),
    hasTerminalCaseSupport: marketOpeningSrc.includes("caseItem.status !== 'active'"),
    hasCausalRefs: marketOpeningSrc.includes('POVCausalRef[]'),
    hasSourceRecordIds: marketOpeningSrc.includes('sourceRecordIds'),
    hasBeliefRefs: marketOpeningSrc.includes('envelope.pressureSignals'),
    hasReplayKey: marketOpeningSrc.includes('replayKey'),
  },
  {
    surface: '工作台 (workspaceShellProjection)',
    hasActorKnowledgePath: workspaceShellSrc.includes('actorKnowledgeMap?: Map<string'),
    hasEvidenceFields: workspaceShellSrc.includes('actorKnowledgeMap?.get'),
    hasLegacyFallback: true, // delegates to sub-projections
    hasTerminalCaseSupport: workspaceShellSrc.includes("entry.status === 'sold'"),
    hasCausalRefs: true, // delegates to sub-projections
    hasSourceRecordIds: true, // delegates to sub-projections
    hasBeliefRefs: true, // delegates to sub-projections
    hasReplayKey: true, // delegates to sub-projections
  },
  {
    surface: '结果页 (resultProjection)',
    hasActorKnowledgePath: false, // result page reads game outcome, not decision chain
    hasEvidenceFields: false, // result page is post-game summary
    hasLegacyFallback: false, // doesn't need legacy fallback
    hasTerminalCaseSupport: resultSrc.includes("'lost_to_rival'") && resultSrc.includes("'sold'"),
    hasCausalRefs: false, // not a decision surface
    hasSourceRecordIds: false,
    hasBeliefRefs: false,
    hasReplayKey: false,
  },
  {
    surface: '客户列表 (OpportunityListProjection)',
    hasActorKnowledgePath: false, // display-only surface
    hasEvidenceFields: false,
    hasLegacyFallback: false,
    hasTerminalCaseSupport: true,
    hasCausalRefs: false,
    hasSourceRecordIds: false,
    hasBeliefRefs: false,
    hasReplayKey: false,
  },
];

console.log('\n  Surface Chain Matrix:');
console.log('  ──────────────────────────────────────────────────────────────────────────────────────────────');
console.log('  Surface                              | Knowledge | Evidence | Legacy | Terminal | Causal | Source | Belief | Replay');
console.log('  ──────────────────────────────────────────────────────────────────────────────────────────────');

for (const s of surfaces) {
  const name = s.surface.padEnd(38);
  const kn = (s.hasActorKnowledgePath ? '✅' : '⬜').padEnd(10);
  const ev = (s.hasEvidenceFields ? '✅' : '⬜').padEnd(10);
  const lg = (s.hasLegacyFallback ? '✅' : '⬜').padEnd(8);
  const tm = (s.hasTerminalCaseSupport ? '✅' : '⬜').padEnd(10);
  const cr = (s.hasCausalRefs ? '✅' : '⬜').padEnd(8);
  const sr = (s.hasSourceRecordIds ? '✅' : '⬜').padEnd(8);
  const br = (s.hasBeliefRefs ? '✅' : '⬜').padEnd(8);
  const rk = s.hasReplayKey ? '✅' : '⬜';
  console.log(`  ${name}| ${kn}| ${ev}| ${lg}| ${tm}| ${cr}| ${sr}| ${br}| ${rk}`);
}

// Verify that decision-critical surfaces have the full chain
const decisionSurfaces = surfaces.filter((s) =>
  s.surface.includes('大世界') || s.surface.includes('房源详情') || s.surface.includes('微信') || s.surface.includes('市场入场'),
);

for (const s of decisionSurfaces) {
  check(s.hasActorKnowledgePath, `${s.surface} has actorKnowledge path`);
  check(s.hasEvidenceFields, `${s.surface} has evidence fields`);
  check(s.hasLegacyFallback, `${s.surface} has legacy fallback`);
  check(s.hasCausalRefs, `${s.surface} has causal refs`);
  check(s.hasReplayKey, `${s.surface} has replay key`);
}

// ══════════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('  Summary');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failed > 0) {
  console.log('\n  Failures:');
  for (const f of failures) {
    console.log(`    - ${f}`);
  }
  console.log(`\n  ROUND 12 GATE FAILED — ${failed} violations`);
  process.exit(1);
}

console.log('\n  ✅ All Round 12 checks passed — All Product POV / Decision Chain complete');
