import './_bootstrap.js';
import { requireAdminPermission, isSessionAuthorizationFailure } from '../lib/auth.js';
import { WORKSPACE_IDS } from '../lib/workspaces.js';
import { parseJsonBody } from './_request.js';

function getNeon() {
  const { neon } = require('@neondatabase/serverless');
  return neon;
}

function getSql() {
  return getNeon()(process.env.DATABASE_URL || process.env.POSTGRES_URL || '');
}

async function ensureSchema() {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS auth_users (
    email TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    display_name TEXT NOT NULL,
    allowed_workspaces JSONB NOT NULL DEFAULT '[]'::jsonb,
    activation_bound BOOLEAN NOT NULL DEFAULT TRUE,
    activation_key TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )` as any[];
}

async function migrateLegacy() {
  const sql = getSql();
  const allExceptAdmin = ['sabrina','open-day','selling-houses','market-management','rational-owner'];
  const allPerms = [...allExceptAdmin, 'admin'];
  const rows = await sql`SELECT user_id, display_name FROM maintainer_users WHERE user_id LIKE 'acct_%'` as any[];
  for (const row of rows) {
    const email = `${row.display_name}@ke.com`;
    const workspaces = row.display_name === 'yangjiaqi015' ? allPerms : allExceptAdmin;
    await sql`
      INSERT INTO auth_users (email, account_id, nickname, display_name, allowed_workspaces, created_at, last_login_at)
      VALUES (${email}, ${row.user_id}, ${row.display_name}, ${row.display_name}, ${JSON.stringify(workspaces)}, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET
        allowed_workspaces = CASE WHEN auth_users.allowed_workspaces @> '["admin"]'::jsonb THEN auth_users.allowed_workspaces ELSE '${JSON.stringify(workspaces)}'::jsonb END,
        last_login_at = NOW()
    `;
  }
  return rows.length;
}

export default async function handler(req: any, res: any) {
  const authorization = requireAdminPermission(req);
  if (isSessionAuthorizationFailure(authorization)) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  const sql = getSql();
  await ensureSchema();
  await migrateLegacy();

  if (req.method === 'GET') {
    const users = await sql`SELECT * FROM auth_users ORDER BY last_login_at DESC` as any[];
    return res.status(200).json({
      users: users.map((u: any) => ({
        email: u.email,
        nickname: u.nickname,
        displayName: u.display_name,
        allowedWorkspaces: u.allowed_workspaces,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
      })),
      availableWorkspaces: WORKSPACE_IDS,
    });
  }

  if (req.method === 'PUT') {
    try {
      const body = parseJsonBody(req.body);
      const email = typeof body?.email === 'string' ? body.email.trim() : '';
      const allowedWorkspaces = Array.isArray(body?.allowedWorkspaces)
        ? body.allowedWorkspaces.filter((w: unknown) => typeof w === 'string' && WORKSPACE_IDS.includes(w as any))
        : [];

      const rows = await sql`
        UPDATE auth_users SET allowed_workspaces = ${JSON.stringify(allowedWorkspaces)} WHERE email = ${email} RETURNING *
      ` as any[];

      const u = rows?.[0];
      if (!u) return res.status(404).json({ error: '用户不存在。' });

      return res.status(200).json({
        ok: true,
        user: {
          email: u.email,
          nickname: u.nickname,
          displayName: u.display_name,
          allowedWorkspaces: u.allowed_workspaces,
        },
      });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : '更新权限失败。' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const body = parseJsonBody(req.body);
      const email = typeof body?.email === 'string' ? body.email.trim() : '';

      if (email === authorization.email) {
        return res.status(400).json({ error: '不能删除自己。' });
      }

      await sql`DELETE FROM auth_users WHERE email = ${email}`;
      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : '删除用户失败。' });
    }
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
