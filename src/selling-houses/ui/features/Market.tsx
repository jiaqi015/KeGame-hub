import React, { useEffect, useMemo, useState } from 'react';
import type { GameState } from '../../domain/models';
import {
  type ProjectionBrief,
  type ProjectionTone,
  buildMarketProjection,
} from '../../application/projections/operatingProjection.js';
import {
  Building2,
  Globe2,
  History,
  Radar,
  ShieldAlert,
  Spline,
  Store,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  deriveImpactedCases,
  deriveIntelFeed,
  IntelLayerTab,
  layerLabel,
} from './marketIntel';

interface MarketProps {
  state: GameState;
  initialLayer?: IntelLayerTab;
  onSelectCase?: (id: string) => void;
  onOpenCases?: () => void;
}

type MarketPanelTab = 'radar' | 'trend' | 'competition';
type MarketFlowStep = {
  id: IntelLayerTab;
  label: string;
  shortLabel: string;
  count: number;
  title: string;
  detail: string;
  empty?: string;
};

const PANEL_TABS: Array<{
  id: MarketPanelTab;
  label: string;
  icon: React.ReactNode;
  summary: string;
}> = [
  {
    id: 'radar',
    label: '雷达',
    icon: <Radar size={14} />,
    summary: '先看今天先动的是客户、供给，还是同行抢客。',
  },
  {
    id: 'trend',
    label: '行情',
    icon: <TrendingUp size={14} />,
    summary: '再看哪个板块更容易出客，哪个板块开始压价。',
  },
  {
    id: 'competition',
    label: '竞对',
    icon: <Store size={14} />,
    summary: '最后看同行、竞品和同 ACN 资源位今天怎么分客。',
  },
];

export function Market({ state, initialLayer = 'macro', onSelectCase, onOpenCases }: MarketProps) {
  const [activeLayer, setActiveLayer] = useState<IntelLayerTab>(initialLayer);
  const [activePanel, setActivePanel] = useState<MarketPanelTab>('radar');
  const allIntel = useMemo(() => deriveIntelFeed(state), [state]);
  const activeIntel = allIntel.filter((item) => item.layer === activeLayer);
  const projection = useMemo(() => buildMarketProjection(state), [state]);
  const todayIntelCount = allIntel.filter((item) => item.day === state.day).length;
  const riskCount = allIntel.filter((item) => item.tone === 'risk').length;
  const chanceCount = allIntel.filter((item) => item.tone === 'chance').length;
  const impactedCases = useMemo(() => deriveImpactedCases(state, allIntel), [state, allIntel]);
  const activeLayerRisk = activeIntel.filter((item) => item.tone === 'risk')[0];
  const activeLayerChance = activeIntel.filter((item) => item.tone === 'chance')[0];
  const leadImpactedCase = impactedCases[0];
  const layerFlow = useMemo<MarketFlowStep[]>(() => (
    [
      {
        id: 'macro',
        label: '全城先变什么',
        shortLabel: '全城',
        empty: '今天全城层面还没有新的风向，先盯板块和竞品。',
      },
      {
        id: 'district',
        label: '板块先热还是先冷',
        shortLabel: '板块',
        empty: '今天板块层面还没有明显冷热分化。',
      },
      {
        id: 'competition',
        label: '同行今天怎么抢',
        shortLabel: '竞争',
        empty: '今天竞争线还没有明显新动作。',
      },
      {
        id: 'listing',
        label: '最后压到哪套房',
        shortLabel: '房源',
        empty: '今天还没有外部变化集中压到具体房源。',
      },
    ].map((step) => {
      const items = allIntel.filter((item) => item.layer === step.id);
      return {
        id: step.id,
        label: step.label,
        shortLabel: step.shortLabel,
        count: items.length,
        title: items[0]?.title || step.empty,
        detail: items[0]?.summary || items[0]?.detail || step.empty,
      };
    })
  ), [allIntel]);
  const leadLayerStep = layerFlow.find((step) => step.id === activeLayer) || layerFlow[0];
  const hottestDistrict = projection.districtBoards[0];

  useEffect(() => {
    setActiveLayer(initialLayer);
  }, [initialLayer]);

  return (
    <div className="space-y-4">
      <section className="seller-panel-muted overflow-hidden p-4 lg:p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="seller-label flex items-center gap-2">
              <Globe2 size={14} />
              市场
            </div>
            <h3 className="seller-title mt-2 text-[20px]">{projection.headline}</h3>
            <p className="seller-body mt-2 text-[13px]">{projection.summary}</p>
            <div className="mt-2 text-[11px] font-medium text-[var(--seller-subtle)]">
              第 {state.day} 天先看外部变化，再确认它压到哪套房。
            </div>
          </div>

          <div className="grid min-w-[280px] grid-cols-2 gap-2 md:grid-cols-4">
            <StatChip label="今日新增情报" value={`${todayIntelCount}`} tone="slate" />
            <StatChip label="优先处理风险" value={`${riskCount}`} tone="rose" />
            <StatChip label="可跟进机会" value={`${chanceCount}`} tone="emerald" />
            <StatChip label="已受影响房源" value={`${impactedCases.length}`} tone="amber" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-3">
          <DecisionCard
            eyebrow="今日判断"
            title={buildRadarJudgement(projection.radarAxes)}
            detail={activeLayerRisk?.summary || projection.summary}
            tone={activeLayerRisk ? 'risk' : 'neutral'}
          />
          <DecisionCard
            eyebrow="重点板块"
            title={activeLayerChance?.title || projection.districtBoards[0]?.name || '先看商圈底盘'}
            detail={activeLayerChance?.detail || projection.districtBoards[0]?.summary || '今天没有特别强的顺风板块，先守基本盘。'}
            tone={activeLayerChance ? 'chance' : 'neutral'}
          />
          <DecisionCard
            eyebrow="先稳房源"
            title={leadImpactedCase ? `${leadImpactedCase.title} 最先受压` : '暂时没有单套房被外部集中打到'}
            detail={leadImpactedCase ? `${leadImpactedCase.reason} 今天被命中 ${leadImpactedCase.count} 次。` : '说明外部变化还没集中压到某一套房，先按经营优先级推进。'}
            tone={leadImpactedCase ? 'risk' : 'neutral'}
          />
        </div>

        <div className="seller-panel-soft mt-5 p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="seller-label">变化怎么传下来</div>
              <div className="seller-body mt-1 text-[13px]">
                先看哪一层先动，再回到受影响房源。
              </div>
            </div>
            <div className="text-[11px] font-medium text-slate-500">
              当前重点在 {leadLayerStep.shortLabel} 这一层
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
            {layerFlow.map((step) => (
              <React.Fragment key={step.id}>
                <FlowStepCard
                  step={step}
                  active={step.id === activeLayer}
                  onClick={() => setActiveLayer(step.id)}
                />
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="seller-panel p-4 lg:p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="seller-label flex items-center gap-2 text-[11px]">
                <Spline size={15} />
                先看哪条线在动
              </div>
              <div className="seller-body mt-2 text-[12px]">
                {PANEL_TABS.find((item) => item.id === activePanel)?.summary}
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {PANEL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePanel(tab.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                    activePanel === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <InsightStrip
              label="当前层级"
              value={layerLabel(activeLayer)}
              detail={activeIntel[0]?.summary || '这层今天还没有新增变化。'}
            />
            <InsightStrip
              label="先防什么"
              value={activeLayerRisk?.title || '暂无明显风险'}
              detail={activeLayerRisk?.detail || '说明这层暂时没有新的明确风险点。'}
              tone="risk"
            />
            <InsightStrip
              label="可以借什么"
              value={activeLayerChance?.title || '暂无顺风'}
              detail={activeLayerChance?.detail || '说明今天更多还是守住现有房源，不是借势冲量。'}
              tone="chance"
            />
          </div>

          {activePanel === 'radar' && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {projection.radarCards.map((card) => (
                <div key={card.id} className="rounded-[22px] border border-black/[0.05] bg-slate-50/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{card.label}</div>
                      <div className="mt-2 text-[28px] font-bold tracking-tight text-slate-900">{card.value}</div>
                    </div>
                    <ToneBadge tone={card.tone} />
                  </div>
                  <p className="mt-3 text-[12px] leading-5 text-slate-600">{card.summary}</p>
                </div>
              ))}
            </div>
          )}

          {activePanel === 'trend' && (
            <div className="space-y-3">
              {projection.districtBoards.map((board) => (
                <div key={board.marketId} className="rounded-[22px] border border-black/[0.05] bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          {board.name}
                        </span>
                        <ToneBadge tone={board.tone} />
                      </div>
                      <div className="mt-2 text-[16px] font-semibold text-slate-900">{board.title}</div>
                      <p className="mt-1 text-[12px] leading-5 text-slate-600">{board.summary}</p>
                    </div>
                    <div className="grid min-w-[240px] grid-cols-2 gap-2">
                      <MiniMetric label="客户热度" value={board.demandHeat} />
                      <MiniMetric label="在售供给" value={board.supplyPressure} />
                      <MiniMetric label="竞争压力" value={board.competitivePressure} />
                      <MiniMetric label="市场情绪" value={board.sentiment} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activePanel === 'competition' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <BriefColumn
                icon={<Store size={15} />}
                title="竞店"
                items={projection.competitionBoards.rivalStores}
              />
              <BriefColumn
                icon={<Target size={15} />}
                title="竞品房源"
                items={projection.competitionBoards.rivalListings}
                onOpenCase={(caseId) => {
                  if (!caseId) return;
                  onSelectCase?.(caseId);
                  onOpenCases?.();
                }}
              />
              <BriefColumn
                icon={<Users size={15} />}
                title="同 ACN 资源位"
                items={projection.competitionBoards.companyPressure}
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <section className="seller-panel p-4 lg:p-5">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              <Radar size={15} />
              今天先怎么读
            </div>
            <div className="space-y-2.5">
              <RadarNote
                title="先动的是哪根线"
                detail={buildRadarToneNote(projection.radarAxes)}
              />
              <RadarNote
                title="最先压到哪里"
                detail={activeLayerRisk?.detail || activeLayerChance?.detail || '今天外部变化还没有形成非常清晰的单点冲击。'}
              />
              <RadarNote
                title="回房源先看什么"
                detail={leadImpactedCase
                  ? `先回到 ${leadImpactedCase.title} 看客户和竞品是否一起受压，再决定是稳价、补带看还是提速跟进。`
                  : '今天外部变化没有集中压到单套房，先按经营优先级回房源页处理。'}
              />
            </div>
          </section>

          <section className="seller-panel-muted p-4 lg:p-5">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700">
              <History size={15} />
              昨日关键变化
            </div>
            <div className="space-y-2.5">
              {projection.yesterdayNews.length > 0 ? projection.yesterdayNews.map((item) => (
                <div key={item.id}>
                  <BriefRow
                    item={item}
                    onOpenCase={(caseId) => {
                      if (!caseId) return;
                      onSelectCase?.(caseId);
                      onOpenCases?.();
                    }}
                  />
                </div>
              )) : (
                <EmptyCard text="昨天没有沉淀出新的市场情报。" />
              )}
            </div>
          </section>

          <section className="seller-panel p-4 lg:p-5">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              <ShieldAlert size={15} />
              今日受外部变化牵动的房源
            </div>
            <div className="space-y-2.5">
              {projection.affectedCases.length > 0 ? projection.affectedCases.map((item) => {
                const impacted = impactedCases.find((entry) => entry.caseId === item.caseId);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (!item.caseId) return;
                      onSelectCase?.(item.caseId);
                      onOpenCases?.();
                    }}
                    className="w-full rounded-[20px] border border-black/[0.05] bg-slate-50/70 px-4 py-3 text-left transition hover:border-black/[0.08] hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold text-slate-800">{item.title}</div>
                        <div className="mt-1 text-[11px] leading-5 text-slate-500">
                          {item.detail}
                          {impacted ? ` 今天被外部变化连着打到 ${impacted.count} 次。` : ''}
                        </div>
                        {impacted?.reason && (
                          <div className="mt-2 rounded-[14px] border border-black/[0.05] bg-white px-3 py-2 text-[11px] leading-5 text-slate-500">
                            先看：{impacted.reason}
                          </div>
                        )}
                      </div>
                      <ToneBadge tone={item.tone} compact />
                    </div>
                  </button>
                );
              }) : (
                <EmptyCard text="暂时没有明显被环境单独打到的房源。" />
              )}
            </div>
          </section>
        </div>
      </section>

      <section className="seller-panel p-4 lg:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <Building2 size={15} />
            从全局一路拆到房源
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { id: 'macro' as const, label: '全城' },
              { id: 'district' as const, label: '板块' },
              { id: 'competition' as const, label: '竞争' },
              { id: 'listing' as const, label: '单房' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveLayer(tab.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                  activeLayer === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[20px] border border-black/[0.05] bg-slate-50/70 px-4 py-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{layerLabel(activeLayer)}现在最值得看</div>
            <div className="mt-2 text-[15px] font-semibold text-slate-900">{leadLayerStep.title}</div>
            <div className="mt-2 text-[12px] leading-6 text-slate-600">{leadLayerStep.detail}</div>
          </div>
          <div className="rounded-[20px] border border-black/[0.05] bg-slate-50/70 px-4 py-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">这一层先回哪套房</div>
            <div className="mt-2 text-[15px] font-semibold text-slate-900">
              {leadImpactedCase ? leadImpactedCase.title : hottestDistrict?.name || '暂时没有单套房被集中打到'}
            </div>
            <div className="mt-2 text-[12px] leading-6 text-slate-600">
              {leadImpactedCase
                ? `${leadImpactedCase.reason}。先回这套房看客户推进、竞品比较和价格站位。`
                : hottestDistrict
                  ? `${hottestDistrict.summary}。先在这个板块里挑出最值得接的房。`
                  : '说明今天更多还是守住现有房源，不需要围着市场页转。'}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {activeIntel.length > 0 ? activeIntel.map((item) => (
            <article key={item.id} className="rounded-[20px] border border-black/[0.05] bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <ToneBadge tone={mapIntelTone(item.tone)} compact />
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  {layerLabel(item.layer)}
                </span>
                <span className="text-[10px] font-medium text-slate-400">第 {item.day} 天</span>
                {item.affectedCaseIds.length > 0 && (
                  <span className="text-[10px] font-medium text-slate-400">打到 {item.affectedCaseIds.length} 套房</span>
                )}
              </div>
              <div className="mt-2 text-[15px] font-semibold text-slate-900">{item.title}</div>
              <p className="mt-1 text-[12px] leading-6 text-slate-600">{item.detail}</p>
              <div className="mt-3 rounded-[18px] border border-black/[0.05] bg-white px-4 py-3 text-[12px] leading-5 text-slate-500">
                {item.summary}
              </div>
            </article>
          )) : (
            <EmptyCard text="这一层今天没有新增市场变化，可先处理房源和客户推进。" />
          )}
        </div>
      </section>
    </div>
  );
}

function FlowStepCard({
  step,
  active,
  onClick,
}: {
  step: MarketFlowStep;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[20px] border px-4 py-4 text-left transition ${
        active
          ? 'border-slate-900 bg-slate-900 text-white shadow-[0_16px_30px_rgba(15,23,42,0.16)]'
          : 'border-black/[0.05] bg-slate-50/70 text-slate-900 hover:border-black/[0.08] hover:bg-white'
      }`}
    >
      <div className={`text-[10px] font-bold uppercase tracking-[0.14em] ${active ? 'text-white/60' : 'text-slate-400'}`}>
        {step.shortLabel}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="text-[15px] font-semibold">{step.label}</div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
          active ? 'bg-white/10 text-white/80' : 'bg-white text-slate-500'
        }`}>
          {step.count} 条
        </span>
      </div>
      <div className={`mt-2 text-[12px] leading-6 ${active ? 'text-white/75' : 'text-slate-600'}`}>
        {step.detail}
      </div>
    </button>
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
    <section className="rounded-[22px] border border-black/[0.05] bg-slate-50/70 p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {icon}
        {title}
      </div>
      <div className="space-y-2.5">
        {items.length > 0 ? items.map((item) => (
          <div key={item.id}>
            <BriefRow item={item} onOpenCase={onOpenCase} />
          </div>
        )) : (
          <EmptyCard text="今天这里没有新的重点。" compact />
        )}
      </div>
    </section>
  );
}

function DecisionCard({
  eyebrow,
  title,
  detail,
  tone,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  tone: ProjectionTone;
}) {
  const className = tone === 'risk'
    ? 'border-rose-100 bg-rose-50/80'
    : tone === 'chance'
      ? 'border-emerald-100 bg-emerald-50/80'
      : 'border-black/[0.05] bg-white/90';

  return (
    <div className={`rounded-[22px] border px-4 py-4 ${className}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{eyebrow}</div>
      <div className="mt-2 text-[16px] font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-[12px] leading-6 text-slate-600">{detail}</div>
    </div>
  );
}

function InsightStrip({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: ProjectionTone;
}) {
  const toneClass = tone === 'risk'
    ? 'bg-rose-50'
    : tone === 'chance'
      ? 'bg-emerald-50'
      : 'bg-slate-50';

  return (
    <div className={`rounded-[18px] px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 text-[13px] font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</div>
    </div>
  );
}

function RadarNote({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[18px] border border-black/[0.05] bg-slate-50/80 px-4 py-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{title}</div>
      <div className="mt-2 text-[12px] leading-6 text-slate-600">{detail}</div>
    </div>
  );
}

function BriefRow({
  item,
  onOpenCase,
}: {
  item: ProjectionBrief;
  onOpenCase?: (caseId?: string) => void;
}) {
  const clickable = Boolean(item.caseId && onOpenCase);

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {item.label}
        </span>
        <ToneBadge tone={item.tone} compact />
      </div>
      <div className="mt-2 text-[13px] font-semibold text-slate-900">{item.title}</div>
      <div className="mt-1 text-[11px] leading-5 text-slate-500">{item.detail}</div>
    </>
  );

  if (!clickable) {
    return (
      <div className="rounded-[18px] border border-black/[0.05] bg-white px-4 py-3">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenCase?.(item.caseId)}
      className="w-full rounded-[18px] border border-black/[0.05] bg-white px-4 py-3 text-left transition hover:border-black/[0.08] hover:bg-slate-50"
    >
      {content}
    </button>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'rose' | 'emerald' | 'amber';
}) {
  const toneClass = tone === 'rose'
    ? 'bg-rose-50 text-rose-700'
    : tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-slate-50 text-slate-700';

  return (
    <div className={`rounded-2xl px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">{label}</div>
      <div className="mt-1 text-[18px] font-bold">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 text-[14px] font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function ToneBadge({ tone, compact = false }: { tone: ProjectionTone; compact?: boolean }) {
  const className = tone === 'chance'
    ? 'bg-emerald-100 text-emerald-700'
    : tone === 'risk'
      ? 'bg-rose-100 text-rose-600'
      : 'bg-slate-100 text-slate-500';
  const label = tone === 'chance' ? '机会' : tone === 'risk' ? '风险' : '中性';
  const sizeClass = compact ? 'px-2 py-0.5' : 'px-2.5 py-1';

  return (
    <span className={`rounded-full text-[10px] font-bold uppercase tracking-[0.14em] ${sizeClass} ${className}`}>
      {label}
    </span>
  );
}

function EmptyCard({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={`rounded-[20px] border border-dashed border-slate-200 bg-slate-50 text-center text-[12px] text-slate-400 ${compact ? 'px-4 py-5' : 'px-4 py-8'}`}>
      {text}
    </div>
  );
}

function mapIntelTone(tone: 'risk' | 'chance' | 'neutral'): ProjectionTone {
  return tone;
}

function buildRadarJudgement(radarAxes: {
  demandHeat: number;
  supplyPressure: number;
  rivalActivity: number;
  customerActivity: number;
  coSaleOpportunity: number;
}) {
  if (radarAxes.rivalActivity >= 70 || radarAxes.supplyPressure >= 70) {
    return '今天先守客户和同类盘对比';
  }
  if (radarAxes.demandHeat >= 68 && radarAxes.customerActivity >= 62) {
    return '今天可以适当借势冲带看和约见';
  }
  if (radarAxes.coSaleOpportunity >= 65) {
    return '今天更适合借同公司资源把线索做厚';
  }
  return '今天以稳盘和筛重点房源为主';
}

function buildRadarToneNote(radarAxes: {
  demandHeat: number;
  supplyPressure: number;
  rivalActivity: number;
  customerActivity: number;
  coSaleOpportunity: number;
}) {
  if (radarAxes.rivalActivity >= 70) {
    return '同行抢客已经抬头，市场页的重点不是看热闹，而是先确认哪些房源会被比价和分客。';
  }
  if (radarAxes.demandHeat >= 70 && radarAxes.customerActivity >= 60) {
    return '客户端还有热度，今天市场页更像机会雷达，适合挑出能接住流量的板块和房源。';
  }
  if (radarAxes.supplyPressure >= 70) {
    return '在售供给偏多，客户会看得更散，业主也更容易把你拿去和同类盘比。';
  }
  return '今天市场整体偏中性，主要价值是帮你确认变化有没有开始传到具体房源。';
}
