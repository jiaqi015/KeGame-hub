import './_bootstrap.js';
import { authorizeRequestPersisted } from '../lib/activation.js';
import { callDeepSeekChat } from '../lib/deepseek.js';
import { resolveEnabledModel } from '../lib/modelRuntime.js';
import { parseJsonBody } from './_request.js';

const DEFAULT_DIALOGUE_MODEL_ID = 'deepseek-v4-pro';

const INTENT_KINDS = [
  'reassure',
  'present_market_evidence',
  'propose_face_visit',
  'discuss_price',
  'secure_price_adjustment',
  'promise_feedback',
  'follow_customer',
  'align_manager',
  'overpromise',
  'hostile',
  'unclear',
] as const;

const RISK_KINDS = [
  'none',
  'overpromise',
  'empty_comfort',
  'price_pressure_too_fast',
  'missing_next_step',
  'ignores_customer',
  'offensive_reply',
] as const;

const NEXT_STEP_KINDS = [
  'schedule_face_visit',
  'review_price',
  'prepare_competition_comparison',
  'follow_customer',
  'confirm_price_adjustment',
  'open_case',
  'none',
] as const;

type IntentKind = (typeof INTENT_KINDS)[number];
type RiskKind = (typeof RISK_KINDS)[number];
type NextStepKind = (typeof NEXT_STEP_KINDS)[number];

interface WechatTurnScene {
  sceneId: string;
  runId: string;
  day: number;
  conversationKey: string;
  sourceMessageId: string;
  sceneType: 'owner_wechat' | 'customer_wechat' | 'manager_wechat' | 'broker_wechat';
  playerText: string;
  sourceMessage: {
    messageId: string;
    senderName: string;
    senderRole: string;
    content: string;
    timeLabel: string;
    urgency: string;
  };
  caseContext?: {
    caseId: string;
    title: string;
    ownerName: string;
    district: string;
    community: string;
    askPrice: number;
    marketPrice: number;
    priceGapPct: number;
    trust: number;
    patience: number;
    urgency: number;
    ownerProfileLabel: string;
    hasCompletedFirstVisit: boolean;
    serviceStrategy?: {
      primaryGoal?: string;
      mainBlocker?: string;
      recommendedNextAction?: string;
      communicationStyle?: string;
    };
  };
  opportunityContext?: {
    opportunityId: string;
    customerName: string;
    stage: string;
    intent: number;
    confidence: number;
  };
  recentTurns: Array<{
    playerText: string;
    recipientReply: string;
    summary: string;
  }>;
}

interface ConversationEffectProposal {
  summary: string;
  recipientReply: string;
  intentKinds: IntentKind[];
  riskKinds: RiskKind[];
  evidenceUse: 'none' | 'mentioned' | 'specific';
  trustDelta?: number;
  patienceDelta?: number;
  urgencyDelta?: number;
  priceFlexibilityDelta?: number;
  customerIntentDelta?: number;
  customerConfidenceDelta?: number;
  nextStep?: {
    kind: NextStepKind;
    actionId?: string;
    label: string;
    reason: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
  };
  confidence: number;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const authorization = await authorizeRequestPersisted(req, 'selling-houses');
  if (!authorization.ok) {
    return res.status(authorization.status).json({ error: authorization.error });
  }

  try {
    const scene = normalizeWechatTurnScene(parseJsonBody(req.body));
    if (!scene) {
      return res.status(400).json({
        ok: false,
        proposal: buildFallbackProposal(buildMinimalScene()),
        source: 'fallback',
        error: '微信对话上下文不可用。',
      });
    }

    const modelId = resolveDialogueModelId(req.body);
    const model = resolveEnabledModel(modelId);
    const fallback = buildFallbackProposal(scene);

    if (!model || model.provider !== 'deepseek') {
      return res.status(200).json({
        ok: true,
        proposal: fallback,
        source: 'fallback',
        modelId,
        provider: 'deepseek',
        error: '微信对话理解模型未启用或不是 DeepSeek 渠道。',
      });
    }

    const result = await callDeepSeekChat(
      [
        {
          role: 'system',
          content: '你只输出符合要求的 JSON。不要输出 Markdown、说明、思考过程。',
        },
        {
          role: 'user',
          content: buildWechatTurnPrompt(scene),
        },
      ],
      model,
      {
        responseFormat: 'json_object',
        thinking: 'disabled',
        temperature: 0.48,
        maxTokens: 900,
      },
    );

    if (result.status !== 'completed') {
      return res.status(200).json({
        ok: true,
        proposal: fallback,
        source: 'fallback',
        modelId: model.id,
        provider: 'deepseek',
        error: result.result || 'DeepSeek 微信对话理解失败。',
      });
    }

    try {
      const parsed = JSON.parse(extractJsonObjectText(result.result));
      const proposal = normalizeProposal(parsed, scene, fallback);
      return res.status(200).json({
        ok: true,
        proposal,
        source: 'ai',
        modelId: model.id,
        provider: 'deepseek',
      });
    } catch (error) {
      return res.status(200).json({
        ok: true,
        proposal: fallback,
        source: 'fallback',
        modelId: model.id,
        provider: 'deepseek',
        error: error instanceof Error ? error.message : 'DeepSeek 微信对话返回格式不可用。',
      });
    }
  } catch (error) {
    return res.status(200).json({
      ok: false,
      proposal: buildFallbackProposal(buildMinimalScene()),
      source: 'fallback',
      error: error instanceof Error ? error.message : '微信对话理解失败',
    });
  }
}

function normalizeWechatTurnScene(input: unknown): WechatTurnScene | null {
  const raw = isRecord(input) && isRecord(input.scene) ? input.scene : input;
  if (!isRecord(raw)) return null;

  const sourceMessage = isRecord(raw.sourceMessage) ? raw.sourceMessage : null;
  if (!sourceMessage) return null;

  const playerText = normalizeText(raw.playerText, 260);
  const senderName = normalizeText(sourceMessage.senderName, 40);
  const senderRole = normalizeText(sourceMessage.senderRole, 40);
  const content = normalizeText(sourceMessage.content, 520);

  if (!playerText || !senderName || !senderRole || !content) return null;

  return {
    sceneId: normalizeText(raw.sceneId, 160) || `scene-${Date.now()}`,
    runId: normalizeText(raw.runId, 120) || 'online-run',
    day: normalizeNumber(raw.day, 1),
    conversationKey: normalizeText(raw.conversationKey, 160) || 'online-conversation',
    sourceMessageId: normalizeText(raw.sourceMessageId, 160) || normalizeText(sourceMessage.messageId, 160) || 'source-message',
    sceneType: normalizeSceneType(raw.sceneType),
    playerText,
    sourceMessage: {
      messageId: normalizeText(sourceMessage.messageId, 160) || 'source-message',
      senderName,
      senderRole,
      content,
      timeLabel: normalizeText(sourceMessage.timeLabel, 24) || '今天',
      urgency: normalizeText(sourceMessage.urgency, 24) || 'medium',
    },
    caseContext: normalizeCaseContext(raw.caseContext),
    opportunityContext: normalizeOpportunityContext(raw.opportunityContext),
    recentTurns: normalizeRecentTurns(raw.recentTurns),
  };
}

function normalizeCaseContext(value: unknown): WechatTurnScene['caseContext'] | undefined {
  if (!isRecord(value)) return undefined;
  return {
    caseId: normalizeText(value.caseId, 120),
    title: normalizeText(value.title, 80),
    ownerName: normalizeText(value.ownerName, 40),
    district: normalizeText(value.district, 40),
    community: normalizeText(value.community, 60),
    askPrice: normalizeNumber(value.askPrice, 0),
    marketPrice: normalizeNumber(value.marketPrice, 0),
    priceGapPct: normalizeNumber(value.priceGapPct, 0),
    trust: normalizeNumber(value.trust, 50),
    patience: normalizeNumber(value.patience, 50),
    urgency: normalizeNumber(value.urgency, 50),
    ownerProfileLabel: normalizeText(value.ownerProfileLabel, 60),
    hasCompletedFirstVisit: value.hasCompletedFirstVisit === true,
    serviceStrategy: isRecord(value.serviceStrategy)
      ? {
          primaryGoal: normalizeText(value.serviceStrategy.primaryGoal, 80),
          mainBlocker: normalizeText(value.serviceStrategy.mainBlocker, 80),
          recommendedNextAction: normalizeText(value.serviceStrategy.recommendedNextAction, 80),
          communicationStyle: normalizeText(value.serviceStrategy.communicationStyle, 80),
        }
      : undefined,
  };
}

function normalizeOpportunityContext(value: unknown): WechatTurnScene['opportunityContext'] | undefined {
  if (!isRecord(value)) return undefined;
  return {
    opportunityId: normalizeText(value.opportunityId, 120),
    customerName: normalizeText(value.customerName, 40),
    stage: normalizeText(value.stage, 40),
    intent: normalizeNumber(value.intent, 50),
    confidence: normalizeNumber(value.confidence, 50),
  };
}

function normalizeRecentTurns(value: unknown): WechatTurnScene['recentTurns'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((entry) => ({
      playerText: normalizeText(entry.playerText, 180),
      recipientReply: normalizeText(entry.recipientReply, 180),
      summary: normalizeText(entry.summary, 120),
    }))
    .filter((entry) => entry.playerText || entry.recipientReply || entry.summary)
    .slice(-4);
}

function buildWechatTurnPrompt(scene: WechatTurnScene) {
  const caseContext = scene.caseContext;
  const opportunityContext = scene.opportunityContext;
  return [
    '你是房产经纪人微信经营对话里的“对方反应模拟器”。',
    '你要判断经纪人刚发出的这句话，会让业主/客户/经理怎么真实回复，以及关系和推进状态怎么变化。',
    '',
    '关键要求：',
    '- recipientReply 必须是对方说出口的话，不是经纪人的建议，不要像系统评语。',
    '- 语气要像真人微信：可以有犹豫、追问、不满、松动、催促，但不要文绉绉。',
    '- 不要编造输入里没有的成交、客户、价格和承诺。',
    '- 如果经纪人只安慰、没证据、没下一步，要让对方追问或不满意。',
    '- 如果经纪人提出具体时间、证据、表格、面访、客户反馈，可让对方小幅松动。',
    '- 输出 JSON，不输出思考过程。',
    '',
    '输出格式：',
    JSON.stringify({
      summary: '一句话概括这轮对话效果',
      recipientReply: '对方自然回复，40-120字',
      intentKinds: ['reassure'],
      riskKinds: ['none'],
      evidenceUse: 'none',
      trustDelta: 0,
      patienceDelta: 0,
      urgencyDelta: 0,
      priceFlexibilityDelta: 0,
      customerIntentDelta: 0,
      customerConfidenceDelta: 0,
      nextStep: {
        kind: 'none',
        label: '下一步标签',
        reason: '为什么',
        priority: 'medium',
      },
      confidence: 0.72,
    }, null, 2),
    '',
    '本轮输入：',
    `场景：${scene.sceneType}，第 ${scene.day} 天，消息时间：${scene.sourceMessage.timeLabel}`,
    `对方：${scene.sourceMessage.senderName}（${scene.sourceMessage.senderRole}，紧急度 ${scene.sourceMessage.urgency}）`,
    `对方原话：${scene.sourceMessage.content}`,
    `经纪人回复：${scene.playerText}`,
    caseContext
      ? `房源：${caseContext.title || '未知房源'}；业主：${caseContext.ownerName || scene.sourceMessage.senderName}；小区：${caseContext.community || caseContext.district || '未知'}；挂牌 ${caseContext.askPrice}；市场 ${caseContext.marketPrice}；价差 ${caseContext.priceGapPct}%；信任 ${caseContext.trust}；耐心 ${caseContext.patience}；催促 ${caseContext.urgency}；首访 ${caseContext.hasCompletedFirstVisit ? '已完成' : '未完成'}；画像 ${caseContext.ownerProfileLabel || '未知'}`
      : '房源上下文：暂无',
    caseContext?.serviceStrategy
      ? `服务策略：目标=${caseContext.serviceStrategy.primaryGoal || '无'}；阻碍=${caseContext.serviceStrategy.mainBlocker || '无'}；建议动作=${caseContext.serviceStrategy.recommendedNextAction || '无'}；沟通风格=${caseContext.serviceStrategy.communicationStyle || '无'}`
      : '',
    opportunityContext
      ? `客户线索：${opportunityContext.customerName || '未知客户'}；阶段=${opportunityContext.stage}；意向=${opportunityContext.intent}；信心=${opportunityContext.confidence}`
      : '',
    scene.recentTurns.length
      ? `最近对话：${scene.recentTurns.map((turn) => `经纪人：${turn.playerText} / 对方：${turn.recipientReply}`).join('；')}`
      : '',
  ].filter(Boolean).join('\n');
}

function buildFallbackProposal(scene: WechatTurnScene): ConversationEffectProposal {
  const text = scene.playerText;
  const content = scene.sourceMessage.content;
  const isHostile = /傻|滚|闭嘴|爱买不买|爱卖不卖|别烦|废话|垃圾/.test(text);
  const hasEvidence = /成交|客户|反馈|竞品|同小区|带看|数据|表|价格|报价|预算/.test(text);
  const hasNextStep = /今天|明天|下午|上午|今晚|点|面访|见|带看|发你|给您|回访|电话|微信/.test(text);
  const talksPrice = /价|降|调|挂牌|市场|成交/.test(text);
  const isEmptyComfort = text.length < 12 || /^(好的|收到|明白|了解|嗯|好|可以|行)[，。！!]*$/.test(text);
  const isCustomer = scene.sceneType === 'customer_wechat';

  const riskKinds: RiskKind[] = [];
  if (isHostile) riskKinds.push('offensive_reply');
  if (/保证|一定卖|肯定|包/.test(text)) riskKinds.push('overpromise');
  if (isEmptyComfort) riskKinds.push('empty_comfort');
  if (talksPrice && !hasEvidence) riskKinds.push('price_pressure_too_fast');
  if (!hasNextStep) riskKinds.push('missing_next_step');
  if (isCustomer && /业主|房东|价格/.test(text) && !/客户|您|预算|看房/.test(text)) riskKinds.push('ignores_customer');
  if (riskKinds.length === 0) riskKinds.push('none');

  const intentKinds: IntentKind[] = [];
  if (isHostile) intentKinds.push('hostile');
  if (/放心|理解|明白|别急|稳/.test(text)) intentKinds.push('reassure');
  if (hasEvidence) intentKinds.push('present_market_evidence');
  if (/面访|见面|当面|到店|过去/.test(text)) intentKinds.push('propose_face_visit');
  if (talksPrice) intentKinds.push('discuss_price');
  if (/调价|底线|报价|让价/.test(text) && hasEvidence) intentKinds.push('secure_price_adjustment');
  if (/客户|带看|预算|意向/.test(text)) intentKinds.push('follow_customer');
  if (/发你|给您|回访|反馈|汇总|表/.test(text)) intentKinds.push('promise_feedback');
  if (intentKinds.length === 0) intentKinds.push('unclear');

  const positive = hasEvidence && hasNextStep && !isHostile;
  const negative = isHostile || isEmptyComfort || riskKinds.some((risk) => risk !== 'none');
  const reply = isHostile
    ? '你这个态度我接受不了，房子的事先停一下，后面别这么跟我沟通。'
    : positive
      ? '行，你先把具体东西发我看看。别只讲方向，我要看到客户反馈、同小区成交和你建议的下一步。'
      : content.includes('价') || talksPrice
        ? '你先别直接劝我动价。把依据、客户反馈和竞品差异讲清楚，我看完再决定。'
        : '我知道你在跟进，但我现在要的是具体安排。什么时候给我结果，先说清楚。';

  return {
    summary: positive ? '对方愿意继续看证据和下一步安排。' : negative ? '这句话没有完全接住对方压力，需要补证据和下一步。' : '对方保持观望，等待更具体的信息。',
    recipientReply: reply,
    intentKinds,
    riskKinds,
    evidenceUse: hasEvidence ? 'mentioned' : 'none',
    trustDelta: isHostile ? -4 : positive ? 2 : negative ? -1 : 0,
    patienceDelta: isHostile ? -4 : positive ? 1 : negative ? -1 : 0,
    urgencyDelta: hasNextStep ? -1 : 1,
    priceFlexibilityDelta: talksPrice && hasEvidence ? 2 : talksPrice ? -1 : 0,
    customerIntentDelta: isCustomer && positive ? 2 : isCustomer && negative ? -1 : 0,
    customerConfidenceDelta: isCustomer && positive ? 2 : isCustomer && negative ? -1 : 0,
    nextStep: {
      kind: hasEvidence ? 'prepare_competition_comparison' : hasNextStep ? 'schedule_face_visit' : 'open_case',
      label: hasEvidence ? '补齐证据' : hasNextStep ? '确认安排' : '补具体下一步',
      reason: hasEvidence ? '对方愿意看事实依据。' : '对方还在等明确动作。',
      priority: negative ? 'high' : 'medium',
    },
    confidence: positive ? 0.72 : 0.62,
  };
}

function normalizeProposal(input: unknown, scene: WechatTurnScene, fallback: ConversationEffectProposal): ConversationEffectProposal {
  const raw = isRecord(input) ? input : {};
  const intentKinds = normalizeKindArray(raw.intentKinds, INTENT_KINDS, fallback.intentKinds);
  const riskKinds = normalizeKindArray(raw.riskKinds, RISK_KINDS, fallback.riskKinds);
  const nextStep = normalizeNextStep(raw.nextStep, fallback.nextStep);

  return {
    summary: normalizeText(raw.summary, 110) || fallback.summary,
    recipientReply: normalizeText(raw.recipientReply, 240) || fallback.recipientReply,
    intentKinds,
    riskKinds: riskKinds.length > 0 ? riskKinds : ['none'],
    evidenceUse: raw.evidenceUse === 'specific' || raw.evidenceUse === 'mentioned' ? raw.evidenceUse : fallback.evidenceUse,
    trustDelta: clampNumber(raw.trustDelta, -5, 6, fallback.trustDelta || 0),
    patienceDelta: clampNumber(raw.patienceDelta, -5, 6, fallback.patienceDelta || 0),
    urgencyDelta: clampNumber(raw.urgencyDelta, -6, 6, fallback.urgencyDelta || 0),
    priceFlexibilityDelta: clampNumber(raw.priceFlexibilityDelta, -6, 10, fallback.priceFlexibilityDelta || 0),
    customerIntentDelta: scene.sceneType === 'customer_wechat' ? clampNumber(raw.customerIntentDelta, -8, 8, fallback.customerIntentDelta || 0) : 0,
    customerConfidenceDelta: scene.sceneType === 'customer_wechat' ? clampNumber(raw.customerConfidenceDelta, -8, 8, fallback.customerConfidenceDelta || 0) : 0,
    nextStep,
    confidence: clampNumber(raw.confidence, 0.35, 0.95, fallback.confidence),
  };
}

function normalizeNextStep(value: unknown, fallback: ConversationEffectProposal['nextStep']): ConversationEffectProposal['nextStep'] {
  if (!isRecord(value)) return fallback;
  const kind = NEXT_STEP_KINDS.includes(value.kind as NextStepKind) ? value.kind as NextStepKind : fallback?.kind || 'none';
  return {
    kind,
    actionId: normalizeText(value.actionId, 80) || fallback?.actionId,
    label: normalizeText(value.label, 36) || fallback?.label || '继续跟进',
    reason: normalizeText(value.reason, 100) || fallback?.reason || '对方还需要明确下一步。',
    priority: value.priority === 'urgent' || value.priority === 'high' || value.priority === 'low' ? value.priority : 'medium',
  };
}

function resolveDialogueModelId(input: unknown) {
  if (typeof process.env.SELLING_HOUSES_DIALOGUE_MODEL_ID === 'string' && process.env.SELLING_HOUSES_DIALOGUE_MODEL_ID.trim()) {
    return process.env.SELLING_HOUSES_DIALOGUE_MODEL_ID.trim();
  }
  const body = parseJsonBody(input);
  if (isRecord(body) && typeof body.modelId === 'string' && body.modelId.trim()) {
    return body.modelId.trim();
  }
  return DEFAULT_DIALOGUE_MODEL_ID;
}

function normalizeSceneType(value: unknown): WechatTurnScene['sceneType'] {
  return value === 'customer_wechat' || value === 'manager_wechat' || value === 'broker_wechat'
    ? value
    : 'owner_wechat';
}

function buildMinimalScene(): WechatTurnScene {
  return {
    sceneId: 'fallback-scene',
    runId: 'fallback-run',
    day: 1,
    conversationKey: 'fallback',
    sourceMessageId: 'fallback-message',
    sceneType: 'owner_wechat',
    playerText: '',
    sourceMessage: {
      messageId: 'fallback-message',
      senderName: '业主',
      senderRole: 'owner',
      content: '我想先看看你怎么安排。',
      timeLabel: '今天',
      urgency: 'medium',
    },
    recentTurns: [],
  };
}

function normalizeKindArray<T extends string>(value: unknown, allowed: readonly T[], fallback: readonly T[]): T[] {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value
    .filter((entry): entry is T => typeof entry === 'string' && allowed.includes(entry as T))
    .filter((entry, index, list) => list.indexOf(entry) === index);
  return normalized.length > 0 ? normalized : [...fallback];
}

function extractJsonObjectText(text: string) {
  const normalized = text.trim();
  const match = normalized.match(/\{[\s\S]*\}/);
  return match ? match[0] : normalized;
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function normalizeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
