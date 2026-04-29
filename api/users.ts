import './_bootstrap.js';
import { isSessionAuthorizationFailure, requireAdminPermissionPersisted } from '../lib/auth.js';
import {
  isAuthNeonAvailable,
  neonDeleteUser,
  neonListUsers,
  neonMigrateLegacyUsers,
  neonUpdatePermissions,
  type AuthNeonUser,
} from '../lib/authNeon.js';
import { WORKSPACE_IDS } from '../lib/workspaces.js';
import { parseJsonBody } from './_request.js';

function toUserPayload(user: AuthNeonUser) {
  return {
    email: user.email,
    nickname: user.nickname,
    displayName: user.displayName,
    allowedWorkspaces: user.allowedWorkspaces,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export default async function handler(req: any, res: any) {
  if (!isAuthNeonAvailable()) {
    return res.status(503).json({ error: '数据库未配置。' });
  }

  const authorization = await requireAdminPermissionPersisted(req);
  if (isSessionAuthorizationFailure(authorization)) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    await neonMigrateLegacyUsers();
  } catch (_error) {
    // 后台列表不因历史数据迁移失败而阻断当前已存在用户管理。
  }

  try {
    if (req.method === 'GET') {
      const users = await neonListUsers();
      return res.status(200).json({
        users: users.map(toUserPayload),
        availableWorkspaces: WORKSPACE_IDS,
      });
    }

    if (req.method === 'PUT') {
      const body = parseJsonBody(req.body);
      const email = typeof body?.email === 'string' ? body.email.trim() : '';
      const allowedWorkspaces = Array.isArray(body?.allowedWorkspaces)
        ? body.allowedWorkspaces.filter((workspace: unknown) => (
          typeof workspace === 'string' && WORKSPACE_IDS.includes(workspace as any)
        ))
        : [];

      const updatedUser = await neonUpdatePermissions(email, allowedWorkspaces);
      if (!updatedUser) {
        return res.status(404).json({ error: '用户不存在。' });
      }

      return res.status(200).json({
        ok: true,
        user: toUserPayload(updatedUser),
      });
    }

    if (req.method === 'DELETE') {
      const body = parseJsonBody(req.body);
      const email = typeof body?.email === 'string' ? body.email.trim() : '';
      if (email === authorization.email) {
        return res.status(400).json({ error: '不能删除自己。' });
      }

      await neonDeleteUser(email);
      return res.status(200).json({ ok: true });
    }
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : '操作失败。' });
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
