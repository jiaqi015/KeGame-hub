import './_bootstrap.js';
import { authorizeRequestPersisted } from '../lib/activation.js';
import { handleOpenDayCatalog } from '../modules/open-day/interfaces/http/openDayCatalogHandler.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authorization = await authorizeRequestPersisted(req, 'open-day');
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  return res.status(200).json(handleOpenDayCatalog());
}
