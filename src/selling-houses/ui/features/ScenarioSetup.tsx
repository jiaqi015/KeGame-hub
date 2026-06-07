import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Brain,
  CalendarDays,
  Clock3,
  Compass,
  Database,
  Flame,
  Gauge,
  Home,
  Network,
  Play,
  ShieldCheck,
  Sprout,
  Store,
  TriangleAlert,
  Users,
  WandSparkles,
} from 'lucide-react';
import type { DifficultyId, DifficultyOption } from '../../domain/models';
import {
  buildGeneratedScenarioOpeningPreview,
  createGeneratedScenarioSeed,
  type FeaturedScenarioPreview,
  type ScenarioOpeningBriefing,
} from '../../application/scenarioOpening';
import { buildDifficultyPresentation, type DifficultyPresentationTone } from '../../application/difficultyPresentation';
import { fetchScenarioOpeningStory } from './scenarioOpeningStoryClient';

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

const SCORE_STANDARD_LABEL = '60 及格 · 80 优秀 · 90 极致';
const WORLD_BUILDER_NAME = '盘面构建官';
const WORLD_BUILD_MINIMUM_MS = 5000;
const WORLD_BUILD_STORY_TIMEOUT_MS = 5200;

const WORLD_BUILD_STEPS = [
  {
    icon: Database,
    label: '落种子',
    detail: '先固定难度、seed 和剧本蓝图，保证这一局能回放、能复盘。',
  },
  {
    icon: Network,
    label: '织关系',
    detail: '把业主、客户、同类竞品、门店和商圈成交装进同一个关系网。',
  },
  {
    icon: Brain,
    label: WORLD_BUILDER_NAME,
    detail: '调用大模型读盘：写开局故事、解释风险、给出今天的经营顺序。',
  },
  {
    icon: Clock3,
    label: '开局校准',
    detail: '把 AI 文案压回可见事实范围，不改写核心数值和隐藏随机性。',
  },
] as const;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function fetchWorldBuilderStory(briefing: ScenarioOpeningBriefing) {
  return Promise.race([
    fetchScenarioOpeningStory(briefing),
    wait(WORLD_BUILD_STORY_TIMEOUT_MS).then(() => ({
      story: briefing.openingStory,
      source: 'fallback' as const,
      error: 'world_builder_timeout',
    })),
  ]);
}

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
  onStartRandom: (difficultyId: DifficultyId, seed?: number) => void | Promise<void>;
}) {
  const [selectedDifficultyId, setSelectedDifficultyId] = useState<DifficultyId>(lastDifficulty);
  const buildTokenRef = useRef(0);
  const [pendingOpening, setPendingOpening] = useState<{
    mode: 'featured' | 'random';
    difficultyId: DifficultyId;
    seed: number;
    briefing: ScenarioOpeningBriefing;
    storyPrefetched?: boolean;
  } | null>(null);
  const [worldBuildState, setWorldBuildState] = useState<{
    difficultyLabel: string;
    seed: number;
    worldScaleLabel: string;
  } | null>(null);
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
  const SelectedIcon = ICONS[selectedOption.id];
  const selectedTone = TONES[selectedOption.id];
  const selectedPresentation = buildDifficultyPresentation({
    difficultyId: selectedOption.id,
    label: selectedOption.label,
  });
  const selectedOpeningPreview = selectedFeatured
    ? buildGeneratedScenarioOpeningPreview(selectedOption.id, selectedFeatured.seed, 'standard')
    : null;
  const busy = starting || Boolean(worldBuildState);
  const primaryPreview = [
    {
      label: '大世界规模',
      value: selectedOpeningPreview?.briefing.worldScaleLabel ?? '生成后展示整体市场体量',
    },
    { label: '同类市场预计成交', value: selectedPresentation.metrics.marketCapacity },
    { label: '成交转化率', value: selectedPresentation.metrics.dealConversionRate },
    { label: '对手压力', value: selectedPresentation.metrics.rivalStrength },
  ];
  const secondaryPreview = [
    { label: '客户推进', value: selectedPresentation.metrics.customerProgression },
    { label: '额外空间', value: selectedPresentation.metrics.bonusPotential },
  ];
  const openFeaturedBriefing = () => {
    if (busy) return;
    if (!selectedFeatured || !selectedOpeningPreview) return;
    const seed = selectedFeatured.seed;
    setPendingOpening({
      mode: 'featured',
      difficultyId: selectedOption.id,
      seed,
      briefing: selectedOpeningPreview.briefing,
    });
  };
  const openRandomBriefing = async () => {
    if (busy) return;
    const seed = createGeneratedScenarioSeed(Date.now());
    const token = buildTokenRef.current + 1;
    buildTokenRef.current = token;
    const preview = buildGeneratedScenarioOpeningPreview(selectedOption.id, seed, 'random');
    setWorldBuildState({
      difficultyLabel: selectedPresentation.label,
      seed,
      worldScaleLabel: preview.briefing.worldScaleLabel,
    });
    try {
      const [storyResult] = await Promise.all([
        fetchWorldBuilderStory(preview.briefing),
        wait(WORLD_BUILD_MINIMUM_MS),
      ]);
      if (buildTokenRef.current !== token) return;
      setPendingOpening({
        mode: 'random',
        difficultyId: selectedOption.id,
        seed,
        briefing: {
          ...preview.briefing,
          openingStory: storyResult.story,
        },
        storyPrefetched: true,
      });
    } finally {
      if (buildTokenRef.current === token) {
        setWorldBuildState(null);
      }
    }
  };
  const enterPendingOpening = async () => {
    if (!pendingOpening) return;
    if (pendingOpening.mode === 'featured') {
      await onStartFeatured(pendingOpening.difficultyId);
      return;
    }
    await onStartRandom(pendingOpening.difficultyId, pendingOpening.seed);
  };

  if (pendingOpening) {
    return (
      <OpeningBriefingView
        briefing={pendingOpening.briefing}
        difficultyLabel={selectedPresentation.label}
        refreshStory={!pendingOpening.storyPrefetched}
        starting={starting}
        onBack={() => setPendingOpening(null)}
        onEnter={() => { void enterPendingOpening(); }}
      />
    );
  }

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
              disabled={busy}
              onClick={() => setSelectedDifficultyId(option.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-semibold transition ${
                selected
                  ? 'border-white/18 bg-[#efe8da] text-[#121821]'
                  : 'border-white/10 bg-white/[0.03] text-white/68 hover:border-white/18 hover:bg-white/[0.06] hover:text-white'
              } ${busy ? 'cursor-wait opacity-60' : ''}`}
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
              <p className="mt-3 max-w-full overflow-x-auto whitespace-nowrap text-[14px] font-semibold leading-6 text-white/82 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {selectedPresentation.summary}
              </p>
            </div>
          </div>

          {selectedFeatured && (
            <div className="grid gap-3 md:grid-cols-2">
              <FactCard label="本局" value={selectedFeatured.scenario.name} />
              <FactCard label="经营规模" value={`${selectedFeatured.scenario.presentation.caseCount} 套 · ${selectedFeatured.scenario.presentation.maxDay} 天`} />
            </div>
          )}

          {selectedFeatured && (
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <div className="seller-label text-white/40">评分标准</div>
              <div className={`mt-2 text-[18px] font-semibold ${selectedTone.accent}`}>{SCORE_STANDARD_LABEL}</div>
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

          <WorldGenerationStatus
            difficultyLabel={selectedPresentation.label}
            worldScaleLabel={selectedOpeningPreview?.briefing.worldScaleLabel ?? '生成后展示整体市场体量'}
          />
        </div>

        <div className="border-t border-white/8 bg-[#101823] p-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={openFeaturedBriefing}
              className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.04] px-4 py-3 text-[14px] font-semibold text-white/88 transition hover:bg-white/[0.07] disabled:cursor-wait disabled:opacity-60"
            >
              <Play size={15} />
              {busy ? '正在准备...' : `进入固定${selectedPresentation.shortLabel}剧本`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { void openRandomBriefing(); }}
              className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-[#49dd85] px-4 py-3 text-[14px] font-semibold text-[#08110d] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60"
            >
              <WandSparkles size={15} />
              {busy ? '正在构建...' : '随机开一局'}
            </button>
          </div>
        </div>
      </div>
      {worldBuildState && (
        <WorldBuildLoadingPage
          difficultyLabel={worldBuildState.difficultyLabel}
          seed={worldBuildState.seed}
          worldScaleLabel={worldBuildState.worldScaleLabel}
        />
      )}
    </div>
  );
}

function OpeningBriefingView({
  briefing,
  difficultyLabel,
  refreshStory,
  starting,
  onBack,
  onEnter,
}: {
  briefing: ScenarioOpeningBriefing;
  difficultyLabel: string;
  refreshStory: boolean;
  starting: boolean;
  onBack: () => void;
  onEnter: () => void;
}) {
  const [story, setStory] = useState(briefing.openingStory);

  useEffect(() => {
    let disposed = false;
    setStory(briefing.openingStory);
    if (!refreshStory) {
      return () => { disposed = true; };
    }
    fetchScenarioOpeningStory(briefing).then((result) => {
      if (!disposed) {
        setStory(result.story);
      }
    });
    return () => { disposed = true; };
  }, [briefing, refreshStory]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[980px] flex-col overflow-y-auto px-4 py-5 text-[var(--seller-ink)] lg:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={starting}
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] font-semibold text-white/72 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          <ArrowLeft size={14} />
          返回选择难度
        </button>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-white/70">{difficultyLabel}</span>
        </div>
      </div>

      <div className="seller-panel-muted flex flex-1 flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,25,35,0.98),rgba(11,17,24,0.98))]">
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="seller-label text-white/42">本局开局简报</div>
              <p className="mt-3 max-w-[42rem] text-[14px] font-semibold leading-7 text-white/72">
                {story.deck}
              </p>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4 text-right">
              <div className="seller-label text-white/42">今天</div>
              <div className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-white">{briefing.dateLabel}</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <BriefingStat icon={CalendarDays} label="周期" value={briefing.scaleLabel} />
            <BriefingStat icon={Home} label="业主" value={briefing.ownerCountLabel} />
            <BriefingStat icon={Users} label="客户" value={briefing.customerCountLabel} />
            <BriefingStat icon={Store} label="压力" value={briefing.competitionLabel} />
          </div>

          <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="seller-label text-white/42">今天的市场故事</div>
                <div className="mt-2 text-[18px] font-semibold text-white">{story.marketTitle}</div>
                <div className="mt-2 space-y-2">
                  {story.marketParagraphs.map((paragraph, index) => (
                    <p key={`${paragraph.slice(0, 16)}-${index}`} className="text-[13px] font-semibold leading-6 text-white/62">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
              <div className="flex max-w-[26rem] flex-wrap justify-end gap-2">
                {story.evidenceLabels.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-white/62"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {briefing.cases.map((caseItem) => (
              <div key={caseItem.id} className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold leading-6 text-white">{caseItem.title}</div>
                    <div className="mt-1 text-[12px] font-semibold text-white/48">{caseItem.ownerName} · {caseItem.ownerMood}</div>
                    <p className="mt-3 max-w-[32rem] text-[13px] font-semibold leading-6 text-white/70">{caseItem.storyLine}</p>
                  </div>
                  <span className="rounded-full border border-cyan-400/18 bg-cyan-500/12 px-3 py-1 text-[11px] font-semibold text-cyan-100">
                    {caseItem.roleLabel}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <MiniFact label="价格" value={caseItem.priceLabel} />
                  <MiniFact label="业主" value={caseItem.ownerStateLabel} />
                  <MiniFact label="客户" value={caseItem.customerLabel} />
                </div>
                <div className="mt-3 rounded-[14px] border border-emerald-400/12 bg-emerald-500/8 px-3 py-2 text-[12px] font-semibold leading-5 text-emerald-100/80">
                  {caseItem.decisionHint}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold text-white/52">
                    {caseItem.stageLabel}
                  </span>
                  {caseItem.tags.map((tag) => (
                    <span
                      key={`${caseItem.id}-${tag}`}
                      className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold text-white/52"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/8 bg-[#101823] p-4">
          <button
            type="button"
            disabled={starting}
            onClick={onEnter}
            className="ml-auto flex items-center justify-center gap-2 rounded-[14px] bg-[#49dd85] px-5 py-3 text-[14px] font-semibold text-[#08110d] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60"
          >
            <Play size={15} fill="currentColor" />
            {starting ? '正在进入...' : '进入今天'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WorldGenerationStatus({
  difficultyLabel,
  worldScaleLabel,
}: {
  difficultyLabel: string;
  worldScaleLabel: string;
}) {
  const statusRows = [
    {
      icon: Database,
      label: '当前现状',
      title: '确定性种子生成已经接上',
      detail: `随机局会先按「${difficultyLabel} + seed」生成开局快照；同一个 seed 能复盘，不会变成不可解释的黑盒世界。`,
    },
    {
      icon: Network,
      label: '世界范围',
      title: worldScaleLabel,
      detail: '开局不只生成玩家手里几套房，还会铺出同价位供给、潜在客户、竞品经纪人、商圈成交和压力来源。',
    },
    {
      icon: Brain,
      label: 'AI 能力',
      title: `${WORLD_BUILDER_NAME} 可参与生产`,
      detail: '大模型负责读盘、讲开局故事、解释今天先后顺序；核心价格、客户、竞品和业主状态仍由世界引擎落数。',
    },
  ];

  return (
    <section className="rounded-[20px] border border-cyan-400/12 bg-cyan-500/[0.055] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="seller-label text-cyan-100/58">初始化世界</div>
          <h3 className="mt-2 text-[18px] font-semibold text-white">生产一个全新世界时，现在会发生什么</h3>
          <p className="mt-2 max-w-[44rem] text-[12px] font-semibold leading-6 text-white/62">
            当前方案是“可复盘世界引擎 + {WORLD_BUILDER_NAME} 推理层”：先把市场事实落稳，再让 AI 把事实翻成经纪人能读懂的开局判断。
          </p>
        </div>
        <div className="rounded-full border border-cyan-400/18 bg-cyan-500/12 px-3 py-1 text-[11px] font-semibold text-cyan-100">
          {WORLD_BUILDER_NAME}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {statusRows.map((row) => (
          <div key={row.label} className="rounded-[16px] border border-white/8 bg-[#0d141e]/78 p-3">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-white/38">
              <row.icon size={13} />
              {row.label}
            </div>
            <div className="mt-2 text-[13px] font-semibold leading-5 text-white/88">{row.title}</div>
            <p className="mt-2 text-[11px] font-semibold leading-5 text-white/52">{row.detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold leading-5 text-white/56">
        提示词边界：基于已生成的世界摘要，输出开局故事、风险主线、证据标签、首日建议；不得发明不可见事实，不得改写数值。
      </div>
    </section>
  );
}

function WorldBuildLoadingPage({
  difficultyLabel,
  seed,
  worldScaleLabel,
}: {
  difficultyLabel: string;
  seed: number;
  worldScaleLabel: string;
}) {
  return (
    <div
      data-world-build-loading="true"
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[140] flex items-center justify-center bg-[#071018]/96 px-4 backdrop-blur-xl"
    >
      <div className="seller-panel-muted w-full max-w-[760px] overflow-hidden rounded-[24px] border border-cyan-400/14 bg-[linear-gradient(180deg,rgba(17,25,35,0.98),rgba(9,16,24,0.98))] shadow-[0_36px_90px_rgba(0,0,0,0.42)]">
        <div className="border-b border-white/8 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/18 bg-cyan-500/12 px-3 py-1 text-[11px] font-semibold text-cyan-100">
              <Brain size={13} />
              {WORLD_BUILDER_NAME}
            </div>
            <div className="font-mono text-[10px] font-semibold text-white/36">seed {seed}</div>
          </div>
          <h2 className="mt-5 text-[28px] font-semibold tracking-[-0.04em] text-white">正在构建一个全新的初始化世界</h2>
          <p className="mt-3 max-w-[45rem] text-[13px] font-semibold leading-7 text-white/64">
            {difficultyLabel} 正在落盘：世界引擎先生成可复盘的市场事实，再让 {WORLD_BUILDER_NAME} 读一遍客户、业主、竞品和今天的经营先后顺序。
          </p>
        </div>

        <div className="px-6 py-5">
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="seller-label text-white/38">世界体量</div>
            <div className="mt-2 text-[15px] font-semibold leading-6 text-white/86">{worldScaleLabel}</div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {WORLD_BUILD_STEPS.map((step) => (
              <div key={step.label} className="rounded-[16px] border border-white/8 bg-[#0d141e]/82 p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-cyan-100/68">
                  <step.icon size={14} />
                  {step.label}
                </div>
                <p className="mt-2 text-[12px] font-semibold leading-6 text-white/56">{step.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-white/44">
              <span>构建进度</span>
              <span>至少 5 秒</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-white/8 bg-white/[0.05]">
              <div className="seller-world-build-progress h-full rounded-full bg-[#49dd85]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BriefingStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">
        <Icon size={14} />
        {label}
      </div>
      <div className="mt-3 text-[14px] font-semibold leading-6 text-white/86">{value}</div>
    </div>
  );
}

function MiniFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[14px] border border-white/8 bg-[#0d141e] px-3 py-2">
      <div className="text-[10px] font-semibold text-white/34">{label}</div>
      <div className="mt-1 text-[12px] font-semibold leading-5 text-white/74">{value}</div>
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
