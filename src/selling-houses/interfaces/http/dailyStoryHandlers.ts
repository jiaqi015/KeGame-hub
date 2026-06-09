import { callDeepSeekChat } from '../../../../lib/deepseek.js';
import { resolveEnabledModel } from '../../../../lib/modelRuntime.js';
import type { AIModel } from '../../../../lib/models.js';
import { normalizeDailyCityStory } from '../../application/dailyStory/normalizer.js';
import { buildFallbackDailyStory } from '../../application/dailyStory/fallbackStoryWriter.js';
import type { DailyCityStoryContextPack } from '../../application/dailyStory/contextPack.js';
import type { DailyCityStoryResult } from '../../application/dailyStory/storyContract.js';
import type { DailyStoryPlayerProfile } from '../../application/dailyStory/contextPackBuilder.js';
import type { NormalizedStoryResult } from '../../application/dailyStory/normalizer.js';

const DEFAULT_MODEL_ID = 'deepseek-v4-pro';

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

export async function handleDailyStory(
  pack: DailyCityStoryContextPack,
  playerProfile?: DailyStoryPlayerProfile | null,
): Promise<DailyStoryHandlerResult> {
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
    const messages = buildStoryMessages(pack, playerProfile);
    const llmResponse = await callDeepSeekChat(messages, model, {
      responseFormat: 'json_object',
      thinking: 'disabled',
      temperature: 0.35,
      maxTokens: 1200,
    });
    if (llmResponse.status !== 'completed') {
      throw new Error(llmResponse.result || 'DeepSeek 日结故事生成失败。');
    }

    const rawOutput = sanitizeDailyStoryLanguage(parseLlmResponse(llmResponse.result));

    let normalized = normalizeDailyCityStory(rawOutput, pack);
    let criticalErrors = getCriticalDailyStoryErrors(normalized.validationNotes);

    if (criticalErrors.length > 0) {
      const repaired = await repairDailyStory({
        model,
        pack,
        playerProfile,
        rejectedOutput: rawOutput,
        validationNotes: normalized.validationNotes,
      });
      if (repaired) {
        normalized = repaired;
        criticalErrors = getCriticalDailyStoryErrors(normalized.validationNotes);
      }
    }

    const source = criticalErrors.length > 0 ? 'fallback' : 'ai';
    const story = source === 'fallback'
      ? { ...buildFallbackDailyStory(pack), source: 'fallback' as const }
      : acceptAiStory(normalized.result);

    return {
      status: 200,
      body: {
        ok: true,
        story,
        source,
        modelId,
        provider: 'deepseek',
        error: criticalErrors.length > 0 ? `校验失败: ${criticalErrors[0]}` : undefined,
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

function getCriticalDailyStoryErrors(notes: readonly string[]): string[] {
  return notes.filter((note) =>
    note.startsWith('forbidden_words')
    || note.startsWith('too_few_paragraphs')
    || note.startsWith('too_short')
  );
}

function acceptAiStory(story: DailyCityStoryResult): DailyCityStoryResult {
  return {
    ...story,
    source: 'ai',
    safety: {
      ...story.safety,
      needsFallback: false,
      fallbackReason: undefined,
    },
  };
}

async function repairDailyStory({
  model,
  pack,
  playerProfile,
  rejectedOutput,
  validationNotes,
}: {
  readonly model: AIModel;
  readonly pack: DailyCityStoryContextPack;
  readonly playerProfile?: DailyStoryPlayerProfile | null;
  readonly rejectedOutput: unknown;
  readonly validationNotes: readonly string[];
}): Promise<NormalizedStoryResult | null> {
  const repairResponse = await callDeepSeekChat(
    buildRepairMessages(pack, rejectedOutput, validationNotes, playerProfile),
    model,
    {
      responseFormat: 'json_object',
      thinking: 'disabled',
      temperature: 0.25,
      maxTokens: 1500,
    },
  );

  if (repairResponse.status !== 'completed') {
    return null;
  }

  const repairedOutput = sanitizeDailyStoryLanguage(parseLlmResponse(repairResponse.result));
  return normalizeDailyCityStory(repairedOutput, pack);
}

function buildStoryMessages(
  pack: DailyCityStoryContextPack,
  playerProfile?: DailyStoryPlayerProfile | null,
) {
  const systemMessage = buildSystemMessage(playerProfile);
  const userMessage = buildUserMessage(pack);

  return [
    { role: 'system' as const, content: systemMessage },
    { role: 'user' as const, content: userMessage },
  ];
}

function buildRepairMessages(
  pack: DailyCityStoryContextPack,
  rejectedOutput: unknown,
  validationNotes: readonly string[],
  playerProfile?: DailyStoryPlayerProfile | null,
) {
  return [
    { role: 'system' as const, content: buildSystemMessage(playerProfile) },
    {
      role: 'user' as const,
      content: `上一版日结故事未达到上线标准，不能直接展示。

校验问题：
${validationNotes.join('\n')}

请基于同一个 DailyCityStoryContextPack 重新输出完整 JSON：
- 必须保留上一版已经成立的可见事实。
- cityStory.paragraphs 必须是 4-6 段。
- 正文中文字符数必须不少于 450 字。
- 不要只写标题、摘要或一句话。
- 不要输出解释或思维链。

上一版输出：
${JSON.stringify(rejectedOutput, null, 2)}

DailyCityStoryContextPack:
${JSON.stringify(pack, null, 2)}`,
    },
  ];
}

function buildSystemMessage(playerProfile?: DailyStoryPlayerProfile | null): string {
  const roleInstruction = playerProfile
    ? getPlayerRoleInstruction(playerProfile)
    : '读者是一个第二天早上要继续处理业主、客户、房源和商圈压力的经纪人。';

  const styleInstruction = playerProfile
    ? getPlayerStyleInstruction(playerProfile)
    : '像资深门店店长的夜间经营手记，不像小说，不像教学，不像 SaaS 报表，不像 AI 总结。';

  return `你是"我是王牌资产顾问"卖房经营游戏里的日结城市故事代理。

你的任务不是写报表，而是把昨天一天的经营事实写成一段真实、可信、可追溯的城市经营夜报。${roleInstruction}

你只能使用输入 JSON 里的可见事实。你不能发明不存在的成交、降价、客户、业主情绪、商圈新闻、天气或外部事件。你不能偷看 hidden truth。你不能修改游戏状态。你不能声称已经安排成功。你不能输出思维链。

文风要求：
- 中文。
- 500-900 字。
- 4-6 段，每段 70-180 字。
- ${styleInstruction}
- 必须有城市感：商圈、街区、时间、门店节奏、客户/业主微信、竞品压力、天气或市场氛围。
- 必须有人：至少提到 1 个业主或客户。
- 必须有房子：至少提到 1 套房源或房源线索。
- 必须解释数字背后的业务原因，而不是堆指标。
- 必须把昨天接到今天：最后要说明今天先接哪条线，为什么。

禁止词：LLM、fallback、规则置信度、模型、算法、系统判断、训练、教学、任务、打卡、主矛盾、画像、锚点、盘面、闭环、抓手。

输出必须是 JSON，格式如下：
{
  "headline": "标题（最多24字）",
  "deck": "副标题（最多70字）",
  "cityStory": { "paragraphs": ["段落1", "段落2", ...] },
  "todayBridge": { "label": "标签", "value": "数值", "actionCue": "行动提示（最多60字）" },
  "evidenceLabels": ["标签1", "标签2", ...]
}`;
}

function getPlayerRoleInstruction(profile: DailyStoryPlayerProfile): string {
  switch (profile.role) {
    case 'manager':
      return '读者是一个需要管理团队、协调资源的门店经理。他需要知道团队整体表现、关键风险、资源分配建议。';
    case 'owner':
      return '读者是一个业主，需要了解自己房源的经营状况、市场变化、经纪人动作。';
    default:
      return '读者是一个第二天早上要继续处理业主、客户、房源和商圈压力的经纪人。';
  }
}

function getPlayerStyleInstruction(profile: DailyStoryPlayerProfile): string {
  switch (profile.preferredStyle) {
    case 'concise':
      return '简洁有力，每段不超过100字，直击要点，不废话。';
    case 'storytelling':
      return '像讲故事一样，有起伏有节奏，有悬念有转折，让人想读下去。';
    default:
      return '像资深门店店长的夜间经营手记，不像小说，不像教学，不像 SaaS 报表，不像 AI 总结。';
  }
}

function buildUserMessage(pack: DailyCityStoryContextPack): string {
  return `DailyCityStoryContextPack:
${JSON.stringify(pack, null, 2)}`;
}

function parseLlmResponse(response: string): unknown {
  try {
    // Try parsing entire response first
    return JSON.parse(response);
  } catch {
    // Fall back to finding first JSON object (non-greedy)
    const jsonMatch = response.match(/\{[^{}]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
    }
    // Try nested JSON object
    const nestedMatch = response.match(/\{[\s\S]*?\}/);
    if (nestedMatch) {
      try { return JSON.parse(nestedMatch[0]); } catch { /* ignore */ }
    }
    return null;
  }
}

const STORY_SAFE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/锚点/g, '参考依据'],
  [/盘面/g, '局面'],
  [/闭环/g, '接上'],
  [/抓手/g, '动作'],
  [/主矛盾/g, '主要问题'],
  [/画像/g, '状态'],
  [/打卡/g, '记录'],
];

function sanitizeDailyStoryLanguage(input: unknown): unknown {
  if (typeof input === 'string') {
    return STORY_SAFE_REPLACEMENTS.reduce(
      (text, [pattern, replacement]) => text.replace(pattern, replacement),
      input,
    );
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeDailyStoryLanguage);
  }

  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, value]) => [
        key,
        sanitizeDailyStoryLanguage(value),
      ]),
    );
  }

  return input;
}
