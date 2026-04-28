import './_bootstrap.js';
import { requireAdminPermission, isSessionAuthorizationFailure } from '../lib/auth.js';
import { WORKSPACE_IDS } from '../lib/workspaces.js';
import { parseJsonBody } from './_request.js';

function dbUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

async function sql(query: string, params: any[] = []) {
  const url = dbUrl();
  if (!url) throw new Error('No database URL');
  const res = await fetch(url + '/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': url },
    body: JSON.stringify({ query, params }),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.message || 'Database error');
  return data;
}

async function ensureSchema() {
  await sql(`CREATE TABLE IF NOT EXISTS auth_users (
    email TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    display_name TEXT NOT NULL,
    allowed_workspaces JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function migrateLegacy() {
  const allExceptAdmin = ['sabrina','open-day','selling-houses','market-management','rational-owner'];
  const allPerms = [...allExceptAdmin, 'admin'];
  const rows = await sql("SELECT user_id, display_name FROM maintainer_users WHERE user_id LIKE $1", ['acct_%']);
  for (const row of rows?.rows || []) {
    const email = `${row.display_name}@ke.com`;
    const workspaces = row.display_name === 'yangjiaqi015' ? allPerms : allExceptAdmin;
    await sql(
      `INSERT INTO auth_users (email, account_id, nickname, display_name, allowed_workspaces, created_at, last_login_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET
         allowed_workspaces = CASE WHEN auth_users.allowed_workspaces @> '["admin"]'::jsonb THEN auth_users.allowed_workspaces ELSE $5::jsonb END,
         last_login_at = NOW()`,
      [email, row.user_id, row.display_name, row.display_name, JSON.stringify(workspaces)]
    );
  }
  return rows?.rows?.length || 0;
}

export default async function handler(req: any, res: any) {
  if (!dbUrl()) {
    return res.status(503).json({ error: '数据库未配置。' });
  }

  const authorization = requireAdminPermission(req);
  if (isSessionAuthorizationFailure(authorization)) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    await ensureSchema();
    await migrateLegacy();
  } catch (e) {}

  try {
    if (req.method === 'GET') {
      const data = await sql('SELECT * FROM auth_users ORDER BY last_login_at DESC');
      const users = (data?.rows || []).map((u: any) => ({
        email: u.email,
        nickname: u.nickname,
        displayName: u.display_name,
        allowedWorkspaces: u.allowed_workspaces,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
      }));
      return res.status(200).json({ users, availableWorkspaces: WORKSPACE_IDS });
    }

    if (req.method === 'PUT') {
      const body = parseJsonBody(req.body);
      const email = typeof body?.email === 'string' ? body.email.trim() : '';
      const allowedWorkspaces = Array.isArray(body?.allowedWorkspaces)
        ? body.allowedWorkspaces.filter((w: unknown) => typeof w === 'string' && WORKSPACE_IDS.includes(w as any))
        : [];

      const data = await sql(
        'UPDATE auth_users SET allowed_workspaces = $1 WHERE email = $2 RETURNING *',
        [JSON.stringify(allowedWorkspaces), email]
      );
      const u = data?.rows?.[0];
      if (!u) return res.status(404).json({ error: '用户不存在。' });

      return res.status(200).json({
        ok: true,
        user: { email: u.email, nickname: u.nickname, displayName: u.display_name, allowedWorkspaces: u.allowed_workspaces },
      });
    }

    if (req.method === 'DELETE') {
      const body = parseJsonBody(req.body);
      const email = typeof body?.email === 'string' ? body.email.trim() : '';
      if (email === authorization.email) {
        return res.status(400).json({ error: '不能删除自己。' });
      }
      await sql('DELETE FROM auth_users WHERE email = $1', [email]);
      return res.status(200).json({ ok: true });
    }
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : '操作失败。' });
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
