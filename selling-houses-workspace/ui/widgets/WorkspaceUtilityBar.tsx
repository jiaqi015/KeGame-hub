import React from 'react';
import { History, LogOut, Medal } from 'lucide-react';

interface WorkspaceUtilityBarProps {
  journalTodayCount: number;
  onOpenJournal: () => void;
  onOpenLeaderboard: () => void;
  onLogout: () => void;
}

export function WorkspaceUtilityBar({
  journalTodayCount,
  onOpenJournal,
  onOpenLeaderboard,
  onLogout,
}: WorkspaceUtilityBarProps) {
  return (
    <div className="seller-band flex items-center gap-1 p-1">
      <button
        type="button"
        onClick={onOpenJournal}
        className="seller-button-secondary inline-flex h-9 items-center gap-1.5 px-3.5"
      >
        <History size={14} />
        经营记录
        <span className="seller-chip px-1.5 py-0 text-[10px] leading-5">
          今日 {journalTodayCount}
        </span>
      </button>
      <button
        type="button"
        onClick={onOpenLeaderboard}
        className="seller-button-secondary inline-flex h-9 items-center gap-1.5 px-3.5"
      >
        <Medal size={14} />
        排行榜
      </button>
      <button
        type="button"
        onClick={onLogout}
        className="seller-button-ghost inline-flex h-9 items-center gap-1.5 px-3.5"
      >
        <LogOut size={14} />
        登出账号
      </button>
    </div>
  );
}
