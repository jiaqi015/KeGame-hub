import { useState } from 'react';
import { Compass, Dice5, Flame, Gauge, ShieldCheck, Sprout, TriangleAlert } from 'lucide-react';
import type { DifficultyId, DifficultyOption, ScenarioSummary } from '../../domain/models';
import type { FeaturedScenarioPreview } from '../../application/scenarioOpening';

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
    badge: 'bg-sky-100 text-sky-700',
    panel: 'border-sky-200/70 bg-sky-50/60',
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
  const selectedGoal = selectedFeatured
    ? goalCopy(selectedFeatured.scenario.presentation.goalContext, selectedFeatured.scenario.presentation.targetScore)
    : null;
  const selectedPreview = selectedOption?.preview || [];
  const primaryPreview = selectedPreview.slice(0, 4);
  const secondaryPreview = selectedPreview.slice(4, 8);

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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1280px] flex-col overflow-hidden px-4 py-4 text-slate-900 lg:px-5">
      <div className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <div className="seller-chip seller-chip-accent mb-1.5 inline-flex items-center gap-2">
            <Dice5 size={12} />
            标准局 / 随机局
          </div>
          <h1 className="seller-title text-[24px] md:text-[28px]">选难度</h1>
        </div>
        <p className="seller-body max-w-[38rem] text-[12px] leading-5">
          先定这局强度，再决定走标准局还是随机局。
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-h-0 content-start gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
              disabled={starting}
              className={`group seller-panel min-h-[132px] p-3 text-left transition-all ${
                selected
                  ? 'border-[color:var(--seller-ink)] bg-[var(--seller-paper)] shadow-[var(--seller-shadow-md)]'
                  : 'hover:-translate-y-0.5 hover:bg-white hover:shadow-[var(--seller-shadow-sm)]'
              } ${starting ? 'cursor-wait opacity-70' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] ${tone.badge}`}>
                  <Icon size={15} />
                </div>
                <div className="flex items-center gap-2">
                  {lastPlayed && (
                    <div className="seller-chip seller-chip-accent px-2 py-0.5">
                      上次
                    </div>
                  )}
                  <div className={`h-2 w-2 shrink-0 rounded-full ${selected ? 'bg-[var(--seller-ink)]' : 'bg-[rgba(52,60,76,0.16)]'}`} />
                </div>
              </div>

              <div>
                <div className="seller-title text-[18px]">{option.label}</div>
                <div className="seller-body mt-0.5 line-clamp-2 text-[12px] font-semibold leading-5">{option.summary}</div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {option.preview.slice(0, 2).map((item) => (
                  <div key={`${option.id}-${item.label}`} className="seller-tablet px-2.5 py-1.5">
                    <div className="seller-label text-[9px]">{item.label}</div>
                    <div className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-[var(--seller-ink)]">{compactPreviewValue(item.value)}</div>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
        </div>

        <aside className={`seller-panel-muted grid min-h-0 xl:grid-rows-[1fr_auto] ${selectedTone.panel}`}>
          <div className="min-h-0 overflow-y-auto p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-[15px] ${selectedTone.badge}`}>
                <SelectedIcon size={19} />
              </div>
              <div className="seller-chip">
                标准局 + 随机局
              </div>
            </div>

            <div className="seller-label">当前选择</div>
            <h2 className="seller-title mt-1 text-[22px]">{selectedOption.label}</h2>
            <p className="mt-1.5 text-[13px] font-semibold leading-5 text-[var(--seller-ink)]">{selectedOption.summary}</p>
            <p className="seller-body mt-2 text-[12px] leading-5">{selectedOption.detail}</p>

            <div className="seller-tablet mt-3 p-3">
              <div className="seller-label mb-1 text-[9px]">标准局</div>
              <div className="text-[15px] font-semibold tracking-tight text-[var(--seller-ink)]">{selectedFeatured?.scenario.name || '标准局生成中'}</div>
              <div className="seller-body mt-1 line-clamp-2 text-[12px] leading-5">{selectedFeatured?.scenario.presentation.theme}</div>
              {selectedFeatured && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px] font-semibold text-slate-600">
                  <span className="seller-chip">{selectedFeatured.scenario.presentation.caseCount} 套房源</span>
                  <span className="seller-chip">{selectedFeatured.scenario.presentation.maxDay} 天</span>
                  <span className="seller-chip seller-chip-accent">目标 {selectedFeatured.scenario.presentation.targetScore} 分</span>
                  <span className="seller-chip">seed {selectedFeatured.seed}</span>
                </div>
              )}
            </div>

            {selectedGoal && (
              <div className="seller-tablet mt-2.5 p-3">
                <div className="seller-label mb-1 text-[9px]">目标</div>
                <div className="text-[13px] font-semibold text-[var(--seller-ink)]">{selectedGoal.title}</div>
                <p className="seller-body mt-1 text-[12px] leading-5">{selectedGoal.detail}</p>
              </div>
            )}

            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              {primaryPreview.map((item) => (
                <div key={`${selectedOption.id}-${item.label}`} className="seller-tablet px-2.5 py-2">
                  <div className="seller-label text-[9px]">{item.label}</div>
                  <div className="mt-0.5 text-[11px] font-semibold leading-5 text-[var(--seller-ink)]">{compactPreviewValue(item.value)}</div>
                </div>
              ))}
            </div>

            {secondaryPreview.length > 0 && (
              <div className="mt-2.5 space-y-1.5">
                {secondaryPreview.map((item) => (
                  <div key={`${selectedOption.id}-${item.label}`} className="seller-tablet flex items-center justify-between gap-3 px-2.5 py-1.5">
                    <div className="seller-label text-[9px]">{item.label}</div>
                    <div className="line-clamp-1 text-right text-[11px] font-semibold text-[var(--seller-ink)]">{item.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[var(--seller-border)] bg-white/72 p-3 backdrop-blur-md">
            <div className="grid gap-2">
              <button
                type="button"
                disabled={starting}
                onClick={() => onStartFeatured(selectedOption.id)}
                className="seller-button-primary rounded-[16px] px-4 py-3 text-[13px] disabled:cursor-wait disabled:opacity-60"
              >
                {starting ? '正在进入...' : `进入${selectedOption.label}`}
              </button>
              <button
                type="button"
                disabled={starting}
                onClick={() => onStartRandom(selectedOption.id)}
                className="seller-button-secondary rounded-[16px] px-4 py-3 text-[13px] disabled:cursor-wait disabled:opacity-60"
              >
                {starting ? '正在生成...' : '随机开一局'}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function compactPreviewValue(value: string) {
  return value
    .replace('，', ' · ')
    .replace('适合先把手感找回来', '手感友好')
    .replace('开始吃排序', '要排序')
    .replace('比较够用', '够用')
    .replace('持续吃紧', '吃紧')
    .replace('几乎满负荷', '满负荷');
}

function goalCopy(goalContext: ScenarioSummary['presentation']['goalContext'], targetScore: number) {
  if (goalContext === 'defense') {
    return {
      title: `保住商圈聚焦房，目标 ${targetScore} 分`,
      detail: '重点看最重要的房有没有留在你手里，别让好房子被隔壁门店抢走。',
    };
  }
  if (goalContext === 'satisfaction') {
    return {
      title: `把结果做漂亮，目标 ${targetScore} 分`,
      detail: '重点看业主最后是满意、无感，还是后悔和不满。',
    };
  }
  return {
    title: `把这组房卖得更好，目标 ${targetScore} 分`,
    detail: '重点看每套房和同类房比，是卖得更顺、差不多，还是明显更难卖。',
  };
}
