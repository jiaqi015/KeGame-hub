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
      badge: signal.type === 'buyer_demand' ? '需求' : signal.type === 'seller_intent' ? '业主风向' : '竞品风声',
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
      badge: '竞品在场',
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
  if (layer === 'market') return affectedCount > 0 ? '今天外部变化已经传到这几套房。' : '今天大环境有变化，会先影响客户和带看。';
  if (layer === 'company') return '同公司也在抢客户，会影响你今天能不能分到客。';
  if (layer === 'rival') return affectedCount > 0 ? '竞品已经压到你的房源上。' : '竞品在抢同板块客户。';
  return '这条变化已经落到具体房源。';
}

function buildHistorySummary(actor: string) {
  if (actor.includes('宏观') || actor.includes('市场')) return '外部环境有过变化。';
  if (actor.includes('竞品') || actor.includes('公司')) return '竞争关系有过变化。';
  return '这条变化已经落到具体房源。';
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
      ? `${lead.title} 是今天最先该看的外部变化。`
      : '今天还没有新的市场情报需要单独抬出来。',
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
  if (market.demandHeat >= 70 && market.competitivePressure < 60) return `${market.name} 客户更活跃`;
  if (market.competitivePressure >= 70) return `${market.name} 竞争很挤`;
  if (market.supplyPressure >= 70) return `${market.name} 同类房变多了`;
  if (market.sentiment <= 40) return `${market.name} 客户更观望`;
  return `${market.name} 今天变化不大`;
}

export function buildMarketBoardSummary(market: GameState['markets'][number]) {
  if (market.demandHeat >= 70 && market.competitivePressure < 60) return '这个商圈今天更容易出客户。';
  if (market.competitivePressure >= 70) return '这个商圈今天更容易被竞品分客。';
  if (market.supplyPressure >= 70) return '同类房变多，业主更容易拿你去比较。';
  if (market.sentiment <= 40) return '客户在观望，带看和谈价都会慢一点。';
  return '这个商圈今天没有明显顺风。';
}

export function buildMarketBoardDetail(market: GameState['markets'][number]) {
  return `客户热度${describeBand(market.demandHeat, '低', '一般', '高')}，同板块竞争${describeBand(market.competitivePressure, '低', '一般', '高')}。`;
}

function buildCompanyPressureTitle(companyPressure: GameState['marketShadow']['companyPressure']) {
  if (companyPressure.sharedLeadPressure >= 72) return '同公司在抢同一批客户';
  if (companyPressure.sharedLeadPressure >= 58) return '今天同公司抢客偏紧';
  return '今天同公司抢客不明显';
}

function buildCompanyPressureSummary(companyPressure: GameState['marketShadow']['companyPressure']) {
  if (companyPressure.sharedLeadPressure >= 58) return '会直接影响你今天能不能分到客户。';
  return '今天公司里的分客压力不大。';
}

function buildCompanyPressureDetail(companyPressure: GameState['marketShadow']['companyPressure']) {
  if (companyPressure.focusSlotPressure >= 65 || companyPressure.internalCompetitionHeat >= 65) {
    return '共享客户紧，资源位也在抢。';
  }
  return '今天资源位还算够用。';
}

function buildSignalSummary(signal: GameState['marketShadow']['marketSignals'][number]) {
  if (signal.type === 'buyer_demand') return '这类客户最近在增多。';
  if (signal.type === 'seller_intent') return '这类业主最近更愿意放盘。';
  return '别家已经开始抢这批客户。';
}

function buildSignalDetail(signal: GameState['marketShadow']['marketSignals'][number]) {
  return `${signal.message} ${describeConfidence(signal.confidence)}，大概还会影响 ${signal.expiresInDays} 天。`;
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
