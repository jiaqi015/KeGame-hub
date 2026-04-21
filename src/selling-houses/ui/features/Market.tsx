import React, { useEffect, useMemo, useState } from 'react';
import type { GameState } from '../../domain/models';
import {
  buildMarketProjection,
  type ProjectionBrief,
  type ProjectionTone,
} from '../../application/projections/operatingProjection.js';
import {
  deriveImpactedCases,
  deriveIntelFeed,
  layerLabel,
  type IntelItem,
  type IntelLayerTab,
} from './marketIntel';
import {
  Globe2,
  Radar,
  Store,
  Target,
  Users,
} from 'lucide-react';

interface MarketProps {
  state: GameState;
  initialLayer?: IntelLayerTab;
  onSelectCase?: (id: string) => void;
  onOpenCases?: () => void;
}

type MarketPanelTab = 'radar' | 'trend' | 'competition';

type LayerCard = {
  id: IntelLayerTab;
  label: string;
  count: number;
  title: string;
  detail: string;
};

const PANEL_TABS: Array<{
  id: MarketPanelTab;
  label: string;
}> = [
  { id: 'radar', label: '雷达' },
  { id: 'trend', label: '行情' },
  { id: 'competition', label: '竞对' },
];

const LAYER_FALLBACKS: Record<IntelLayerTab, Pick<LayerCard, 'label' | 'title' | 'detail'>> = {
  macro: {
    label: '全城',
    title: '全城先变什么',
    detail: '今天全城层面没有新的强信号，先盯板块和竞品。',
  },
  district: {
    label: '板块',
    title: '板块先热还是先冷',
    detail: '商圈热度和竞争位置先决定客户会不会出来。',
  },
  competition: {
    label: '竞争',
    title: '同行今天怎么抢',
    detail: '先看竞店、竞品和同 ACN 资源位有没有抬头。',
  },
  listing: {
    label: '房源',
    title: '最后压到哪套房',
    detail: '外部变化最后会落到具体房源的比较和推进上。',
  },
};

export function Market({
  state,
  initialLayer = 'macro',
  onSelectCase,
  onOpenCases,
}: MarketProps) {
  const [activeLayer, setActiveLayer] = useState<IntelLayerTab>(initialLayer);
  const [activePanel, setActivePanel] = useState<MarketPanelTab>('radar');
  const projection = useMemo(() => buildMarketProjection(state), [state]);
  const intel = useMemo(() => deriveIntelFeed(state), [state]);
  const impactedCases = useMemo(() => deriveImpactedCases(state, intel), [intel, state]);

  const layerCards = useMemo<LayerCard[]>(() => (
    (['macro', 'district', 'competition', 'listing'] as IntelLayerTab[]).map((layer) => {
      const items = intel.filter((item) => item.layer === layer);
      const fallback = LAYER_FALLBACKS[layer];
      return {
        id: layer,
        label: fallback.label,
        count: items.length,
        title: items[0]?.title || fallback.title,
        detail: items[0]?.summary || items[0]?.detail || fallback.detail,
      };
    })
  ), [intel]);

  const effectiveLayer = layerCards.find((item) => item.id === activeLayer && item.count > 0)?.id
    || layerCards.find((item) => item.count > 0)?.id
    || activeLayer;

  const activeLayerIntel = useMemo(
    () => intel.filter((item) => item.layer === activeLayer),
    [activeLayer, intel],
  );
  const activeLayerRisk = activeLayerIntel.find((item) => item.tone === 'risk') || null;
  const activeLayerChance = activeLayerIntel.find((item) => item.tone === 'chance') || null;
  const currentLayerCard = layerCards.find((item) => item.id === activeLayer) || layerCards[0];
  const currentLayerImpactedCase = impactedCases.find((item) => item.layer === activeLayer) || null;
  const leadImpactedCase = currentLayerImpactedCase || impactedCases[0] || null;
  const hottestBoard = projection.districtBoards[0] || null;
  const radarCards = projection.radarCards.slice(0, 3);
  const heroSummary = useMemo(() => buildHeroSummary(state), [state]);
  const actionLine = useMemo(
    () => buildActionLine({
      radarAxes: projection.radarAxes,
      leadRisk: activeLayerRisk,
      leadCase: leadImpactedCase,
      activeLayerLabel: currentLayerCard?.label || '',
    }),
    [activeLayerRisk, currentLayerCard?.label, leadImpactedCase, projection.radarAxes],
  );

  useEffect(() => {
    setActiveLayer(initialLayer);
  }, [initialLayer]);

  useEffect(() => {
    if (effectiveLayer !== activeLayer) {
      setActiveLayer(effectiveLayer);
    }
  }, [activeLayer, effectiveLayer]);

  const openCase = (caseId?: string) => {
    if (!caseId) return;
    onSelectCase?.(caseId);
    onOpenCases?.();
  };

  return (
    <div className="space-y-4">
      <section className="seller-workbench-dark overflow-hidden px-5 py-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start">
          <div className="min-w-0">
            <div className="seller-label flex items-center gap-2">
              <Globe2 size={13} />
              市场
            </div>
            <h1 className="mt-2 text-[24px] font-semibold leading-[1.14] tracking-[-0.035em] text-[var(--seller-ink)] md:text-[28px]">
              {projection.headline}
            </h1>
            <p className="mt-3 max-w-[72ch] text-[12px] leading-7 text-[var(--seller-muted)]">
              {heroSummary}
            </p>
            <div className="mt-4 text-[11px] font-medium text-[var(--seller-subtle)]">
              先看外部变化，再回到具体房源。
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <HeaderStat label="今日新增情报" value={`${projection.intelSummary.todayCount}`} tone="neutral" />
            <HeaderStat label="优先处理风险" value={`${projection.intelSummary.riskCount}`} tone="risk" />
            <HeaderStat label="可跟进机会" value={`${projection.intelSummary.chanceCount}`} tone="chance" />
            <HeaderStat label="已影响房源" value={`${impactedCases.length}`} tone="warm" />
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <HeroStoryCard
            label="今日判断"
            title={buildRadarJudgement(projection.radarAxes)}
            detail={actionLine}
            tone="neutral"
          />
          <HeroStoryCard
            label="重点板块"
            title={activeLayerChance?.title || hottestBoard?.title || hottestBoard?.name || '先看商圈底盘'}
            detail={activeLayerChance?.detail || hottestBoard?.summary || '今天先看更容易出客户的板块。'}
            tone={activeLayerChance ? 'chance' : hottestBoard?.tone || 'neutral'}
          />
          <HeroStoryCard
            label="先稳房源"
            title={leadImpactedCase ? `${leadImpactedCase.title} 优先受压` : '暂时没有单套房被外部集中打到'}
            detail={leadImpactedCase
              ? `${leadImpactedCase.reason} 今天被命中 ${leadImpactedCase.count} 次。`
              : '今天更多是在商圈和竞争层面变化，先按当前重点房源推进。'}
            tone={leadImpactedCase ? leadImpactedCase.tone : 'neutral'}
          />
        </div>
      </section>

      <section className="seller-panel overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-[var(--seller-border)] px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="seller-label">变化怎么传下来</div>
            <div className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
              先看哪一层先动，再回到受影响房源。
            </div>
          </div>
          <div className="text-[11px] font-medium text-[var(--seller-subtle)]">
            当前重点在 {currentLayerCard.label} 这一层
          </div>
        </div>

        <div className="grid gap-3 px-5 py-4 lg:grid-cols-4">
          {layerCards.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveLayer(step.id)}
              className={`rounded-[14px] border px-4 py-4 text-left transition ${
                step.id === activeLayer
                  ? 'border-[color-mix(in_srgb,var(--seller-accent)_55%,var(--seller-border)_45%)] bg-[rgba(21,31,43,0.84)]'
                  : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] hover:border-[var(--seller-border-strong)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold tracking-[0.04em] text-[var(--seller-subtle)]">{step.label}</div>
                <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[10px] font-semibold text-[var(--seller-muted)]">
                  {step.count} 条
                </span>
              </div>
              <div className="mt-3 text-[15px] font-semibold leading-6 tracking-[-0.03em] text-[var(--seller-ink)]">
                {step.title}
              </div>
              <div className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
                {step.detail}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_332px]">
        <section className="seller-panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[var(--seller-border)] px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="seller-label flex items-center gap-2">
                <Radar size={13} />
                先看哪层最该看
              </div>
              <div className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
                全城、板块、竞争、房源拆开看，更容易找到最需要跟的信号。
              </div>
            </div>
            <div className="seller-tabbar">
              {PANEL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePanel(tab.id)}
                  className={`seller-tab ${activePanel === tab.id ? 'seller-tab-active' : ''}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-5 py-4">
            {activePanel === 'radar' ? (
              <div className="grid gap-3 md:grid-cols-3">
                {radarCards.map((card) => (
                  <RadarMetricCard
                    key={card.id}
                    label={card.label}
                    value={card.value}
                    detail={card.summary}
                    tone={card.tone}
                  />
                ))}
              </div>
            ) : null}

            {activePanel === 'trend' ? (
              <div className="grid gap-3 md:grid-cols-3">
                {projection.districtBoards.slice(0, 3).map((board) => (
                  <TrendBoardCard key={board.marketId} board={board} />
                ))}
              </div>
            ) : null}

            {activePanel === 'competition' ? (
              <div className="grid gap-3 md:grid-cols-3">
                <BriefColumn icon={<Store size={14} />} title="竞店" items={projection.competitionBoards.rivalStores} />
                <BriefColumn
                  icon={<Target size={14} />}
                  title="竞品房源"
                  items={projection.competitionBoards.rivalListings}
                  onOpenCase={openCase}
                />
                <BriefColumn icon={<Users size={14} />} title="同 ACN 资源位" items={projection.competitionBoards.companyPressure} />
              </div>
            ) : null}
          </div>
        </section>

        <section className="seller-panel overflow-hidden">
          <div className="border-b border-[var(--seller-border)] px-5 py-4">
            <div className="seller-label">今天先怎么做</div>
          </div>

          <div className="space-y-3 px-5 py-4">
            <ActionNote
              label="先动的哪里最弱"
              title={buildRadarJudgement(projection.radarAxes)}
              detail={actionLine}
            />
            <ActionNote
              label="先看哪层"
              title={currentLayerCard.title}
              detail={currentLayerCard.detail}
              accent={activeLayer === 'district' ? 'chance' : activeLayer === 'listing' ? 'risk' : 'neutral'}
            />
            <ActionNote
              label="先看哪套房"
              title={leadImpactedCase ? `${leadImpactedCase.title} 先回看` : '暂时没有明确受压房源'}
              detail={leadImpactedCase
                ? `${leadImpactedCase.reason}，先看客户推进、竞品比较和价格站位。`
                : '今天先从板块和竞争层的变化判断，再回到重点房源。'}
              accent={leadImpactedCase?.tone || 'neutral'}
              caseId={leadImpactedCase?.caseId}
              onOpenCase={openCase}
            />
          </div>

          <div className="border-t border-[var(--seller-border)] px-5 py-4">
            <div className="mb-3 seller-label">受影响房源</div>
            <div className="space-y-2.5">
              {projection.affectedCases.length > 0 ? projection.affectedCases.slice(0, 3).map((item, index) => (
                <ImpactedCaseRow
                  key={item.id}
                  item={item}
                  rank={index + 1}
                  onOpenCase={openCase}
                />
              )) : (
                <div className="seller-empty px-4 py-5 text-[12px]">今天还没有明确被外部单独打到的房源。</div>
              )}
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}

function HeaderStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'risk' | 'chance' | 'warm';
}) {
  const className = tone === 'risk'
    ? 'border-[color-mix(in_srgb,var(--seller-risk)_22%,var(--seller-border)_78%)] bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
    : tone === 'chance'
      ? 'border-[color-mix(in_srgb,var(--seller-chance)_22%,var(--seller-border)_78%)] bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
      : tone === 'warm'
        ? 'border-[color-mix(in_srgb,var(--seller-accent)_22%,var(--seller-border)_78%)] bg-[rgba(240,176,48,0.09)] text-[var(--seller-accent)]'
        : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] text-[var(--seller-ink)]';

  return (
    <div className={`min-h-[78px] rounded-[14px] border px-3.5 py-3 ${className}`}>
      <div className="text-[10px] font-bold tracking-[0.1em] text-current/70">{label}</div>
      <div className="mt-2 text-[22px] font-semibold leading-none tracking-[-0.04em]">{value}</div>
    </div>
  );
}

function HeroStoryCard({
  label,
  title,
  detail,
  tone,
}: {
  label: string;
  title: string;
  detail: string;
  tone: ProjectionTone;
}) {
  const className = tone === 'risk'
    ? 'border-[color-mix(in_srgb,var(--seller-risk)_22%,var(--seller-border)_78%)] bg-[var(--seller-risk-soft)]'
    : tone === 'chance'
      ? 'border-[color-mix(in_srgb,var(--seller-chance)_22%,var(--seller-border)_78%)] bg-[var(--seller-chance-soft)]'
      : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]';

  return (
    <div className={`min-h-[128px] rounded-[14px] border px-4 py-4 ${className}`}>
      <div className="text-[10px] font-bold tracking-[0.12em] text-[var(--seller-subtle)]">{label}</div>
      <div className="mt-2 text-[16px] font-semibold leading-6 tracking-[-0.03em] text-[var(--seller-ink)]">
        {title}
      </div>
      <div className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
        {detail}
      </div>
    </div>
  );
}

function RadarMetricCard({
  label,
  value,
  detail,
  tone,
}: {
  key?: React.Key;
  label: string;
  value: number;
  detail: string;
  tone: ProjectionTone;
}) {
  const barClass = tone === 'risk'
    ? 'bg-[var(--seller-risk)]'
    : tone === 'chance'
      ? 'bg-[var(--seller-accent)]'
      : 'bg-[var(--seller-ink)]';

  return (
    <div className="rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-bold tracking-[0.12em] text-[var(--seller-subtle)]">{label}</div>
        <ToneBadge tone={tone} compact />
      </div>
      <div className="mt-3 text-[18px] font-semibold leading-none tracking-[-0.04em] text-[var(--seller-ink)]">
        {value}
      </div>
      <div className="mt-3 h-[3px] rounded-full bg-[rgba(255,255,255,0.08)]">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(6, Math.min(100, value))}%` }} />
      </div>
      <div className="mt-3 text-[12px] leading-6 text-[var(--seller-muted)]">
        {detail}
      </div>
    </div>
  );
}

function TrendBoardCard({
  board,
}: {
  key?: React.Key;
  board: ReturnType<typeof buildMarketProjection>['districtBoards'][number];
}) {
  return (
    <div className="rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <span className="seller-chip">{board.name}</span>
        <ToneBadge tone={board.tone} compact />
      </div>
      <div className="mt-2 text-[14px] font-semibold leading-6 tracking-[-0.025em] text-[var(--seller-ink)]">
        {board.title}
      </div>
      <div className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
        {board.summary}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniMetric label="客户热度" value={board.demandHeat} />
        <MiniMetric label="在售供给" value={board.supplyPressure} />
        <MiniMetric label="竞争压力" value={board.competitivePressure} />
        <MiniMetric label="市场情绪" value={board.sentiment} />
      </div>
    </div>
  );
}

function BriefColumn({
  icon,
  title,
  items,
  onOpenCase,
}: {
  icon: React.ReactNode;
  title: string;
  items: ProjectionBrief[];
  onOpenCase?: (caseId?: string) => void;
}) {
  return (
    <section className="rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-[var(--seller-subtle)]">{icon}</div>
        <div className="seller-label">{title}</div>
      </div>
      <div className="space-y-2.5">
        {items.length > 0 ? items.map((item) => (
          <BriefRow key={item.id} item={item} onOpenCase={onOpenCase} />
        )) : (
          <div className="seller-empty px-4 py-5 text-[12px]">今天这里没有新的重点。</div>
        )}
      </div>
    </section>
  );
}

function BriefRow({
  item,
  onOpenCase,
}: {
  key?: React.Key;
  item: ProjectionBrief;
  onOpenCase?: (caseId?: string) => void;
}) {
  const clickable = Boolean(item.caseId && onOpenCase);
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="seller-chip">{item.label}</span>
        <ToneBadge tone={item.tone} compact />
      </div>
      <div className="mt-2 text-[12px] font-semibold leading-5 text-[var(--seller-ink)]">{item.title}</div>
      <div className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{item.detail}</div>
    </>
  );

  if (!clickable) {
    return (
      <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-3 py-3">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenCase?.(item.caseId)}
      className="w-full rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-3 py-3 text-left transition hover:border-[var(--seller-border-strong)]"
    >
      {content}
    </button>
  );
}

function ActionNote({
  label,
  title,
  detail,
  accent = 'neutral',
  caseId,
  onOpenCase,
}: {
  label: string;
  title: string;
  detail: string;
  accent?: ProjectionTone;
  caseId?: string;
  onOpenCase?: (caseId?: string) => void;
}) {
  const className = accent === 'risk'
    ? 'border-[color-mix(in_srgb,var(--seller-risk)_20%,var(--seller-border)_80%)] bg-[var(--seller-risk-soft)]'
    : accent === 'chance'
      ? 'border-[color-mix(in_srgb,var(--seller-accent)_20%,var(--seller-border)_80%)] bg-[rgba(74,227,138,0.08)]'
      : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]';

  const content = (
    <>
      <div className="text-[10px] font-bold tracking-[0.12em] text-[var(--seller-subtle)]">{label}</div>
      <div className="mt-2 text-[14px] font-semibold leading-6 tracking-[-0.025em] text-[var(--seller-ink)]">
        {title}
      </div>
      <div className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
        {detail}
      </div>
    </>
  );

  if (!caseId || !onOpenCase) {
    return (
      <div className={`rounded-[14px] border px-4 py-4 ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenCase(caseId)}
      className={`w-full rounded-[14px] border px-4 py-4 text-left transition hover:border-[var(--seller-border-strong)] ${className}`}
    >
      {content}
    </button>
  );
}

function ImpactedCaseRow({
  item,
  rank,
  onOpenCase,
}: {
  key?: React.Key;
  item: ProjectionBrief;
  rank: number;
  onOpenCase: (caseId?: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenCase(item.caseId)}
      className="flex w-full items-center justify-between gap-3 rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-3 py-3 text-left transition hover:border-[var(--seller-border-strong)]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)] text-[10px] font-semibold text-[var(--seller-ink)]">
          {rank}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-[var(--seller-ink)]">{item.title}</div>
          <div className="truncate text-[11px] text-[var(--seller-muted)]">{item.detail}</div>
        </div>
      </div>
      <ToneBadge tone={item.tone} compact />
    </button>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5">
      <div className="text-[10px] font-bold tracking-[0.12em] text-[var(--seller-subtle)]">{label}</div>
      <div className="mt-1 text-[14px] font-semibold text-[var(--seller-ink)]">{value}</div>
    </div>
  );
}

function ToneBadge({
  tone,
  compact = false,
}: {
  tone: ProjectionTone;
  compact?: boolean;
}) {
  const className = tone === 'chance'
    ? 'seller-chip seller-chip-chance'
    : tone === 'risk'
      ? 'seller-chip seller-chip-risk'
      : 'seller-chip';
  const label = tone === 'chance' ? '机会' : tone === 'risk' ? '风险' : '中性';
  const sizeClass = compact ? 'px-2 py-0.5' : 'px-2.5 py-1';

  return (
    <span className={`text-[10px] ${sizeClass} ${className}`}>
      {label}
    </span>
  );
}

function buildHeroSummary(state: GameState) {
  const activeRivals = state.marketShadow?.rivalListings?.filter((item) => item.status === 'active') || [];
  const hottestMarket = [...state.markets].sort((left, right) => right.demandHeat - left.demandHeat)[0];
  const companyPressure = state.marketShadow?.companyPressure;
  const fragments: string[] = [];

  if (hottestMarket) {
    fragments.push(`${hottestMarket.name}的客户热度最高`);
  }
  if (activeRivals.length > 0) {
    fragments.push(`现在有 ${activeRivals.length} 套竞品在抢同类客户`);
  }
  if (companyPressure) {
    fragments.push(companyPressure.sharedLeadPressure >= 58 ? '同 ACN 分客偏紧' : '同 ACN 分客还算稳定');
  }
  if (fragments.length === 0) {
    return state.day > 1 ? `第 ${state.day} 天市场没有出现特别强的新信号。` : '今天市场没有出现特别强的新信号。';
  }

  return fragments.join('，');
}

function buildActionLine({
  radarAxes,
  leadRisk,
  leadCase,
  activeLayerLabel,
}: {
  radarAxes: {
    demandHeat: number;
    supplyPressure: number;
    rivalActivity: number;
    customerActivity: number;
    coSaleOpportunity: number;
  };
  leadRisk: IntelItem | null;
  leadCase: ReturnType<typeof deriveImpactedCases>[number] | null;
  activeLayerLabel: string;
}) {
  if (leadRisk) {
    return leadRisk.detail;
  }
  if (leadCase) {
    return `${activeLayerLabel}这一层最后压到 ${leadCase.title}，先看客户推进、竞品比较和价格站位。`;
  }
  if (radarAxes.rivalActivity >= 70 || radarAxes.supplyPressure >= 70) {
    return '同行抢客已经抬头，市场真正的重点不是看热闹，而是先确认哪些房源会被比价和分客。';
  }
  if (radarAxes.demandHeat >= 68 && radarAxes.customerActivity >= 62) {
    return '客户热度和跟进意愿都不差，今天更适合把带看和约见往前推。';
  }
  return '今天先把外部变化和重点房源对应起来，避免动作发散。';
}

function buildRadarJudgement(radarAxes: {
  demandHeat: number;
  supplyPressure: number;
  rivalActivity: number;
  customerActivity: number;
  coSaleOpportunity: number;
}) {
  if (radarAxes.rivalActivity >= 70 || radarAxes.supplyPressure >= 70) {
    return '今天以稳盘和筛重点房源为主';
  }
  if (radarAxes.demandHeat >= 68 && radarAxes.customerActivity >= 62) {
    return '今天可以借势冲带看和约见';
  }
  if (radarAxes.coSaleOpportunity >= 65) {
    return '今天更适合借同公司资源把线索做厚';
  }
  return '今天先稳总盘和重点房源';
}
