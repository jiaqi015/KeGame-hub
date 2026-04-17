import React, { lazy } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Building2, Layers, Sparkles, Target, UserRound } from 'lucide-react';
import type { ActivationWorkspaceId } from '../types';

const OpenDayWorkspace = lazy(() =>
  import('../open-day/OpenDayWorkspace').then((module) => ({ default: module.OpenDayWorkspace })),
);
const SellingHousesWorkspace = lazy(() =>
  import('../selling-houses/SellingHousesWorkspace').then((module) => ({ default: module.SellingHousesWorkspace })),
);

function PlaceholderWorkspace({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_32%),linear-gradient(180deg,#fbfdff,#ffffff)] px-8">
      <div className="max-w-2xl rounded-[32px] border border-black/5 bg-white/90 p-10 text-center shadow-[0_24px_70px_rgba(20,20,43,0.08)]">
        <div className="mx-auto mb-5 inline-flex rounded-full bg-black/5 px-3 py-1 text-[11px] font-semibold text-[#6E6E73]">
          即将开放
        </div>
        <h2 className="text-[30px] font-semibold tracking-[-0.04em] text-[#111111]">{title}</h2>
        <p className="mt-4 text-[15px] leading-7 text-[#6E6E73]">{subtitle}</p>
      </div>
    </div>
  );
}

type WorkspaceRenderProps = {
  activationKey: string;
  onReturnToHub: () => void;
  onLogout: () => void;
};

export interface WorkspaceRegistryItem {
  id: ActivationWorkspaceId;
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
    title: '多模型PK',
    shortLabel: '多模型PK',
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
    title: '小区开放日选址',
    shortLabel: '小区开放日选址',
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
    title: '我是王牌资产顾问',
    shortLabel: '我是王牌资产顾问',
    isAvailable: true,
    accentClassName: 'text-[#8B5A2B] hover:text-[#72461f]',
    icon: UserRound,
    iconContainerClassName: 'bg-[#8B5A2B] text-white shadow-[0_18px_34px_rgba(139,90,43,0.16)]',
    pillClassName: 'bg-[#F6EFE7] text-[#8B5A2B]',
    cardDescription: '围绕业主目标做判断，在价格、节奏和沟通之间拿稳分寸，把每一次建议都做得更专业。',
    highlights: ['快速看清每套房现在该怎么推', '练习定价沟通、开放日和议价取舍', '在窗口压力和业主预期之间做稳判断'],
    ctaLabel: '进入顾问训练',
    sortOrder: 30,
    render: ({ activationKey, onReturnToHub, onLogout }) => (
      <SellingHousesWorkspace
        activationKey={activationKey}
        onReturnToHub={onReturnToHub}
        onLogout={onLogout}
      />
    ),
  },
  {
    id: 'market-management',
    title: '经营好商圈',
    shortLabel: '经营好商圈',
    isAvailable: false,
    accentClassName: 'text-sky-700 hover:text-sky-800',
    icon: Building2,
    iconContainerClassName: 'bg-[#0F4C81] text-white shadow-[0_18px_34px_rgba(15,76,129,0.18)]',
    pillClassName: 'bg-sky-50 text-sky-700',
    cardDescription: '从商圈资源、重点盘分配到协同节奏，训练你经营一个商圈的整体判断力。',
    highlights: ['练习资源分配和节奏管理', '从单盘视角上升到商圈视角', '后续会接入统一世界模型'],
    ctaLabel: '进入占位页',
    sortOrder: 40,
    render: () => (
      <PlaceholderWorkspace
        title="经营好商圈"
        subtitle="这个游戏已经为所有 key 预留入口，当前先提供占位页。后续会接入统一世界模型和商圈经营主循环。"
      />
    ),
  },
  {
    id: 'rational-owner',
    title: '做最理性的业主',
    shortLabel: '做最理性的业主',
    isAvailable: false,
    accentClassName: 'text-rose-700 hover:text-rose-800',
    icon: Target,
    iconContainerClassName: 'bg-[#B9385D] text-white shadow-[0_18px_34px_rgba(185,56,93,0.18)]',
    pillClassName: 'bg-rose-50 text-rose-700',
    cardDescription: '站在业主视角做取舍，在价格、时机、经纪人建议和持有成本之间找到最理性的决策。',
    highlights: ['同一世界观下的业主视角玩法', '练习价格和时机判断', '后续会接入统一的房源与市场模型'],
    ctaLabel: '进入占位页',
    sortOrder: 50,
    render: () => (
      <PlaceholderWorkspace
        title="做最理性的业主"
        subtitle="这个游戏已经为所有 key 预留入口，当前先提供占位页。后续会接入统一世界模型和业主决策主循环。"
      />
    ),
  },
];

export const WORKSPACE_REGISTRY_BY_ID = Object.fromEntries(
  WORKSPACE_REGISTRY.map((workspace) => [workspace.id, workspace] as const),
) as Record<ActivationWorkspaceId, WorkspaceRegistryItem>;
