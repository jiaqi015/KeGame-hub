import React from 'react';
import { LogOut } from 'lucide-react';
import { WORKSPACE_REGISTRY } from '../../workspaces/workspaceRegistry';

interface WorkspaceHubProps {
  onSelect: (workspaceId: string) => void;
  onPrepareWorkspace?: (workspaceId: string) => void;
  onLogout: () => void;
  allowedWorkspaces: string[];
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
}: WorkspaceHubProps) {
  const sortedWorkspaces = [...WORKSPACE_REGISTRY].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">KeGame Hub</h1>
            <p className="text-slate-500 text-sm mt-1">选择一个工作台开始</p>
          </div>
          
          <div className="flex items-center gap-4">
            {(currentUserNickname || currentUserEmail) && (
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">
                  {currentUserNickname || currentUserEmail?.split('@')[0]}
                </p>
                <p className="text-xs text-slate-500">{currentUserEmail}</p>
              </div>
            )}
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-all shadow-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">退出</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedWorkspaces.map((workspace) => {
            const isAllowed = allowedWorkspaces.includes(workspace.id);
            const Icon = workspace.icon;

            return (
              <div
                key={workspace.id}
                onClick={() => isAllowed && onSelect(workspace.id)}
                onMouseEnter={() =>
                  isAllowed && onPrepareWorkspace?.(workspace.id)
                }
                className={`group relative bg-white rounded-2xl border transition-all duration-300 ${
                  isAllowed
                    ? 'border-slate-200 hover:border-slate-300 hover:shadow-xl cursor-pointer hover:-translate-y-1'
                    : 'border-slate-100 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="p-6">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${workspace.iconContainerClassName}`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {workspace.title}
                    </h3>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${workspace.pillClassName}`}
                    >
                      {workspace.shortLabel}
                    </span>
                  </div>

                  <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                    {workspace.cardDescription}
                  </p>

                  <div className="space-y-2 mb-6">
                    {workspace.highlights.map((highlight, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 text-sm text-slate-600"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        {highlight}
                      </div>
                    ))}
                  </div>

                  <button
                    disabled={!isAllowed}
                    className={`w-full py-3 px-4 rounded-xl font-medium text-sm transition-all ${
                      isAllowed
                        ? `${workspace.accentClassName} bg-slate-50 hover:bg-slate-100 border border-slate-200`
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {isAllowed ? workspace.ctaLabel : '未授权访问'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
