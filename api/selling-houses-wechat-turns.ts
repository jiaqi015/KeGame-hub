import './_bootstrap.js';
import { authorizeRequestPersisted } from '../lib/activation.js';
import { handleMyWechatConversationTurn } from '../src/selling-houses/interfaces/http/myWechatConversationHandlers.js';
import { parseJsonBody } from './_request.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authorization = await authorizeRequestPersisted(req, 'selling-houses');
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    const result = await handleMyWechatConversationTurn(parseJsonBody(req.body));
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(200).json({
      ok: false,
      source: 'fallback',
      error: error instanceof Error ? error.message : '微信对话理解失败',
    });
  }
}
