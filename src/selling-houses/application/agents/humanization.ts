import type { ConversationContext } from '../../core/world-state/conversation/models';

const EMOTIONAL_EXPRESSIONS: Record<string, string | string[]> = {
  frustrated: ['唉，', '真是愁人，', '我跟你说啊，', '说实话，'],
  anxious: ['我真的很着急，', '我现在最怕拖，', '你懂的，'],
  angry: '我真是无语了，',
  hopeful: '哈哈，终于有消息了，',
  calm: '',
};

const PERSONALITY_QUIRKS: Record<string, string[]> = {
  '强势型': ['我跟你说啊，', '你给我听好了，', '别跟我扯这些，'],
  '焦虑型': ['我真的很着急，', '我现在最怕拖，', '你懂的，'],
  '理性型': ['说实话，', '你看着办吧，', '我相信你的判断，'],
  'default': ['嗯，', '那个，', '对了，'],
};

const SMALL_TALK = {
  opener: ['最近忙吗？', '今天天气不错。', '上次那个客户怎么样了？', '你最近怎么样？'],
  closer: ['辛苦了。', '麻烦你了。', '有消息随时联系。', '先这样，回头聊。'],
};

export function applyHumanization(reply: string, ctx: ConversationContext): string {
  if (ctx.emotionalState === 'calm') return reply;

  const expressions = EMOTIONAL_EXPRESSIONS[ctx.emotionalState];
  if (!expressions || (Array.isArray(expressions) && expressions.length === 0)) return reply;

  const expression = Array.isArray(expressions)
    ? expressions[Math.floor(hashString(ctx.playerText) % expressions.length)]
    : expressions;

  return `${expression}${reply}`;
}

export function applyEmotionalVariant(reply: string, ctx: ConversationContext): string {
  const variants = getEmotionalVariants(ctx);
  if (!variants) return reply;

  const index = hashString(ctx.playerText) % variants.length;
  return variants[index];
}

function getEmotionalVariants(ctx: ConversationContext): string[] | null {
  const { senderName, caseRef, emotionalState, isAssertive, isAnxious } = ctx;

  if (emotionalState === 'frustrated') {
    return [
      `${senderName}：唉，你这么说太笼统了，${caseRef}现在需要具体方案，不是安慰。`,
      `${senderName}：真是愁人，${caseRef}的情况你得给我一个明确判断。`,
      `${senderName}：我跟你说啊，${caseRef}我现在最怕一直拖，你今天要给我一个明确动作。`,
    ];
  }

  if (emotionalState === 'anxious') {
    return [
      `${senderName}：我真的很着急，${caseRef}你今天要给我一个明确判断。`,
      `${senderName}：我现在最怕拖，${caseRef}你今天要给我一个明确动作。`,
      `${senderName}：你懂的，${caseRef}我现在最怕一直拖，你今天要给我一个明确判断。`,
    ];
  }

  if (emotionalState === 'hopeful') {
    return [
      `${senderName}：哈哈，终于有消息了，${caseRef}你继续推进。`,
      `${senderName}：好，${caseRef}你继续推进，我等你消息。`,
      `${senderName}：不错，${caseRef}你继续推进，我等你消息。`,
    ];
  }

  return null;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
