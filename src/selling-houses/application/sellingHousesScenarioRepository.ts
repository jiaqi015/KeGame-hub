import type { ScenarioDefinition, ScenarioSummary, WorldSpec } from '../domain/models.js';

export interface SellingHousesScenarioRepository {
  listPublished(difficultyId?: string, limit?: number): Promise<ScenarioSummary[]>;
  getScenario(id: string): Promise<{ scenario: ScenarioDefinition | null; world: WorldSpec | null } | null>;
}
