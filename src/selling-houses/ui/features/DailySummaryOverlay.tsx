import React from 'react';
import type { DailyReport, DailyTickResult, GameState, TickInvariantAlert } from '../../domain/models';
import type { DailyCityStoryResult } from '../../application/dailyStory/storyContract';
import { buildDailyStoryContextPack } from '../../application/dailyStory/contextPackBuilder';
import { fetchDailyStory } from './dailyStoryClient';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpenText,
  Calendar,
  ListChecks,
  MapPinned,
  Radio,
  ShieldAlert,
  Star,
  SunMedium,
  Target,
  TrendingUp,
} from 'lucide-react';

interface DailySummaryOverlayProps {
  report: DailyReport;
  tickResult?: DailyTickResult | null;
  state?: GameState | null;
  onContinue: () => void;
}

type SummaryImpactRow = {
  id: string;
  label: string;
  title: string;
  detail: string;
  tone: string;
};

type SummaryRiskRow = {
  id: string;
  title: string;
  detail: string;
  tone: 'danger' | 'warning';
};

type CompactTodaySignalRow = {
  id: string;
  label: string;
  title: string;
  detail: string;
  tone: string;
};

type OvernightStory = {
  headline: string;
  kicker: string;
  paragraphs: string[];
  pulseLabel: string;
  pulseValue: string;
  todayHandle: string;
  evidenceLabels: string[];
};

export function DailySummaryOverlay({ report, tickResult, state, onContinue }: DailySummaryOverlayProps) {
  const overnightEvents = [
    ...report.majorEvents.map((entry) => ({ ...entry, kind: 'major' as const })),
    ...report.randomEvents.map((entry) => ({ ...entry, kind: 'random' as const })),
  ];
  const invariantAlerts = tickResult?.invariantAlerts || [];
  const impactRows = buildImpactRows(tickResult);
  const riskRows = buildRiskRows(report, invariantAlerts);
  const localStory = React.useMemo(
    () => buildOvernightStory(report, tickResult, impactRows, riskRows),
    [report, tickResult, impactRows, riskRows],
  );
  const storyContextPack = React.useMemo(
    () => buildDailyStoryContextPack({ report, tickResult, state }),
    [report, tickResult, state],
  );
  const [remoteStory, setRemoteStory] = React.useState<DailyCityStoryResult | null>(null);
  const story = React.useMemo(
    () => (remoteStory ? buildOvernightStoryFromDailyCityStory(remoteStory, localStory) : localStory),
    [localStory, remoteStory],
  );
  const keyMetrics = buildKeyMetrics(report.metricsDelta);
  const priorityRows = report.todayPlan.priorities.slice(0, 3);
  const hiddenPriorityCount = Math.max(0, report.todayPlan.priorities.length - priorityRows.length);
  const focusCases = report.todayPlan.focusCases.slice(0, 2);
  const hiddenFocusCount = Math.max(0, report.todayPlan.focusCases.length - focusCases.length);
  const compactSignalRows = buildCompactTodaySignalRows(impactRows, riskRows);
  const hiddenSignalCount = Math.max(0, impactRows.length + riskRows.length - compactSignalRows.length);

  React.useEffect(() => {
    let disposed = false;
    setRemoteStory(null);
    fetchDailyStory(storyContextPack, {
      playerId: 'seller-player',
      displayName: '资产顾问',
      role: 'broker',
      experienceLevel: 'expert',
      preferredStyle: 'storytelling',
      focusAreas: ['业主沟通', '客户承接', '竞品压力'],
    }).then((result) => {
      if (!disposed && result.story) {
        setRemoteStory(result.story);
      }
    });
    return () => {
      disposed = true;
    };
  }, [storyContextPack]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-md sm:p-5">
      <div className="seller-panel max-h-[82vh] w-full max-w-4xl overflow-hidden rounded-[18px] shadow-[var(--seller-shadow-lg)] animate-in fade-in zoom-in duration-300">
        <div className="flex items-center gap-3 bg-[var(--seller-ink)] px-5 py-3 text-white">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-[var(--seller-accent)] text-white">
            <Calendar size={17} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">日结算</div>
            <h2 className="truncate text-[16px] font-semibold tracking-[-0.02em] text-white sm:text-[18px]">{report.title}</h2>
          </div>
        </div>

        <div className="max-h-[calc(82vh-56px)] overflow-y-auto p-4 sm:p-5">
          <section className="mb-4 overflow-hidden rounded-[18px] border border-[var(--seller-border)] bg-[color-mix(in_srgb,var(--seller-paper)_92%,var(--seller-accent)_8%)]">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
              <div className="min-w-0 px-5 py-5 sm:px-6">
                <div className="seller-label flex items-center gap-2">
                  <BookOpenText size={14} className="text-[var(--seller-accent)]" />
                  昨夜故事
                </div>
                <h3 className="mt-3 max-w-[26ch] text-[22px] font-semibold leading-[1.25] tracking-[-0.02em] text-[var(--seller-ink)] sm:text-[26px]">
                  {story.headline}
                </h3>
                <p className="mt-3 max-w-[68ch] text-[13px] font-medium leading-6 text-[var(--seller-muted)]">
                  {story.kicker}
                </p>
                <div className="mt-4 grid gap-3 text-[13px] leading-6 text-[var(--seller-ink)]">
                  {story.paragraphs.map((paragraph, index) => (
                    <p key={`${paragraph}-${index}`} className={index === 0 ? 'font-semibold' : 'text-[var(--seller-muted)]'}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>

              <div className="border-t border-[var(--seller-border)] bg-[rgba(255,255,255,0.035)] px-5 py-5 lg:border-l lg:border-t-0">
                <div className="seller-label flex items-center gap-2">
                  <Radio size={13} className="text-[var(--seller-accent)]" />
                  今天怎么接
                </div>
                <div className="mt-4 grid gap-3">
                  <div>
                    <div className="text-[10px] font-semibold text-[var(--seller-subtle)]">{story.pulseLabel}</div>
                    <div className="mt-1 text-[18px] font-semibold text-[var(--seller-ink)]">{story.pulseValue}</div>
                  </div>
                  <p className="text-[12px] font-medium leading-6 text-[var(--seller-muted)]">{story.todayHandle}</p>
                  {story.evidenceLabels.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {story.evidenceLabels.map((label) => (
                        <span key={label} className="seller-chip">{label}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
            <section className="seller-panel-muted h-full">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="seller-label flex items-center gap-2 text-xs">
                    <Activity size={14} className="text-[var(--seller-accent)]" />
                    关键证据
                  </h4>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                    {keyMetrics.length} 项
                  </span>
                </div>

                <div className="mt-3 border-y border-black/[0.06] py-3">
                  <div className="seller-label">昨夜指标</div>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {keyMetrics.map((m, i) => (
                      <MetricCard key={`${m.label}-${i}`} metric={m} />
                    ))}
                  </div>
                </div>

                <div className="pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="seller-label flex items-center gap-2">
                      <ListChecks size={12} className="text-[var(--seller-subtle)]" />
                      昨夜证据线
                    </div>
                    {overnightEvents.length > 0 ? (
                      <span className="text-[10px] font-semibold text-slate-400">{overnightEvents.length} 条</span>
                    ) : null}
                  </div>
                  <div className="max-h-[228px] overflow-y-auto rounded-[14px] bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                    {overnightEvents.length > 0 ? (
                      overnightEvents.map((entry, index) => (
                        <EventRow
                          key={`${entry.kind}-${index}`}
                          actor={entry.actor}
                          message={entry.message}
                          tone={entry.tone}
                          isLast={index === overnightEvents.length - 1}
                        />
                      ))
                    ) : (
                      <div className="px-5 py-10 text-center text-sm text-slate-400">
                        昨天没有新的变化，经营整体比较平稳。
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <aside className="seller-panel-muted h-full">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="seller-label flex items-center gap-2 text-xs">
                    <SunMedium size={14} className="text-amber-500" />
                    今天安排
                  </h4>
                  <div className="flex shrink-0 gap-1.5">
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                      {report.todayPlan.label}
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                      {report.todayPlan.energy} 精力
                    </span>
                  </div>
                </div>

                <div className="mt-3 border-y border-black/[0.06] py-3">
                  <div className="seller-label">今日主题</div>
                  <div className="mt-1 text-[17px] font-semibold leading-6 text-slate-900">{report.todayPlan.theme}</div>
                  {focusCases.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {focusCases.map((name) => (
                        <span key={name} className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                          {name}
                        </span>
                      ))}
                      {hiddenFocusCount > 0 ? (
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-400 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                          +{hiddenFocusCount}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="seller-label flex items-center gap-2">
                      <Target size={12} className="text-amber-500" />
                      今日关注
                    </div>
                    {hiddenPriorityCount > 0 ? (
                      <span className="text-[10px] font-semibold text-slate-400">+{hiddenPriorityCount}</span>
                    ) : null}
                  </div>
                  {priorityRows.length > 0 ? (
                    <div className="divide-y divide-black/[0.05] overflow-hidden rounded-[14px] bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                      {priorityRows.map((item, index) => (
                        <CompactPriorityRow key={`${item}-${index}`} index={index + 1} text={item} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[14px] bg-white px-3 py-3 text-[12px] leading-5 text-slate-500 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                      今天没有明确待办，先盘点业主反馈和准客池。
                    </div>
                  )}
                </div>

                {compactSignalRows.length > 0 && (
                  <div className="mt-3 border-t border-black/[0.06] pt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="seller-label flex items-center gap-2">
                        <MapPinned size={12} className="text-emerald-600" />
                        影响与提醒
                      </div>
                      {hiddenSignalCount > 0 ? (
                        <span className="text-[10px] font-semibold text-slate-400">+{hiddenSignalCount}</span>
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      {compactSignalRows.map((row) => (
                        <CompactSignalRow key={row.id} label={row.label} title={row.title} detail={row.detail} tone={row.tone} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>

          <div className="pt-4">
            <button
              onClick={onContinue}
              className="seller-button-primary ml-auto flex items-center justify-center gap-2 px-5 py-3 text-sm"
            >
              进入今天
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ metric }: { key?: React.Key; metric: DailyReport['metricsDelta'][number] }) {
  const absolute = metric.displayMode === 'absolute';
  const valueText = absolute ? `${metric.value}${metric.unit}` : `${metric.value > 0 ? '+' : ''}${metric.value}${metric.unit}`;
  const valueClass = getMetricValueClass(metric);

  return (
    <div className="min-w-0 rounded-[12px] bg-slate-50 px-2.5 py-2">
      <div className="truncate text-[9px] font-bold text-slate-400">{metric.label}</div>
      <div className={`mt-1.5 text-[15px] font-bold tabular-nums ${valueClass}`}>
        {valueText}
      </div>
    </div>
  );
}

function getMetricValueClass(metric: DailyReport['metricsDelta'][number]) {
  if (metric.displayMode === 'absolute') {
    if (metric.value >= 70) return 'text-emerald-600';
    if (metric.value >= 50) return 'text-amber-600';
    return 'text-rose-600';
  }

  if (metric.label.includes('高危')) {
    if (metric.value < 0) return 'text-emerald-600';
    if (metric.value > 0) return 'text-rose-600';
    return 'text-slate-500';
  }

  return metric.value > 0 ? 'text-emerald-600' : metric.value < 0 ? 'text-rose-600' : 'text-slate-500';
}

function buildKeyMetrics(metrics: DailyReport['metricsDelta']): DailyReport['metricsDelta'] {
  const absoluteMetrics = metrics.filter((metric) => metric.displayMode === 'absolute');
  const deltaMetrics = metrics
    .filter((metric) => metric.displayMode !== 'absolute')
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const selected = [...absoluteMetrics, ...deltaMetrics].slice(0, 4);

  return selected.length > 0 ? selected : metrics.slice(0, 4);
}

function buildOvernightStory(
  report: DailyReport,
  tickResult: DailyTickResult | null | undefined,
  impactRows: SummaryImpactRow[],
  riskRows: SummaryRiskRow[],
): OvernightStory {
  const absoluteMetric = getAbsoluteScoreMetric(report.metricsDelta);
  const sharpestMetric = getSharpestMetricChange(report.metricsDelta);
  const narrativeParagraphs = splitNarrativeText(report);
  const paragraphs = narrativeParagraphs.length > 0
    ? narrativeParagraphs.slice(0, 3)
    : buildFallbackStoryParagraphs(report, impactRows, riskRows);
  const closedDealsCount = tickResult?.closedDeals.length ?? 0;
  const scoreText = absoluteMetric ? `${absoluteMetric.value}${absoluteMetric.unit}` : null;
  const sharpestLabel = sharpestMetric ? cleanMetricLabel(sharpestMetric.label) : null;
  const sharpestText = sharpestMetric ? formatMetricValue(sharpestMetric) : null;
  const firstFocusCase = report.todayPlan.focusCases[0];
  const firstPriority = report.todayPlan.priorities[0];
  const leadImpact = impactRows[0]?.title;

  let headline = '昨夜没有大爆点，但今天不能空转';
  if (closedDealsCount > 0) {
    headline = `昨夜成交落袋，今天要接住余温`;
  } else if (sharpestMetric && sharpestMetric.value < 0) {
    headline = `昨夜主线：${sharpestLabel}被拉低`;
  } else if (sharpestMetric && sharpestMetric.value > 0) {
    headline = `昨夜主线：${sharpestLabel}有进展`;
  } else if (leadImpact) {
    headline = `昨夜主线落在${leadImpact}`;
  }

  const scoreClause = scoreText ? `收盘 ${scoreText}` : '收盘状态已经更新';
  const sharpestClause = sharpestLabel && sharpestText ? `，${sharpestLabel} ${sharpestText}` : '';
  const kicker = `${scoreClause}${sharpestClause}。这不是一张分数表，而是今天先补哪条关系、先推哪套房的开场。`;

  const pulseLabel = sharpestMetric?.value && sharpestMetric.value < 0
    ? '最需要补的线'
    : closedDealsCount > 0
      ? '成交后续'
      : '今日抓手';
  const pulseValue = sharpestMetric && sharpestText
    ? `${sharpestLabel} ${sharpestText}`
    : firstFocusCase || report.todayPlan.theme;
  const todayHandle = firstPriority
    ? `先做：${oneLine(firstPriority, 46)}`
    : firstFocusCase
      ? `先围绕 ${firstFocusCase} 做一次推进。`
      : `先按「${report.todayPlan.theme}」推进，别让昨天的变化过夜。`;
  const evidenceLabels = [
    scoreText ? `总分 ${scoreText}` : null,
    sharpestLabel && sharpestText ? `${sharpestLabel} ${sharpestText}` : null,
    riskRows[0] ? '有风险线索' : null,
    impactRows[0] ? buildImpactEvidenceLabel(impactRows[0]) : null,
  ].filter(Boolean) as string[];

  return {
    headline,
    kicker,
    paragraphs,
    pulseLabel,
    pulseValue,
    todayHandle,
    evidenceLabels: Array.from(new Set(evidenceLabels)).slice(0, 4),
  };
}

function buildOvernightStoryFromDailyCityStory(
  dailyStory: DailyCityStoryResult,
  fallbackStory: OvernightStory,
): OvernightStory {
  const paragraphs = dailyStory.cityStory.paragraphs
    .map((paragraph) => normalizeNarrativeText(paragraph))
    .filter(Boolean)
    .slice(0, 6);

  return {
    headline: dailyStory.headline || fallbackStory.headline,
    kicker: dailyStory.deck || fallbackStory.kicker,
    paragraphs: paragraphs.length > 0 ? paragraphs : fallbackStory.paragraphs,
    pulseLabel: dailyStory.todayBridge.label || fallbackStory.pulseLabel,
    pulseValue: dailyStory.todayBridge.value || fallbackStory.pulseValue,
    todayHandle: dailyStory.todayBridge.actionCue || fallbackStory.todayHandle,
    evidenceLabels: dailyStory.evidenceLabels.length > 0
      ? dailyStory.evidenceLabels.slice(0, 5)
      : fallbackStory.evidenceLabels,
  };
}

function getAbsoluteScoreMetric(metrics: DailyReport['metricsDelta']) {
  return metrics.find((metric) => metric.displayMode === 'absolute') || null;
}

function getSharpestMetricChange(metrics: DailyReport['metricsDelta']) {
  const deltas = metrics.filter((metric) => metric.displayMode !== 'absolute');
  const nonZero = deltas.filter((metric) => metric.value !== 0);
  const candidates = nonZero.length > 0 ? nonZero : deltas;

  return [...candidates].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0] || null;
}

function splitNarrativeText(report: DailyReport) {
  const log = report.narrativeLog;
  const directBlocks = log
    ? [log.openingHook, log.midTwist, log.lateUndercurrent, log.tomorrowHook].filter(Boolean)
    : [];
  const sourceBlocks = directBlocks.length > 0
    ? directBlocks
    : log?.text.split(/\n{2,}|\n/).filter(Boolean) || [];
  const seen = new Set<string>();

  return sourceBlocks
    .map((block) => oneLine(normalizeNarrativeText(block || ''), 96))
    .filter((block) => {
      if (!block || seen.has(block)) return false;
      seen.add(block);
      return true;
    });
}

function buildFallbackStoryParagraphs(
  report: DailyReport,
  impactRows: SummaryImpactRow[],
  riskRows: SummaryRiskRow[],
) {
  const events = [...report.majorEvents, ...report.randomEvents];
  const paragraphs: string[] = [];
  const leadEvent = events[0];

  if (leadEvent) {
    paragraphs.push(`${leadEvent.actor}这条线先发生变化：${oneLine(leadEvent.message, 72)}`);
  }
  if (impactRows[0]) {
    paragraphs.push(`它会影响到 ${impactRows[0].title}，今天需要把这条推进重新接住。`);
  }
  if (riskRows[0]) {
    paragraphs.push(`${riskRows[0].title}：${oneLine(riskRows[0].detail, 70)}`);
  }
  if (paragraphs.length === 0 && report.marketNews[0]) {
    paragraphs.push(oneLine(report.marketNews[0], 90));
  }
  if (paragraphs.length === 0) {
    paragraphs.push('昨夜没有明显爆点，但沉默也会消耗窗口。今天先把最容易推进的一条线做实。');
  }

  return paragraphs.slice(0, 3);
}

function cleanMetricLabel(label: string) {
  return label.replace(/变化|变动/g, '').trim();
}

function formatMetricValue(metric: DailyReport['metricsDelta'][number]) {
  const prefix = metric.displayMode === 'absolute' || metric.value <= 0 ? '' : '+';
  return `${prefix}${metric.value}${metric.unit}`;
}

function buildImpactEvidenceLabel(row: SummaryImpactRow) {
  if (row.label === '变化') return '有业务变化';
  return row.label.endsWith('变化') ? row.label : `${row.label}变化`;
}

function EventRow({
  actor,
  message,
  tone,
  isLast,
}: {
  key?: React.Key;
  actor: string;
  message: string;
  tone: string;
  isLast: boolean;
}) {
  const toneClass = tone === 'success'
    ? 'text-emerald-500'
    : tone === 'danger'
      ? 'text-rose-500'
      : 'text-amber-500';

  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 ${isLast ? '' : 'border-b border-black/[0.05]'}`}>
      <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 ${toneClass}`}>
        {tone === 'success' && <Star size={11} />}
        {tone === 'danger' && <AlertCircle size={11} />}
        {tone === 'accent' && <TrendingUp size={11} />}
      </div>
      <div className="min-w-0">
        <div className="mb-0.5 text-[10px] font-bold text-slate-400">{actor}</div>
        <p className="text-[12px] font-semibold leading-5 text-slate-700">{oneLine(message, 62)}</p>
      </div>
    </div>
  );
}

function CompactPriorityRow({ index, text }: { key?: React.Key; index: number; text: string }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
        {index}
      </div>
      <div className="min-w-0 text-[12px] font-semibold leading-5 text-slate-700">{oneLine(text, 34)}</div>
    </div>
  );
}

function CompactSignalRow({
  label,
  title,
  detail,
  tone,
}: {
  key?: React.Key;
  label: string;
  title: string;
  detail: string;
  tone: string;
}) {
  const toneClass = tone === 'danger'
    ? 'bg-rose-50 text-rose-600'
    : tone === 'success'
      ? 'bg-emerald-50 text-emerald-600'
      : 'bg-slate-100 text-slate-500';
  const Icon = tone === 'danger' || label === '提醒' ? ShieldAlert : MapPinned;

  return (
    <div className="rounded-[14px] bg-white px-3 py-2 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${toneClass}`}>
          <Icon size={11} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] font-bold text-slate-400">{label}</span>
            <span className="min-w-0 text-[12px] font-semibold leading-5 text-slate-800">{oneLine(title, 24)}</span>
          </div>
          <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{oneLine(detail, 38)}</p>
        </div>
      </div>
    </div>
  );
}

function buildCompactTodaySignalRows(
  impactRows: SummaryImpactRow[],
  riskRows: SummaryRiskRow[],
): CompactTodaySignalRow[] {
  const rows: CompactTodaySignalRow[] = [
    ...impactRows.map((row) => ({
      id: row.id,
      label: row.label,
      title: row.title,
      detail: row.detail,
      tone: row.tone,
    })),
    ...riskRows.map((row) => ({
      id: row.id,
      label: '提醒',
      title: row.title,
      detail: row.detail,
      tone: row.tone,
    })),
  ];
  const seen = new Set<string>();

  return rows.filter((row) => {
    const key = `${row.title}-${row.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 2);
}

function buildImpactRows(tickResult?: DailyTickResult | null): SummaryImpactRow[] {
  if (!tickResult) {
    return [];
  }

  const rows: SummaryImpactRow[] = [];
  const used = new Set<string>();
  const addRow = (row: SummaryImpactRow) => {
    const key = `${row.label}-${row.title}-${row.detail}`;
    if (!used.has(key)) {
      used.add(key);
      rows.push(row);
    }
  };

  const caseLabels = buildCaseScopeLabels(tickResult);
  const customerLabels = buildCustomerScopeLabels(tickResult);

  tickResult.closedDeals.forEach((deal) => {
    const district = tickResult.dirtyScopes.districts[0];
    addRow({
      id: `deal-${deal.dealId}`,
      label: '成交',
      title: deal.caseTitle || deal.caseId,
      detail: `${district ? `${district} · ` : ''}${deal.customerName || '客户'} · ${Math.round(deal.dealPrice || deal.price)} 万成交。`,
      tone: 'success',
    });
  });

  tickResult.emittedEvents.slice(0, 5).forEach((event) => {
    const caseLabel = event.caseId ? caseLabels.get(event.caseId) : null;
    const customerLabel = event.customerId ? customerLabels.get(event.customerId) : null;
    const title = event.title || event.actor;
    const subject = caseLabel || customerLabel || nonTechnicalActor(event.actor) || deriveEventKindLabel(event.kind);
    addRow({
      id: event.id,
      label: deriveImpactLabel(event),
      title: subject ? `${subject} · ${title}` : title,
      detail: oneLine(event.detail, 58),
      tone: event.tone,
    });
  });

  tickResult.dirtyScopes.cases.slice(0, 3).forEach((caseId) => {
    const label = caseLabels.get(caseId);
    if (label) {
      const district = tickResult.dirtyScopes.districts[0];
      addRow({
        id: `dirty-case-${caseId}`,
        label: '房源',
        title: label,
        detail: district ? `${district} · 状态、窗口或客户推进发生变化。` : '状态、窗口或客户推进发生变化。',
        tone: 'accent',
      });
    }
  });
  tickResult.dirtyScopes.customers.slice(0, 2).forEach((customerId) => {
    const label = customerLabels.get(customerId);
    if (label) {
      addRow({
        id: `dirty-customer-${customerId}`,
        label: '准客',
        title: label,
        detail: '意向、把握或掉线风险发生变化。',
        tone: 'accent',
      });
    }
  });
  tickResult.dirtyScopes.owners.slice(0, 2).forEach((ownerRef) => {
    if (!isTechnicalToken(ownerRef)) {
      addRow({
        id: `dirty-owner-${ownerRef}`,
        label: '业主',
        title: ownerRef,
        detail: '信任、耐心或紧迫度发生变化。',
        tone: 'accent',
      });
    }
  });
  tickResult.dirtyScopes.districts.slice(0, 2).forEach((district) => {
    addRow({
      id: `dirty-district-${district}`,
      label: '商圈',
      title: district,
      detail: '供给、竞争或客户活跃度发生变化。',
      tone: 'accent',
    });
  });
  if (tickResult.dirtyScopes.market) {
    addRow({
      id: 'dirty-market',
      label: '市场',
      title: '市场层有波动',
      detail: '会影响客户比较、竞品热度和今日关注顺序。',
      tone: 'accent',
    });
  }

  return rows.slice(0, 4);
}

function buildRiskRows(report: DailyReport, invariantAlerts: TickInvariantAlert[]): SummaryRiskRow[] {
  const invariantRows = invariantAlerts.map((alert, index) => ({
    id: `invariant-${alert.code}-${index}`,
    title: alert.level === 'error' ? '需修正' : '请留意',
    detail: alert.message,
    tone: alert.level === 'error' ? 'danger' as const : 'warning' as const,
  }));
  const eventRows = [...report.majorEvents, ...report.randomEvents]
    .filter((event) => event.tone === 'danger')
    .map((event, index) => ({
      id: `event-risk-${index}`,
      title: event.actor,
      detail: oneLine(event.message, 62),
      tone: 'danger' as const,
    }));

  return [...invariantRows, ...eventRows].slice(0, 4);
}

function buildCaseScopeLabels(tickResult: DailyTickResult) {
  const labels = new Map<string, string>();

  tickResult.closedDeals.forEach((deal) => {
    if (deal.caseId && deal.caseTitle) {
      labels.set(deal.caseId, deal.caseTitle);
    }
  });

  tickResult.emittedEvents.forEach((event) => {
    if (!event.caseId || labels.has(event.caseId)) return;
    const label = extractCaseLabelFromEvent(event);
    if (label) {
      labels.set(event.caseId, label);
    }
  });

  return labels;
}

function buildCustomerScopeLabels(tickResult: DailyTickResult) {
  const labels = new Map<string, string>();

  tickResult.closedDeals.forEach((deal) => {
    if (deal.customerId && deal.customerName) {
      labels.set(deal.customerId, deal.customerName);
    }
  });

  tickResult.emittedEvents.forEach((event) => {
    if (!event.customerId || labels.has(event.customerId)) return;
    if (event.actor && !isTechnicalToken(event.actor)) {
      labels.set(event.customerId, event.actor);
    }
  });

  return labels;
}

function extractCaseLabelFromEvent(event: DailyTickResult['emittedEvents'][number]) {
  const payloadCaseTitle = event.payload?.caseTitle;
  if (typeof payloadCaseTitle === 'string' && payloadCaseTitle.trim()) {
    return payloadCaseTitle.trim();
  }

  const areaTitle = event.detail.match(/^(.+?\d+㎡\s*[^\s，。]+)/);
  if (areaTitle?.[1]) {
    return areaTitle[1].trim();
  }

  const beforeWindow = event.detail.split(' 推进窗口')[0]?.trim();
  if (beforeWindow && beforeWindow !== event.detail && !isTechnicalToken(beforeWindow)) {
    return beforeWindow;
  }

  return null;
}

function deriveImpactLabel(event: DailyTickResult['emittedEvents'][number]) {
  if (event.kind === 'case_sold' || event.kind === 'opportunity_closed') return '成交';
  if (event.kind === 'case_lost_to_rival') return '竞品';
  if (event.kind === 'case_withdrawn') return '核销';
  if (event.kind === 'market_event' || event.actor.includes('市场')) return '市场';
  if (event.opportunityId || event.customerId) return '准客';
  if (event.caseId) return '房源';
  return deriveEventKindLabel(event.kind);
}

function deriveEventKindLabel(kind: DailyTickResult['emittedEvents'][number]['kind']) {
  if (kind === 'budget_changed') return '资源';
  if (kind === 'action_executed') return '动作';
  if (kind === 'opportunity_advanced') return '准客';
  if (kind === 'window_extended') return '窗口';
  return '变化';
}

function nonTechnicalActor(actor: string) {
  return actor && !isTechnicalToken(actor) ? actor : null;
}

function isTechnicalToken(value: string) {
  return /^(case|cus|opp|event|matter|run)-/.test(value);
}

function oneLine(text: string, limit: number) {
  const normalized = normalizeStoryText(text);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1)}…`;
}

function normalizeStoryText(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。！？、；：])/g, '$1')
    .replace(/([。！？]){2,}/g, '$1')
    .replace(/([，、；：]){2,}/g, '$1')
    .trim();
}

function normalizeNarrativeText(text: string) {
  return normalizeStoryText(text)
    .replace(/([\u4e00-\u9fff]{2,})\s+(被|把|对|将|已|仍|直接|开始|进入|失去|拉低|抬升)/g, '$1$2');
}
