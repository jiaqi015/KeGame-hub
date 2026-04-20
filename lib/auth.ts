import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  ACTIVATION_HEADER_NAME,
  ACTIVATION_WORKSPACES,
  type ActivationWorkspaceId,
  validateActivationKey,
} from './activation.js';
import { sendVerificationEmail } from './email.js';
import { decodeLegacyWorkspaceCodes } from './workspaces.js';

export const AUTH_SESSION_COOKIE_NAME = 'sabrina-session';
export const AUTH_USER_STORAGE_ENV_NAME = 'AUTH_USER_STORAGE';
export const AUTH_DEFAULT_USERS_ENV_NAME = 'AUTH_DEFAULT_USERS';
export const AUTH_VERIFICATION_BYPASS_ENV_NAME = 'AUTH_VERIFICATION_BYPASS_EMAILS';
export const AUTH_LOCAL_WHITELIST_ENV_NAME = 'AUTH_LOCAL_WHITELIST';
export const AUTH_SESSION_SECRET_ENV_NAME = 'AUTH_SESSION_SECRET';
export const AUTH_EMAIL_DOMAIN = '@ke.com';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const VERIFICATION_CODE_TTL_MS = 1000 * 60 * 10;

export interface AuthUserRecord {
  accountId: string;
  email: string;
  nickname: string;
  displayName: string;
  allowedWorkspaces: ActivationWorkspaceId[];
  activationBound: boolean;
  activationKey?: string;
  createdAt: string;
  lastLoginAt: string;
}

interface VerificationChallenge {
  email: string;
  codeHash: string;
  expiresAt: string;
}

interface AuthStore {
  users: Record<string, AuthUserRecord>;
  challenges: Record<string, VerificationChallenge>;
}

type ConfiguredAllowedWorkspaces = ActivationWorkspaceId[] | 'all' | string[] | string | undefined;

type ConfiguredUserInput = Omit<Partial<AuthUserRecord>, 'allowedWorkspaces'> & {
  allowedWorkspaces?: ConfiguredAllowedWorkspaces;
};

export interface SessionAuthorizationSuccess {
  ok: true;
  accountId: string;
  email: string;
  nickname: string;
  displayName: string;
  allowedWorkspaces: ActivationWorkspaceId[];
  source: 'session' | 'activation-key';
  activationKey?: string;
}

export interface SessionAuthorizationFailure {
  ok: false;
  status: number;
  error: string;
}

export type SessionAuthorizationResult =
  | SessionAuthorizationSuccess
  | SessionAuthorizationFailure;

export function isSessionAuthorizationFailure(
  result: SessionAuthorizationResult,
): result is SessionAuthorizationFailure {
  return !result.ok;
}

export interface LoginStartResult {
  email: string;
  mode: 'trusted-bypass' | 'verification_required' | 'activation_required';
  verificationCode?: string;
  expiresAt?: string;
  user?: AuthUserRecord;
}

export interface LoginCompleteResult {
  user: AuthUserRecord;
  sessionToken: string;
  cookie: string;
}

interface SessionPayload {
  accountId?: string;
  email: string;
  nickname: string;
  displayName: string;
  allowedWorkspaces: ActivationWorkspaceId[];
  exp: number;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function deriveNicknameFromEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const [prefix] = normalized.split('@');
  return prefix?.trim() || normalized || 'user';
}

export function deriveAccountIdFromEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 20);
  return `acct_${digest}`;
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseAuthStore(rawValue: string): AuthStore {
  if (!rawValue.trim()) {
    return {
      users: {},
      challenges: {},
    };
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<AuthStore>;
    return {
      users: parsed.users || {},
      challenges: parsed.challenges || {},
    };
  } catch {
    return {
      users: {},
      challenges: {},
    };
  }
}

function saveAuthStore(store: AuthStore) {
  process.env[AUTH_USER_STORAGE_ENV_NAME] = JSON.stringify(store);
}

function getAuthStore(): AuthStore {
  const store = parseAuthStore(process.env[AUTH_USER_STORAGE_ENV_NAME] || '');
  const defaults = getDefaultUsers();

  for (const user of defaults) {
    const normalizedEmail = normalizeEmail(user.email);
    const existing = store.users[normalizedEmail];
    if (!existing) {
      store.users[normalizedEmail] = user;
      continue;
    }

    existing.allowedWorkspaces = Array.from(new Set([...existing.allowedWorkspaces, ...user.allowedWorkspaces]));
    if (!existing.accountId) {
      existing.accountId = deriveAccountIdFromEmail(existing.email);
    }
    if (!existing.nickname) {
      existing.nickname = user.nickname;
    }
    if (!existing.displayName) {
      existing.displayName = user.displayName;
    }
  }

  return store;
}

function getDefaultUsers(): AuthUserRecord[] {
  const now = new Date().toISOString();
  const rawConfigured = (process.env[AUTH_DEFAULT_USERS_ENV_NAME] || '').trim();
  const rawLocal = (process.env[AUTH_LOCAL_WHITELIST_ENV_NAME] || '').trim();

  return [
    ...parseConfiguredUsers(rawConfigured, now),
    ...parseConfiguredUsers(rawLocal, now),
  ];
}

function getAllWorkspaces(): ActivationWorkspaceId[] {
  return [...ACTIVATION_WORKSPACES] as ActivationWorkspaceId[];
}

function isActivationWorkspaceId(value: unknown): value is ActivationWorkspaceId {
  return typeof value === 'string'
    && (ACTIVATION_WORKSPACES as readonly string[]).includes(value);
}

function getBypassEmails(): Set<string> {
  const configured = (process.env[AUTH_VERIFICATION_BYPASS_ENV_NAME] || '')
    .split(/[\n,]/)
    .map((item) => normalizeEmail(item))
    .filter(Boolean);

  const seededUsers = getDefaultUsers().map((user) => normalizeEmail(user.email));
  return new Set([...configured, ...seededUsers]);
}

function parseConfiguredUsers(rawValue: string, now: string): AuthUserRecord[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => typeof item?.email === 'string')
      .map((item) => buildConfiguredUser(item, now));
  } catch {
    return rawValue
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => Boolean(line) && !line.startsWith('#'))
      .map((line) => {
        const [emailPart, allowedPart = 'all'] = line.split('=');
        const normalizedAllowed: ConfiguredAllowedWorkspaces = allowedPart.trim();
        return buildConfiguredUser({
          email: emailPart,
          allowedWorkspaces: normalizedAllowed,
        }, now);
      });
  }
}

function buildConfiguredUser(
  item: ConfiguredUserInput,
  now: string,
): AuthUserRecord {
  const email = normalizeEmail(item.email || '');
  const nickname = typeof item.nickname === 'string' && item.nickname.trim()
    ? item.nickname.trim()
    : deriveNicknameFromEmail(email);
  return {
    accountId: typeof item.accountId === 'string' && item.accountId.trim()
      ? item.accountId.trim()
      : deriveAccountIdFromEmail(email),
    email,
    nickname,
    displayName: typeof item.displayName === 'string' && item.displayName.trim()
      ? item.displayName.trim()
      : nickname,
    allowedWorkspaces: normalizeAllowedWorkspaces(item.allowedWorkspaces),
    activationBound: item.activationBound !== false,
    activationKey: typeof item.activationKey === 'string' ? item.activationKey : undefined,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
    lastLoginAt: typeof item.lastLoginAt === 'string' ? item.lastLoginAt : now,
  };
}

function normalizeAllowedWorkspaces(
  input: ConfiguredAllowedWorkspaces,
): ActivationWorkspaceId[] {
  if (input === undefined || input === null) {
    return getAllWorkspaces();
  }

  if (typeof input === 'string') {
    if (isAllWorkspacesToken(input)) {
      return getAllWorkspaces();
    }

    const legacyDecoded = decodeLegacyWorkspaceCodes(input);
    if (legacyDecoded.length > 0) {
      return legacyDecoded;
    }

    const resolved = input
      .split(/[|,\s]+/)
      .map((item) => item.trim())
      .flatMap((item) => {
        if (isAllWorkspacesToken(item)) {
          return getAllWorkspaces();
        }

        const decoded = decodeLegacyWorkspaceCodes(item);
        if (decoded.length > 0) {
          return decoded;
        }

        return isActivationWorkspaceId(item) ? [item] : [];
      });

    return resolved.filter((workspace, index, list) => list.indexOf(workspace) === index);
  }

  if (Array.isArray(input)) {
    if (input.some((item) => typeof item === 'string' && isAllWorkspacesToken(item))) {
      return getAllWorkspaces();
    }

    const resolved = input.flatMap((item) => {
      if (typeof item !== 'string') {
        return [];
      }

      const decoded = decodeLegacyWorkspaceCodes(item);
      if (decoded.length > 0) {
        return decoded;
      }

      return isActivationWorkspaceId(item) ? [item] : [];
    });

    return resolved.filter((workspace, index, list) => list.indexOf(workspace) === index);
  }

  return getAllWorkspaces();
}

function isAllWorkspacesToken(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'all' || normalized === '12345';
}

function isKeEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(AUTH_EMAIL_DOMAIN);
}

function buildSessionCookie(sessionToken: string): string {
  return `${AUTH_SESSION_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getSessionSecret(): string {
  const configured = (process.env[AUTH_SESSION_SECRET_ENV_NAME] || '').trim();
  if (configured) {
    return configured;
  }

  const activationKeys = (process.env.ACTIVATION_KEYS || '').trim();
  const configuredUsers = (process.env[AUTH_DEFAULT_USERS_ENV_NAME] || '').trim();
  const localWhitelist = (process.env[AUTH_LOCAL_WHITELIST_ENV_NAME] || '').trim();
  return `fallback-session-secret:${activationKeys}:${configuredUsers}:${localWhitelist}:kegame`;
}

function signSessionPayload(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function createSessionToken(user: AuthUserRecord): string {
  const payload: SessionPayload = {
    accountId: user.accountId || deriveAccountIdFromEmail(user.email),
    email: user.email,
    nickname: user.nickname,
    displayName: user.displayName,
    allowedWorkspaces: user.allowedWorkspaces,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const serializedPayload = JSON.stringify(payload);
  const encodedPayload = encodeBase64Url(serializedPayload);
  const signature = signSessionPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseSessionToken(token: string): SessionPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signSessionPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<SessionPayload>;
    if (
      typeof payload?.email !== 'string'
      || typeof payload?.nickname !== 'string'
      || typeof payload?.displayName !== 'string'
      || typeof payload?.exp !== 'number'
      || !Array.isArray(payload?.allowedWorkspaces)
    ) {
      return null;
    }

    const allowedWorkspaces = payload.allowedWorkspaces.filter(isActivationWorkspaceId);
    if (allowedWorkspaces.length === 0) {
      return null;
    }

    return {
      accountId: typeof payload.accountId === 'string' && payload.accountId.trim()
        ? payload.accountId.trim()
        : deriveAccountIdFromEmail(payload.email),
      email: normalizeEmail(payload.email),
      nickname: payload.nickname.trim() || deriveNicknameFromEmail(payload.email),
      displayName: payload.displayName,
      allowedWorkspaces,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

function extractCookieValue(req: any, name: string): string {
  const rawCookie = req?.headers?.cookie;
  if (typeof rawCookie !== 'string' || !rawCookie) {
    return '';
  }

  const matches = rawCookie.split(';').map((part: string) => part.trim());
  const prefix = `${name}=`;
  const entry = matches.find((part: string) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : '';
}

function safeCompareHash(candidate: string, expectedHash: string): boolean {
  const candidateBuffer = Buffer.from(hashValue(candidate));
  const expectedBuffer = Buffer.from(expectedHash);

  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

function issueSession(store: AuthStore, email: string): LoginCompleteResult {
  const normalizedEmail = normalizeEmail(email);
  const user = store.users[normalizedEmail];

  user.accountId = user.accountId || deriveAccountIdFromEmail(user.email);
  user.lastLoginAt = new Date().toISOString();
  saveAuthStore(store);
  const sessionToken = createSessionToken(user);

  return {
    user,
    sessionToken,
    cookie: buildSessionCookie(sessionToken),
  };
}

export async function startEmailLogin(emailInput: string): Promise<LoginStartResult> {
  const email = normalizeEmail(emailInput);
  if (!email) {
    throw new Error('请输入邮箱。');
  }

  if (!isKeEmail(email)) {
    throw new Error('仅支持 @ke.com 邮箱登录。');
  }

  const store = getAuthStore();
  const existingUser = store.users[email];
  const bypassEmails = getBypassEmails();

  if (bypassEmails.has(email)) {
    if (!existingUser) {
      store.users[email] = {
        accountId: deriveAccountIdFromEmail(email),
        email,
        nickname: deriveNicknameFromEmail(email),
        displayName: deriveNicknameFromEmail(email),
        allowedWorkspaces: [...ACTIVATION_WORKSPACES],
        activationBound: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      saveAuthStore(store);
    }

    return {
      email,
      mode: 'trusted-bypass',
      user: store.users[email],
    };
  }

  const code = `${Math.floor(100000 + Math.random() * 900000)}`;
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS).toISOString();
  store.challenges[email] = {
    email,
    codeHash: hashValue(code),
    expiresAt,
  };
  saveAuthStore(store);
  await sendVerificationEmail({
    to: email,
    code,
    expiresAt,
  });

  return {
    email,
    mode: existingUser ? 'verification_required' : 'activation_required',
    verificationCode: code,
    expiresAt,
    user: existingUser,
  };
}

export function completeEmailLogin(input: {
  email: string;
  code?: string;
  activationKey?: string;
}): LoginCompleteResult {
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new Error('缺少邮箱。');
  }

  const store = getAuthStore();
  const bypassEmails = getBypassEmails();
  const existingUser = store.users[email];

  if (!bypassEmails.has(email)) {
    const challenge = store.challenges[email];
    if (!challenge) {
      throw new Error('验证码不存在或已过期，请重新获取。');
    }

    if (new Date(challenge.expiresAt).getTime() < Date.now()) {
      delete store.challenges[email];
      saveAuthStore(store);
      throw new Error('验证码已过期，请重新获取。');
    }

    if (!input.code || !safeCompareHash(input.code.trim(), challenge.codeHash)) {
      throw new Error('验证码错误。');
    }

    delete store.challenges[email];
  }

  if (!existingUser) {
    const activationKey = typeof input.activationKey === 'string' ? input.activationKey.trim() : '';
    const validation = validateActivationKey(activationKey);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    store.users[email] = {
      accountId: deriveAccountIdFromEmail(email),
      email,
      nickname: deriveNicknameFromEmail(email),
      displayName: deriveNicknameFromEmail(email),
      allowedWorkspaces: validation.allowedWorkspaces,
      activationBound: true,
      activationKey: validation.key,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
  }

  return issueSession(store, email);
}

export function authorizeSession(req: any): SessionAuthorizationResult {
  const sessionToken = extractCookieValue(req, AUTH_SESSION_COOKIE_NAME);
  if (sessionToken) {
    const payload = parseSessionToken(sessionToken);
    if (payload && payload.exp > Date.now()) {
      return {
        ok: true,
        accountId: payload.accountId,
        email: payload.email,
        nickname: payload.nickname,
        displayName: payload.displayName,
        allowedWorkspaces: payload.allowedWorkspaces,
        source: 'session',
      };
    }

    const store = getAuthStore();
    const configuredUser = store.users[normalizeEmail(payload?.email || '')];
    if (configuredUser && payload?.exp && payload.exp > Date.now()) {
      return {
        ok: true,
        accountId: configuredUser.accountId || deriveAccountIdFromEmail(configuredUser.email),
        email: configuredUser.email,
        nickname: configuredUser.nickname,
        displayName: configuredUser.displayName,
        allowedWorkspaces: configuredUser.allowedWorkspaces,
        source: 'session',
      };
    }

    if (!payload) {
      const legacyStore = getAuthStore() as AuthStore & {
        sessions?: Record<string, { email: string; expiresAt: string }>;
      };
      const legacySession = legacyStore.sessions?.[sessionToken];
      if (legacySession && new Date(legacySession.expiresAt).getTime() > Date.now()) {
        const user = legacyStore.users[legacySession.email];
        if (user) {
          return {
            ok: true,
            accountId: user.accountId || deriveAccountIdFromEmail(user.email),
            email: user.email,
            nickname: user.nickname,
            displayName: user.displayName,
            allowedWorkspaces: user.allowedWorkspaces,
            source: 'session',
          };
        }
      }
    }
  }

  const key = getHeaderValue(req, ACTIVATION_HEADER_NAME);
  if (key) {
    const validation = validateActivationKey(key);
    if (validation.ok) {
      return {
        ok: true,
        accountId: 'activation-key-user',
        email: 'activation-key-user',
        nickname: 'activation',
        displayName: 'Activation Key User',
        allowedWorkspaces: validation.allowedWorkspaces,
        source: 'activation-key',
        activationKey: validation.key,
      };
    }

    return {
      ok: false,
      status: validation.status,
      error: validation.error,
    };
  }

  return {
    ok: false,
    status: 401,
    error: '请先登录。',
  };
}

export function clearSessionCookie(): string {
  return `${AUTH_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function setAuthCookie(res: any, cookie: string) {
  res.setHeader('Set-Cookie', cookie);
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
