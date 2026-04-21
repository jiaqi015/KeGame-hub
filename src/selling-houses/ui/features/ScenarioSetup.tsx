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
    <div className="mx-auto w-full max-w-[1240px] overflow-y-auto px-3 py-2.5 text-slate-900 lg:px-4">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2.5">
        <div>
          <div className="seller-chip seller-chip-accent mb-1 inline-flex items-center gap-2">
            <Dice5 size={12} />
            标准局 / 随机局
          </div>
          <h1 className="seller-title text-[21px] md:text-[24px]">选难度</h1>
        </div>
        <p className="seller-body max-w-[38rem] text-[11px] leading-4.5">
          先定这局强度，再决定走标准局还是随机局。
        </p>
      </div>

      <div className="grid items-start gap-2 lg:grid-cols-[minmax(0,1fr)_288px]">
        <div className="grid content-start gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
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
              className={`group seller-panel flex min-h-[96px] flex-col p-2 text-left transition-all ${
                selected
                  ? 'border-[color:var(--seller-ink)] bg-[var(--seller-paper)] shadow-[var(--seller-shadow-md)]'
                  : 'hover:-translate-y-0.5 hover:bg-white hover:shadow-[var(--seller-shadow-sm)]'
              } ${starting ? 'cursor-wait opacity-70' : ''}`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[9px] ${tone.badge}`}>
                  <Icon size={13} />
                </div>
                <div className="flex items-center gap-2">
                  {lastPlayed && (
                    <div className="seller-chip seller-chip-accent px-1.5 py-0.5">
                      上次
                    </div>
                  )}
                  <div className={`h-2 w-2 shrink-0 rounded-full ${selected ? 'bg-[var(--seller-ink)]' : 'bg-[rgba(52,60,76,0.16)]'}`} />
                </div>
              </div>

              <div className="flex-1">
                <div className="seller-title text-[15px]">{option.label}</div>
                <div className="seller-body mt-0.5 line-clamp-2 text-[10px] font-semibold leading-3.5">{option.summary}</div>
              </div>

              <div className="mt-1.25 grid grid-cols-2 gap-1">
                {option.preview.slice(0, 2).map((item) => (
                  <div key={`${option.id}-${item.label}`} className="seller-tablet px-1.5 py-1.5">
                    <div className="seller-label text-[9px]">{item.label}</div>
                    <div className="mt-0.5 line-clamp-1 text-[9.5px] font-semibold text-[var(--seller-ink)]">{compactPreviewValue(item.value)}</div>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
        </div>

        <aside className={`seller-panel-muted flex self-start flex-col overflow-hidden ${selectedTone.panel}`}>
          <div className="space-y-2 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-[12px] ${selectedTone.badge}`}>
                <SelectedIcon size={16} />
              </div>
              <div className="seller-chip">
                标准局 + 随机局
              </div>
            </div>

            <div className="seller-label">当前选择</div>
            <div className="flex items-start justify-between gap-2">
              <h2 className="seller-title mt-1 text-[17px]">{selectedOption.label}</h2>
              {selectedFeatured && (
                <div className="seller-chip seller-chip-accent mt-0.5 px-1.5 py-0.5">
                  目标 {selectedFeatured.scenario.presentation.targetScore} 分
                </div>
              )}
            </div>
            <p className="mt-0.5 text-[11px] font-semibold leading-4 text-[var(--seller-ink)]">{selectedOption.summary}</p>
            <p className="seller-body line-clamp-2 text-[10px] leading-4">{selectedOption.detail}</p>

            <div className="seller-tablet p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="seller-label mb-1 text-[9px]">标准局</div>
                  <div className="line-clamp-1 text-[13px] font-semibold tracking-tight text-[var(--seller-ink)]">{selectedFeatured?.scenario.name || '标准局生成中'}</div>
                  <div className="seller-body mt-0.5 line-clamp-1 text-[10px] leading-4">{selectedFeatured?.scenario.presentation.theme}</div>
                </div>
                {selectedFeatured && (
                  <div className="seller-chip px-1.5 py-0.5">
                    {selectedFeatured.scenario.presentation.maxDay} 天
                  </div>
                )}
              </div>
              {selectedFeatured && (
                <div className="mt-2 grid grid-cols-2 gap-1 border-t border-[var(--seller-border)] pt-2">
                  <div className="seller-fact-row px-1.5 py-1.25">
                    <div className="seller-label text-[9px]">房源数</div>
                    <div className="mt-0.5 text-[10px] font-semibold text-[var(--seller-ink)]">{selectedFeatured.scenario.presentation.caseCount} 套</div>
                  </div>
                  <div className="seller-fact-row px-1.5 py-1.25">
                    <div className="seller-label text-[9px]">Seed</div>
                    <div className="mt-0.5 text-[10px] font-semibold text-[var(--seller-ink)]">{selectedFeatured.seed}</div>
                  </div>
                </div>
              )}
              {selectedGoal && (
                <div className="mt-2 border-t border-[var(--seller-border)] pt-2">
                  <div className="seller-label mb-1 text-[9px]">这局看什么</div>
                  <div className="text-[11.5px] font-semibold leading-4 text-[var(--seller-ink)]">{selectedGoal.title}</div>
                  <p className="seller-body mt-0.5 line-clamp-2 text-[10px] leading-4">{selectedGoal.detail}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1">
              {primaryPreview.map((item) => (
                <div key={`${selectedOption.id}-${item.label}`} className="seller-fact-row px-1.75 py-1.5">
                  <div className="seller-label text-[9px]">{item.label}</div>
                  <div className="mt-0.5 text-[9.5px] font-semibold leading-4 text-[var(--seller-ink)]">{compactPreviewValue(item.value)}</div>
                </div>
              ))}
            </div>

            {secondaryPreview.length > 0 && (
              <div className="overflow-hidden rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]">
                {secondaryPreview.map((item, index) => (
                  <div
                    key={`${selectedOption.id}-${item.label}`}
                    className={`flex items-center justify-between gap-2 px-2 py-1.5 ${index === 0 ? '' : 'border-t border-[var(--seller-border)]'}`}
                  >
                    <div className="seller-label text-[9px]">{item.label}</div>
                    <div className="line-clamp-1 text-right text-[9.5px] font-semibold text-[var(--seller-ink)]">{compactPreviewValue(item.value)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[var(--seller-border)] bg-white/72 p-2 backdrop-blur-md">
            <div className="grid gap-1.5">
              <button
                type="button"
                disabled={starting}
                onClick={() => onStartFeatured(selectedOption.id)}
                className="seller-button-primary rounded-[14px] px-4 py-2.5 text-[12px] disabled:cursor-wait disabled:opacity-60"
              >
                {starting ? '正在进入...' : `进入${selectedOption.label}`}
              </button>
              <button
                type="button"
                disabled={starting}
                onClick={() => onStartRandom(selectedOption.id)}
                className="seller-button-secondary rounded-[14px] px-4 py-2.5 text-[12px] disabled:cursor-wait disabled:opacity-60"
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
