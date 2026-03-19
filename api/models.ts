import {authorizeRequest} from '../lib/activation.js';
import {AVAILABLE_MODELS} from '../lib/models.js';

export default async function handler(req: any, res: any) {
  const authorization = authorizeRequest(req);

  if (!authorization.ok) {
    return res.status(authorization.status).json({error: authorization.error});
  }

  return res.status(200).json({models: AVAILABLE_MODELS});
}
