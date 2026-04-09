import { authorizeRequest } from '../lib/activation.js';
import { handleOpenDaySnapshotList } from '../modules/open-day/interfaces/http/openDaySnapshotListHandler.js';

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
    const payload = await handleOpenDaySnapshotList(req.query || {});
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : '开放日历史查询失败' });
  }
}
