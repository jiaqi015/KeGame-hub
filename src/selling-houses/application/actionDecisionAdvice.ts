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
