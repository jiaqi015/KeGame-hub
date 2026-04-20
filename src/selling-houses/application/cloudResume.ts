import type { MaintainerCloudMeta } from './cloudState.js';
import type { MaintainerRunRecord } from './cloudSync.js';

export interface LoadPreferredMaintainerCloudRunOptions {
  userId: string;
  localMeta: MaintainerCloudMeta | null;
  fetchRun: (runId: string) => Promise<MaintainerRunRecord>;
  listRuns: (userId: string) => Promise<MaintainerRunRecord[]>;
}

export interface PreferredMaintainerCloudRun {
  run: MaintainerRunRecord;
  meta: MaintainerCloudMeta;
}

function toCloudMeta(run: MaintainerRunRecord): MaintainerCloudMeta {
  return {
    runId: run.runId,
    syncVersion: run.syncVersion,
    updatedAt: run.updatedAt,
  };
}

function compareRuns(left: MaintainerRunRecord, right: MaintainerRunRecord) {
  const leftTime = Date.parse(left.updatedAt || left.lastPlayedAt || left.startedAt || '') || 0;
  const rightTime = Date.parse(right.updatedAt || right.lastPlayedAt || right.startedAt || '') || 0;

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return right.syncVersion - left.syncVersion;
}

export async function loadPreferredMaintainerCloudRun(
  options: LoadPreferredMaintainerCloudRunOptions,
): Promise<PreferredMaintainerCloudRun | null> {
  const { userId, localMeta, fetchRun, listRuns } = options;

  if (localMeta?.runId) {
    try {
      const run = await fetchRun(localMeta.runId);
      return {
        run,
        meta: toCloudMeta(run),
      };
    } catch {
      // Fall through to list-based recovery when local metadata is stale or missing.
    }
  }

  const runs = await listRuns(userId);
  if (runs.length === 0) {
    return null;
  }

  const [latest] = [...runs].sort(compareRuns);
  if (!latest) {
    return null;
  }

  try {
    const run = await fetchRun(latest.runId);
    return {
      run,
      meta: toCloudMeta(run),
    };
  } catch {
    return {
      run: latest,
      meta: toCloudMeta(latest),
    };
  }
}
