export type SellingHousesStorageProfile = 'default' | 'e2e' | 'dev';

export const DEFAULT_SELLING_HOUSES_STORAGE_PROFILE: SellingHousesStorageProfile = 'default';

const TEST_PROFILE_LABELS: Record<Exclude<SellingHousesStorageProfile, 'default'>, string> = {
  e2e: '测试档 e2e',
  dev: '测试档 dev',
};

export function normalizeSellingHousesStorageProfile(input?: string | null): SellingHousesStorageProfile {
  const normalized = (input || '').trim().toLowerCase();
  if (normalized === 'e2e' || normalized === 'dev') {
    return normalized;
  }

  return DEFAULT_SELLING_HOUSES_STORAGE_PROFILE;
}

export function resolveSellingHousesStorageProfileFromSearch(search: string): SellingHousesStorageProfile {
  const query = search.trim().startsWith('?') ? search : `?${search}`;
  const params = new URLSearchParams(query);
  return normalizeSellingHousesStorageProfile(params.get('profile'));
}

export function isDefaultSellingHousesStorageProfile(profile: SellingHousesStorageProfile) {
  return profile === DEFAULT_SELLING_HOUSES_STORAGE_PROFILE;
}

export function buildSellingHousesProfiledScopeKey(
  baseScopeKey: string,
  profile: SellingHousesStorageProfile,
) {
  const normalizedBase = baseScopeKey.trim() || 'guest';
  if (isDefaultSellingHousesStorageProfile(profile)) {
    return normalizedBase;
  }

  return `${normalizedBase}:selling-houses:${profile}`;
}

export function buildSellingHousesProfiledPlayerProfileId(
  basePlayerProfileId: string,
  profile: SellingHousesStorageProfile,
) {
  if (isDefaultSellingHousesStorageProfile(profile)) {
    return basePlayerProfileId;
  }

  return `${basePlayerProfileId}_${profile}`;
}

export function shouldSyncSellingHousesProfileToCloud(profile: SellingHousesStorageProfile) {
  return isDefaultSellingHousesStorageProfile(profile);
}

export function getSellingHousesStorageProfileLabel(profile: SellingHousesStorageProfile) {
  return isDefaultSellingHousesStorageProfile(profile) ? '正式档' : TEST_PROFILE_LABELS[profile];
}
