const DEFAULT_STORAGE_SCOPE = 'guest';

function normalizeEmailScope(input?: string) {
  const normalized = (input || '').trim().toLowerCase();
  return normalized || DEFAULT_STORAGE_SCOPE;
}

export function buildScopedStorageKey(baseKey: string, accountEmail?: string) {
  const scope = normalizeEmailScope(accountEmail);
  if (scope === DEFAULT_STORAGE_SCOPE) {
    return baseKey;
  }

  return `${baseKey}:${encodeURIComponent(scope)}`;
}

