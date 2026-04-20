import React, { lazy } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Building2, Layers, Sparkles, Target, UserRound } from 'lucide-react';
import type { ActivationWorkspaceId } from '../types';
import { getWorkspaceLabel, getWorkspaceSlug, resolveWorkspaceBySlug } from '../../lib/workspaces.js';

const OpenDayWorkspace = lazy(() =>
  import('../open-day/OpenDayWorkspace').then((module) => ({ default: module.OpenDayWorkspace })),
);
const SellingHousesWorkspace = lazy(() =>
  import('../selling-houses/SellingHousesWorkspace').then((module) => ({ default: module.SellingHousesWorkspace })),
);

function PlaceholderWorkspace({
  badge,
  title,
  subtitle,
  prompts,
  nextSteps,
  tone = 'sky',
}: {
  badge: string;
  title: string;
  subtitle: string;
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
    ? 'border-rose-100 bg-rose-50/70'
    : 'border-sky-100 bg-sky-50/70';

  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_32%),linear-gradient(180deg,#fbfdff,#ffffff)] px-8 py-10">
      <div className="w-full max-w-5xl rounded-[36px] border border-black/5 bg-white/92 p-8 shadow-[0_24px_70px_rgba(20,20,43,0.08)] md:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${badgeClassName}`}>
              {badge}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <div className={`flex h-14 w-14 items-center justify-center rounded-[20px] ${accentClassName}`}>
                <span className="text-lg font-bold">AI</span>
              </div>
              <div>
                <h2 className="text-[30px] font-semibold tracking-[-0.04em] text-[#111111]">{title}</h2>
                <p className="mt-2 text-[15px] leading-7 text-[#6E6E73]">{subtitle}</p>
              </div>
            </div>
          </div>

          <div className={`rounded-[24px] border px-5 py-4 ${sectionClassName} lg:max-w-[300px]`}>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">当前状态</div>
            <div className="mt-2 text-[17px] font-semibold text-slate-900">已放开入口，可先用于对齐玩法</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              现在先给你一组预设提示，方便团队先讨论“这个游戏应该怎么打、怎么测、怎么做世界观复用”。
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[28px] border border-black/[0.05] bg-[#FCFCFD] p-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">预设提示</div>
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
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">建议下一步</div>
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
  id: ActivationWorkspaceId;
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

export type WorkspaceRouteId = 'hub' | ActivationWorkspaceId;

export const WORKSPACE_REGISTRY: WorkspaceRegistryItem[] = [
  {
    id: 'sabrina',
    slug: getWorkspaceSlug('sabrina'),
    title: getWorkspaceLabel('sabrina'),
    shortLabel: getWorkspaceLabel('sabrina'),
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
    slug: getWorkspaceSlug('open-day'),
    title: getWorkspaceLabel('open-day'),
    shortLabel: getWorkspaceLabel('open-day'),
    isAvailable: true,
    accentClassName: 'text-emerald-700 hover:text-emerald-800',
    icon: Layers,
    iconContainerClassName: 'bg-[#1F5F4A] text-white shadow-[0_18px_40px_rgba(31,95,74,0.18)]',
    pillClassName: 'bg-emerald-50 text-emerald-700',
    cardDescription: '上传楼盘表格后，用统一口径完成测算排序，帮你把资源放到更可能出结果的项目上。',
    highlights: ['批量清洗楼盘数据，减少手工筛表', '用参数包和公式统一判断口径', '适合开放日前排优先级和做复盘'],
    ctaLabel: '开始楼盘测算',
    sortOrder: 20,
    render: ({ activationKey }) => <OpenDayWorkspace activationKey={activationKey} />,
  },
  {
    id: 'selling-houses',
    slug: getWorkspaceSlug('selling-houses'),
    title: getWorkspaceLabel('selling-houses'),
    shortLabel: getWorkspaceLabel('selling-houses'),
    isAvailable: true,
    accentClassName: 'text-[#8B5A2B] hover:text-[#72461f]',
    icon: UserRound,
    iconContainerClassName: 'bg-[#8B5A2B] text-white shadow-[0_18px_34px_rgba(139,90,43,0.16)]',
    pillClassName: 'bg-[#F6EFE7] text-[#8B5A2B]',
    cardDescription: '开一局房源组合经营，在价格、节奏和沟通之间拿稳分寸，守住关键盘，打出好收尾。',
    highlights: ['快速看清每套房现在该怎么推', '定价沟通、开放日和议价都要做取舍', '在窗口压力和业主预期之间把局面控住'],
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
    slug: getWorkspaceSlug('market-management'),
    title: getWorkspaceLabel('market-management'),
    shortLabel: getWorkspaceLabel('market-management'),
    isAvailable: true,
    accentClassName: 'text-sky-700 hover:text-sky-800',
    icon: Building2,
    iconContainerClassName: 'bg-[#0F4C81] text-white shadow-[0_18px_34px_rgba(15,76,129,0.18)]',
    pillClassName: 'bg-sky-50 text-sky-700',
    cardDescription: '从商圈资源、重点盘分配到协同节奏，打一局商圈经营的整体判断。',
    highlights: ['资源分配和节奏管理会更立体', '从单盘视角上升到商圈视角', '后续会接入统一世界模型'],
    ctaLabel: '进入占位页',
    sortOrder: 40,
    render: () => (
      <PlaceholderWorkspace
        badge="商圈经营占位页"
        title="经营好商圈"
        subtitle="这个游戏已经为所有 key 预留入口，当前先提供占位页。后续会接入统一世界模型和商圈经营主循环。"
        prompts={[
          '如果你要经营一个商圈，第一周最先盯的是资源分配、重点盘排布，还是团队协同节奏？',
          '假设同一板块突然新增 3 套强竞品，你会先改“客户获取”、还是先改“重点盘策略”？',
          '如果总部只给你 2 个核心资源位，你会把它们给高总价盘、快成交盘，还是战略盘？',
        ]}
        nextSteps={[
          '先定商圈经营游戏的主循环：周目标、资源位、重点盘、协同动作、复盘口径。',
          '明确和顾问游戏复用的底层对象：商圈、房源、竞品、客户、资源位、组织压力。',
          '再决定首个可玩版本只做“资源分配局”，还是直接加入组织协同和竞争演化。',
        ]}
        tone="sky"
      />
    ),
  },
  {
    id: 'rational-owner',
    slug: getWorkspaceSlug('rational-owner'),
    title: getWorkspaceLabel('rational-owner'),
    shortLabel: getWorkspaceLabel('rational-owner'),
    isAvailable: true,
    accentClassName: 'text-rose-700 hover:text-rose-800',
    icon: Target,
    iconContainerClassName: 'bg-[#B9385D] text-white shadow-[0_18px_34px_rgba(185,56,93,0.18)]',
    pillClassName: 'bg-rose-50 text-rose-700',
    cardDescription: '站在业主视角做取舍，在价格、时机、经纪人建议和持有成本之间找到最理性的决策。',
    highlights: ['同一世界观下的业主视角玩法', '价格和时机判断会更直接', '后续会接入统一的房源与市场模型'],
    ctaLabel: '进入占位页',
    sortOrder: 50,
    render: () => (
      <PlaceholderWorkspace
        badge="业主决策占位页"
        title="做最理性的业主"
        subtitle="这个游戏已经为所有 key 预留入口，当前先提供占位页。后续会接入统一世界模型和业主决策主循环。"
        prompts={[
          '如果你是业主，面对两个顾问给出的不同建议，你更看“成交速度”、还是更看“价格确定性”？',
          '当市场转冷时，你会先降价、先换策略，还是先观察 7 天再判断？',
          '如果顾问建议做开放日，但你担心掉价感知，你会接受、拒绝，还是要求附带明确边界条件？',
        ]}
        nextSteps={[
          '先把业主视角最核心的三件事定清：价格、时机、顾问选择。',
          '明确这款游戏的胜负标准，是“卖得高”“卖得稳”还是“总体决策后悔最少”。',
          '再和顾问游戏对齐共享世界模型，确保同一套房源在两个视角下能讲得通。',
        ]}
        tone="rose"
      />
    ),
  },
];

export const WORKSPACE_REGISTRY_BY_ID = Object.fromEntries(
  WORKSPACE_REGISTRY.map((workspace) => [workspace.id, workspace] as const),
) as Record<ActivationWorkspaceId, WorkspaceRegistryItem>;

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

export function resolveWorkspaceFromPathname(pathname: string): WorkspaceRouteId {
  const slug = resolveWorkspaceSlug(pathname);
  if (!slug) {
    return 'hub';
  }

  return resolveWorkspaceBySlug(slug) || 'hub';
}

export function resolvePathnameForWorkspace(workspace: WorkspaceRouteId) {
  if (workspace === 'hub') {
    return '/';
  }

  return `/${getWorkspaceSlug(workspace)}`;
}

export function resolveAllowedWorkspaceFromPathname(
  pathname: string,
  allowedWorkspaces: ActivationWorkspaceId[],
) {
  const matchedWorkspace = resolveWorkspaceFromPathname(pathname);
  if (matchedWorkspace === 'hub') {
    return null;
  }

  return allowedWorkspaces.includes(matchedWorkspace) ? matchedWorkspace : null;
}
