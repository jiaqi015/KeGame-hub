import type {
  OpenDayDatasetProfileSummary,
  OpenDayDatasetSummary,
} from '../domain/openDay.types.js';
import type {
  OpenDayDatasetRepository,
  SaveOpenDayDatasetCommand,
  SaveOpenDayDatasetProfileCommand,
} from '../application/openDayDatasetRepository.js';
import { withOpenDayNeon } from './neonOpenDayDatabase.js';

export class NeonOpenDayDatasetRepository implements OpenDayDatasetRepository {
  async saveDataset(command: SaveOpenDayDatasetCommand): Promise<OpenDayDatasetSummary> {
    await withOpenDayNeon(async (sql) => {
      await sql.query(
        `
          INSERT INTO open_day_datasets (
            id,
            created_at,
            source_upload_id,
            source_name,
            sheet_name,
            row_count,
            header_count,
            dataset_fingerprint,
            headers_json,
            rows_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
          ON CONFLICT (id)
          DO UPDATE SET
            source_upload_id = EXCLUDED.source_upload_id,
            source_name = EXCLUDED.source_name,
            sheet_name = EXCLUDED.sheet_name,
            row_count = EXCLUDED.row_count,
            header_count = EXCLUDED.header_count,
            dataset_fingerprint = EXCLUDED.dataset_fingerprint,
            headers_json = EXCLUDED.headers_json,
            rows_json = EXCLUDED.rows_json
        `,
        [
          command.summary.id,
          command.summary.createdAt,
          command.summary.sourceUploadId,
          command.summary.sourceName,
          command.summary.sheetName,
          command.summary.rowCount,
          command.summary.headerCount,
          command.summary.datasetFingerprint,
          JSON.stringify(command.headers),
          JSON.stringify(command.rows),
        ],
      );
    });

    return command.summary;
  }

  async saveDatasetProfile(command: SaveOpenDayDatasetProfileCommand): Promise<OpenDayDatasetProfileSummary> {
    await withOpenDayNeon(async (sql) => {
      await sql.query(
        `
          INSERT INTO open_day_dataset_profiles (
            id,
            created_at,
            dataset_id,
            profile_fingerprint,
            source_name,
            sheet_name,
            headers_json,
            mappings_json,
            quality_report_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
          ON CONFLICT (id)
          DO UPDATE SET
            dataset_id = EXCLUDED.dataset_id,
            profile_fingerprint = EXCLUDED.profile_fingerprint,
            source_name = EXCLUDED.source_name,
            sheet_name = EXCLUDED.sheet_name,
            headers_json = EXCLUDED.headers_json,
            mappings_json = EXCLUDED.mappings_json,
            quality_report_json = EXCLUDED.quality_report_json
        `,
        [
          command.summary.id,
          command.summary.createdAt,
          command.datasetId,
          command.summary.profileFingerprint,
          command.sourceName,
          command.sheetName,
          JSON.stringify(command.headers),
          JSON.stringify(command.mappings),
          JSON.stringify(command.qualityReport || null),
        ],
      );
    });

    return command.summary;
  }

  async getDatasetRows(datasetId: string) {
    try {
      const result = await withOpenDayNeon(async (sql) => {
        const rows = await sql.query(
          `SELECT headers_json, rows_json FROM open_day_datasets WHERE id = $1 LIMIT 1`,
          [datasetId],
        );
        return rows as any[];
      });
      const row = result[0];
      if (!row) return null;
      return {
        headers: typeof row.headers_json === 'string' ? JSON.parse(row.headers_json) : (row.headers_json || []),
        rows: typeof row.rows_json === 'string' ? JSON.parse(row.rows_json) : (row.rows_json || []),
      };
    } catch {
      return null;
    }
  }
}
