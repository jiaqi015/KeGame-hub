export const ACTIVATION_STORAGE_KEY = 'kegame-activation-key';
export const AUTH_EMAIL_STORAGE_KEY = 'kegame-auth-email';
export const DIFFERENCE_SUMMARY_MODEL_ID = 'doubao-seed-2-0-pro-260215';

export interface CompareStreamEvent {
  type: 'delta' | 'completed' | 'error';
  delta?: string;
  channel?: 'reasoning' | 'output';
  result?: string;
  error?: string;
  reasoning?: string;
}

export function buildAuthorizedHeaders(activationKey: string, headers?: HeadersInit): Headers {
  const mergedHeaders = new Headers(headers);
  mergedHeaders.set('X-Activation-Key', activationKey);
  return mergedHeaders;
}

export async function verifyActivationKey(key: string): Promise<{ key: string; allowedWorkspaces: string[] }> {
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const demoKey = 'demo-mode-only';
  if (key && (key.includes('demo') || key.includes('demo-mode') || key === demoKey)) {
    return {
      key: demoKey,
      allowedWorkspaces: ['sabrina', 'open-day', 'selling-houses', 'market-management', 'rational-owner'],
    };
  }
  
  return {
    key: key || demoKey,
    allowedWorkspaces: ['sabrina', 'open-day', 'selling-houses', 'market-management', 'rational-owner'],
  };
}

export async function completeEmailLogin(_params: {
  email: string;
  code?: string;
  activationKey?: string;
}): Promise<{
  email: string;
  mode: 'trusted-bypass' | 'verification_required' | 'activation_required';
  allowedWorkspaces: string[];
  accountId?: string;
  nickname?: string;
  sessionExpiresAt?: string;
}> {
  await new Promise(resolve => setTimeout(resolve, 600));
  
  return {
    email: _params.email,
    mode: 'trusted-bypass',
    allowedWorkspaces: ['sabrina', 'open-day', 'selling-houses', 'market-management', 'rational-owner'],
    accountId: `user_${Date.now()}`,
    nickname: _params.email.split('@')[0],
    sessionExpiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
  };
}

export async function fetchAuthenticatedUser(): Promise<{
  email: string;
  accountId: string;
  nickname: string;
  displayName: string;
  allowedWorkspaces: string[];
  source: string;
  sessionExpiresAt: string | null;
}> {
  const stored = localStorage.getItem(AUTH_EMAIL_STORAGE_KEY);
  const email = stored || 'demo@kegame.local';
  
  return {
    email,
    accountId: `user_${Date.now()}`,
    nickname: email.split('@')[0],
    displayName: email.split('@')[0],
    allowedWorkspaces: ['sabrina', 'open-day', 'selling-houses', 'market-management', 'rational-owner'],
    source: 'session',
    sessionExpiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
  };
}

export async function logoutCurrentSession(): Promise<void> {
  localStorage.removeItem(ACTIVATION_STORAGE_KEY);
}

export async function startEmailLogin(_email: string): Promise<{
  email: string;
  mode: 'trusted-bypass' | 'verification_required' | 'activation_required';
  expiresAt?: string | null;
  verificationCode?: string | null;
  user?: object | null;
}> {
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return {
    email: _email,
    mode: 'trusted-bypass',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    verificationCode: null,
    user: null,
  };
}

export async function readCompareStream(
  _response: Response,
  _modelId: string,
  _onDelta: (delta: string, channel: 'reasoning' | 'output') => void,
): Promise<{ modelId: string; result: string; status: string; reasoning?: string }> {
  throw new Error('Comparison streaming not implemented');
}

export function shouldUsePromptThinkingFallback(_model: unknown): boolean {
  return false;
}

export function wrapPromptForVisibleThinking(prompt: string): string {
  return prompt;
}

export function buildDifferenceSummaryPrompt(
  _prompt: string,
  _modelIds: string[],
  _models: unknown[],
  _results: Record<string, unknown>,
): string {
  throw new Error('buildDifferenceSummaryPrompt not implemented');
}
