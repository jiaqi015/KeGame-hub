import type {
  OpenDayAnalysisSnapshotRecord,
  OpenDayAnalysisSnapshotSummary,
  OpenDayAnalysisRow,
} from '../domain/openDay.types.js';
import type { OpenDaySnapshotListOptions, OpenDaySnapshotRepository } from '../application/openDaySnapshotRepository.js';
import { withOpenDayNeon } from './neonOpenDayDatabase.js';

interface SnapshotRow {
  id: string;
  created_at: string;
  source_name: string;
  source_upload_id: string | null;
  dataset_id?: string | null;
  dataset_profile_id?: string | null;
  scenario_template_id: string | null;
  scenario_template_name: string | null;
  scenario_template_version_id?: string | null;
  preset_id: string | null;
  parameter_package_id: string | null;
  config_version: string;
  waterline_source: string;
  total_count: number;
  eligible_count: number;
  champion_name: string;
  champion_score: string | number;
}

export class NeonOpenDaySnapshotRepository implements OpenDaySnapshotRepository {
  async save(snapshot: OpenDayAnalysisSnapshotRecord): Promise<void> {
    await withOpenDayNeon(async (sql) => {
      await sql.query(
        `
          INSERT INTO open_day_analysis_runs (
            id,
            created_at,
            source_name,
            source_upload_id,
            dataset_id,
            dataset_profile_id,
            scenario_template_id,
            scenario_template_name,
            scenario_template_version_id,
            preset_id,
            parameter_package_id,
            config_version,
            waterline_source,
            total_count,
            eligible_count,
            champion_name,
            champion_score,
            cache_key,
            cache_hit,
            command_json,
            response_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21::jsonb)
          ON CONFLICT (id)
          DO UPDATE SET
            created_at = EXCLUDED.created_at,
            source_name = EXCLUDED.source_name,
            source_upload_id = EXCLUDED.source_upload_id,
            dataset_id = EXCLUDED.dataset_id,
            dataset_profile_id = EXCLUDED.dataset_profile_id,
            scenario_template_id = EXCLUDED.scenario_template_id,
            scenario_template_name = EXCLUDED.scenario_template_name,
            scenario_template_version_id = EXCLUDED.scenario_template_version_id,
            preset_id = EXCLUDED.preset_id,
            parameter_package_id = EXCLUDED.parameter_package_id,
            config_version = EXCLUDED.config_version,
            waterline_source = EXCLUDED.waterline_source,
            total_count = EXCLUDED.total_count,
            eligible_count = EXCLUDED.eligible_count,
            champion_name = EXCLUDED.champion_name,
            champion_score = EXCLUDED.champion_score,
            cache_key = EXCLUDED.cache_key,
            cache_hit = EXCLUDED.cache_hit,
            command_json = EXCLUDED.command_json,
            response_json = EXCLUDED.response_json
        `,
        [
          snapshot.summary.id,
          snapshot.summary.createdAt,
          snapshot.summary.sourceName,
          snapshot.summary.sourceUploadId,
          snapshot.summary.datasetId || null,
          snapshot.summary.datasetProfileId || null,
          snapshot.summary.scenarioTemplateId,
          snapshot.summary.scenarioTemplateName,
          snapshot.summary.scenarioTemplateVersionId || null,
          snapshot.summary.presetId,
          snapshot.summary.parameterPackageId,
          snapshot.summary.configVersion,
          snapshot.summary.waterlineSource,
          snapshot.summary.totalCount,
          snapshot.summary.eligibleCount,
          snapshot.summary.championName,
          snapshot.summary.championScore,
          snapshot.response.meta.cacheKey,
          snapshot.response.meta.cacheHit,
          JSON.stringify(snapshot.command),
          JSON.stringify(snapshot.response),
        ],
      );

      await sql.query(`DELETE FROM open_day_analysis_run_rows WHERE analysis_run_id = $1`, [snapshot.summary.id]);
      await this.insertRows(sql, 'open_day_analysis_run_rows', 'analysis_run_id', snapshot.summary.id, snapshot.response.results);

      await sql.query(
        `
          INSERT INTO open_day_analysis_snapshots (
            id,
            created_at,
            source_name,
            source_upload_id,
            dataset_id,
            dataset_profile_id,
            scenario_template_id,
            scenario_template_name,
            scenario_template_version_id,
            preset_id,
            parameter_package_id,
            config_version,
            waterline_source,
            total_count,
            eligible_count,
            champion_name,
            champion_score,
            command_json,
            response_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20::jsonb)
          ON CONFLICT (id)
          DO UPDATE SET
            created_at = EXCLUDED.created_at,
            source_name = EXCLUDED.source_name,
            source_upload_id = EXCLUDED.source_upload_id,
            dataset_id = EXCLUDED.dataset_id,
            dataset_profile_id = EXCLUDED.dataset_profile_id,
            scenario_template_id = EXCLUDED.scenario_template_id,
            scenario_template_name = EXCLUDED.scenario_template_name,
            scenario_template_version_id = EXCLUDED.scenario_template_version_id,
            preset_id = EXCLUDED.preset_id,
            parameter_package_id = EXCLUDED.parameter_package_id,
            config_version = EXCLUDED.config_version,
            waterline_source = EXCLUDED.waterline_source,
            total_count = EXCLUDED.total_count,
            eligible_count = EXCLUDED.eligible_count,
            champion_name = EXCLUDED.champion_name,
            champion_score = EXCLUDED.champion_score,
            command_json = EXCLUDED.command_json,
            response_json = EXCLUDED.response_json
        `,
        [
          snapshot.summary.id,
          snapshot.summary.createdAt,
          snapshot.summary.sourceName,
          snapshot.summary.sourceUploadId,
          snapshot.summary.datasetId || null,
          snapshot.summary.datasetProfileId || null,
          snapshot.summary.scenarioTemplateId,
          snapshot.summary.scenarioTemplateName,
          snapshot.summary.scenarioTemplateVersionId || null,
          snapshot.summary.presetId,
          snapshot.summary.parameterPackageId,
          snapshot.summary.configVersion,
          snapshot.summary.waterlineSource,
          snapshot.summary.totalCount,
          snapshot.summary.eligibleCount,
          snapshot.summary.championName,
          snapshot.summary.championScore,
          JSON.stringify(snapshot.command),
          JSON.stringify(snapshot.response),
        ],
      );

      await sql.query(`DELETE FROM open_day_analysis_snapshot_rows WHERE snapshot_id = $1`, [snapshot.summary.id]);
      await this.insertRows(sql, 'open_day_analysis_snapshot_rows', 'snapshot_id', snapshot.summary.id, snapshot.response.results);
    });
  }

  async list(limit: number, options?: OpenDaySnapshotListOptions): Promise<OpenDayAnalysisSnapshotSummary[]> {
    return withOpenDayNeon(async (sql) => {
      const scenarioTemplateId = options?.scenarioTemplateId?.trim();
      const scenarioTemplateVersionId = options?.scenarioTemplateVersionId?.trim();
      const datasetId = options?.datasetId?.trim();
      const sourceUploadId = options?.sourceUploadId?.trim();

      const whereClauses: string[] = [];
      const values: unknown[] = [];
      const pushFilter = (clause: string, value: string | undefined) => {
        if (!value) {
          return;
        }
        values.push(value);
        whereClauses.push(`${clause} = $${values.length}`);
      };

      pushFilter('scenario_template_id', scenarioTemplateId);
      pushFilter('scenario_template_version_id', scenarioTemplateVersionId);
      pushFilter('dataset_id', datasetId);
      pushFilter('source_upload_id', sourceUploadId);

      const runWhere = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const runLimitPlaceholder = `$${values.length + 1}`;
      const runRows = (await sql.query(
        `
          SELECT
            id,
            created_at,
            source_name,
            source_upload_id,
            dataset_id,
            dataset_profile_id,
            scenario_template_id,
            scenario_template_name,
            scenario_template_version_id,
            preset_id,
            parameter_package_id,
            config_version,
            waterline_source,
            total_count,
            eligible_count,
            champion_name,
            champion_score
          FROM open_day_analysis_runs
          ${runWhere}
          ORDER BY created_at DESC
          LIMIT ${runLimitPlaceholder}
        `,
        [...values, limit],
      )) as SnapshotRow[];

      const legacyWhereClauses = [...whereClauses, `id NOT IN (SELECT id FROM open_day_analysis_runs)`];
      const legacyLimitPlaceholder = `$${values.length + 1}`;
      const legacyRows = (await sql.query(
        `
          SELECT
            id,
            created_at,
            source_name,
            source_upload_id,
            dataset_id,
            dataset_profile_id,
            scenario_template_id,
            scenario_template_name,
            scenario_template_version_id,
            preset_id,
            parameter_package_id,
            config_version,
            waterline_source,
            total_count,
            eligible_count,
            champion_name,
            champion_score
          FROM open_day_analysis_snapshots
          WHERE ${legacyWhereClauses.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT ${legacyLimitPlaceholder}
        `,
        [...values, limit],
      )) as SnapshotRow[];

      const rows = [...runRows, ...legacyRows]
        .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
        .slice(0, limit);

      return rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        sourceName: row.source_name,
        sourceUploadId: row.source_upload_id,
        datasetId: row.dataset_id || null,
        datasetProfileId: row.dataset_profile_id || null,
        scenarioTemplateId: row.scenario_template_id,
        scenarioTemplateName: row.scenario_template_name,
        scenarioTemplateVersionId: row.scenario_template_version_id || null,
        presetId: row.preset_id,
        parameterPackageId: row.parameter_package_id,
        configVersion: row.config_version,
        waterlineSource: row.waterline_source,
        totalCount: Number(row.total_count),
        eligibleCount: Number(row.eligible_count),
        championName: row.champion_name,
        championScore: Number(row.champion_score),
      }));
    });
  }

  async get(id: string): Promise<OpenDayAnalysisSnapshotRecord | null> {
    return withOpenDayNeon(async (sql) => {
      const runRows = (await sql.query(
        `
          SELECT
            id,
            created_at,
            source_name,
            source_upload_id,
            dataset_id,
            dataset_profile_id,
            scenario_template_id,
            scenario_template_name,
            scenario_template_version_id,
            preset_id,
            parameter_package_id,
            config_version,
            waterline_source,
            total_count,
            eligible_count,
            champion_name,
            champion_score,
            command_json,
            response_json
          FROM open_day_analysis_runs
          WHERE id = $1
          LIMIT 1
        `,
        [id],
      )) as Array<SnapshotRow & { command_json: OpenDayAnalysisSnapshotRecord['command']; response_json: OpenDayAnalysisSnapshotRecord['response'] }>;

      const row = runRows[0];
      if (row) {
        return {
          summary: {
            id: row.id,
            createdAt: row.created_at,
            sourceName: row.source_name,
            sourceUploadId: row.source_upload_id,
            datasetId: row.dataset_id || null,
            datasetProfileId: row.dataset_profile_id || null,
            scenarioTemplateId: row.scenario_template_id,
            scenarioTemplateName: row.scenario_template_name,
            scenarioTemplateVersionId: row.scenario_template_version_id || null,
            presetId: row.preset_id,
            parameterPackageId: row.parameter_package_id,
            configVersion: row.config_version,
            waterlineSource: row.waterline_source,
            totalCount: Number(row.total_count),
            eligibleCount: Number(row.eligible_count),
            championName: row.champion_name,
            championScore: Number(row.champion_score),
          },
          command: row.command_json,
          response: row.response_json,
        };
      }

      const legacyRows = (await sql.query(
        `
          SELECT
            id,
            created_at,
            source_name,
            source_upload_id,
            dataset_id,
            dataset_profile_id,
            scenario_template_id,
            scenario_template_name,
            scenario_template_version_id,
            preset_id,
            parameter_package_id,
            config_version,
            waterline_source,
            total_count,
            eligible_count,
            champion_name,
            champion_score,
            command_json,
            response_json
          FROM open_day_analysis_snapshots
          WHERE id = $1
          LIMIT 1
        `,
        [id],
      )) as Array<SnapshotRow & { command_json: OpenDayAnalysisSnapshotRecord['command']; response_json: OpenDayAnalysisSnapshotRecord['response'] }>;

      const legacyRow = legacyRows[0];
      if (!legacyRow) {
        return null;
      }

      return {
        summary: {
          id: legacyRow.id,
          createdAt: legacyRow.created_at,
          sourceName: legacyRow.source_name,
          sourceUploadId: legacyRow.source_upload_id,
          datasetId: legacyRow.dataset_id || null,
          datasetProfileId: legacyRow.dataset_profile_id || null,
          scenarioTemplateId: legacyRow.scenario_template_id,
          scenarioTemplateName: legacyRow.scenario_template_name,
          scenarioTemplateVersionId: legacyRow.scenario_template_version_id || null,
          presetId: legacyRow.preset_id,
          parameterPackageId: legacyRow.parameter_package_id,
          configVersion: legacyRow.config_version,
          waterlineSource: legacyRow.waterline_source,
          totalCount: Number(legacyRow.total_count),
          eligibleCount: Number(legacyRow.eligible_count),
          championName: legacyRow.champion_name,
          championScore: Number(legacyRow.champion_score),
        },
        command: legacyRow.command_json,
        response: legacyRow.response_json,
      };
    });
  }

  private async insertRows(
    sql: any,
    tableName: 'open_day_analysis_snapshot_rows' | 'open_day_analysis_run_rows',
    parentColumn: 'snapshot_id' | 'analysis_run_id',
    recordId: string,
    rows: OpenDayAnalysisRow[],
  ) {
    if (!rows.length) {
      return;
    }

    const chunkSize = 100;
    const valuesPerRow = 17;

    for (let index = 0; index < rows.length; index += chunkSize) {
      const chunk = rows.slice(index, index + chunkSize);
      const values: unknown[] = [];
      const placeholders = chunk
        .map((row, rowIndex) => {
          const offset = rowIndex * valuesPerRow;
          values.push(
            recordId,
            row.rank,
            row.area || null,
            row.name,
            row.score,
            row.rawScore,
            row.tierCode,
            row.isEligible,
            row.scaleIdx,
            row.trafficIdx,
            row.productIdx,
            row.interactionIdx,
            row.convRate,
            row.transactions,
            row.inventory,
            row.traffic,
            row.premium,
          );

          return `(
            $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6},
            $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12},
            $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}
          )`;
        })
        .join(',\n');

      await sql.query(
        `
          INSERT INTO ${tableName} (
            ${parentColumn},
            rank,
            area,
            name,
            score,
            raw_score,
            tier_code,
            is_eligible,
            scale_idx,
            traffic_idx,
            product_idx,
            interaction_idx,
            conv_rate,
            transactions,
            inventory,
            traffic,
            premium
          )
          VALUES ${placeholders}
        `,
        values,
      );
    }
  }
}
