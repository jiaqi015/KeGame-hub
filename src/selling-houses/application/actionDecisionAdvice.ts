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
    '3. 反馈要比模板更完整：2 到 4 个短句，70 到 170 个中文字符。',
    '4. 不直接结算，不写已成交、已调价、已带看等未发生事实。',
    '5. 不说“系统/AI/模型/评分/内部变量”。',
    '6. 可以保留犹豫、防御、追问和条件，但要像真实业主/客户会说的话。',
    '',
    '只输出 JSON，格式如下：',
    '{"message":"\\"我这个价不是随口报的，主要参考了隔壁挂牌和之前成交。你要说现在市场变了可以，但最好把同户型成交、客户反馈和竞品差异摊开讲清楚；如果证据确实一致，我再跟家里复盘。\\"","confidence":0.76}',
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

export function buildFallbackActionFeedbackProposal(request: ActionFeedbackRequest): ActionFeedbackProposal {
  const base = stripFeedbackQuotes(request.choice.baseFeedbackMessage)
    || '好，我知道了。';
  const mainText = resolveSelectedMainOptions(request)
    .map((option) => option.title)
    .join('、') || '你刚才问的点';
  const assistTitle = request.choice.assistStrategyId
    ? request.round.assistStrategies.find((option) => option.id === request.choice.assistStrategyId)?.title
    : null;
  const priceGap = typeof request.caseContext?.askPrice === 'number' && typeof request.caseContext?.marketPrice === 'number'
    ? Math.round(request.caseContext.askPrice - request.caseContext.marketPrice)
    : null;
  const priceLine = priceGap !== null && Math.abs(priceGap) > 0
    ? `现在挂牌和你说的市场价还差 ${Math.abs(priceGap)} 万，`
    : '';
  const assistLine = assistTitle ? `你这个节奏如果是「${assistTitle}」，我会愿意继续聊，` : '';

  if (request.choice.actor === 'customer') {
    return {
      message: ensureFeedbackQuote(trimSentence(
        `${base} 我还想把「${mainText}」看清楚，尤其是价格、房况和同类选择的差异。${assistLine}只要你把比较依据说透，我可以继续往下判断。`,
        180,
      )),
      confidence: 0.56,
    };
  }
  if (request.choice.actor === 'market') {
    return {
      message: ensureFeedbackQuote(trimSentence(
        `${base} 这轮真正影响结果的是「${mainText}」。${priceLine}如果后面客户反馈、竞品变化和带看质量都能接上，市场会给出更清楚的信号。`,
        180,
      )),
      confidence: 0.55,
    };
  }
  return {
    message: ensureFeedbackQuote(trimSentence(
      `${base} 我不是不听建议，你把「${mainText}」讲清楚，最好再拿同小区成交、客户反馈和竞品差异给我看。${priceLine}${assistLine}只要证据一致，我再回去复盘，不想现在凭感觉降。`,
      190,
    )),
    confidence: 0.58,
  };
}

export function normalizeActionFeedbackProposal(
  proposal: unknown,
  request: ActionFeedbackRequest,
): ActionFeedbackProposal {
  const raw = isRecord(proposal) ? proposal : {};
  const fallback = buildFallbackActionFeedbackProposal(request);
  const message = normalizeString(raw.message, 240);
  const usableMessage = countVisibleFeedbackChars(message) >= 48
    ? ensureFeedbackQuote(message)
    : fallback.message;
  return {
    message: usableMessage,
    confidence: clampNumber(raw.confidence, 0, 1, fallback.confidence),
  };
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

function countVisibleFeedbackChars(message: string): number {
  return stripFeedbackQuotes(message).replace(/\s+/g, '').length;
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
