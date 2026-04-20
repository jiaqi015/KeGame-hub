import './_bootstrap.js';
import { authorizeRequest } from '../lib/activation.js';
import { handleOpenDaySnapshotGet } from '../modules/open-day/interfaces/http/openDaySnapshotGetHandler.js';
import { handleOpenDaySnapshotList } from '../modules/open-day/interfaces/http/openDaySnapshotListHandler.js';
import { handleOpenDayScore } from '../modules/open-day/interfaces/http/openDayScoreHandler.js';
import { isOpenDaySnapshotDetailQuery, parseJsonBody } from './_request.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authorization = authorizeRequest(req, 'open-day');
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    if (req.method === 'POST') {
      const body = parseJsonBody(req.body);
      const payload = await handleOpenDayScore(body);
      return res.status(200).json(payload);
    }

    if (isOpenDaySnapshotDetailQuery(req.query)) {
      const payload = await handleOpenDaySnapshotGet(req.query || {});
      return res.status(200).json(payload);
    }

    const payload = await handleOpenDaySnapshotList(req.query || {});
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : '开放日历史/测算接口失败' });
  }
}
