import {AVAILABLE_MODELS} from '../lib/models.js';

export default async function handler(_req: any, res: any) {
  return res.status(200).json({models: AVAILABLE_MODELS});
}
