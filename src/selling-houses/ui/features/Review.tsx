import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, History, Lightbulb, ShieldAlert, Target, TrendingUp, Users } from 'lucide-react';
import type { GameState } from '../../domain/models';
import {
  buildReviewProjection,
  type ReviewTurningPointProjection,
} from '../../application/projections/reviewProjection.js';

interface ReviewProps {
  state: GameState;
}

type ReviewTab = 'turning' | 'brief' | 'customer' | 'weekly';

export function Review({ state }: ReviewProps) {
  const projection = useMemo(() => buildReviewProjection(state), [state]);
  const [activeTab, setActiveTab] = useState<ReviewTab>('turning');
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
          </div>
          <div className="seller-tablet px-4 py-4">
            <div className="seller-label">回看范围</div>
            <div className="mt-2 text-sm font-semibold text-[var(--seller-ink)]">
              {projection.turningPoints.length} 条关键变化 · {projection.weeklyReviews.length} 条周沉淀
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <TurningSummaryCard
            label="先变的点"
            title={leadTurningPoint?.title || '还没有形成主变化'}
            detail={leadTurningPoint?.detail || '再推进几天会更清楚。'}
            tone={leadTurningPoint?.tone || 'neutral'}
          />
          <TurningSummaryCard
            label="转好的点"
            title={chanceTurningPoint?.title || '往前走的机会还不明显'}
            detail={chanceTurningPoint?.detail || '目前还没有明显起量点。'}
            tone={chanceTurningPoint?.tone || 'neutral'}
          />
          <TurningSummaryCard
            label="转差的点"
            title={riskTurningPoint?.title || '暂时没有集中失手点'}
            detail={riskTurningPoint?.detail || '当前还没有集中风险线。'}
            tone={riskTurningPoint?.tone || 'neutral'}
          />
        </div>
      </section>

      <section className="seller-panel-muted p-4 lg:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp size={18} className="text-[var(--seller-accent)]" />
            <div>
              <h4 className="text-[18px] font-semibold text-[var(--seller-ink)]">回看主线</h4>
              <p className="seller-body mt-1 text-sm">先看结果，再切到对应明细。</p>
            </div>
          </div>
          <div className="seller-tabbar">
            <button
              type="button"
              onClick={() => setActiveTab('turning')}
              className={`seller-tab ${activeTab === 'turning' ? 'seller-tab-active' : ''}`}
            >
              关键变化
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('brief')}
              className={`seller-tab ${activeTab === 'brief' ? 'seller-tab-active' : ''}`}
            >
              昨日摘要
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('customer')}
              className={`seller-tab ${activeTab === 'customer' ? 'seller-tab-active' : ''}`}
            >
              客户线
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('weekly')}
              className={`seller-tab ${activeTab === 'weekly' ? 'seller-tab-active' : ''}`}
            >
              周沉淀
            </button>
          </div>
        </div>

        {activeTab === 'turning' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="seller-tablet px-5 py-5">
              <div className="seller-label">主变化</div>
              <div className="mt-2 text-[18px] font-semibold text-[var(--seller-ink)]">
                {leadTurningPoint?.title || '还没有形成足够清晰的转折点'}
              </div>
              <div className="seller-body mt-2 text-[13px] leading-6">
                {leadTurningPoint?.detail || '这局目前还处在铺垫阶段。'}
              </div>
              {leadTurningPoint && (
                <div className="seller-chip mt-4 inline-flex">
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
        )}

        {activeTab === 'brief' && (
          <>
            {projection.dailyBrief ? (
              <div className="space-y-4">
                <div className="seller-note px-4 py-4">
                  <div className="seller-label">{projection.dailyBrief.title}</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--seller-ink)]">{projection.dailyBrief.headline}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <ReviewListBlock title="指标" items={projection.dailyBrief.metricNotes} emptyText="昨天没有明显指标变化。" />
                  <ReviewListBlock title="市场" items={projection.dailyBrief.marketNews} emptyText="昨天没有新增市场消息。" />
                  <ReviewListBlock title="聚焦房源" items={projection.dailyBrief.focusCases} emptyText="今天还没有聚焦房源。" />
                  <ReviewListBlock title="先处理" items={projection.dailyBrief.priorities} emptyText="今天还没有生成优先事项。" />
                </div>
              </div>
            ) : (
              <EmptyReviewState text="当前还没有昨日简报。" />
            )}
          </>
        )}

        {activeTab === 'customer' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <ReviewMetric label="推进中" value={`${projection.customer.engaged}`} tone="emerald" />
              <ReviewMetric label="比较中" value={`${projection.customer.comparing}`} tone="amber" />
              <ReviewMetric label="掉线风险" value={`${projection.customer.atRisk}`} tone="rose" />
              <ReviewMetric label="被带偏" value={`${projection.customer.rivalPulled}`} tone="slate" />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
                body={projection.customer.mostAtRiskCaseTitle ? `${projection.customer.mostAtRiskCaseTitle} 挂着最多容易掉线的客户。` : '目前没有特别集中的掉线风险房源。'}
              />
            </div>
            <div className="seller-note px-4 py-4 text-sm leading-6">
              {projection.customer.summary}
            </div>
          </div>
        )}

        {activeTab === 'weekly' && (
          <div className="space-y-3">
            {projection.weeklyReviews.length > 0 ? projection.weeklyReviews.map((entry) => (
              <div key={entry.id} className="seller-tablet px-4 py-4">
                <div className="text-sm font-semibold text-[var(--seller-ink)]">{entry.title}</div>
                <div className="seller-body mt-2 text-[12px] leading-6">{entry.note}</div>
                <div className="seller-note mt-3 px-3 py-3">
                  <div className="seller-label">留下的话</div>
                  <div className="mt-1 text-[12px] leading-6 text-[var(--seller-muted)]">
                    {entry.suggestion}
                  </div>
                </div>
              </div>
            )) : (
              <EmptyReviewState text="这局还没跑满一周。" />
            )}
          </div>
        )}
      </section>

      <section className="seller-panel p-4 lg:p-5">
        <div className="mb-4 flex items-center gap-3">
          <Target size={18} className="text-[var(--seller-chance)]" />
          <div>
            <h4 className="text-[18px] font-semibold text-[var(--seller-ink)]">关键变化</h4>
            <p className="seller-body mt-1 text-sm">只放改变局面的点。</p>
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <section className="seller-panel p-4 lg:p-5">
          <div className="mb-4 flex items-center gap-3">
            <History size={18} className="text-[var(--seller-risk)]" />
            <div>
              <h4 className="text-[18px] font-semibold text-[var(--seller-ink)]">补充变化</h4>
              <p className="seller-body mt-1 text-sm">主线之外的补充变化。</p>
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
              <Lightbulb size={18} className="text-[var(--seller-accent)]" />
              <div>
                <h4 className="text-[18px] font-semibold text-[var(--seller-ink)]">回看提示</h4>
                <p className="seller-body mt-1 text-sm">{projection.hero.note}</p>
              </div>
            </div>
            <div className="seller-note px-4 py-4 text-sm leading-6">
              {projection.turningPoints.length > 0
                ? `先从 ${projection.turningPoints[0]?.label || '关键变化'} 看起，再切去昨日摘要或客户线。`
                : '先继续推进几天，再回来回看。'}
            </div>
          </section>

          <section className="seller-panel p-4 lg:p-5">
            <div className="mb-4 flex items-center gap-3">
              <Users size={18} className="text-[var(--seller-subtle)]" />
              <div>
                <h4 className="text-[18px] font-semibold text-[var(--seller-ink)]">客户摘要</h4>
                <p className="seller-body mt-1 text-sm">回看里只留结论。</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <ReviewMetric label="推进中" value={`${projection.customer.engaged}`} tone="emerald" />
              <ReviewMetric label="比较中" value={`${projection.customer.comparing}`} tone="amber" />
              <ReviewMetric label="掉线风险" value={`${projection.customer.atRisk}`} tone="rose" />
              <ReviewMetric label="被带偏" value={`${projection.customer.rivalPulled}`} tone="slate" />
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
    ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)]'
    : tone === 'risk'
      ? 'border-[color:var(--seller-risk)]/22 bg-[var(--seller-risk-soft)]'
      : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]';

  return (
    <div className={`rounded-[20px] border px-4 py-4 ${toneClass}`}>
      <div className="seller-label">{label}</div>
      <div className="mt-2 text-[15px] font-semibold text-[var(--seller-ink)]">{title}</div>
      <div className="seller-body mt-2 text-[12px] leading-6">{detail}</div>
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
    ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)]'
    : tone === 'risk'
      ? 'border-[color:var(--seller-risk)]/22 bg-[var(--seller-risk-soft)]'
      : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]';

  return (
    <div className={`rounded-[18px] border px-4 py-4 ${toneClass}`}>
      <div className="seller-label">{title}</div>
      <div className="seller-body mt-2 text-[12px] leading-6">{body}</div>
    </div>
  );
}

function renderTurningPointCard(event: ReviewTurningPointProjection, compact = false) {
  const toneClass = event.tone === 'chance'
    ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)]'
    : event.tone === 'risk'
      ? 'border-[color:var(--seller-risk)]/22 bg-[var(--seller-risk-soft)]'
      : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]';

  return (
    <div className={`rounded-[20px] border px-4 py-4 ${toneClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="seller-chip">
            {event.label}
          </span>
          {event.caseTitle && (
            <span className="text-[11px] font-semibold text-[var(--seller-muted)]">{event.caseTitle}</span>
          )}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">
          Day {event.day} · {event.date}
        </div>
      </div>
      <div className={`mt-2 font-semibold text-[var(--seller-ink)] ${compact ? 'text-[14px]' : 'text-[15px]'}`}>{event.title}</div>
      <div className={`seller-body mt-1 leading-6 ${compact ? 'text-[12px]' : 'text-[13px]'}`}>{event.detail}</div>
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
    ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
    : tone === 'amber'
      ? 'border-[color:var(--seller-accent)]/22 bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]'
      : tone === 'rose'
        ? 'border-[color:var(--seller-risk)]/22 bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
        : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] text-[var(--seller-ink)]';

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
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
    <div className="seller-tablet px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">
        {icon}
        {title}
      </div>
      <p className="seller-body mt-2 text-[12px] leading-6">{body}</p>
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
    <div className="seller-tablet px-4 py-4">
      <div className="seller-label">{title}</div>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? items.map((item, index) => (
          <div key={`${title}-${index}`} className="seller-body text-[12px] leading-6">
            {item}
          </div>
        )) : (
          <div className="text-[12px] leading-6 text-[var(--seller-subtle)]">{emptyText}</div>
        )}
      </div>
    </div>
  );
}

function EmptyReviewState({ text }: { text: string }) {
  return (
    <div className="seller-empty rounded-[22px] px-4 py-8 text-center text-[12px]">
      {text}
    </div>
  );
}
