import './_bootstrap.js';
import {
  authorizeSessionPersisted,
  clearSessionCookie,
  completeEmailLoginPersisted,
  isSessionAuthorizationFailure,
  refreshSession,
  setAuthCookie,
  startEmailLoginPersisted,
} from '../lib/auth.js';
import { validateActivationKey } from '../lib/activation.js';
import { getQueryValue, parseJsonBody } from './_request.js';

function getMode(req: any): string {
  return getQueryValue(req?.query, 'mode');
}

export default async function handler(req: any, res: any) {
  const mode = getMode(req);

  if (mode === 'activate') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const body = parseJsonBody(req.body);
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    const validation = validateActivationKey(key);

    if (!validation.ok) {
      return res.status(validation.status).json({ error: validation.error });
    }

    return res.status(200).json({
      ok: true,
      key: validation.key,
      allowedWorkspaces: validation.allowedWorkspaces,
    });
  }

  if (mode === 'start') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
      const body = parseJsonBody(req.body);
      const email = typeof body?.email === 'string' ? body.email : '';
      const result = await startEmailLoginPersisted(email);

      return res.status(200).json({
        ok: true,
        email: result.email,
        mode: result.mode,
        expiresAt: result.expiresAt || null,
        verificationCode: result.verificationCode || null,
        user: result.user || null,
      });
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : '登录初始化失败。',
      });
    }
  }

  if (mode === 'complete') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
      const body = parseJsonBody(req.body);
      const result = await completeEmailLoginPersisted({
        email: typeof body?.email === 'string' ? body.email : '',
        code: typeof body?.code === 'string' ? body.code : '',
        activationKey: typeof body?.activationKey === 'string' ? body.activationKey : '',
      });

      setAuthCookie(res, result.cookie);

      return res.status(200).json({
        ok: true,
        user: result.user,
        sessionExpiresAt: result.expiresAt,
      });
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : '登录失败。',
      });
    }
  }

  if (mode === 'me') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const authorization = await authorizeSessionPersisted(req);
    if (isSessionAuthorizationFailure(authorization)) {
      return res.status(authorization.status).json({ error: authorization.error });
    }

    let sessionExpiresAt: string | null = null;
    if (authorization.source === 'session') {
      const refreshed = refreshSession({
        accountId: authorization.accountId,
        email: authorization.email,
        nickname: authorization.nickname,
        displayName: authorization.displayName,
        allowedWorkspaces: authorization.allowedWorkspaces,
      });
      setAuthCookie(res, refreshed.cookie);
      sessionExpiresAt = refreshed.expiresAt;
    }

    return res.status(200).json({
      ok: true,
      user: {
        accountId: authorization.accountId,
        email: authorization.email,
        nickname: authorization.nickname,
        displayName: authorization.displayName,
        allowedWorkspaces: authorization.allowedWorkspaces,
        source: authorization.source,
      },
      sessionExpiresAt,
    });
  }

  if (mode === 'logout') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    setAuthCookie(res, clearSessionCookie());
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ error: 'Auth route not found.' });
}
