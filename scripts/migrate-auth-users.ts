import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || '');

async function main() {
  console.log('creating auth_users table...');
  await sql`CREATE TABLE IF NOT EXISTS auth_users (
    email TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    display_name TEXT NOT NULL,
    allowed_workspaces JSONB NOT NULL DEFAULT '[]'::jsonb,
    activation_bound BOOLEAN NOT NULL DEFAULT TRUE,
    activation_key TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NULL
  )`;
  await sql`ALTER TABLE auth_users ALTER COLUMN last_login_at DROP DEFAULT`;
  await sql`ALTER TABLE auth_users ALTER COLUMN last_login_at DROP NOT NULL`;
  console.log('auth_users table ready');

  const allExceptAdmin = ['sabrina','open-day','selling-houses','market-management','rational-owner'];
  const allPerms = [...allExceptAdmin, 'admin'];

  const rows = await sql`
    SELECT user_id, display_name, created_at, last_seen_at
    FROM maintainer_users
    WHERE user_id LIKE 'acct_%'
  `;
  console.log('found', rows.length, 'legacy users in maintainer_users');

  let migrated = 0;
  for (const row of rows) {
    const email = `${row.display_name}@ke.com`;
    const workspaces = row.display_name === 'yangjiaqi015' ? allPerms : allExceptAdmin;
    const createdAt = row.created_at || row.last_seen_at || new Date(0).toISOString();

    await sql`
      INSERT INTO auth_users (email, account_id, nickname, display_name, allowed_workspaces, created_at, last_login_at)
      VALUES (${email}, ${row.user_id}, ${row.display_name}, ${row.display_name}, ${JSON.stringify(workspaces)}, ${createdAt}, ${null})
      ON CONFLICT (email) DO UPDATE SET
        allowed_workspaces = CASE
          WHEN auth_users.allowed_workspaces @> ${JSON.stringify(['admin'])}::jsonb
          THEN auth_users.allowed_workspaces
          ELSE ${JSON.stringify(workspaces)}::jsonb
        END
    `;
    migrated++;
    console.log('  migrated:', email, '→', workspaces);
  }

  await sql`
    UPDATE auth_users
    SET last_login_at = NULL
    FROM maintainer_users
    WHERE auth_users.account_id = maintainer_users.user_id
      AND auth_users.email = maintainer_users.display_name || '@ke.com'
      AND (
        auth_users.last_login_at = maintainer_users.last_seen_at
        OR (
          maintainer_users.last_seen_at IS NULL
          AND auth_users.last_login_at = maintainer_users.created_at
        )
      )
  `;

  console.log('done. migrated', migrated, 'users');

  const all = await sql`SELECT email, display_name, allowed_workspaces FROM auth_users ORDER BY last_login_at DESC NULLS LAST, created_at DESC`;
  console.log('\n=== auth_users ===');
  for (const u of all) {
    console.log(`  ${u.email} (${u.display_name}): ${JSON.stringify(u.allowed_workspaces)}`);
  }
}

main().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
