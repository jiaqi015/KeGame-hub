import { Case, GameState } from '../../domain/models.js';

export type IntelLayerTab = 'macro' | 'district' | 'competition' | 'listing';
export type IntelTone = 'risk' | 'chance' | 'neutral';

export type IntelItem = {
  id: string;
  layer: IntelLayerTab;
  title: string;
  summary: string;
  detail: string;
  tone: IntelTone;
  day: number;
  badge: string;
  affectedCaseIds: string[];
};

export type ImpactedCaseIntel = {
  caseId: string;
  title: string;
  count: number;
  reason: string;
  tone: IntelTone;
  layer: IntelLayerTab;
};

export interface IntelLayerSummaryProjection {
  layer: IntelLayerTab;
  label: string;
  totalCount: number;
  riskCount: number;
  chanceCount: number;
  lead: IntelItem | null;
  summary: string;
}

export interface HomepageIntelProjection {
  lead: IntelItem | null;
  briefs: IntelItem[];
  impactedCases: ImpactedCaseIntel[];
  summary: string;
}

export interface MarketIntelProjection {
  generatedDay: number;
  items: IntelItem[];
  todayCount: number;
  riskCount: number;
  chanceCount: number;
  impactedCases: ImpactedCaseIntel[];
  layers: IntelLayerSummaryProjection[];
  homepage: HomepageIntelProjection;
}

export function buildMarketIntelProjection(state: GameState): MarketIntelProjection {
  const items = collectIntelFeed(state);
  const impactedCases = collectImpactedCases(state, items);

  return {
    generatedDay: state.day,
    todayCount: items.filter((item) => item.day === state.day).length,
    riskCount: items.filter((item) => item.tone === 'risk').length,
    chanceCount: items.filter((item) => item.tone === 'chance').length,
    items,
    impactedCases,
    layers: buildLayerSummaries(items),
    homepage: buildHomepageProjection(items, impactedCases),
  };
}

export function deriveIntelFeed(state: GameState): IntelItem[] {
  return buildMarketIntelProjection(state).items;
}

export function deriveImpactedCases(state: GameState, intel: IntelItem[]): ImpactedCaseIntel[] {
  return collectImpactedCases(state, intel);
}

function collectIntelFeed(state: GameState): IntelItem[] {
  const items: IntelItem[] = [];
  const activeCases = state.cases.filter((item) => item.status === 'active');
  const dailyEvent = state.marketShadow?.dailyMarketEvent;
  const marketSignals = state.marketShadow?.marketSignals || [];
  const rivalListings = state.marketShadow?.rivalListings?.filter((entry) => entry.status === 'active') || [];
  const companyPressure = state.marketShadow?.companyPressure;

  if (dailyEvent) {
    const affectedCaseIds = dailyEvent.targetMarketCellId
      ? activeCases.filter((item) => item.marketCellId === dailyEvent.targetMarketCellId).map((item) => item.id)
      : [];

    items.push({
      id: `daily-${dailyEvent.id}`,
      layer: dailyEvent.layer === 'market'
        ? 'macro'
        : dailyEvent.layer === 'company' || dailyEvent.layer === 'rival'
          ? 'competition'
          : 'listing',
      title: dailyEvent.title,
      summary: buildEventSummary(dailyEvent.layer, affectedCaseIds.length),
      detail: dailyEvent.message,
      tone: dailyEvent.tone === 'danger' ? 'risk' : dailyEvent.tone === 'success' ? 'chance' : 'neutral',
      day: dailyEvent.day,
      badge: '今天',
      affectedCaseIds,
    });
  }

  state.markets.forEach((market) => {
    items.push({
      id: `market-${market.id}`,
      layer: 'district',
      title: buildMarketBoardTitle(market),
      summary: buildMarketBoardSummary(market),
      detail: buildMarketBoardDetail(market),
      tone: market.sentiment >= 65 ? 'chance' : market.competitivePressure >= 65 ? 'risk' : 'neutral',
      day: state.day,
      badge: '商圈底盘',
      affectedCaseIds: activeCases.filter((item) => item.marketCellId === market.id).map((item) => item.id),
    });
  });

  if (companyPressure) {
    items.push({
      id: 'company-pressure',
      layer: 'competition',
      title: buildCompanyPressureTitle(companyPressure),
      summary: buildCompanyPressureSummary(companyPressure),
      detail: buildCompanyPressureDetail(companyPressure),
      tone: companyPressure.sharedLeadPressure >= 58 ? 'risk' : 'neutral',
      day: state.day,
      badge: '资源竞争',
      affectedCaseIds: [],
    });
  }

  marketSignals.forEach((signal) => {
    items.push({
      id: `signal-${signal.id}`,
      layer: signal.type === 'rival_activity' ? 'competition' : 'district',
      title: signal.title,
      summary: buildSignalSummary(signal),
      detail: buildSignalDetail(signal),
      tone: signal.type === 'rival_activity' ? 'risk' : 'chance',
      day: state.day,
      badge: signal.type === 'buyer_demand' ? '需求' : signal.type === 'seller_intent' ? '业主风向' : '同类房动作',
      affectedCaseIds: activeCases.filter((item) => item.district === signal.district).map((item) => item.id),
    });
  });

  rivalListings.slice(0, 8).forEach((listing) => {
    const affectedCaseIds = activeCases
      .filter((item) => item.marketCellId === listing.marketCellId || item.district === listing.district)
      .map((item) => item.id);

    items.push({
      id: `rival-${listing.id}`,
      layer: affectedCaseIds.length > 0 ? 'listing' : 'competition',
      title: `${listing.title} 在抢同类客户`,
      summary: affectedCaseIds.length > 0 ? '已经压到你的房源上了。' : '会分走同板块客户。',
      detail: `${listing.district} · ${listing.segment}，${describeLeadSiphonPower(listing.leadSiphonPower)}，预计还会活跃 ${listing.daysLeft} 天。`,
      tone: listing.leadSiphonPower >= 62 ? 'risk' : 'neutral',
      day: state.day,
      badge: '同类房有动静',
      affectedCaseIds,
    });
  });

  const historyIntel = (state.eventLog || [])
    .filter((entry) => isIntelEvent(entry.actor))
    .slice(0, 12)
    .map((entry, index): IntelItem => ({
      id: `history-${index}-${entry.day}`,
      layer: mapActorToLayer(entry.actor),
      title: trimEventTitle(entry.message),
      summary: buildHistorySummary(entry.actor),
      detail: entry.message,
      tone: entry.tone === 'danger' ? 'risk' : entry.tone === 'success' ? 'chance' : 'neutral',
      day: entry.day,
      badge: entry.actor,
      affectedCaseIds: activeCases
        .filter((item) => entry.message.includes(item.title) || entry.message.includes(item.district))
        .map((item) => item.id),
    }));

  items.push(...historyIntel);

  return dedupeIntel(items).sort((left, right) => {
    const toneDiff = weightTone(right.tone) - weightTone(left.tone);
    if (toneDiff !== 0) return toneDiff;
    return right.day - left.day;
  });
}

export function layerLabel(layer: IntelLayerTab) {
  if (layer === 'macro') return '大环境';
  if (layer === 'district') return '商圈';
  if (layer === 'competition') return '竞争';
  return '单房';
}

export function toneLabel(tone: IntelTone) {
  if (tone === 'risk') return '风险';
  if (tone === 'chance') return '机会';
  return '中性';
}

export function toneBadgeClass(tone: IntelTone) {
  if (tone === 'risk') return 'bg-rose-100 text-rose-600';
  if (tone === 'chance') return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-100 text-slate-500';
}

export function toneDotClass(tone: IntelTone) {
  if (tone === 'risk') return 'bg-rose-500';
  if (tone === 'chance') return 'bg-emerald-500';
  return 'bg-slate-300';
}

function dedupeIntel(items: IntelItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.layer}-${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildEventSummary(layer: string, affectedCount: number) {
  if (layer === 'market') return affectedCount > 0 ? '大环境这波冷风已经吹到这几套房了。' : '大盘风向有变，客户带看量肯定要受影响。';
  if (layer === 'company') return '店里其他组也在盯着这批客，今天派单得靠抢。';
  if (layer === 'rival') return affectedCount > 0 ? '隔壁中介已经把人带到咱们这几套房的同户型了。' : '对街的店在疯狂截胡这片区的客户。';
  return '这事儿已经落到具体这套房上了。';
}

function buildHistorySummary(actor: string) {
  if (actor.includes('宏观') || actor.includes('市场')) return '外部大环境起过风。';
  if (actor.includes('竞品') || actor.includes('公司')) return '同行之前在背后搞过小动作。';
  return '这事儿之前已经落到具体房源上了。';
}

function isIntelEvent(actor: string) {
  return ['宏观', '市场', '商圈动态', '商圈信号', '竞品', '竞品房源', '竞品压制', '竞品联动', '公司资源', '市场竞争', '新房源入场'].some((keyword) => actor.includes(keyword));
}

function mapActorToLayer(actor: string): IntelLayerTab {
  if (actor.includes('宏观') || actor.includes('市场')) return 'macro';
  if (actor.includes('商圈')) return 'district';
  if (actor.includes('竞品') || actor.includes('公司')) return 'competition';
  return 'listing';
}

function trimEventTitle(message: string) {
  const normalized = message.replace(/【|】/g, '').split('，')[0];
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

function weightTone(tone: IntelTone) {
  if (tone === 'risk') return 3;
  if (tone === 'chance') return 2;
  return 1;
}

function collectImpactedCases(state: GameState, intel: IntelItem[]): ImpactedCaseIntel[] {
  return state.cases
    .filter((item) => item.status === 'active')
    .map((item) => {
      const related = intel
        .filter((entry) => entry.affectedCaseIds.includes(item.id))
        .sort((left, right) => weightTone(right.tone) - weightTone(left.tone));
      const directImpact = related
        .filter((entry) => entry.tone === 'risk' || entry.layer === 'listing')
        .sort((left, right) => {
          const toneDiff = weightTone(right.tone) - weightTone(left.tone);
          if (toneDiff !== 0) return toneDiff;
          return right.layer === 'listing' ? 1 : -1;
        });
      const lead = directImpact[0];
      return {
        caseId: item.id,
        title: item.title,
        count: directImpact.length,
        reason: lead?.summary || lead?.title || '今天暂时没被外部变化打到',
        tone: lead?.tone || 'neutral',
        layer: lead?.layer || 'listing',
      };
    })
    .filter((item) => item.count > 0)
    .sort((left, right) => {
      const toneDiff = weightTone(right.tone) - weightTone(left.tone);
      if (toneDiff !== 0) return toneDiff;
      return right.count - left.count;
    });
}

function buildLayerSummaries(items: IntelItem[]): IntelLayerSummaryProjection[] {
  const orderedLayers: IntelLayerTab[] = ['macro', 'district', 'competition', 'listing'];

  return orderedLayers.map((layer) => {
    const layerItems = items.filter((item) => item.layer === layer);
    const riskCount = layerItems.filter((item) => item.tone === 'risk').length;
    const chanceCount = layerItems.filter((item) => item.tone === 'chance').length;
    const lead = layerItems[0] || null;

    return {
      layer,
      label: layerLabel(layer),
      totalCount: layerItems.length,
      riskCount,
      chanceCount,
      lead,
      summary: buildLayerSummary(layer, layerItems, riskCount, chanceCount),
    };
  });
}

function buildHomepageProjection(items: IntelItem[], impactedCases: ImpactedCaseIntel[]): HomepageIntelProjection {
  const lead = items[0] || null;
  const briefs = items.slice(1, 3);

  return {
    lead,
    briefs,
    impactedCases: impactedCases.slice(0, 3),
    summary: lead
      ? `商圈经理提个醒：${lead.title} 这事最紧迫，别拖。`
      : '今天外面没啥大动静，按原计划跑就行。',
  };
}

function buildLayerSummary(
  layer: IntelLayerTab,
  items: IntelItem[],
  riskCount: number,
  chanceCount: number,
) {
  if (items.length === 0) {
    return `${layerLabel(layer)}今天还没有新增情报。`;
  }

  if (riskCount > 0 && chanceCount > 0) {
    return `${layerLabel(layer)}同时有风险和机会，最靠前那条更重要。`;
  }

  if (riskCount > 0) {
    return `${layerLabel(layer)}当前以风险变化为主。`;
  }

  if (chanceCount > 0) {
    return `${layerLabel(layer)}当前有可以借的顺风。`;
  }

  return `${layerLabel(layer)}今天变化不大，但有 ${items.length} 条需要扫一眼。`;
}

export function buildMarketBoardTitle(market: GameState['markets'][number]) {
  if (market.demandHeat >= 70 && market.competitivePressure < 60) return `${market.name} 今天看房的人明显多了`;
  if (market.competitivePressure >= 70) return `${market.name} 各家都在这儿扎堆抢人`;
  if (market.supplyPressure >= 70) return `${market.name} 业主扎堆往外放同户型`;
  if (market.sentiment <= 40) return `${market.name} 客户光看不买，都在观望`;
  return `${market.name} 没啥动静，平稳期`;
}

export function buildMarketBoardSummary(market: GameState['markets'][number]) {
  if (market.demandHeat >= 70 && market.competitivePressure < 60) return '客户活跃度上来了，今天是个推盘的好机会。';
  if (market.competitivePressure >= 70) return '同行带看都挤在这块，稍不注意就被切客。';
  if (market.supplyPressure >= 70) return '挂牌出来的同户型太多，业主容易拿咱们当备胎比价。';
  if (market.sentiment <= 40) return '客户都在等政策落地，不敢轻易出手，流程会拉得很长。';
  return '这片区今天风平浪静，没有明显利好。';
}

export function buildMarketBoardDetail(market: GameState['markets'][number]) {
  return `客户热度${describeBand(market.demandHeat, '低', '一般', '高')}，同板块竞争${describeBand(market.competitivePressure, '低', '一般', '高')}。`;
}

function buildCompanyPressureTitle(companyPressure: GameState['marketShadow']['companyPressure']) {
  if (companyPressure.sharedLeadPressure >= 72) return '店里好几个组在死磕同一批客户';
  if (companyPressure.sharedLeadPressure >= 58) return '今天店里分客的火药味有点重';
  return '今天客源竞争不强';
}

function buildCompanyPressureSummary(companyPressure: GameState['marketShadow']['companyPressure']) {
  if (companyPressure.sharedLeadPressure >= 58) return '手头的号码捂紧点，稍微动作慢点客就被转走了。';
  return '客源池还算宽松，正常跟进即可。';
}

function buildCompanyPressureDetail(companyPressure: GameState['marketShadow']['companyPressure']) {
  if (companyPressure.focusSlotPressure >= 65 || companyPressure.internalCompetitionHeat >= 65) {
    return '共享客户紧，带看和排位都在抢。';
  }
  return '推广和带看资源都够用，按计划推进。';
}

function buildSignalSummary(signal: GameState['marketShadow']['marketSignals'][number]) {
  if (signal.type === 'buyer_demand') return '最近来问房的客户肉眼可见地变多了。';
  if (signal.type === 'seller_intent') return '最近业主们都在打听行情，准备往外抛盘。';
  return '隔壁中介已经开始下场抢这批客户了。';
}

function buildSignalDetail(signal: GameState['marketShadow']['marketSignals'][number]) {
  return `${signal.message} ${describeConfidence(signal.confidence)}，这股风估计还能刮 ${signal.expiresInDays} 天。`;
}

function describeBand(value: number, low: string, mid: string, high: string) {
  if (value >= 70) return high;
  if (value >= 45) return mid;
  return low;
}

function describeConfidence(confidence: number) {
  if (confidence >= 80) return '把握很高';
  if (confidence >= 60) return '把握较高';
  return '还要继续观察';
}

export function describeLeadSiphonPower(value: number) {
  if (value >= 75) return '抢客很强';
  if (value >= 55) return '抢客明显';
  return '抢客一般';
}

export function resolveAffectedCases(state: GameState, caseIds: string[], limit = 3): Case[] {
  return caseIds
    .map((caseId) => state.cases.find((entry) => entry.id === caseId))
    .filter((entry): entry is Case => Boolean(entry))
    .slice(0, limit);
}
