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
  Route,
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

export function ResultOverlay({ state, onRestart }: ResultOverlayProps) {
  const projection = useMemo(() => buildResultProjection(state), [state]);
  const { customerReview } = projection;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/50 p-6 backdrop-blur-md">
      <div className="seller-panel mx-auto my-8 max-w-6xl overflow-hidden rounded-[24px] shadow-[var(--seller-shadow-lg)] animate-in fade-in zoom-in duration-300">
        <div className="relative bg-[var(--seller-paper)] px-10 pb-10 pt-12 text-[var(--seller-ink)]">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
            <div className="flex h-20 w-20 items-center justify-center rounded-[20px] bg-[var(--seller-chance)] text-white">
              <Trophy size={40} />
            </div>
          </div>

          <div className="mx-auto max-w-4xl text-center">
            <div className="seller-label mt-4 text-[var(--seller-subtle)]">
              {projection.hero.eyebrow}
            </div>
            <h2 className="seller-title mt-3 text-3xl text-[var(--seller-ink)]">{projection.hero.title}</h2>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="seller-chip">
                {projection.hero.difficultyId}
              </span>
              <span className="seller-chip seller-chip-chance">
                {projection.hero.grade}
              </span>
            </div>
            <p className="mx-auto mt-3 max-w-3xl text-sm leading-relaxed text-[var(--seller-muted)]">
              {projection.hero.summary}
            </p>
          </div>
        </div>

        <div className="space-y-8 p-10">
          <section className="grid grid-cols-2 gap-4 xl:grid-cols-6">
            {projection.summaryCards.map((card) => (
              <div key={card.label}>
                <SummaryCard label={card.label} value={card.value} note={card.note} tone={card.tone} />
              </div>
            ))}
          </section>

          {projection.marketOutcome && (
            <section className="seller-panel-soft p-6">
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--seller-subtle)]">
                <Layers3 size={15} />
                {projection.marketOutcome.title}
              </div>
              <div className="seller-note mb-4 px-4 py-3 text-sm leading-relaxed">
                {projection.marketOutcome.summary}
              </div>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
                {projection.marketOutcome.metrics.map((card) => (
                  <div key={card.label}>
                    <SummaryCard label={card.label} value={card.value} note={card.note} tone={card.tone} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="seller-panel overflow-hidden">
            <div className="border-b border-[var(--seller-border)] px-6 py-5">
              <div className="seller-label flex items-center gap-2 text-sm">
                <Sparkles size={16} />
                正式单房结果
              </div>
            </div>
            <div className="space-y-5 p-6">
              {projection.tierGroups.map((group) => (
                <section key={group.goalTier} className="seller-panel-soft p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-bold text-[var(--seller-ink)]">
                        {group.goalTier === 'core'
                          ? <Target size={16} className="text-[var(--seller-risk)]" />
                          : group.goalTier === 'important'
                            ? <ShieldAlert size={16} className="text-[var(--seller-accent)]" />
                            : <Sparkles size={16} className="text-[var(--seller-subtle)]" />}
                        {group.label}
                      </div>
                      <div className="mt-1 text-xs text-[var(--seller-muted)]">{group.preview}</div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <TierPill label="结果不错" value={group.good} tone="emerald" />
                      <TierPill label="结果一般" value={group.neutral} tone="amber" />
                      <TierPill label="结果较差" value={group.bad} tone="rose" />
                      <TierPill label="被抢走" value={group.lost} tone="slate" />
                    </div>
                  </div>
                  {group.items.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {group.items.map((item) => (
                        <React.Fragment key={item.caseId}>
                          <FormalCaseResultCard item={item} />
                        </React.Fragment>
                      ))}
                    </div>
                  ) : (
                    <div className="seller-empty px-4 py-10 text-center text-[12px]">
                      这组本局没有房源需要结算。
                    </div>
                  )}
                </section>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-4">
              <section className="seller-panel-soft p-6">
                <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--seller-subtle)]">
                  <CircleDollarSign size={15} />
                  得分
                </div>
                <div className="seller-note mb-4 px-4 py-4 text-[12px] leading-6">
                  三项得分来自单房结果、守盘情况和业主感受。
                </div>
                <div className="space-y-3">
                  {projection.scoreBreakdown.map((entry) => (
                    <div key={entry.label}>
                      <ScoreBreakdownCard entry={entry} />
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-4">
              <section className="seller-panel-soft p-6">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--seller-risk)]">
                  <TriangleAlert size={15} />
                  这局回看点
                </div>
                <StackNotes items={projection.improvements} empty="这局还没有明确回看点。" />
              </section>
            </div>
          </section>

          {customerReview && (
            <section className="seller-panel-soft p-6">
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--seller-accent)]">
                <Users size={15} />
                客户记录
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <TierPill label="推进中" value={customerReview.engaged} tone="emerald" />
                <TierPill label="比较中" value={customerReview.comparing} tone="amber" />
                <TierPill label="掉线风险" value={customerReview.atRisk} tone="rose" />
                <TierPill label="被带偏" value={customerReview.rivalPulled} tone="slate" />
              </div>
              <div className="seller-note mt-4 px-4 py-3 text-sm leading-relaxed">
                {customerReview.summary}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                {customerReview.notes.map((entry, index) => (
                  <div key={`${entry}-${index}`} className="seller-tablet px-4 py-4 text-sm leading-relaxed text-[var(--seller-muted)]">
                    {entry}
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <InsightBlock icon={<Sparkles size={16} />} title="推广记录" tone="slate" items={projection.promotionNotes} />
            <InsightBlock icon={<Lightbulb size={16} />} title="关键记录" tone="emerald" items={projection.coachNotes} />
          </div>

          <button
            onClick={onRestart}
            className="seller-button-primary flex w-full items-center justify-center gap-3 rounded-2xl py-5 text-lg font-bold transition-all hover:scale-[1.01]"
          >
            <RefreshCw size={20} />
            <span>回到难度选择</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function FormalCaseResultCard({
  item,
}: {
  item: NonNullable<ReturnType<typeof buildResultProjection>['tierGroups'][number]['items'][number]>;
}) {
  return (
    <div className="seller-tablet p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-[var(--seller-ink)]">{item.title}</div>
          <div className="mt-1 text-xs text-[var(--seller-subtle)]">{item.ownerName} · {item.community}</div>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
          item.endingBucket === 'good'
            ? 'bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
            : item.endingBucket === 'bad'
              ? 'bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
              : 'bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]'
        }`}>
          {item.endingBucketLabel} · {item.endingLabel}
        </span>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-[var(--seller-muted)]">{item.endingSummary}</p>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <MiniStat icon={<TrendingUp size={14} />} label="和同类房相比" value={item.relativeOutcomeLabel} />
        <MiniStat icon={<ArrowRightLeft size={14} />} label="房源去向" value={item.defenseOutcomeLabel} />
        <MiniStat icon={<Clock3 size={14} />} label="业主感受" value={item.ownerSatisfactionLabel} />
        <MiniStat icon={<CircleDollarSign size={14} />} label="正式结果价" value={item.soldPrice ? `${item.soldPrice} 万` : '--'} />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: 'neutral' | 'chance' | 'risk';
}) {
  const toneClass = tone === 'chance'
    ? 'bg-[var(--seller-chance-soft)]'
    : tone === 'risk'
      ? 'bg-[var(--seller-risk-soft)]'
      : 'bg-[rgba(255,255,255,0.03)]';

  return (
    <div className={`seller-tablet p-5 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--seller-subtle)]">{label}</div>
      <div className="mt-2 text-xl font-bold text-[var(--seller-ink)]">{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{note}</div>
    </div>
  );
}

function StackNotes({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <div className="seller-empty px-4 py-3 text-sm">{empty}</div>;
  }

  return (
    <div className="space-y-2">
      {items.map((entry, index) => (
        <div key={`${entry}-${index}`} className="seller-tablet px-4 py-3 text-sm leading-relaxed text-[var(--seller-ink)]">
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
}) {
  return (
    <div className="seller-tablet px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-[var(--seller-muted)]">{entry.label}</div>
          {entry.summary && <div className="mt-1 text-[11px] leading-5 text-[var(--seller-subtle)]">{entry.summary}</div>}
        </div>
        <span className="shrink-0 text-sm font-bold text-[var(--seller-chance)]">
          {entry.value}{entry.maxValue ? ` / ${entry.maxValue}` : ''}
        </span>
      </div>
      {entry.attribution && <ScoreAttributionBlock attribution={entry.attribution} />}
    </div>
  );
}

function ScoreAttributionBlock({ attribution }: { attribution: ScoreAttribution }) {
  const items = [...attribution.actions, ...attribution.events].slice(0, 5);
  if (!items.length) {
    return (
      <div className="seller-empty mt-3 px-3 py-2 text-[11px] leading-5">
        {attribution.headline}
      </div>
    );
  }

  return (
    <div className="seller-note mt-3 px-3 py-2">
      <div className="text-[11px] leading-5 text-[var(--seller-muted)]">{attribution.headline}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <div key={item.key}>
            <AttributionPill item={item} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AttributionPill({ item }: { item: ScoreAttributionItem }) {
  const className = item.tone === 'positive'
    ? 'bg-[var(--seller-chance-soft)] text-[var(--seller-chance)] ring-[color:var(--seller-chance)]/20'
    : item.tone === 'warning'
      ? 'bg-[var(--seller-risk-soft)] text-[var(--seller-risk)] ring-[color:var(--seller-risk)]/20'
      : 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-muted)] ring-[var(--seller-border)]';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${className}`}>
      {item.label}
      <span className="opacity-70">x{item.count}</span>
    </span>
  );
}

function InsightBlock({
  icon,
  title,
  tone,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  tone: 'slate' | 'emerald' | 'amber';
  items: string[];
}) {
  const toneClass = tone === 'emerald'
    ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)] text-[var(--seller-ink)]'
    : tone === 'amber'
      ? 'border-[color:var(--seller-accent)]/22 bg-[var(--seller-accent-soft)] text-[var(--seller-ink)]'
      : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] text-[var(--seller-ink)]';
  const titleClass = tone === 'emerald'
    ? 'text-[var(--seller-chance)]'
    : tone === 'amber'
      ? 'text-[var(--seller-accent)]'
      : 'text-[var(--seller-muted)]';

  return (
    <section className={`rounded-[28px] border p-6 ${toneClass}`}>
      <div className={`mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] ${titleClass}`}>
        {icon}
        {title}
      </div>
      <StackNotes items={items} empty="这部分还没有新内容。" />
    </section>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="seller-tablet px-3.5 py-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-[var(--seller-ink)]">{value}</div>
    </div>
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
        : 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-muted)]';

  return (
    <div className={`rounded-xl px-3 py-2 text-center ${className}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
