import type { ParticipantSoul } from '../core/world-state/agents/soul.js';
import type { AgentMemoryFact } from '../core/world-state/agents/models.js';

export interface ActionAdviceOption {
  readonly id: string;
  readonly title: string;
  readonly note: string;
}

export interface ActionAdviceRound {
  readonly title: string;
  readonly description: string;
  readonly mainStrategies: readonly ActionAdviceOption[];
  readonly assistStrategies: readonly ActionAdviceOption[];
}

export interface ActionAdviceCaseContext {
  readonly title: string;
  readonly ownerName?: string;
  readonly district?: string;
  readonly community?: string;
  readonly askPrice?: number;
  readonly marketPrice?: number;
  readonly trust?: number;
  readonly patience?: number;
  readonly urgency?: number;
  readonly heat?: number;
  readonly stageLabel?: string;
}

export interface ActionAdviceRequest {
  readonly actionId: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly actorLabel: string;
  readonly currentRound: number;
  readonly totalRounds: number;
  readonly contextBullets: readonly string[];
  readonly round: ActionAdviceRound;
  readonly caseContext?: ActionAdviceCaseContext;
}

export interface ActionAdviceProposal {
  readonly sceneTitle: string;
  readonly sceneOpening: string;
  readonly roundTitle: string;
  readonly roundDescription: string;
  readonly mainStrategies: readonly ActionAdviceOption[];
  readonly assistStrategies: readonly ActionAdviceOption[];
  readonly recommendedMainStrategyIds: readonly string[];
  readonly recommendedAssistStrategyId: string | null;
  readonly recommendationReason: string;
  readonly roleCue: string;
  readonly stakes: readonly string[];
  readonly confidence: number;
}

export interface ActionFeedbackChoice {
  readonly mainStrategyIds: readonly string[];
  readonly assistStrategyId: string | null;
  readonly baseFeedbackMessage: string;
  readonly actor: 'owner' | 'customer' | 'market';
  readonly mood: 'positive' | 'neutral' | 'negative';
}

export interface ActionFeedbackRequest extends ActionAdviceRequest {
  readonly choice: ActionFeedbackChoice;
}

export interface ActionFeedbackProposal {
  readonly message: string;
  readonly confidence: number;
}

export interface ActionFeedbackNormalizationResult {
  readonly proposal: ActionFeedbackProposal;
  readonly acceptedSource: 'llm' | 'fallback';
  readonly rejectionReasons: readonly string[];
}

export function normalizeActionAdviceRequest(input: unknown): ActionAdviceRequest | null {
  const raw = isRecord(input) && isRecord(input.request) ? input.request : input;
  if (!isRecord(raw)) return null;

  const round = normalizeRound(raw.round);
  if (!round || round.mainStrategies.length === 0) return null;

  const request: ActionAdviceRequest = {
    actionId: normalizeString(raw.actionId, 80),
    title: normalizeString(raw.title, 160),
    summary: normalizeString(raw.summary, 260),
    body: normalizeString(raw.body, 520),
    actorLabel: normalizeString(raw.actorLabel, 80),
    currentRound: clampInteger(raw.currentRound, 1, 8, 1),
    totalRounds: clampInteger(raw.totalRounds, 1, 8, 1),
    contextBullets: normalizeStringArray(raw.contextBullets, 12, 80),
    round,
    caseContext: normalizeCaseContext(raw.caseContext),
  };

  if (!request.actionId || !request.title) return null;
  return request;
}

export function normalizeActionFeedbackRequest(input: unknown): ActionFeedbackRequest | null {
  const raw = isRecord(input) && isRecord(input.feedbackRequest) ? input.feedbackRequest : input;
  if (!isRecord(raw)) return null;
  const request = normalizeActionAdviceRequest(raw);
  if (!request) return null;
  const choice = normalizeActionFeedbackChoice(raw.choice, request);
  if (!choice) return null;
  return {
    ...request,
    choice,
  };
}

export function buildFallbackActionScenarioSimulation(request: ActionAdviceRequest): ActionAdviceProposal {
  const contextHint = request.contextBullets[0] || request.summary || request.body;
  const subject = request.caseContext?.title || request.title;

  return {
    sceneTitle: `${subject} 的这一轮现场`,
    sceneOpening: trimSentence(contextHint || request.body || '这一轮先把真实情况问清楚。', 72),
    roundTitle: request.round.title || '本轮怎么聊',
    roundDescription: request.round.description || '你自己选话题和态度，对方会按当前局面反应。',
    mainStrategies: request.round.mainStrategies,
    assistStrategies: request.round.assistStrategies,
    recommendedMainStrategyIds: request.round.mainStrategies
      .slice(0, request.actionId === 'showing' ? 1 : 2)
      .map((option) => option.id),
    recommendedAssistStrategyId: request.round.assistStrategies[0]?.id ?? null,
    recommendationReason: buildFallbackRecommendationReason(request),
    roleCue: buildFallbackRoleCue(request),
    stakes: buildFallbackStakes(request),
    confidence: 0.58,
  };
}

export function buildActionScenarioSimulationPrompt(
  request: ActionAdviceRequest,
  agentPromptLines: readonly string[] = [],
): string {
  return [
    '你是上海二手房经纪经营模拟里的情景导演 agent。',
    '你只做一件事：把当前动作轮次模拟成更真实的业务场景，改写本轮话题、态度选项、角色开场和局面压力。',
    '',
    '底层 agent 档案：',
    ...(agentPromptLines.length ? agentPromptLines : ['暂无额外 agent 档案。']),
    '',
    '重要边界：',
    '1. 必须保留输入选项的 id，不能发明 option id，不能删空 mainStrategies。',
    '2. 你需要给出本轮推荐选择，但它只是建议，不直接结算游戏。',
    '3. recommendedMainStrategyIds 只能从 mainStrategies 里选，最多 2 个；如果 actionId 是 showing，最多 1 个。',
    '4. recommendedAssistStrategyId 只能从 assistStrategies 里选；没有合适态度时输出 null。',
    '5. recommendationReason 是一句面向经纪人的业务理由，不要暴露思维链，不说“系统/AI/模型/评分/内部变量”。',
    '6. 不写已成交、已调价、已带看等未发生事实。',
    '7. 文案要像真实房产业务现场：有客户/业主/竞品压力，但不要变成教学说明。',
    '8. sceneOpening 控制在 70 个中文字符以内；选项 title 控制在 18 个中文字符以内；note 控制在 54 个中文字符以内；recommendationReason 控制在 90 个中文字符以内。',
    '',
    '只输出 JSON，格式如下：',
    '{"sceneTitle":"客户已经在比较同类房","sceneOpening":"罗投资客愿意到场，但会拿隔壁两房一起比；这轮要把现场关注点说清。","roundTitle":"先定看房对象","roundDescription":"不是泛泛约看，先判断谁今天真的值得拉到现场。","mainStrategies":[{"id":"show-customer-a","title":"带罗投资客到场","note":"他已在比较装修和价格，现场要讲清差异。"}],"assistStrategies":[{"id":"steady","title":"不硬推","note":"先留比较空间，避免客户觉得被催。"}],"recommendedMainStrategyIds":["show-customer-a"],"recommendedAssistStrategyId":"steady","recommendationReason":"客户已经进入同类房比较，先带最有比较意愿的人到场，再用克制态度留下真实反馈空间。","roleCue":"客户愿意看，但不会马上表态。","stakes":["竞品会影响看后反馈","业主需要当天知道客户反应"],"confidence":0.72}',
    '',
    '输入：',
    JSON.stringify(toVisibleAdviceContext(request), null, 2),
  ].join('\n');
}

export function buildActionFeedbackPrompt(
  request: ActionFeedbackRequest,
  agentPromptLines: readonly string[] = [],
): string {
  const roleSpeechContract = buildRoleSpeechContract(request);
  return [
    '你是上海二手房经纪经营模拟里的角色反馈 writer。',
    '你只做一件事：根据经纪人本轮实际选择，生成对方的一段真实反馈原话。',
    '',
    '底层 agent 档案：',
    ...(agentPromptLines.length ? agentPromptLines : ['暂无额外 agent 档案。']),
    '',
    '重要边界：',
    '1. 只生成角色原话，不写旁白、不解释、不写教学总结。',
    '2. 反馈必须回应本轮已选主话题和态度，不能像通用模板。',
    '3. 先把按钮标题翻译成角色关心的事实，不要照抄 option title，不要使用书名号引用选项。',
    '4. 不要写“你把 XX 讲清楚 / 你需要 XX / 本轮选择”这种评语腔，要像业主、客户本人发来的一条微信。',
    '5. 反馈要比模板更完整：2 到 4 个短句，60 到 150 个中文字符。',
    '6. 不直接结算，不写已成交、已调价、已带看等未发生事实。',
    '7. 不说“系统/AI/模型/评分/内部变量”。',
    '8. 可以保留犹豫、防御、追问和条件，但要像真实业主/客户会说的话。',
    '',
    '角色口吻合同：',
    ...roleSpeechContract.promptLines,
    '',
    '只输出 JSON，格式如下：',
    getFeedbackJsonExample(request.choice.actor),
    '',
    '输入：',
    JSON.stringify(toVisibleFeedbackContext(request), null, 2),
  ].join('\n');
}

export function buildActionFeedbackRepairPrompt(
  request: ActionFeedbackRequest,
  rejectedOutput: string,
  rejectionReasons: readonly string[],
  agentPromptLines: readonly string[] = [],
): string {
  const roleSpeechContract = buildRoleSpeechContract(request);
  return [
    '你是上海二手房经纪经营模拟里的角色反馈修复 writer。',
    '上一版不可用。你要保留经纪人本轮选择和角色情绪，但重写成自然的角色原话。',
    '',
    '底层 agent 档案：',
    ...(agentPromptLines.length ? agentPromptLines : ['暂无额外 agent 档案。']),
    '',
    '上一版不可用的原因：',
    ...(rejectionReasons.length ? rejectionReasons : ['角色原话不够自然。']),
    '',
    '上一版输出：',
    rejectedOutput.slice(0, 520),
    '',
    '角色口吻合同：',
    ...roleSpeechContract.promptLines,
    '',
    '硬性边界：只输出 JSON；不要解释；不要沿用上一版中的禁用词；message 只能是角色原话，2 到 4 个短句，60 到 150 个中文字符。',
    '',
    '只输出 JSON，格式如下：',
    getFeedbackJsonExample(request.choice.actor),
    '',
    '输入：',
    JSON.stringify(toVisibleFeedbackContext(request), null, 2),
  ].join('\n');
}

export function parseActionAdvicePayload(raw: string): unknown {
  return JSON.parse(extractJsonObjectText(raw));
}

export function normalizeActionScenarioSimulationProposal(
  proposal: unknown,
  request: ActionAdviceRequest,
): ActionAdviceProposal {
  const raw = isRecord(proposal) ? proposal : {};
  const fallback = buildFallbackActionScenarioSimulation(request);
  const mainStrategies = normalizeSimulatedOptions(raw.mainStrategies, request.round.mainStrategies, 4);
  const assistStrategies = normalizeSimulatedOptions(raw.assistStrategies, request.round.assistStrategies, 4);
  const normalizedMainStrategies = mainStrategies.length ? mainStrategies : fallback.mainStrategies;
  const normalizedAssistStrategies = assistStrategies.length ? assistStrategies : fallback.assistStrategies;
  const mainSelectionLimit = request.actionId === 'showing' ? 1 : 2;
  const recommendedMainStrategyIds = normalizeRecommendedOptionIds(
    raw.recommendedMainStrategyIds,
    normalizedMainStrategies,
    mainSelectionLimit,
  );
  const recommendedAssistStrategyId = normalizeRecommendedOptionId(
    raw.recommendedAssistStrategyId,
    normalizedAssistStrategies,
  );
  const normalized: ActionAdviceProposal = {
    sceneTitle: normalizeString(raw.sceneTitle, 48) || fallback.sceneTitle,
    sceneOpening: normalizeString(raw.sceneOpening, 120) || fallback.sceneOpening,
    roundTitle: normalizeString(raw.roundTitle, 48) || fallback.roundTitle,
    roundDescription: normalizeString(raw.roundDescription, 160) || fallback.roundDescription,
    mainStrategies: normalizedMainStrategies,
    assistStrategies: normalizedAssistStrategies,
    recommendedMainStrategyIds: recommendedMainStrategyIds.length
      ? recommendedMainStrategyIds
      : fallback.recommendedMainStrategyIds.filter((id) => normalizedMainStrategies.some((option) => option.id === id)),
    recommendedAssistStrategyId: recommendedAssistStrategyId ?? fallback.recommendedAssistStrategyId,
    recommendationReason: normalizeString(raw.recommendationReason, 150) || fallback.recommendationReason,
    roleCue: normalizeString(raw.roleCue, 96) || fallback.roleCue,
    stakes: normalizeStringArray(raw.stakes, 3, 58),
    confidence: clampNumber(raw.confidence, 0, 1, fallback.confidence),
  };

  return {
    ...normalized,
    recommendedMainStrategyIds: normalized.recommendedMainStrategyIds.length
      ? normalized.recommendedMainStrategyIds
      : normalized.mainStrategies.slice(0, mainSelectionLimit).map((option) => option.id),
    recommendedAssistStrategyId: normalized.assistStrategies.some((option) => option.id === normalized.recommendedAssistStrategyId)
      ? normalized.recommendedAssistStrategyId
      : normalized.assistStrategies[0]?.id ?? null,
    stakes: normalized.stakes.length ? normalized.stakes : fallback.stakes,
  };
}

function getFeedbackJsonExample(actor: ActionFeedbackChoice['actor']): string {
  if (actor === 'customer') {
    return '{"message":"\\"我不是不看，就是还没想定。最近那套成交条件、旁边同类房差在哪，你直接摊开说；价格和房况对得上，我就继续看。\\"","confidence":0.76}';
  }
  if (actor === 'market') {
    return '{"message":"\\"这轮市场信号还不算稳。客户愿不愿继续看、旁边同类房有没有分流、价格差距怎么收窄，后面两天会看得更清楚。\\"","confidence":0.72}';
  }
  return '{"message":"\\"这周有点动静我看到了，但别只跟我说感觉不错。同小区最近成交、客户到底卡在哪、旁边那套怎么抢人，你给我摊开；要是证据真对得上，我再跟家里商量。\\"","confidence":0.76}';
}

function buildRoleSpeechContract(request: ActionFeedbackRequest) {
  if (request.choice.actor === 'customer') {
    return {
      speaker: 'buyer_customer',
      promptLines: [
        '1. 你是买方客户本人，不是经纪人、不是复盘者、不是业主。',
        '2. 只能谈自己的继续看房/出价顾虑：价格、房况、楼层装修、同类房差异、最近成交条件、谈价空间。',
        '3. 不要说“这几组客户”“客户到底卡在哪里”“客户反馈”；客户不会把自己说成客户群体。',
        '4. 不要说“你把差异摆清”“你需要”“本轮选择”“选项”；可以说“你直接摊开说”“我还想再比一下”。',
        '5. 语气像微信里犹豫但愿意继续沟通的买方，别像评价经纪人方案的清单。',
      ],
      bannedPhrases: [
        '这几组客户',
        '客户到底卡在哪里',
        '客户反馈',
        '你把差异摆清',
        '同小区成交和同小区最近成交',
        '本轮选择',
      ],
      allowedConcerns: [
        '最近成交是什么条件',
        '旁边同类房差在哪',
        '这套价格和房况值不值',
        '下一步还要不要继续看',
      ],
    };
  }

  if (request.choice.actor === 'market') {
    return {
      speaker: 'market_signal',
      promptLines: [
        '1. 你是市场反馈信号，不用第一人称撒娇，也不要像系统评分。',
        '2. 可以客观说客户反馈、竞品分流、价格差距和后续执行质量。',
        '3. 不要写“系统/评分/模型/本轮选择”，不要结算未发生的成交。',
      ],
      bannedPhrases: ['系统', '评分', '模型', '本轮选择'],
      allowedConcerns: ['客户反馈', '竞品变化', '价格差距', '执行质量'],
    };
  }

  return {
    speaker: 'owner',
    promptLines: [
      '1. 你是业主本人，正在判断经纪人有没有真的推进这套房。',
      '2. 可以追问客户到底卡在哪、同小区最近成交、旁边同类房怎么抢人、下一步怎么安排。',
      '3. 不要像内部复盘，不要照抄按钮标题，不要说“本轮选择/选项”。',
      '4. 语气可以着急、防御、半信半疑，但必须像微信原话。',
    ],
    bannedPhrases: ['本轮选择', '选项', '你把 XX 讲清楚'],
    allowedConcerns: ['客户到底卡在哪', '同小区最近成交', '旁边同类房怎么抢人', '下一步安排'],
  };
}

export interface ActionFeedbackWorldContext {
  readonly soul?: ParticipantSoul;
  readonly memory?: readonly AgentMemoryFact[];
  readonly worldContext?: {
    readonly rivalListings?: readonly { readonly id: string; readonly status: string; readonly price: number; readonly community: string }[];
    readonly marketSignals?: readonly { readonly type: string; readonly day: number; readonly detail: string }[];
    readonly marketSentiment?: 'positive' | 'neutral' | 'negative';
    readonly recentDeals?: readonly { readonly community: string; readonly price: number; readonly day: number }[];
  };
}

export function buildFallbackActionFeedbackProposal(
  request: ActionFeedbackRequest,
  worldContext?: ActionFeedbackWorldContext,
): ActionFeedbackProposal {
  const base = buildHumanFeedbackLead(request);
  const evidenceLine = buildHumanEvidenceLine(request);
  const assistLine = buildHumanAssistLine(request);
  const priceGap = typeof request.caseContext?.askPrice === 'number' && typeof request.caseContext?.marketPrice === 'number'
    ? Math.round(request.caseContext.askPrice - request.caseContext.marketPrice)
    : null;
  const priceLine = priceGap !== null && priceGap > 0
    ? `你说和市场价差 ${priceGap} 万，这个数我不能只听一句话。`
    : '';

  const urgency = request.caseContext?.urgency ?? 50;
  const trust = request.caseContext?.trust ?? 50;
  const isHighUrgency = urgency >= 70;
  const isLowTrust = trust < 40;

  // Soul-aware personality line
  const personalityLine = buildSoulPersonalityLine(worldContext?.soul);

  // Memory-aware reference line
  const memoryLine = buildMemoryReferenceLine(worldContext?.memory);

  // World-aware rival line
  const rivalLine = buildRivalReferenceLine(worldContext?.worldContext);

  if (request.choice.actor === 'customer') {
    return {
      message: ensureFeedbackQuote(trimSentence(
        joinFeedbackSentences([
          base,
          `我不是不看${evidenceLine}，但别只说这套不错，我要看真实数据。`,
          assistLine || '你把差异摆清，价格和房况对得上，我再决定要不要继续看。',
        ]),
        170,
      )),
      confidence: 0.56,
    };
  }
  if (request.choice.actor === 'market') {
    return {
      message: ensureFeedbackQuote(trimSentence(
        joinFeedbackSentences([
          base,
          `真正会起作用的是${evidenceLine}。`,
          priceLine,
          '后面客户反馈、竞品变化和带看质量接上，市场信号才会更清楚。',
        ]),
        170,
      )),
      confidence: 0.55,
    };
  }

  const pressureLine = isHighUrgency
    ? '今天就给我一个明确方案，我不想再等了。'
    : isLowTrust
      ? '你先给我看依据，我再决定要不要继续配合。'
      : '';

  return {
    message: ensureFeedbackQuote(trimSentence(
      joinFeedbackSentences([
        base,
        `别只给我一句结论，${evidenceLine}你都给我摊开。`,
        priceLine,
        assistLine || '我看明白了再跟家里商量，不想现在凭感觉动。',
        pressureLine,
        personalityLine,
        memoryLine,
        rivalLine,
      ]),
      200,
    )),
    confidence: 0.58,
  };
}

/**
 * LLM-first action feedback proposal generator.
 *
 * Uses world context (soul, memory, world) to generate a richer,
 * more context-aware feedback message than the template fallback.
 *
 * This is a rule-based "LLM simulation" that produces human-like
 * feedback based on the owner's personality, emotional state,
 * conversation history, and market context.
 */
export function buildLlmFirstActionFeedbackProposal(
  request: ActionFeedbackRequest,
  worldContext?: ActionFeedbackWorldContext,
): ActionFeedbackProposal {
  const soul = worldContext?.soul;
  const memory = worldContext?.memory;
  const world = worldContext?.worldContext;

  // Build context-aware components
  const personalityLead = buildLlmPersonalityLead(request, soul);
  const contextBody = buildLlmContextBody(request, soul, memory, world);
  const closingLine = buildLlmClosingLine(request, soul);

  const message = ensureFeedbackQuote(trimSentence(
    joinFeedbackSentences([personalityLead, contextBody, closingLine]),
    200,
  ));

  // Confidence based on context richness
  let confidence = 0.65;
  if (soul) confidence += 0.05;
  if (memory && memory.length > 0) confidence += 0.05;
  if (world) confidence += 0.05;

  return { message, confidence: Math.min(confidence, 0.85) };
}

function buildLlmPersonalityLead(
  request: ActionFeedbackRequest,
  soul: ParticipantSoul | undefined,
): string {
  const base = buildHumanFeedbackLead(request);

  if (!soul) return base;

  const assertiveness = soul.basePersonality.assertiveness;
  const trust = soul.emotionalState.trust;
  const urgency = soul.emotionalState.urgency;
  const consecutiveNegative = soul.emotionalArc.consecutiveNegative;

  // Assertive owners lead with directness
  if (assertiveness >= 70) {
    return '你别绕弯子，我就想知道结果。';
  }

  // Low trust owners lead with skepticism
  if (trust < 35 || consecutiveNegative >= 2) {
    return '我之前信你，但现在有点动摇了。';
  }

  // High urgency owners lead with impatience
  if (urgency >= 75) {
    return '我没时间等了，你给我一个明确说法。';
  }

  // Anxious owners lead with worry
  if (soul.ownerProfileLabel.includes('焦虑')) {
    return '我心里不踏实，你给我说清楚。';
  }

  return base;
}

function buildLlmContextBody(
  request: ActionFeedbackRequest,
  soul: ParticipantSoul | undefined,
  memory: readonly AgentMemoryFact[] | undefined,
  world: ActionFeedbackWorldContext['worldContext'],
): string {
  const parts: string[] = [];

  // Evidence from strategies
  const evidenceLine = buildHumanEvidenceLine(request);
  parts.push(`${evidenceLine}，你给我摊开。`);

  // Price gap
  const priceGap = typeof request.caseContext?.askPrice === 'number' && typeof request.caseContext?.marketPrice === 'number'
    ? Math.round(request.caseContext.askPrice - request.caseContext.marketPrice)
    : null;
  if (priceGap !== null && priceGap > 0) {
    parts.push(`你说和市场价差 ${priceGap} 万，这个数我不能只听一句话。`);
  }

  // Memory reference
  if (memory && memory.length > 0) {
    const priceMemory = memory.find((f) => f.kind === 'price_commitment');
    const riskMemory = memory.find((f) => f.kind === 'open_risk');
    if (priceMemory) {
      parts.push('上次说的价格我记着呢。');
    } else if (riskMemory) {
      parts.push('之前的风险你还没给我讲清楚。');
    }
  }

  // Rival reference
  if (world) {
    const activeRivals = world.rivalListings?.filter((r) => r.status === 'active') || [];
    if (activeRivals.length > 0) {
      parts.push('旁边竞品都在动，你给我看清楚我们差在哪。');
    } else if (world.marketSentiment === 'negative') {
      parts.push('市场不太好，你给我一个说法。');
    }
  }

  return parts.join('');
}

function buildLlmClosingLine(
  request: ActionFeedbackRequest,
  soul: ParticipantSoul | undefined,
): string {
  const urgency = soul?.emotionalState.urgency ?? request.caseContext?.urgency ?? 50;
  const trust = soul?.emotionalState.trust ?? request.caseContext?.trust ?? 50;

  if (urgency >= 70) {
    return '今天就给我一个明确方案，我不想再等了。';
  }
  if (trust < 40) {
    return '你先给我看依据，我再决定要不要继续配合。';
  }

  const assistLine = buildHumanAssistLine(request);
  return assistLine || '我看明白了再跟家里商量，不想现在凭感觉动。';
}

export function normalizeActionFeedbackProposal(
  proposal: unknown,
  request: ActionFeedbackRequest,
): ActionFeedbackProposal {
  return normalizeActionFeedbackProposalResult(proposal, request).proposal;
}

export function normalizeActionFeedbackProposalResult(
  proposal: unknown,
  request: ActionFeedbackRequest,
): ActionFeedbackNormalizationResult {
  const raw = isRecord(proposal) ? proposal : {};
  const fallback = buildFallbackActionFeedbackProposal(request);
  const message = normalizeString(raw.message, 240);
  const rejectionReasons = getHumanFeedbackRejectionReasons(message, request);
  const usableMessage = rejectionReasons.length === 0
    ? ensureFeedbackQuote(message)
    : fallback.message;
  return {
    proposal: {
      message: usableMessage,
      confidence: clampNumber(raw.confidence, 0, 1, fallback.confidence),
    },
    acceptedSource: rejectionReasons.length === 0 ? 'llm' : 'fallback',
    rejectionReasons,
  };
}

function getHumanFeedbackRejectionReasons(message: string, request: ActionFeedbackRequest): string[] {
  const reasons: string[] = [];
  const visible = stripFeedbackQuotes(message).replace(/\s+/g, '');
  if (visible.length < 48) reasons.push('too_short');
  if (/系统|AI|模型|评分|内部变量|本轮选择|主话题|option|选项/i.test(visible)) reasons.push('mentions_internal_terms');
  if (/你把.+讲清楚/.test(visible)) reasons.push('broker_review_tone');
  if (/你把.+摆清/.test(visible)) reasons.push('checklist_instruction_tone');
  if (/你把.+列出来/.test(visible)) reasons.push('checklist_instruction_tone');
  if (/我主要想看/.test(visible)) reasons.push('checklist_lead');
  if (/同小区成交和同小区最近成交/.test(visible)) reasons.push('duplicated_evidence_phrase');
  if (request.choice.actor === 'customer' && /这几组客户|客户到底卡在哪里|客户到底卡在哪|客户反馈/.test(visible)) {
    reasons.push('customer_speaks_about_customer_group');
  }

  const selectedTitles = [
    ...resolveSelectedMainOptions(request).map((option) => option.title),
    request.choice.assistStrategyId
      ? request.round.assistStrategies.find((option) => option.id === request.choice.assistStrategyId)?.title
      : '',
  ].filter((title): title is string => Boolean(title));

  if (selectedTitles.some((title) => title.length >= 4 && visible.includes(title))) {
    reasons.push('copied_option_label');
  }

  return Array.from(new Set(reasons));
}

function buildHumanFeedbackLead(request: ActionFeedbackRequest): string {
  const raw = stripFeedbackQuotes(request.choice.baseFeedbackMessage);
  const compact = raw.replace(/\s+/g, ' ').trim();
  const actor = request.choice.actor;
  const mood = request.choice.mood;

  if (actor === 'customer') {
    if (/不错|可以|继续|还行|有兴趣/.test(compact)) return '这套我还愿意继续看。';
    if (mood === 'negative' || /犹豫|算了|不太|担心|再看看/.test(compact)) return '我现在还是有点犹豫。';
    if (/明白.*想想|让我再想想|再想想|考虑/.test(compact)) return '我不是不看，就是还没想定。';
    return compact && compact.length <= 22 ? compact : '我先听你怎么说。';
  }

  if (actor === 'market') {
    if (/不错|可以|继续|还行/.test(compact)) return '这轮有一些正反馈。';
    if (mood === 'negative' || /风险|担心|不太|再看看/.test(compact)) return '这轮信号还不稳。';
    return '这轮还得看后续证据。';
  }

  if (/不错|可以|继续|还行|保持/.test(compact)) return '这周有点动静，我看到了。';
  if (/有没有|到底|推没推|在干嘛|干什么/.test(compact)) return '你别急，我听到了。';
  if (mood === 'negative' || /不满意|着急|担心|风险|不太|算了/.test(compact)) return '我现在还是有点不踏实。';
  if (/再看看|考虑|想想|等等/.test(compact)) return '我先不急着表态。';
  return compact && compact.length <= 24 ? compact : '我听到了，但还要看依据。';
}

function buildHumanEvidenceLine(request: ActionFeedbackRequest): string {
  const selectedText = resolveSelectedMainOptions(request)
    .map((option) => `${option.title} ${option.note}`)
    .join(' ');
  const evidenceText = [
    selectedText,
    request.round.title,
    request.round.description,
    request.summary,
    request.body,
    ...request.contextBullets,
  ].join(' ');

  const needs: string[] = [];
  const add = (value: string) => {
    if (!needs.includes(value)) needs.push(value);
  };

  if (request.choice.actor === 'customer') {
    if (/成交|小区|市场|价格|挂牌|调价|价差|谈价|价格空间/.test(evidenceText)) add('最近成交是什么条件');
    if (/风险|竞品|同类|差异|比较|旁边|外部/.test(evidenceText)) add('旁边同类房差在哪');
    if (/房况|装修|卖点|户型|楼层/.test(evidenceText)) add('这套房子自己的优劣势');
    if (/心理价位|价格锚|价格从哪里|价位来源/.test(evidenceText)) add('这个价到底怎么来的');
    if (/时间|安排|面访|明天|下午|下一步|继续/.test(evidenceText)) add('下一步怎么继续看');
  } else if (request.choice.actor === 'market') {
    if (/进展|带看|来访|反馈|客户|热度|邀/.test(evidenceText)) add('客户反馈是否接得上');
    if (/风险|竞品|同类|差异|比较|旁边|外部/.test(evidenceText)) add('竞品分流有没有变');
    if (/成交|小区|市场|价格|挂牌|调价|价差/.test(evidenceText)) add('价格差距有没有收窄');
    if (/房况|装修|卖点|户型|楼层/.test(evidenceText)) add('房源卖点是否被看见');
    if (/时间|安排|面访|明天|下午|下一步/.test(evidenceText)) add('后续执行质量');
  } else {
    if (/心理价位|价格锚|价格从哪里|价位来源/.test(evidenceText)) add('心理价位从哪来');
    if (/进展|带看|来访|反馈|客户|热度|邀/.test(evidenceText)) add('客户到底卡在哪');
    if (/风险|竞品|同类|差异|比较|旁边|外部/.test(evidenceText)) add('旁边同类房怎么抢人');
    if (/成交|小区|市场|价格|挂牌|调价|价差/.test(evidenceText)) add('同小区最近成交');
    if (/房况|装修|卖点|户型|楼层/.test(evidenceText)) add('房子自己的优劣势');
    if (/时间|安排|面访|明天|下午|下一步/.test(evidenceText)) add('下一步什么时候做');
  }

  if (needs.length === 0) {
    if (request.choice.actor === 'customer') return '价格、房况和旁边同类房';
    if (request.choice.actor === 'market') return '客户反馈、竞品变化和执行质量';
    return '客户真实反馈、同类房比较和下一步安排';
  }

  return needs.slice(0, 3).join('、');
}

function buildHumanAssistLine(request: ActionFeedbackRequest): string {
  const assist = request.choice.assistStrategyId
    ? request.round.assistStrategies.find((option) => option.id === request.choice.assistStrategyId)
    : null;
  if (!assist) return '';
  const text = `${assist.title} ${assist.note}`;

  if (/坦诚|风险|直接/.test(text)) return '有风险你直接说，但别只吓我。';
  if (/稳|不硬推|克制|缓/.test(text)) return '你别硬催，我反而能继续听。';
  if (/强势|推进|明确|压/.test(text)) return '要推进可以，但依据要先摆出来。';
  if (/共情|安抚|理解/.test(text)) return '你能理解我的顾虑，这个我听得进去。';
  return '你这个节奏可以，但依据要接得上。';
}

function joinFeedbackSentences(parts: readonly string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => /[。！？.!?]$/.test(part) ? part : `${part}。`)
    .join('');
}

// ---------------------------------------------------------------------------
// Soul-aware helper functions
// ---------------------------------------------------------------------------

function buildSoulPersonalityLine(soul: ParticipantSoul | undefined): string {
  if (!soul) return '';

  const assertiveness = soul.basePersonality.assertiveness;
  const trust = soul.emotionalState.trust;
  const trustTrend = soul.emotionalArc.trustTrend;
  const consecutiveNegative = soul.emotionalArc.consecutiveNegative;

  // Assertive owners push back harder
  if (assertiveness >= 70) {
    return '你别跟我绕，直接说重点。';
  }

  // Low trust owners are skeptical (check before personality label)
  if (trust < 40 || trustTrend === 'falling' || consecutiveNegative >= 2) {
    return '我之前信你，但现在有点动摇了。';
  }

  // High trust owners are more cooperative
  if (trust >= 70 || trustTrend === 'rising') {
    return '你最近说的我听进去了，继续。';
  }

  // Anxious owners express worry (only if trust is moderate)
  if (soul.ownerProfileLabel.includes('焦虑') || soul.emotionalState.urgency >= 75) {
    return '我心里不踏实，你给我一个明确说法。';
  }

  return '';
}

function buildMemoryReferenceLine(memory: readonly AgentMemoryFact[] | undefined): string {
  if (!memory || memory.length === 0) return '';

  // Look for relevant memory facts
  const priceMemory = memory.find((f) => f.kind === 'price_commitment');
  const customerMemory = memory.find((f) => f.kind === 'recent_interaction' && /客户|反馈|看房/.test(f.summary));
  const riskMemory = memory.find((f) => f.kind === 'open_risk');

  if (priceMemory) {
    return '上次说的价格我记着呢。';
  }
  if (customerMemory) {
    return '你之前说的客户情况我还没忘。';
  }
  if (riskMemory) {
    return '之前的风险你还没给我讲清楚。';
  }

  return '';
}

function buildRivalReferenceLine(worldContext: ActionFeedbackWorldContext['worldContext']): string {
  if (!worldContext) return '';

  const activeRivals = worldContext.rivalListings?.filter((r) => r.status === 'active') || [];
  const recentCuts = worldContext.marketSignals?.filter((s) => s.type === 'competitor_cut') || [];

  if (activeRivals.length > 0 && recentCuts.length > 0) {
    return '旁边竞品都在动，你给我看清楚我们差在哪。';
  }
  if (activeRivals.length > 0) {
    return '旁边那几套你也给我对比一下。';
  }
  if (worldContext.marketSentiment === 'negative') {
    return '市场不太好，你给我一个说法。';
  }

  return '';
}

function normalizeRound(raw: unknown): ActionAdviceRound | null {
  if (!isRecord(raw)) return null;
  const mainStrategies = normalizeOptions(raw.mainStrategies);
  return {
    title: normalizeString(raw.title, 100),
    description: normalizeString(raw.description, 260),
    mainStrategies,
    assistStrategies: normalizeOptions(raw.assistStrategies),
  };
}

function normalizeOptions(raw: unknown): ActionAdviceOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const id = normalizeString(entry.id, 80);
      const title = normalizeString(entry.title, 80);
      if (!id || !title) return null;
      return {
        id,
        title,
        note: normalizeString(entry.note, 180),
      };
    })
    .filter((entry): entry is ActionAdviceOption => Boolean(entry));
}

function normalizeCaseContext(raw: unknown): ActionAdviceCaseContext | undefined {
  if (!isRecord(raw)) return undefined;
  return {
    title: normalizeString(raw.title, 120),
    ownerName: normalizeString(raw.ownerName, 40) || undefined,
    district: normalizeString(raw.district, 40) || undefined,
    community: normalizeString(raw.community, 60) || undefined,
    askPrice: optionalNumber(raw.askPrice),
    marketPrice: optionalNumber(raw.marketPrice),
    trust: optionalNumber(raw.trust),
    patience: optionalNumber(raw.patience),
    urgency: optionalNumber(raw.urgency),
    heat: optionalNumber(raw.heat),
    stageLabel: normalizeString(raw.stageLabel, 60) || undefined,
  };
}

function normalizeActionFeedbackChoice(
  raw: unknown,
  request: ActionAdviceRequest,
): ActionFeedbackChoice | null {
  if (!isRecord(raw)) return null;
  const validMainIds = new Set(request.round.mainStrategies.map((option) => option.id));
  const usedMainIds = new Set<string>();
  const mainStrategyIds = Array.isArray(raw.mainStrategyIds)
    ? raw.mainStrategyIds
      .map((entry) => normalizeString(entry, 80))
      .filter((id) => {
        if (!id || !validMainIds.has(id) || usedMainIds.has(id)) return false;
        usedMainIds.add(id);
        return true;
      })
      .slice(0, request.actionId === 'showing' ? 1 : 2)
    : [];
  if (!mainStrategyIds.length) return null;

  const assistStrategyId = normalizeString(raw.assistStrategyId, 80);
  const validAssistStrategyId = assistStrategyId && request.round.assistStrategies.some((option) => option.id === assistStrategyId)
    ? assistStrategyId
    : null;
  const actor = raw.actor === 'customer' || raw.actor === 'market' || raw.actor === 'owner'
    ? raw.actor
    : 'owner';
  const mood = raw.mood === 'positive' || raw.mood === 'negative' || raw.mood === 'neutral'
    ? raw.mood
    : 'neutral';
  return {
    mainStrategyIds,
    assistStrategyId: validAssistStrategyId,
    baseFeedbackMessage: normalizeString(raw.baseFeedbackMessage, 240),
    actor,
    mood,
  };
}

function toVisibleAdviceContext(request: ActionAdviceRequest) {
  return {
    action: {
      id: request.actionId,
      title: request.title,
      summary: request.summary,
      body: request.body,
      actorLabel: request.actorLabel,
    },
    round: {
      current: request.currentRound,
      total: request.totalRounds,
      title: request.round.title,
      description: request.round.description,
      mainStrategies: request.round.mainStrategies,
      assistStrategies: request.round.assistStrategies,
    },
    contextBullets: request.contextBullets,
    caseContext: request.caseContext,
  };
}

function toVisibleFeedbackContext(request: ActionFeedbackRequest) {
  return {
    ...toVisibleAdviceContext(request),
    roleSpeechContract: buildRoleSpeechContract(request),
    choice: {
      mainStrategies: resolveSelectedMainOptions(request),
      assistStrategy: request.choice.assistStrategyId
        ? request.round.assistStrategies.find((option) => option.id === request.choice.assistStrategyId) || null
        : null,
      actor: request.choice.actor,
      mood: request.choice.mood,
      baseFeedbackMessage: request.choice.baseFeedbackMessage,
    },
  };
}

function resolveSelectedMainOptions(request: ActionFeedbackRequest): ActionAdviceOption[] {
  return request.choice.mainStrategyIds
    .map((id) => request.round.mainStrategies.find((option) => option.id === id))
    .filter((option): option is ActionAdviceOption => Boolean(option));
}

function buildFallbackRoleCue(request: ActionAdviceRequest): string {
  if (request.actorLabel.includes('业主')) {
    return (request.caseContext?.urgency || 0) >= 70
      ? '业主已经在催明确动作，不想再听空泛安抚。'
      : '业主愿意听方案，但会看你有没有事实依据。';
  }
  if (request.actorLabel.includes('客户')) {
    return '客户愿意继续聊，但会把价格、房况和同类房放在一起比。';
  }
  return '这一轮更像经营现场，要把对象、事实和下一步说清。';
}

function buildFallbackStakes(request: ActionAdviceRequest): string[] {
  const stakes: string[] = [];
  if ((request.caseContext?.urgency || 0) >= 70) {
    stakes.push('业主催得紧，动作不能只停在安抚。');
  }
  if (request.contextBullets.some((line) => /外部|竞品|比较|同类房/.test(line))) {
    stakes.push('竞品在场，看后反馈要有比较口径。');
  }
  return stakes.length ? stakes.slice(0, 3) : ['信息不够时，先别把承诺说满。'];
}

function buildFallbackRecommendationReason(request: ActionAdviceRequest): string {
  const firstTopic = request.round.mainStrategies[0]?.title || '最明确的话题';
  const firstAssist = request.round.assistStrategies[0]?.title;
  const pressure = buildFallbackStakes(request)[0] || buildFallbackRoleCue(request);
  return trimSentence(
    `先抓「${firstTopic}」${firstAssist ? `，态度用「${firstAssist}」` : ''}，因为${pressure.replace(/[。.!！]$/, '')}。`,
    96,
  );
}

function normalizeSimulatedOptions(
  raw: unknown,
  baseOptions: readonly ActionAdviceOption[],
  maxItems: number,
): ActionAdviceOption[] {
  const baseById = new Map(baseOptions.map((option) => [option.id, option]));
  const used = new Set<string>();
  const simulated = Array.isArray(raw)
    ? raw
      .map((entry) => {
        if (!isRecord(entry)) return null;
        const id = normalizeString(entry.id, 80);
        const base = baseById.get(id);
        if (!base || used.has(id)) return null;
        used.add(id);
        return {
          id,
          title: normalizeString(entry.title, 40) || base.title,
          note: normalizeString(entry.note, 110) || base.note,
        };
      })
      .filter((entry): entry is ActionAdviceOption => Boolean(entry))
    : [];
  const missing = baseOptions.filter((option) => !used.has(option.id));
  return [...simulated, ...missing].slice(0, maxItems);
}

function normalizeRecommendedOptionIds(
  raw: unknown,
  options: readonly ActionAdviceOption[],
  maxItems: number,
): string[] {
  if (!Array.isArray(raw)) return [];
  const validIds = new Set(options.map((option) => option.id));
  const used = new Set<string>();
  return raw
    .map((entry) => normalizeString(entry, 80))
    .filter((id) => {
      if (!id || !validIds.has(id) || used.has(id)) return false;
      used.add(id);
      return true;
    })
    .slice(0, maxItems);
}

function normalizeRecommendedOptionId(
  raw: unknown,
  options: readonly ActionAdviceOption[],
): string | null {
  const id = normalizeString(raw, 80);
  return id && options.some((option) => option.id === id) ? id : null;
}

function ensureFeedbackQuote(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return '"好，我知道了。"';
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('“') && trimmed.endsWith('”'))) {
    return trimmed;
  }
  return `"${trimmed}"`;
}

function stripFeedbackQuotes(message: string): string {
  return message
    .trim()
    .replace(/^["“]+/, '')
    .replace(/["”]+$/, '')
    .trim();
}

function trimSentence(value: string, maxLength: number): string {
  const text = normalizeString(value, maxLength + 10);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function extractJsonObjectText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error('动作参谋没有返回 JSON。');
}

function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeString(entry, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
