import type {
  OpenDayDatasetProfileSummary,
  OpenDayDatasetSummary,
} from '../domain/openDay.types.js';

export interface SaveOpenDayDatasetCommand {
  summary: OpenDayDatasetSummary;
  headers: string[];
  rows: Record<string, string>[];
}

export interface SaveOpenDayDatasetProfileCommand {
  summary: OpenDayDatasetProfileSummary;
  datasetId: string;
  headers: string[];
  mappings: unknown;
  qualityReport: unknown;
  sourceName: string;
  sheetName: string;
}

export interface OpenDayDatasetRepository {
  saveDataset(command: SaveOpenDayDatasetCommand): Promise<OpenDayDatasetSummary>;
  saveDatasetProfile(command: SaveOpenDayDatasetProfileCommand): Promise<OpenDayDatasetProfileSummary>;
  getDatasetRows(datasetId: string): Promise<{ headers: string[]; rows: Record<string, string>[] } | null>;
}
