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
  Globe2,
  Handshake,
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
const WORLD_BUILDER_NAME = 'AI 开局参谋';
const WORLD_BUILD_MINIMUM_MS = 10000;
const WORLD_BUILD_STORY_TIMEOUT_MS = 10200;

const WORLD_BUILD_STEPS = [
  {
    icon: Database,
    label: '准备市场',
    detail: '先把今天会影响你的板块、同价位竞品和成交机会排出来。',
  },
  {
    icon: Network,
    label: '整理房源',
    detail: '看看你手里的房：谁急、谁等得起、哪套容易被别人抢走客户。',
  },
  {
    icon: Brain,
    label: WORLD_BUILDER_NAME,
    detail: '把复杂信息写成开局简报，告诉你今天先看哪几套、先找谁聊。',
  },
  {
    icon: Clock3,
    label: '进入今天',
    detail: '准备好后进入第一天，你会看到房源、客户、微信消息和待办安排。',
  },
] as const;

const WORLD_BUILD_NODES = [
  {
    icon: Home,
    label: '房源',
    value: '价格 · 状态 · 热度',
    className: 'seller-world-build-node-listing',
  },
  {
    icon: Handshake,
    label: '业主',
    value: '急迫度 · 信任',
    className: 'seller-world-build-node-owner',
  },
  {
    icon: Users,
    label: '客户',
    value: '线索 · 看房意向',
    className: 'seller-world-build-node-customer',
  },
  {
    icon: Store,
    label: '竞品',
    value: '同价位 · 分流',
    className: 'seller-world-build-node-rival',
  },
] as const;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function compactBriefingText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
    : normalized;
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      globalThis.setTimeout(resolve, 0);
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
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
    const startedAt = Date.now();
    setWorldBuildState({
      difficultyLabel: selectedPresentation.label,
      seed,
      worldScaleLabel: selectedOpeningPreview?.briefing.worldScaleLabel ?? '正在扩展市场、客户、业主与竞品体量',
    });
    await waitForNextPaint();
    if (buildTokenRef.current !== token) return;
    const preview = buildGeneratedScenarioOpeningPreview(selectedOption.id, seed, 'random');
    setWorldBuildState((current) => (
      current && current.seed === seed
        ? { ...current, worldScaleLabel: preview.briefing.worldScaleLabel }
        : current
    ));
    try {
      const remainingBuildMs = Math.max(0, WORLD_BUILD_MINIMUM_MS - (Date.now() - startedAt));
      const [storyResult] = await Promise.all([
        fetchWorldBuilderStory(preview.briefing),
        wait(remainingBuildMs),
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

  const deckText = compactBriefingText(story.deck, 76);
  const marketParagraphs = story.marketParagraphs
    .map((paragraph) => compactBriefingText(paragraph, 82))
    .slice(0, 2);

  return (
    <div className="mx-auto flex h-full w-full max-w-[980px] flex-col overflow-hidden px-3 py-3 text-[var(--seller-ink)] sm:px-5 lg:px-6">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
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

      <div className="seller-panel-muted flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,25,35,0.98),rgba(11,17,24,0.98))]">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-start">
            <div className="min-w-0">
              <div className="seller-label text-white/42">
                本局开局简报
              </div>
              <p className="mt-2 max-w-[46rem] text-[13px] font-semibold leading-6 text-white/72">
                {deckText}
              </p>
            </div>
            <div className="rounded-[16px] border border-white/10 bg-white/[0.04] p-3 text-right">
              <div className="seller-label text-white/42">今天</div>
              <div className="mt-1 text-[21px] font-semibold tracking-[-0.03em] text-white">{briefing.dateLabel}</div>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            <BriefingStat icon={CalendarDays} label="周期" value={briefing.scaleLabel} />
            <BriefingStat icon={Home} label="业主" value={briefing.ownerCountLabel} />
            <BriefingStat icon={Users} label="客户" value={briefing.customerCountLabel} />
            <BriefingStat icon={Store} label="压力" value={briefing.competitionLabel} />
          </div>

          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-3.5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
              <div className="min-w-0">
                <div className="seller-label text-white/42">今天的市场故事</div>
                <div className="mt-1 text-[17px] font-semibold leading-6 text-white">{story.marketTitle}</div>
                <div className="mt-2 space-y-1.5">
                  {marketParagraphs.map((paragraph, index) => (
                    <p key={`${paragraph.slice(0, 16)}-${index}`} className="text-[12px] font-semibold leading-5 text-white/62">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {story.evidenceLabels.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-white/58"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {briefing.cases.map((caseItem) => (
              <div key={caseItem.id} className="rounded-[18px] border border-white/8 bg-white/[0.03] p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold leading-6 text-white">{caseItem.title}</div>
                    <div className="mt-1 text-[12px] font-semibold text-white/48">{caseItem.ownerName} · {caseItem.ownerMood}</div>
                    <p className="mt-2 max-w-[32rem] text-[12px] font-semibold leading-5 text-white/64">{compactBriefingText(caseItem.storyLine, 74)}</p>
                  </div>
                  <span className="rounded-full border border-cyan-400/18 bg-cyan-500/12 px-3 py-1 text-[11px] font-semibold text-cyan-100">
                    {caseItem.roleLabel}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <MiniFact label="价格" value={caseItem.priceLabel} />
                  <MiniFact label="业主" value={caseItem.ownerStateLabel} />
                  <MiniFact label="客户" value={caseItem.customerLabel} />
                </div>
                <div className="mt-2 rounded-[12px] border border-emerald-400/12 bg-emerald-500/8 px-3 py-2 text-[11px] font-semibold leading-5 text-emerald-100/76">
                  {compactBriefingText(caseItem.decisionHint, 58)}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
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

        <div className="shrink-0 border-t border-white/8 bg-[#101823] p-3">
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
      label: '你会得到什么',
      title: '一局新的卖房现场',
      detail: `系统会按「${difficultyLabel}」准备本周的房源、业主、客户和竞品，每次随机开局都会有新的组合。`,
    },
    {
      icon: Network,
      label: '开局规模',
      title: worldScaleLabel,
      detail: '不是只换几套房。客户线索、同类房竞争、商圈变化也会一起准备好，让开局更像真实门店。',
    },
    {
      icon: Brain,
      label: 'AI 帮什么',
      title: `${WORLD_BUILDER_NAME}会先帮你读一遍`,
      detail: '它会写出开局简报：哪些业主急、哪些客户有机会、今天先推进哪几套。',
    },
  ];

  return (
    <section className="rounded-[20px] border border-cyan-400/12 bg-cyan-500/[0.055] p-4">
      <div className="grid gap-3 md:grid-cols-3">
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
    </section>
  );
}

function WorldBuildLoadingPage({
  difficultyLabel,
  worldScaleLabel,
}: {
  difficultyLabel: string;
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
            <div className="text-[10px] font-semibold text-white/36">随机局</div>
          </div>
          <h2 className="mt-5 text-[28px] font-semibold tracking-[-0.04em] text-white">正在为你准备今天的卖房现场</h2>
          <p className="mt-3 max-w-[45rem] text-[13px] font-semibold leading-7 text-white/64">
            {`正在生成${difficultyLabel}：先准备房源、业主、客户和竞品，再由 ${WORLD_BUILDER_NAME}写出开局简报。`}
          </p>
        </div>

        <div className="px-6 pt-5">
          <div className="seller-world-build-stage" aria-hidden="true">
            <div className="seller-world-build-grid" />
            <div className="seller-world-build-scan" />
            <div className="seller-world-build-flow seller-world-build-flow-a" />
            <div className="seller-world-build-flow seller-world-build-flow-b" />
            <div className="seller-world-build-flow seller-world-build-flow-c" />
            <div className="seller-world-build-flow seller-world-build-flow-d" />
            <div className="seller-world-build-timeline">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            {WORLD_BUILD_NODES.map((node) => (
              <div key={node.label} className={`seller-world-build-node ${node.className}`}>
                <div className="seller-world-build-node-icon">
                  <node.icon size={13} />
                </div>
                <div>
                  <div className="seller-world-build-node-label">{node.label}</div>
                  <div className="seller-world-build-node-value">{node.value}</div>
                </div>
              </div>
            ))}
            <div className="seller-world-build-center">
              <div className="seller-world-build-center-ring" />
              <div className="seller-world-build-center-card">
                <Globe2 size={26} />
                <span>卖房世界</span>
                <strong>生成中</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pb-5 pt-4">
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="seller-label text-white/38">本局规模</div>
            <div className="mt-2 text-[15px] font-semibold leading-6 text-white/86">{worldScaleLabel}</div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {WORLD_BUILD_STEPS.map((step) => (
              <div key={step.label} className="seller-world-build-step rounded-[16px] border border-white/8 bg-[#0d141e]/82 p-4">
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
              <span>准备中</span>
              <span>约 10 秒</span>
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
