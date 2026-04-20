import React, { useMemo } from 'react';
import type { GameState, ScoreAttribution, ScoreAttributionItem } from '../../domain/models';
import { buildResultProjection } from '../../application/projections/resultProjection.js';
import {
  ArrowRightLeft,
  BadgeCheck,
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
  const leadHighlight = projection.highlights[0];
  const leadImprovement = projection.improvements[0];
  const totalResolvedCases = projection.tierGroups.reduce((sum, group) => sum + group.total, 0);

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/50 p-6 backdrop-blur-md">
      <div className="seller-panel mx-auto my-8 max-w-6xl overflow-hidden rounded-[24px] shadow-[var(--seller-shadow-lg)] animate-in fade-in zoom-in duration-300">
        <div className="relative bg-[var(--seller-ink)] px-10 pb-10 pt-12 text-white">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
            <div className="flex h-20 w-20 items-center justify-center rounded-[20px] bg-[var(--seller-chance)] text-white">
              <Trophy size={40} />
            </div>
          </div>

          <div className="mx-auto max-w-4xl text-center">
            <div className="seller-label mt-4 text-white/60">
              {projection.hero.eyebrow}
            </div>
            <h2 className="seller-title mt-3 text-3xl text-white">{projection.hero.title}</h2>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">
                {projection.hero.difficultyId}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold tracking-[0.04em] text-white/80">
                {projection.hero.scenarioName}
              </span>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-[10px] font-bold tracking-[0.16em] text-emerald-200">
                {projection.hero.grade}
              </span>
            </div>
            <p className="mx-auto mt-3 max-w-3xl text-sm leading-relaxed text-white/70">
              {projection.hero.summary}
            </p>
            <div className="mt-5 inline-flex rounded-full bg-white/10 px-4 py-2 text-[11px] font-semibold text-white/80">
              {projection.hero.settlementLabel}
            </div>
            <div className="mt-3 text-[12px] leading-6 text-white/70">
              本页只展示本局正式结算；跨局名次和长期成绩请到排行榜查看。
            </div>
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

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <SettlementSignalCard
              label="结算口径"
              title="这页已经锁定到正式成绩"
              detail="这里不再展示局内每日预估和未结束过程，只看这局已经落账的结果。"
              tone="chance"
            />
            <SettlementSignalCard
              label="先看什么"
              title={totalResolvedCases > 0 ? `先看 ${totalResolvedCases} 套房最后落成什么样` : '先看这局有没有形成正式房源结果'}
              detail={totalResolvedCases > 0 ? '单房结果是这页最重要的内容，总分只是把这些结果翻译成整局成绩。' : '如果还没有正式房源结果，这页也不会有真正的结算意义。'}
              tone={totalResolvedCases > 0 ? 'chance' : 'neutral'}
            />
            <SettlementSignalCard
              label="这局带走什么"
              title={leadHighlight || leadImprovement || '这局还没有特别集中的代表作'}
              detail={leadHighlight
                ? '这条会作为这局最能代表你打法的一笔被保留下来。'
                : leadImprovement
                  ? '这条最值得带回复盘页继续拆原因。'
                  : '说明这局没有特别突出的单点高光或单点失手。'}
              tone={leadHighlight ? 'chance' : leadImprovement ? 'risk' : 'neutral'}
            />
          </section>

          <section className="seller-panel overflow-hidden">
            <div className="border-b border-black/[0.05] px-6 py-5">
              <div className="seller-label flex items-center gap-2 text-sm">
                <Sparkles size={16} />
                正式单房结果总览
              </div>
              <div className="seller-body mt-2 text-[12px]">
                先把每套房最后怎么收的看明白，再回头看三项得分和生涯沉淀。
              </div>
            </div>
            <div className="space-y-5 p-6">
              {projection.tierGroups.map((group) => (
                <section key={group.goalTier} className="rounded-[28px] border border-black/[0.04] bg-slate-50/70 p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        {group.goalTier === 'core'
                          ? <Target size={16} className="text-rose-500" />
                          : group.goalTier === 'important'
                            ? <ShieldAlert size={16} className="text-amber-500" />
                            : <Sparkles size={16} className="text-slate-400" />}
                        {group.label}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{group.preview}</div>
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
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-[12px] text-slate-400">
                      这组本局没有房源需要正式落账。
                    </div>
                  )}
                </section>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-4">
              <section className="rounded-[28px] border border-black/[0.04] bg-slate-50 p-6">
                <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  <CircleDollarSign size={15} />
                  结算拆分
                </div>
                <div className="mb-4 rounded-2xl border border-black/[0.04] bg-white px-4 py-4 text-[12px] leading-6 text-slate-600">
                  三项得分是把单房结果、守盘情况和业主感受翻译成整局正式成绩，不是独立于房源之外的一套分数。
                </div>
                <div className="space-y-3">
                  {projection.scoreBreakdown.map((entry) => (
                    <div key={entry.label}>
                      <ScoreBreakdownCard entry={entry} />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-sky-100 bg-sky-50/70 p-6">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-sky-700">
                  <ShieldAlert size={15} />
                  本局结算边界
                </div>
                <div className="space-y-2.5">
                  {projection.settlementNotes.map((item) => (
                    <div key={item.title}>
                      <PlainNote title={item.title} detail={item.detail} tone={item.tone} />
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-4">
              <section className="rounded-[28px] border border-amber-100 bg-amber-50/70 p-6">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
                  <Target size={15} />
                  跨局生涯沉淀
                </div>
                <div className="space-y-2.5">
                  {projection.careerNotes.map((item) => (
                    <div key={item.title}>
                      <PlainNote title={item.title} detail={item.detail} tone={item.tone} />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-emerald-100 bg-emerald-50 p-6">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                  <BadgeCheck size={15} />
                  这局正式亮点
                </div>
                <StackNotes items={projection.highlights} empty="这局还没有沉淀出明显亮点。" />
              </section>

              <section className="rounded-[28px] border border-rose-100 bg-rose-50/80 p-6">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-rose-700">
                  <TriangleAlert size={15} />
                  这局正式复盘点
                </div>
                <StackNotes items={projection.improvements} empty="这局还没有沉淀出明确复盘点。" />
              </section>
            </div>
          </section>

          {customerReview && (
            <section className="rounded-[28px] border border-sky-100 bg-sky-50/70 p-6">
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-sky-700">
                <Users size={15} />
                客户复盘
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <TierPill label="推进中" value={customerReview.engaged} tone="emerald" />
                <TierPill label="比较中" value={customerReview.comparing} tone="amber" />
                <TierPill label="掉线风险" value={customerReview.atRisk} tone="rose" />
                <TierPill label="被带偏" value={customerReview.rivalPulled} tone="slate" />
              </div>
              <div className="mt-4 rounded-2xl border border-sky-100 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700">
                {customerReview.summary}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                {customerReview.notes.map((entry, index) => (
                  <div key={`${entry}-${index}`} className="rounded-2xl border border-white/80 bg-white/90 px-4 py-4 text-sm leading-relaxed text-slate-700 shadow-sm">
                    {entry}
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <InsightBlock icon={<Sparkles size={16} />} title="推广复盘" tone="slate" items={projection.promotionNotes} />
            <InsightBlock icon={<Lightbulb size={16} />} title="关键复盘" tone="emerald" items={projection.coachNotes} />
          </div>

          <button
            onClick={onRestart}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 py-5 text-lg font-bold text-white shadow-xl shadow-slate-900/20 transition-all hover:scale-[1.01]"
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
    <div className="rounded-2xl border border-black/[0.04] bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-900">{item.title}</div>
          <div className="mt-1 text-xs text-slate-400">{item.ownerName} · {item.community}</div>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
          item.endingBucket === 'good'
            ? 'bg-emerald-100 text-emerald-700'
            : item.endingBucket === 'bad'
              ? 'bg-rose-100 text-rose-600'
              : 'bg-amber-100 text-amber-700'
        }`}>
          {item.endingBucketLabel} · {item.endingLabel}
        </span>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-slate-500">{item.endingSummary}</p>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <MiniStat icon={<TrendingUp size={14} />} label="和同类房相比" value={item.relativeOutcomeLabel} />
        <MiniStat icon={<ArrowRightLeft size={14} />} label="房源去向" value={item.defenseOutcomeLabel} />
        <MiniStat icon={<Clock3 size={14} />} label="业主感受" value={item.ownerSatisfactionLabel} />
        <MiniStat icon={<CircleDollarSign size={14} />} label="正式结果价" value={item.soldPrice ? `${item.soldPrice} 万` : '--'} />
      </div>
    </div>
  );
}

function SettlementSignalCard({
  label,
  title,
  detail,
  tone,
}: {
  label: string;
  title: string;
  detail: string;
  tone: 'neutral' | 'chance' | 'risk';
}) {
  const className = tone === 'chance'
    ? 'border-emerald-100 bg-emerald-50/70'
    : tone === 'risk'
      ? 'border-rose-100 bg-rose-50/70'
      : 'border-black/[0.04] bg-slate-50';

  return (
    <div className={`rounded-[24px] border px-5 py-5 ${className}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-2 text-[16px] font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-[12px] leading-6 text-slate-600">{detail}</div>
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
    ? 'bg-emerald-50'
    : tone === 'risk'
      ? 'bg-rose-50'
      : 'bg-slate-50';

  return (
    <div className={`rounded-2xl border border-black/[0.04] p-5 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-slate-500">{note}</div>
    </div>
  );
}

function PlainNote({
  title,
  detail,
  tone,
}: {
  title: string;
  detail: string;
  tone: 'neutral' | 'chance' | 'risk';
}) {
  const toneClass = tone === 'chance'
    ? 'bg-emerald-50/70'
    : tone === 'risk'
      ? 'bg-rose-50/70'
      : 'bg-white';

  return (
    <div className={`rounded-2xl border border-white/80 px-4 py-4 ${toneClass}`}>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-[12px] leading-6 text-slate-600">{detail}</div>
    </div>
  );
}

function StackNotes({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <div className="rounded-xl bg-white/80 px-4 py-3 text-sm text-slate-500">{empty}</div>;
  }

  return (
    <div className="space-y-2">
      {items.map((entry, index) => (
        <div key={`${entry}-${index}`} className="rounded-xl bg-white/80 px-4 py-3 text-sm leading-relaxed text-slate-800">
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
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-600">{entry.label}</div>
          {entry.summary && <div className="mt-1 text-[11px] leading-5 text-slate-400">{entry.summary}</div>}
        </div>
        <span className="shrink-0 text-sm font-bold text-emerald-600">
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
      <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-400">
        {attribution.headline}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
      <div className="text-[11px] leading-5 text-slate-500">{attribution.headline}</div>
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
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
    : item.tone === 'warning'
      ? 'bg-rose-50 text-rose-600 ring-rose-100'
      : 'bg-slate-100 text-slate-600 ring-slate-200';

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
    ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
    : tone === 'amber'
      ? 'border-amber-100 bg-amber-50 text-amber-900'
      : 'border-slate-200 bg-slate-50 text-slate-900';
  const titleClass = tone === 'emerald'
    ? 'text-emerald-700'
    : tone === 'amber'
      ? 'text-amber-700'
      : 'text-slate-600';

  return (
    <section className={`rounded-[28px] border p-6 ${toneClass}`}>
      <div className={`mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] ${titleClass}`}>
        {icon}
        {title}
      </div>
      <StackNotes items={items} empty="这部分还没有新的沉淀内容。" />
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
    <div className="rounded-xl bg-white px-3.5 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
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
    ? 'bg-emerald-50 text-emerald-700'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : tone === 'rose'
        ? 'bg-rose-50 text-rose-600'
        : 'bg-slate-100 text-slate-600';

  return (
    <div className={`rounded-xl px-3 py-2 text-center ${className}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
