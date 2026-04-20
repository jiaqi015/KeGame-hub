export interface SellingHousesPlayerContextInput {
  accountId?: string;
  email?: string;
  nickname?: string;
}

export interface SellingHousesPlayerContext {
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

export function buildSellingHousesPlayerContext(
  input: SellingHousesPlayerContextInput,
): SellingHousesPlayerContext {
  const accountId = normalize(input.accountId);
  const email = normalizeEmail(input.email);
  const nickname = normalize(input.nickname);

  return {
    accountScopeKey: accountId || email || 'guest',
    emailScopeKey: email || undefined,
    displayName: nickname || email || '当前顾问',
  };
}
