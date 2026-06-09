import './_bootstrap.js';
import { authorizeRequestPersisted } from '../lib/activation.js';
import { handleAiArrangement } from '../src/selling-houses/interfaces/http/aiArrangementHandlers.js';
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

  const body = parseJsonBody(req.body);
  const fallbackDay = typeof body?.day === 'number' ? body.day : 0;

  try {
    const result = await handleAiArrangement(body?.state, body?.arrangement, body?.currentSlot || 'am');
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(200).json({
      ok: false,
      proposal: {
        proposalId: `fallback-${Date.now()}`,
        day: fallbackDay,
        source: 'fallback',
        confidence: 0.42,
        headline: '今天暂时不用再加安排',
        summary: '当前余量或候选动作不足，先处理已有安排。',
        evidenceLabels: [],
        drafts: [],
      },
      source: 'fallback',
      error: error instanceof Error ? error.message : 'AI 安排生成失败',
    });
  }
}
