import type { ParsedWorkbookPayload } from '../../lib/openDayWorkbook.ts';
import type {
  OpenDayAnalysisResponse,
  OpenDayAnalysisRunListResponse,
  OpenDayAnalysisRunRecord,
  OpenDayAnalysisSnapshotRecord,
  OpenDayCatalogResponse,
  OpenDaySaveScenarioCommand,
  OpenDayScenarioListResponse,
  OpenDayScenarioTemplateSummary,
  OpenDayScenarioTemplateRecord,
  OpenDayScenarioVersionListResponse,
  OpenDayScoreCommand,
  OpenDaySnapshotListResponse,
} from '../../modules/open-day/domain/openDay.types.ts';

const ACTIVATION_HEADER_NAME = 'x-activation-key';

async function requestJson<T>(activationKey: string, input: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set(ACTIVATION_HEADER_NAME, activationKey);

  const response = await fetch(input, {
    ...init,
    headers,
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : '请求失败');
  }

  return payload as T;
}

export function fetchOpenDayCatalog(activationKey: string) {
  return requestJson<OpenDayCatalogResponse>(activationKey, '/api/open-day-catalog');
}

export function fetchOpenDaySnapshots(activationKey: string, limit = 8, scenarioId = '') {
  return fetchOpenDayAnalysisRuns(activationKey, limit, scenarioId);
}

export function fetchOpenDayAnalysisRuns(activationKey: string, limit = 8, scenarioId = '') {
  const query = new URLSearchParams({
    limit: String(limit),
  });
  if (scenarioId) {
    query.set('scenarioId', scenarioId);
  }

  return requestJson<OpenDayAnalysisRunListResponse>(
    activationKey,
    `/api/open-day-analyses?${query.toString()}`,
  );
}

export function fetchOpenDaySnapshotDetail(activationKey: string, id: string) {
  return fetchOpenDayAnalysisRunDetail(activationKey, id);
}

export function fetchOpenDayAnalysisRunDetail(activationKey: string, id: string) {
  return requestJson<OpenDayAnalysisRunRecord>(
    activationKey,
    `/api/open-day-analyses?runId=${encodeURIComponent(id)}`,
  );
}

export function fetchOpenDayScenarios(activationKey: string, limit = 8) {
  return requestJson<OpenDayScenarioListResponse>(
    activationKey,
    `/api/open-day-scenarios?limit=${encodeURIComponent(limit)}`,
  );
}

export function fetchOpenDayScenarioDetail(activationKey: string, id: string) {
  return requestJson<OpenDayScenarioTemplateRecord>(
    activationKey,
    `/api/open-day-scenarios?id=${encodeURIComponent(id)}`,
  );
}

export function fetchOpenDayScenarioVersions(activationKey: string, templateId: string, limit = 20) {
  const query = new URLSearchParams({
    templateId,
    limit: String(limit),
  });

  return requestJson<OpenDayScenarioVersionListResponse>(
    activationKey,
    `/api/open-day-scenario-versions?${query.toString()}`,
  );
}

export function fetchOpenDayAnalysis(activationKey: string, command: OpenDayScoreCommand) {
  return requestJson<OpenDayAnalysisResponse>(activationKey, '/api/open-day-score', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
}

export function saveOpenDayScenario(activationKey: string, command: OpenDaySaveScenarioCommand) {
  return requestJson<OpenDayScenarioTemplateRecord>(activationKey, '/api/open-day-scenarios', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
}

export async function uploadWorkbook(
  activationKey: string,
  file: File,
  requestedSheet = '',
): Promise<ParsedWorkbookPayload> {
  const formData = new FormData();
  formData.append('file', file);
  if (requestedSheet) {
    formData.append('sheet', requestedSheet);
  }

  const headers = new Headers();
  headers.set(ACTIVATION_HEADER_NAME, activationKey);

  const response = await fetch('/api/parse-workbook', {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Excel 解析失败');
  }

  return response.json() as Promise<ParsedWorkbookPayload>;
}

import type {
  DisambiguationRequest,
  DisambiguationResult,
} from '../../modules/open-day/domain/openDayDisambiguation.types.js';

export function disambiguateOpenDayNames(
  activationKey: string,
  request: DisambiguationRequest,
  useAI = true,
): Promise<DisambiguationResult> {
  return requestJson<DisambiguationResult>(activationKey, '/api/open-day-disambiguate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...request, useAI }),
  });
}
