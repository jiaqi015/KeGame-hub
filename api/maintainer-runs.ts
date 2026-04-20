import './_bootstrap.js';
import { authorizeRequest } from '../lib/activation.js';
import {
  hasQueryValue,
  isMaintainerLeaderboardDetailQuery,
  isMaintainerLeaderboardQuery,
  parseJsonBody,
} from './_request.js';
import {
  handleMaintainerLeaderboardDetail,
  handleMaintainerLeaderboardList,
} from '../src/selling-houses/interfaces/http/maintainerLeaderboardHandler.js';
import {
  type MaintainerRunIdentityContext,
  handleMaintainerRunCreate,
  handleMaintainerRunGet,
  handleMaintainerRunList,
  handleMaintainerRunSave,
  isMaintainerSyncConflictError,
} from '../src/selling-houses/interfaces/http/maintainerRunHandlers.js';

function buildIdentityContext(authorization: {
  accountId?: string;
  displayName?: string;
  nickname?: string;
  source?: 'session' | 'activation-key';
}): MaintainerRunIdentityContext {
  return {
    accountId: authorization.accountId,
    displayName: authorization.displayName || authorization.nickname,
    source: authorization.source,
  };
}

export default async function handler(req: any, res: any) {
  if (!['GET', 'POST', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PUT');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authorization = authorizeRequest(req, 'selling-houses');
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    const identity = buildIdentityContext(authorization);

    if (req.method === 'GET') {
      if (isMaintainerLeaderboardDetailQuery(req.query)) {
        const payload = await handleMaintainerLeaderboardDetail(req.query || {});
        return res.status(200).json(payload);
      }

      if (isMaintainerLeaderboardQuery(req.query)) {
        const payload = await handleMaintainerLeaderboardList(req.query || {});
        return res.status(200).json(payload);
      }

      if (hasQueryValue(req.query, 'id')) {
        const payload = await handleMaintainerRunGet(req.query || {}, identity);
        return res.status(200).json(payload);
      }

      const payload = await handleMaintainerRunList(req.query || {}, identity);
      return res.status(200).json(payload);
    }

    const body = parseJsonBody(req.body);

    if (req.method === 'POST') {
      const payload = await handleMaintainerRunCreate(body, identity);
      return res.status(200).json(payload);
    }

    const payload = await handleMaintainerRunSave(body, identity);
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
