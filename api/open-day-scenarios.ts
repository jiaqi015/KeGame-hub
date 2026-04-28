import './_bootstrap.js';
import { authorizeRequest } from '../lib/activation.js';
import { handleOpenDayScenarioGet } from '../modules/open-day/interfaces/http/openDayScenarioGetHandler.js';
import { handleOpenDayScenarioList } from '../modules/open-day/interfaces/http/openDayScenarioListHandler.js';
import { handleOpenDayScenarioSave } from '../modules/open-day/interfaces/http/openDayScenarioSaveHandler.js';
import { handleOpenDayScenarioDelete } from '../modules/open-day/interfaces/http/openDayScenarioDeleteHandler.js';
import { handleOpenDayScenarioVersionList } from '../modules/open-day/interfaces/http/openDayScenarioVersionListHandler.js';
import { hasQueryValue, isOpenDayScenarioVersionQuery, parseJsonBody } from './_request.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authorization = authorizeRequest(req, 'open-day');
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    if (req.method === 'GET') {
      if (isOpenDayScenarioVersionQuery(req.query)) {
        const payload = await handleOpenDayScenarioVersionList(req.query || {});
        return res.status(200).json(payload);
      }

      if (hasQueryValue(req.query, 'id')) {
        const payload = await handleOpenDayScenarioGet(req.query || {});
        return res.status(200).json(payload);
      }

      const payload = await handleOpenDayScenarioList(req.query || {});
      return res.status(200).json(payload);
    }

    if (req.method === 'DELETE') {
      const payload = await handleOpenDayScenarioDelete(req.query || {});
      return res.status(200).json(payload);
    }

    const body = parseJsonBody(req.body);
    const payload = await handleOpenDayScenarioSave(body);
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : '开放日方案/版本接口失败' });
  }
}
