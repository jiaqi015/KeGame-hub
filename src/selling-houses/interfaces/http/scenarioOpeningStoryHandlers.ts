import { callDeepSeekChat } from '../../../../lib/deepseek.js';
import { resolveEnabledModel } from '../../../../lib/modelRuntime.js';
import type { ScenarioOpeningBriefing, ScenarioOpeningStory } from '../../application/scenarioOpening.js';

const DEFAULT_MODEL_ID = 'deepseek-v4-pro';

export interface ScenarioOpeningStoryHandlerResult {
  status: number;
  body: {
    ok: boolean;
    story: ScenarioOpeningStory;
    source: 'ai' | 'fallback';
    modelId?: string;
    provider?: 'deepseek';
    error?: string;
  };
}

export async function handleScenarioOpeningStory(
  briefing: ScenarioOpeningBriefing,
): Promise<ScenarioOpeningStoryHandlerResult> {
  const fallback = buildFallbackScenarioOpeningStory(briefing);
  const modelId = DEFAULT_MODEL_ID;
  const model = resolveEnabledModel(modelId);

  if (!model || model.provider !== 'deepseek') {
    return {
      status: 200,
      body: {
        ok: true,
        story: fallback,
        source: 'fallback',
        modelId,
        provider: 'deepseek',
        error: '开场故事模型未启用或不是 DeepSeek 渠道。',
      },
    };
  }

  try {
    const response = await callDeepSeekChat(buildStoryMessages(briefing), model, {
      responseFormat: 'json_object',
      temperature: 0.45,
    });
    const parsed = parseLlmResponse(typeof response === 'string' ? response : JSON.stringify(response));
    const story = normalizeScenarioOpeningStory(parsed, briefing);
    return {
      status: 200,
      body: {
        ok: true,
        story,
        source: 'ai',
        modelId,
        provider: 'deepseek',
      },
    };
  } catch (error) {
    return {
      status: 200,
      body: {
        ok: true,
        story: fallback,
        source: 'fallback',
        modelId,
        provider: 'deepseek',
        error: error instanceof Error ? error.message : 'unknown_error',
      },
    };
  }
}

function buildStoryMessages(briefing: ScenarioOpeningBriefing) {
  return [
    {
      role: 'system' as const,
      content: `你是"我是王牌资产顾问"卖房经营游戏里的开场城市故事代理。

你的任务是把玩家进场前看到的开局事实，写成一段真实可信的门店晨会简报。它要像今天早上店长把市场、业主、客户和房源节奏讲给经纪人听，不像教学说明，不像考试题，不像 SaaS 指标拼接。

硬性要求：
- 只能使用输入 JSON 里的可见事实，不得发明不存在的成交、客户、业主、天气、外部政策或隐藏真相。
- 中文。
- deck 写 90-150 字，像开场摘要。
- marketTitle 最多 28 字。
- marketParagraphs 写 2-4 段，每段 80-150 字。
- 要有人、有房、有街区/商圈、有今天先后顺序。
- 必须解释数字背后的经营原因，不能堆指标。
- 最后至少落到 1 条今天该先处理的房源或业主线索。
- 不要输出思维链。

禁止词：LLM、fallback、模型、算法、教学、考试、任务、打卡、指标拼接、主矛盾、画像、锚点、盘面、闭环、抓手。

输出必须是 JSON：
{
  "deck": "开场摘要",
  "marketTitle": "市场故事标题",
  "marketParagraphs": ["段落1", "段落2"],
  "evidenceLabels": ["标签1", "标签2"]
}`,
    },
    {
      role: 'user' as const,
      content: `ScenarioOpeningBriefing:
${JSON.stringify(briefing, null, 2)}`,
    },
  ];
}

function buildFallbackScenarioOpeningStory(briefing: ScenarioOpeningBriefing): ScenarioOpeningStory {
  return briefing.openingStory;
}

function normalizeScenarioOpeningStory(input: unknown, briefing: ScenarioOpeningBriefing): ScenarioOpeningStory {
  const fallback = buildFallbackScenarioOpeningStory(briefing);
  if (!input || typeof input !== 'object') return fallback;
  const payload = input as Record<string, unknown>;
  const deck = cleanText(payload.deck, 180) || fallback.deck;
  const marketTitle = cleanText(payload.marketTitle, 42) || fallback.marketTitle || briefing.marketTitle;
  const marketParagraphs = normalizeParagraphs(payload.marketParagraphs, fallback.marketParagraphs);
  const evidenceLabels = normalizeLabels(payload.evidenceLabels, fallback.evidenceLabels);

  return {
    deck,
    marketTitle,
    marketParagraphs,
    evidenceLabels,
  };
}

function normalizeParagraphs(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const paragraphs = value
    .map((entry) => cleanText(entry, 180))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 4);
  if (paragraphs.length >= 2) return paragraphs;
  const merged = [...paragraphs, ...fallback.filter((entry) => !paragraphs.includes(entry))].slice(0, 4);
  return merged.length > 0 ? merged : fallback;
}

function normalizeLabels(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const labels = value
    .map((entry) => cleanText(entry, 18))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 4);
  return labels.length > 0 ? labels : fallback;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function parseLlmResponse(response: string): unknown {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(response);
  } catch {
    return null;
  }
}
