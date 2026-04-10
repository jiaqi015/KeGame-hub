import type {
  OpenDayAnalysisSnapshotRecord,
  OpenDayAnalysisSnapshotSummary,
} from '../domain/openDay.types.js';

export interface OpenDaySnapshotListOptions {
  scenarioTemplateId?: string;
}

export interface OpenDaySnapshotRepository {
  save(snapshot: OpenDayAnalysisSnapshotRecord): Promise<void>;
  list(limit: number, options?: OpenDaySnapshotListOptions): Promise<OpenDayAnalysisSnapshotSummary[]>;
  get(id: string): Promise<OpenDayAnalysisSnapshotRecord | null>;
}
