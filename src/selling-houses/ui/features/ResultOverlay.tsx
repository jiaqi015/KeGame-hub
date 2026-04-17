import React from 'react';
import { CaseFinalResult, GameState } from '../../domain/models';
import { Trophy, RefreshCw, ArrowRightLeft, BadgeCheck, CircleDollarSign, Clock3, Sparkles, TrendingUp, TriangleAlert, Lightbulb, Megaphone, Route, Layers3, Target, ShieldAlert, Circle } from 'lucide-react';

interface ResultOverlayProps {
  state: GameState;
  onRestart: () => void;
}

export function ResultOverlay({ state, onRestart }: ResultOverlayProps) {
  const { finalResult } = state;
  const { scenarioName, difficultyId } = state.runContext;
  const caseResults = Array.isArray(finalResult?.caseResults) ? finalResult.caseResults : [];
  const scoreBreakdown = Array.isArray(finalResult?.scoreBreakdown) ? finalResult.scoreBreakdown : [];
  const highlights = Array.isArray(finalResult?.highlights) ? finalResult.highlights : [];
  const improvements = Array.isArray(finalResult?.improvements) ? finalResult.improvements : [];
  const promotionNotes = Array.isArray(finalResult?.promotionNotes) ? finalResult.promotionNotes : [];
  const coachNotes = Array.isArray(finalResult?.coachNotes) ? finalResult.coachNotes : [];
  const nextRunAdvice = Array.isArray(finalResult?.nextRunAdvice) ? finalResult.nextRunAdvice : [];
  const endingStats = finalResult?.endingStats;
  const grade = finalResult?.grade || '结算';
  const tierGroups = buildTierGroups(caseResults);

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/50 backdrop-blur-md p-6">
      <div className="mx-auto my-8 max-w-5xl overflow-hidden rounded-[40px] bg-white shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="relative bg-slate-900 p-10 text-center">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-emerald-500 text-white shadow-xl shadow-emerald-500/20">
              <Trophy size={40} />
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-white mt-4">{finalResult?.title || '经营报告'}</h2>
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">
              {difficultyId}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold tracking-[0.04em] text-white/80">
              {scenarioName}
            </span>
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-[10px] font-bold tracking-[0.16em] text-emerald-200">
              {grade}
            </span>
          </div>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            {finalResult?.summary}
          </p>
        </div>

        <div className="p-10">
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {finalResult?.stats.map((s: any, i: number) => (
              <div key={i} className="flex flex-col gap-1 rounded-2xl border border-black/[0.03] bg-slate-50 p-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{s.label}</span>
                <span className="text-xl font-bold text-slate-800">{s.value}</span>
              </div>
            ))}
          </div>

          <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-[28px] border border-black/[0.04] bg-slate-50 p-6">
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                <CircleDollarSign size={15} />
                得分拆解
              </div>
              <div className="space-y-3">
                {endingStats && (
                  <div className="rounded-xl border border-black/[0.03] bg-white px-4 py-3 shadow-sm">
                    <div className="text-sm font-medium text-slate-600">房源结局分布</div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      好收尾 {endingStats.good} 套，一般收尾 {endingStats.neutral} 套，坏收尾 {endingStats.bad} 套。
                      {endingStats.coreBadCount > 0 ? ` 其中核心盘坏收尾 ${endingStats.coreBadCount} 套。` : ''}
                    </div>
                    <span className="mt-2 inline-flex text-sm font-bold text-slate-900">
                      {endingStats.good} / {endingStats.neutral} / {endingStats.bad}
                    </span>
                  </div>
                )}
                {scoreBreakdown.map((entry: any) => (
                  <div key={entry.label} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm">
                    <div>
                      <div className="text-sm font-medium text-slate-600">{entry.label}</div>
                      {entry.summary && <div className="mt-1 text-[11px] text-slate-400">{entry.summary}</div>}
                    </div>
                    <span className="text-sm font-bold text-emerald-600">
                      {entry.value}{entry.maxValue ? ` / ${entry.maxValue}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4">
              <div className="rounded-[28px] border border-black/[0.04] bg-white p-6">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  <Layers3 size={15} />
                  盘型结构
                </div>
                <div className="space-y-3">
                  {tierGroups.map((group) => (
                    <div key={group.goalTier} className="rounded-2xl border border-black/[0.04] bg-slate-50 px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{group.label}</div>
                          <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{group.preview}</div>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          {group.total} 套
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        <TierResultPill label="好收尾" value={group.good} tone="emerald" />
                        <TierResultPill label="一般" value={group.neutral} tone="amber" />
                        <TierResultPill label="坏收尾" value={group.bad} tone="rose" />
                        <TierResultPill label="已失守" value={group.lost} tone="slate" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-emerald-100 bg-emerald-50 p-6">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                  <BadgeCheck size={15} />
                  这局打得好的地方
                </div>
                <div className="space-y-2">
                  {highlights.map((entry: string, index: number) => (
                    <div key={`${entry}-${index}`} className="rounded-xl bg-white/80 px-4 py-3 text-sm leading-relaxed text-emerald-900">
                      {entry}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-amber-100 bg-amber-50 p-6">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
                  <TriangleAlert size={15} />
                  下次该复盘什么
                </div>
                <div className="space-y-2">
                  {improvements.map((entry: string, index: number) => (
                    <div key={`${entry}-${index}`} className="rounded-xl bg-white/80 px-4 py-3 text-sm leading-relaxed text-amber-900">
                      {entry}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <section className="mb-10 rounded-[28px] border border-black/[0.04] bg-white">
            <div className="border-b border-black/[0.05] px-6 py-5">
              <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
                <Sparkles size={16} />
                房源结算总览
              </div>
            </div>
            <div className="space-y-5 p-6">
              {tierGroups.map((group) => (
                <section key={group.goalTier} className="rounded-[28px] border border-black/[0.04] bg-slate-50/70 p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        {group.goalTier === 'core' ? <Target size={16} className="text-rose-500" /> : group.goalTier === 'important' ? <ShieldAlert size={16} className="text-amber-500" /> : <Circle size={16} className="text-slate-400" />}
                        {group.label}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{group.preview}</div>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      {group.total} 套
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {group.items.map((caseItem) => (
                      <div key={caseItem.caseId} className="rounded-2xl border border-black/[0.04] bg-white p-5">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold text-slate-900">{caseItem.title}</div>
                            <div className="mt-1 text-xs text-slate-400">{caseItem.ownerName} · {caseItem.community}</div>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                            caseItem.endingBucket === 'good'
                              ? 'bg-emerald-100 text-emerald-700'
                              : caseItem.endingBucket === 'bad'
                                ? 'bg-rose-100 text-rose-600'
                                : 'bg-amber-100 text-amber-700'
                          }`}>
                            {caseItem.endingBucketLabel} · {caseItem.endingLabel}
                          </span>
                        </div>

                        <p className="mb-3 text-sm leading-relaxed text-slate-500">{caseItem.endingSummary}</p>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <ResultMiniStat icon={<TrendingUp size={14} />} label="能力结果" value={caseItem.relativeOutcomeLabel} />
                          <ResultMiniStat icon={<ArrowRightLeft size={14} />} label="守盘结果" value={caseItem.defenseOutcomeLabel} />
                          <ResultMiniStat icon={<Clock3 size={14} />} label="业主感受" value={caseItem.ownerSatisfactionLabel} />
                          <ResultMiniStat icon={<CircleDollarSign size={14} />} label="结果价格" value={caseItem.soldPrice ? `${caseItem.soldPrice} 万` : '--'} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <div className="mb-10 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <ResultInsightCard
              icon={<Megaphone size={16} />}
              title="推广复盘"
              tone="slate"
              items={promotionNotes}
            />
            <ResultInsightCard
              icon={<Lightbulb size={16} />}
              title="教练点评"
              tone="emerald"
              items={coachNotes}
            />
            <ResultInsightCard
              icon={<Route size={16} />}
              title="下局建议"
              tone="amber"
              items={nextRunAdvice}
            />
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={onRestart}
              className="w-full flex items-center justify-center gap-3 py-5 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:scale-[1.02] transition-all shadow-xl shadow-slate-900/20"
            >
              <RefreshCw size={20} />
              <span>回到难度选择</span>
            </button>
            <p className="text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">
              王牌资产顾问 · 随机剧本经营模拟
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultInsightCard({
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
      <div className="space-y-2">
        {items.map((entry, index) => (
          <div key={`${entry}-${index}`} className="rounded-xl bg-white/80 px-4 py-3 text-sm leading-relaxed">
            {entry}
          </div>
        ))}
      </div>
    </section>
  );
}

function ResultMiniStat({
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

function TierResultPill({
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

function buildTierGroups(caseResults: CaseFinalResult[]) {
  return (['core', 'important', 'normal'] as const).map((goalTier) => {
    const items = caseResults.filter((entry) => entry.goalTier === goalTier);
    const good = items.filter((entry) => entry.endingBucket === 'good').length;
    const neutral = items.filter((entry) => entry.endingBucket === 'neutral').length;
    const bad = items.filter((entry) => entry.endingBucket === 'bad').length;
    const lost = items.filter((entry) => entry.defenseOutcome === 'lost_to_rival').length;

    return {
      goalTier,
      label: goalTierLabel(goalTier),
      total: items.length,
      good,
      neutral,
      bad,
      lost,
      items,
      preview: buildTierPreview(goalTier, items.length, good, neutral, bad, lost),
    };
  });
}

function buildTierPreview(
  goalTier: 'core' | 'important' | 'normal',
  total: number,
  good: number,
  neutral: number,
  bad: number,
  lost: number,
) {
  if (total === 0) {
    return `${goalTierLabel(goalTier)}这组本局没有分到房源。`;
  }
  if (bad > 0) {
    return `${goalTierLabel(goalTier)}里有 ${bad} 套坏收尾${lost > 0 ? `，其中 ${lost} 套直接失守` : ''}。`;
  }
  if (good === total) {
    return `${goalTierLabel(goalTier)}这组全都收得住，属于这局最硬的一段。`;
  }
  return `${goalTierLabel(goalTier)}这组有 ${good} 套好收尾、${neutral} 套一般收尾，整体还在可控区间。`;
}

function goalTierLabel(goalTier: 'core' | 'important' | 'normal') {
  if (goalTier === 'core') return '核心盘';
  if (goalTier === 'important') return '重要盘';
  return '普通盘';
}
