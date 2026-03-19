import {validateActivationKey} from '../lib/activation.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error: 'Method Not Allowed'});
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  const validation = validateActivationKey(key);

  if (!validation.ok) {
    return res.status(validation.status).json({error: validation.error});
  }

  return res.status(200).json({ok: true});
}
