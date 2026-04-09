import { authorizeRequest } from '../lib/activation.js';
import { handleOpenDayScore } from '../modules/open-day/interfaces/http/openDayScoreHandler.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authorization = authorizeRequest(req);
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const payload = await handleOpenDayScore(body);
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : '开放日测算失败' });
  }
}
