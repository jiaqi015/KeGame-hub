import './_bootstrap.js';
import { requireAdminPermission, isSessionAuthorizationFailure, listAllUsers, updateUserPermissions, deleteUser } from '../lib/auth.js';
import { neonListUsers, neonUpdatePermissions, neonDeleteUser, neonMigrateLegacyUsers, isAuthNeonAvailable } from '../lib/authNeon.js';
import { WORKSPACE_IDS } from '../lib/workspaces.js';
import { parseJsonBody } from './_request.js';

async function listAllUsersSafe() {
  if (isAuthNeonAvailable()) {
    await neonMigrateLegacyUsers();
    const neonUsers = await neonListUsers();
    if (neonUsers.length > 0) {
      return neonUsers.map(u => ({
        email: u.email,
        nickname: u.nickname,
        displayName: u.displayName,
        allowedWorkspaces: u.allowedWorkspaces,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      }));
    }
  }
  return listAllUsers();
}

async function updatePermissionsSafe(email: string, workspaces: string[]) {
  if (isAuthNeonAvailable()) {
    const result = await neonUpdatePermissions(email, workspaces);
    if (result) return result;
  }
  return updateUserPermissions(email, workspaces as any);
}

async function deleteUserSafe(email: string) {
  if (isAuthNeonAvailable()) {
    await neonDeleteUser(email);
  }
  await deleteUser(email);
}

export default async function handler(req: any, res: any) {
  const authorization = requireAdminPermission(req);
  if (isSessionAuthorizationFailure(authorization)) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  if (req.method === 'GET') {
    const users = await listAllUsersSafe();
    return res.status(200).json({
      users: users.map((user: any) => ({
        email: user.email,
        nickname: user.nickname,
        displayName: user.displayName,
        allowedWorkspaces: user.allowedWorkspaces,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
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

      const updatedUser = await updatePermissionsSafe(email, allowedWorkspaces);

      return res.status(200).json({
        ok: true,
        user: {
          email: updatedUser.email,
          nickname: updatedUser.nickname,
          displayName: updatedUser.displayName,
          allowedWorkspaces: updatedUser.allowedWorkspaces,
        },
      });
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : '更新权限失败。',
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const body = parseJsonBody(req.body);
      const email = typeof body?.email === 'string' ? body.email.trim() : '';

      if (email === authorization.email) {
        return res.status(400).json({ error: '不能删除自己。' });
      }

      await deleteUserSafe(email);

      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : '删除用户失败。',
      });
    }
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
