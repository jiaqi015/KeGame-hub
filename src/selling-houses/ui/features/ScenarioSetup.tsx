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
  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col justify-center px-6 py-10">
      <div className="mb-10 max-w-3xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
          <Dice5 size={14} />
          代表局 + 随机局
        </div>
        <h1 className="text-4xl font-black tracking-[-0.05em] text-slate-900">先选难度，再决定打代表局还是随机局</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          每个难度先给你一张代表局，先感受这一档最典型的局面。如果想反复刷同档手感，也可以按此难度随机生成一局新环境。
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {difficultyOptions.map((option) => {
          const Icon = ICONS[option.id];
          const tone = TONES[option.id];
          const featured = featuredScenarios.find((entry) => entry.difficultyId === option.id);
          const highlighted = option.id === lastDifficulty;

          return (
            <div
              key={option.id}
              className={`group rounded-[28px] border p-6 text-left transition-all ${
                highlighted
                  ? 'border-amber-300 bg-white shadow-[0_24px_80px_rgba(180,83,9,0.12)]'
                  : 'border-black/5 bg-white/90 hover:-translate-y-1 hover:shadow-[0_20px_60px_rgba(15,23,42,0.08)]'
              } ${starting ? 'opacity-70' : ''}`}
            >
              <div className="mb-6 flex items-center justify-between">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone.badge}`}>
                  <Icon size={22} />
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                  1 个代表局 + 随机局
                </div>
              </div>

              <div className="mb-2 text-2xl font-black tracking-[-0.04em] text-slate-900">{option.label}</div>
              <div className="mb-4 text-sm font-semibold text-slate-500">{option.summary}</div>
              <p className="mb-5 text-sm leading-6 text-slate-600">{option.detail}</p>

              <div className={`mb-5 rounded-2xl border p-4 ${tone.panel}`}>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">代表局</div>
                <div className="text-sm font-semibold text-slate-800">{featured?.scenario.name || '代表局生成中'}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{featured?.scenario.theme}</div>
                {featured && (
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-600">
                    <span className="rounded-full bg-white/80 px-2 py-1">{featured.scenario.caseCount} 套房源</span>
                    <span className="rounded-full bg-white/80 px-2 py-1">{featured.scenario.maxDay} 天节奏</span>
                  </div>
                )}
              </div>

              <div className="mb-5 grid grid-cols-2 gap-2">
                {option.preview.map((item) => (
                  <div key={`${option.id}-${item.label}`} className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
                    <div className="mt-1 text-xs font-semibold leading-5 text-slate-700">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => onStartFeatured(option.id)}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {starting ? '正在进入...' : '进入代表局'}
                </button>
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => onStartRandom(option.id)}
                  className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold text-slate-900 transition-all hover:border-black/15 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {starting ? '正在生成...' : '开启随机局'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
