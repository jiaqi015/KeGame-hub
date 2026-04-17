import type {
  MaintainerCreateRunCommand,
  MaintainerLeaderboardEntry,
  MaintainerRunRecord,
  MaintainerSaveRunCommand,
} from './cloudSync.js';

export interface MaintainerRunRepository {
  createRun(command: MaintainerCreateRunCommand & { runId: string }): Promise<MaintainerRunRecord>;
  saveRun(command: MaintainerSaveRunCommand): Promise<MaintainerRunRecord>;
  getRun(runId: string, userId: string): Promise<MaintainerRunRecord | null>;
  listRuns(userId: string, limit?: number): Promise<MaintainerRunRecord[]>;
  listLeaderboard(seasonId: string, limit?: number): Promise<MaintainerLeaderboardEntry[]>;
}
