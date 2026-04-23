import React, { lazy } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Building2, Layers, Sparkles, Target, UserRound } from 'lucide-react';

// NOTE: This registry belongs to hub-shell parallel surface, not the main app runtime.
// Main runtime source of truth is src/workspaces/workspaceRegistry.tsx.

const OpenDayWorkspace = lazy(() =>
  import('../../core-workspaces/open-day/ui/OpenDayWorkspace')
    .then(module => ({ default: module.OpenDayWorkspace })),
);
const SellingHousesWorkspace = lazy(() =>
  import('../../selling-houses-workspace/SellingHousesWorkspace')
    .then(module => ({ default: module.SellingHousesWorkspace })),
);
const MarketManagementWorkspace = lazy(() =>
  import('../../sandbox-workspaces/market-management/MarketManagementWorkspace')
    .then(module => ({ default: module.MarketManagementWorkspace })),
);
const RationalOwnerWorkspace = lazy(() =>
  import('../../sandbox-workspaces/rational-owner/RationalOwnerWorkspace')
    .then(module => ({ default: module.RationalOwnerWorkspace })),
);

export function preloadSellingHousesWorkspace() {
  return import('../../selling-houses-workspace/SellingHousesWorkspace');
}

type PlaceholderFuturePlay = { title: string; body: string };

function PlaceholderWorkspace({
  badge,
  title,
  subtitle,
  heroImageSrc,
  heroImageAlt,
  heroTagline,
  heroSubline,
  advisorBlock,
  futurePlays,
  prompts,
  nextSteps,
  tone = 'sky',
}: {
  badge: string;
  title: string;
  subtitle: string;
  heroImageSrc: string;
  heroImageAlt: string;
  heroTagline: string;
  heroSubline: string;
  advisorBlock: { title: string; paragraphs: string[] };
  futurePlays: { sectionTitle: string; items: PlaceholderFuturePlay[] };
  prompts: string[];
  nextSteps: string[];
  tone?: 'sky' | 'rose';
}) {
  const accentClassName = tone === 'rose'
    ? 'bg-[#B9385D] text-white shadow-[0_18px_34px_rgba(185,56,93,0.18)]'
    : 'bg-[#0F4C81] text-white shadow-[0_18px_34px_rgba(15,76,129,0.18)]';
  const badgeClassName = tone === 'rose'
    ? 'bg-rose-50 text-rose-700'
    : 'bg-sky-50 text-sky-700';
  const sectionClassName = tone === 'rose'
    ? 'border-rose-200/80 bg-gradient-to-b from-rose-50/90 to-rose-50/40'
    : 'border-sky-200/80 bg-gradient-to-b from-sky-50/90 to-sky-50/40';
  const pageBg = tone === 'rose'
    ? 'bg-[radial-gradient(circle_at_15%_10%,rgba(244,63,94,0.1),transparent_40%),radial-gradient(circle_at_90%_0%,rgba(185,56,93,0.08),transparent_45%),linear-gradient(180deg,#fffafb,#ffffff)]'
    : 'bg-[radial-gradient(circle_at_12%_8%,rgba(14,165,233,0.1),transparent_42%),radial-gradient(circle_at_88%_5%,rgba(15,76,129,0.08),transparent_45%),linear-gradient(180deg,#f8fcff,#ffffff)]';
  const futureCard = tone === 'rose'
    ? 'border-rose-100/90 bg-rose-50/40'
    : 'border-sky-100/90 bg-sky-50/40';
  const heroFrame = tone === 'rose'
    ? 'border-rose-100/80 bg-gradient-to-b from-rose-50/80 to-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
    : 'border-sky-100/80 bg-gradient-to-b from-sky-50/80 to-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]';

  return (
    <div className={`flex h-full items-start justify-center overflow-y-auto ${pageBg} px-4 py-10 sm:px-8`}>
      <div className="w-full max-w-5xl rounded-[36px] border border-black/5 bg-white/95 p-6 shadow-[0_24px_70px_rgba(20,20,43,0.08)] sm:p-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 max-w-2xl">
            <div className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${badgeClassName}`}>
              {badge}
            </div>
            <div className="mt-4 flex items-start gap-4">
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] ${accentClassName}`}>
                <span className="text-sm font-bold tracking-tight">AI</span>
              </div>
              <div>
                <h2 className="text-[28px] font-semibold tracking-[-0.04em] text-[#111111] sm:text-[30px]">{title}</h2>
                <p className="mt-2 text-[15px] leading-7 text-[#6E6E73]">{subtitle}</p>
              </div>
            </div>

            <div className={`mt-7 overflow-hidden rounded-[28px] border ${heroFrame} p-3 sm:p-4`}>
              <img
                src={heroImageSrc}
                alt={heroImageAlt}
                className="h-44 w-full rounded-[20px] object-cover object-center sm:h-52"
              />
              <p className="mt-4 text-center text-[16px] font-semibold text-[#111111] sm:text-left">{heroTagline}</p>
              <p className="mt-1 text-center text-[13px] leading-6 text-[#6E6E73] sm:text-left">{heroSubline}</p>
            </div>
          </div>

          <div className={`w-full max-w-md shrink-0 rounded-[24px] border px-5 py-5 ${sectionClassName}`}>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500/90">{advisorBlock.title}</div>
            <div className="mt-3 space-y-2.5 text-[14px] leading-6 text-slate-700">
              {advisorBlock.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <div className="mt-5 border-t border-black/5 pt-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500/90">状态</div>
              <p className="mt-1.5 text-sm font-medium text-slate-800">已放开入口，可先体验叙事与方向对齐</p>
            </div>
          </div>
        </div>

        <section className="mt-10">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {futurePlays.sectionTitle}
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {futurePlays.items.map((item) => (
              <div
                key={item.title}
                className={`flex flex-col rounded-[22px] border p-4 ${futureCard} shadow-[0_8px_30px_rgba(15,23,42,0.04)]`}
              >
                <div className="text-[15px] font-semibold text-[#111111]">{item.title}</div>
                <p className="mt-2 flex-1 text-[13px] leading-6 text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-10 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[28px] border border-black/[0.05] bg-[#FCFCFD] p-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">讨论</div>
            <div className="mt-4 space-y-3">
              {prompts.map((prompt) => (
                <div
                  key={prompt}
                  className="rounded-[20px] border border-black/[0.05] bg-white px-4 py-4 text-[14px] leading-6 text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                >
                  {prompt}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-black/[0.05] bg-white p-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">待办</div>
            <div className="mt-4 space-y-3">
              {nextSteps.map((item, index) => (
                <div key={item} className="flex gap-3 rounded-[20px] border border-black/[0.05] bg-slate-50/80 px-4 py-4">
                  <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${badgeClassName}`}>
                    {index + 1}
                  </div>
                  <div className="text-[14px] leading-6 text-slate-700">{item}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

type WorkspaceRenderProps = {
  activationKey: string;
  currentUserAccountId?: string;
  currentUserNickname?: string;
  currentUserEmail?: string;
  onReturnToHub: () => void;
  onLogout: () => void;
};

export interface WorkspaceRegistryItem {
  id: string;
  slug: string;
  title: string;
  shortLabel: string;
  isAvailable: boolean;
  accentClassName: string;
  icon: LucideIcon;
  iconContainerClassName: string;
  pillClassName: string;
  cardDescription: string;
  highlights: string[];
  ctaLabel: string;
  sortOrder: number;
  render: (props: WorkspaceRenderProps) => React.ReactNode;
}

export const WORKSPACE_REGISTRY: WorkspaceRegistryItem[] = [
  {
    id: 'sabrina',
    slug: 'sabrina',
    title: '多模型对比',
    shortLabel: '多模型对比',
    isAvailable: true,
    accentClassName: 'text-blue-700 hover:text-blue-800',
    icon: Sparkles,
    iconContainerClassName: 'bg-[#111111] text-white shadow-[0_18px_40px_rgba(17,17,17,0.18)]',
    pillClassName: 'bg-blue-50 text-blue-700',
    cardDescription: '把同一个问题交给多个模型，同时查看回答和差异总结，少靠感觉猜选型。',
    highlights: ['一次输入，同时获得多模型结果', '自动提炼关键差异和取舍', '适合选模型、比方案、做快速判断'],
    ctaLabel: '开始模型对比',
    sortOrder: 10,
    render: () => null,
  },
  {
    id: 'open-day',
    slug: 'open-day',
    title: '开放日选址',
    shortLabel: '开放日选址',
    isAvailable: true,
    accentClassName: 'text-emerald-700 hover:text-emerald-800',
    icon: Layers,
    iconContainerClassName: 'bg-[#1F5F4A] text-white shadow-[0_18px_40px_rgba(31,95,74,0.18)]',
    pillClassName: 'bg-emerald-50 text-emerald-700',
    cardDescription: '上传楼盘表格后，用统一口径完成测算排序，帮你把资源放到更可能出结果的项目上。',
    highlights: ['批量清洗楼盘数据，减少手工筛表', '用参数包和公式统一判断口径', '适合开放日前排优先级和复盘'],
    ctaLabel: '开始楼盘测算',
    sortOrder: 20,
    render: ({ activationKey }) => <OpenDayWorkspace activationKey={activationKey} />,
  },
  {
    id: 'selling-houses',
    slug: 'selling-houses',
    title: '王牌资产顾问',
    shortLabel: '王牌资产顾问',
    isAvailable: true,
    accentClassName: 'text-[#8B5A2B] hover:text-[#72461f]',
    icon: UserRound,
    iconContainerClassName: 'bg-[#8B5A2B] text-white shadow-[0_18px_34px_rgba(139,90,43,0.16)]',
    pillClassName: 'bg-[#F6EFE7] text-[#8B5A2B]',
    cardDescription: '开一局房源组合经营，在价格、节奏和沟通之间拿稳分寸，守住关键盘，打出好收尾。',
    highlights: ['快速看清每套房现在该怎么推', '定价沟通、开放日和议价都要做取舍', '在业主预期和推进节奏之间把局面控住'],
    ctaLabel: '开一局',
    sortOrder: 30,
    render: ({ activationKey, currentUserAccountId, currentUserNickname, currentUserEmail, onReturnToHub, onLogout }) => (
      <SellingHousesWorkspace
        activationKey={activationKey}
        currentUserAccountId={currentUserAccountId}
        currentUserNickname={currentUserNickname}
        currentUserEmail={currentUserEmail}
        onReturnToHub={onReturnToHub}
        onLogout={onLogout}
      />
    ),
  },
  {
    id: 'market-management',
    slug: 'market-management',
    title: '商圈经营',
    shortLabel: '商圈经营',
    isAvailable: true,
    accentClassName: 'text-sky-700 hover:text-sky-800',
    icon: Building2,
    iconContainerClassName: 'bg-[#0F4C81] text-white shadow-[0_18px_34px_rgba(15,76,129,0.18)]',
    pillClassName: 'bg-sky-50 text-sky-700',
    cardDescription: '从商圈资源、重点盘分配到协同节奏，打一局商圈经营的整体判断。',
    highlights: ['资源分配和节奏管理更立体', '从单盘视角上升到商圈视角', '聚焦商圈经营决策'],
    ctaLabel: '进入',
    sortOrder: 40,
    render: () => <MarketManagementWorkspace />,
  },
  {
    id: 'rational-owner',
    slug: 'rational-owner',
    title: '理性业主',
    shortLabel: '理性业主',
    isAvailable: true,
    accentClassName: 'text-rose-700 hover:text-rose-800',
    icon: Target,
    iconContainerClassName: 'bg-[#B9385D] text-white shadow-[0_18px_34px_rgba(185,56,93,0.18)]',
    pillClassName: 'bg-rose-50 text-rose-700',
    cardDescription: '站在业主视角做取舍，在价格、时机、经纪人动作和持有成本之间找到最理性的决策。',
    highlights: ['业主视角玩法', '价格和时机判断更直接', '聚焦卖房取舍'],
    ctaLabel: '进入',
    sortOrder: 50,
    render: () => <RationalOwnerWorkspace />,
  },
];

export const WORKSPACE_REGISTRY_BY_ID = Object.fromEntries(
  WORKSPACE_REGISTRY.map((workspace) => [workspace.id, workspace] as const),
) as Record<string, WorkspaceRegistryItem>;

export const WORKSPACE_REGISTRY_BY_SLUG = Object.fromEntries(
  WORKSPACE_REGISTRY.map((workspace) => [workspace.slug, workspace] as const),
) as Record<string, WorkspaceRegistryItem>;

export function normalizeWorkspacePathname(pathname: string) {
  const [pathOnly = '/'] = pathname.trim().split(/[?#]/, 1);
  if (!pathOnly || pathOnly === '/') {
    return '/';
  }

  return pathOnly.endsWith('/') ? pathOnly.slice(0, -1) : pathOnly;
}

function resolveWorkspaceSlug(pathname: string) {
  const normalized = normalizeWorkspacePathname(pathname);
  if (normalized === '/') {
    return '';
  }

  const [, slug = ''] = normalized.split('/');
  return slug;
}

export function resolveWorkspaceFromPathname(pathname: string): 'hub' | string {
  const slug = resolveWorkspaceSlug(pathname);
  if (!slug) {
    return 'hub';
  }

  return WORKSPACE_REGISTRY_BY_SLUG[slug]?.id || 'hub';
}

export function resolvePathnameForWorkspace(workspace: 'hub' | string): string {
  if (workspace === 'hub') {
    return '/';
  }

  const slug = WORKSPACE_REGISTRY_BY_ID[workspace]?.slug;
  return slug ? `/${slug}` : '/';
}

export function resolveAllowedWorkspaceFromPathname(
  pathname: string,
  allowedWorkspaces: string[],
): string | null {
  const matchedWorkspace = resolveWorkspaceFromPathname(pathname);
  if (matchedWorkspace === 'hub') {
    return null;
  }

  return allowedWorkspaces.includes(matchedWorkspace) ? matchedWorkspace : null;
}
