import './_bootstrap.js';
import { requireAdminPermission, listAllUsers, updateUserPermissions, deleteUser } from '../lib/auth.js';
import { WORKSPACE_IDS } from '../lib/workspaces.js';
import { parseJsonBody } from './_request.js';

export default async function handler(req: any, res: any) {
  const authorization = requireAdminPermission(req);
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  if (req.method === 'GET') {
    const users = await listAllUsers();
    return res.status(200).json({
      users: users.map((user) => ({
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

      const updatedUser = await updateUserPermissions(email, allowedWorkspaces);

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

      await deleteUser(email);

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
