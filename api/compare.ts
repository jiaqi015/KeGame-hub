import {authorizeRequest} from '../lib/activation.js';
import {compareModels} from '../lib/compare.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error: 'Method Not Allowed'});
  }

  const authorization = authorizeRequest(req);

  if (!authorization.ok) {
    return res.status(authorization.status).json({error: authorization.error});
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const models = Array.isArray(body?.models) ? body.models.filter((item: unknown) => typeof item === 'string') : [];

  if (!prompt || models.length === 0) {
    return res.status(400).json({error: 'Invalid request parameters'});
  }

  const results = await compareModels(prompt, models);
  return res.status(200).json({results});
}
