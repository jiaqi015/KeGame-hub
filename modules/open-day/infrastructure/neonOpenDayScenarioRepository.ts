import type {
  OpenDayScenarioTemplateRecord,
  OpenDayScenarioTemplateSummary,
} from '../domain/openDay.types.js';
import type { OpenDayScenarioRepository } from '../application/openDayScenarioRepository.js';
import { withOpenDayNeon } from './neonOpenDayDatabase.js';

interface ScenarioRow {
  id: string;
  name: string;
  description: string;
  formula_id: string;
  parameter_package_id: string | null;
  config_version: string;
  updated_at: string;
}

export class NeonOpenDayScenarioRepository implements OpenDayScenarioRepository {
  async save(template: OpenDayScenarioTemplateRecord): Promise<void> {
    await withOpenDayNeon(async (sql) => {
      await sql.query(
        `
          INSERT INTO open_day_scenario_templates (
            id, name, description, formula_id, parameter_package_id, config_version, updated_at, scenario_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          ON CONFLICT (id)
          DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            formula_id = EXCLUDED.formula_id,
            parameter_package_id = EXCLUDED.parameter_package_id,
            config_version = EXCLUDED.config_version,
            updated_at = EXCLUDED.updated_at,
            scenario_json = EXCLUDED.scenario_json
        `,
        [
          template.summary.id,
          template.summary.name,
          template.summary.description,
          template.summary.formulaId,
          template.summary.parameterPackageId,
          template.summary.configVersion,
          template.summary.updatedAt,
          JSON.stringify(template.scenario),
        ],
      );
    });
  }

  async list(limit: number): Promise<OpenDayScenarioTemplateSummary[]> {
    return withOpenDayNeon(async (sql) => {
      const rows = (await sql.query(
        `
          SELECT
            id,
            name,
            description,
            formula_id,
            parameter_package_id,
            config_version,
            updated_at
          FROM open_day_scenario_templates
          ORDER BY updated_at DESC
          LIMIT $1
        `,
        [limit],
      )) as ScenarioRow[];

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        formulaId: row.formula_id as OpenDayScenarioTemplateSummary['formulaId'],
        parameterPackageId: row.parameter_package_id,
        configVersion: row.config_version,
        updatedAt: row.updated_at,
      }));
    });
  }
}
