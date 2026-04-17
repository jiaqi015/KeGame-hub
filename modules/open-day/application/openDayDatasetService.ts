import type {
  OpenDayDatasetProfileSummary,
  OpenDayDatasetSummary,
  OpenDayMappings,
  OpenDayRawRow,
} from '../domain/openDay.types.js';
import { createOpenDayHash } from './openDayFingerprint.js';
import type { OpenDayDatasetRepository } from './openDayDatasetRepository.js';

export interface PersistOpenDayDatasetInput {
  sourceUploadId?: string | null;
  sourceName: string;
  sheetName: string;
  headers: string[];
  rows: OpenDayRawRow[];
}

export interface PersistOpenDayDatasetProfileInput {
  datasetId?: string;
  sourceUploadId?: string | null;
  sourceName: string;
  sheetName?: string;
  headers?: string[];
  rows: OpenDayRawRow[];
  mappings: OpenDayMappings;
  qualityReport?: unknown;
}

export class OpenDayDatasetService {
  constructor(private readonly repository: OpenDayDatasetRepository) {}

  async persistDataset(input: PersistOpenDayDatasetInput): Promise<OpenDayDatasetSummary> {
    const headers = Array.isArray(input.headers) ? input.headers : [];
    const rows = Array.isArray(input.rows) ? input.rows : [];
    const datasetFingerprint = createOpenDayHash(
      {
        sourceUploadId: input.sourceUploadId || '',
        sourceName: input.sourceName,
        sheetName: input.sheetName,
        headers,
        rows,
      },
      'dataset',
    );
    const summary: OpenDayDatasetSummary = {
      id: datasetFingerprint.replace(/^dataset:/, ''),
      createdAt: new Date().toISOString(),
      sourceUploadId: input.sourceUploadId || null,
      sourceName: input.sourceName || '未命名数据集',
      sheetName: input.sheetName || '',
      rowCount: rows.length,
      headerCount: headers.length,
      datasetFingerprint,
    };

    return this.repository.saveDataset({
      summary,
      headers,
      rows,
    });
  }

  async persistDatasetProfile(input: PersistOpenDayDatasetProfileInput): Promise<OpenDayDatasetProfileSummary> {
    const headers = input.headers?.length ? input.headers : this.extractHeaders(input.rows);
    const dataset = input.datasetId
      ? null
      : await this.persistDataset({
          sourceUploadId: input.sourceUploadId,
          sourceName: input.sourceName,
          sheetName: input.sheetName || '',
          headers,
          rows: input.rows,
        });
    const datasetId = input.datasetId || dataset?.id || '';
    const profileFingerprint = createOpenDayHash(
      {
        datasetId,
        headers,
        mappings: input.mappings,
        qualityReport: input.qualityReport || null,
      },
      'dataset-profile',
    );
    const summary: OpenDayDatasetProfileSummary = {
      id: profileFingerprint.replace(/^dataset-profile:/, ''),
      createdAt: new Date().toISOString(),
      datasetId,
      profileFingerprint,
    };

    return this.repository.saveDatasetProfile({
      summary,
      datasetId,
      headers,
      mappings: input.mappings,
      qualityReport: input.qualityReport || null,
      sourceName: input.sourceName || '未命名数据集',
      sheetName: input.sheetName || '',
    });
  }

  private extractHeaders(rows: OpenDayRawRow[]) {
    const headers = new Set<string>();
    rows.forEach((row) => Object.keys(row || {}).forEach((header) => headers.add(header)));
    return Array.from(headers);
  }
}
