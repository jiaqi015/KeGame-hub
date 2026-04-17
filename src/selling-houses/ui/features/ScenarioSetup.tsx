import { useState } from 'react';
import { Compass, Dice5, Flame, Gauge, ShieldCheck, Sprout, TriangleAlert } from 'lucide-react';
import type { DifficultyId, DifficultyOption } from '../../domain/models';

const ICONS = {
  warmup: ShieldCheck,
  easy: Sprout,
  standard: Gauge,
  advanced: Compass,
  hard: Flame,
  extreme: TriangleAlert,
} as const;

const TONES = {
  warmup: {
    badge: 'bg-emerald-100 text-emerald-700',
    panel: 'border-emerald-200/70 bg-emerald-50/60',
  },
  easy: {
    badge: 'bg-lime-100 text-lime-700',
    panel: 'border-lime-200/70 bg-lime-50/60',
  },
  standard: {
    badge: 'bg-amber-100 text-amber-700',
    panel: 'border-amber-200/70 bg-amber-50/60',
  },
  advanced: {
    badge: 'bg-sky-100 text-sky-700',
    panel: 'border-sky-200/70 bg-sky-50/60',
  },
  hard: {
    badge: 'bg-rose-100 text-rose-700',
    panel: 'border-rose-200/70 bg-rose-50/60',
  },
  extreme: {
    badge: 'bg-fuchsia-100 text-fuchsia-700',
    panel: 'border-fuchsia-200/70 bg-fuchsia-50/60',
  },
} as const;

type FeaturedScenarioPreview = {
  difficultyId: DifficultyId;
  seed: number;
  scenario: {
    name: string;
    theme: string;
    description: string;
    maxDay: number;
    caseCount: number;
  };
};

export function ScenarioSetup({
  difficultyOptions,
  featuredScenarios,
  lastDifficulty,
  starting,
  onStartFeatured,
  onStartRandom,
}: {
  difficultyOptions: DifficultyOption[];
  featuredScenarios: FeaturedScenarioPreview[];
  lastDifficulty: DifficultyId;
  starting: boolean;
  onStartFeatured: (difficultyId: DifficultyId) => void | Promise<void>;
  onStartRandom: (difficultyId: DifficultyId) => void | Promise<void>;
}) {
  const [selectedDifficultyId, setSelectedDifficultyId] = useState<DifficultyId>(lastDifficulty);
  const selectedOption = difficultyOptions.find((entry) => entry.id === selectedDifficultyId)
    || difficultyOptions.find((entry) => entry.id === lastDifficulty)
    || difficultyOptions[0];
  const selectedFeatured = featuredScenarios.find((entry) => entry.difficultyId === selectedOption?.id);

  if (!selectedOption) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm font-semibold text-slate-500">
        暂时没有可用难度。
      </div>
    );
  }

  const SelectedIcon = ICONS[selectedOption.id];
  const selectedTone = TONES[selectedOption.id];

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-y-auto px-5 py-5 xl:overflow-hidden">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">
            <Dice5 size={13} />
            标准局 + 随机局
          </div>
          <h1 className="text-3xl font-black tracking-[-0.05em] text-slate-900 md:text-4xl">选一档难度，直接开局</h1>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-500">
          6 个难度全部摊开看。左边选档位，右边看这一档的大体盘面，再决定打固定标准局还是随机生成一局。
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:min-h-0">
        {difficultyOptions.map((option) => {
          const Icon = ICONS[option.id];
          const tone = TONES[option.id];
          const selected = option.id === selectedOption.id;
          const lastPlayed = option.id === lastDifficulty;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedDifficultyId(option.id)}
              className={`group rounded-[24px] border p-4 text-left transition-all ${
                selected
                  ? 'border-slate-900 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]'
                  : 'border-black/5 bg-white/85 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_40px_rgba(15,23,42,0.07)]'
              } ${starting ? 'opacity-70' : ''}`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone.badge}`}>
                  <Icon size={18} />
                </div>
                {lastPlayed && (
                  <div className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700">
                    上次
                  </div>
                )}
              </div>

              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-black tracking-[-0.04em] text-slate-900">{option.label}</div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">{option.summary}</div>
                </div>
                <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${selected ? 'bg-slate-900' : 'bg-slate-200'}`} />
              </div>

              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{option.detail}</p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {option.preview.slice(0, 2).map((item) => (
                  <div key={`${option.id}-${item.label}`} className="rounded-2xl bg-slate-50 px-3 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
                    <div className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-slate-700">{item.value}</div>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
        </div>

        <aside className={`rounded-[28px] border p-5 shadow-[0_22px_70px_rgba(15,23,42,0.08)] ${selectedTone.panel}`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${selectedTone.badge}`}>
              <SelectedIcon size={22} />
            </div>
            <div className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold text-slate-600">
              1 个标准局 + 随机局
            </div>
          </div>

          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">当前选择</div>
          <h2 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-900">{selectedOption.label}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{selectedOption.summary}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{selectedOption.detail}</p>

          <div className="mt-4 rounded-2xl border border-white/70 bg-white/80 p-4">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">标准局</div>
            <div className="text-base font-bold tracking-tight text-slate-900">{selectedFeatured?.scenario.name || '标准局生成中'}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">{selectedFeatured?.scenario.theme}</div>
            {selectedFeatured && (
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{selectedFeatured.scenario.caseCount} 套房源</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{selectedFeatured.scenario.maxDay} 天节奏</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">seed {selectedFeatured.seed}</span>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {selectedOption.preview.map((item) => (
              <div key={`${selectedOption.id}-${item.label}`} className="rounded-2xl bg-white/80 px-3 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
                <div className="mt-1 text-xs font-semibold leading-5 text-slate-700">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <button
              type="button"
              disabled={starting}
              onClick={() => onStartFeatured(selectedOption.id)}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
            >
              {starting ? '正在进入...' : '进入标准局'}
            </button>
            <button
              type="button"
              disabled={starting}
              onClick={() => onStartRandom(selectedOption.id)}
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold text-slate-900 transition-all hover:border-black/15 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            >
              {starting ? '正在生成...' : '按此难度随机开一局'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
