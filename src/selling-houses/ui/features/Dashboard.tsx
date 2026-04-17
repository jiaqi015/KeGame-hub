import React, { useMemo, useState } from 'react';
import { GameState } from '../../domain/models';
import { formatDate } from '../../domain/utils';
import { TrendingUp, Users, Calendar, Home as HomeIcon, Zap, ShieldAlert, ArrowRight, Clock3, CalendarDays, Sparkles, Orbit, Layers3 } from 'lucide-react';
import { DailyJournal } from '../widgets/DailyJournal';
import { WEEKLY_ROUTINE } from '../../domain/constants';
import { getDayOfWeek, getRoutine } from '../../domain/utils';

interface DashboardProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onSetView: (view: string) => void;
  onAutoExecute: () => void;
}

export function Dashboard({ state, onSelectCase, onSetView, onAutoExecute }: DashboardProps) {
  const { metrics, schedule, priorities, day, maxDay, currentDate } = state;
  const currentDoW = getDayOfWeek(day);
  const [selectedOffset, setSelectedOffset] = useState(0);
  const { scenarioSnapshot } = state.runContext;
  const highlightedMarketEvents = state.eventLog
    .filter((event) => event.actor === '市场' || event.actor === '宏观')
    .slice(0, 3);
  const weekPlan = useMemo(() => buildWeekPlan(state), [state]);
  const selectedDay = weekPlan[selectedOffset] || weekPlan[0];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Top Summary Metrics */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="综合竞争力" value={metrics.averageTrust} icon={<TrendingUp size={20} />} color="text-emerald-600" />
        <MetricCard label="漏斗健康 (D1)" value={metrics.averageD1} icon={<Users size={20} />} color="text-blue-600" />
        <MetricCard label="业主意愿 (D3)" value={metrics.averageD3} icon={<Zap size={20} />} color="text-amber-600" />
        <MetricCard label="项目进度" value={`${day}/${maxDay} 天`} icon={<Calendar size={20} />} color="text-slate-600" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[28px] border border-black/5 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <Orbit size={18} className="text-amber-500" />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">当前剧本</h3>
              <p className="mt-1 text-xs text-slate-400">你现在玩的不是固定关卡，而是从同一世界规格里抽出来的一份剧本。</p>
            </div>
          </div>
          <div className="rounded-[24px] border border-black/[0.04] bg-gradient-to-br from-amber-50 via-white to-slate-50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {scenarioSnapshot.world.name} · World v{scenarioSnapshot.world.version}
                </div>
                <div className="mt-1.5 text-[22px] font-bold tracking-tight text-slate-900">{scenarioSnapshot.scenario.name}</div>
                <div className="mt-1 text-[13px] font-semibold text-amber-700">{scenarioSnapshot.scenario.theme}</div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{scenarioSnapshot.scenario.description}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">难度</div>
                <div className="mt-1 text-xl font-black uppercase tracking-[0.08em] text-slate-900">{state.runContext.difficultyId}</div>
                <div className="text-[10px] text-slate-400">{scenarioSnapshot.scenario.maxDay} 天时限</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <InfoPill label="房源数量" value={`${scenarioSnapshot.scenario.cases.length} 套`} />
              <InfoPill label="竞争组" value={`${scenarioSnapshot.scenario.competitionGroups.length} 组`} />
              <InfoPill label="脚本事件" value={`${scenarioSnapshot.scenario.scriptedEvents.length} 个`} />
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-black/5 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <Layers3 size={18} className="text-slate-700" />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">本局教学重点</h3>
              <p className="mt-1 text-xs text-slate-400">这局在逼你学什么，最好一眼能看出来。</p>
            </div>
          </div>
          <div className="space-y-2.5">
            <TeachingItem
              title="世界层"
              detail={`当前月份是 ${new Date(currentDate).getMonth() + 1} 月，市场热度会受世界里的季节曲线影响。`}
            />
            <TeachingItem
              title="剧本层"
              detail={`这局预埋了 ${scenarioSnapshot.scenario.scriptedEvents.length} 个脚本事件，教学抓手是“${scenarioSnapshot.scenario.theme}”。`}
            />
            <TeachingItem
              title="运行层"
              detail={`当前在跑第 ${day} 天，随机流和 scenarioSnapshot 一起写进存档，不会因为后续版本变化漂移。`}
            />
          </div>
        </section>
      </div>

      <div className="bg-white rounded-[28px] border border-black/5 p-5 shadow-sm overflow-x-auto">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="text-amber-500" size={18} />
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800">本周经营日历</h4>
              <p className="mt-1 text-xs text-slate-400">保留每日简报的开工仪式感，日常则持续看见这一周的安排。</p>
            </div>
          </div>
          <div className="hidden rounded-full bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 md:inline-block">
            从 {formatDate(currentDate)} 起看未来 7 天
          </div>
        </div>
        <div className="grid min-w-[880px] grid-cols-7 gap-2.5">
          {weekPlan.map((entry, index) => {
            const isCurrent = index === 0;
            const isSelected = index === selectedOffset;
            return (
              <button
                type="button"
                key={`${entry.day}-${entry.date}`}
                onClick={() => setSelectedOffset(index)}
                className={`rounded-[20px] border p-3 text-left transition-all ${
                  isSelected
                    ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10'
                    : isCurrent
                      ? 'border-amber-300 bg-amber-50 shadow-sm'
                      : 'border-black/5 bg-slate-50/80 hover:border-black/10 hover:bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={`text-[10px] font-bold uppercase tracking-[0.18em] ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>{entry.routine.label}</div>
                    <div className={`mt-1 text-[13px] font-bold ${isSelected ? 'text-white' : 'text-slate-800'}`}>{formatDate(entry.date)}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ${
                    isSelected ? 'bg-white/15 text-white' : isCurrent ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-500'
                  }`}>
                    {isCurrent ? '今天' : `+${index}天`}
                  </span>
                </div>
                <div className={`mt-2.5 text-[12px] font-semibold leading-relaxed ${isSelected ? 'text-white' : 'text-slate-700'}`}>
                  {entry.routine.theme}
                </div>
                <div className={`mt-2.5 text-[10px] font-bold uppercase tracking-[0.16em] ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                  ⚡️ {entry.routine.energy} 精力
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {entry.highlights.slice(0, 2).map((item, itemIndex) => (
                    <div
                      key={itemIndex}
                      className={`rounded-lg px-2.5 py-1.5 text-[10px] font-medium leading-relaxed ${
                        isSelected
                          ? 'bg-white/10 text-white'
                          : 'bg-white text-slate-600 shadow-sm'
                      }`}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr] items-start">
        <section className="space-y-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="bg-white rounded-[28px] border border-black/5 p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <CalendarDays size={18} className="text-amber-500" />
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">当日卡片</h3>
                  <p className="mt-1 text-xs text-slate-400">点周历里的任意一天，看那天的节奏、资源和预排事项。</p>
                </div>
              </div>
              <div className="rounded-[24px] border border-black/[0.04] bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{selectedDay.routine.label}</div>
                    <div className="mt-1.5 text-[22px] font-bold tracking-tight text-slate-900">{formatDate(selectedDay.date)}</div>
                    <div className="mt-1.5 text-[13px] font-semibold text-slate-700">{selectedDay.routine.theme}</div>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">资源</div>
                    <div className="mt-1 text-xl font-bold text-slate-900">{selectedDay.routine.energy}</div>
                    <div className="text-[10px] text-slate-400">精力</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-3">
                  {selectedDay.focus.map((item, index) => (
                    <div key={index} className="rounded-xl bg-white px-3.5 py-3 shadow-sm">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">重点</div>
                      <div className="mt-1 text-[13px] font-semibold leading-relaxed text-slate-700">{item}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="bg-white rounded-[28px] border border-black/5 p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Sparkles size={18} className="text-slate-700" />
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">事件与安排流</h3>
                    <p className="mt-1 text-xs text-slate-400">把固定节奏、预排事项和突发事件放在一条时间流里。</p>
                  </div>
                </div>
                <span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  {selectedOffset === 0 ? '今天' : `${selectedOffset} 天后`}
                </span>
              </div>
              <div className="space-y-2.5">
                {selectedDay.timeline.map((item, index) => (
                  <div
                    key={index}
                    className={`rounded-xl border px-3.5 py-3.5 ${
                      item.tone === 'danger'
                        ? 'border-rose-200 bg-rose-50/80'
                        : item.tone === 'accent'
                          ? 'border-amber-200 bg-amber-50/70'
                          : 'border-black/[0.04] bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{item.label}</div>
                        <div className="mt-1 text-[13px] font-semibold leading-relaxed text-slate-800">{item.title}</div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.detail}</p>
                      </div>
                      <ArrowRight size={16} className="mt-1 shrink-0 text-slate-300" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="bg-white rounded-[28px] border border-black/5 p-6 shadow-sm">
            <DailyJournal state={state} />
          </section>
        </section>

        {/* Side Column: Actionable Insights */}
        <aside className="space-y-6">
          {highlightedMarketEvents.length > 0 && (
            <section className="bg-gradient-to-br from-amber-50 via-white to-rose-50 rounded-[24px] border border-amber-200/60 p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-amber-700">
                <ShieldAlert className="text-rose-500" size={16} />
                市场异动
              </h3>
              <div className="space-y-2.5">
                {highlightedMarketEvents.map((event, index) => (
                  <div
                    key={`${event.day}-${index}`}
                    className={`rounded-xl border px-3.5 py-3 ${
                      event.tone === 'danger'
                        ? 'border-rose-200 bg-rose-50/80'
                        : 'border-emerald-200 bg-emerald-50/80'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{event.actor}</div>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-slate-700">{event.message}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Priorities Section */}
          <section className="flex flex-col rounded-[24px] border border-black/5 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2 text-slate-400 uppercase tracking-widest">
                <Zap className="text-amber-500" size={16} />
                建议决策
              </h3>
              <button 
                onClick={onAutoExecute}
                disabled={state.energy <= 0 || priorities.length === 0}
                className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-slate-900 text-white hover:scale-105 transition-all disabled:opacity-20 disabled:scale-100 shadow-lg shadow-slate-900/10"
              >
                建议执行
              </button>
            </div>
            <div className="space-y-2.5">
              {priorities.map((p, i) => (
                <div 
                  key={i} 
                  className="group rounded-xl border border-transparent bg-slate-50 p-3.5 transition-all cursor-pointer hover:border-black/10"
                  onClick={() => {
                    if (p.caseId) {
                      onSelectCase(p.caseId);
                      onSetView('cases');
                    }
                  }}
                >
                  <div className="flex justify-between items-start">
                    <strong className="text-xs font-bold text-slate-800 tracking-tight">{p.title}</strong>
                    <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">{p.kind}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{p.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Risk Monitoring Section */}
          <section className="rounded-[24px] border border-black/5 bg-white p-5 shadow-sm">
            <h3 className="mb-5 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-400">
              <ShieldAlert className="text-rose-500" size={16} />
              预警监控
            </h3>
            <div className="space-y-2.5">
              {schedule.map((s) => (
                <div key={s.key} className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 bg-slate-50/30 p-3">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-slate-700">{s.title}</span>
                    <small className="text-[9px] text-slate-400 font-medium">{s.badge}</small>
                  </div>
                  <div className="h-6 w-6 rounded-full bg-rose-50 flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                  </div>
                </div>
              ))}
              {schedule.length === 0 && (
                <p className="text-slate-400 text-[10px] font-medium text-center py-6 italic">商圈表现稳定，暂无显著风险。</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-3.5 py-3 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 text-[14px] font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function TeachingItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-black/[0.05] bg-slate-50 px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{title}</div>
      <div className="mt-1 text-sm leading-6 text-slate-700">{detail}</div>
    </div>
  );
}

function buildWeekPlan(state: GameState) {
  return Array.from({ length: 7 }, (_, offset) => {
    const absoluteDay = state.day + offset;
    const date = shiftDate(state.currentDate, offset);
    const routine = getRoutine(absoluteDay, WEEKLY_ROUTINE);
    const fixedAgenda = deriveFixedAgenda(absoluteDay, state);
    const currentAgenda = offset === 0
      ? [
          ...state.priorities.slice(0, 2).map((entry: any) => ({
            label: '建议',
            title: entry.title,
            detail: entry.detail,
            tone: entry.kind === 'opportunity' ? 'accent' : 'neutral',
          })),
          ...state.schedule.slice(0, 2).map((entry: any) => ({
            label: '预警',
            title: entry.title,
            detail: entry.note || entry.badge,
            tone: 'danger',
          })),
          ...state.eventLog
            .filter((event) => event.day === state.day && (event.actor === '市场' || event.actor === '宏观'))
            .slice(0, 1)
            .map((event: any) => ({
              label: event.actor,
              title: '市场异动',
              detail: event.message,
              tone: event.tone === 'danger' ? 'danger' : 'accent',
            })),
        ]
      : [];
    const timeline = [...fixedAgenda, ...currentAgenda].slice(0, 5);
    return {
      day: absoluteDay,
      date,
      routine,
      highlights: timeline.slice(0, 3).map(item => item.title),
      focus: timeline.length > 0
        ? timeline.slice(0, 3).map(item => item.title)
        : [`${routine.label} 以 ${routine.theme} 为主`, `保留 ${routine.energy} 点精力用于经营`, '暂无额外安排，可灵活调度'],
      timeline: timeline.length > 0
        ? timeline
        : [
            {
              label: '安排',
              title: `${routine.label} 按 ${routine.theme} 推进`,
              detail: `这一天默认给你 ${routine.energy} 点精力，适合围绕主题做经营动作。`,
              tone: 'neutral',
            },
          ],
    };
  });
}

function deriveFixedAgenda(day: number, state: GameState) {
  const routine = getRoutine(day, WEEKLY_ROUTINE);
  const dow = getDayOfWeek(day);
  const items: Array<{ label: string; title: string; detail: string; tone: 'neutral' | 'accent' | 'danger' }> = [
    {
      label: '节奏',
      title: routine.theme,
      detail: `这一天系统默认给你 ${routine.energy} 点精力，适合按周节奏排布工作。`,
      tone: 'neutral',
    },
  ];

  if (dow === 4) {
    const names = state.cases
      .filter(c => c.status === 'active')
      .sort((a, b) => b.competitiveness - a.competitiveness)
      .slice(0, 2)
      .map(c => c.title);
    items.push({
      label: '固定事项',
      title: '房源聚焦会',
      detail: names.length > 0 ? `建议优先提报 ${names.join('、')}，争取本周资源位。` : '这周仍需要准备可提报的盘源材料。',
      tone: 'accent',
    });
  }

  if (dow === 5) {
    items.push({
      label: '固定事项',
      title: '每周业主反馈',
      detail: '整理带看、准客池和竞品反馈，用一页话术把房东拉回同一口径。',
      tone: 'accent',
    });
  }

  if (dow === 6 || dow === 7) {
    items.push({
      label: '固定事项',
      title: dow === 6 ? '周末带看高峰' : '开放日后追客',
      detail: dow === 6 ? '适合把本周积累的准客压到带看和再看。' : '如果周末做过动作，今天要优先吃后续结果。',
      tone: 'accent',
    });
  }

  if (routine.energy <= 1) {
    items.push({
      label: '提醒',
      title: '低资源日',
      detail: '精力紧，只适合做最关键的一两件事，不适合同时铺太多动作。',
      tone: 'danger',
    });
  }

  return items;
}

function shiftDate(currentDate: string, offset: number) {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + offset);
  return date.toISOString().split('T')[0];
}

function MetricCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className="group rounded-[22px] border border-black/5 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-2.5 flex items-center gap-3">
        <div className={`rounded-xl bg-slate-50 p-2 ${color} transition-transform group-hover:scale-110`}>
          {icon}
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">{label}</span>
      </div>
      <div className="text-[22px] font-bold tracking-tight text-slate-900">{value}</div>
    </div>
  );
}
