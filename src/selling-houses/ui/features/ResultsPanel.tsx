import React, { useMemo } from 'react';
import type { Case, GameState } from '../../domain/models';
import { buildResultProjection } from '../../application/projections/resultProjection.js';

interface ResultsPanelProps {
  state: GameState;
  onRestart: () => void;
}

export function ResultsPanel({ state, onRestart }: ResultsPanelProps) {
  const projection = useMemo(() => buildResultProjection(state), [state]);
  const currentCases = state.cases.slice(0, 8);
  const hasFinalResult = Boolean(state.finalResult);
  const leadingHighlight = projection.highlights[0];
  const leadingImprovement = projection.improvements[0];
  const resolvedCaseCount = projection.tierGroups.reduce((sum, group) => sum + group.total, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-4" data-selling-houses-page="results">
      <section className="seller-panel-muted p-4 lg:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="seller-label">
              {projection.hero.eyebrow}
            </div>
            <h3 className="seller-title mt-2 text-[22px]">
              {projection.hero.title}
            </h3>
            <p className="seller-body mt-2 text-sm">
              {projection.hero.summary}
            </p>
            <div className="seller-chip mt-3 inline-flex">
              {projection.hero.settlementLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={onRestart}
            className="seller-button-secondary inline-flex h-11 items-center justify-center px-4 text-[12px]"
          >
            重开本局
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-6">
          {projection.summaryCards.map((card) => (
            <React.Fragment key={card.label}>
              <MetricCard eyebrow={card.label} value={card.value} note={card.note} tone={card.tone} />
            </React.Fragment>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <BoundaryCard
            label="当前状态"
            title={hasFinalResult ? '正式结算' : '未结算台账'}
            detail={hasFinalResult
              ? '这局结果已经定下。'
              : '这页现在还是过程台账。'}
            tone={hasFinalResult ? 'chance' : 'neutral'}
          />
          <BoundaryCard
            label="重点"
            title={hasFinalResult ? '每套房最后是什么结果' : '场上每套房现在是什么状态'}
            detail={hasFinalResult
              ? `这局已经有 ${resolvedCaseCount} 套房形成正式结果。`
              : `现在还有 ${currentCases.length} 套房在场。`}
            tone={leadingHighlight ? 'chance' : 'neutral'}
          />
          <BoundaryCard
            label="带走"
            title={hasFinalResult ? (leadingHighlight || '还没有形成明确亮点') : (leadingImprovement || '当前还没有明确复盘点')}
            detail={hasFinalResult
              ? (leadingHighlight ? '这条最值得记住。' : '这局还没有特别突出的亮点。')
              : (leadingImprovement ? '这条最值得带回复盘页。' : '这局还没有特别集中的问题点。')}
            tone={hasFinalResult ? (leadingHighlight ? 'chance' : 'neutral') : (leadingImprovement ? 'risk' : 'neutral')}
          />
        </div>
      </section>

      <section className="seller-panel p-4 lg:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="seller-label">单房结果</div>
            <h4 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">
              {hasFinalResult ? '每套房最后都怎么样了' : '场上每套房现在收成什么样'}
            </h4>
          </div>
          <div className="text-[11px] font-semibold text-[var(--seller-subtle)]">
            {hasFinalResult ? '来自正式结算' : '当前局面预览'}
          </div>
        </div>

        <div className="seller-note mt-4 px-4 py-4 text-[12px] leading-6">
          {hasFinalResult
            ? '单房结果和总分已生成。'
            : '当前收成预览。'}
        </div>

        {hasFinalResult ? (
          <div className="mt-5 space-y-4">
            {projection.tierGroups.map((group) => (
              <section key={group.goalTier} className="seller-panel-soft p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[16px] font-semibold text-[var(--seller-ink)]">{group.label}</div>
                    <div className="seller-body mt-1 text-[12px] leading-6">{group.preview}</div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <MiniTierBadge label="结果不错" value={group.good} tone="emerald" />
                    <MiniTierBadge label="结果一般" value={group.neutral} tone="amber" />
                    <MiniTierBadge label="结果较差" value={group.bad} tone="rose" />
                    <MiniTierBadge label="被抢走" value={group.lost} tone="slate" />
                  </div>
                </div>
                {group.items.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {group.items.map((entry) => (
                      <React.Fragment key={entry.caseId}>
                        <FinalCaseResultCard entry={entry} />
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  <div className="seller-empty px-4 py-8 text-center text-[12px]">
                    这组本局没有分到房源。
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {currentCases.map((entry) => (
              <React.Fragment key={entry.id}>
                <CurrentCaseResultCard caseItem={entry} />
              </React.Fragment>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
            <section className="seller-panel-muted p-4 lg:p-5">
            <div className="seller-label text-[var(--seller-accent)]">哪些算结果</div>
            <h4 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">结果和过程怎么分</h4>
            <div className="mt-5 space-y-3">
              {projection.settlementNotes.map((note) => (
                <React.Fragment key={note.title}>
                  <PlainNote title={note.title} detail={note.detail} tone={note.tone} />
                </React.Fragment>
              ))}
            </div>
          </section>

          {hasFinalResult ? (
            <section className="seller-panel p-4 lg:p-5">
              <div className="seller-label">三项得分</div>
              <h4 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">得分</h4>
              <div className="mt-5 space-y-3">
                {projection.scoreBreakdown.length > 0 ? projection.scoreBreakdown.map((entry) => (
                  <div key={entry.label} className="seller-tablet px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-[var(--seller-ink)]">{entry.label}</div>
                        {entry.summary && <div className="seller-body mt-1 text-[12px] leading-5">{entry.summary}</div>}
                      </div>
                      <div className="text-base font-bold text-[var(--seller-accent)]">
                        {entry.value}{entry.maxValue ? ` / ${entry.maxValue}` : ''}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="seller-empty px-4 py-10 text-center text-sm">
                    这局还没有正式结算分数。
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="seller-panel p-4 lg:p-5">
              <div className="seller-label">还没结算</div>
              <h4 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">当前台账还不是最终成绩</h4>
              <div className="mt-5 space-y-3">
                <PlainNote
                  title="现在只看当前收成"
                  detail="这页只看哪些房还在场、哪些房已经危险。"
                  tone="neutral"
                />
                <PlainNote
                  title="正式结果要等结算"
                  detail="只有正式结算之后，单房结果、三项得分和榜单资格才会一起定下来。"
                  tone="neutral"
                />
              </div>
            </section>
          )}
        </div>

        <section className="grid grid-cols-1 gap-4">
          {hasFinalResult ? (
            <section className="seller-panel-muted p-4 lg:p-5">
              <div className="seller-label text-[var(--seller-accent)]">生涯记录</div>
              <h4 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">这局最后会留下什么</h4>
              <div className="mt-5 space-y-3">
                {projection.careerNotes.map((note) => (
                  <React.Fragment key={note.title}>
                    <PlainNote title={note.title} detail={note.detail} tone={note.tone} />
                  </React.Fragment>
                ))}
              </div>
            </section>
          ) : (
            <section className="seller-panel-muted p-4 lg:p-5">
              <div className="seller-label text-[var(--seller-accent)]">当前状态</div>
              <h4 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">现在还不会记进跨局成绩</h4>
              <div className="mt-5 space-y-3">
                <PlainNote
                  title="局内台账"
                  detail="你现在看到的是局内未结算台账，还不会写进生涯。"
                  tone="neutral"
                />
                <PlainNote
                  title="正式结果要等结算"
                  detail="只有本局正式结算之后，成绩、单房结果和亮点复盘才会真正写入。"
                  tone="neutral"
                />
              </div>
            </section>
          )}

          <InsightBlock
            title={hasFinalResult ? '这局正式留下的亮点' : '当前最稳的一笔'}
            items={projection.highlights}
            emptyText={hasFinalResult ? '这局目前还没有特别突出的亮点。' : '现在还没有特别突出的过程亮点。'}
          />
          <InsightBlock
            title={hasFinalResult ? '这局正式留下的复盘点' : '当前最该回看的地方'}
            items={projection.improvements}
            emptyText={hasFinalResult ? '这局目前还没有特别集中的复盘点。' : '现在还没有明确复盘点。'}
          />
        </section>
      </div>
    </div>
  );
}

function FinalCaseResultCard({ entry }: { entry: NonNullable<ReturnType<typeof buildResultProjection>['tierGroups'][number]['items'][number]> }) {
  return (
    <div className="seller-tablet p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[18px] font-semibold text-[var(--seller-ink)]">{entry.title}</div>
          <div className="mt-1 text-[12px] text-[var(--seller-subtle)]">{entry.ownerName} · {entry.community}</div>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
          entry.endingBucket === 'good'
            ? 'bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
            : entry.endingBucket === 'bad'
              ? 'bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
              : 'bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]'
        }`}>
          {entry.endingBucketLabel}
        </span>
      </div>
      <p className="seller-body mt-3 text-sm leading-6">{entry.endingSummary}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MetricChip label="房源去向" value={entry.defenseOutcomeLabel} />
        <MetricChip label="业主感受" value={entry.ownerSatisfactionLabel} />
        <MetricChip label="和同类房相比" value={entry.relativeOutcomeLabel} />
        <MetricChip label="正式结果价" value={entry.soldPrice ? `${entry.soldPrice} 万` : '--'} />
      </div>
    </div>
  );
}

function CurrentCaseResultCard({ caseItem }: { caseItem: Case }) {
  const statusLabel = caseItem.status === 'sold'
    ? '已成交'
    : caseItem.status === 'withdrawn'
      ? '已撤回'
      : caseItem.status === 'lost_to_rival'
        ? '已丢盘'
        : '进行中';
  const statusDetail = caseItem.status === 'sold'
    ? `这套房已经成交，结果价 ${caseItem.soldPrice || '--'} 万。`
    : caseItem.status === 'withdrawn'
      ? '这套房已经撤回，后续需要回看撤回前发生了什么。'
      : caseItem.status === 'lost_to_rival'
      ? '这套房已经被别人做掉了，后续要重点回看是价格、客户线还是跟进先出了问题。'
        : '这套房还在经营中，正式结算后才会变成成绩。';

  return (
    <div className="seller-tablet p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[18px] font-semibold text-[var(--seller-ink)]">{caseItem.title}</div>
          <div className="mt-1 text-[12px] text-[var(--seller-subtle)]">{caseItem.ownerName} · {caseItem.community}</div>
        </div>
        <span className="seller-chip">
          {statusLabel}
        </span>
      </div>
      <p className="seller-body mt-3 text-sm leading-6">
        {statusDetail}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MetricChip label="房源状态" value={caseItem.status === 'lost_to_rival' ? '被别人做掉' : statusLabel} />
        <MetricChip label="业主状态" value={caseItem.ownerMood} />
        <MetricChip label="挂牌价" value={`${caseItem.askPrice} 万`} />
        <MetricChip label="热度" value={`${caseItem.heat}`} />
      </div>
    </div>
  );
}

function MiniTierBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  const className = tone === 'emerald'
    ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
    : tone === 'amber'
      ? 'border-[color:var(--seller-accent)]/22 bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]'
      : tone === 'rose'
        ? 'border-[color:var(--seller-risk)]/22 bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
        : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] text-[var(--seller-muted)]';

  return (
    <div className={`rounded-[16px] border px-3 py-2 text-center ${className}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-75">{label}</div>
      <div className="mt-1 text-[13px] font-semibold">{value}</div>
    </div>
  );
}

function BoundaryCard({
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
    ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)]'
    : tone === 'risk'
      ? 'border-[color:var(--seller-risk)]/22 bg-[var(--seller-risk-soft)]'
      : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]';

  return (
    <div className={`rounded-[22px] border px-4 py-4 ${className}`}>
      <div className="seller-label">{label}</div>
      <div className="mt-2 text-[15px] font-semibold text-[var(--seller-ink)]">{title}</div>
      <div className="seller-body mt-2 text-[12px] leading-6">{detail}</div>
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
    ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]'
    : tone === 'risk'
      ? 'border-[color:var(--seller-risk)]/22 bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]'
      : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] text-[var(--seller-muted)]';

  return (
    <div className={`rounded-[18px] border px-4 py-4 ${toneClass}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-[12px] leading-5 opacity-80">{detail}</div>
    </div>
  );
}

function InsightBlock({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <section className="seller-panel p-6">
      <div className="seller-label">{title}</div>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? items.map((entry, index) => (
          <div key={`${entry}-${index}`} className="seller-tablet px-4 py-4 text-sm leading-6 text-[var(--seller-muted)]">
            {entry}
          </div>
        )) : (
          <div className="seller-empty px-4 py-10 text-center text-sm">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}

function MetricCard({
  eyebrow,
  value,
  note,
  tone = 'neutral',
}: {
  eyebrow: string;
  value: string;
  note: string;
  tone?: 'neutral' | 'chance' | 'risk';
}) {
  const valueClass = tone === 'chance' ? 'text-[var(--seller-chance)]' : tone === 'risk' ? 'text-[var(--seller-risk)]' : 'text-[var(--seller-ink)]';

  return (
    <div className="seller-tablet px-4 py-4">
      <div className="seller-label">{eyebrow}</div>
      <div className={`mt-2 text-[22px] font-semibold ${valueClass}`}>{value}</div>
      <div className="seller-body mt-1 text-[12px] leading-5">{note}</div>
    </div>
  );
}

function MetricChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="seller-tablet px-4 py-3">
      <div className="seller-label">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[var(--seller-ink)]">{value}</div>
    </div>
  );
}
