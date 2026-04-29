import './_bootstrap.js';
import { authorizeRequestPersisted } from '../lib/activation.js';
import {
  handleSellingHousesScenarioGet,
  handleSellingHousesScenarioList,
} from '../src/selling-houses/interfaces/http/sellingHousesScenarioHandlers.js';
import { hasQueryValue } from './_request.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authorization = await authorizeRequestPersisted(req, 'selling-houses');
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    if (hasQueryValue(req.query, 'id')) {
      const payload = await handleSellingHousesScenarioGet(req.query || {});
      return res.status(200).json(payload);
    }

    const payload = await handleSellingHousesScenarioList(req.query || {});
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : '剧本查询失败',
    });
  }
}
