import React, { lazy } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Building2, Layers, Sparkles, Target, UserRound } from 'lucide-react';
import type { ActivationWorkspaceId } from '../types';
import { getWorkspaceLabel, getWorkspaceSlug, resolveWorkspaceBySlug } from '../../lib/workspaces.js';

const OpenDayWorkspace = lazy(() =>
  import('../open-day/OpenDayWorkspace').then((module) => ({ default: module.OpenDayWorkspace })),
);
// Seller runtime source of truth:
// The production workspace registry only loads from src/selling-houses/*.
// Do not switch this to selling-houses-workspace/* without an explicit migration.
const SellingHousesWorkspace = lazy(() =>
  import('../selling-houses/SellingHousesWorkspace').then((module) => ({ default: module.SellingHousesWorkspace })),
);

export function preloadSellingHousesWorkspace() {
  return import('../selling-houses/SellingHousesWorkspace');
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
              <p className="mt-1.5 text-sm font-medium text-slate-800">已开放体验</p>
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
    slug: getWorkspaceSlug('market-management'),
    title: getWorkspaceLabel('market-management'),
    shortLabel: getWorkspaceLabel('market-management'),
    isAvailable: true,
    accentClassName: 'text-sky-700 hover:text-sky-800',
    icon: Building2,
    iconContainerClassName: 'bg-[#0F4C81] text-white shadow-[0_18px_34px_rgba(15,76,129,0.18)]',
    pillClassName: 'bg-sky-50 text-sky-700',
    cardDescription: '从商圈资源、重点盘分配到协同节奏，打一局商圈经营的整体判断。',
    highlights: ['资源分配和节奏管理更立体', '从单盘视角上升到商圈视角', '聚焦商圈经营决策'],
    ctaLabel: '进入',
    sortOrder: 40,
    render: () => (
      <PlaceholderWorkspace
        badge="商圈经营"
        title="从整片商圈做经营"
        subtitle="面向商圈经理：一屏看盘面、看资源、看组织节奏。"
        heroImageSrc="/hub-district-manager-hero.svg"
        heroImageAlt="商圈网络与经营中枢示意图"
        heroTagline="经理最期待：一屏里看清谁该压、谁该保、谁该让"
        heroSubline="把「重点盘、跨店协同、资源位、总部政策」从口号变成一局的取舍"
        advisorBlock={{
          title: '和「王牌资产顾问 / 卖方顾问游戏」',
          paragraphs: [
            '两边共用同一套底层对象：商圈、重点盘、竞品、客户、资源位与周节奏；顾问端模拟单盘与多房经营，你端放大到「整片 + 组织」的分配与推进。',
            '以后上线后，你在商圈里调资源、改节奏，会反向体现在顾问局里的可行动作强度与组织压力；同一场数据的复盘，可以从单盘切到商圈，从商圈沉回单盘。',
          ],
        }}
        futurePlays={{
          sectionTitle: '后续规划',
          items: [
            { title: '周目标与资源位主循环', body: '周初投资源、配置重点盘、设定协同动作；周末看「转化、丢盘、满意度」与下周方向是否该转向。' },
            { title: '组织与跨店协同一屏化', body: '抢客、让盘、并案、外区分流变成局内事件；你要在组织信用与单盘结果之间做选择。' },
            { title: '总部 / 政策沙盒', body: '用可切换的政策包观察商圈结构怎么变，训练的是预判与排兵布阵，而不是只背管理话术。' },
          ],
        }}
        prompts={[
          '如果你要经营一个商圈，这周最先动的是：资源位、人员协同，还是重点盘清单？',
          '同一板块突然多三套强竞价房源，你优先改获客的打法，还是优先收缩重点盘？',
          '总部只给两个资源位，你会给高单价盘、高流速盘，还是能守住口碑的战略盘？',
        ]}
        nextSteps={[
          '和团队一起定主循环：周目标、资源位、重点盘、协同动作、复盘五件事谁是一号位。',
          '列出与顾问游戏要共享的字段，避免两屏各说各话（同一套房源与市场假设）。',
          '先定 MVP：只做资源分配 + 周复盘一屏，再叠加组织事件与政策包。',
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
    cardDescription: '站在业主视角做取舍，在价格、时机、经纪人动作和持有成本之间找到最理性的决策。',
    highlights: ['业主视角玩法', '价格和时机判断更直接', '聚焦卖房取舍'],
    ctaLabel: '进入',
    sortOrder: 50,
    render: () => (
      <PlaceholderWorkspace
        badge="业主决策"
        title="在情绪里做最理性的主"
        subtitle="把「要多少钱、什么时候动、信谁的话」变成一局的取舍。"
        heroImageSrc="/hub-rational-owner-hero.svg"
        heroImageAlt="家、确定感与决策象征示意图"
        heroTagline="业主最期待：少被节奏带着跑，多看清自己真正要什么"
        heroSubline="价格、时机、信任、持有成本，将来会在同一局里可对比、可复盘。"
        advisorBlock={{
          title: '和「王牌资产顾问 / 卖方顾问游戏」',
          paragraphs: [
            '顾问那端是「帮你怎么卖」的经营模拟；你这一端是「我作为业主该怎么选」的决策实验——两边绑定同一套房源、市场与谈判过程。',
            '上线后，你在这里的定价与节奏选择，会反过来影响顾问局里看到的业主信任、耐心与推进压力，形成真正的双视角同世界。',
          ],
        }}
        futurePlays={{
          sectionTitle: '后续规划',
          items: [
            { title: '双视角同世界', body: '你改心理底价或时间约束，会体现在顾问那端的可行动作与风险提示里；复盘可以从业主视角再跳回单盘。' },
            { title: '「后悔值」而不仅是成交价', body: '除了卖高卖低，还会看事后复盘：你愿不愿意再次做同样的选择——训练长期理性而不是单日情绪。' },
            { title: '全成本与推进剧本', body: '持有成本、机会成本、换顾问成本与开放日 / 议价的掉价感，会叠成一条看得见的总账。' },
          ],
        }}
        prompts={[
          '两位顾问说法不同：你更看重快速成交的确定性，还是更在意最后落袋的价格？',
          '市场转冷时，你会先调价、先换推进动作，还是再观察几天？',
          '顾问提出做开放日，你担心被邻居感知掉价时，会接受、拒绝，还是加前提条件？',
        ]}
        nextSteps={[
          '和试点业主一起定胜负口径：是「少后悔」还是「综合效用最高」。',
          '定三条共同字段：价格底线、时间底限、可接受的掉价感边界。',
          '与顾问游戏对表同一套市场参数，避免一街两套逻辑。',
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
