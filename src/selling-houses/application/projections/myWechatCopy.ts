import type { GameState } from '../../domain/models.js';
import { getActionAvailability } from '../../domain/engine.js';
import type {
  OfficialAccountArticle,
  WechatFact,
  WechatMessage,
  WechatMessageUrgency,
  WechatSenderRole,
} from './myWechatTypes.js';

interface WechatCopyContext {
  state: GameState;
}

const OWNER_MESSAGE_TEMPLATES: Record<string, readonly string[]> = {
  owner_no_showing: [
    '{ownerName}：这周是不是没什么人看？我家里人一直问我，是不是价格还是高了点。',
    '{ownerName}：这几天没什么动静，我有点没底。你帮我看看是不是竞品那边影响比较大。',
    '{ownerName}：之前说会有反馈，这两天好像又安静了。你今天能不能帮我看下真实情况？',
  ],
  owner_price_doubt: [
    '{ownerName}：你跟我说实话，现在这个价格到底有没有机会？我也好跟家里人有个交代。',
    '{ownerName}：如果还是这个反馈，我们是不是得重新想想价格？我不想一直空挂着。',
    '{ownerName}：隔壁那套是不是价格低一些？如果客户都拿它比，我们这边要不要提前准备一下？',
  ],
  owner_urgent: [
    '{ownerName}：我这边时间真的不多了，今天能不能给个明确方案，别只是说再等等。',
    '{ownerName}：家里那边一直催我定下来，你今天给我一个判断吧，是继续等还是要动一动。',
    '{ownerName}：如果这周还没有实质进展，我可能得考虑别的安排了，你先跟我说下计划。',
  ],
  owner_long_time_no_touch: [
    '{ownerName}：你这两天是不是比较忙？我这套现在到底什么情况，能不能同步一下。',
    '{ownerName}：我这边一直没收到新反馈，有点拿不准。你今天方便帮我捋一下吗？',
    '{ownerName}：最近客户那边还有没有声音？如果没动静，我们是不是得换个办法。',
  ],
  owner_trust_drop: [
    '{ownerName}：我不是不配合，但这两天听到的反馈有点散。你今天先把客户和竞品情况给我讲清楚。',
    '{ownerName}：我现在最怕一直听不到准话。你帮我把真实情况和下一步安排说具体一点。',
    '{ownerName}：如果客户都在犹豫，我也想知道原因。你今天别只说还在推，给我一个判断。',
  ],
};

const CUSTOMER_MESSAGE_TEMPLATES: Record<string, readonly string[]> = {
  customer_comparing: [
    '{customerName}：我昨天又看了一套同小区两居，装修确实新一点。你这套如果价格没空间，我还得再想想。',
    '{customerName}：这套我不是不喜欢，就是同价位还有几套能比。你帮我说清楚它真正强在哪。',
    '{customerName}：我家里人觉得另一套也可以，主要是装修省心一点。你这套还有什么优势我想再听听。',
  ],
  customer_price_sensitive: [
    '{customerName}：这套我还没完全放弃，主要是预算有点卡。你帮我再确认下业主预期。',
    '{customerName}：位置我能接受，就是总价压力有点大。业主那边如果一点空间没有，我可能就先放放。',
    '{customerName}：如果能谈到我预算附近，我愿意再认真看一次。你先帮我摸一下业主态度。',
  ],
  customer_second_showing: [
    '{customerName}：如果这周能约二看，我可以再带家里人看看，但价格这块最好先有个判断。',
    '{customerName}：我对这套还有兴趣，想再看一次细节。你帮我确认下业主那边有没有时间。',
    '{customerName}：我想带家里人再看看采光和楼层，价格如果能聊，我们就认真推进。',
  ],
  customer_churn_risk: [
    '{customerName}：我这两天又看了两套，感觉选择还挺多的。你这套优势得再帮我讲清楚。',
    '{customerName}：我先不急着定，最近看的房子有点多。你这套如果有新反馈再告诉我。',
    '{customerName}：我现在有点犹豫，主要是价格和装修都要再比比。你别太晚给我反馈。',
  ],
  event_followup_needed: [
    '{customerName}：昨天说的反馈我还在等，你今天能不能给我一个明确回复？我这边也在看别的房。',
    '{customerName}：这套我还想继续了解，但别让我一直等。你今天把价格和业主态度帮我问清楚。',
  ],
};

const MANAGER_MESSAGE_TEMPLATES: Record<string, readonly string[]> = {
  manager_push_priority: [
    '张经理：{caseTitle} 今天别空着，业主已经有点没耐心了。上午先给他一个市场反馈和下一步动作。',
    '张经理：今天别平均用力，先把最容易掉线的那套稳住。动作要具体，不要只看一圈数据。',
    '商圈经理：今天重点看 {caseTitle}，别把时间摊太散。你先把业主、客户、竞品三件事串起来。',
  ],
  manager_warn_risk: [
    '张经理：这套业主已经有情绪了，你先别硬推客户，先把竞品和价格预期讲清楚。',
    '张经理：客户线不厚的房源先别烧推广，先补一轮客源经纪人触达，看有没有真实反馈。',
    '商圈经理：这套现在不能只等自然流量，今天至少要有一个能回给业主的动作。',
  ],
  matter_pending: [
    '张经理：{caseTitle} 那个待处理事项别拖，今天先把客户、业主和下一步时间确认清楚。',
    '商圈经理：这件事已经挂到 {caseTitle} 上了，别让它过夜。先给对方一个明确反馈。',
  ],
  event_followup_needed: [
    '商圈经理：昨天那条变化今天要补动作，别只留在记录里。先把能回给业主的话准备好。',
    '张经理：这套房已经有新反馈了，今天要接上后续动作，不然客户和业主都会觉得断档。',
  ],
};

const AGENT_MESSAGE_TEMPLATES: readonly string[] = [
  '小刘：我这边有个客户预算差不多，但他很在意楼层和装修。你那套卖点如果能讲清楚，我可以帮你再推一次。',
  '王磊：昨天那组客户还在比价格，我感觉可以再推一把。你看看业主那边有没有一点谈的空间。',
  '周姐：你那套如果能谈到 {price} 左右，我这边客户愿意再看。关键是得先给他一个确定反馈。',
  '小陈：有个客户问到这个小区，但他比较在意后续置换时间。你把业主节奏摸清楚再说。',
];

const BROKER_REPLY_TEMPLATES: Partial<Record<string, readonly string[]>> = {
  owner_no_showing: [
    '{ownerShortName}，我先把这两天入口和客户反馈查清楚，不只看带看数。今天我补一组更准的客源触达，晚上把真实反馈和下一步安排发您。',
    '{ownerShortName}，我看一下同小区这两天新增房和客户停留情况。如果是竞品抢走注意力，我会把差异和能补的动作一起给您。',
  ],
  owner_price_doubt: [
    '{ownerShortName}，我先把隔壁那套的价格、楼层、装修和最近反馈放一起比，不只看总价。我们这边如果确实吃亏，我给您一个能执行的调整口径。',
    '{ownerShortName}，价格这件事我不空口判断。我今天拿同户型成交、客户反馈和竞品挂牌一起看，再跟您说是守住、微调，还是先换展示打法。',
  ],
  owner_urgent: [
    '{ownerShortName}，我今天给您明确判断。先不急着一句话降价，我会把近两天客户反馈、竞品情况和您能等的时间整理清楚，下午给您两个可选方案。',
    '{ownerShortName}，我明白家里催得紧。今天我先把还能等多久、价格要不要动、先约哪类客户这三件事讲清楚，不让您只听一句“再等等”。',
  ],
  owner_long_time_no_touch: [
    '{ownerShortName}，这两天我没有同步够及时。我今天把客户反馈、竞品变化和接下来要做的事整理给您，先让您知道现在卡在哪里。',
    '{ownerShortName}，我马上补一版进展给您。不是简单说没动静，我会把看过的人为什么没往下走、下一批客源怎么补讲清楚。',
  ],
  owner_trust_drop: [
    '{ownerShortName}，您担心的点我收到了。今天我先把客户反馈和竞品差异讲透，再给一个明确安排，避免您只听到零散消息。',
    '{ownerShortName}，我不跟您绕。现在卡住的原因我今天拆给您看：客户怎么比、竞品强在哪、我们下一步怎么接。',
  ],
  customer_comparing: [
    '{customerShortName}，我把您对比的那套一起看一下。待会儿我按楼层、装修、总价和业主可谈空间给您讲清楚，方便您跟家里人一起判断。',
    '{customerShortName}，可以比，我先不硬推。您关心的装修和价格我一起核一下，晚点给您一个这套到底值不值得再看的判断。',
  ],
  customer_price_sensitive: [
    '{customerShortName}，预算我记下了。我先跟业主摸一下可谈边界，如果差距能收回来，我再帮您约下一步，不让您白跑。',
    '{customerShortName}，我先确认业主态度。能谈到您预算附近我就继续推进，空间太小也会直接跟您说清楚。',
  ],
  customer_second_showing: [
    '{customerShortName}，我来协调时间。二看前我也会先问清业主价格态度，您带家里人看完就能接着判断。',
    '{customerShortName}，可以，我先帮您锁一个方便的时间，再把采光、楼层和价格这几个点提前准备好。',
  ],
  customer_churn_risk: [
    '{customerShortName}，您先别急着排除。我把这套和您新看的两套放一起比，今天给您讲清楚优势和短板。',
    '{customerShortName}，明白，选择多的时候更要比清楚。我晚点把这套的价格空间和真实卖点发您，您再决定要不要继续看。',
  ],
  event_followup_needed: [
    '{customerShortName}，我今天把业主态度和价格边界问清楚，再给您一个明确回复。能推进就推进，不能推进我也不拖着您。',
    '{customerShortName}，我现在去补这个反馈。晚点我会直接告诉您业主能不能谈、下一步值不值得约。',
  ],
  manager_push_priority: [
    '收到，我上午先处理这套。先给业主回市场反馈，再把客户和竞品差异补齐，今天会有明确动作。',
    '好，我先把这套放到今天前面。业主、客户、竞品三条我一起接上，不让沟通断档。',
  ],
  manager_warn_risk: [
    '收到，我先稳业主预期，再补客源触达。今天不会只等自然流量，会把可回给业主的话准备出来。',
    '明白，我先查竞品和客户反馈，再决定是补展示、补客源，还是先做价格沟通。',
  ],
  matter_pending: [
    '收到，我今天处理掉。先把相关人和下一步时间确认清楚，再同步结果。',
    '好，这件事我先接上，不让它继续挂着。',
  ],
  agent_lead_referral: [
    '感谢，我先把房源卖点和业主节奏整理给你。客户如果关注楼层装修，我会把差异点讲得更具体。',
    '可以，你先把客户核心顾虑发我。我这边确认业主空间后，再一起判断要不要推二看。',
  ],
};

const OFFICIAL_ACCOUNT_TEMPLATES = {
  market_demand_change: {
    accountName: '贝壳市场观察',
    title: '600-800 万两居客户开始收紧预算',
    summary: '本周同价位带看量下降，但诚意价房源仍有询价。你手里价格高于市场的房源，今天要先准备竞品解释和价格预期沟通。',
    tag: 'market' as const,
    tone: 'chance' as const,
  },
  community_supply_change: {
    accountName: '小区雷达',
    title: '{community} 同户型新增供给',
    summary: '{community} 今日新增同类房源，客户看房时会更容易拿竞品做对比。关联房源沟通前要先解释位置、楼层和价格差异，避免只说“再等等”。',
    tag: 'community' as const,
    tone: 'risk' as const,
  },
  market_competition_risk: {
    accountName: '竞品快讯',
    title: '同价位供给增加，客户压价理由变多',
    summary: '今天同价位新增供给偏多，客户会更容易拿竞品做对比。你手里价格高于市场的房源，沟通前要先准备竞品解释和价格预期。',
    tag: 'competitor' as const,
    tone: 'risk' as const,
  },
  method_suggestion: {
    accountName: '平台经营建议',
    title: '业主追问带看时，不要只回“再等等”',
    summary: '连续追问反馈的业主，更需要看到竞品、客户反馈和下一步动作。今天沟通时先给判断，再给安排，才能稳住信任。',
    tag: 'method' as const,
    tone: 'neutral' as const,
  },
};

export function renderWechatMessage(fact: WechatFact, context: WechatCopyContext): WechatMessage {
  const senderRole = resolveSenderRole(fact);
  const content = sanitizeMessageContent(normalizeSenderVoice(fillTemplate(selectMessageTemplate(fact, context), fact), senderRole));
  const senderName = resolveSenderName(fact, senderRole, content);

  return {
    id: fact.id.replace('wechat-fact', 'wechat-message'),
    senderName,
    senderRole,
    avatarLabel: getAvatarLabel(senderName),
    content,
    brokerReply: renderBrokerReply(fact, context, senderRole),
    preview: toPreview(content, 54),
    timeLabel: getTimeLabel(fact),
    unread: true,
    urgency: getMessageUrgency(fact),
    targetCaseId: fact.caseId,
    targetCaseTitle: fact.caseTitle,
    targetCustomerId: fact.customerId,
    targetOpportunityId: fact.opportunityId,
    targetMatterId: fact.matterId,
    primaryActionId: getMessagePrimaryActionId(fact, context),
    primaryCtaLabel: getMessageCtaLabel(fact, context),
    sourceTrace: {
      source: fact.source,
      factType: fact.type,
      caseId: fact.caseId,
      customerId: fact.customerId,
      opportunityId: fact.opportunityId,
      matterId: fact.matterId,
      eventId: fact.eventId,
      reason: fact.reason,
    },
  };
}

export function renderOfficialAccountArticle(fact: WechatFact, context: WechatCopyContext): OfficialAccountArticle {
  const template = OFFICIAL_ACCOUNT_TEMPLATES[fact.type as keyof typeof OFFICIAL_ACCOUNT_TEMPLATES]
    || OFFICIAL_ACCOUNT_TEMPLATES.method_suggestion;
  const title = sanitizeMessageContent(fillTemplate(template.title, fact));
  const summary = ensureArticleSummaryQuality(sanitizeMessageContent(fillTemplate(template.summary, fact)), fact, context);

  return {
    id: fact.id.replace('wechat-fact', 'official-account'),
    accountName: template.accountName,
    title,
    summary,
    preview: toPreview(summary, 76),
    timeLabel: getTimeLabel(fact),
    tag: template.tag,
    tone: template.tone,
    relatedCaseIds: fact.relatedCaseIds?.length ? fact.relatedCaseIds : fact.caseId ? [fact.caseId] : [],
    primaryCtaLabel: template.tag === 'method' ? '打开房源' : '看受影响房源',
    sourceTrace: {
      source: fact.source,
      factType: fact.type,
      caseId: fact.caseId,
      customerId: fact.customerId,
      opportunityId: fact.opportunityId,
      matterId: fact.matterId,
      eventId: fact.eventId,
      reason: fact.reason,
    },
  };
}

export function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickSeeded<T>(items: readonly T[], seed: string): T {
  if (items.length === 0) {
    throw new Error('pickSeeded requires at least one item');
  }
  return items[stableHash(seed) % items.length];
}

function selectMessageTemplate(fact: WechatFact, context: WechatCopyContext) {
  const seed = `${context.state.runId}:${context.state.day}:${fact.type}:${fact.caseId ?? ''}:${fact.opportunityId ?? ''}:${fact.eventId ?? ''}`;
  if (fact.type === 'agent_lead_referral') {
    return pickSeeded(AGENT_MESSAGE_TEMPLATES, seed);
  }
  if (fact.senderRole === 'customer' || fact.type.startsWith('customer_')) {
    return pickSeeded(CUSTOMER_MESSAGE_TEMPLATES[fact.type] || CUSTOMER_MESSAGE_TEMPLATES.customer_churn_risk, seed);
  }
  if (fact.senderRole === 'district_manager' || fact.senderRole === 'store_manager' || fact.type.startsWith('manager_') || fact.type === 'matter_pending') {
    return pickSeeded(MANAGER_MESSAGE_TEMPLATES[fact.type] || MANAGER_MESSAGE_TEMPLATES.manager_warn_risk, seed);
  }
  if (fact.type === 'event_followup_needed') {
    return pickSeeded(MANAGER_MESSAGE_TEMPLATES.event_followup_needed, seed);
  }
  return pickSeeded(OWNER_MESSAGE_TEMPLATES[fact.type] || OWNER_MESSAGE_TEMPLATES.owner_long_time_no_touch, seed);
}

function fillTemplate(template: string, fact: WechatFact) {
  return template
    .replaceAll('{ownerName}', fact.ownerName || fact.senderName || '业主')
    .replaceAll('{ownerShortName}', getShortPersonName(fact.ownerName || fact.senderName || '业主'))
    .replaceAll('{customerName}', fact.customerName || fact.senderName || '客户')
    .replaceAll('{customerShortName}', getShortPersonName(fact.customerName || fact.senderName || '客户'))
    .replaceAll('{caseTitle}', fact.caseTitle || '这套房')
    .replaceAll('{community}', fact.community || '这个小区')
    .replaceAll('{district}', fact.district || '这个商圈')
    .replaceAll('{price}', fact.price ? `${Math.round(fact.price)} 万` : '业主可接受价格');
}

function renderBrokerReply(fact: WechatFact, context: WechatCopyContext, senderRole: WechatSenderRole) {
  const templates = getBrokerReplyTemplates(fact, senderRole);
  if (!templates) return undefined;

  const seed = `${context.state.runId}:${context.state.day}:broker-reply:${fact.type}:${fact.caseId ?? ''}:${fact.opportunityId ?? ''}:${fact.eventId ?? ''}`;
  const content = sanitizeMessageContent(fillTemplate(pickSeeded(templates, seed), fact));

  return {
    content,
    timeLabel: getBrokerReplyTimeLabel(fact),
  };
}

function getBrokerReplyTemplates(fact: WechatFact, senderRole: WechatSenderRole) {
  if (fact.type === 'event_followup_needed' && senderRole !== 'customer') {
    return getFallbackBrokerReplyTemplates(senderRole);
  }
  return BROKER_REPLY_TEMPLATES[fact.type] || getFallbackBrokerReplyTemplates(senderRole);
}

function getFallbackBrokerReplyTemplates(senderRole: WechatSenderRole) {
  if (senderRole === 'owner') {
    return [
      '{ownerShortName}，我先把客户反馈和竞品变化整理清楚，再给您一个明确判断。',
      '{ownerShortName}，我今天补一轮真实反馈，晚点跟您同步接下来怎么做。',
    ];
  }
  if (senderRole === 'customer') {
    return [
      '{customerShortName}，我先确认业主态度和房源细节，再给您一个明确回复。',
      '{customerShortName}，我把您关心的点记下了，晚点把价格和下一步安排同步给您。',
    ];
  }
  if (senderRole === 'district_manager' || senderRole === 'store_manager') {
    return [
      '收到，我今天先处理这条，处理完同步结果。',
      '好，我先把相关房源和客户接上，今天给到明确进展。',
    ];
  }
  if (senderRole === 'agent') {
    return [
      '可以，我先确认房源和业主态度，再跟你对一下客户是否合适。',
      '收到，我把卖点和可谈空间整理给你，方便你那边跟客户沟通。',
    ];
  }
  return undefined;
}

function getBrokerReplyTimeLabel(fact: WechatFact) {
  if (fact.day <= 1) return '刚刚';
  return `DAY ${fact.day}`;
}

function getShortPersonName(senderName: string) {
  const normalized = senderName
    .replace(/[：:]/g, '')
    .replace(/\s*(业主|客户)$/g, '')
    .trim();
  if (!normalized || normalized === '业主' || normalized === '客户') {
    return normalized || '您好';
  }
  if (/经理$/.test(normalized)) {
    return normalized;
  }
  return normalized.length <= 4 ? normalized : normalized.slice(0, 4);
}

function sanitizeMessageContent(content: string) {
  return content
    .replace(/trust|patience|urgency|score|D1|D2|D3/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureArticleSummaryQuality(summary: string, fact: WechatFact, context: WechatCopyContext) {
  let nextSummary = summary;
  if (!/[建议先要避免准备沟通判断]/.test(nextSummary)) {
    nextSummary = `${nextSummary} 今天先准备可落到房源上的沟通动作。`;
  }
  if (countChineseChars(nextSummary) < 45) {
    const caseTitle = fact.caseTitle || context.state.cases.find((entry) => entry.id === fact.caseId)?.title || '关联房源';
    nextSummary = `${nextSummary} ${caseTitle} 沟通前要先准备客户反馈、竞品差异和价格判断，避免只给业主一个空泛回复。`;
  }
  return nextSummary;
}

function resolveSenderRole(fact: WechatFact): WechatSenderRole {
  if (fact.senderRole) return fact.senderRole;
  if (fact.type.startsWith('customer_')) return 'customer';
  if (fact.type.startsWith('manager_') || fact.type === 'matter_pending') return 'district_manager';
  if (fact.type === 'agent_lead_referral') return 'agent';
  return 'owner';
}

function resolveSenderName(fact: WechatFact, role: WechatSenderRole, content: string) {
  if (role === 'owner') return formatOwnerSenderName(fact.ownerName || fact.senderName || beforeColon(content) || '业主');
  if (role === 'customer') return fact.customerName || fact.senderName || beforeColon(content) || '客户';
  if (role === 'district_manager') return fact.senderName || beforeColon(content) || '张经理';
  if (role === 'store_manager') return formatStoreManagerSenderName(fact.senderName || beforeColon(content) || '商圈经理');
  if (role === 'agent') return fact.senderName || beforeColon(content) || '小刘';
  return fact.senderName || beforeColon(content) || '消息';
}

function normalizeSenderVoice(content: string, role: WechatSenderRole) {
  if (role === 'store_manager') {
    return content.replace(/^(张经理|店长|商圈经理)：/, '商圈经理：');
  }
  if (role === 'district_manager') {
    return content.replace(/^(店长|商圈经理)：/, '张经理：');
  }
  return content;
}

function formatOwnerSenderName(senderName: string) {
  const normalized = senderName.replace(/[：:]/g, '').trim();
  if (!normalized || normalized === '业主' || normalized.endsWith('业主')) {
    return normalized || '业主';
  }
  return `${normalized} 业主`;
}

function formatStoreManagerSenderName(senderName: string) {
  const normalized = senderName.replace(/[：:]/g, '').trim();
  if (!normalized || normalized === '店长' || normalized === '张经理') {
    return '商圈经理';
  }
  return normalized;
}

function beforeColon(content: string) {
  const colonIndex = content.indexOf('：');
  return colonIndex > 0 ? content.slice(0, colonIndex) : '';
}

function getAvatarLabel(senderName: string) {
  return senderName.replace(/[：:]/g, '').slice(0, 1) || '微';
}

function getTimeLabel(fact: WechatFact) {
  if (fact.day <= 1) return '今天';
  return `DAY ${fact.day}`;
}

function getMessageUrgency(fact: WechatFact): WechatMessageUrgency {
  if (fact.priority >= 70 || fact.type === 'owner_urgent' || fact.type === 'manager_push_priority') return 'high';
  if (fact.priority >= 42 || fact.type === 'customer_churn_risk' || fact.type === 'manager_warn_risk') return 'medium';
  return 'low';
}

function getMessageCtaLabel(fact: WechatFact, context: WechatCopyContext) {
  const customerActionLabel = deriveWechatCustomerActionLabel(fact, context);
  if (customerActionLabel) return customerActionLabel;
  if (fact.caseId) {
    const caseItem = context.state.cases.find((entry) => entry.id === fact.caseId);
    const actionLabel = caseItem ? deriveWechatCaseActionLabel(caseItem) : null;
    if (actionLabel) return actionLabel;
    return '安排事项';
  }
  if (fact.type.startsWith('customer_')) return '去跟进客户';
  if (fact.type.startsWith('manager_')) return '去处理';
  if (fact.type === 'matter_pending') return '处理事项';
  return '查看关联对象';
}

function getMessagePrimaryActionId(fact: WechatFact, context: WechatCopyContext) {
  if (!fact.caseId) return undefined;
  const caseItem = context.state.cases.find((entry) => entry.id === fact.caseId);
  if (!caseItem) return undefined;

  const candidateActionIds = resolveWechatActionCandidates(fact, caseItem);
  return candidateActionIds.find((actionId) => getActionAvailability(context.state, caseItem, actionId).enabled);
}

function resolveWechatActionCandidates(fact: WechatFact, caseItem: GameState['cases'][number]) {
  const customerCandidates = resolveWechatCustomerActionCandidates(fact);
  if (customerCandidates.length > 0) {
    return customerCandidates;
  }
  return resolveWechatCaseActionCandidates(caseItem);
}

function resolveWechatCustomerActionCandidates(fact: WechatFact) {
  if (!isCustomerTargetedFact(fact)) {
    return [];
  }
  if (fact.type === 'customer_second_showing') return ['showing', 'sincerity-sale', 'weekly-feedback'];
  if (fact.type === 'customer_comparing') return ['showing', 'sincerity-sale', 'weekly-feedback'];
  if (fact.type === 'customer_price_sensitive') return ['sincerity-sale', 'showing', 'weekly-feedback'];
  if (fact.type === 'customer_churn_risk') return ['showing', 'weekly-feedback'];
  if (fact.type === 'event_followup_needed') return ['showing', 'sincerity-sale', 'weekly-feedback'];
  return ['showing', 'weekly-feedback'];
}

function resolveWechatCaseActionCandidates(caseItem: GameState['cases'][number]) {
  if (caseItem.hasCompletedFirstVisit === false) return ['first-visit'];
  if (caseItem.trust < 58 || caseItem.urgency >= 72) return ['weekly-feedback', 'deep-diagnosis'];
  if (caseItem.askPrice > caseItem.marketPrice * 1.04) return ['pricing-advice', 'ask-psychological-price', 'adjust-listing-price'];
  if (caseItem.heat < 52 || caseItem.d1 < 50) return ['broker-broadcast', 'xiaohongshu-boost', 'private-referral'];
  if (caseItem.viewings <= 0) return ['showing', 'open-day'];
  if (caseItem.offers <= 0) return ['weekly-feedback', 'deep-diagnosis', 'invite-customer-negotiation'];
  return ['invite-customer-negotiation', 'sincerity-sale', 'weekly-feedback'];
}

function deriveWechatCaseActionLabel(caseItem: GameState['cases'][number]) {
  if (caseItem.hasCompletedFirstVisit === false) return '安排面访';
  if (caseItem.trust < 58 || caseItem.urgency >= 72) return '沟通业主';
  if (caseItem.askPrice > caseItem.marketPrice * 1.04) return '谈价格';
  if (caseItem.heat < 52 || caseItem.d1 < 50) return '补客源';
  if (caseItem.viewings <= 0) return '安排带看';
  if (caseItem.offers <= 0) return '跟反馈';
  return '推进成交';
}

function deriveWechatCustomerActionLabel(fact: WechatFact, context: WechatCopyContext) {
  if (!isCustomerTargetedFact(fact)) {
    return null;
  }
  const primaryActionId = getMessagePrimaryActionId(fact, context);
  if (primaryActionId === 'showing') return '安排带看';
  if (primaryActionId === 'sincerity-sale') return '推进诚意';
  if (primaryActionId === 'invite-customer-negotiation') return '约谈价格';
  if (primaryActionId === 'weekly-feedback') return '跟进客户';
  if (fact.type === 'customer_price_sensitive') return '约下一步';
  if (fact.type === 'customer_churn_risk') return '跟进客户';
  return '安排事项';
}

function isCustomerTargetedFact(fact: WechatFact) {
  return fact.senderRole === 'customer'
    || fact.type.startsWith('customer_')
    || Boolean(fact.customerId && fact.opportunityId)
    || Boolean(fact.customerId && fact.type === 'event_followup_needed');
}

function toPreview(content: string, limit: number) {
  return content.length > limit ? `${content.slice(0, limit - 1)}…` : content;
}

function countChineseChars(content: string) {
  return (content.match(/[\u4e00-\u9fff]/g) || []).length;
}
