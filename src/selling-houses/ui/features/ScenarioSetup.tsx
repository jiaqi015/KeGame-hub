import { Dice5, Flame, Gauge, ShieldCheck } from 'lucide-react';
import type { DifficultyId, DifficultyOption, ScenarioSummary } from '../../domain/models';

const ICONS = {
  easy: ShieldCheck,
  standard: Gauge,
  hard: Flame,
} as const;

export function ScenarioSetup({
  difficultyOptions,
  catalog,
  lastDifficulty,
  starting,
  onStart,
}: {
  difficultyOptions: DifficultyOption[];
  catalog: ScenarioSummary[];
  lastDifficulty: DifficultyId;
  starting: boolean;
  onStart: (difficultyId: DifficultyId) => void | Promise<void>;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col justify-center px-6 py-10">
      <div className="mb-10 max-w-3xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
          <Dice5 size={14} />
          Random Scenario Start
        </div>
        <h1 className="text-4xl font-black tracking-[-0.05em] text-slate-900">先选难度，再随机开一局</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          现在不是固定“关卡”，而是从同一个世界规格里抽一份剧本。你只需要决定训练强度，系统会按该难度随机发你一局。
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {difficultyOptions.map((option) => {
          const Icon = ICONS[option.id];
          const available = catalog.filter((entry) => entry.difficultyId === option.id);
          const highlighted = option.id === lastDifficulty;

          return (
            <button
              key={option.id}
              type="button"
              disabled={starting}
              onClick={() => onStart(option.id)}
              className={`group rounded-[28px] border p-6 text-left transition-all ${
                highlighted
                  ? 'border-amber-300 bg-white shadow-[0_24px_80px_rgba(180,83,9,0.12)]'
                  : 'border-black/5 bg-white/90 hover:-translate-y-1 hover:shadow-[0_20px_60px_rgba(15,23,42,0.08)]'
              } ${starting ? 'cursor-wait opacity-70' : ''}`}
            >
              <div className="mb-6 flex items-center justify-between">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                  option.id === 'easy'
                    ? 'bg-emerald-100 text-emerald-700'
                    : option.id === 'standard'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700'
                }`}>
                  <Icon size={22} />
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                  {available.length} 个剧本
                </div>
              </div>

              <div className="mb-2 text-2xl font-black tracking-[-0.04em] text-slate-900">{option.label}</div>
              <div className="mb-4 text-sm font-semibold text-slate-500">{option.summary}</div>
              <p className="mb-6 text-sm leading-6 text-slate-600">{option.detail}</p>

              <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
                {available.slice(0, 3).map((scenario) => (
                  <div key={scenario.id} className="text-sm text-slate-700">
                    <span className="font-semibold">{scenario.name}</span>
                    <span className="text-slate-400"> · {scenario.theme}</span>
                  </div>
                ))}
                {!available.length && (
                  <div className="text-sm text-slate-400">该难度暂时没有已发布剧本</div>
                )}
              </div>

              <div className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                {starting ? '正在抽取剧本...' : '随机开始这一难度'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
