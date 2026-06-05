import { callDeepSeekChat } from '../../../../lib/deepseek.js';
import { resolveEnabledModel } from '../../../../lib/modelRuntime.js';
import { normalizeDailyCityStory } from '../../application/dailyStory/normalizer.js';
import { buildFallbackDailyStory } from '../../application/dailyStory/fallbackStoryWriter.js';
import type { DailyCityStoryContextPack } from '../../application/dailyStory/contextPack.js';
import type { DailyCityStoryResult } from '../../application/dailyStory/storyContract.js';

const DEFAULT_MODEL_ID = 'deepseek-v4-flash';

export interface DailyStoryHandlerResult {
  status: number;
  body: {
    ok: boolean;
    story: DailyCityStoryResult;
    source: 'ai' | 'fallback';
    modelId?: string;
    provider?: 'deepseek';
    error?: string;
  };
}

export async function handleDailyStory(pack: DailyCityStoryContextPack): Promise<DailyStoryHandlerResult> {
  const modelId = DEFAULT_MODEL_ID;
  const model = resolveEnabledModel(modelId);

  if (!model || model.provider !== 'deepseek') {
    const story = buildFallbackDailyStory(pack);
    return {
      status: 200,
      body: {
        ok: true,
        story: { ...story, source: 'fallback' },
        source: 'fallback',
        modelId,
        provider: 'deepseek',
        error: '日结故事模型未启用或不是 DeepSeek 渠道。',
      },
    };
  }

  try {
    const prompt = buildStoryPrompt(pack);
    const llmResponse = await callDeepSeekChat([{ role: 'user', content: prompt }], model);
    const rawOutput = parseLlmResponse(typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse));

    const normalized = normalizeDailyCityStory(rawOutput, pack);
    const source = normalized.validationNotes.length > 0 ? 'fallback' : 'ai';
    const story = source === 'fallback'
      ? { ...buildFallbackDailyStory(pack), source: 'fallback' as const }
      : normalized.result;

    return {
      status: 200,
      body: {
        ok: true,
        story,
        source,
        modelId,
        provider: 'deepseek',
        error: normalized.validationNotes.length > 0 ? `校验失败: ${normalized.validationNotes[0]}` : undefined,
      },
    };
  } catch (error) {
    const story = buildFallbackDailyStory(pack);
    return {
      status: 200,
      body: {
        ok: true,
        story: { ...story, source: 'fallback' },
        source: 'fallback',
        modelId,
        provider: 'deepseek',
        error: error instanceof Error ? error.message : 'unknown_error',
      },
    };
  }
}

function buildStoryPrompt(pack: DailyCityStoryContextPack): string {
  return `你是"我是王牌资产顾问"卖房经营游戏里的日结城市故事代理。

你的任务不是写报表，而是把昨天一天的经营事实写成一段真实、可信、可追溯的城市经营夜报。读者是一个第二天早上要继续处理业主、客户、房源和商圈压力的经纪人/资产顾问。

你只能使用输入 JSON 里的可见事实。你不能发明不存在的成交、降价、客户、业主情绪、商圈新闻、天气或外部事件。你不能偷看 hidden truth。你不能修改游戏状态。你不能声称已经安排成功。你不能输出思维链。

文风要求：
- 中文。
- 500-900 字。
- 4-6 段，每段 70-180 字。
- 像资深门店店长的夜间经营手记，不像小说，不像教学，不像 SaaS 报表，不像 AI 总结。
- 必须有城市感：商圈、街区、时间、门店节奏、客户/业主微信、竞品压力、天气或市场氛围。
- 必须有人：至少提到 1 个业主或客户。
- 必须有房子：至少提到 1 套房源或房源线索。
- 必须解释数字背后的业务原因，而不是堆指标。
- 必须把昨天接到今天：最后要说明今天先接哪条线，为什么。

禁止词：LLM、fallback、规则置信度、模型、算法、系统判断、训练、教学、任务、打卡、主矛盾、画像、锚点、盘面、闭环、抓手。

输出必须是 JSON。不要 markdown。不要额外解释。

DailyCityStoryContextPack:
${JSON.stringify(pack, null, 2)}`;
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
