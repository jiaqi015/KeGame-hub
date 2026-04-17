import type { ScenarioDefinition, ScenarioSummary, WorldSpec } from '../domain/models.js';
import { withSellingHousesNeon } from './neonGameDatabase.js';

function toJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  return (value as T) ?? fallback;
}

interface ScenarioRow {
  scenario_json: unknown;
}

interface ScenarioWithWorldRow {
  scenario_json: unknown;
  world_json: unknown;
}

function toSummary(scenario: ScenarioDefinition): ScenarioSummary {
  return {
    id: scenario.id,
    difficultyId: scenario.difficultyId,
    name: scenario.name,
    theme: scenario.theme,
    description: scenario.description,
    caseCount: scenario.cases.length,
    maxDay: scenario.maxDay,
  };
}

export class NeonScenarioRepository {
  async listPublished(difficultyId?: string, limit = 20) {
    return withSellingHousesNeon(async (sql) => {
      const rows = (await sql.query(
        `
          SELECT scenario_json
          FROM selling_houses_scenarios
          WHERE published = TRUE
            AND ($1::text IS NULL OR difficulty_id = $1)
          ORDER BY updated_at DESC
          LIMIT $2
        `,
        [difficultyId || null, Math.max(1, Math.min(limit, 50))],
      )) as ScenarioRow[];

      return rows
        .map((row) => toJsonValue<ScenarioDefinition | null>(row.scenario_json, null))
        .filter((entry): entry is ScenarioDefinition => Boolean(entry))
        .map(toSummary);
    });
  }

  async getScenario(id: string) {
    return withSellingHousesNeon(async (sql) => {
      const rows = (await sql.query(
        `
          SELECT s.scenario_json, w.world_json
          FROM selling_houses_scenarios s
          JOIN selling_houses_worlds w ON w.id = s.world_id
          WHERE s.id = $1
            AND s.published = TRUE
          LIMIT 1
        `,
        [id],
      )) as ScenarioWithWorldRow[];

      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        scenario: toJsonValue<ScenarioDefinition | null>(row.scenario_json, null),
        world: toJsonValue<WorldSpec | null>(row.world_json, null),
      };
    });
  }
}
