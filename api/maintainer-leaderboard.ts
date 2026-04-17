import { authorizeRequest } from '../lib/activation.js';
import { handleMaintainerLeaderboardList } from '../src/selling-houses/interfaces/http/maintainerLeaderboardHandler.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authorization = authorizeRequest(req);
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    const payload = await handleMaintainerLeaderboardList(req.query || {});
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : '排行榜查询失败',
    });
  }
}
