import type {
  OpenDayScenarioTemplateRecord,
  OpenDayScenarioTemplateSummary,
  OpenDayScenarioTemplateVersionSummary,
} from '../domain/openDay.types.js';
import type { OpenDayScenarioRepository } from '../application/openDayScenarioRepository.js';
import { withOpenDayNeon } from './neonOpenDayDatabase.js';

interface ScenarioRow {
  id: string;
  created_at?: string;
  name: string;
  description: string;
  formula_id: string;
  parameter_package_id: string | null;
  config_version: string;
  updated_at: string;
  latest_version_id?: string | null;
  current_version_no?: number;
  scenario_json?: unknown;
}

export class NeonOpenDayScenarioRepository implements OpenDayScenarioRepository {
  async save(template: OpenDayScenarioTemplateRecord): Promise<void> {
    await withOpenDayNeon(async (sql) => {
      const createdAt = template.latestVersion?.createdAt || template.summary.updatedAt;
      await sql.query(
        `
          INSERT INTO open_day_scenario_templates (
            id, created_at, name, description, formula_id, parameter_package_id, config_version, updated_at, latest_version_id, current_version_no, scenario_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
          ON CONFLICT (id)
          DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            formula_id = EXCLUDED.formula_id,
            parameter_package_id = EXCLUDED.parameter_package_id,
            config_version = EXCLUDED.config_version,
            updated_at = EXCLUDED.updated_at,
            latest_version_id = EXCLUDED.latest_version_id,
            current_version_no = EXCLUDED.current_version_no,
            scenario_json = EXCLUDED.scenario_json
        `,
        [
          template.summary.id,
          createdAt,
          template.summary.name,
          template.summary.description,
          template.summary.formulaId,
          template.summary.parameterPackageId,
          template.summary.configVersion,
          template.summary.updatedAt,
          template.summary.latestVersionId || null,
          template.summary.currentVersionNo || 1,
          JSON.stringify(template.scenario),
        ],
      );

      if (template.latestVersion) {
        await sql.query(
          `
            INSERT INTO open_day_scenario_template_versions (
              id,
              template_id,
              version_no,
              created_at,
              formula_id,
              parameter_package_id,
              config_version,
              scenario_json,
              change_note
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
            ON CONFLICT (id)
            DO UPDATE SET
              version_no = EXCLUDED.version_no,
              created_at = EXCLUDED.created_at,
              formula_id = EXCLUDED.formula_id,
              parameter_package_id = EXCLUDED.parameter_package_id,
              config_version = EXCLUDED.config_version,
              scenario_json = EXCLUDED.scenario_json,
              change_note = EXCLUDED.change_note
          `,
          [
            template.latestVersion.id,
            template.summary.id,
            template.latestVersion.versionNo,
            template.latestVersion.createdAt,
            template.summary.formulaId,
            template.summary.parameterPackageId,
            template.summary.configVersion,
            JSON.stringify(template.scenario),
            '',
          ],
        );
      }
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
            updated_at,
            latest_version_id,
            current_version_no
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
        latestVersionId: row.latest_version_id || '',
        currentVersionNo: Number(row.current_version_no || 1),
      }));
    });
  }

  async get(id: string): Promise<OpenDayScenarioTemplateRecord | null> {
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
            updated_at,
            latest_version_id,
            current_version_no,
            scenario_json
          FROM open_day_scenario_templates
          WHERE id = $1
          LIMIT 1
        `,
        [id],
      )) as ScenarioRow[];

      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        summary: {
          id: row.id,
          name: row.name,
          description: row.description,
          formulaId: row.formula_id as OpenDayScenarioTemplateSummary['formulaId'],
          parameterPackageId: row.parameter_package_id,
          configVersion: row.config_version,
          updatedAt: row.updated_at,
          latestVersionId: row.latest_version_id || '',
          currentVersionNo: Number(row.current_version_no || 1),
        },
        scenario: row.scenario_json as OpenDayScenarioTemplateRecord['scenario'],
        latestVersion: row.latest_version_id
          ? {
              id: row.latest_version_id,
              templateId: row.id,
              versionNo: Number(row.current_version_no || 1),
              createdAt: row.updated_at,
              configVersion: row.config_version,
            }
          : undefined,
      };
    });
  }

  async listVersions(templateId: string, limit: number): Promise<OpenDayScenarioTemplateVersionSummary[]> {
    return withOpenDayNeon(async (sql) => {
      const rows = (await sql.query(
        `
          SELECT
            id,
            template_id,
            version_no,
            created_at,
            config_version
          FROM open_day_scenario_template_versions
          WHERE template_id = $1
          ORDER BY version_no DESC
          LIMIT $2
        `,
        [templateId, limit],
      )) as Array<{
        id: string;
        template_id: string;
        version_no: number;
        created_at: string;
        config_version: string;
      }>;

      return rows.map((row) => ({
        id: row.id,
        templateId: row.template_id,
        versionNo: Number(row.version_no),
        createdAt: row.created_at,
        configVersion: row.config_version,
      }));
    });
  }
}
