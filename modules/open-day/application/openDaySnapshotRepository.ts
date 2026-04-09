import type {
  OpenDayAnalysisSnapshotRecord,
  OpenDayAnalysisSnapshotSummary,
} from '../domain/openDay.types.js';

export interface OpenDaySnapshotRepository {
  save(snapshot: OpenDayAnalysisSnapshotRecord): Promise<void>;
  list(limit: number): Promise<OpenDayAnalysisSnapshotSummary[]>;
}
