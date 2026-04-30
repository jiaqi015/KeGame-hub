/**
 * GameState top-level field ownership contract.
 *
 * GameState is the root runtime container. Most fields fall into:
 * - runtime-session: game identity, save/load mechanics, day progression
 * - resource: energy, budget, derived metrics
 * - collection-identity: references to child collections (cases, opportunities, etc.)
 * - process-state: focus meeting, today plan, weekly reviews
 * - projection-ui: daily report, final result, selected case
 * - deprecated-legacy: compatibility mirrors for older saves
 *
 * This registry covers scalar/state fields on GameState. The child collections
 * (Case[], Opportunity[], ClosedDealRecord[], etc.) have their own ownership registries.
 */

export type LegacyGamestateCanonicalOwner =
  | 'runtime-session'
  | 'resource'
  | 'process-state'
  | 'projection-ui'
  | 'market-runtime'
  | 'narrative-runtime'
  | 'deprecated-legacy';

export type LegacyGamestateFieldRole =
  | 'canonical-temporary'
  | 'compatibility-mirror'
  | 'future-migration';

export type LegacyGamestateDomainFacet =
  | 'session'
  | 'resource'
  | 'process'
  | 'projection'
  | 'market'
  | 'narrative'
  | 'legacy';

export interface LegacyGamestateFieldOwnership {
  canonicalOwner: LegacyGamestateCanonicalOwner;
  legacyRole: LegacyGamestateFieldRole;
  domainFacet: LegacyGamestateDomainFacet;
  targetConcept?: string;
  migrationNote: string;
}

export interface LegacyGamestateFieldOwnershipEntry extends LegacyGamestateFieldOwnership {
  field: string;
}

/**
 * Curated set of GameState fields with semantic ownership assignments.
 * Not exhaustive — covers fields that have mother-model relevance.
 * Collection fields (cases[], opportunities[], etc.) are covered by their element registries.
 */
export const LEGACY_GAMESTATE_FIELD_OWNERSHIP_REGISTRY: Readonly<Record<string, LegacyGamestateFieldOwnership>> = {
  version: {
    canonicalOwner: 'runtime-session',
    legacyRole: 'canonical-temporary',
    domainFacet: 'session',
    targetConcept: 'RuntimeSession.schemaVersion',
    migrationNote: 'Schema version is runtime session metadata.',
  },
  runId: {
    canonicalOwner: 'runtime-session',
    legacyRole: 'canonical-temporary',
    domainFacet: 'session',
    targetConcept: 'RuntimeSession.runId',
    migrationNote: 'Run id is the session identity.',
  },
  day: {
    canonicalOwner: 'runtime-session',
    legacyRole: 'canonical-temporary',
    domainFacet: 'session',
    targetConcept: 'RuntimeSession.currentDay',
    migrationNote: 'Current day is the runtime session clock.',
  },
  maxDay: {
    canonicalOwner: 'runtime-session',
    legacyRole: 'canonical-temporary',
    domainFacet: 'session',
    targetConcept: 'RuntimeSession.maxDay / Scenario.duration',
    migrationNote: 'Max day is session/scenario configuration.',
  },
  currentDate: {
    canonicalOwner: 'runtime-session',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'session',
    targetConcept: 'RuntimeSession.currentDate',
    migrationNote: 'Current date is a derived display mirror of day.',
  },
  energy: {
    canonicalOwner: 'resource',
    legacyRole: 'canonical-temporary',
    domainFacet: 'resource',
    targetConcept: 'ResourceState.energy',
    migrationNote: 'Energy is the player action resource for the current day.',
  },
  maxEnergy: {
    canonicalOwner: 'resource',
    legacyRole: 'canonical-temporary',
    domainFacet: 'resource',
    targetConcept: 'ResourceState.maxEnergy / DailyRoutine.energy',
    migrationNote: 'Max energy is day routine configuration.',
  },
  cash: {
    canonicalOwner: 'deprecated-legacy',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'legacy',
    targetConcept: 'ResourceState.promotionBudget',
    migrationNote: 'Legacy compatibility mirror. Runtime code should use auxiliaryStats.promotionBudget.',
  },
  selectedCaseId: {
    canonicalOwner: 'projection-ui',
    legacyRole: 'future-migration',
    domainFacet: 'projection',
    targetConcept: 'SessionViewport.selectedCaseId',
    migrationNote: 'Selected case is player viewport/session state.',
  },
  gameOver: {
    canonicalOwner: 'runtime-session',
    legacyRole: 'canonical-temporary',
    domainFacet: 'session',
    targetConcept: 'RuntimeSession.gameOver',
    migrationNote: 'Game over flag is session lifecycle state.',
  },
  rules: {
    canonicalOwner: 'runtime-session',
    legacyRole: 'canonical-temporary',
    domainFacet: 'session',
    targetConcept: 'Scenario.rules',
    migrationNote: 'Game rules are scenario configuration.',
  },
  rngState: {
    canonicalOwner: 'runtime-session',
    legacyRole: 'canonical-temporary',
    domainFacet: 'session',
    targetConcept: 'RuntimeSession.rngState',
    migrationNote: 'RNG state is deterministic session state.',
  },
  rngCalls: {
    canonicalOwner: 'runtime-session',
    legacyRole: 'canonical-temporary',
    domainFacet: 'session',
    targetConcept: 'RuntimeSession.rngCalls',
    migrationNote: 'RNG call count is deterministic session state.',
  },
  competitionGroups: {
    canonicalOwner: 'market-runtime',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'market',
    targetConcept: 'CompetitionGroup[] / CaseCompetitionRelation[]',
    migrationNote: 'Competition groups are market competition structure, should derive from CaseCompetitionRelation.',
  },
  markets: {
    canonicalOwner: 'market-runtime',
    legacyRole: 'canonical-temporary',
    domainFacet: 'market',
    targetConcept: 'Region[] / MarketCell[]',
    migrationNote: 'Market cells are world-region facts.',
  },
  customers: {
    canonicalOwner: 'market-runtime',
    legacyRole: 'canonical-temporary',
    domainFacet: 'market',
    targetConcept: 'Customer[]',
    migrationNote: 'Customer profiles are market-side entities.',
  },
  channels: {
    canonicalOwner: 'market-runtime',
    legacyRole: 'canonical-temporary',
    domainFacet: 'market',
    targetConcept: 'Channel[]',
    migrationNote: 'Channel profiles are market-side entities.',
  },
  focusMeeting: {
    canonicalOwner: 'process-state',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'process',
    targetConcept: 'FocusMeetingProcess.state',
    migrationNote: 'Focus meeting state mirrors a business process.',
  },
  todayPlan: {
    canonicalOwner: 'process-state',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'process',
    targetConcept: 'DailyPlan.state',
    migrationNote: 'Today plan mirrors daily arrangement process state.',
  },
  currentReport: {
    canonicalOwner: 'projection-ui',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'projection',
    targetConcept: 'DailyReportProjection',
    migrationNote: 'Current report is a UI projection output.',
  },
  finalResult: {
    canonicalOwner: 'projection-ui',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'projection',
    targetConcept: 'GameResultProjection',
    migrationNote: 'Final result is a settlement projection output.',
  },
  scheduledEvents: {
    canonicalOwner: 'narrative-runtime',
    legacyRole: 'canonical-temporary',
    domainFacet: 'narrative',
    targetConcept: 'ScriptedEvent[] / NarrativeSchedule',
    migrationNote: 'Scheduled events are narrative/scripted event definitions.',
  },
  flowProgress: {
    canonicalOwner: 'process-state',
    legacyRole: 'future-migration',
    domainFacet: 'process',
    targetConcept: 'ProcessFlow.progress',
    migrationNote: 'Flow progress tracks business process progression.',
  },
  productRuns: {
    canonicalOwner: 'process-state',
    legacyRole: 'canonical-temporary',
    domainFacet: 'process',
    targetConcept: 'ProductRun[] / BusinessProcessRun[]',
    migrationNote: 'Product runs are business process instances.',
  },
  marketShadow: {
    canonicalOwner: 'market-runtime',
    legacyRole: 'compatibility-mirror',
    domainFacet: 'market',
    targetConcept: 'ShadowMarketState / MarketSimulationState',
    migrationNote: 'Market shadow is a runtime market simulation state mirror.',
  },
};

export const LEGACY_GAMESTATE_FIELD_OWNERSHIP_ENTRIES: readonly LegacyGamestateFieldOwnershipEntry[] =
  Object.freeze(
    Object.entries(LEGACY_GAMESTATE_FIELD_OWNERSHIP_REGISTRY).map(([field, ownership]) =>
      Object.freeze({
        field,
        ...ownership,
      })),
  );

export function getLegacyGamestateFieldOwnership(field: string): LegacyGamestateFieldOwnership | undefined {
  return LEGACY_GAMESTATE_FIELD_OWNERSHIP_REGISTRY[field];
}

export function getLegacyGamestateFieldsByCanonicalOwner(
  owner: LegacyGamestateCanonicalOwner,
): readonly LegacyGamestateFieldOwnershipEntry[] {
  return LEGACY_GAMESTATE_FIELD_OWNERSHIP_ENTRIES.filter((entry) => entry.canonicalOwner === owner);
}
