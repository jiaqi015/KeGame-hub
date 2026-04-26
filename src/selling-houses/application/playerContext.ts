import {
  buildSellingHousesProfiledPlayerProfileId,
  buildSellingHousesProfiledScopeKey,
  normalizeSellingHousesStorageProfile,
  type SellingHousesStorageProfile,
} from './storageProfile.js';

export interface SellingHousesPlayerContextInput {
  accountId?: string;
  email?: string;
  nickname?: string;
  storageProfile?: SellingHousesStorageProfile;
}

export interface SellingHousesPlayerContext {
  accountId?: string;
  workspaceId: 'selling-houses';
  playerProfileId: string;
  storageProfile: SellingHousesStorageProfile;
  storageScopeKey: string;
  legacyEmailScopeKey?: string;
  runOwnerSource: 'account' | 'legacy-fallback';
  // Legacy aliases kept for compatibility with existing scripts.
  accountScopeKey: string;
  emailScopeKey?: string;
  displayName: string;
}

function normalize(value?: string) {
  return (value || '').trim();
}

function normalizeEmail(value?: string) {
  return normalize(value).toLowerCase();
}

function toPlayerProfileSeed(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'guest';
}

export function deriveSellingHousesPlayerProfileId(accountId?: string, email?: string) {
  const ownerSeed = toPlayerProfileSeed(accountId || normalizeEmail(email) || 'guest');
  return `profile_selling_houses_${ownerSeed}`;
}

export function buildSellingHousesPlayerContext(
  input: SellingHousesPlayerContextInput,
): SellingHousesPlayerContext {
  const accountId = normalize(input.accountId);
  const email = normalizeEmail(input.email);
  const nickname = normalize(input.nickname);
  const workspaceId = 'selling-houses';
  const storageProfile = normalizeSellingHousesStorageProfile(input.storageProfile);
  const baseStorageScopeKey = accountId || email || 'guest';
  const storageScopeKey = buildSellingHousesProfiledScopeKey(baseStorageScopeKey, storageProfile);
  const legacyEmailScopeKey = storageProfile === 'default' ? email || undefined : undefined;
  const runOwnerSource = accountId ? 'account' : 'legacy-fallback';
  const playerProfileId = buildSellingHousesProfiledPlayerProfileId(
    deriveSellingHousesPlayerProfileId(accountId, email),
    storageProfile,
  );

  return {
    accountId: accountId || undefined,
    workspaceId,
    playerProfileId,
    storageProfile,
    storageScopeKey,
    legacyEmailScopeKey,
    runOwnerSource,
    accountScopeKey: storageScopeKey,
    emailScopeKey: legacyEmailScopeKey,
    displayName: nickname || email || '当前顾问',
  };
}
