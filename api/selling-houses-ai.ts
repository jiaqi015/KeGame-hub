import './_bootstrap.js';
import { authorizeRequestPersisted } from '../lib/activation.js';
import {
  handleActionDecisionAdvice,
  handleActionDecisionFeedback,
} from '../src/selling-houses/interfaces/http/actionDecisionAdviceHandlers.js';
import { handleAiArrangement } from '../src/selling-houses/interfaces/http/aiArrangementHandlers.js';
import { handleDailyStory } from '../src/selling-houses/interfaces/http/dailyStoryHandlers.js';
import { handleScenarioOpeningStory } from '../src/selling-houses/interfaces/http/scenarioOpeningStoryHandlers.js';
import { handleMyWechatBrokerReplyDraft } from '../src/selling-houses/interfaces/http/myWechatAiHandlers.js';
import { handleMyWechatConversationTurn } from '../src/selling-houses/interfaces/http/myWechatConversationHandlers.js';
import { getQueryValue, parseJsonBody } from './_request.js';

const SELLING_HOUSES_AI_ROUTES = new Set([
  'selling-houses-wechat-replies',
  'selling-houses-wechat-turns',
  'selling-houses-action-advice',
  'selling-houses-action-feedback',
  'ai-arrangement',
  'daily-story',
  'scenario-opening-story',
]);

function resolveSellingHousesAiRoute(req: any) {
  const route = getQueryValue(req.query, 'route').replace(/^\/?api\//, '').replace(/^\//, '');
  if (route) {
    return route;
  }

  const urlPath = typeof req.url === 'string' ? req.url.split('?')[0] : '';
  return urlPath.replace(/^\/?api\//, '').replace(/^\//, '');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const route = resolveSellingHousesAiRoute(req);
  if (!SELLING_HOUSES_AI_ROUTES.has(route)) {
    return res.status(404).json({ error: 'Unknown selling houses AI route' });
  }

  const authorization = await authorizeRequestPersisted(req, 'selling-houses');
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  switch (route) {
    case 'selling-houses-wechat-replies': {
      try {
        const result = await handleMyWechatBrokerReplyDraft(parseJsonBody(req.body));
        return res.status(result.status).json(result.body);
      } catch (error) {
        return res.status(500).json({
          ok: false,
          replies: [],
          error: error instanceof Error ? error.message : '微信对话生成失败',
        });
      }
    }

    case 'selling-houses-wechat-turns': {
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

    case 'selling-houses-action-advice': {
      try {
        const result = await handleActionDecisionAdvice(parseJsonBody(req.body));
        return res.status(result.status).json(result.body);
      } catch (error) {
        const result = await handleActionDecisionAdvice({});
        return res.status(200).json({
          ...result.body,
          ok: false,
          source: 'fallback',
          error: error instanceof Error ? error.message : '动作参谋生成失败',
        });
      }
    }

    case 'selling-houses-action-feedback': {
      try {
        const result = await handleActionDecisionFeedback(parseJsonBody(req.body));
        return res.status(result.status).json(result.body);
      } catch (error) {
        const result = await handleActionDecisionFeedback({});
        return res.status(200).json({
          ...result.body,
          ok: false,
          source: 'fallback',
          error: error instanceof Error ? error.message : '动作反馈生成失败',
        });
      }
    }

    case 'ai-arrangement': {
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

    case 'daily-story': {
      try {
        const body = parseJsonBody(req.body);
        const result = await handleDailyStory(body?.pack || body, body?.playerProfile);
        return res.status(result.status).json(result.body);
      } catch (error) {
        return res.status(200).json({
          ok: false,
          story: null,
          source: 'fallback',
          error: error instanceof Error ? error.message : '日结故事生成失败',
        });
      }
    }

    case 'scenario-opening-story': {
      try {
        const body = parseJsonBody(req.body);
        const result = await handleScenarioOpeningStory(body?.briefing);
        return res.status(result.status).json(result.body);
      } catch (error) {
        return res.status(200).json({
          ok: false,
          story: null,
          source: 'fallback',
          error: error instanceof Error ? error.message : '开场故事生成失败',
        });
      }
    }

    default:
      return res.status(404).json({ error: 'Unknown selling houses AI route' });
  }
}
