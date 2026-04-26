export type VoiceStyle = 'anxious' | 'steady' | 'aggressive';
export type VoiceFocus = 'emotion' | 'logic' | 'urgency';

export interface VoiceProfile {
  style: VoiceStyle;
  focus: VoiceFocus;
}

export interface RelationContext {
  daysSinceLastContact: number;
  trustLevel: 'hostile' | 'neutral' | 'intimate';
}

export type EventType = 
  | 'viewing_declined' 
  | 'price_push' 
  | 'rival_action' 
  | 'macro_change' 
  | 'company_pressure' 
  | 'result_loss' 
  | 'result_win'
  | 'internal_transfer';

export interface EventSkeleton {
  eventType: EventType;
  primaryActor: string; 
  secondaryActor?: string;
  targetHouse?: string;
  concreteFact: string;
}

export function generateFieldCopy(skeleton: EventSkeleton, context: RelationContext, voice: VoiceProfile): string {
  // 1. Resolve Title
  const title = skeleton.primaryActor; // Already specific name
  const secondary = skeleton.secondaryActor ? `跟${skeleton.secondaryActor}` : '';
  const target = skeleton.targetHouse ? `那套【${skeleton.targetHouse}】` : '这单';

  // 2. Prefix based on Voice + Context
  let prefix = '';
  if (voice.style === 'anxious') {
    prefix = context.trustLevel === 'hostile' ? '坏了坏了，' : '哎哟喂，';
  } else if (voice.style === 'steady') {
    prefix = context.daysSinceLastContact > 3 ? '看来晾太久了，' : '刚去摸了下底，';
  } else if (voice.style === 'aggressive') {
    prefix = context.trustLevel === 'intimate' ? '有点意思，' : '胆子够肥啊，';
  }

  // 3. Render Fact
  let factDesc = `${title}${skeleton.concreteFact}`;
  if (voice.focus === 'emotion') {
    factDesc += '，情绪不太对劲';
  } else if (voice.focus === 'logic') {
    factDesc += '，明显是冲着咱们来的';
  } else if (voice.focus === 'urgency') {
    factDesc += '，这事儿不能拖了';
  }

  // 4. Render Push (Actionable intelligence)
  let push = '';
  switch (skeleton.eventType) {
    case 'viewing_declined':
      push = voice.style === 'steady' ? '去探探口风。' : (voice.style === 'aggressive' ? '提点水果登门把面子挣回来。' : '得赶紧打个电话赔个笑脸了！');
      break;
    case 'price_push':
      push = voice.style === 'steady' ? '咱们把账给他算得明明白白。' : (voice.style === 'aggressive' ? '今晚就逼他给个准话。' : '得赶紧把底价准备好兜底！');
      break;
    case 'rival_action':
      push = voice.style === 'steady' ? '防着点别人切客。' : (voice.style === 'aggressive' ? '直接给业主打电话截胡。' : '要是被撬走就全完了！');
      break;
    case 'macro_change':
      push = voice.style === 'steady' ? '大行情这样，咱得守好盘。' : (voice.style === 'aggressive' ? '这波必须抢别人前面的肉。' : '带看量怕是要断崖了。');
      break;
    case 'company_pressure':
      push = voice.style === 'steady' ? '咱们手里的资源得抓紧核实。' : (voice.style === 'aggressive' ? '内部在抢客，咱的号码不能随便交底。' : '再不联系客户，线索就飞别人手里了！');
      break;
    case 'result_win':
      push = voice.style === 'steady' ? '这单落袋为安，后续流程走顺。' : (voice.style === 'aggressive' ? '干得漂亮，趁热打铁再签一单。' : '终于谢天谢地把字签了。');
      break;
    case 'result_loss':
      push = voice.style === 'steady' ? '吃一堑长一智，重点看下一个吧。' : (voice.style === 'aggressive' ? '这仇记下了，下次必须踩着他们签。' : '哎，早知道昨天就再打个电话了。');
      break;
    case 'internal_transfer':
      push = voice.style === 'steady' ? '接手先摸清需求真假。' : (voice.style === 'aggressive' ? '送上门的肉先咬住再说。' : '这客户不好伺候，大家都不愿意接。');
      break;
    default:
      push = '得赶紧想辙。';
  }

  return `${prefix}${target}${secondary}${factDesc}。${push}`;
}
