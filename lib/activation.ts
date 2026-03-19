import {timingSafeEqual} from 'node:crypto';

export const ACTIVATION_KEYS_ENV_NAME = 'ACTIVATION_KEYS';
export const ACTIVATION_HEADER_NAME = 'x-activation-key';

type ActivationValidationResult =
  | {ok: true; status: 200; error: ''}
  | {ok: false; status: number; error: string};

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

  return {ok: true, status: 200, error: ''};
}

export function authorizeRequest(req: any): ActivationValidationResult {
  return validateActivationKey(getHeaderValue(req, ACTIVATION_HEADER_NAME));
}
