import { authorizeRequest } from '../lib/activation.js';
import { handleOpenDayScenarioGet } from '../modules/open-day/interfaces/http/openDayScenarioGetHandler.js';
import { handleOpenDayScenarioList } from '../modules/open-day/interfaces/http/openDayScenarioListHandler.js';
import { handleOpenDayScenarioSave } from '../modules/open-day/interfaces/http/openDayScenarioSaveHandler.js';

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
    if (req.method === 'GET') {
      if (typeof req.query?.id === 'string' && req.query.id) {
        const payload = await handleOpenDayScenarioGet(req.query || {});
        return res.status(200).json(payload);
      }

      const payload = await handleOpenDayScenarioList(req.query || {});
      return res.status(200).json(payload);
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const payload = await handleOpenDayScenarioSave(body);
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : '开放日方案接口失败' });
  }
}
