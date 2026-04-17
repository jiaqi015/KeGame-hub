import {timingSafeEqual} from 'node:crypto';

export const ACTIVATION_KEYS_ENV_NAME = 'ACTIVATION_KEYS';
export const ACTIVATION_KEY_PERMISSIONS_ENV_NAME = 'ACTIVATION_KEY_PERMISSIONS';
export const ACTIVATION_HEADER_NAME = 'x-activation-key';
export const ACTIVATION_WORKSPACES = ['sabrina', 'open-day', 'selling-houses'] as const;

export type ActivationWorkspaceId = (typeof ACTIVATION_WORKSPACES)[number];

type ActivationValidationResult =
  | {ok: true; status: 200; error: ''; key: string; allowedWorkspaces: ActivationWorkspaceId[]}
  | {ok: false; status: number; error: string};

const WORKSPACE_CODE_MAP: Record<string, ActivationWorkspaceId> = {
  '1': 'sabrina',
  '2': 'open-day',
  '3': 'selling-houses',
};

const WORKSPACE_ALIAS_MAP: Record<string, ActivationWorkspaceId> = {
  '1': 'sabrina',
  sabrina: 'sabrina',
  compare: 'sabrina',
  comparison: 'sabrina',
  pk: 'sabrina',
  '2': 'open-day',
  'open-day': 'open-day',
  open_day: 'open-day',
  openday: 'open-day',
  '3': 'selling-houses',
  'selling-houses': 'selling-houses',
  selling_houses: 'selling-houses',
  sellinghouses: 'selling-houses',
  maintainer: 'selling-houses',
};

function parseActivationKeys(rawValue: string): string[] {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean);
      }
    } catch {
      // Fall back to delimiter-based parsing below.
    }
  }

  return trimmed
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeWorkspaceToken(rawToken: string): ActivationWorkspaceId | null {
  const token = rawToken.trim().toLowerCase();
  return WORKSPACE_ALIAS_MAP[token] || null;
}

function decodeWorkspaceValue(rawValue: unknown): ActivationWorkspaceId[] {
  if (Array.isArray(rawValue)) {
    const resolved = rawValue
      .flatMap((item) => decodeWorkspaceValue(item))
      .filter((workspace, index, list) => list.indexOf(workspace) === index);
    return resolved;
  }

  if (typeof rawValue !== 'string') {
    return [];
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [];
  }

  if (/^[123]+$/.test(trimmed)) {
    return trimmed
      .split('')
      .map((token) => WORKSPACE_CODE_MAP[token])
      .filter((workspace, index, list): workspace is ActivationWorkspaceId => Boolean(workspace) && list.indexOf(workspace) === index);
  }

  return trimmed
    .split(/[,\s]+/)
    .map((token) => normalizeWorkspaceToken(token))
    .filter((workspace, index, list): workspace is ActivationWorkspaceId => Boolean(workspace) && list.indexOf(workspace) === index);
}

function parseActivationKeyPermissions(rawValue: string): Record<string, ActivationWorkspaceId[]> {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed)
          .map(([key, value]) => [key.trim(), decodeWorkspaceValue(value)] as const)
          .filter(([key, value]) => key && value.length > 0),
      );
    } catch {
      return {};
    }
  }

  return Object.fromEntries(
    trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, value = ''] = line.split('=');
        return [key.trim(), decodeWorkspaceValue(value)] as const;
      })
      .filter(([key, value]) => key && value.length > 0),
  );
}

function getHeaderValue(req: any, name: string): string {
  const headers = req?.headers;

  if (!headers) {
    return '';
  }

  if (typeof headers.get === 'function') {
    const value = headers.get(name) || headers.get(name.toLowerCase());
    return typeof value === 'string' ? value.trim() : '';
  }

  const directValue = headers[name] ?? headers[name.toLowerCase()];

  if (Array.isArray(directValue)) {
    return typeof directValue[0] === 'string' ? directValue[0].trim() : '';
  }

  return typeof directValue === 'string' ? directValue.trim() : '';
}

function safeCompare(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

export function getConfiguredActivationKeys(): string[] {
  return parseActivationKeys(process.env[ACTIVATION_KEYS_ENV_NAME] || '');
}

export function getConfiguredActivationKeyPermissions(): Record<string, ActivationWorkspaceId[]> {
  return parseActivationKeyPermissions(process.env[ACTIVATION_KEY_PERMISSIONS_ENV_NAME] || '');
}

function getAllowedWorkspacesForKey(key: string): ActivationWorkspaceId[] {
  const configuredPermissions = getConfiguredActivationKeyPermissions();
  const mapped = configuredPermissions[key];

  if (mapped?.length) {
    return mapped;
  }

  return [...ACTIVATION_WORKSPACES];
}

function getRequestPath(req: any): string {
  if (typeof req?.path === 'string' && req.path) {
    return req.path;
  }

  if (typeof req?.url === 'string' && req.url) {
    try {
      return new URL(req.url, 'http://localhost').pathname;
    } catch {
      return req.url.split('?')[0] || '';
    }
  }

  if (typeof req?.nextUrl?.pathname === 'string') {
    return req.nextUrl.pathname;
  }

  return '';
}

function inferWorkspaceFromPath(pathname: string): ActivationWorkspaceId | null {
  if (!pathname) {
    return null;
  }

  if (
    pathname === '/api/models' ||
    pathname === '/api/compare' ||
    pathname === '/api/compare-stream' ||
    pathname === '/models' ||
    pathname === '/compare' ||
    pathname === '/compare-stream'
  ) {
    return 'sabrina';
  }

  if (
    pathname.startsWith('/api/open-day-') ||
    pathname === '/api/parse-workbook' ||
    pathname.startsWith('/open-day-') ||
    pathname === '/parse-workbook'
  ) {
    return 'open-day';
  }

  if (
    pathname.startsWith('/api/maintainer-') ||
    pathname.startsWith('/maintainer-')
  ) {
    return 'selling-houses';
  }

  return null;
}

function getWorkspaceLabel(workspace: ActivationWorkspaceId): string {
  switch (workspace) {
    case 'sabrina':
      return '多模型PK';
    case 'open-day':
      return '小区开放日选址';
    case 'selling-houses':
      return '我是王牌维护人';
  }
}

export function validateActivationKey(candidate: string): ActivationValidationResult {
  const configuredKeys = getConfiguredActivationKeys();

  if (configuredKeys.length === 0) {
    return {
      ok: false,
      status: 503,
      error: '服务器未配置激活密钥。',
    };
  }

  const normalizedCandidate = candidate.trim();

  if (!normalizedCandidate) {
    return {
      ok: false,
      status: 401,
      error: '请输入激活密钥。',
    };
  }

  const isMatch = configuredKeys.some((configuredKey) => safeCompare(normalizedCandidate, configuredKey));

  if (!isMatch) {
    return {
      ok: false,
      status: 401,
      error: '激活密钥无效。',
    };
  }

  const allowedWorkspaces = getAllowedWorkspacesForKey(normalizedCandidate);

  if (allowedWorkspaces.length === 0) {
    return {
      ok: false,
      status: 403,
      error: '激活密钥未配置可访问项目。',
    };
  }

  return {ok: true, status: 200, error: '', key: normalizedCandidate, allowedWorkspaces};
}

export function authorizeRequest(req: any, requiredWorkspace?: ActivationWorkspaceId): ActivationValidationResult {
  const validation = validateActivationKey(getHeaderValue(req, ACTIVATION_HEADER_NAME));

  if (!validation.ok) {
    return validation;
  }

  const workspace = requiredWorkspace || inferWorkspaceFromPath(getRequestPath(req));

  if (workspace && !validation.allowedWorkspaces.includes(workspace)) {
    return {
      ok: false,
      status: 403,
      error: `当前激活密钥无权访问「${getWorkspaceLabel(workspace)}」。`,
    };
  }

  return validation;
}
