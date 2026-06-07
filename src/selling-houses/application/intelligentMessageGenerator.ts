import type { WechatFact } from './projections/myWechatTypes.js';
import type { GameState } from '../domain/models.js';

interface MessageContext {
  ownerName: string;
  customerName: string;
  caseTitle: string;
  community: string;
  district: string;
  trust: number;
  patience: number;
  urgency: number;
  askPrice: number;
  marketPrice: number;
  priceGapPct: number;
  personality: 'pragmatic' | 'emotional' | 'urgent';
}

export function generateInitialMessage(
  fact: WechatFact,
  state: GameState,
  seed?: string,
): string {
  const ctx = buildMessageContext(fact, state);
  const effectiveSeed = seed || `${state.runId}:${state.day}:${fact.type}:${fact.caseId}:${fact.opportunityId}`;

  switch (fact.type) {
    case 'owner_no_showing':
      return generateOwnerNoShowing(ctx, effectiveSeed);
    case 'owner_price_doubt':
      return generateOwnerPriceDoubt(ctx, effectiveSeed);
    case 'owner_urgent':
      return generateOwnerUrgent(ctx, effectiveSeed);
    case 'owner_long_time_no_touch':
      return generateOwnerLongTimeNoTouch(ctx, effectiveSeed);
    case 'owner_trust_drop':
      return generateOwnerTrustDrop(ctx, effectiveSeed);
    case 'customer_comparing':
      return generateCustomerComparing(ctx, effectiveSeed);
    case 'customer_price_sensitive':
      return generateCustomerPriceSensitive(ctx, effectiveSeed);
    case 'customer_second_showing':
      return generateCustomerSecondShowing(ctx, effectiveSeed);
    case 'customer_churn_risk':
      return generateCustomerChurnRisk(ctx, effectiveSeed);
    default:
      return generateDefault(ctx, effectiveSeed);
  }
}

function buildMessageContext(fact: WechatFact, state: GameState): MessageContext {
  const caseItem = fact.caseId ? state.cases.find(c => c.id === fact.caseId) : undefined;
  return {
    ownerName: fact.ownerName || fact.senderName || '业主',
    customerName: fact.customerName || fact.senderName || '客户',
    caseTitle: fact.caseTitle || caseItem?.title || '这套房',
    community: fact.community || caseItem?.community || '小区',
    district: fact.district || caseItem?.district || '商圈',
    trust: caseItem?.trust ?? 50,
    patience: caseItem?.patience ?? 50,
    urgency: caseItem?.urgency ?? 50,
    askPrice: caseItem?.askPrice ?? 0,
    marketPrice: caseItem?.marketPrice ?? 0,
    priceGapPct: caseItem?.priceGapPct ?? 0,
    personality: caseItem?.personality || 'pragmatic',
  };
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick<T>(items: readonly T[], seed: string): T {
  return items[stableHash(seed) % items.length];
}

// === Owner message generators ===

function generateOwnerNoShowing(ctx: MessageContext, seed: string): string {
  const templates = getOwnerNoShowingTemplates(ctx);
  return fillSmart(pick(templates, seed), ctx);
}

function getOwnerNoShowingTemplates(ctx: MessageContext): string[] {
  const base = [
    '{ownerName}：最近看房的人不多，{community}这边是不是竞品太多了？你帮我分析下。',
    '{ownerName}：这几天没什么动静，我有点没底。{caseTitle}到底有没有人在关注？',
    '{ownerName}：之前说会有反馈，这两天又安静了。你今天能不能帮我看看真实情况？',
  ];

  if (ctx.urgency >= 70) {
    return [
      ...base,
      '{ownerName}：我时间真的不多了，{caseTitle}到底什么时候能有动静？你今天给我一个说法。',
      '{ownerName}：家里人一直问，我都不知道怎么说了。你帮我看看是不是价格问题。',
    ];
  }

  if (ctx.trust < 35) {
    return [
      ...base,
      '{ownerName}：我不是不信你，但{community}这边竞品那么多，我需要你给我一个真实的判断。',
      '{ownerName}：你之前说会有人看，结果一个都没有。你今天先把情况给我讲清楚。',
    ];
  }

  if (ctx.patience < 30) {
    return [
      ...base,
      '{ownerName}：我已经等了很久了，{caseTitle}不能一直这么挂着。你今天必须给我一个方案。',
      '{ownerName}：我不想再等了，你告诉我到底是继续等还是该动一动。',
    ];
  }

  return base;
}

function generateOwnerPriceDoubt(ctx: MessageContext, seed: string): string {
  const templates = [
    '{ownerName}：你跟我说实话，{caseTitle}这个价格到底有没有机会？我也好跟家里人有个交代。',
    '{ownerName}：如果还是这个反馈，我们是不是得重新想想价格？我不想一直空挂着。',
    '{ownerName}：{community}隔壁那套是不是价格低一些？如果客户都拿它比，我们这边要不要提前准备一下？',
  ];

  if (ctx.priceGapPct > 15) {
    templates.push(
      '{ownerName}：{caseTitle}挂价比市场高不少，你告诉我到底差多少，我好做决定。',
      '{ownerName}：我听说{community}最近成交价都不高，你帮我看看真实数据。',
    );
  }

  return fillSmart(pick(templates, seed), ctx);
}

function generateOwnerUrgent(ctx: MessageContext, seed: string): string {
  const templates = [
    '{ownerName}：我这边时间真的不多了，今天能不能给个明确方案，别只是说再等等。',
    '{ownerName}：家里那边一直催我定下来，你今天给我一个判断吧，是继续等还是要动一动。',
    '{ownerName}：如果这周还没有实质进展，我可能得考虑别的安排了，你先跟我说下计划。',
  ];

  if (ctx.patience < 20) {
    templates.push(
      '{ownerName}：我已经没有耐心了，{caseTitle}今天必须有进展。你告诉我怎么做。',
      '{ownerName}：我不想再拖了，你今天给我一个明确的时间表。',
    );
  }

  return fillSmart(pick(templates, seed), ctx);
}

function generateOwnerLongTimeNoTouch(ctx: MessageContext, seed: string): string {
  const templates = [
    '{ownerName}：你这两天是不是比较忙？{caseTitle}现在到底什么情况，能不能同步一下。',
    '{ownerName}：我这边一直没收到新反馈，有点拿不准。你今天方便帮我捋一下吗？',
    '{ownerName}：最近客户那边还有没有声音？如果没动静，我们是不是得换个办法。',
  ];

  if (ctx.trust < 40) {
    templates.push(
      '{ownerName}：我有点担心{caseTitle}的情况，你是不是把我这套忘了？',
      '{ownerName}：好久没联系了，{community}这边市场怎么样？你帮我看看。',
    );
  }

  return fillSmart(pick(templates, seed), ctx);
}

function generateOwnerTrustDrop(ctx: MessageContext, seed: string): string {
  const templates = [
    '{ownerName}：我不是不配合，但这两天听到的反馈有点散。你今天先把客户和竞品情况给我讲清楚。',
    '{ownerName}：我现在最怕一直听不到准话。你帮我把真实情况和下一步安排说具体一点。',
    '{ownerName}：如果客户都在犹豫，我也想知道原因。你今天别只说还在推，给我一个判断。',
  ];

  if (ctx.trust < 25) {
    templates.push(
      '{ownerName}：我现在真的很怀疑，{caseTitle}到底有没有在认真推？你给我看证据。',
      '{ownerName}：你之前说的和实际有出入，我需要你今天给我一个真实的反馈。',
    );
  }

  return fillSmart(pick(templates, seed), ctx);
}

// === Customer message generators ===

function generateCustomerComparing(ctx: MessageContext, seed: string): string {
  const templates = [
    '{customerName}：我昨天又看了一套同小区两居，装修确实新一点。{caseTitle}如果价格没空间，我还得再想想。',
    '{customerName}：这套我不是不喜欢，就是同价位还有几套能比。你帮我说清楚它真正强在哪。',
    '{customerName}：我家里人觉得另一套也可以，主要是装修省心一点。{caseTitle}还有什么优势我想再听听。',
  ];

  if (ctx.urgency >= 60) {
    templates.push(
      '{customerName}：我看的那套业主急着卖，价格很诱人。{caseTitle}这边能不能给我一个明确答复？',
      '{customerName}：我比较了几套，{community}这个价位选择挺多的。你帮我分析下{caseTitle}的竞争力。',
    );
  }

  return fillSmart(pick(templates, seed), ctx);
}

function generateCustomerPriceSensitive(ctx: MessageContext, seed: string): string {
  const templates = [
    '{customerName}：这套我还没完全放弃，主要是预算有点卡。你帮我再确认下业主预期。',
    '{customerName}：位置我能接受，就是总价压力有点大。业主那边如果一点空间没有，我可能就先放放。',
    '{customerName}：如果能谈到我预算附近，我愿意再认真看一次。你先帮我摸一下业主态度。',
  ];

  return fillSmart(pick(templates, seed), ctx);
}

function generateCustomerSecondShowing(ctx: MessageContext, seed: string): string {
  const templates = [
    '{customerName}：如果这周能约二看，我可以再带家里人看看，但价格这块最好先有个判断。',
    '{customerName}：我对这套还有兴趣，想再看一次细节。你帮我确认下业主那边有没有时间。',
    '{customerName}：我想带家里人再看看采光和楼层，价格如果能聊，我们就认真推进。',
  ];

  return fillSmart(pick(templates, seed), ctx);
}

function generateCustomerChurnRisk(ctx: MessageContext, seed: string): string {
  const templates = [
    '{customerName}：我这两天又看了两套，感觉选择还挺多的。{caseTitle}的优势得再帮我讲清楚。',
    '{customerName}：我先不急着定，最近看的房子有点多。{caseTitle}如果有新反馈再告诉我。',
    '{customerName}：我现在有点犹豫，主要是价格和装修都要再比比。你别太晚给我反馈。',
  ];

  return fillSmart(pick(templates, seed), ctx);
}

function generateDefault(ctx: MessageContext, seed: string): string {
  const name = ctx.customerName !== '客户' ? ctx.customerName : ctx.ownerName;
  const templates = [
    '{name}：{caseTitle}最近怎么样？有什么新情况吗？',
    '{name}：你帮我看看{community}这边的市场变化，我需要一个判断。',
  ];
  return fillSmart(pick(templates, seed), { ...ctx, ownerName: name });
}

// === Smart fill ===

function fillSmart(template: string, ctx: MessageContext): string {
  return template
    .replaceAll('{ownerName}', ctx.ownerName)
    .replaceAll('{customerName}', ctx.customerName)
    .replaceAll('{caseTitle}', ctx.caseTitle)
    .replaceAll('{community}', ctx.community)
    .replaceAll('{district}', ctx.district)
    .replace(/\s+/g, ' ')
    .trim();
}
