import { neon } from '@neondatabase/serverless';

export interface AuthNeonUser {
  accountId: string;
  email: string;
  nickname: string;
  displayName: string;
  allowedWorkspaces: string[];
  activationBound: boolean;
  activationKey?: string;
  createdAt: string;
  lastLoginAt: string;
}

type AuthSqlClient = ReturnType<typeof neon>;

let schemaReady: Promise<void> | null = null;

function getConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

export function isAuthNeonAvailable() {
  return Boolean(getConnectionString());
}

function getSql(): AuthSqlClient {
  return neon(getConnectionString());
}

function ensureSchema(sql?: AuthSqlClient) {
  if (!schemaReady) {
    const client = sql || getSql();
    schemaReady = (async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS auth_users (
          email TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          nickname TEXT NOT NULL,
          display_name TEXT NOT NULL,
          allowed_workspaces JSONB NOT NULL DEFAULT '[]'::jsonb,
          activation_bound BOOLEAN NOT NULL DEFAULT TRUE,
          activation_key TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS auth_challenges (
          email TEXT PRIMARY KEY,
          code_hash TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);

      await client.query('ALTER TABLE auth_challenges DROP CONSTRAINT IF EXISTS auth_challenges_email_fkey');
    })();
  }
  return schemaReady;
}

function rowToUser(row: any): AuthNeonUser {
  const allowedWorkspaces: string[] = Array.isArray(row.allowed_workspaces)
    ? row.allowed_workspaces
    : [];

  return {
    accountId: row.account_id,
    email: row.email,
    nickname: row.nickname,
    displayName: row.display_name || row.nickname,
    allowedWorkspaces,
    activationBound: row.activation_bound !== false,
    activationKey: row.activation_key || undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
    lastLoginAt: row.last_login_at instanceof Date ? row.last_login_at.toISOString() : String(row.last_login_at || ''),
  };
}

export async function neonGetUser(email: string): Promise<AuthNeonUser | null> {
  if (!isAuthNeonAvailable()) return null;
  await ensureSchema();
  const rows = await getSql()`SELECT * FROM auth_users WHERE email = ${email}` as any[];
  return rows.length > 0 ? rowToUser(rows[0]) : null;
}

export async function neonUpsertUser(user: AuthNeonUser): Promise<void> {
  if (!isAuthNeonAvailable()) return;
  await ensureSchema();
  await getSql()`
    INSERT INTO auth_users (email, account_id, nickname, display_name, allowed_workspaces, activation_bound, activation_key, created_at, last_login_at)
    VALUES (${user.email}, ${user.accountId}, ${user.nickname}, ${user.displayName}, ${JSON.stringify(user.allowedWorkspaces)}, ${user.activationBound}, ${user.activationKey || null}, ${user.createdAt}, ${user.lastLoginAt})
    ON CONFLICT (email) DO UPDATE SET
      account_id = EXCLUDED.account_id,
      nickname = EXCLUDED.nickname,
      display_name = EXCLUDED.display_name,
      allowed_workspaces = EXCLUDED.allowed_workspaces,
      activation_bound = EXCLUDED.activation_bound,
      activation_key = COALESCE(EXCLUDED.activation_key, auth_users.activation_key),
      last_login_at = EXCLUDED.last_login_at
  `;
}

export async function neonListUsers(): Promise<AuthNeonUser[]> {
  if (!isAuthNeonAvailable()) return [];
  await ensureSchema();
  const rows = await getSql()`SELECT * FROM auth_users ORDER BY last_login_at DESC` as any[];
  return rows.map(rowToUser);
}

export async function neonUpdatePermissions(email: string, allowedWorkspaces: string[]): Promise<AuthNeonUser | null> {
  if (!isAuthNeonAvailable()) return null;
  await ensureSchema();
  const rows = await getSql()`
    UPDATE auth_users
    SET allowed_workspaces = ${JSON.stringify(allowedWorkspaces)}
    WHERE email = ${email}
    RETURNING *
  ` as any[];
  return rows.length > 0 ? rowToUser(rows[0]) : null;
}

export async function neonDeleteUser(email: string): Promise<void> {
  if (!isAuthNeonAvailable()) return;
  await ensureSchema();
  await getSql()`DELETE FROM auth_users WHERE email = ${email}`;
}

export async function neonSaveChallenge(email: string, codeHash: string, expiresAt: string): Promise<void> {
  if (!isAuthNeonAvailable()) return;
  await ensureSchema();
  await getSql()`
    INSERT INTO auth_challenges (email, code_hash, expires_at)
    VALUES (${email}, ${codeHash}, ${expiresAt})
    ON CONFLICT (email) DO UPDATE SET
      code_hash = EXCLUDED.code_hash,
      expires_at = EXCLUDED.expires_at
  `;
}

export async function neonGetChallenge(email: string): Promise<{ email: string; codeHash: string; expiresAt: string } | null> {
  if (!isAuthNeonAvailable()) return null;
  await ensureSchema();
  const rows = await getSql()`SELECT * FROM auth_challenges WHERE email = ${email}` as any[];
  if (rows.length === 0) return null;
  return {
    email: rows[0].email,
    codeHash: rows[0].code_hash,
    expiresAt: rows[0].expires_at instanceof Date ? rows[0].expires_at.toISOString() : String(rows[0].expires_at),
  };
}

export async function neonDeleteChallenge(email: string): Promise<void> {
  if (!isAuthNeonAvailable()) return;
  await ensureSchema();
  await getSql()`DELETE FROM auth_challenges WHERE email = ${email}`;
}

export async function neonMigrateLegacyUsers(): Promise<number> {
  if (!isAuthNeonAvailable()) return 0;
  await ensureSchema();

  const allWorkspacesExceptAdmin: string[] = [
    'sabrina', 'open-day', 'selling-houses', 'market-management', 'rational-owner',
  ];
  const allWorkspaces: string[] = [...allWorkspacesExceptAdmin, 'admin'];

  const rows = await getSql()`
    SELECT user_id, display_name FROM maintainer_users
    WHERE user_id LIKE 'acct_%'
  ` as any[];

  let migrated = 0;
  for (const row of rows) {
    const email = `${row.display_name}@ke.com`;
    const allowedWorkspaces = row.display_name === 'yangjiaqi015'
      ? allWorkspaces
      : allWorkspacesExceptAdmin;

    await getSql()`
      INSERT INTO auth_users (email, account_id, nickname, display_name, allowed_workspaces, created_at, last_login_at)
      VALUES (${email}, ${row.user_id}, ${row.display_name}, ${row.display_name}, ${JSON.stringify(allowedWorkspaces)}, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET
        allowed_workspaces = CASE
          WHEN auth_users.allowed_workspaces @> ${JSON.stringify(['admin'])}::jsonb
          THEN auth_users.allowed_workspaces
          ELSE EXCLUDED.allowed_workspaces
        END
    `;
    migrated++;
  }

  return migrated;
}
