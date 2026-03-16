import {streamCompareModel} from '../lib/compare.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error: 'Method Not Allowed'});
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const modelId = typeof body?.modelId === 'string' ? body.modelId.trim() : '';

  if (!prompt || !modelId) {
    return res.status(400).json({error: 'Invalid request parameters'});
  }

  const controller = new AbortController();
  req.on?.('close', () => controller.abort());

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const writeEvent = (payload: Record<string, unknown> | '[DONE]') => {
    if (res.writableEnded) {
      return;
    }

    const data = payload === '[DONE]' ? payload : JSON.stringify(payload);
    res.write(`data: ${data}\n\n`);
  };

  try {
    const result = await streamCompareModel(prompt, modelId, {
      signal: controller.signal,
      onDelta: async (delta) => {
        writeEvent({type: 'delta', delta});
      },
    });

    if (!controller.signal.aborted) {
      if (result.status === 'completed') {
        writeEvent({type: 'completed', result: result.result});
      } else {
        writeEvent({type: 'error', error: result.result});
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      writeEvent({
        type: 'error',
        error: error instanceof Error ? error.message : '流式比较失败。',
      });
    }
  } finally {
    if (!res.writableEnded) {
      writeEvent('[DONE]');
      res.end();
    }
  }
}
