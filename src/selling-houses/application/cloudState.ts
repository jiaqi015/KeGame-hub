import { CLOUD_META_STORAGE_KEY, CLOUD_USER_STORAGE_KEY } from '../domain/constants.js';
import { buildScopedStorageKey } from './storageScope.js';

export interface MaintainerCloudMeta {
  runId: string;
  syncVersion: number;
  updatedAt: string;
}

export interface MaintainerRunOwnerContext {
  storageScopeKey: string;
  accountId?: string;
}

export interface MaintainerCloudResetMarker {
  resetAt: string;
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

function getScopedCloudResetMarkerStorageKey(accountEmail?: string) {
  return `${getScopedCloudMetaStorageKey(accountEmail)}:reset-marker`;
}

function loadRawMaintainerUserId(scopeKey?: string) {
  if (!isBrowser()) {
    return null;
  }

  const storageKey = getScopedCloudUserStorageKey(scopeKey);
  return window.localStorage.getItem(storageKey)?.trim() || null;
}

function normalizeRunOwnerInput(input?: string | MaintainerRunOwnerContext): MaintainerRunOwnerContext {
  if (typeof input === 'string' || typeof input === 'undefined') {
    const storageScopeKey = (input || '').trim();
    return {
      storageScopeKey,
    };
  }

  return {
    storageScopeKey: (input.storageScopeKey || '').trim(),
    accountId: (input.accountId || '').trim() || undefined,
  };
}

export function getOrCreateMaintainerUserId(scopeKeyOrContext?: string | MaintainerRunOwnerContext) {
  if (!isBrowser()) {
    const normalized = normalizeRunOwnerInput(scopeKeyOrContext);
    return normalized.accountId || 'server-maintainer-user';
  }

  const normalized = normalizeRunOwnerInput(scopeKeyOrContext);
  if (normalized.accountId) {
    return normalized.accountId;
  }

  const storageKey = getScopedCloudUserStorageKey(normalized.storageScopeKey);
  const cachedLegacy = window.localStorage.getItem(storageKey)?.trim();
  if (cachedLegacy) {
    return cachedLegacy;
  }

  const nextLegacy = globalThis.crypto?.randomUUID?.() || `maintainer-${Date.now()}`;
  window.localStorage.setItem(storageKey, nextLegacy);
  return nextLegacy;
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

export function loadMaintainerCloudResetMarker(accountEmail?: string): MaintainerCloudResetMarker | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getScopedCloudResetMarkerStorageKey(accountEmail));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<MaintainerCloudResetMarker>;
    return typeof parsed.resetAt === 'string' && parsed.resetAt.trim()
      ? { resetAt: parsed.resetAt }
      : null;
  } catch {
    return null;
  }
}

export function saveMaintainerCloudResetMarker(accountEmail?: string) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(
    getScopedCloudResetMarkerStorageKey(accountEmail),
    JSON.stringify({ resetAt: new Date().toISOString() } satisfies MaintainerCloudResetMarker),
  );
}

export function clearMaintainerCloudResetMarker(accountEmail?: string) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(getScopedCloudResetMarkerStorageKey(accountEmail));
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
