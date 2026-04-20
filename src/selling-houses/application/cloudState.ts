import { CLOUD_META_STORAGE_KEY, CLOUD_USER_STORAGE_KEY } from '../domain/constants.js';
import { buildScopedStorageKey } from './storageScope.js';

export interface MaintainerCloudMeta {
  runId: string;
  syncVersion: number;
  updatedAt: string;
}

function isBrowser() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function getScopedCloudUserStorageKey(accountEmail?: string) {
  return buildScopedStorageKey(CLOUD_USER_STORAGE_KEY, accountEmail);
}

function getScopedCloudMetaStorageKey(accountEmail?: string) {
  return buildScopedStorageKey(CLOUD_META_STORAGE_KEY, accountEmail);
}

function loadRawMaintainerUserId(scopeKey?: string) {
  if (!isBrowser()) {
    return null;
  }

  const storageKey = getScopedCloudUserStorageKey(scopeKey);
  return window.localStorage.getItem(storageKey)?.trim() || null;
}

export function getOrCreateMaintainerUserId(accountEmail?: string) {
  if (!isBrowser()) {
    return 'server-maintainer-user';
  }

  const storageKey = getScopedCloudUserStorageKey(accountEmail);
  const cached = window.localStorage.getItem(storageKey)?.trim();
  if (cached) {
    return cached;
  }

  const next = globalThis.crypto?.randomUUID?.() || `maintainer-${Date.now()}`;
  window.localStorage.setItem(storageKey, next);
  return next;
}

export function migrateMaintainerUserIdScope(targetScopeKey: string, legacyScopeKey?: string) {
  if (!isBrowser()) {
    return null;
  }

  const targetStorageKey = getScopedCloudUserStorageKey(targetScopeKey);
  const existing = window.localStorage.getItem(targetStorageKey)?.trim();
  if (existing) {
    return existing;
  }

  const legacyValue = loadRawMaintainerUserId(legacyScopeKey);
  if (!legacyValue) {
    return null;
  }

  window.localStorage.setItem(targetStorageKey, legacyValue);
  return legacyValue;
}

export function loadMaintainerCloudMeta(accountEmail?: string): MaintainerCloudMeta | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getScopedCloudMetaStorageKey(accountEmail));
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

export function saveMaintainerCloudMeta(meta: MaintainerCloudMeta, accountEmail?: string) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(getScopedCloudMetaStorageKey(accountEmail), JSON.stringify(meta));
}

export function clearMaintainerCloudMeta(accountEmail?: string) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(getScopedCloudMetaStorageKey(accountEmail));
}

export function migrateMaintainerCloudMetaScope(targetScopeKey: string, legacyScopeKey?: string) {
  if (!isBrowser()) {
    return null;
  }

  const targetStorageKey = getScopedCloudMetaStorageKey(targetScopeKey);
  const existing = loadMaintainerCloudMeta(targetScopeKey);
  if (existing) {
    return existing;
  }

  const legacyMeta = loadMaintainerCloudMeta(legacyScopeKey);
  if (!legacyMeta) {
    return null;
  }

  window.localStorage.setItem(targetStorageKey, JSON.stringify(legacyMeta));
  return legacyMeta;
}
