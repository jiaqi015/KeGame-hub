import { CLOUD_META_STORAGE_KEY, CLOUD_USER_STORAGE_KEY } from '../domain/constants';

export interface MaintainerCloudMeta {
  runId: string;
  syncVersion: number;
  updatedAt: string;
}

function isBrowser() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function getOrCreateMaintainerUserId() {
  if (!isBrowser()) {
    return 'server-maintainer-user';
  }

  const cached = window.localStorage.getItem(CLOUD_USER_STORAGE_KEY)?.trim();
  if (cached) {
    return cached;
  }

  const next = globalThis.crypto?.randomUUID?.() || `maintainer-${Date.now()}`;
  window.localStorage.setItem(CLOUD_USER_STORAGE_KEY, next);
  return next;
}

export function loadMaintainerCloudMeta(): MaintainerCloudMeta | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CLOUD_META_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<MaintainerCloudMeta>;
    if (!parsed.runId || !Number.isFinite(parsed.syncVersion)) {
      return null;
    }

    return {
      runId: parsed.runId,
      syncVersion: Number(parsed.syncVersion),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveMaintainerCloudMeta(meta: MaintainerCloudMeta) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(CLOUD_META_STORAGE_KEY, JSON.stringify(meta));
}

export function clearMaintainerCloudMeta() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(CLOUD_META_STORAGE_KEY);
}
