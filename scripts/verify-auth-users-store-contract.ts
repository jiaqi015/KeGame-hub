import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8');
}

function bodyOfFunction(source: string, functionName: string) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `Expected ${functionName} to exist`);
  const openBrace = source.indexOf('{', start);
  assert.notEqual(openBrace, -1, `Expected ${functionName} to have a body`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(openBrace + 1, index);
    }
  }

  throw new Error(`Could not parse ${functionName} body`);
}

const apiUsers = read('api/users.ts');

assert.ok(
  apiUsers.includes("from '../lib/auth.js'"),
  'Expected /api/users to use the persisted auth facade',
);
assert.ok(
  apiUsers.includes('listAllUsersPersisted')
  && apiUsers.includes('updateUserPermissionsPersisted')
  && apiUsers.includes('deleteUserPersisted'),
  'Expected /api/users CRUD to share the same persisted store as login',
);
assert.ok(
  !/neon(ListUsers|UpdatePermissions|DeleteUser|MigrateLegacyUsers)/.test(apiUsers),
  'Expected /api/users not to bypass lib/auth persisted store helpers',
);

const apiAuth = read('api/auth.ts');
assert.ok(
  apiAuth.includes('startEmailLoginPersisted')
  && apiAuth.includes('completeEmailLoginPersisted')
  && apiAuth.includes('authorizeSessionPersisted'),
  'Expected /api/auth login and session checks to use persisted auth helpers',
);

const auth = read('lib/auth.ts');
const persistedAuthorization = bodyOfFunction(auth, 'authorizeSessionPersisted');
assert.ok(
  persistedAuthorization.includes('await neonGetUser(payload.email)'),
  'Expected persisted session authorization to reload permissions from Neon',
);

const authNeon = read('lib/authNeon.ts');
const runtimeMigration = bodyOfFunction(authNeon, 'neonMigrateLegacyUsers');
assert.ok(
  runtimeMigration.includes('last_seen_at') && runtimeMigration.includes('SET last_login_at = NULL'),
  'Expected runtime migration to clear legacy lastLoginAt instead of treating maintainer last_seen_at as login',
);
assert.ok(
  !/last_login_at\s*=\s*(NOW\(\)|EXCLUDED\.last_login_at)/.test(runtimeMigration),
  'Expected runtime migration not to refresh last_login_at on conflict',
);
assert.ok(
  runtimeMigration.includes('${null}'),
  'Expected runtime migration to create migrated users with null last_login_at',
);
assert.ok(
  !/VALUES\s*\([^)]*NOW\(\)\s*,\s*NOW\(\)/s.test(runtimeMigration),
  'Expected runtime migration not to stamp migrated users as freshly logged in',
);

const manualMigration = read('scripts/migrate-auth-users.ts');
assert.ok(
  manualMigration.includes('last_seen_at') && manualMigration.includes('SET last_login_at = NULL'),
  'Expected manual migration to clear legacy lastLoginAt instead of treating maintainer last_seen_at as login',
);
assert.ok(
  !/last_login_at\s*=\s*NOW\(\)/.test(manualMigration),
  'Expected manual migration not to refresh last_login_at on conflict',
);
assert.ok(
  manualMigration.includes('${null}'),
  'Expected manual migration to create migrated users with null last_login_at',
);

console.log('auth users store contract verification passed');
