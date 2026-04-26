import formidable from 'formidable';
import { ensureRuntimeTempDir } from '../lib/runtimeTemp.js';

export function parseJsonBody(body: unknown) {
  return typeof body === 'string' ? JSON.parse(body) : body;
}

export async function parseMultipartUpload(req: Parameters<typeof formidable>[0]) {
  const uploadDir = await ensureRuntimeTempDir('uploads');
  const form = formidable({
    multiples: false,
    maxFiles: 1,
    uploadDir,
  });

  return new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ fields, files });
    });
  });
}

export function getFirstFieldValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : '';
  }

  return typeof value === 'string' ? value.trim() : '';
}

export function getQueryValue(query: any, key: string): string {
  const value = query?.[key];
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : '';
  }

  return typeof value === 'string' ? value : '';
}

export function hasQueryValue(query: any, key: string): boolean {
  return Boolean(getQueryValue(query, key));
}

export function isStreamRequested(query: any, body: any): boolean {
  return getQueryValue(query, 'stream') === '1' || body?.stream === true;
}

export function isOpenDaySnapshotDetailQuery(query: any): boolean {
  return hasQueryValue(query, 'id') || hasQueryValue(query, 'runId');
}

export function isOpenDayScenarioVersionQuery(query: any): boolean {
  return getQueryValue(query, 'view') === 'versions' || hasQueryValue(query, 'templateId');
}

export function isMaintainerLeaderboardDetailQuery(query: any): boolean {
  return getQueryValue(query, 'view') === 'leaderboard-detail';
}

export function isMaintainerLeaderboardQuery(query: any): boolean {
  return getQueryValue(query, 'view') === 'leaderboard';
}
