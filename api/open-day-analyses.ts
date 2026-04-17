import { authorizeRequest } from '../lib/activation.js';
import { handleOpenDaySnapshotGet } from '../modules/open-day/interfaces/http/openDaySnapshotGetHandler.js';
import { handleOpenDaySnapshotList } from '../modules/open-day/interfaces/http/openDaySnapshotListHandler.js';
import { handleOpenDayScore } from '../modules/open-day/interfaces/http/openDayScoreHandler.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authorization = authorizeRequest(req);
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const payload = await handleOpenDayScore(body);
      return res.status(200).json(payload);
    }

    if (
      (typeof req.query?.id === 'string' && req.query.id)
      || (typeof req.query?.runId === 'string' && req.query.runId)
    ) {
      const payload = await handleOpenDaySnapshotGet(req.query || {});
      return res.status(200).json(payload);
    }

    const payload = await handleOpenDaySnapshotList(req.query || {});
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : '开放日历史/测算接口失败' });
  }
}
