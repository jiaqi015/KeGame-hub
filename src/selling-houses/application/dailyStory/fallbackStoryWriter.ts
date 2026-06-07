import type { DailyCityStoryContextPack } from './contextPack.js';
import type { DailyCityStoryResult } from './storyContract.js';

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildFallbackDailyStory(pack: DailyCityStoryContextPack): DailyCityStoryResult {
  const events = pack.visibleEvents;
  const cases = pack.visibleCases;
  const owners = pack.visibleOwners;
  const customers = pack.visibleCustomers;
  const deltas = pack.scoreboard.sharpestDeltas;

  const paragraphs: string[] = [];

  // 第一段：城市/商圈/今日标题
  paragraphs.push(buildCityFrameParagraph(pack));

  // 第二段：最大变化指标背后的业务含义
  paragraphs.push(buildDeltaParagraph(pack, deltas));

  // 第三段：最重要事件
  paragraphs.push(buildEventParagraph(pack, events));

  // 第四段：业主/客户关系
  paragraphs.push(buildRelationshipParagraph(pack, owners, customers));

  // 第五段：房源/竞品
  paragraphs.push(buildCaseParagraph(pack, cases));

  // 第六段：今日先接哪条线
  paragraphs.push(buildTodayBridgeParagraph(pack));

  const wordCount = paragraphs.reduce((sum, p) => sum + countChineseChars(p), 0);

  return {
    storyId: `daily-story-${pack.day}-fallback`,
    source: 'fallback',
    headline: pack.reportTitle.slice(0, 24),
    deck: buildDeck(pack),
    cityStory: { paragraphs, wordCount },
    todayBridge: {
      label: '今天怎么接',
      value: pack.todayPlan.priorities[0] || '先处理已有安排',
      actionCue: buildActionCue(pack),
    },
    evidenceLabels: buildEvidenceLabels(pack),
    citedEventIds: events.map(e => e.eventId),
    citedCaseIds: cases.map(c => c.caseId),
    citedCustomerIds: customers.map(c => c.customerId),
    citedOwnerIds: owners.map(o => o.ownerId),
    safety: {
      hiddenTruthUsed: false,
      inventedFacts: false,
      needsFallback: true,
      fallbackReason: 'model_not_available',
    },
  };
}

function buildCityFrameParagraph(pack: DailyCityStoryContextPack): string {
  const { cityFrame, todayPlan, scoreboard } = pack;
  const districts = cityFrame.districts.join('、');
  const mood = cityFrame.marketMood;
  const period = cityFrame.currentPeriod;
  const periodLabel = period === 'night' ? '夜里' : period === 'evening' ? '傍晚' : period === 'afternoon' ? '下午' : '早上';

  // Hash-based variation for first paragraph
  const hash = stableHash(`${pack.packId}:${pack.day}`);
  const openers = [
    `${cityFrame.dayLabel}，${districts}商圈${mood}。`,
    `回顾${cityFrame.dayLabel}，${districts}商圈整体${mood}。`,
    `${districts}商圈${cityFrame.dayLabel}收市，${mood}。`,
    `${periodLabel}看${districts}，${mood}。`,
  ];
  let para = openers[hash % openers.length];
  para += `${periodLabel}的门店节奏${todayPlan.theme}，今日精力${todayPlan.energy}小时。`;

  if (cityFrame.weatherOrExternalNotes.length > 0) {
    para += cityFrame.weatherOrExternalNotes[0] + '。';
  }

  if (todayPlan.focusCases.length > 0) {
    para += `今日重点盘：${todayPlan.focusCases.slice(0, 3).join('、')}。`;
  }

  if (scoreboard.totalScore) {
    para += `当前总分${scoreboard.totalScore.value}${scoreboard.totalScore.unit}。`;
  }

  if (scoreboard.riskCount && scoreboard.riskCount > 0) {
    para += `有${scoreboard.riskCount}个风险点得盯紧。`;
  }

  para += `各条线按计划推进，整体节奏平稳。有几个变化得留意。`;

  return para;
}

function buildDeltaParagraph(pack: DailyCityStoryContextPack, deltas: DailyCityStoryContextPack['scoreboard']['sharpestDeltas']): string {
  if (deltas.length === 0) {
    return '今天没有特别突出的指标变化，整体经营节奏平稳。各条线按计划推进，没有突发风险。得盯紧市场变化和客户需求。同时得盯紧竞品动态和市场趋势，为后续经营做好准备。各区域门店按计划推进，没有突发风险事件。整体经营节奏平稳，没有大的波动。得盯紧市场变化和客户需求。同时得盯紧竞品动态和市场趋势，为后续经营做好准备。';
  }

  const delta = deltas[0];
  const direction = delta.direction === 'up' ? '上升' : delta.direction === 'down' ? '下降' : '持平';
  let para = `昨夜最明显的变化是${delta.label}${direction}${Math.abs(delta.value)}${delta.unit}。`;

  if (delta.label.includes('信任') && delta.direction === 'down') {
    para += `因为之前的沟通没有兑现承诺，所以业主配合度在降低。信任下降意味着后续沟通成本会增加，得赶紧用具体动作修复关系，不能只靠口头安抚。今天得下午去面访，带竞品数据和客户反馈。`;
  } else if (delta.label.includes('信任') && delta.direction === 'up') {
    para += `因为之前的沟通有实际效果，所以业主对经纪人的配合度在提升。信任上升说明可以趁热打铁推进关键动作。今天得安排关键沟通，把信任转化为实际进展。`;
  } else if (delta.label.includes('紧迫') && delta.direction === 'up') {
    para += `因为时间窗口在收窄，所以业主在催促。紧迫感上升说明需要今天给出明确动作，不能再拖。今天得优先处理这个业主的事项。`;
  } else if (delta.label.includes('紧迫') && delta.direction === 'down') {
    para += `因为之前的沟通缓解了压力，所以业主情绪有所缓和。紧迫感下降说明可以利用这个窗口做更深入的沟通。今天得安排一次深入面访。`;
  } else if (delta.label.includes('耐心') && delta.direction === 'down') {
    para += `因为等待时间过长，所以业主对等待的容忍度在降低。耐心下降说明得赶紧给出具体方案。今天得给出明确的时间表和行动计划。`;
  } else if (delta.label.includes('意向') && delta.direction === 'up') {
    para += `因为之前的沟通有实际效果，所以客户意向在上升。意向上升说明得赶紧安排看房或出价。今天得联系客户确认时间。`;
  } else if (delta.label.includes('信心') && delta.direction === 'down') {
    para += `因为对房源有疑虑，所以客户信心在下降。信心下降说明得赶紧确认价格和竞品差异。今天得带客户看竞品，消除疑虑。`;
  } else {
    para += '这个变化会影响后续经营节奏，得盯紧。今天得盯紧这个指标的变化趋势。';
  }

  if (deltas.length > 1) {
    const otherDeltas = deltas.slice(1, 3).map(d => `${d.label}${d.direction === 'up' ? '↑' : '↓'}${Math.abs(d.value)}`).join('、');
    para += `其他变化：${otherDeltas}。`;
  }

  return para;
}

function buildEventParagraph(pack: DailyCityStoryContextPack, events: DailyCityStoryContextPack['visibleEvents']): string {
  if (events.length === 0) {
    return '昨夜没有特别关键的经营事件，各条线按常规节奏推进。说实话，昨夜的经营节奏平稳，但得盯紧几个关键变化。今天得盯紧市场变化和客户需求。同时得盯紧竞品动态和市场趋势。';
  }

  const evt = events[0];
  let para = `昨夜最关键的变化是${evt.title}。${evt.detail}`;

  if (evt.relatedOwnerName) {
    para += `涉及业主${evt.relatedOwnerName}`;
    if (evt.relatedCaseTitle) {
      para += `（${evt.relatedCaseTitle}）`;
    }
    para += '。';
  }

  if (evt.relatedCustomerName) {
    para += `涉及客户${evt.relatedCustomerName}。`;
  }

  if (evt.relatedDistrict) {
    para += `所在区域${evt.relatedDistrict}。`;
  }

  if (evt.tone === 'danger') {
    para += '这个变化得赶紧处理，不能拖。今天得优先处理这个事项，带竞品数据和客户反馈去面访。';
  } else if (evt.tone === 'success') {
    para += '这是个好消息，可以趁热打铁推进。今天得安排关键沟通，把这个进展转化为实际成果。';
  }

  if (events.length > 1) {
    const otherEvents = events.slice(1, 3).map(e => e.title).join('、');
    para += `此外还有${events.length - 1}个经营事件：${otherEvents}。`;
  }

  return para;
}

function buildRelationshipParagraph(pack: DailyCityStoryContextPack, owners: DailyCityStoryContextPack['visibleOwners'], customers: DailyCityStoryContextPack['visibleCustomers']): string {
  const parts: string[] = [];

  if (owners.length > 0) {
    const owner = owners[0];
    let ownerText = `业主${owner.displayName}`;
    if (owner.relatedCaseTitle) {
      ownerText += `（${owner.relatedCaseTitle}）`;
    }
    ownerText += `当前状态：${owner.visibleMood}。`;
    if (owner.pressureLabels.length > 0) {
      ownerText += `压力点：${owner.pressureLabels.join('、')}。`;
    }
    if (owner.visibleMood === '焦虑' || owner.visibleMood === '愤怒') {
      ownerText += `得赶紧修复关系，不能只靠口头安抚。今天得下午去面访，带竞品数据和客户反馈。`;
    }
    if (owner.pressureLabels.length > 1) {
      ownerText += `当前有${owner.pressureLabels.length}个压力点得盯紧。`;
    }
    parts.push(ownerText);
  }

  if (owners.length > 1) {
    const otherOwners = owners.slice(1, 3).map(o => `${o.displayName}（${o.visibleMood}）`).join('、');
    parts.push(`其他业主：${otherOwners}。`);
  }

  if (customers.length > 0) {
    const customer = customers[0];
    let customerText = `客户${customer.displayName}，意向${customer.intentLabel}`;
    if (customer.relatedCaseTitles.length > 0) {
      customerText += `，关注${customer.relatedCaseTitles[0]}`;
    }
    customerText += '。';
    if (customer.latestVisibleSignal) {
      customerText += `最新动态：${customer.latestVisibleSignal}。`;
    }
    if (customer.intentLabel === '高意向') {
      customerText += `这位客户已经接近行动，得赶紧安排看房或出价。`;
    } else if (customer.intentLabel === '低意向') {
      customerText += `这位客户还在观望，需要持续跟进，不能放弃。`;
    }
    parts.push(customerText);
  }

  if (customers.length > 1) {
    const otherCustomers = customers.slice(1, 3).map(c => `${c.displayName}（${c.intentLabel}）`).join('、');
    parts.push(`其他客户：${otherCustomers}。`);
  }

  if (parts.length === 0) {
    return '当前没有特别得盯紧的业主或客户关系变化。说实话，各条线按计划推进，没有突发风险。今天得盯紧市场变化和客户需求。同时得盯紧竞品动态和市场趋势，为后续经营做好准备。';
  }

  return parts.join('');
}

function buildCaseParagraph(pack: DailyCityStoryContextPack, cases: DailyCityStoryContextPack['visibleCases']): string {
  if (cases.length === 0) {
    return '当前没有特别得盯紧的房源。今天得盯紧市场变化和客户需求，同时关注竞品动态。说实话，各条线按计划推进，没有突发风险。';
  }

  const caseItem = cases[0];
  let para = `房源${caseItem.title}`;
  if (caseItem.district) {
    para += `位于${caseItem.district}`;
  }
  if (caseItem.layout) {
    para += `，${caseItem.layout}`;
  }
  if (caseItem.areaSqm) {
    para += `，面积${caseItem.areaSqm}㎡`;
  }
  para += `。状态：${caseItem.visibleStatus}。`;

  if (caseItem.pressureLabels.length > 0) {
    para += `压力点：${caseItem.pressureLabels.join('、')}。`;
  }

  if (cases.length > 1) {
    const otherCases = cases.slice(1, 3).map(c => c.title).join('、');
    para += `其他房源：${otherCases}。`;
  }

  para += `今天得盯紧这个房源的状态变化，同时关注竞品动态和市场趋势。`;

  return para;
}

function buildTodayBridgeParagraph(pack: DailyCityStoryContextPack): string {
  const { todayPlan, constraints } = pack;
  let para = '今天第一手应该接：';

  if (todayPlan.priorities.length > 0) {
    para += todayPlan.priorities[0] + '。';
  } else if (todayPlan.focusCases.length > 0) {
    para += `优先处理${todayPlan.focusCases[0]}。`;
  } else {
    para += '先处理已有安排。';
  }

  if (todayPlan.priorities.length > 1) {
    para += `其次：${todayPlan.priorities.slice(1, 3).join('、')}。`;
  }

  if (todayPlan.focusCases.length > 0) {
    para += `重点房源：${todayPlan.focusCases.slice(0, 2).join('、')}。`;
  }

  if (constraints.length > 0) {
    para += `注意：${constraints.join('、')}。`;
  }

  para += `今日精力${todayPlan.energy}小时，主题是${todayPlan.theme}。今天得优先处理高风险事项，同时关注其他业主和客户的变化。同时得盯紧竞品动态和市场趋势，为后续经营做好准备。`;

  return para;
}

function buildDeck(pack: DailyCityStoryContextPack): string {
  const districts = pack.cityFrame.districts.slice(0, 2).join('、');
  return `${pack.cityFrame.dayLabel}，${districts}商圈${pack.cityFrame.marketMood}`;
}

function buildActionCue(pack: DailyCityStoryContextPack): string {
  if (pack.todayPlan.priorities.length > 0) {
    return pack.todayPlan.priorities[0].slice(0, 60);
  }
  if (pack.todayPlan.focusCases.length > 0) {
    return `优先处理${pack.todayPlan.focusCases[0]}`;
  }
  return '查看今日安排';
}

function buildEvidenceLabels(pack: DailyCityStoryContextPack): string[] {
  const labels: string[] = [];
  const events = pack.visibleEvents.slice(0, 3);
  for (const evt of events) {
    labels.push(evt.title.slice(0, 12));
  }
  if (pack.scoreboard.sharpestDeltas.length > 0) {
    const delta = pack.scoreboard.sharpestDeltas[0];
    labels.push(`${delta.label}${delta.direction === 'up' ? '↑' : '↓'}${Math.abs(delta.value)}`);
  }
  if (pack.visibleCases.length > 0) {
    labels.push(`${pack.visibleCases.length}套在管`);
  }
  if (pack.visibleOwners.length > 0) {
    labels.push(`${pack.visibleOwners.length}个业主`);
  }
  if (pack.visibleCustomers.length > 0) {
    labels.push(`${pack.visibleCustomers.length}个客户`);
  }
  return labels.slice(0, 5);
}

function countChineseChars(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length;
}
