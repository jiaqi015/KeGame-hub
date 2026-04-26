import type { GameState, DomainEventEntry, Expectation, ForeshadowingHook, DailyNarrative } from '../models.js';
import { chance } from '../utils.js';

type DailyNarrativeContext = Pick<GameState, 'day' | 'rngState' | 'rngCalls'>;

function getEventEIF(event: DomainEventEntry): number {
  // 根据 tone 和 kind 粗略计算情绪冲击系数
  if (event.tone === 'danger' || event.tone === 'success') {
    return event.kind === 'case_sold' || event.kind === 'case_lost_to_rival' ? 100 : 50;
  }
  return 10;
}

export function updateTopicHistory(state: GameState, usedEvents: string[]): void {
  if (!state.topicHistory) {
    state.topicHistory = [];
  }
  
  const events = state.eventLog.filter(e => usedEvents.includes(e.actor)); // 简化的对应关系
  // 此处略去复杂记录逻辑，仅做示意
}

export function generateDailyNarrative(params: {
  events: DomainEventEntry[];
  expectations: Expectation[];
  resolvedHooks: ForeshadowingHook[];
  state: DailyNarrativeContext;
}): DailyNarrative {
  const { events, expectations, resolvedHooks, state } = params;

  let openingHook = '';
  let midTwist = '';
  let lateUndercurrent = '';
  let tomorrowHook = '';
  let eventsUsed: string[] = [];

  // 1. 回应悬念 (Expectation Match)
  const expectedEvent = events.find(e => expectations.some(exp => exp.targetEntityId === e.caseId || exp.targetEntityId === e.customerId));
  if (expectedEvent) {
    openingHook = `你昨日的核心动作有了回音：${expectedEvent.title}。`;
    eventsUsed.push(expectedEvent.id);
  }

  // 2. 最大冲击 (Highest EIF)
  const remainingEvents = events.filter(e => !eventsUsed.includes(e.id));
  const sortedByEIF = [...remainingEvents].sort((a, b) => getEventEIF(b) - getEventEIF(a));
  
  const surpriseEvent = sortedByEIF[0];
  if (surpriseEvent && getEventEIF(surpriseEvent) >= 50) {
    midTwist = `但出乎意料的是，${surpriseEvent.title}——${surpriseEvent.detail}。`;
    eventsUsed.push(surpriseEvent.id);
  } else if (resolvedHooks.length > 0) {
    midTwist = `昨日的隐患终于爆发：${resolvedHooks[0].description}。`;
  }

  // 3. 暗流 (Lowest EIF / Background)
  const backgroundEvent = sortedByEIF[sortedByEIF.length - 1];
  if (backgroundEvent && !eventsUsed.includes(backgroundEvent.id)) {
    lateUndercurrent = `此外，市场角落里发生了一件小事：${backgroundEvent.title}。`;
    eventsUsed.push(backgroundEvent.id);
  }

  // 4. 明日钩子 (Foreshadowing)
  let newHooks: string[] = [];
  if (events.length > 0 && chance(0.5, state)) {
    tomorrowHook = `注意：有一套竞品房源似乎正在酝酿动作，也许明天会有变数。`;
    newHooks.push('competitor_price_drop');
  }

  // 5. 沉默压迫感兜底
  if (events.length === 0) {
    const silenceExp = expectations.find(e => e.expectedAction === 'owner_response');
    if (silenceExp) {
      openingHook = `整个市场今天像被冻住了一样。你等待的回音，直到今晚 11 点依然是一个孤零零的『已读』。没有回复本身就是激烈的态度，时间正在带走最后的耐心。`;
    } else {
      openingHook = `今天市场风平浪静，但对于销售来说，没有坏消息往往就是坏消息的开始。`;
    }
  }

  const textBlocks = [openingHook, midTwist, lateUndercurrent, tomorrowHook].filter(Boolean);
  const text = textBlocks.join('\n\n');

  return {
    day: state.day,
    openingHook,
    midTwist,
    lateUndercurrent,
    tomorrowHook,
    text,
    eventsUsed,
    newHooks
  };
}
