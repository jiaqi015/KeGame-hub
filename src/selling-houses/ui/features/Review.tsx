import React, { useMemo } from 'react';
import { ArrowRightLeft, History, Lightbulb, ShieldAlert, Target, TrendingUp, Users } from 'lucide-react';
import type { GameState } from '../../domain/models';
import {
  buildReviewProjection,
  type ReviewTurningPointProjection,
} from '../../application/projections/reviewProjection.js';

interface ReviewProps {
  state: GameState;
}

export function Review({ state }: ReviewProps) {
  const projection = useMemo(() => buildReviewProjection(state), [state]);
  const leadTurningPoint = projection.turningPoints[0];
  const supportTurningPoint = projection.turningPoints[1];
  const riskTurningPoint = projection.turningPoints.find((event) => event.tone === 'risk');
  const chanceTurningPoint = projection.turningPoints.find((event) => event.tone === 'chance');
  const thirdTurningPoint = projection.turningPoints[2];
  const narrativeFlow = [
    {
      label: '先出变化',
      title: leadTurningPoint?.title || '这局还没形成明显变化',
      detail: leadTurningPoint?.detail || '先把这局往前推进几天，经营回看才会开始清楚。',
      tone: leadTurningPoint?.tone || 'neutral',
    },
    {
      label: '往前走',
      title: chanceTurningPoint?.title || '往前走的机会还不明显',
      detail: chanceTurningPoint?.detail || '说明这局目前更多还是守和补，还没有出现明显起量点。',
      tone: chanceTurningPoint?.tone || 'neutral',
    },
    {
      label: '开始变差',
      title: riskTurningPoint?.title || '暂时没有集中失手点',
      detail: riskTurningPoint?.detail || '目前没有一条明显把局面拖坏的风险线，更多是零散摩擦。',
      tone: riskTurningPoint?.tone || 'neutral',
    },
    {
      label: '接着看',
      title: supportTurningPoint?.title || thirdTurningPoint?.title || '下一条关键变化还在形成',
      detail: supportTurningPoint
        ? `${supportTurningPoint.detail} 这条最值得你带着问题回去看。`
        : thirdTurningPoint
          ? `${thirdTurningPoint.detail} 继续推进几天后，这条会更清楚。`
          : '继续推进几天后，再回来确认第二个关键变化是否开始成型。',
      tone: supportTurningPoint?.tone || thirdTurningPoint?.tone || 'neutral',
    },
  ] as const;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <section className="seller-panel p-4 lg:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="seller-label">经营回看</div>
            <h3 className="seller-title mt-2 text-[22px]">{projection.hero.title}</h3>
            <p className="seller-body mt-2 text-sm">{projection.hero.subtitle}</p>
            <p className="seller-body mt-3 text-[13px]">{projection.hero.note}</p>
          </div>
          <div className="seller-tablet px-4 py-4">
            <div className="seller-label">回看范围</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {projection.turningPoints.length} 条关键变化 · {projection.weeklyReviews.length} 条周沉淀
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <TurningSummaryCard
            label="先从哪开始变"
            title={leadTurningPoint?.title || '还没有形成主变化'}
            detail={leadTurningPoint?.detail || '先把这局往前推进几天，经营回看才会开始清楚。'}
            tone={leadTurningPoint?.tone || 'neutral'}
          />
          <TurningSummaryCard
            label="哪一步开始顺"
            title={chanceTurningPoint?.title || '往前走的机会还不明显'}
            detail={chanceTurningPoint?.detail || '说明这局目前更多还是补动作和守住客户，还没有明显起量点。'}
            tone={chanceTurningPoint?.tone || 'neutral'}
          />
          <TurningSummaryCard
            label="哪一步开始出问题"
            title={riskTurningPoint?.title || '暂时没有集中失手点'}
            detail={riskTurningPoint?.detail || '说明当前还没有一条明显把局面拖坏的风险线。'}
            tone={riskTurningPoint?.tone || 'neutral'}
          />
        </div>
      </section>

      <section className="seller-panel-muted p-4 lg:p-5">
        <div className="mb-4 flex items-center gap-3">
          <TrendingUp size={18} className="text-slate-700" />
          <div>
            <h4 className="text-[18px] font-semibold text-slate-900">这局是怎么走到现在的</h4>
            <p className="seller-body mt-1 text-sm">先看转折，再看它具体压到了哪里。</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[22px] border border-black/[0.05] bg-white px-5 py-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">最早出问题或起量的地方</div>
            <div className="mt-2 text-[18px] font-semibold text-slate-900">
              {leadTurningPoint?.title || '还没有形成足够清晰的转折点'}
            </div>
            <div className="mt-2 text-[13px] leading-6 text-slate-600">
              {leadTurningPoint?.detail || '这局目前还处在铺垫阶段，后面几天才会慢慢看清。'}
            </div>
            {leadTurningPoint && (
              <div className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Day {leadTurningPoint.day} · {leadTurningPoint.label}
              </div>
            )}
          </div>
          <div className="space-y-3">
            {narrativeFlow.map((item) => (
              <React.Fragment key={item.label}>
                <NarrativeNote title={item.label} body={`${item.title}。${item.detail}`} tone={item.tone} />
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      <section className="seller-panel p-4 lg:p-5">
        <div className="mb-4 flex items-center gap-3">
          <Target size={18} className="text-emerald-600" />
          <div>
            <h4 className="text-[18px] font-semibold text-slate-900">关键变化</h4>
            <p className="seller-body mt-1 text-sm">只放真正改变局面的点，不把所有记录都堆在这里。</p>
          </div>
        </div>
        <div className="space-y-3">
          {projection.turningPoints.length > 0 ? projection.turningPoints.map((event) => (
            <React.Fragment key={event.id}>{renderTurningPointCard(event)}</React.Fragment>
          )) : (
            <EmptyReviewState text="这局还没有形成明显转折，先把时间再往前推几天。" />
          )}
        </div>
      </section>

      <section className="seller-panel p-4 lg:p-5">
        <div className="mb-4 flex items-center gap-3">
          <Users size={18} className="text-sky-600" />
          <div>
            <h4 className="text-[18px] font-semibold text-slate-900">客户线怎么变的</h4>
            <p className="seller-body mt-1 text-sm">先看客户有没有接住，再看哪套房在吸客、丢客、被带偏。</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <ReviewMetric label="推进中" value={`${projection.customer.engaged}`} tone="emerald" />
          <ReviewMetric label="比较中" value={`${projection.customer.comparing}`} tone="amber" />
          <ReviewMetric label="快流失" value={`${projection.customer.atRisk}`} tone="rose" />
          <ReviewMetric label="被带偏" value={`${projection.customer.rivalPulled}`} tone="slate" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <ReviewCallout
            icon={<Target size={16} />}
            title="接客最稳"
            body={projection.customer.strongestCaseTitle ? `${projection.customer.strongestCaseTitle} 现在最容易接住客户。` : '暂时没有明显最稳的一套。'}
          />
          <ReviewCallout
            icon={<ArrowRightLeft size={16} />}
            title="最常被比"
            body={projection.customer.mostComparedCaseTitle ? `${projection.customer.mostComparedCaseTitle} 最常被客户拿去和别的盘一起比。` : '目前没有明显的比盘焦点。'}
          />
          <ReviewCallout
            icon={<ShieldAlert size={16} />}
            title="最容易掉客"
            body={projection.customer.mostAtRiskCaseTitle ? `${projection.customer.mostAtRiskCaseTitle} 挂着最多快流失客户。` : '目前没有特别集中的快流失房源。'}
          />
        </div>
        <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
          {projection.customer.summary}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <section className="seller-panel p-4 lg:p-5">
          <div className="mb-4 flex items-center gap-3">
            <History size={18} className="text-rose-500" />
            <div>
              <h4 className="text-[18px] font-semibold text-slate-900">补充变化</h4>
              <p className="seller-body mt-1 text-sm">主线之外，再看哪些变化在补强，哪些变化在拖慢。</p>
            </div>
          </div>
          <div className="space-y-3">
            {projection.recentChanges.length > 0 ? projection.recentChanges.map((event) => (
              <React.Fragment key={`recent-${event.id}`}>{renderTurningPointCard(event, true)}</React.Fragment>
            )) : (
              <EmptyReviewState text="最近还没有沉淀出明显变化。" />
            )}
          </div>
        </section>

        <section className="space-y-6">
          <section className="seller-panel p-4 lg:p-5">
            <div className="mb-4 flex items-center gap-3">
              <Lightbulb size={18} className="text-sky-600" />
              <div>
              <h4 className="text-[18px] font-semibold text-slate-900">昨日摘要</h4>
              <p className="mt-1 text-sm text-slate-500">把昨天最关键的变化压成一眼能扫完的版本，方便你接回这局主线。</p>
              </div>
            </div>
            {projection.dailyBrief ? (
              <div className="space-y-4">
                <div className="rounded-[20px] border border-black/[0.05] bg-slate-50 px-4 py-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{projection.dailyBrief.title}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{projection.dailyBrief.headline}</div>
                </div>
                <ReviewListBlock title="指标变化" items={projection.dailyBrief.metricNotes} emptyText="昨天没有明显指标变化。" />
                <ReviewListBlock title="市场变化" items={projection.dailyBrief.marketNews} emptyText="昨天没有新增市场消息。" />
                <ReviewListBlock title="今日聚焦" items={projection.dailyBrief.focusCases} emptyText="今天还没有聚焦房源。" />
                <ReviewListBlock title="今日先办" items={projection.dailyBrief.priorities} emptyText="今天还没有生成优先事项。" />
              </div>
            ) : (
              <EmptyReviewState text="当前还没有昨日简报，先把今天推进完。" />
            )}
          </section>

          <section className="seller-panel p-4 lg:p-5">
            <div className="mb-4 flex items-center gap-3">
              <History size={18} className="text-slate-500" />
              <div>
                <h4 className="text-[18px] font-semibold text-slate-900">周度沉淀</h4>
                <p className="mt-1 text-sm text-slate-500">一周一条，留住已经跑出来的经营判断，不把它们散在每天变化里。</p>
              </div>
            </div>
            <div className="space-y-3">
              {projection.weeklyReviews.length > 0 ? projection.weeklyReviews.map((entry) => (
                <div key={entry.id} className="rounded-[20px] border border-black/[0.05] bg-slate-50 px-4 py-4">
                  <div className="text-sm font-semibold text-slate-900">{entry.title}</div>
                  <div className="mt-2 text-[12px] leading-6 text-slate-600">{entry.note}</div>
                  <div className="mt-3 rounded-[16px] border border-black/[0.05] bg-white px-3 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">这周留下的话</div>
                    <div className="mt-1 text-[12px] leading-6 text-slate-700">
                      {entry.suggestion}
                    </div>
                  </div>
                </div>
              )) : (
                <EmptyReviewState text="这局还没跑满一周，后面推进几天这里就会开始沉淀。" />
              )}
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}

function TurningSummaryCard({
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
  const toneClass = tone === 'chance'
    ? 'border-emerald-100 bg-emerald-50/80'
    : tone === 'risk'
      ? 'border-rose-100 bg-rose-50/80'
      : 'border-black/[0.05] bg-slate-50';

  return (
    <div className={`rounded-[20px] border px-4 py-4 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-2 text-[15px] font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-[12px] leading-6 text-slate-600">{detail}</div>
    </div>
  );
}

function NarrativeNote({
  title,
  body,
  tone = 'neutral',
}: {
  title: string;
  body: string;
  tone?: 'neutral' | 'chance' | 'risk';
}) {
  const toneClass = tone === 'chance'
    ? 'border-emerald-100 bg-emerald-50/60'
    : tone === 'risk'
      ? 'border-rose-100 bg-rose-50/60'
      : 'border-black/[0.05] bg-white';

  return (
    <div className={`rounded-[18px] border px-4 py-4 ${toneClass}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{title}</div>
      <div className="mt-2 text-[12px] leading-6 text-slate-600">{body}</div>
    </div>
  );
}

function renderTurningPointCard(event: ReviewTurningPointProjection, compact = false) {
  const toneClass = event.tone === 'chance'
    ? 'border-emerald-100 bg-emerald-50/70'
    : event.tone === 'risk'
      ? 'border-rose-100 bg-rose-50/70'
      : 'border-black/[0.05] bg-slate-50';

  return (
    <div className={`rounded-[20px] border px-4 py-4 ${toneClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            {event.label}
          </span>
          {event.caseTitle && (
            <span className="text-[11px] font-semibold text-slate-500">{event.caseTitle}</span>
          )}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
          Day {event.day} · {event.date}
        </div>
      </div>
      <div className={`mt-2 font-semibold text-slate-900 ${compact ? 'text-[14px]' : 'text-[15px]'}`}>{event.title}</div>
      <div className={`mt-1 leading-6 text-slate-600 ${compact ? 'text-[12px]' : 'text-[13px]'}`}>{event.detail}</div>
    </div>
  );
}

function ReviewMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'emerald' | 'amber' | 'rose';
}) {
  const toneClass = tone === 'emerald'
    ? 'bg-emerald-50 text-emerald-700'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : tone === 'rose'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-slate-50 text-slate-700';

  return (
    <div className={`rounded-xl px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="mt-1.5 text-[20px] font-semibold">{value}</div>
    </div>
  );
}

function ReviewCallout({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-black/[0.05] bg-slate-50 px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
        {icon}
        {title}
      </div>
      <p className="mt-2 text-[12px] leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function ReviewListBlock({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <div className="rounded-[20px] border border-black/[0.05] bg-slate-50 px-4 py-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{title}</div>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? items.map((item, index) => (
          <div key={`${title}-${index}`} className="text-[12px] leading-6 text-slate-600">
            {item}
          </div>
        )) : (
          <div className="text-[12px] leading-6 text-slate-400">{emptyText}</div>
        )}
      </div>
    </div>
  );
}

function EmptyReviewState({ text }: { text: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-[12px] text-slate-400">
      {text}
    </div>
  );
}
