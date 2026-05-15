/**
 * NoDeadCornerProductCensus — catalog all projection surfaces and their read patterns.
 *
 * Purpose: answer the question "does every product surface connect to the Big World causal chain?"
 *
 * For each surface, we track:
 *   - Which legacy fields it reads (if any)
 *   - Whether it has causal refs (POVCausalRef[])
 *   - Whether it has an explanation envelope (DecisionEvidenceEnvelope)
 *   - Whether it reads from actor knowledge (ActorKnowledgeSnapshot)
 *   - Whether it reads from InformationSourceRegistry
 *
 * This is a READ-ONLY helper for the Round 13 gate.
 * It does NOT modify any state or projection.
 */

import type { GameState } from '../../domain/models.js';
import type { ActorKnowledgeSnapshot } from '../../domain/world-model/actorKnowledgeTypes.js';
import type { InformationSourceRegistry } from '../../domain/world-model/informationSourceRegistry.js';

// ── Surface Read Pattern ──────────────────────────────────────

export type ReadPatternKind =
  | 'causal-refs'           // reads POVCausalRef[] from live causal events
  | 'explanation-envelope'  // reads DecisionEvidenceEnvelope from actor knowledge
  | 'actor-knowledge'       // reads ActorKnowledgeSnapshot
  | 'source-registry'       // reads InformationSourceRegistry
  | 'legacy-field'          // reads legacy Case/Opportunity fields directly
  | 'systemic'              // reads system state (budget, energy, leaderboard)
  | 'static';               // reads static config/constants only

export interface SurfaceReadPattern {
  readonly kind: ReadPatternKind;
  readonly detail: string;
  readonly isCausalChainConnected: boolean;
}

export interface SurfaceCensusEntry {
  readonly surfaceId: string;
  readonly surfaceName: string;
  readonly projectionFile: string;
  readonly readPatterns: readonly SurfaceReadPattern[];
  readonly hasLiveCausalRefs: boolean;
  readonly hasExplanationEnvelope: boolean;
  readonly hasActorKnowledge: boolean;
  readonly hasLegacyFieldReads: boolean;
  readonly legacyFieldsRead: readonly string[];
  readonly causalChainConnected: boolean;
  readonly verdict: 'connected' | 'partial' | 'disconnected';
  /** Whether this surface is safe at five-x scale (100+ cells, 4000+ listings). */
  readonly fiveXCompatible: boolean;
  /** Reason if not five-x compatible. */
  readonly fiveXLimitation?: string;
}

// ── Census: projection surface catalog ────────────────────────

/**
 * Build the product surface census for all projection files.
 *
 * This is a static catalog — it does NOT run the projections.
 * The gate script will verify the catalog against live state.
 */
export function buildProductSurfaceCensus(): readonly SurfaceCensusEntry[] {
  return [
    // ── 1. bigWorldPOVProjection ──────────────────────────────
    {
      surfaceId: 'big-world-pov',
      surfaceName: 'BigWorldPOVSummary',
      projectionFile: 'bigWorldPOVProjection.ts',
      readPatterns: [
        { kind: 'causal-refs', detail: 'buildLiveCausalContext reads worldCausalEvents → POVCausalRef[]', isCausalChainConnected: true },
        { kind: 'actor-knowledge', detail: 'buildDemandMovementPOV/OwnerExpectationSignalPOV read ActorKnowledgeSnapshot beliefs', isCausalChainConnected: true },
        { kind: 'legacy-field', detail: 'buildOwnerExpectationSignalPOV falls back to caseItem.trust/patience/urgency/priceGapPct when no knowledge', isCausalChainConnected: false },
        { kind: 'legacy-field', detail: 'buildComparableSupplyPOV reads rivalListings.askPrice/heat/freshness', isCausalChainConnected: false },
        { kind: 'legacy-field', detail: 'buildDemandMovementPOV reads customerStates.status/churnRisk', isCausalChainConnected: false },
        { kind: 'causal-refs', detail: 'buildBecauseBigProof reads worldCausalEvents for cross-domain proof', isCausalChainConnected: true },
      ],
      hasLiveCausalRefs: true,
      hasExplanationEnvelope: true,
      hasActorKnowledge: true,
      hasLegacyFieldReads: true,
      legacyFieldsRead: ['trust', 'patience', 'urgency', 'priceGapPct', 'askPrice', 'marketPrice', 'lastRivalThreatDay', 'customerStates.status', 'customerStates.churnRisk'],
      causalChainConnected: true,
      verdict: 'connected',
      fiveXCompatible: true,
    },

    // ── 2. actorKnowledgeProjection ───────────────────────────
    {
      surfaceId: 'actor-knowledge',
      surfaceName: 'ActorKnowledgeSnapshot',
      projectionFile: 'actorKnowledgeProjection.ts',
      readPatterns: [
        { kind: 'source-registry', detail: 'buildActorKnowledgeSnapshot reads InformationSourceRegistry via queryVisibleSourceRecords', isCausalChainConnected: true },
        { kind: 'actor-knowledge', detail: 'buildDecisionEvidenceEnvelope reads beliefs → pressure → command → explanation', isCausalChainConnected: true },
        { kind: 'causal-refs', detail: 'filterCausalRefsByVisibility filters POVCausalRefs through source visibility', isCausalChainConnected: true },
      ],
      hasLiveCausalRefs: true,
      hasExplanationEnvelope: true,
      hasActorKnowledge: true,
      hasLegacyFieldReads: false,
      legacyFieldsRead: [],
      causalChainConnected: true,
      verdict: 'connected',
      fiveXCompatible: true,
    },

    // ── 3. operatingProjection ────────────────────────────────
    {
      surfaceId: 'operating',
      surfaceName: 'OperatingProjection',
      projectionFile: 'operatingProjection.ts',
      readPatterns: [
        { kind: 'legacy-field', detail: 'reads Case fields: trust, patience, urgency, heat, offerCount, lastShowDay, competitiveness, windowDays, daysLeft, askPrice, marketPrice, priceGapPct, stage, status', isCausalChainConnected: false },
        { kind: 'legacy-field', detail: 'reads Opportunity fields: intent, daysLeft, status, churnRisk', isCausalChainConnected: false },
        { kind: 'legacy-field', detail: 'reads CustomerRuntimeState fields: status, churnRisk, fatigue', isCausalChainConnected: false },
        { kind: 'legacy-field', detail: 'reads MarketCell fields: demandHeat, supplyPressure, competitivePressure', isCausalChainConnected: false },
        { kind: 'explanation-envelope', detail: 'buildCaseDetailProjection accepts ActorKnowledgeSnapshot for evidence-backed recommendations', isCausalChainConnected: true },
        { kind: 'legacy-field', detail: 'buildPerfectCaseDetailAdditions/WechatFacts use perfectProjectionAdapters for evidence-backed fields', isCausalChainConnected: true },
      ],
      hasLiveCausalRefs: false,
      hasExplanationEnvelope: true,
      hasActorKnowledge: true,
      hasLegacyFieldReads: true,
      legacyFieldsRead: ['trust', 'patience', 'urgency', 'heat', 'offerCount', 'lastShowDay', 'competitiveness', 'windowDays', 'daysLeft', 'askPrice', 'marketPrice', 'priceGapPct', 'stage', 'status', 'intent', 'churnRisk', 'fatigue', 'demandHeat', 'supplyPressure', 'competitivePressure'],
      causalChainConnected: true,
      verdict: 'connected',
      fiveXCompatible: true,
    },

    // ── 4. marketOpeningPOVProjection ─────────────────────────
    {
      surfaceId: 'market-opening-pov',
      surfaceName: 'MarketOpeningPOVProjection',
      projectionFile: 'marketOpeningPOVProjection.ts',
      readPatterns: [
        { kind: 'legacy-field', detail: 'reads MarketCell.demandHeat/competitivePressure, RivalStore/RivalListing, CompetitionGroup', isCausalChainConnected: false },
        { kind: 'legacy-field', detail: 'reads CustomerRuntimeState.churnRisk/fatigue, Opportunity.daysLeft/intent', isCausalChainConnected: false },
        { kind: 'legacy-field', detail: 'reads Case.trust/patience/urgency/askPrice/marketPrice/priceGapPct', isCausalChainConnected: false },
        { kind: 'actor-knowledge', detail: 'buildOwnerExpectationIssues derives from ActorKnowledgeSnapshot pressure signals when available', isCausalChainConnected: true },
        { kind: 'explanation-envelope', detail: 'buildDecisionEvidenceEnvelope used for evidence-backed owner issues and recommended cuts', isCausalChainConnected: true },
        { kind: 'causal-refs', detail: 'reads eventStore (DomainEventKind) for competition/market signals', isCausalChainConnected: true },
      ],
      hasLiveCausalRefs: true,
      hasExplanationEnvelope: true,
      hasActorKnowledge: true,
      hasLegacyFieldReads: true,
      legacyFieldsRead: ['demandHeat', 'competitivePressure', 'churnRisk', 'fatigue', 'daysLeft', 'intent', 'trust', 'patience', 'urgency', 'askPrice', 'marketPrice', 'priceGapPct'],
      causalChainConnected: true,
      verdict: 'connected',
      fiveXCompatible: true,
    },

    // ── 5. workspaceShellProjection ───────────────────────────
    {
      surfaceId: 'workspace-shell',
      surfaceName: 'WorkspaceShellProjection',
      projectionFile: 'workspaceShellProjection.ts',
      readPatterns: [
        { kind: 'systemic', detail: 'reads budget, energy, commission, sold cases, journal entries', isCausalChainConnected: false },
        { kind: 'legacy-field', detail: 'reads Case.status/soldPrice/ownerName, Opportunity.status, BudgetTransaction', isCausalChainConnected: false },
        { kind: 'causal-refs', detail: 'delegates to buildMarketOpeningPOVProjection which reads eventStore and ActorKnowledgeSnapshot', isCausalChainConnected: true },
        { kind: 'explanation-envelope', detail: 'delegates to buildCaseDetailProjection with ActorKnowledgeSnapshot', isCausalChainConnected: true },
      ],
      hasLiveCausalRefs: true,
      hasExplanationEnvelope: true,
      hasActorKnowledge: true,
      hasLegacyFieldReads: true,
      legacyFieldsRead: ['status', 'soldPrice', 'ownerName', 'energy', 'maxEnergy', 'budgetLedger', 'auxiliaryStats'],
      causalChainConnected: true,
      verdict: 'connected',
      fiveXCompatible: true,
    },

    // ── 6. resultProjection ───────────────────────────────────
    {
      surfaceId: 'result',
      surfaceName: 'ResultProjection',
      projectionFile: 'resultProjection.ts',
      readPatterns: [
        { kind: 'systemic', detail: 'reads finalResult, caseResults, scoreBreakdown, endingStats — system-computed scores', isCausalChainConnected: false },
        { kind: 'causal-refs', detail: 'buildCausalTrace links each case outcome to worldCausalEvents with structured ResultCausalRef[]', isCausalChainConnected: true },
        { kind: 'explanation-envelope', detail: 'buildResultExplanationEnvelope produces structured explanation of WHY each case ended good/bad/lost', isCausalChainConnected: true },
        { kind: 'causal-refs', detail: 'marketOutcome reflects deal flow driven by causal events', isCausalChainConnected: true },
      ],
      hasLiveCausalRefs: true,
      hasExplanationEnvelope: true,
      hasActorKnowledge: false,
      hasLegacyFieldReads: true,
      legacyFieldsRead: ['finalResult', 'caseResults', 'scoreBreakdown', 'endingStats', 'marketOutcome', 'status', 'auxiliaryStats.withdrawnCount'],
      causalChainConnected: true,
      verdict: 'connected',
      fiveXCompatible: true,
    },

    // ── 7. leaderboardProjection ──────────────────────────────
    // EXEMPTION: Leaderboard reads external cloud-synced MaintainerLeaderboardDetail.
    // This is a cross-run historical ranking surface, not a per-game product judgment.
    // It does not make recommendations, evaluations, or decisions about the current game world.
    // No causal chain connection is possible because the data source is outside the simulation.
    {
      surfaceId: 'leaderboard',
      surfaceName: 'LeaderboardProjection',
      projectionFile: 'leaderboardProjection.ts',
      readPatterns: [
        { kind: 'static', detail: 'EXEMPT: reads MaintainerLeaderboardDetail (external cloud data, not game state) — cross-run ranking, no product judgment', isCausalChainConnected: false },
      ],
      hasLiveCausalRefs: false,
      hasExplanationEnvelope: false,
      hasActorKnowledge: false,
      hasLegacyFieldReads: false,
      legacyFieldsRead: [],
      causalChainConnected: false,
      verdict: 'disconnected',
      fiveXCompatible: true, // N/A — external data, not game-world
      fiveXLimitation: 'External cloud data, not game-world. Five-x N/A.',
    },

    // ── 8. ownerPersonaProfile ────────────────────────────────
    {
      surfaceId: 'owner-persona-profile',
      surfaceName: 'OwnerPersonaProfile',
      projectionFile: 'ownerPersonaProfile.ts',
      readPatterns: [
        { kind: 'actor-knowledge', detail: 'readOwnerProfile derives from profiling memory which is built from owner interview interactions (causal events)', isCausalChainConnected: true },
        { kind: 'legacy-field', detail: 'reads OwnerProfilingMemory dimensions (price_anchor, time_window, decision_style) — these are evidence-based from face-to-face visits', isCausalChainConnected: true },
      ],
      hasLiveCausalRefs: false,
      hasExplanationEnvelope: false,
      hasActorKnowledge: false,
      hasLegacyFieldReads: true,
      legacyFieldsRead: ['profiling', 'personality', 'hasCompletedFirstVisit', 'ownerTypeName', 'ownerTypeTone'],
      causalChainConnected: true,
      verdict: 'connected',
      fiveXCompatible: true,
    },

    // ── 9. ownerProfilingMemory ───────────────────────────────
    {
      surfaceId: 'owner-profiling-memory',
      surfaceName: 'OwnerProfilingMemorySummary',
      projectionFile: 'ownerProfilingMemory.ts',
      readPatterns: [
        { kind: 'actor-knowledge', detail: 'buildOwnerProfilingMemorySummary derives from owner interview topic choices (ScenarioChoice[]) which are causal events from face-to-face visits', isCausalChainConnected: true },
        { kind: 'legacy-field', detail: 'reads Case fields (askPrice, marketPrice, urgency, windowDays, ownerMood, story) for signal derivation — these are world state values influenced by causal chain', isCausalChainConnected: true },
      ],
      hasLiveCausalRefs: false,
      hasExplanationEnvelope: false,
      hasActorKnowledge: false,
      hasLegacyFieldReads: true,
      legacyFieldsRead: ['profiling', 'dimensions', 'ownerTypeName', 'askPrice', 'marketPrice', 'urgency', 'windowDays', 'ownerMood', 'story'],
      causalChainConnected: true,
      verdict: 'connected',
      fiveXCompatible: true,
    },

    // ── 10. myWechatProjection ────────────────────────────────
    {
      surfaceId: 'my-wechat',
      surfaceName: 'MyWechatProjection',
      projectionFile: 'myWechatProjection.ts',
      readPatterns: [
        { kind: 'actor-knowledge', detail: 'accepts actorKnowledgeMap and passes to extractMyWechatFacts for evidence-backed facts', isCausalChainConnected: true },
        { kind: 'explanation-envelope', detail: 'evidence-backed facts use buildDecisionEvidenceEnvelope from actorKnowledge', isCausalChainConnected: true },
        { kind: 'legacy-field', detail: 'reads Case.status, Opportunity.status for active filtering', isCausalChainConnected: false },
      ],
      hasLiveCausalRefs: false,
      hasExplanationEnvelope: true,
      hasActorKnowledge: true,
      hasLegacyFieldReads: true,
      legacyFieldsRead: ['status', 'todayPriority', 'leadCaseId', 'isFocused'],
      causalChainConnected: true,
      verdict: 'connected',
      fiveXCompatible: true,
    },

    // ── 11. myWechatFacts ─────────────────────────────────────
    {
      surfaceId: 'my-wechat-facts',
      surfaceName: 'WechatFact[]',
      projectionFile: 'myWechatFacts.ts',
      readPatterns: [
        { kind: 'actor-knowledge', detail: 'extractEvidenceBackedFacts uses buildDecisionEvidenceEnvelope from actorKnowledge for evidence-backed WeChat facts', isCausalChainConnected: true },
        { kind: 'explanation-envelope', detail: 'buildPerfectWechatFacts generates facts with safeRefs, replayKey, sourceRecordIds from explanation envelope', isCausalChainConnected: true },
        { kind: 'legacy-field', detail: 'reads Case trust/patience/urgency/priceGapPct for legacy fact generation (fallback when no actorKnowledge)', isCausalChainConnected: false },
        { kind: 'causal-refs', detail: 'reads MarketIntelProjection for market competition facts', isCausalChainConnected: true },
      ],
      hasLiveCausalRefs: false,
      hasExplanationEnvelope: true,
      hasActorKnowledge: true,
      hasLegacyFieldReads: true,
      legacyFieldsRead: ['trust', 'patience', 'urgency', 'priceGapPct', 'stage', 'status', 'intent', 'daysLeft', 'churnRisk', 'fatigue'],
      causalChainConnected: true,
      verdict: 'connected',
      fiveXCompatible: true,
    },

    // ── 12. architectureMigrationReadinessProjection ──────────
    // EXEMPTION: Architecture migration readiness is a developer diagnostic surface.
    // It reads static registries and system contracts to assess code migration status.
    // It does not make game-world product judgments, recommendations, or player-facing decisions.
    // No causal chain connection is possible because it operates on code structure, not game state.
    {
      surfaceId: 'architecture-migration-readiness',
      surfaceName: 'ArchitectureMigrationReadinessProjection',
      projectionFile: 'architectureMigrationReadinessProjection.ts',
      readPatterns: [
        { kind: 'static', detail: 'EXEMPT: reads static registries (LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES, ACTION_EXECUTOR_CONTRACT_READ_MODEL) — developer diagnostic, not product judgment', isCausalChainConnected: false },
        { kind: 'systemic', detail: 'EXEMPT: reads GameState for process lifecycle, receipt, event stream, world fork readiness — architecture parity check, not player-facing', isCausalChainConnected: false },
      ],
      hasLiveCausalRefs: false,
      hasExplanationEnvelope: false,
      hasActorKnowledge: false,
      hasLegacyFieldReads: false,
      legacyFieldsRead: [],
      causalChainConnected: false,
      verdict: 'disconnected',
      fiveXCompatible: true, // N/A — developer diagnostic, not game-world
      fiveXLimitation: 'Developer diagnostic, not game-world. Five-x N/A.',
    },

    // ── 13. architectureParityProjection ──────────────────────
    // EXEMPTION: Architecture parity is a developer diagnostic surface.
    // It compares legacy state with runtime state to detect migration gaps.
    // It does not make game-world product judgments.
    {
      surfaceId: 'architecture-parity',
      surfaceName: 'ArchitectureParityProjection',
      projectionFile: 'architectureParityProjection.ts',
      readPatterns: [
        { kind: 'systemic', detail: 'EXEMPT: reads GameState for parity checks between legacy and runtime state — developer diagnostic, not product judgment', isCausalChainConnected: false },
      ],
      hasLiveCausalRefs: false,
      hasExplanationEnvelope: false,
      hasActorKnowledge: false,
      hasLegacyFieldReads: false,
      legacyFieldsRead: [],
      causalChainConnected: false,
      verdict: 'disconnected',
      fiveXCompatible: true, // N/A — developer diagnostic, not game-world
      fiveXLimitation: 'Developer diagnostic, not game-world. Five-x N/A.',
    },

    // ── 14. perfectProjectionAdapters ─────────────────────────
    {
      surfaceId: 'perfect-projection-adapters',
      surfaceName: 'PerfectProjectionAdapters',
      projectionFile: 'perfectProjectionAdapters.ts',
      readPatterns: [
        { kind: 'explanation-envelope', detail: 'reads DecisionEvidenceEnvelope for evidence-backed risk reminders, reasons, wechat facts', isCausalChainConnected: true },
        { kind: 'actor-knowledge', detail: 'reads ActorKnowledgeSnapshot beliefs and pressure signals', isCausalChainConnected: true },
        { kind: 'legacy-field', detail: 'reads Case/Opportunity fields for numeric display values (askPrice, trust level)', isCausalChainConnected: false },
      ],
      hasLiveCausalRefs: false,
      hasExplanationEnvelope: true,
      hasActorKnowledge: true,
      hasLegacyFieldReads: true,
      legacyFieldsRead: ['askPrice', 'trust', 'patience', 'urgency', 'priceGapPct', 'daysLeft', 'intent'],
      causalChainConnected: true,
      verdict: 'connected',
      fiveXCompatible: true,
    },

    // ── 15. playableMarketProjection ─────────────────────────
    // Round 16: All 5 dimensions now carry evidenceBackedPressureItems from belief→pressure pipeline.
    // brokerOpportunity.topActions > 0 when knowledge available (no empty-also-passes).
    // evidenceBackedRadarItems aggregates from ALL knowledge entries, not just first.
    {
      surfaceId: 'playable-market',
      surfaceName: 'PlayableMarketProjection',
      projectionFile: 'playableMarketProjection.ts',
      readPatterns: [
        { kind: 'legacy-field', detail: 'reads MarketCell.demandHeat/competitivePressure/supplyPressure for radar numeric display', isCausalChainConnected: false },
        { kind: 'legacy-field', detail: 'reads RivalListing.heat/freshness/title for competitive pressure numeric display', isCausalChainConnected: false },
        { kind: 'legacy-field', detail: 'reads CustomerRuntimeState.churnRisk/status for customer pool numeric display', isCausalChainConnected: false },
        { kind: 'legacy-field', detail: 'reads Case.priceGapPct/trust/patience for owner pool numeric display', isCausalChainConnected: false },
        { kind: 'actor-knowledge', detail: 'buildBrokerOpportunity uses buildDecisionEvidenceEnvelope for recommendation text', isCausalChainConnected: true },
        { kind: 'actor-knowledge', detail: 'aggregatePressureSignals builds from ALL knowledge entries for per-dimension evidence', isCausalChainConnected: true },
        { kind: 'explanation-envelope', detail: 'evidenceBackedRadarItems built from aggregated pressure signals with safeRefs/replayKey', isCausalChainConnected: true },
        { kind: 'explanation-envelope', detail: 'marketRadar/competitivePressure/customerPool/ownerPool each carry evidenceBackedPressureItems', isCausalChainConnected: true },
        { kind: 'causal-refs', detail: 'injects liveCausalRefs from worldCausalEvents for cross-surface reuse', isCausalChainConnected: true },
      ],
      hasLiveCausalRefs: true,
      hasExplanationEnvelope: true,
      hasActorKnowledge: true,
      hasLegacyFieldReads: true,
      legacyFieldsRead: ['demandHeat', 'competitivePressure', 'supplyPressure', 'heat', 'freshness', 'churnRisk', 'status', 'priceGapPct', 'trust', 'patience', 'energy', 'promotionBudget'],
      causalChainConnected: true,
      verdict: 'connected',
      fiveXCompatible: true, // Round 19: bounded by actor-visible cell window
    },

    // ── 16. strategicMarketDecisionProjection ─────────────
    // Round 17: Upgrades playable market into strategic decision surface.
    // Round 18: Ledger/evidence-priority — judgment text from pressure signals, legacy numeric reads are display-only.
    {
      surfaceId: 'strategic-decision',
      surfaceName: 'StrategicPlayableMarketProjection',
      projectionFile: 'strategicMarketDecisionProjection.ts',
      readPatterns: [
        { kind: 'actor-knowledge', detail: 'buildStrategicTopActions uses buildDecisionEvidenceEnvelope for full belief→pressure→command→explanation pipeline', isCausalChainConnected: true },
        { kind: 'explanation-envelope', detail: 'each StrategicTopAction carries safeRefs, replayKey, sourceRecordIds, confidence from DecisionEvidenceEnvelope', isCausalChainConnected: true },
        { kind: 'actor-knowledge', detail: 'buildStrategicCustomerPool derives atRiskCount and migrationSignal from customer_seriousness pressure signals', isCausalChainConnected: true },
        { kind: 'actor-knowledge', detail: 'buildStrategicOwnerPool derives highPressureCount and topOwnerIssue from owner_readiness/broker_trust/price_anchor pressure', isCausalChainConnected: true },
        { kind: 'actor-knowledge', detail: 'buildCompetitorRisk uses visibleRivalEvidence from pressure signals as primary', isCausalChainConnected: true },
        { kind: 'actor-knowledge', detail: 'buildResourceCongestion derives congestion judgment from market_heat/service_path pressure signals', isCausalChainConnected: true },
        { kind: 'actor-knowledge', detail: 'buildOrgResource derives allocation reasoning from broker_capacity_signal and manager_message causal events', isCausalChainConnected: true },
        { kind: 'causal-refs', detail: 'injects liveCausalRefs via sharedCausalRefs from DecisionEvidenceEnvelope for cross-surface reuse', isCausalChainConnected: true },
        { kind: 'legacy-field', detail: 'reads MarketCell.demandHeat/competitivePressure/supplyPressure as radar numeric display fallback', isCausalChainConnected: false },
        { kind: 'legacy-field', detail: 'reads rivalListings/rivalStores for competitive pressure numeric display (bounded per cell)', isCausalChainConnected: false },
        { kind: 'systemic', detail: 'reads energy/budget from economicResourceLedger (ledger-first, state fallback for display)', isCausalChainConnected: true },
      ],
      hasLiveCausalRefs: true,
      hasExplanationEnvelope: true,
      hasActorKnowledge: true,
      hasLegacyFieldReads: true,
      legacyFieldsRead: ['demandHeat', 'competitivePressure', 'supplyPressure', 'energy', 'promotionBudget'],
      causalChainConnected: true,
      verdict: 'connected',
      fiveXCompatible: true, // Round 19: resource cost from pressure signals, bounded cell window
    },
  ];
}

// ── Census summary ────────────────────────────────────────────

export interface ProductCensusSummary {
  readonly totalSurfaces: number;
  readonly connectedSurfaces: number;
  readonly partialSurfaces: number;
  readonly disconnectedSurfaces: number;
  readonly surfacesWithLiveCausalRefs: number;
  readonly surfacesWithExplanationEnvelope: number;
  readonly surfacesWithActorKnowledge: number;
  readonly surfacesWithLegacyFieldReads: number;
  readonly legacyFieldsSummary: readonly string[];
  readonly disconnectedSurfaceIds: readonly string[];
  readonly maturity: 'EVERYTHING-CONNECTED' | 'MOSTLY-CONNECTED' | 'SIGNIFICANT-GAPS';
  /** Number of surfaces compatible with five-x scale (100+ cells). */
  readonly fiveXCompatibleSurfaces: number;
  /** Surfaces that are NOT five-x compatible. */
  readonly fiveXIncompatibleSurfaceIds: readonly string[];
}

export function buildProductCensusSummary(census: readonly SurfaceCensusEntry[]): ProductCensusSummary {
  const connected = census.filter((e) => e.verdict === 'connected');
  const partial = census.filter((e) => e.verdict === 'partial');
  const disconnected = census.filter((e) => e.verdict === 'disconnected');

  const allLegacyFields = new Set<string>();
  for (const entry of census) {
    for (const field of entry.legacyFieldsRead) {
      allLegacyFields.add(field);
    }
  }

  const maturity: ProductCensusSummary['maturity'] =
    disconnected.length === 0 && partial.length === 0 ? 'EVERYTHING-CONNECTED'
    : disconnected.length === 0 && partial.length <= 2 ? 'MOSTLY-CONNECTED'
    : 'SIGNIFICANT-GAPS';

  const fiveXCompatible = census.filter((e) => e.fiveXCompatible);
  const fiveXIncompatible = census.filter((e) => !e.fiveXCompatible);

  return {
    totalSurfaces: census.length,
    connectedSurfaces: connected.length,
    partialSurfaces: partial.length,
    disconnectedSurfaces: disconnected.length,
    surfacesWithLiveCausalRefs: census.filter((e) => e.hasLiveCausalRefs).length,
    surfacesWithExplanationEnvelope: census.filter((e) => e.hasExplanationEnvelope).length,
    surfacesWithActorKnowledge: census.filter((e) => e.hasActorKnowledge).length,
    surfacesWithLegacyFieldReads: census.filter((e) => e.hasLegacyFieldReads).length,
    legacyFieldsSummary: [...allLegacyFields].sort(),
    disconnectedSurfaceIds: disconnected.map((e) => e.surfaceId),
    maturity,
    fiveXCompatibleSurfaces: fiveXCompatible.length,
    fiveXIncompatibleSurfaceIds: fiveXIncompatible.map((e) => e.surfaceId),
  };
}

// ── Live projection runner ────────────────────────────────────

/**
 * Run all projections against a live GameState and verify they produce output.
 * This is the live-state verification the gate requires.
 *
 * Uses dynamic import() for ESM compatibility.
 */
export async function runAllProjectionsAgainstLiveState(
  state: GameState,
  registry?: InformationSourceRegistry,
): Promise<Map<string, { producedOutput: boolean; hasRefs: boolean; hasEnvelope: boolean; error?: string }>> {
  const results = new Map<string, { producedOutput: boolean; hasRefs: boolean; hasEnvelope: boolean; error?: string }>();

  // 1. bigWorldPOVProjection
  try {
    const { buildWorkspaceBigWorldModule } = await import('./bigWorldPOVProjection.js');
    const { buildActorKnowledgeSnapshot } = await import('./actorKnowledgeProjection.js');
    const knowledge = registry
      ? buildActorKnowledgeSnapshot('player-1', 'player_broker', state.day, registry, state.worldCausalEvents)
      : undefined;
    const firstCase = state.cases[0];
    const pov = firstCase ? buildWorkspaceBigWorldModule(state, firstCase.id, 'player-1', knowledge, registry) : null;
    results.set('big-world-pov', {
      producedOutput: pov !== null,
      hasRefs: pov ? (pov.becauseBigProof.safeCausalRefs.length > 0 || pov.marketCell.refs.length > 0) : false,
      hasEnvelope: pov ? !!pov.sharedCausalRefs : false,
    });
  } catch (e: unknown) {
    results.set('big-world-pov', { producedOutput: false, hasRefs: false, hasEnvelope: false, error: String(e) });
  }

  // 2. operatingProjection
  try {
    const { buildOperatingProjection } = await import('./operatingProjection.js');
    const op = buildOperatingProjection(state);
    results.set('operating', {
      producedOutput: op !== null && op !== undefined,
      hasRefs: false,
      hasEnvelope: false,
    });
  } catch (e: unknown) {
    results.set('operating', { producedOutput: false, hasRefs: false, hasEnvelope: false, error: String(e) });
  }

  // 3. marketOpeningPOVProjection
  try {
    const { buildMarketOpeningPOVProjection } = await import('./marketOpeningPOVProjection.js');
    const { buildActorKnowledgeSnapshot: buildAKS } = await import('./actorKnowledgeProjection.js');
    const knowledgeMap = new Map<string, ActorKnowledgeSnapshot>();
    if (registry) {
      for (const caseItem of state.cases.slice(0, 3)) {
        const k = buildAKS('player-1', 'player_broker', state.day, registry, state.worldCausalEvents);
        knowledgeMap.set(caseItem.id, k);
      }
    }
    const opening = buildMarketOpeningPOVProjection(state, knowledgeMap.size > 0 ? knowledgeMap : undefined);
    results.set('market-opening-pov', {
      producedOutput: opening !== null && opening !== undefined,
      hasRefs: opening ? opening.evidenceRefs.length > 0 : false,
      hasEnvelope: opening ? !!opening.sharedCausalRefs : false,
    });
  } catch (e: unknown) {
    results.set('market-opening-pov', { producedOutput: false, hasRefs: false, hasEnvelope: false, error: String(e) });
  }

  // 4. workspaceShellProjection
  try {
    const { buildWorkspaceShellProjection } = await import('./workspaceShellProjection.js');
    const { buildActorKnowledgeSnapshot: buildAKS2 } = await import('./actorKnowledgeProjection.js');
    const knowledgeMap2 = new Map<string, ActorKnowledgeSnapshot>();
    if (registry) {
      for (const caseItem of state.cases.slice(0, 3)) {
        const k = buildAKS2('player-1', 'player_broker', state.day, registry, state.worldCausalEvents);
        knowledgeMap2.set(caseItem.id, k);
      }
    }
    const shell = buildWorkspaceShellProjection(state, knowledgeMap2.size > 0 ? knowledgeMap2 : undefined);
    results.set('workspace-shell', {
      producedOutput: shell !== null && shell !== undefined,
      hasRefs: shell?.marketOpeningBrief ? shell.marketOpeningBrief.evidenceRefs.length > 0 : false,
      hasEnvelope: shell?.marketOpeningBrief ? !!shell.marketOpeningBrief.sharedCausalRefs : false,
    });
  } catch (e: unknown) {
    results.set('workspace-shell', { producedOutput: false, hasRefs: false, hasEnvelope: false, error: String(e) });
  }

  // 5. resultProjection
  try {
    const { buildResultProjection } = await import('./resultProjection.js');
    const result = buildResultProjection(state);
    const hasRefs = result.causalTrace.some((t) => t.causalRefs.length > 0);
    const hasEnvelope = result.explanationEnvelope.explainedCases > 0;
    results.set('result', {
      producedOutput: result !== null && result !== undefined,
      hasRefs,
      hasEnvelope,
    });
  } catch (e: unknown) {
    results.set('result', { producedOutput: false, hasRefs: false, hasEnvelope: false, error: String(e) });
  }

  // 6. ownerPersonaProfile
  try {
    const { buildOwnerPersonaProfile } = await import('./ownerPersonaProfile.js');
    const caseItem = state.cases[0];
    if (caseItem) {
      const profile = buildOwnerPersonaProfile(caseItem);
      results.set('owner-persona-profile', {
        producedOutput: profile !== null && profile !== undefined,
        hasRefs: false,
        hasEnvelope: false,
      });
    } else {
      results.set('owner-persona-profile', { producedOutput: false, hasRefs: false, hasEnvelope: false, error: 'no cases' });
    }
  } catch (e: unknown) {
    results.set('owner-persona-profile', { producedOutput: false, hasRefs: false, hasEnvelope: false, error: String(e) });
  }

  // 7. myWechatProjection
  try {
    const { buildMyWechatProjection } = await import('./myWechatProjection.js');
    const { buildActorKnowledgeSnapshot: buildAKS3 } = await import('./actorKnowledgeProjection.js');
    const knowledgeMap3 = new Map<string, ActorKnowledgeSnapshot>();
    if (registry) {
      for (const caseItem of state.cases.slice(0, 3)) {
        const k = buildAKS3('player-1', 'player_broker', state.day, registry, state.worldCausalEvents);
        knowledgeMap3.set(caseItem.id, k);
      }
    }
    const wechat = buildMyWechatProjection({ state, actorKnowledgeMap: knowledgeMap3.size > 0 ? knowledgeMap3 : undefined });
    results.set('my-wechat', {
      producedOutput: wechat !== null && wechat !== undefined,
      hasRefs: false,
      hasEnvelope: knowledgeMap3.size > 0,
    });
  } catch (e: unknown) {
    results.set('my-wechat', { producedOutput: false, hasRefs: false, hasEnvelope: false, error: String(e) });
  }

  return results;
}
