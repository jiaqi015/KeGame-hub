import './_bootstrap.js';
import {
  deleteUserPersisted,
  isSessionAuthorizationFailure,
  listAllUsersPersisted,
  requireAdminPermissionPersisted,
  updateUserPermissionsPersisted,
  type AuthUserRecord,
} from '../lib/auth.js';
import { WORKSPACE_IDS } from '../lib/workspaces.js';
import { parseJsonBody } from './_request.js';

function toUserPayload(user: AuthUserRecord) {
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
  const authorization = await requireAdminPermissionPersisted(req);
  if (isSessionAuthorizationFailure(authorization)) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    if (req.method === 'GET') {
      const users = await listAllUsersPersisted();
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

      const updatedUser = await updateUserPermissionsPersisted(email, allowedWorkspaces);

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

      await deleteUserPersisted(email);
      return res.status(200).json({ ok: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '操作失败。';
    return res.status(message === '用户不存在。' ? 404 : 400).json({ error: message });
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
}
