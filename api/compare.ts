import './_bootstrap.js';
import {authorizeRequest} from '../lib/activation.js';
import {compareModels, streamCompareModel} from '../lib/compare.js';
import {AVAILABLE_MODELS} from '../lib/models.js';
import { isStreamRequested, parseJsonBody } from './_request.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({error: 'Method Not Allowed'});
  }

  const authorization = authorizeRequest(req, 'sabrina');

  if (!authorization.ok) {
    return res.status(authorization.status).json({error: authorization.error});
  }

  if (req.method === 'GET') {
    return res.status(200).json({models: AVAILABLE_MODELS});
  }

  const body = parseJsonBody(req.body);
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const streamRequested = isStreamRequested(req.query, body);

  if (streamRequested) {
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
        onDelta: async (delta, channel) => {
          writeEvent({type: 'delta', delta, channel});
        },
      });

      if (!controller.signal.aborted) {
        if (result.status === 'completed') {
          writeEvent({type: 'completed', result: result.result, reasoning: result.reasoning});
        } else {
          writeEvent({type: 'error', error: result.result, reasoning: result.reasoning});
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

    return;
  }

  const models = Array.isArray(body?.models) ? body.models.filter((item: unknown) => typeof item === 'string') : [];

  if (!prompt || models.length === 0) {
    return res.status(400).json({error: 'Invalid request parameters'});
  }

  const results = await compareModels(prompt, models);
  return res.status(200).json({results});
}
