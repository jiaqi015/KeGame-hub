import { motion } from 'motion/react';
import { LogOut, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { ActivationWorkspaceId } from '../../types';
import { WORKSPACE_REGISTRY } from '../../workspaces/workspaceRegistry';
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
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8E8E93]">KeGame</div>
              <h1 className="truncate text-[26px] font-semibold tracking-[-0.05em] text-[#111111]">功能入口</h1>
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
              登出
            </button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          {visibleWorkspaces.map((workspace) => {
            const Icon = workspace.icon;
            const isAvailable = workspace.isAvailable;
            const footerLabel = isAvailable ? workspace.ctaLabel : '开发中，请期待';
            const cardClassName = isAvailable
              ? 'group flex h-full flex-col rounded-[32px] border border-black/5 bg-white p-8 text-left shadow-[0_4px_24px_rgba(0,0,0,0.03)] transition-all hover:-translate-y-1.5 hover:shadow-[0_24px_50px_rgba(0,0,0,0.08)]'
              : 'flex h-full flex-col rounded-[32px] border border-black/5 bg-[linear-gradient(180deg,#ffffff,#fbfbfd)] p-8 text-left shadow-[0_4px_24px_rgba(0,0,0,0.03)] opacity-80';

            return (
              <button
                key={workspace.id}
                type="button"
                onClick={isAvailable ? () => {
                  setOpeningWorkspace(workspace.id);
                  onSelect(workspace.id);
                } : undefined}
                onMouseEnter={isAvailable ? () => onPrepareWorkspace?.(workspace.id) : undefined}
                onFocus={isAvailable ? () => onPrepareWorkspace?.(workspace.id) : undefined}
                disabled={!isAvailable}
                aria-disabled={!isAvailable}
                className={cardClassName}
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-[20px] ${workspace.iconContainerClassName}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className={`rounded-full px-3 py-1 text-[11px] font-semibold ${workspace.pillClassName}`}>
                    {workspace.shortLabel}
                  </div>
                </div>
                <h2 className="mt-6 text-[30px] font-semibold tracking-[-0.05em] text-[#111111]">
                  {workspace.title}
                </h2>
                <p className="mt-3 text-[15px] leading-7 text-[#6E6E73]">
                  {workspace.cardDescription}
                </p>
                <div className="mt-6 space-y-3 text-sm text-[#424245]">
                  {workspace.highlights.map((highlight) => (
                    <div key={highlight} className="flex items-center gap-2">
                      <CheckCircle2 className={`h-4 w-4 ${workspace.accentClassName.split(' ')[0]}`} />
                      {highlight}
                    </div>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between pt-8 text-sm font-semibold text-[#111111]">
                  <span>{openingWorkspace === workspace.id ? '正在打开…' : footerLabel}</span>
                  {isAvailable ? (
                    <span
                      className={`inline-flex items-center gap-1 transition group-hover:translate-x-1 ${workspace.accentClassName.split(' ').slice(0, 1).join(' ')}`}
                    >
                      {openingWorkspace === workspace.id ? '进入中' : '打开'}
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
          })}
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
