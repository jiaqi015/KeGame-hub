import React, { useEffect, useMemo, useState } from 'react';
import type { GameState } from '../../domain/models';
import {
  buildMarketProjection,
  type ProjectionBrief,
  type ProjectionTone,
} from '../../application/projections/operatingProjection.js';
import {
  type IntelLayerTab,
} from './marketIntel';

interface MarketProps {
  state: GameState;
  initialLayer?: IntelLayerTab;
  onSelectCase?: (id: string) => void;
  onOpenCases?: () => void;
}

type SectionTab = typeof SECTION_TABS[number];

type MarketStory = {
  id: string;
  tone: ProjectionTone;
  section: string;
  filter: SectionTab | '竞品';
  time: string;
  headline: string;
  deck?: string;
  body: string;
  tags?: Array<{ label: string; caseId?: string }>;
  score?: number;
  detailLines?: string[];
  metrics?: Array<{ label: string; value: string; tone?: ProjectionTone | 'warm' }>;
};

type WireStory = {
  id: string;
  tone: ProjectionTone;
  section: string;
  time: string;
  text: string;
  detailStory?: MarketStory;
};

type TickerItem = {
  label: string;
  value: string;
  delta: string;
  tone: ProjectionTone | 'warm';
};

const SECTION_TABS = ['全部', '政策', '板块', '成交', '客户', '房源'] as const;

const TONE_COLOR: Record<ProjectionTone | 'warm', string> = {
  risk: 'var(--market-red)',
  chance: 'var(--market-green)',
  neutral: 'var(--market-subtle)',
  warm: 'var(--market-amber)',
};

const TONE_BG: Record<ProjectionTone | 'warm', string> = {
  risk: 'rgba(232,92,92,0.10)',
  chance: 'rgba(61,214,140,0.10)',
  neutral: 'rgba(255,255,255,0.04)',
  warm: 'rgba(240,176,48,0.10)',
};

export function Market({
  state,
  initialLayer = 'macro',
  onSelectCase,
  onOpenCases,
}: MarketProps) {
  const initialSection = layerToSection(initialLayer);
  const [activeSection, setActiveSection] = useState<SectionTab>(initialSection);
  const [selectedStory, setSelectedStory] = useState<MarketStory | null>(null);
  const projection = useMemo(() => buildMarketProjection(state), [state]);
  const caseTitleById = useMemo(() => new Map(state.cases.map((item) => [item.id, item.title])), [state.cases]);
  const stories = useMemo(() => buildStories(state, projection, caseTitleById), [caseTitleById, projection, state]);
  const tickerItems = useMemo(() => buildTickerItems(projection), [projection]);
  const affectedRows = useMemo(() => buildAffectedRows(state, projection), [projection, state]);
  const rivalRows = useMemo(() => buildRivalRows(projection), [projection]);
  const filteredStories = useMemo(() => (
    stories.filter((story) => storyMatchesSection(story, activeSection))
  ), [activeSection, stories]);
  const leadStory = filteredStories[0] || stories[0] || buildFallbackStory(state, projection);
  const secondaryStories = filteredStories.filter((story) => story.id !== leadStory.id);
  const columns = splitIntoColumns(secondaryStories.slice(0, 6), 3);
  const wireStories = useMemo(
    () => buildWireStories(state, projection, activeSection, filteredStories, leadStory.id),
    [activeSection, filteredStories, leadStory.id, projection, state],
  );
  const sectionCounts = useMemo(() => buildSectionCounts(stories), [stories]);
  const tickerList: TickerItem[] = tickerItems;
  const columnList: MarketStory[][] = columns;
  const wireList: WireStory[] = wireStories;
  const rivalList: ProjectionBrief[] = rivalRows;
  const affectedList: Array<{ caseId?: string; title: string; hits: number; tone: ProjectionTone }> = affectedRows;

  useEffect(() => {
    setActiveSection(layerToSection(initialLayer));
  }, [initialLayer]);

  const openCase = (caseId?: string) => {
    if (!caseId) return;
    onSelectCase?.(caseId);
    onOpenCases?.();
  };

  return (
    <div
      data-selling-houses-page="market"
      className="-mx-4 -mb-4 min-h-full overflow-hidden bg-[var(--market-bg)] text-[var(--market-ink)] lg:-mx-5 lg:-mb-5"
      style={
        {
          fontFamily: '"Noto Sans SC","PingFang SC",sans-serif',
          '--market-bg': '#0d1219',
          '--market-paper': '#131c26',
          '--market-panel': '#0f1720',
          '--market-border': 'rgba(255,255,255,0.08)',
          '--market-border-strong': 'rgba(255,255,255,0.14)',
          '--market-ink': '#e6e2d8',
          '--market-muted': 'rgba(230,226,216,0.62)',
          '--market-subtle': 'rgba(230,226,216,0.32)',
          '--market-green': '#3dd68c',
          '--market-red': '#e85c5c',
          '--market-cyan': '#52cce0',
          '--market-amber': '#f0b030',
        } as React.CSSProperties
      }
    >
      <style>{`
        @keyframes sellerMarketTicker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
      <Ticker items={tickerList} />

      <section className="border-b border-[var(--market-border)] bg-[var(--market-paper)]">
        <div className="mx-auto flex max-w-[1300px] flex-col gap-4 px-7 py-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--market-green)]">
              市场雷达
            </div>
            <div className="text-[11px] text-[var(--market-subtle)]">
              第 {state.day} 天 · 今日情报 {projection.intelSummary.todayCount} 条
            </div>
          </div>

          <div className="flex min-w-0 overflow-x-auto border-l border-r border-[var(--market-border)]">
            {SECTION_TABS.map((section) => (
              <button
                key={section}
                type="button"
                onClick={() => setActiveSection(section)}
                className="shrink-0 border-r border-[var(--market-border)] px-[18px] py-2.5 text-[12px] font-bold transition"
                style={{
                  color: activeSection === section ? 'var(--market-ink)' : 'var(--market-subtle)',
                  borderBottom: `2px solid ${activeSection === section ? 'var(--market-green)' : 'transparent'}`,
                }}
              >
                {section}
              </button>
            ))}
          </div>

          <div className="flex gap-6">
            <Counter label="风险" value={projection.intelSummary.riskCount} tone="risk" />
            <Counter label="机会" value={projection.intelSummary.chanceCount} tone="chance" />
            <Counter label="受影响房源" value={affectedList.length} tone="warm" />
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[1300px] grid-cols-1 px-7 pb-10 xl:grid-cols-[minmax(0,1fr)_220px]">
        <main className="pt-6 xl:border-r xl:border-[var(--market-border)] xl:pr-7">
          <LeadStory story={leadStory} projection={projection} onOpenCase={openCase} onOpenStory={setSelectedStory} />

          <section className="mb-6">
            <Rule />
            <div className="grid gap-5 pt-4 lg:grid-cols-3">
              {columnList.map((column, index) => (
                <div
                  key={`column-${index}`}
                  className={`${index > 0 ? 'lg:border-l lg:border-[var(--market-border)] lg:pl-5' : ''} flex flex-col gap-[18px]`}
                >
                  {column.length > 0 ? column.map((story) => (
                    <StoryCard key={story.id} story={story} onOpenCase={openCase} onOpenStory={setSelectedStory} size="big" />
                  )) : (
                    <EmptyColumn activeSection={activeSection} />
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionHead label="简讯" count={wireList.length} />
            {wireList.length > 0 ? wireList.map((story) => (
              <WireRow key={story.id} story={story} onOpenStory={setSelectedStory} />
            )) : (
              <div className="rounded-[12px] border border-dashed border-[var(--market-border-strong)] bg-[rgba(15,23,32,0.72)] px-4 py-5 text-[12px] text-[var(--market-muted)]">
                {sectionCounts[activeSection] === 0 ? '这个分类今天没有新情报。' : '暂无更多简讯。'}
              </div>
            )}
          </section>
        </main>

        <aside className="pt-6 xl:pl-[22px]">
          <SectionHead label="指标" color="var(--market-cyan)" />
          <div className="space-y-3.5">
            {projection.radarCards.map((metric) => (
              <SideMetric key={metric.id} metric={metric} />
            ))}
          </div>

          <div className="h-5" />

          <SectionHead label="在场竞品" color="var(--market-red)" />
          <div>
            {rivalList.length > 0 ? rivalList.map((item, index) => (
              <RivalRow key={item.id} item={item} last={index === rivalRows.length - 1} />
            )) : (
              <div className="rounded-[12px] border border-dashed border-[var(--market-border-strong)] bg-[rgba(15,23,32,0.72)] px-3 py-4 text-[12px] text-[var(--market-muted)]">当前没有明显在抢客户的房源。</div>
            )}
          </div>

          <div className="h-5" />

          <SectionHead label="受影响房源" color="var(--market-amber)" />
          <div>
            {affectedList.length > 0 ? affectedList.map((item, index) => (
              <AffectedRow
                key={item.caseId}
                item={item}
                last={index === affectedRows.length - 1}
                onOpenCase={openCase}
              />
            )) : (
              <div className="rounded-[12px] border border-dashed border-[var(--market-border-strong)] bg-[rgba(15,23,32,0.72)] px-3 py-4 text-[12px] text-[var(--market-muted)]">暂无明确受影响房源。</div>
            )}
          </div>
        </aside>
      </section>
      {selectedStory && (
        <MarketStoryModal
          story={selectedStory}
          projection={projection}
          onClose={() => setSelectedStory(null)}
          onOpenCase={openCase}
        />
      )}
    </div>
  );
}

function Ticker({ items }: { items: TickerItem[] }) {
  const repeated = [...items, ...items, ...items];

  return (
    <div className="flex h-[30px] shrink-0 items-center overflow-hidden border-b border-[var(--market-border)] bg-[rgba(9,14,21,0.98)]">
      <div
        className="flex whitespace-nowrap"
        style={{
          animation: 'sellerMarketTicker 50s linear infinite',
        }}
      >
        {repeated.map((item, index) => (
          <span
            key={`${item.label}-${index}`}
            className="inline-flex items-center gap-2 border-r border-[var(--market-border)] px-5"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[var(--market-subtle)]">
              {item.label}
            </span>
            <span
              className="text-[11px] font-bold tabular-nums"
              style={{ color: TONE_COLOR[item.tone] }}
            >
              {item.value}
            </span>
            <span className="text-[10px]" style={{ color: TONE_COLOR[item.tone] }}>
              {item.delta}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: ProjectionTone | 'warm';
}) {
  return (
    <div className="text-right">
      <div className="text-[22px] font-bold leading-none" style={{ color: TONE_COLOR[tone] }}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-[var(--market-subtle)]">{label}</div>
    </div>
  );
}

function LeadStory({
  story,
  projection,
  onOpenCase,
  onOpenStory,
}: {
  story: MarketStory;
  projection: ReturnType<typeof buildMarketProjection>;
  onOpenCase: (caseId?: string) => void;
  onOpenStory: (story: MarketStory) => void;
}) {
  const evidenceLine = buildLeadEvidence(projection, story.tone);

  return (
    <article className="mb-6">
      <Rule color={TONE_COLOR[story.tone]} />
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenStory(story)}
        onKeyDown={(event) => openStoryFromKeyboard(event, story, onOpenStory)}
        className="cursor-pointer rounded-[14px] pt-2.5 transition hover:bg-[rgba(255,255,255,0.025)] focus:outline-none focus:ring-2 focus:ring-[color:var(--market-green)]/45"
        aria-label={`打开市场情报：${story.headline}`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className="rounded-[3px] border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{
              color: TONE_COLOR[story.tone],
              background: TONE_BG[story.tone],
              borderColor: colorMix(TONE_COLOR[story.tone], 0.35),
            }}
          >
            ● {story.section}
          </span>
          <ToneTag tone={story.tone} />
          <span className="text-[10px] text-[var(--market-subtle)]">{story.time}</span>
        </div>
        <h1 className="mb-2.5 max-w-[760px] text-[24px] font-bold leading-[1.22] tracking-[-0.025em] text-[var(--market-ink)] md:text-[28px]">
          {story.headline}
        </h1>
        {story.deck ? (
          <div className="mb-3.5 text-[14px] font-semibold leading-[1.4]" style={{ color: TONE_COLOR[story.tone] }}>
            {story.deck}
          </div>
        ) : null}
        <p className="mb-3 max-w-[720px] text-[13px] leading-[1.95] text-[var(--market-muted)]">
          {story.body}
        </p>
        {evidenceLine ? (
          <p className="mb-4 max-w-[720px] text-[12px] leading-[1.85]" style={{ color: TONE_COLOR[story.tone] }}>
            {evidenceLine}
          </p>
        ) : null}
        {story.tags && story.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {story.tags.map((tag) => (
              <button
                key={`${tag.label}-${tag.caseId || 'none'}`}
                type="button"
                disabled={!tag.caseId}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenCase(tag.caseId);
                }}
                className="rounded-[4px] border px-3 py-1 text-[11px] font-semibold disabled:cursor-default"
                style={{
                  color: TONE_COLOR[story.tone],
                  background: TONE_BG[story.tone],
                  borderColor: colorMix(TONE_COLOR[story.tone], 0.28),
                }}
              >
                {tag.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--market-subtle)]">点击看详情</div>
      </div>
    </article>
  );
}

function StoryCard({
  story,
  onOpenCase,
  onOpenStory,
  size,
}: {
  key?: React.Key;
  story: MarketStory;
  onOpenCase: (caseId?: string) => void;
  onOpenStory: (story: MarketStory) => void;
  size?: 'big';
}) {
  const big = size === 'big';
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpenStory(story)}
      onKeyDown={(event) => openStoryFromKeyboard(event, story, onOpenStory)}
      className="cursor-pointer rounded-[12px] pb-1 transition hover:bg-[rgba(255,255,255,0.025)] focus:outline-none focus:ring-2 focus:ring-[color:var(--market-green)]/40"
      aria-label={`打开市场情报：${story.headline}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--market-subtle)]">
          {story.section}
        </span>
        <ToneTag tone={story.tone} />
        <span className="ml-auto text-[10px] text-[var(--market-subtle)]">{story.time}</span>
      </div>
      <div className={`mb-1.5 font-bold leading-[1.38] tracking-[-0.01em] text-[var(--market-ink)] ${big ? 'text-[15px]' : 'text-[13px]'}`}>
        {story.headline}
      </div>
      {story.deck && big ? (
        <div className="mb-2 text-[12px] font-semibold leading-[1.45]" style={{ color: TONE_COLOR[story.tone] }}>
          {story.deck}
        </div>
      ) : null}
      <div className="text-[12px] leading-[1.85] text-[var(--market-muted)]">
        {story.body}
      </div>
      {story.tags && story.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {story.tags.slice(0, 3).map((tag) => (
            <button
              key={`${story.id}-${tag.label}`}
              type="button"
              disabled={!tag.caseId}
              onClick={(event) => {
                event.stopPropagation();
                onOpenCase(tag.caseId);
              }}
            className="rounded-[4px] border px-2.5 py-0.5 text-[10px] font-semibold disabled:cursor-default"
            style={{
              color: TONE_COLOR[story.tone],
              background: TONE_BG[story.tone],
                borderColor: colorMix(TONE_COLOR[story.tone], 0.24),
              }}
            >
              {tag.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--market-subtle)]">详情</div>
    </article>
  );
}

function WireRow({
  story,
  onOpenStory,
}: {
  key?: React.Key;
  story: WireStory;
  onOpenStory: (story: MarketStory) => void;
}) {
  const clickable = Boolean(story.detailStory);
  const content = (
    <>
      <div
        className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: TONE_COLOR[story.tone] }}
      />
      <span className="min-w-[28px] shrink-0 text-[10px] font-bold uppercase tracking-[0.09em] text-[var(--market-subtle)]">
        {story.section.split('·')[0]}
      </span>
      <span className="flex-1 text-[12px] leading-[1.65] text-[var(--market-muted)]">
        {story.text}
      </span>
      <span className="shrink-0 text-[10px] text-[var(--market-subtle)]">{story.time}</span>
    </>
  );

  if (clickable && story.detailStory) {
    return (
      <button
        type="button"
        onClick={() => onOpenStory(story.detailStory as MarketStory)}
        className="flex w-full items-baseline gap-2.5 border-b border-[rgba(255,255,255,0.05)] py-2 text-left transition hover:bg-[rgba(255,255,255,0.025)]"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex items-baseline gap-2.5 border-b border-[rgba(255,255,255,0.05)] py-2">
      {content}
    </div>
  );
}

function MarketStoryModal({
  story,
  projection,
  onClose,
  onOpenCase,
}: {
  story: MarketStory;
  projection: ReturnType<typeof buildMarketProjection>;
  onClose: () => void;
  onOpenCase: (caseId?: string) => void;
}) {
  const detailLines = buildStoryDetailLines(story, projection);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(5,8,12,0.66)] p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`市场情报详情：${story.headline}`}
      onMouseDown={onClose}
    >
      <div
        className="max-h-[86vh] w-full max-w-[760px] overflow-y-auto rounded-[24px] border border-[var(--market-border-strong)] bg-[var(--market-paper)] shadow-[0_28px_90px_rgba(0,0,0,0.42)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--market-border)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className="rounded-[3px] border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{
                    color: TONE_COLOR[story.tone],
                    background: TONE_BG[story.tone],
                    borderColor: colorMix(TONE_COLOR[story.tone], 0.35),
                  }}
                >
                  {story.section}
                </span>
                <ToneTag tone={story.tone} />
                <span className="text-[10px] text-[var(--market-subtle)]">{story.time}</span>
              </div>
              <h2 className="text-[24px] font-bold leading-[1.25] tracking-[-0.03em] text-[var(--market-ink)]">
                {story.headline}
              </h2>
              {story.deck ? (
                <p className="mt-3 text-[14px] font-semibold leading-6" style={{ color: TONE_COLOR[story.tone] }}>
                  {story.deck}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-[var(--market-border)] px-3 py-1.5 text-[11px] font-bold text-[var(--market-muted)] transition hover:border-[var(--market-border-strong)] hover:text-[var(--market-ink)]"
            >
              关闭
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="rounded-[18px] border border-[var(--market-border)] bg-[rgba(255,255,255,0.025)] px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--market-subtle)]">情报内容</div>
            <p className="mt-2 text-[13px] leading-7 text-[var(--market-muted)]">{story.body}</p>
          </div>

          {story.metrics && story.metrics.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {story.metrics.map((metric) => (
                <div
                  key={`${metric.label}-${metric.value}`}
                  className="rounded-[14px] border border-[var(--market-border)] bg-[rgba(255,255,255,0.025)] px-3 py-3"
                >
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--market-subtle)]">{metric.label}</div>
                  <div className="mt-1 text-[14px] font-bold tabular-nums" style={{ color: TONE_COLOR[metric.tone || story.tone] }}>
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div>
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--market-subtle)]">展开内容</div>
            <div className="space-y-2">
              {detailLines.map((line) => (
                <div
                  key={line}
                  className="rounded-[14px] border border-[var(--market-border)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5 text-[12px] leading-6 text-[var(--market-muted)]"
                >
                  {line}
                </div>
              ))}
            </div>
          </div>

          {story.tags && story.tags.length > 0 ? (
            <div>
              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--market-subtle)]">相关房源</div>
              <div className="flex flex-wrap gap-2">
                {story.tags.map((tag) => (
                  <button
                    key={`${story.id}-modal-${tag.label}-${tag.caseId || 'none'}`}
                    type="button"
                    disabled={!tag.caseId}
                    onClick={() => {
                      onOpenCase(tag.caseId);
                      onClose();
                    }}
                    className="rounded-[8px] border px-3 py-1.5 text-[11px] font-semibold disabled:cursor-default"
                    style={{
                      color: TONE_COLOR[story.tone],
                      background: TONE_BG[story.tone],
                      borderColor: colorMix(TONE_COLOR[story.tone], 0.28),
                    }}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SideMetric({
  metric,
}: {
  key?: React.Key;
  metric: ReturnType<typeof buildMarketProjection>['radarCards'][number];
}) {
  const color = TONE_COLOR[metric.tone];

  return (
    <div>
      <div className="mb-1.5 flex justify-between">
        <span className="text-[11px] text-[var(--market-muted)]">{metric.label}</span>
        <span className="text-[18px] font-bold leading-none tabular-nums" style={{ color }}>
          {metric.value}
        </span>
      </div>
      <div className="h-[2.5px] rounded-full bg-[rgba(255,255,255,0.07)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${clamp(metric.value, 4, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

function RivalRow({
  item,
  last,
}: {
  key?: React.Key;
  item: ProjectionBrief;
  last: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-2 py-[9px] ${last ? '' : 'border-b border-[rgba(255,255,255,0.05)]'}`}>
      <div>
        <div className="mb-0.5 text-[11px] font-bold text-[var(--market-ink)]">{item.title}</div>
        <div className="text-[10px] text-[var(--market-subtle)]">{extractDaysLeft(item.detail)}</div>
      </div>
      <span
        className="mt-0.5 shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold"
        style={{ color: TONE_COLOR[item.tone], background: TONE_BG[item.tone] }}
      >
        {item.tone === 'risk' ? '抢客很强' : item.tone === 'chance' ? '抢客明显' : '抢客一般'}
      </span>
    </div>
  );
}

function AffectedRow({
  item,
  last,
  onOpenCase,
}: {
  key?: React.Key;
  item: { caseId?: string; title: string; hits: number; tone: ProjectionTone };
  last: boolean;
  onOpenCase: (caseId?: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenCase(item.caseId)}
      className={`flex w-full items-center justify-between gap-2 py-[9px] text-left ${last ? '' : 'border-b border-[rgba(255,255,255,0.05)]'}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div
          className="h-[5px] w-[5px] shrink-0 rounded-full"
          style={{ background: TONE_COLOR[item.tone] }}
        />
        <span className="truncate text-[11px] font-semibold text-[var(--market-ink)]">{item.title}</span>
      </div>
      <span className="shrink-0 text-[14px] font-bold" style={{ color: TONE_COLOR[item.tone] }}>
        {item.hits}次
      </span>
    </button>
  );
}

function SectionHead({
  label,
  color = 'var(--market-border-strong)',
  count,
}: {
  label: string;
  color?: string;
  count?: number;
}) {
  return (
    <div className="mb-3.5">
      <Rule color={color} />
      <div className="flex items-center justify-between pt-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color }}>
          {label}
        </span>
        {count !== undefined ? (
          <span className="text-[10px] text-[var(--market-subtle)]">{count} 条</span>
        ) : null}
      </div>
    </div>
  );
}

function Rule({ color = 'var(--market-border-strong)' }: { color?: string }) {
  return <div className="h-[2px]" style={{ background: color }} />;
}

function ToneTag({ tone }: { tone: ProjectionTone }) {
  return (
    <span
      className="rounded-[3px] border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.09em]"
      style={{
        color: TONE_COLOR[tone],
        background: TONE_BG[tone],
        borderColor: colorMix(TONE_COLOR[tone], 0.30),
      }}
    >
      {tone === 'risk' ? '风险' : tone === 'chance' ? '机会' : '中性'}
    </span>
  );
}

function EmptyColumn({ activeSection }: { activeSection: SectionTab }) {
  return (
    <div className="pb-4 text-[12px] leading-6 text-[var(--market-subtle)]">
      {activeSection === '全部' ? '暂无更多市场情报。' : `${activeSection}暂无更多情报。`}
    </div>
  );
}

function openStoryFromKeyboard(
  event: React.KeyboardEvent,
  story: MarketStory,
  onOpenStory: (story: MarketStory) => void,
) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onOpenStory(story);
}

function buildStoryDetailLines(
  story: MarketStory,
  projection: ReturnType<typeof buildMarketProjection>,
) {
  const radarLine = buildStoryRadarLine(story, projection);
  return compactStoryLines([
    ...(story.detailLines || []),
    radarLine,
    story.tags && story.tags.length > 0 ? `相关房源：${story.tags.map((tag) => tag.label).join('、')}` : '',
  ]);
}

function buildStoryRadarLine(
  story: MarketStory,
  projection: ReturnType<typeof buildMarketProjection>,
) {
  const cards = projection.radarCards
    .filter((card) => card.tone === story.tone || story.headline.includes(card.label) || story.body.includes(card.label))
    .slice(0, 2);
  if (cards.length === 0) return '';
  return cards.map((card) => `${card.label} ${card.value}`).join('，');
}

function buildBoardDetailLine(board: ReturnType<typeof buildMarketProjection>['districtBoards'][number]) {
  if (board.tone === 'chance') {
    return `客户热度 ${board.demandHeat}，市场情绪 ${board.sentiment}，板块今天偏活跃。`;
  }
  if (board.tone === 'risk') {
    return `在售供给 ${board.supplyPressure}，竞争压力 ${board.competitivePressure}，同板块抢客更明显。`;
  }
  return `客户热度 ${board.demandHeat}，竞争压力 ${board.competitivePressure}，板块今天偏平稳。`;
}

function compactStoryLines(lines: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return lines
    .map((line) => (line || '').trim())
    .filter((line) => line.length > 0)
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .slice(0, 5);
}

function buildStories(
  state: GameState,
  projection: ReturnType<typeof buildMarketProjection>,
  caseTitleById: Map<string, string>,
): MarketStory[] {
  const signalStories = projection.signalFeed.map((item): MarketStory => ({
    id: `signal-${item.id}`,
    tone: item.tone,
    section: buildStorySection(item),
    filter: deriveStoryFilter(item),
    time: item.day === state.day ? '今天' : `第 ${item.day} 天`,
    headline: item.title,
    deck: item.summary,
    body: expandLeadBody(item.detail, item.summary, item.badge),
    tags: item.affectedCaseIds
      .map((caseId) => ({ label: caseTitleById.get(caseId) || caseId, caseId }))
      .slice(0, 4),
    score: scoreSignalItem(item),
    detailLines: compactStoryLines([
      item.detail,
      item.summary,
      item.affectedCaseIds.length > 0
        ? `影响房源：${item.affectedCaseIds.map((caseId) => caseTitleById.get(caseId) || caseId).join('、')}`
        : '',
    ]),
    metrics: [
      { label: '类型', value: item.badge, tone: item.tone },
      { label: '层级', value: buildStorySection(item), tone: 'neutral' },
      { label: '影响房源', value: `${item.affectedCaseIds.length} 套`, tone: item.affectedCaseIds.length > 0 ? 'warm' : 'neutral' },
      { label: '日期', value: item.day === state.day ? '今天' : `第 ${item.day} 天`, tone: 'neutral' },
    ],
  }));

  const boardStories = projection.districtBoards.map((board): MarketStory => ({
    id: `board-${board.marketId}`,
    tone: board.tone,
    section: '板块',
    filter: '板块',
    time: '今天',
    headline: board.title,
    deck: board.summary,
    body: `客户热度 ${board.demandHeat}，在售供给 ${board.supplyPressure}，竞争压力 ${board.competitivePressure}，市场情绪 ${board.sentiment}。`,
    tags: state.cases
      .filter((caseItem) => caseItem.marketCellId === board.marketId)
      .slice(0, 4)
      .map((caseItem) => ({ label: caseItem.title, caseId: caseItem.id })),
    score: scoreBoard(board),
    detailLines: compactStoryLines([
      board.summary,
      buildBoardDetailLine(board),
      `覆盖房源：${state.cases.filter((caseItem) => caseItem.marketCellId === board.marketId).map((caseItem) => caseItem.title).slice(0, 4).join('、')}`,
    ]),
    metrics: [
      { label: '客户热度', value: `${board.demandHeat}`, tone: board.tone },
      { label: '在售供给', value: `${board.supplyPressure}`, tone: board.supplyPressure >= 65 ? 'risk' : 'neutral' },
      { label: '竞争压力', value: `${board.competitivePressure}`, tone: board.competitivePressure >= 65 ? 'risk' : 'neutral' },
      { label: '市场情绪', value: `${board.sentiment}`, tone: board.sentiment >= 65 ? 'chance' : 'neutral' },
    ],
  }));

  const competitionStories = [
    ...projection.competitionBoards.rivalStores,
    ...projection.competitionBoards.rivalListings,
    ...projection.competitionBoards.companyPressure,
  ].map((item): MarketStory => ({
    id: `competition-${item.id}`,
    tone: item.tone,
    section: '竞争',
    filter: '竞品',
    time: '今天',
    headline: item.title,
    deck: item.label,
    body: item.detail,
    tags: item.caseId ? [{ label: caseTitleById.get(item.caseId) || item.title, caseId: item.caseId }] : [],
    score: item.caseId ? 54 : item.tone === 'risk' ? 42 : 30,
    detailLines: compactStoryLines([
      item.detail,
      item.caseId ? `关联房源：${caseTitleById.get(item.caseId) || item.title}` : item.label,
    ]),
    metrics: [
      { label: '来源', value: item.label, tone: item.tone },
      { label: '强度', value: item.tone === 'risk' ? '高' : item.tone === 'chance' ? '明显' : '一般', tone: item.tone },
    ],
  }));

  const affectedStories = projection.affectedCases.map((item): MarketStory => ({
    id: `affected-${item.id}`,
    tone: item.tone,
    section: '房源',
    filter: '房源',
    time: '今天',
    headline: item.title,
    deck: item.label,
    body: item.detail,
    tags: item.caseId ? [{ label: caseTitleById.get(item.caseId) || item.title, caseId: item.caseId }] : [],
    score: 70,
    detailLines: compactStoryLines([
      item.detail,
      item.caseId ? `关联房源：${caseTitleById.get(item.caseId) || item.title}` : item.label,
    ]),
    metrics: [
      { label: '影响', value: item.label, tone: item.tone },
      { label: '范围', value: item.caseId ? '单套房源' : '房源组', tone: 'neutral' },
    ],
  }));

  return dedupeStories([
    ...signalStories,
    ...boardStories,
    ...competitionStories,
    ...affectedStories,
  ]).sort((left, right) => scoreStory(right) - scoreStory(left));
}

function buildStorySection(item: ReturnType<typeof buildMarketProjection>['signalFeed'][number]) {
  if (item.layer === 'macro') return /政策|利率|监管|贷款/.test(`${item.title}${item.detail}`) ? '政策' : '成交';
  if (item.layer === 'district') return item.badge === '需求' ? '客户' : '板块';
  if (item.layer === 'competition') return '竞争';
  return '房源';
}

function deriveStoryFilter(item: ReturnType<typeof buildMarketProjection>['signalFeed'][number]): SectionTab | '竞品' {
  if (item.layer === 'macro') return /政策|利率|监管|贷款/.test(`${item.title}${item.detail}`) ? '政策' : '成交';
  if (item.layer === 'district') return item.badge === '需求' ? '客户' : '板块';
  if (item.layer === 'competition') return '竞品';
  return '房源';
}

function storyMatchesSection(story: MarketStory, activeSection: SectionTab) {
  if (activeSection === '全部') return true;
  if (activeSection === '房源') return story.filter === '房源' || story.filter === '竞品';
  if (activeSection === '成交') return story.filter === '成交' || /成交|带看|报价/.test(`${story.headline}${story.body}`);
  if (activeSection === '客户') return story.filter === '客户' || /客户|客群|线索/.test(`${story.headline}${story.body}`);
  return story.filter === activeSection;
}

function buildTickerItems(projection: ReturnType<typeof buildMarketProjection>): TickerItem[] {
  const radarItems: TickerItem[] = projection.radarCards.map((item) => ({
    label: item.label,
    value: `${item.value}`,
    delta: compactTickerDelta(item.label, item.value, item.tone),
    tone: item.tone,
  }));
  const boardItems: TickerItem[] = projection.districtBoards.slice(0, 3).map((board) => ({
    label: board.name,
    value: `${board.demandHeat}`,
    delta: board.tone === 'chance' ? '+热' : board.tone === 'risk' ? '偏紧' : '平',
    tone: board.tone,
  }));

  return [
    ...radarItems,
    { label: '风险信号', value: `${projection.intelSummary.riskCount}`, delta: '今日', tone: 'risk' as const },
    { label: '机会信号', value: `${projection.intelSummary.chanceCount}`, delta: '今日', tone: 'chance' as const },
    { label: '受影响房源', value: `${projection.affectedCases.length}套`, delta: '活跃', tone: 'warm' as const },
    ...boardItems,
  ].slice(0, 12);
}

function buildSectionCounts(stories: MarketStory[]): Record<SectionTab, number> {
  return SECTION_TABS.reduce((acc, section) => {
    acc[section] = stories.filter((story) => storyMatchesSection(story, section)).length;
    return acc;
  }, {} as Record<SectionTab, number>);
}

function buildFallbackStory(
  state: GameState,
  projection: ReturnType<typeof buildMarketProjection>,
): MarketStory {
  return {
    id: 'fallback',
    tone: 'neutral',
    section: '市场',
    filter: '全部',
    time: `第 ${state.day} 天`,
    headline: projection.headline || '今天市场变化不大',
    deck: buildRadarJudgement(projection.radarAxes),
    body: projection.summary || '今天没有新的强信号。',
  };
}

function splitIntoColumns(items: MarketStory[], count: number): MarketStory[][] {
  return Array.from({ length: count }, (_, columnIndex) => items.filter((_, index) => index % count === columnIndex));
}

function dedupeStories(stories: MarketStory[]) {
  const seen = new Set<string>();
  return stories.filter((story) => {
    const key = `${story.section}-${story.headline}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreStory(story: MarketStory) {
  let score = story.score || 0;
  if (story.filter === '竞品') score += 40;
  if (story.filter === '房源') score += 28;
  if (story.filter === '板块') score += 20;
  if (story.section.includes('竞争')) score += 14;
  if (story.tone === 'risk') score += 30;
  if (story.tone === 'chance') score += 18;
  if (story.time === '今天') score += 10;
  score += Math.min(story.tags?.length || 0, 4) * 2;
  return score;
}

function layerToSection(layer: IntelLayerTab): SectionTab {
  if (layer === 'macro') return '全部';
  if (layer === 'district') return '板块';
  if (layer === 'competition') return '房源';
  return '房源';
}

function buildRadarJudgement(radarAxes: ReturnType<typeof buildMarketProjection>['radarAxes']) {
  if (radarAxes.rivalActivity >= 70 || radarAxes.supplyPressure >= 70) {
    return '竞争压力偏高';
  }
  if (radarAxes.demandHeat >= 68 && radarAxes.customerActivity >= 62) {
    return '客户热度在抬头';
  }
  if (radarAxes.coSaleOpportunity >= 65) {
    return '同公司资源更好用';
  }
  return '市场变化不大';
}

function extractDaysLeft(detail: string) {
  const match = detail.match(/活跃\s*(\d+)\s*天/);
  if (match) return `剩 ${match[1]} 天`;
  return '活跃';
}

function colorMix(color: string, alpha: number) {
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function compactTickerDelta(label: string, value: number, tone: ProjectionTone) {
  if (label === '客户热度') return value >= 65 ? '+热' : value <= 40 ? '偏冷' : '平';
  if (label === '在售供给') return value >= 65 ? '偏多' : value <= 40 ? '偏少' : '平';
  if (label === '竞对动作') return value >= 65 ? '偏强' : '平';
  if (label === '客户活跃') return value >= 65 ? '走高' : value <= 40 ? '偏低' : '平';
  if (label === '联卖空间') return value >= 60 ? '可用' : value <= 35 ? '偏紧' : '一般';
  return tone === 'risk' ? '偏紧' : tone === 'chance' ? '走高' : '平';
}

function scoreSignalItem(item: ReturnType<typeof buildMarketProjection>['signalFeed'][number]) {
  let score = item.tone === 'risk' ? 66 : item.tone === 'chance' ? 52 : 24;
  if (item.layer === 'competition') score += 20;
  if (item.layer === 'listing') score += 26;
  if (item.layer === 'macro') score += 16;
  score += item.affectedCaseIds.length * 4;
  return score;
}

function scoreBoard(board: ReturnType<typeof buildMarketProjection>['districtBoards'][number]) {
  return board.tone === 'chance'
    ? 38 + Math.round(board.demandHeat / 6)
    : board.tone === 'risk'
      ? 40 + Math.round((board.competitivePressure + board.supplyPressure) / 10)
      : 18;
}

function expandLeadBody(detail: string, summary: string, badge: string) {
  if (detail.length >= 52) return detail;
  return `${detail} ${summary.replace(/[。.]$/, '')}，信号来源 ${badge}。`;
}

function buildLeadEvidence(
  projection: ReturnType<typeof buildMarketProjection>,
  tone: ProjectionTone,
) {
  const cards = projection.radarCards;
  const chanceTop = [...cards]
    .filter((card) => card.tone === 'chance')
    .sort((left, right) => right.value - left.value)[0];
  const riskTop = [...cards]
    .filter((card) => card.tone === 'risk')
    .sort((left, right) => right.value - left.value)[0];

  if (tone === 'risk' && riskTop) {
    return `${riskTop.label} ${riskTop.value}，${chanceTop ? `${chanceTop.label} ${chanceTop.value}。` : ''}`.trim();
  }
  if (tone === 'chance' && chanceTop) {
    return `${chanceTop.label} ${chanceTop.value}，${riskTop ? `${riskTop.label} ${riskTop.value}。` : ''}`.trim();
  }
  if (chanceTop || riskTop) {
    return [chanceTop ? `${chanceTop.label} ${chanceTop.value}` : null, riskTop ? `${riskTop.label} ${riskTop.value}` : null]
      .filter(Boolean)
      .join('，');
  }
  return '';
}

function buildWireStories(
  state: GameState,
  projection: ReturnType<typeof buildMarketProjection>,
  activeSection: SectionTab,
  filteredStories: MarketStory[],
  leadStoryId: string,
): WireStory[] {
  const extraStories = filteredStories
    .filter((story) => story.id !== leadStoryId)
    .slice(6, 12)
    .map((story) => ({
      id: `wire-story-${story.id}`,
      tone: story.tone,
      section: story.section,
      time: story.time,
      text: story.headline,
      detailStory: story,
    }));

  const radarStories = projection.radarCards.map((card) => ({
    id: `wire-radar-${card.id}`,
    tone: card.tone,
    section: card.label.includes('客户') ? '客户' : card.label.includes('联卖') ? '成交' : '板块',
    time: '今天',
    text: `${card.label} ${card.value}，${card.summary}`,
  }));

  const layerStories = projection.intelSummary.layers
    .filter((layer) => layer.totalCount > 0 && layer.lead)
    .map((layer) => ({
      id: `wire-layer-${layer.layer}`,
      tone: layer.lead?.tone || 'neutral',
      section: layer.label,
      time: '今天',
      text: `${layer.label} ${layer.totalCount} 条，${layer.summary}`,
    }));

  const affectedStories = buildAffectedRows(state, projection).map((item) => ({
    id: `wire-affected-${item.caseId || item.title}`,
    tone: item.tone,
    section: '房源',
    time: '今天',
    text: `${item.title} 被命中 ${item.hits} 次。`,
  }));

  const base = dedupeWireStories([
    ...extraStories,
    ...radarStories,
    ...layerStories,
    ...affectedStories,
  ]);

  const filtered = base.filter((story) => {
    if (activeSection === '全部') return true;
    if (activeSection === '成交') return /成交|带看|联卖/.test(`${story.section}${story.text}`);
    if (activeSection === '客户') return /客户|客群/.test(`${story.section}${story.text}`);
    if (activeSection === '房源') return /房源|竞品/.test(`${story.section}${story.text}`);
    return story.section.includes(activeSection);
  });

  return filtered.slice(0, 8);
}

function dedupeWireStories(stories: WireStory[]) {
  const seen = new Set<string>();
  return stories.filter((story) => {
    const key = `${story.section}-${story.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRivalRows(
  projection: ReturnType<typeof buildMarketProjection>,
): ProjectionBrief[] {
  const rows = [
    ...projection.competitionBoards.rivalListings,
    ...projection.competitionBoards.rivalStores,
    ...projection.competitionBoards.companyPressure,
  ];

  return rows.slice(0, 4);
}

function buildAffectedRows(
  state: GameState,
  projection: ReturnType<typeof buildMarketProjection>,
): Array<{ caseId?: string; title: string; hits: number; tone: ProjectionTone }> {
  const direct = projection.affectedCases.slice(0, 5).map((item) => {
    const hits = projection.signalFeed.filter((signal) => item.caseId && signal.affectedCaseIds.includes(item.caseId)).length;
    return {
      caseId: item.caseId,
      title: item.title,
      hits: Math.max(1, hits),
      tone: item.tone,
    };
  });

  if (direct.length > 0) return direct;

  const fallback = projection.districtBoards.flatMap((board) => (
    state.cases
      .filter((caseItem) => caseItem.marketCellId === board.marketId)
      .slice(0, 2)
      .map((caseItem) => ({
        caseId: caseItem.id,
        title: caseItem.title,
        hits: board.tone === 'chance' ? 1 : 2,
        tone: board.tone === 'neutral' ? 'chance' as const : board.tone,
      }))
  ));

  return fallback.slice(0, 4);
}
