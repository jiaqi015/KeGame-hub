import React from 'react';
import type { DailyReport, DailyTickResult, TickInvariantAlert } from '../../domain/models';
import { TrendingUp, AlertCircle, Star, Calendar, ArrowRight, Zap, Target, SunMedium, BriefcaseBusiness, MapPinned, ShieldAlert, Users } from 'lucide-react';

interface DailySummaryOverlayProps {
  report: DailyReport;
  tickResult?: DailyTickResult | null;
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

export function DailySummaryOverlay({ report, tickResult, onContinue }: DailySummaryOverlayProps) {
  const overnightEvents = [
    ...report.majorEvents.map((entry) => ({ ...entry, kind: 'major' as const })),
    ...report.randomEvents.map((entry) => ({ ...entry, kind: 'random' as const })),
  ];
  const invariantAlerts = tickResult?.invariantAlerts || [];
  const impactRows = buildImpactRows(tickResult);
  const riskRows = buildRiskRows(report, invariantAlerts);

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
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.18fr_0.82fr]">
            <section className="seller-panel min-w-0 overflow-hidden">
              <div className="border-b border-black/[0.05] px-5 py-4">
                <h4 className="seller-label flex items-center gap-2 text-xs">
                  <Zap size={14} className="text-amber-500" />
                  昨夜变化
                </h4>
              </div>

              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                  {report.metricsDelta.map((m, i) => (
                    <MetricCard key={`${m.label}-${i}`} metric={m} />
                  ))}
                </div>

                <div className="overflow-hidden rounded-[16px] border border-black/[0.05] bg-slate-50/70">
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
            </section>

            <aside className="seller-panel-muted">
              <div className="space-y-4 p-4">
                <h4 className="seller-label flex items-center gap-2 text-xs">
                  <SunMedium size={14} className="text-amber-500" />
                  今天安排
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <InfoBlock label="日程" value={report.todayPlan.label} />
                  <InfoBlock label="资源" value={`${report.todayPlan.energy} 精力`} />
                </div>

                <div className="seller-tablet px-4 py-4">
                  <div className="seller-label">今日主题</div>
                  <div className="mt-2 text-base font-semibold text-slate-900">{report.todayPlan.theme}</div>
                </div>

                {report.todayPlan.focusCases.length > 0 ? (
                  <div className="seller-tablet px-4 py-4">
                    <div className="seller-label mb-3 flex items-center gap-2">
                      <Target size={12} className="text-amber-500" />
                      今日商圈聚焦房
                    </div>
                    <div className="space-y-2">
                      {report.todayPlan.focusCases.map((name, i) => (
                        <div key={i} className="text-sm font-medium text-slate-700">
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-black/[0.06] pt-5">
                  <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                    <BriefcaseBusiness size={14} className="text-slate-600" />
                    今日关注
                  </h4>
                  <div className="overflow-hidden rounded-[18px] border border-black/[0.05] bg-white">
                    {report.todayPlan.priorities.length > 0 ? (
                      report.todayPlan.priorities.map((item, i) => (
                        <PriorityRow key={i} index={i + 1} text={item} isLast={i === report.todayPlan.priorities.length - 1} />
                      ))
                    ) : (
                      <div className="px-4 py-6 text-center text-sm text-slate-400">
                        今天没有明确待办，适合先盘点业主反馈和准客池。
                      </div>
                    )}
                  </div>
                </div>

                {(impactRows.length > 0 || riskRows.length > 0) && (
                  <div className="border-t border-black/[0.06] pt-5">
                    {impactRows.length > 0 && (
                      <div className="seller-tablet px-4 py-4">
                        <div className="seller-label mb-3 flex items-center gap-2">
                          <MapPinned size={12} className="text-emerald-600" />
                          今日影响明细
                        </div>
                        <div className="space-y-2">
                          {impactRows.map((row) => (
                            <div key={row.id}>
                              <ImpactRow row={row} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="seller-tablet mt-3 px-4 py-4">
                      <div className="seller-label mb-3 flex items-center gap-2">
                        <ShieldAlert size={12} className={riskRows.length > 0 ? 'text-rose-500' : 'text-emerald-600'} />
                        今日风险
                      </div>
                      {riskRows.length > 0 ? (
                        <div className="space-y-2.5">
                          {riskRows.slice(0, 3).map((row) => (
                            <div key={row.id}>
                              <RiskRow row={row} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 text-sm leading-6 text-slate-600">
                          <Users size={14} className="mt-1 shrink-0 text-emerald-600" />
                          <span>暂无新增高危变化，重点仍在今日关注。</span>
                        </div>
                      )}
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
    <div className={`rounded-[14px] bg-slate-50 px-3 py-2.5 ${absolute ? 'md:col-span-2' : ''}`}>
      <div className="text-[10px] font-bold tracking-[0.02em] text-slate-400">{metric.label}</div>
      <div className={`mt-2 text-[17px] font-bold ${valueClass}`}>
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
    <div className={`flex items-start gap-3 px-4 py-3.5 ${isLast ? '' : 'border-b border-black/[0.05]'}`}>
      <div className={`mt-0.5 ${toneClass}`}>
        {tone === 'success' && <Star size={15} />}
        {tone === 'danger' && <AlertCircle size={15} />}
        {tone === 'accent' && <TrendingUp size={15} />}
      </div>
      <div className="min-w-0">
        <div className="mb-1 text-[10px] font-bold tracking-[0.02em] text-slate-400">{actor}</div>
        <p className="text-[14px] font-medium leading-6 text-slate-700">{message}</p>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="seller-tablet px-4 py-4">
      <div className="seller-label">{label}</div>
      <div className="mt-2 text-[18px] font-bold text-slate-900">{value}</div>
    </div>
  );
}

function PriorityRow({ index, text, isLast }: { key?: React.Key; index: number; text: string; isLast: boolean }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 ${isLast ? '' : 'border-b border-black/[0.05]'}`}>
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
        {index}
      </div>
      <div className="pt-0.5 text-sm font-medium leading-6 text-slate-700">{text}</div>
    </div>
  );
}

function ImpactRow({ row }: { row: SummaryImpactRow }) {
  const toneClass = row.tone === 'danger'
    ? 'bg-rose-50 text-rose-600'
    : row.tone === 'success'
      ? 'bg-emerald-50 text-emerald-600'
      : 'bg-slate-100 text-slate-500';

  return (
    <div className="rounded-[14px] bg-white px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold leading-5 text-slate-800">{row.title}</div>
          <p className="mt-0.5 text-[12px] leading-5 text-slate-500">{row.detail}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${toneClass}`}>{row.label}</span>
      </div>
    </div>
  );
}

function RiskRow({ row }: { row: SummaryRiskRow }) {
  const toneClass = row.tone === 'danger'
    ? 'bg-rose-50 text-rose-600'
    : 'bg-amber-50 text-amber-700';

  return (
    <div className={`rounded-[14px] px-3 py-2.5 ${toneClass}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.02em]">{row.title}</div>
      <div className="mt-1 text-[13px] font-medium leading-6">{row.detail}</div>
    </div>
  );
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
    addRow({
      id: `deal-${deal.dealId}`,
      label: '成交',
      title: deal.caseTitle || deal.caseId,
      detail: `${deal.customerName || '客户'} · ${Math.round(deal.dealPrice || deal.price)} 万成交。`,
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
      addRow({
        id: `dirty-case-${caseId}`,
        label: '房源',
        title: label,
        detail: '状态、窗口或客户推进发生变化。',
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
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1)}…`;
}
