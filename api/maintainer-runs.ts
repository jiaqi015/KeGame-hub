import { authorizeRequest } from '../lib/activation.js';
import { handleMaintainerLeaderboardList } from '../src/selling-houses/interfaces/http/maintainerLeaderboardHandler.js';
import {
  handleMaintainerRunCreate,
  handleMaintainerRunGet,
  handleMaintainerRunList,
  handleMaintainerRunSave,
  isMaintainerSyncConflictError,
} from '../src/selling-houses/interfaces/http/maintainerRunHandlers.js';

export default async function handler(req: any, res: any) {
  if (!['GET', 'POST', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PUT');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authorization = authorizeRequest(req);
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    if (req.method === 'GET') {
      if (req.query?.view === 'leaderboard') {
        const payload = await handleMaintainerLeaderboardList(req.query || {});
        return res.status(200).json(payload);
      }

      if (typeof req.query?.id === 'string' && req.query.id) {
        const payload = await handleMaintainerRunGet(req.query || {});
        return res.status(200).json(payload);
      }

      const payload = await handleMaintainerRunList(req.query || {});
      return res.status(200).json(payload);
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (req.method === 'POST') {
      const payload = await handleMaintainerRunCreate(body);
      return res.status(200).json(payload);
    }

    const payload = await handleMaintainerRunSave(body);
    return res.status(200).json(payload);
  } catch (error) {
    if (isMaintainerSyncConflictError(error)) {
      return res.status(409).json({
        error: error.message,
        latest: error.latest,
      });
    }

    return res.status(400).json({
      error: error instanceof Error ? error.message : '云端存档接口失败',
    });
  }
}
