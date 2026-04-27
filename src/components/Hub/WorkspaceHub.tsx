import { motion } from 'motion/react';
import { LogOut, CheckCircle2, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { ActivationWorkspaceId } from '../../types';
import { WORKSPACE_REGISTRY, type WorkspaceRegistryItem } from '../../workspaces/workspaceRegistry';
import { KeGameHubMark } from '../Brand/KeGameHubMark';
import { UserIdentityBadge } from '../Auth/UserIdentityBadge';

interface WorkspaceHubProps {
  onSelect: (id: ActivationWorkspaceId) => void;
  onPrepareWorkspace?: (id: ActivationWorkspaceId) => void;
  onLogout: () => void;
  allowedWorkspaces: ActivationWorkspaceId[];
  currentUserNickname?: string;
  currentUserEmail?: string;
  sessionExpiresAt?: string;
}

type HubSectionId = WorkspaceRegistryItem['hubSection'];

const HUB_SECTIONS: { id: HubSectionId; label: string; description: string }[] = [
  {
    id: 'work-skill',
    label: '工作 skill',
    description: '把具体工作流做成可直接使用的 AI 工具。',
  },
  {
    id: 'selling-world',
    label: '卖房世界模型',
    description: '围绕同一套卖房世界，展开顾问、商圈和业主视角。',
  },
];

export function WorkspaceHub({
  onSelect,
  onPrepareWorkspace,
  onLogout,
  allowedWorkspaces,
  currentUserNickname,
  currentUserEmail,
  sessionExpiresAt,
}: WorkspaceHubProps) {
  const visibleWorkspaces = WORKSPACE_REGISTRY
    .filter((workspace) => allowedWorkspaces.includes(workspace.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleSections = HUB_SECTIONS
    .map((section) => ({
      ...section,
      workspaces: visibleWorkspaces.filter((workspace) => workspace.hubSection === section.id),
    }))
    .filter((section) => section.workspaces.length > 0);
  const [openingWorkspace, setOpeningWorkspace] = useState<ActivationWorkspaceId | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 overflow-auto bg-[#FBFBFD] px-6 py-7"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
        <div className="flex flex-col gap-4 rounded-[28px] border border-black/5 bg-white/70 px-5 py-4 shadow-[0_16px_45px_rgba(15,23,42,0.04)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <KeGameHubMark size={34} />
            <div className="min-w-0">
              <div className="text-[13px] font-bold tracking-[0.16em] text-[#5C5C60]">KeGame Hub&nbsp;&nbsp;AI 工作新范式</div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <UserIdentityBadge
              nickname={currentUserNickname}
              email={currentUserEmail}
              sessionExpiresAt={sessionExpiresAt}
              compact
            />
            <button
              onClick={onLogout}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[#5C5C60] transition-all hover:border-black/20 hover:bg-[#F5F5F7] hover:text-[#1D1D1F] active:scale-95"
            >
              <LogOut className="h-3.5 w-3.5" />
              退出到登录
            </button>
          </div>
        </div>

        <div className={`grid gap-6 ${visibleSections.length > 1 ? 'xl:grid-cols-2' : ''}`}>
          {visibleSections.map((section) => (
            <section
              key={section.id}
              className="rounded-[32px] border border-black/[0.04] bg-white/55 p-4 shadow-[0_10px_34px_rgba(15,23,42,0.035)] sm:p-5"
            >
              <div className="mb-4 px-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8E8E93]">{section.label}</div>
                <p className="mt-1.5 text-[12px] leading-5 text-[#6E6E73]">{section.description}</p>
              </div>
              <div className="grid gap-4">
                {section.workspaces.map((workspace) => (
                  <div key={workspace.id}>
                    <WorkspaceCard
                      workspace={workspace}
                      openingWorkspace={openingWorkspace}
                      onOpen={(workspaceId) => {
                        setOpeningWorkspace(workspaceId);
                        onSelect(workspaceId);
                      }}
                      onPrepareWorkspace={onPrepareWorkspace}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {visibleWorkspaces.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-black/10 bg-white/70 px-6 py-10 text-center text-sm text-[#6E6E73]">
            当前 key 还没有分配可访问子项目，请联系管理员补充权限。
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function WorkspaceCard({
  workspace,
  openingWorkspace,
  onOpen,
  onPrepareWorkspace,
}: {
  workspace: WorkspaceRegistryItem;
  openingWorkspace: ActivationWorkspaceId | null;
  onOpen: (id: ActivationWorkspaceId) => void;
  onPrepareWorkspace?: (id: ActivationWorkspaceId) => void;
}) {
  const Icon = workspace.icon;
  const isAvailable = workspace.status === 'available';
  const isPlanned = workspace.status === 'planned';
  const canOpen = isAvailable || isPlanned;
  const footerLabel = canOpen ? workspace.ctaLabel : '未开放，请期待';
  const statusBadgeLabel = isAvailable ? '公测版' : isPlanned ? '建设中，敬请期待' : '未开放';
  const statusBadgeClassName = isAvailable
    ? workspace.pillClassName
    : isPlanned
      ? 'bg-amber-50 text-amber-700'
      : 'bg-slate-100 text-slate-500';
  const cardClassName = canOpen
    ? 'group flex h-full flex-col rounded-[26px] border border-black/5 bg-white p-6 text-left shadow-[0_4px_24px_rgba(0,0,0,0.03)] transition-all hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(0,0,0,0.07)]'
    : 'flex h-full flex-col rounded-[26px] border border-black/5 bg-[linear-gradient(180deg,#ffffff,#fbfbfd)] p-6 text-left shadow-[0_4px_24px_rgba(0,0,0,0.03)] opacity-80';

  return (
    <button
      type="button"
      onClick={canOpen ? () => onOpen(workspace.id) : undefined}
      onMouseEnter={isAvailable ? () => onPrepareWorkspace?.(workspace.id) : undefined}
      onFocus={isAvailable ? () => onPrepareWorkspace?.(workspace.id) : undefined}
      disabled={!canOpen}
      aria-disabled={!canOpen}
      className={cardClassName}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-12 w-12 items-center justify-center rounded-[18px] ${workspace.iconContainerClassName}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${workspace.pillClassName}`}>
            {workspace.shortLabel}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusBadgeClassName}`}>
            {statusBadgeLabel}
          </span>
        </div>
      </div>
      <h2 className="mt-5 text-[25px] font-semibold tracking-[-0.05em] text-[#111111]">
        {workspace.title}
      </h2>
      <p className="mt-2.5 text-[13px] leading-6 text-[#6E6E73]">
        {workspace.cardDescription}
      </p>
      <div className="mt-5 space-y-2.5 text-[12px] text-[#424245]">
        {workspace.highlights.map((highlight) => (
          <div key={highlight} className="flex items-center gap-2">
            <CheckCircle2 className={`h-3.5 w-3.5 ${workspace.accentClassName.split(' ')[0]}`} />
            {highlight}
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between pt-5 text-[13px] font-semibold text-[#111111]">
        <span>{openingWorkspace === workspace.id ? '正在打开…' : footerLabel}</span>
        {canOpen ? (
          <span className={`inline-flex items-center gap-1 transition group-hover:translate-x-1 ${workspace.accentClassName.split(' ').slice(0, 1).join(' ')}`}>
            {openingWorkspace === workspace.id ? '进入中' : isPlanned ? '预览' : '打开'}
            <ArrowRight className="h-4 w-4" />
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[#8E8E93]">
            开发中
          </span>
        )}
      </div>
    </button>
  );
}
