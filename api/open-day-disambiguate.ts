import './_bootstrap.js';
import { openDayDisambiguationHandler } from '../modules/open-day/interfaces/http/openDayDisambiguationHandler.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  return openDayDisambiguationHandler(req, res);
}
