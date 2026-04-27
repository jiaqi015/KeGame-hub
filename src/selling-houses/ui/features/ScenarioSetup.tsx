import { useState } from 'react';
import { Compass, Flame, Gauge, ShieldCheck, Sprout, TriangleAlert } from 'lucide-react';
import type { DifficultyId, DifficultyOption, ScenarioSummary } from '../../domain/models';
import type { FeaturedScenarioPreview } from '../../application/scenarioOpening';
import { buildDifficultyPresentation, type DifficultyPresentationTone } from '../../application/difficultyPresentation';

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
    icon: 'bg-emerald-500/14 text-emerald-300',
    accent: 'text-emerald-300',
    badge: 'bg-emerald-500/14 text-emerald-200 border-emerald-400/18',
  },
  easy: {
    icon: 'bg-lime-500/14 text-lime-300',
    accent: 'text-lime-300',
    badge: 'bg-lime-500/14 text-lime-200 border-lime-400/18',
  },
  standard: {
    icon: 'bg-cyan-500/14 text-cyan-300',
    accent: 'text-cyan-300',
    badge: 'bg-cyan-500/14 text-cyan-200 border-cyan-400/18',
  },
  advanced: {
    icon: 'bg-sky-500/14 text-sky-300',
    accent: 'text-sky-300',
    badge: 'bg-sky-500/14 text-sky-200 border-sky-400/18',
  },
  hard: {
    icon: 'bg-rose-500/14 text-rose-300',
    accent: 'text-rose-300',
    badge: 'bg-rose-500/14 text-rose-200 border-rose-400/18',
  },
  extreme: {
    icon: 'bg-fuchsia-500/14 text-fuchsia-300',
    accent: 'text-fuchsia-300',
    badge: 'bg-fuchsia-500/14 text-fuchsia-200 border-fuchsia-400/18',
  },
} as const;

const CHIP_TONES: Record<DifficultyPresentationTone, string> = {
  easy: 'border-emerald-400/18 bg-emerald-500/12 text-emerald-100',
  normal: 'border-white/12 bg-white/[0.05] text-white/76',
  warning: 'border-amber-400/20 bg-amber-500/12 text-amber-100',
  hard: 'border-rose-400/22 bg-rose-500/12 text-rose-100',
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

  if (!selectedOption) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm font-semibold text-[var(--seller-muted)]">
        暂时没有可用难度。
      </div>
    );
  }

  const selectedFeatured = featuredScenarios.find((entry) => entry.difficultyId === selectedOption.id);
  const selectedGoal = selectedFeatured
    ? goalCopy(selectedFeatured.scenario.presentation.goalContext, selectedFeatured.scenario.presentation.targetScore)
    : null;
  const SelectedIcon = ICONS[selectedOption.id];
  const selectedTone = TONES[selectedOption.id];
  const selectedPresentation = buildDifficultyPresentation({
    difficultyId: selectedOption.id,
    label: selectedOption.label,
  });
  const primaryPreview = [
    { label: '模拟周期', value: `${selectedPresentation.metrics.days} 天` },
    { label: '市场容量', value: selectedPresentation.metrics.marketCapacity },
    { label: '成交预期', value: selectedPresentation.metrics.selfDealExpectation },
    { label: '对手压力', value: selectedPresentation.metrics.rivalStrength },
  ];
  const secondaryPreview = [
    { label: '客户推进', value: selectedPresentation.metrics.customerProgression },
    { label: '额外空间', value: selectedPresentation.metrics.bonusPotential },
  ];

  return (
    <div className="mx-auto flex h-full w-full max-w-[880px] flex-col overflow-y-auto px-4 py-5 text-[var(--seller-ink)] lg:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="seller-title text-[26px]">选择难度</h1>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {difficultyOptions.map((option) => {
          const selected = option.id === selectedOption.id;
          const optionPresentation = buildDifficultyPresentation({ difficultyId: option.id, label: option.label });
          const OptionIcon = ICONS[option.id];
          return (
            <button
              key={option.id}
              type="button"
              disabled={starting}
              onClick={() => setSelectedDifficultyId(option.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-semibold transition ${
                selected
                  ? 'border-white/18 bg-[#efe8da] text-[#121821]'
                  : 'border-white/10 bg-white/[0.03] text-white/68 hover:border-white/18 hover:bg-white/[0.06] hover:text-white'
              } ${starting ? 'cursor-wait opacity-60' : ''}`}
            >
              <OptionIcon size={13} strokeWidth={2.3} />
              {optionPresentation.shortLabel}
            </button>
          );
        })}
      </div>

      <div className="seller-panel-muted flex flex-1 flex-col overflow-y-auto rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,25,35,0.98),rgba(11,17,24,0.98))]">
        <div className="flex flex-1 flex-col gap-5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2">
                <div className={`flex h-10 w-10 items-center justify-center rounded-[14px] ${selectedTone.icon}`}>
                  <SelectedIcon size={18} />
                </div>
                {selectedOption.id === lastDifficulty && (
                  <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${selectedTone.badge}`}>
                    常用
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-[34px] font-semibold tracking-[-0.05em] text-white">{selectedPresentation.label}</h2>
                {selectedFeatured && (
                  <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${selectedTone.badge}`}>
                    目标 {selectedFeatured.scenario.presentation.targetScore} 分
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedPresentation.chips.map((chip) => (
                  <span
                    key={`${selectedPresentation.id}-${chip.label}`}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${CHIP_TONES[chip.tone]}`}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
              <p className="mt-3 max-w-[42rem] text-[15px] font-semibold leading-7 text-white/82">{selectedPresentation.summary}</p>
            </div>
          </div>

          {selectedFeatured && (
            <div className="grid gap-3 md:grid-cols-2">
              <FactCard label="本局" value={selectedFeatured.scenario.name} />
              <FactCard label="经营规模" value={`${selectedFeatured.scenario.presentation.caseCount} 套 · ${selectedFeatured.scenario.presentation.maxDay} 天`} />
            </div>
          )}

          {selectedGoal && (
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <div className="seller-label text-white/40">这局看什么</div>
              <div className={`mt-2 text-[18px] font-semibold ${selectedTone.accent}`}>{selectedGoal.title}</div>
              <p className="mt-2 text-[13px] leading-7 text-white/64">{selectedGoal.detail}</p>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {primaryPreview.map((item) => (
              <div key={`${selectedOption.id}-${item.label}`}>
                <FactCard
                  label={item.label}
                  value={item.value}
                />
              </div>
            ))}
          </div>

          {secondaryPreview.length > 0 && (
            <div className="overflow-hidden rounded-[20px] border border-white/8 bg-white/[0.02]">
              {secondaryPreview.map((item, index) => (
                <div
                  key={`${selectedOption.id}-${item.label}`}
                  className={`flex items-center justify-between gap-3 px-4 py-3 ${index === 0 ? '' : 'border-t border-white/8'}`}
                >
                  <div className="text-[12px] font-medium text-white/48">{item.label}</div>
                  <div className="text-right text-[12px] font-semibold text-white/78">{item.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-white/8 bg-[#101823] p-4">
          <div className="grid gap-2">
            <button
              type="button"
              disabled={starting}
              onClick={() => onStartFeatured(selectedOption.id)}
              className="rounded-[14px] bg-[#49dd85] px-4 py-3 text-[14px] font-semibold text-[#08110d] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60"
            >
              {starting ? '正在进入...' : `进入${selectedPresentation.shortLabel}剧本`}
            </button>
            <button
              type="button"
              disabled={starting}
              onClick={() => onStartRandom(selectedOption.id)}
              className="rounded-[14px] border border-white/10 bg-white/[0.04] px-4 py-3 text-[14px] font-semibold text-white/88 transition hover:bg-white/[0.07] disabled:cursor-wait disabled:opacity-60"
            >
              {starting ? '正在生成...' : '按照难度随机生成'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FactCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
      <div className="seller-label text-white/40">{label}</div>
      <div className="mt-2 text-[15px] font-semibold leading-6 text-white">{value}</div>
      {detail ? <div className="mt-1 text-[12px] leading-6 text-white/52">{detail}</div> : null}
    </div>
  );
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
