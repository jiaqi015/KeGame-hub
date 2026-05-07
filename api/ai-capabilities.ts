import './_bootstrap.js';
import {authorizeRequestPersisted} from '../lib/activation.js';
import {
  callAiCapability,
  getAiPlatformOverview,
  getAvailableAiCapabilities,
  streamAiCapability,
} from '../lib/aiCapabilityRuntime.js';
import type {AiCapabilityWorkspace} from '../lib/aiCapabilities.js';
import {isStreamRequested, parseJsonBody} from './_request.js';

function getWorkspace(rawValue: unknown): AiCapabilityWorkspace {
  return rawValue === 'sabrina'
    || rawValue === 'open-day'
    || rawValue === 'selling-houses'
    ? rawValue
    : 'global';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({error: 'Method Not Allowed'});
  }

  const requestWorkspace = getWorkspace(req.method === 'GET' ? req.query?.workspace : parseJsonBody(req.body)?.workspace);
  const authorization = await authorizeRequestPersisted(
    req,
    requestWorkspace === 'global' ? undefined : requestWorkspace,
  );

  if (!authorization.ok) {
    return res.status(authorization.status).json({error: authorization.error});
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      capabilities: getAvailableAiCapabilities(requestWorkspace),
      platform: getAiPlatformOverview(requestWorkspace),
    });
  }

  const body = parseJsonBody(req.body);
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const capabilityId = typeof body?.capabilityId === 'string' ? body.capabilityId.trim() : '';
  const modelId = typeof body?.modelId === 'string' ? body.modelId.trim() : undefined;
  const streamRequested = isStreamRequested(req.query, body);

  if (!prompt || !capabilityId) {
    return res.status(400).json({error: 'Invalid request parameters'});
  }

  if (streamRequested) {
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
      const result = await streamAiCapability({capabilityId, prompt, modelId}, {
        signal: controller.signal,
        onDelta: async (delta, channel) => {
          writeEvent({type: 'delta', delta, channel});
        },
      });

      if (!controller.signal.aborted) {
        if (result.status === 'completed') {
          writeEvent({
            type: 'completed',
            result: result.result,
            reasoning: result.reasoning,
            capability: result.capability,
            modelId: result.modelId,
            receipt: result.receipt,
          });
        } else {
          writeEvent({
            type: 'error',
            error: result.result,
            reasoning: result.reasoning,
            capability: result.capability,
            modelId: result.modelId,
            receipt: result.receipt,
          });
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        writeEvent({
          type: 'error',
          error: error instanceof Error ? error.message : 'AI 能力调用失败。',
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

  const result = await callAiCapability({capabilityId, prompt, modelId});
  return res.status(result.status === 'completed' ? 200 : 400).json({result});
}
