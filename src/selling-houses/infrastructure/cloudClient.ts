import type {
  MaintainerCreateRunCommand,
  MaintainerLeaderboardDetail,
  MaintainerLeaderboardEntry,
  MaintainerRunRecord,
  MaintainerCreateRunRequest,
  MaintainerSaveRunRequest,
  MaintainerSaveRunCommand,
} from '../application/cloudSync.js';
import type { ScenarioDefinition, ScenarioSummary, WorldSpec } from '../domain/models.js';

const ACTIVATION_HEADER_NAME = 'x-activation-key';

async function requestJson<T>(activationKey: string, input: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set(ACTIVATION_HEADER_NAME, activationKey);

  const response = await fetch(input, {
    ...init,
    headers,
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string; latest?: MaintainerRunRecord };
  if (!response.ok) {
    const error = new Error(typeof payload.error === 'string' ? payload.error : '请求失败') as Error & {
      latest?: MaintainerRunRecord;
      status?: number;
    };
    error.latest = payload.latest;
    error.status = response.status;
    throw error;
  }

  return payload as T;
}

export function createMaintainerRun(activationKey: string, command: MaintainerCreateRunRequest) {
  return requestJson<MaintainerRunRecord>(activationKey, '/api/maintainer-runs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
}

export function fetchMaintainerRun(activationKey: string, runId: string, userId?: string) {
  const query = new URLSearchParams({
    id: runId,
  });
  if (userId?.trim()) {
    query.set('userId', userId.trim());
  }

  return requestJson<MaintainerRunRecord>(activationKey, `/api/maintainer-runs?${query.toString()}`);
}

export function fetchMaintainerRuns(activationKey: string, userId?: string, limit = 8) {
  const query = new URLSearchParams({
    limit: String(limit),
  });
  if (userId?.trim()) {
    query.set('userId', userId.trim());
  }

  return requestJson<{ runs: MaintainerRunRecord[] }>(
    activationKey,
    `/api/maintainer-runs?${query.toString()}`,
  );
}

export function saveMaintainerRun(activationKey: string, command: MaintainerSaveRunRequest) {
  return requestJson<MaintainerRunRecord>(activationKey, '/api/maintainer-runs', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
}

export function fetchMaintainerLeaderboard(activationKey: string, seasonId = 'season-1', limit = 10) {
  const query = new URLSearchParams({
    seasonId,
    limit: String(limit),
    view: 'leaderboard',
  });

  return requestJson<{ seasonId: string; entries: MaintainerLeaderboardEntry[] }>(
    activationKey,
    `/api/maintainer-runs?${query.toString()}`,
  );
}

export function fetchMaintainerLeaderboardDetail(activationKey: string, seasonId = 'season-1', limit = 20) {
  const query = new URLSearchParams({
    seasonId,
    limit: String(limit),
    view: 'leaderboard-detail',
  });

  return requestJson<MaintainerLeaderboardDetail>(
    activationKey,
    `/api/maintainer-runs?${query.toString()}`,
  );
}

export function fetchSellingHousesScenarioCatalog(activationKey: string, difficultyId?: string) {
  const query = new URLSearchParams();
  if (difficultyId) {
    query.set('difficulty', difficultyId);
  }

  return requestJson<{ scenarios: ScenarioSummary[] }>(
    activationKey,
    `/api/selling-houses-scenarios${query.toString() ? `?${query.toString()}` : ''}`,
  );
}

export function fetchSellingHousesScenario(activationKey: string, scenarioId: string) {
  const query = new URLSearchParams({ id: scenarioId });
  return requestJson<{ scenario: ScenarioDefinition; world: WorldSpec }>(
    activationKey,
    `/api/selling-houses-scenarios?${query.toString()}`,
  );
}
