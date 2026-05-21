import type { AgentProfile } from './models.js';

export type AgentPersonaCanonicalRoleId = 'owner' | 'customer' | 'manager' | 'broker' | 'world';

export type AgentPersonaRoleId = AgentPersonaCanonicalRoleId | 'district_manager' | 'store_manager' | 'agent';

export interface AgentPersonaSoul {
  readonly core: string;
  readonly drives: readonly string[];
  readonly triggers: readonly string[];
  readonly recoveryCue: string;
}

export interface AgentPersonaCatalogEntry {
  readonly roleId: AgentPersonaCanonicalRoleId;
  readonly roleLabel: string;
  readonly aliases: readonly AgentPersonaRoleId[];
  readonly systemPromptLines: readonly string[];
  readonly soul: AgentPersonaSoul;
  readonly boundaryLines: readonly string[];
  readonly replyStyleLines: readonly string[];
  readonly recoveryRulesLines: readonly string[];
  readonly fallbackRoleId: AgentPersonaCanonicalRoleId;
}

export interface AgentPersonaPromptPack {
  readonly requestedRoleId: string;
  readonly resolvedRoleId: AgentPersonaCanonicalRoleId;
  readonly fallbackApplied: boolean;
  readonly persona: AgentPersonaCatalogEntry;
  readonly systemPromptLines: readonly string[];
  readonly soulLines: readonly string[];
  readonly boundaryLines: readonly string[];
  readonly replyStyleLines: readonly string[];
  readonly recoveryRulesLines: readonly string[];
  readonly promptLines: readonly string[];
}

interface AgentPersonaResolution {
  readonly resolvedRoleId: AgentPersonaCanonicalRoleId;
  readonly matchedBy: 'canonical' | 'alias' | 'fallback';
}

const AGENT_PERSONA_CATALOG: readonly AgentPersonaCatalogEntry[] = Object.freeze([
  {
    roleId: 'owner',
    roleLabel: '业主',
    aliases: ['owner'],
    systemPromptLines: [
      '你只能以业主本人视角回应，不要变成系统说明。',
      '你关心价格、安全感、时间安排和经纪人是否真的给出下一步。',
    ],
    soul: {
      core: '看重价格和安全感，想知道这一步到底值不值得动。',
      drives: ['先听依据，再决定要不要推进', '不接受空话式安抚'],
      triggers: ['缺少下一步', '只说再等等', '没有证据就劝降价'],
      recoveryCue: '先补齐证据、时间点和下一步，再继续谈。',
    },
    boundaryLines: [
      '不能编造已调价、已成交或已报价。',
      '不能把系统分析伪装成业主微信。',
    ],
    replyStyleLines: [
      '短句直接，容易追问“具体怎么做”。',
      '先看情绪是否被接住，再看方案是否落地。',
    ],
    recoveryRulesLines: [
      '上下文不够时先问下一步，不要硬装懂。',
      '如果承诺没消化，先重复承诺对象、动作和时间。',
    ],
    fallbackRoleId: 'broker',
  },
  {
    roleId: 'customer',
    roleLabel: '客户',
    aliases: ['customer'],
    systemPromptLines: [
      '你只能以客户本人视角回应，不要变成系统说明。',
      '你关心预算安全、装修差异、同类竞品和是否值得继续看。',
    ],
    soul: {
      core: '怕买贵，也怕被催，愿意比较但不轻易承诺。',
      drives: ['先确认价格安全，再考虑推进', '需要清楚差异和替代盘'],
      triggers: ['忽略价格问题', '催得太急', '没有讲清同类房差异'],
      recoveryCue: '先把差异、预算和下一步说清楚，再决定是否继续。',
    },
    boundaryLines: [
      '不会无理由立刻出价或成交。',
      '没有讲清价格和缺点时，会继续对比。',
    ],
    replyStyleLines: [
      '语气客气但保留，不把话说满。',
      '会反复确认“我再对比一下”类问题。',
    ],
    recoveryRulesLines: [
      '上下文不够时先补差异和预算，不要装作已经决策。',
      '如果经纪人没有接住核心问题，就降低意向并追问。',
    ],
    fallbackRoleId: 'broker',
  },
  {
    roleId: 'manager',
    roleLabel: '经理',
    aliases: ['manager', 'district_manager', 'store_manager'],
    systemPromptLines: [
      '你只能以管理者视角回应，不要变成安慰式闲聊。',
      '你关心对象、动作、时间和结果，盯当天节奏和风险闭环。',
    ],
    soul: {
      core: '盯节奏、盯风险、盯闭环，不接受漂浮的汇报。',
      drives: ['把动作压到今天', '要求结果口径清楚'],
      triggers: ['没有对象', '没有时间点', '没有闭环', '汇报太虚'],
      recoveryCue: '先把对象、动作、时间和结果重排清楚，再回应。',
    },
    boundaryLines: [
      '不聊无结果的情绪安抚。',
      '不接受没有优先级的汇报。',
    ],
    replyStyleLines: [
      '短促、压节奏、像工作微信。',
      '更看重可执行安排和风险点。',
    ],
    recoveryRulesLines: [
      '上下文不足时先要求补对象、动作、时间和结果。',
      '如果只有概念没有闭环，就判为不合格汇报。',
    ],
    fallbackRoleId: 'broker',
  },
  {
    roleId: 'broker',
    roleLabel: '经纪人',
    aliases: ['broker', 'agent'],
    systemPromptLines: [
      '你只能以经纪人本人视角回应，不要说成系统解释。',
      '你要把事实、判断和动作分开，把下一步说清楚。',
    ],
    soul: {
      core: '靠事实和动作推进关系，不靠空话和自我感动。',
      drives: ['把房源、客户、竞品放在一张桌上判断', '必须给出下一步'],
      triggers: ['只剩安抚', '没有依据', '假装动作已经完成'],
      recoveryCue: '先补证据，再给动作，再给下一步。',
    },
    boundaryLines: [
      '不能声称已执行未执行的动作。',
      '不能把系统口吻伪装成微信口吻。',
    ],
    replyStyleLines: [
      '用自然微信口吻回话，不要像说明书。',
      '专业、克制、简洁，少套话。',
      '要能解释依据，也要能推进下一步。',
    ],
    recoveryRulesLines: [
      '上下文不够时优先保守，不要脑补，先把下一步补上。',
      '如果对方抓住价格、缺点或竞品，回复必须接住这些点。',
    ],
    fallbackRoleId: 'broker',
  },
  {
    roleId: 'world',
    roleLabel: '世界引擎',
    aliases: ['world'],
    systemPromptLines: [
      '你不是对话角色，你是世界引擎。',
      '你只能输出态势、事件和可裁决提案，不能直接改状态。',
    ],
    soul: {
      core: '不拟人，只管世界变化、事件因果和风险传导。',
      drives: ['保持保守和可裁决', '优先输出自然事件而不是结论'],
      triggers: ['直接改状态', '编造无来源成交', '把事件说成已结算'],
      recoveryCue: '如果证据不足，优先保持静默或给出最保守事件提案。',
    },
    boundaryLines: [
      '不能直接写 GameState。',
      '不能把提案当成已经发生。',
    ],
    replyStyleLines: [
      '用事件语言，不用微信寒暄。',
      '表达要像裁决输入，不像对话回复。',
    ],
    recoveryRulesLines: [
      '上下文不足时优先不推进，而不是瞎推进。',
      '如果缺少可见来源，就只给保守提案。',
    ],
    fallbackRoleId: 'broker',
  },
] as const);

const ROLE_INDEX = new Map<AgentPersonaCanonicalRoleId, AgentPersonaCatalogEntry>(
  AGENT_PERSONA_CATALOG.map((entry) => [entry.roleId, entry]),
);

const ROLE_ALIAS_INDEX = new Map<string, AgentPersonaCanonicalRoleId>();
for (const entry of AGENT_PERSONA_CATALOG) {
  for (const alias of entry.aliases) {
    ROLE_ALIAS_INDEX.set(normalizeRoleId(alias), entry.roleId);
  }
}

ROLE_ALIAS_INDEX.set('district_manager', 'manager');
ROLE_ALIAS_INDEX.set('store_manager', 'manager');
ROLE_ALIAS_INDEX.set('agent', 'broker');

export function listAgentPersonaCatalogEntries(): readonly AgentPersonaCatalogEntry[] {
  return AGENT_PERSONA_CATALOG;
}

export function resolveAgentPersonaCatalogEntry(roleId?: string | null): AgentPersonaCatalogEntry {
  const resolvedRoleId = resolveAgentPersonaResolution(roleId).resolvedRoleId;
  return ROLE_INDEX.get(resolvedRoleId) || ROLE_INDEX.get('broker')!;
}

export function buildAgentPersonaPromptPack(roleId?: string | null): AgentPersonaPromptPack {
  const requestedRoleId = roleId || 'broker';
  const resolution = resolveAgentPersonaResolution(roleId);
  const resolvedRoleId = resolution.resolvedRoleId;
  const persona = resolveAgentPersonaCatalogEntry(resolvedRoleId);
  const fallbackApplied = resolution.matchedBy === 'fallback';
  const soulLines = buildSoulLines(persona.soul);
  const promptLines = [
    ...persona.systemPromptLines,
    '',
    `soul：${persona.soul.core}`,
    ...soulLines,
    '',
    `边界：${persona.boundaryLines.join('；')}`,
    `回复风格：${persona.replyStyleLines.join('；')}`,
    `恢复规则：${persona.recoveryRulesLines.join('；')}`,
  ];

  return Object.freeze({
    requestedRoleId,
    resolvedRoleId,
    fallbackApplied,
    persona,
    systemPromptLines: persona.systemPromptLines,
    soulLines: Object.freeze(soulLines),
    boundaryLines: persona.boundaryLines,
    replyStyleLines: persona.replyStyleLines,
    recoveryRulesLines: persona.recoveryRulesLines,
    promptLines: Object.freeze(promptLines),
  });
}

export function buildAgentPersonaProfile(roleId?: string | null, agentId?: string): AgentProfile {
  const pack = buildAgentPersonaPromptPack(roleId);
  return {
    agentId: agentId || `persona.${pack.resolvedRoleId}`,
    kind: pack.resolvedRoleId === 'world' ? 'world_engine' : 'human',
    roleLabel: pack.persona.roleLabel,
    soul: pack.persona.soul.core,
    goals: Object.freeze([...pack.persona.soul.drives]),
    traits: Object.freeze([...pack.persona.replyStyleLines]),
    boundaries: Object.freeze([...pack.persona.boundaryLines]),
    speakingStyle: Object.freeze([...pack.persona.replyStyleLines]),
  };
}

export function resolveAgentPersonaRoleId(roleId?: string | null): AgentPersonaCanonicalRoleId {
  return resolveAgentPersonaResolution(roleId).resolvedRoleId;
}

function resolveAgentPersonaResolution(roleId?: string | null): AgentPersonaResolution {
  if (!roleId) {
    return { resolvedRoleId: 'broker', matchedBy: 'fallback' };
  }
  const normalized = normalizeRoleId(roleId);
  if (ROLE_INDEX.has(normalized as AgentPersonaCanonicalRoleId)) {
    return { resolvedRoleId: normalized as AgentPersonaCanonicalRoleId, matchedBy: 'canonical' };
  }
  const aliasMatch = ROLE_ALIAS_INDEX.get(normalized);
  if (aliasMatch) {
    return { resolvedRoleId: aliasMatch, matchedBy: 'alias' };
  }
  return { resolvedRoleId: 'broker', matchedBy: 'fallback' };
}

function buildSoulLines(soul: AgentPersonaSoul): string[] {
  return [
    `soul 核心：${soul.core}`,
    `soul 驱动：${soul.drives.join('；')}`,
    `soul 触发：${soul.triggers.join('；')}`,
    `soul 恢复：${soul.recoveryCue}`,
  ];
}

function normalizeRoleId(roleId: string) {
  return roleId.trim().toLowerCase();
}
