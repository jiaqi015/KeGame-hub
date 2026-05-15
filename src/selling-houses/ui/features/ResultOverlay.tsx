import React, { useMemo } from 'react';
import type { GameState, ScoreAttribution, ScoreAttributionItem } from '../../domain/models';
import { buildResultProjection } from '../../application/projections/resultProjection.js';
import {
  ArrowRightLeft,
  CircleDollarSign,
  Clock3,
  Layers3,
  Lightbulb,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  Trophy,
  TriangleAlert,
  TrendingUp,
  Users,
} from 'lucide-react';

interface ResultOverlayProps {
  state: GameState;
  onRestart: () => void;
}

type ResultTone = 'neutral' | 'chance' | 'risk';

export function ResultOverlay({ state, onRestart }: ResultOverlayProps) {
  const projection = useMemo(() => buildResultProjection(state), [state]);
  const { customerReview } = projection;
  const finalResult = state.finalResult;
  const soldCard = projection.summaryCards.find((entry) => entry.label === '本局成交');
  const lostCard = projection.summaryCards.find((entry) => entry.label === '他处成交 / 核销');
  const activeCard = projection.summaryCards.find((entry) => entry.label === '仍在场上');
  const settlementLines = [
    soldCard,
    lostCard,
    activeCard,
  ].filter((entry): entry is { label: string; value: string; note: string; tone: ResultTone } => Boolean(entry));
  const primaryTakeaways = uniqueStrings([
    ...projection.improvements,
    ...projection.nextRunAdvice,
  ]).slice(0, 3);

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[rgba(2,10,18,0.82)] p-4 backdrop-blur-md sm:p-6">
      <div className="mx-auto my-4 w-full max-w-6xl overflow-hidden rounded-[28px] border border-[rgba(148,163,184,0.2)] bg-[linear-gradient(180deg,rgba(13,35,55,0.98),rgba(8,22,35,0.98))] text-[var(--seller-ink)] shadow-[0_28px_90px_rgba(0,0,0,0.42)] animate-in fade-in zoom-in duration-300 sm:my-8">
        <section className="relative overflow-hidden border-b border-white/10 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
          <div className="pointer-events-none absolute right-[-120px] top-[-180px] h-[360px] w-[360px] rounded-full bg-[color:var(--seller-accent)]/10 blur-3xl" />
          <div className="relative space-y-6">
            <div className="min-w-0">
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-[var(--seller-subtle)]">
                  <Trophy size={14} />
                  本局正式结算
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--seller-muted)]">
                  {projection.hero.difficultyId}
                </span>
                <span className={gradeChipClass(projection.hero.grade)}>{projection.hero.grade}</span>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
                <div className="min-w-0">
                  <h2 className="max-w-3xl text-[30px] font-black leading-tight tracking-[-0.06em] text-[var(--seller-ink)] sm:text-[42px]">
                    {projection.hero.title}
                  </h2>
                  <p className="mt-4 max-w-[62ch] text-[14px] font-medium leading-7 text-[var(--seller-muted)]">
                    {projection.hero.summary}
                  </p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-black/15 px-5 py-4 lg:text-right">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--seller-subtle)]">最终分</div>
                  <div className="mt-1 flex items-baseline gap-2 lg:justify-end">
                    <span className="text-[64px] font-black leading-none tracking-[-0.08em] text-[var(--seller-ink)] sm:text-[78px]">
                      {projection.hero.score}
                    </span>
                    <span className="pb-2 text-lg font-bold text-[var(--seller-subtle)]">
                      / 100
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-black/15 p-3">
              <div className="flex items-center gap-2 px-1 text-[11px] font-bold text-[var(--seller-subtle)]">
                <Trophy size={13} />
                结算判定
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {settlementLines.slice(0, 4).map((line) => (
                  <LedgerLine key={line.label} line={line} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
              <SectionHeader icon={<Sparkles size={15} />} eyebrow="房源结局" />
              <div className="mt-5 space-y-5">
                {projection.tierGroups.map((group) => (
                  <TierSettlementBlock key={group.goalTier} group={group} />
                ))}
              </div>
            </div>

            <aside className="space-y-4">
              <section className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
                <SectionHeader icon={<TriangleAlert size={15} />} eyebrow="回看点" />
                <StackNotes items={primaryTakeaways} empty="这局没有明显回看点。" compact />
              </section>

              {projection.marketOutcome && (
                <section className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
                  <SectionHeader icon={<Layers3 size={15} />} eyebrow={projection.marketOutcome.title} />
                  <p className="mt-3 text-[13px] font-medium leading-6 text-[var(--seller-muted)]">
                    {projection.marketOutcome.summary}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {projection.marketOutcome.metrics.slice(0, 4).map((metric) => (
                      <CompactMetric key={metric.label} metric={metric} />
                    ))}
                  </div>
                </section>
              )}
            </aside>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
            <SectionHeader icon={<Users size={15} />} eyebrow="客户沉淀" />
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]">
              {customerReview && (
                <div>
                  <div className="grid grid-cols-4 gap-2">
                    <TierPill label="推进中" value={customerReview.engaged} tone="emerald" />
                    <TierPill label="比较中" value={customerReview.comparing} tone="amber" />
                    <TierPill label="风险" value={customerReview.atRisk} tone="rose" />
                    <TierPill label="被带偏" value={customerReview.rivalPulled} tone="slate" />
                  </div>
                  <p className="mt-4 text-[13px] font-medium leading-6 text-[var(--seller-muted)]">{customerReview.summary}</p>
                </div>
              )}

              <div>
                <SectionHeader icon={<Lightbulb size={15} />} eyebrow="下局入口" />
                <StackNotes items={projection.nextRunAdvice.length ? projection.nextRunAdvice : projection.coachNotes} empty="下局先从最重要的房源排序开始。" compact />
              </div>
            </div>
          </section>

          <section>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
              <SectionHeader icon={<Target size={15} />} eyebrow="得分来源" />
              <div className="mt-5 space-y-3">
                {projection.scoreBreakdown.map((entry) => (
                  <ScoreBreakdownCard key={entry.label} entry={entry} />
                ))}
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[12px] font-medium leading-6 text-[var(--seller-subtle)]">
              结算已经保存。先看清这局的成交、流失和单房结局，再开下一局会更稳。
            </div>
            <button
              onClick={onRestart}
              className="seller-button-primary flex shrink-0 items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-sm font-bold transition-all hover:scale-[1.01]"
            >
              <RefreshCw size={17} />
              <span>再来一局</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TierSettlementBlock({
  group,
}: {
  group: ReturnType<typeof buildResultProjection>['tierGroups'][number];
  key?: string;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[14px] font-black text-[var(--seller-ink)]">
            {group.goalTier === 'core'
              ? <Target size={16} className="text-[var(--seller-risk)]" />
              : group.goalTier === 'important'
                ? <ShieldAlert size={16} className="text-[var(--seller-accent)]" />
                : <Sparkles size={16} className="text-[var(--seller-subtle)]" />}
            {group.label}
            <span className="text-[11px] font-bold text-[var(--seller-subtle)]">{group.total} 套</span>
          </div>
          <p className="mt-1 text-[12px] font-medium leading-5 text-[var(--seller-muted)]">{group.preview}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OutcomeCount label="好" value={group.good} tone="chance" />
          <OutcomeCount label="一般" value={group.neutral} tone="neutral" />
          <OutcomeCount label="差" value={group.bad} tone="risk" />
          <OutcomeCount label="被抢" value={group.lost} tone="risk" />
        </div>
      </div>

      {group.items.length > 0 ? (
        <div className="overflow-hidden rounded-[18px] border border-white/10 bg-black/10">
          {group.items.map((item, index) => (
            <FormalCaseResultRow key={item.caseId} item={item} isLast={index === group.items.length - 1} />
          ))}
        </div>
      ) : (
        <div className="rounded-[18px] border border-dashed border-white/10 px-4 py-5 text-center text-[12px] font-medium text-[var(--seller-subtle)]">
          这组本局没有房源需要结算。
        </div>
      )}
    </section>
  );
}

function FormalCaseResultRow({
  item,
  isLast,
}: {
  item: NonNullable<ReturnType<typeof buildResultProjection>['tierGroups'][number]['items'][number]>;
  isLast: boolean;
  key?: string;
}) {
  return (
    <div className={`grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_260px] ${isLast ? '' : 'border-b border-white/10'}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="truncate text-[16px] font-black tracking-[-0.03em] text-[var(--seller-ink)]">{item.title}</div>
          <span className={endingClass(item.endingBucket)}>{item.endingBucketLabel}</span>
          <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-[var(--seller-subtle)]">{item.endingLabel}</span>
        </div>
        <p className="mt-2 max-w-[72ch] text-[13px] font-medium leading-6 text-[var(--seller-muted)]">{item.endingSummary}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
        <MiniFact label="同类结果" value={item.relativeOutcomeLabel} />
        <MiniFact label="房源去向" value={item.defenseOutcomeLabel} />
        <MiniFact label="业主感受" value={item.ownerSatisfactionLabel} />
        <MiniFact label="结果价" value={item.soldPrice ? `${item.soldPrice} 万` : '--'} />
      </div>
    </div>
  );
}

function LedgerLine({ line }: { line: { label: string; value: string; note: string; tone: ResultTone }; key?: string }) {
  return (
    <div className="flex min-h-[68px] items-start justify-between gap-4 rounded-[14px] bg-white/[0.04] px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[11px] font-bold text-[var(--seller-subtle)]">{line.label}</div>
        <div className="mt-0.5 truncate text-[11px] font-medium text-[var(--seller-muted)]">{line.note}</div>
      </div>
      <div className={`shrink-0 text-[18px] font-black ${toneTextClass(line.tone)}`}>{line.value}</div>
    </div>
  );
}

function SectionHeader({ icon, eyebrow }: { icon: React.ReactNode; eyebrow: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[12px] font-black tracking-[0.04em] text-[var(--seller-ink)]">
        {icon}
        {eyebrow}
      </div>
    </div>
  );
}

function CompactMetric({
  metric,
}: {
  metric: { label: string; value: string; note: string; tone: ResultTone };
  key?: string;
}) {
  return (
    <div className="rounded-[14px] bg-black/12 px-3 py-2.5">
      <div className="text-[10px] font-bold text-[var(--seller-subtle)]">{metric.label}</div>
      <div className={`mt-1 text-[16px] font-black ${toneTextClass(metric.tone)}`}>{metric.value}</div>
      <div className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-4 text-[var(--seller-muted)]">{metric.note}</div>
    </div>
  );
}

function StackNotes({ items, empty, compact = false }: { items: string[]; empty: string; compact?: boolean }) {
  if (items.length === 0) {
    return <div className="mt-4 rounded-[16px] border border-dashed border-white/10 px-4 py-3 text-sm text-[var(--seller-subtle)]">{empty}</div>;
  }

  return (
    <div className="mt-4 space-y-2">
      {items.map((entry, index) => (
        <div key={`${entry}-${index}`} className={`rounded-[16px] bg-black/12 px-4 ${compact ? 'py-3 text-[13px]' : 'py-4 text-sm'} font-medium leading-6 text-[var(--seller-muted)]`}>
          {entry}
        </div>
      ))}
    </div>
  );
}

function ScoreBreakdownCard({
  entry,
}: {
  entry: {
    label: string;
    value: number;
    maxValue?: number;
    summary?: string;
    attribution?: ScoreAttribution;
  };
  key?: string;
}) {
  const maxValue = entry.maxValue || 100;
  const width = `${Math.max(0, Math.min(100, (entry.value / maxValue) * 100))}%`;
  return (
    <div className="rounded-[18px] bg-black/12 px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[14px] font-black text-[var(--seller-ink)]">{entry.label}</div>
          {entry.summary && <div className="mt-1 text-[12px] font-medium leading-5 text-[var(--seller-muted)]">{entry.summary}</div>}
        </div>
        <span className="shrink-0 text-[15px] font-black text-[var(--seller-chance)]">
          {entry.value}{entry.maxValue ? ` / ${entry.maxValue}` : ''}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-[var(--seller-chance)]" style={{ width }} />
      </div>
      {entry.attribution && <ScoreAttributionBlock attribution={entry.attribution} />}
    </div>
  );
}

function ScoreAttributionBlock({ attribution }: { attribution: ScoreAttribution }) {
  const items = [...attribution.actions, ...attribution.events].slice(0, 5);
  if (!items.length) {
    return (
      <div className="mt-3 rounded-[14px] border border-dashed border-white/10 px-3 py-2 text-[11px] leading-5 text-[var(--seller-subtle)]">
        {attribution.headline}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-[14px] bg-white/[0.035] px-3 py-2">
      <div className="text-[11px] leading-5 text-[var(--seller-muted)]">{attribution.headline}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <AttributionPill key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

function AttributionPill({ item }: { item: ScoreAttributionItem; key?: string }) {
  const className = item.tone === 'positive'
    ? 'bg-[var(--seller-chance-soft)] text-[var(--seller-chance)] ring-[color:var(--seller-chance)]/20'
    : item.tone === 'warning'
      ? 'bg-[var(--seller-risk-soft)] text-[var(--seller-risk)] ring-[color:var(--seller-risk)]/20'
      : 'bg-white/[0.06] text-[var(--seller-muted)] ring-white/10';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${className}`}>
      {item.label}
      <span className="opacity-70">x{item.count}</span>
    </span>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-[var(--seller-subtle)]">{label}</div>
      <div className="mt-0.5 font-bold leading-5 text-[var(--seller-ink)]">{value}</div>
    </div>
  );
}

function OutcomeCount({ label, value, tone }: { label: string; value: number; tone: ResultTone }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${softToneClass(tone)}`}>
      {label}<b className="text-[12px]">{value}</b>
    </span>
  );
}

function TierPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  const className = tone === 'emerald'
    ? 'bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
    : tone === 'amber'
      ? 'bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]'
      : tone === 'rose'
        ? 'bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
        : 'bg-white/[0.06] text-[var(--seller-muted)]';

  return (
    <div className={`rounded-[14px] px-2 py-2 text-center ${className}`}>
      <div className="text-[10px] font-bold opacity-80">{label}</div>
      <div className="mt-1 text-sm font-black">{value}</div>
    </div>
  );
}

function toneTextClass(tone: ResultTone) {
  if (tone === 'chance') return 'text-[var(--seller-chance)]';
  if (tone === 'risk') return 'text-[var(--seller-risk)]';
  return 'text-[var(--seller-ink)]';
}

function softToneClass(tone: ResultTone) {
  if (tone === 'chance') return 'bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]';
  if (tone === 'risk') return 'bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]';
  return 'bg-white/[0.06] text-[var(--seller-muted)]';
}

function endingClass(bucket: string) {
  if (bucket === 'good') return 'rounded-full bg-[var(--seller-chance-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--seller-chance)]';
  if (bucket === 'bad') return 'rounded-full bg-[var(--seller-risk-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--seller-risk)]';
  return 'rounded-full bg-[var(--seller-accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--seller-accent)]';
}

function gradeChipClass(grade: string) {
  const isWeak = grade === '没保住' || grade === '待结算';
  return `rounded-full border px-3 py-1 text-[11px] font-bold tracking-[0.08em] ${
    isWeak
      ? 'border-[color:var(--seller-risk)]/30 bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
      : 'border-[color:var(--seller-chance)]/30 bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
  }`;
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}
