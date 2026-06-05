import React from 'react';
import { History, Medal } from 'lucide-react';

interface WorkspaceUtilityBarProps {
  journalTodayCount: number;
  onOpenJournal: () => void;
  onOpenLeaderboard: () => void;
}

export function WorkspaceUtilityBar({
  journalTodayCount,
  onOpenJournal,
  onOpenLeaderboard,
}: WorkspaceUtilityBarProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onOpenJournal}
        aria-label={`打开今日记录，共 ${journalTodayCount} 条`}
        title="查看今天的经营记录"
        className="seller-button-secondary inline-flex h-9 items-center gap-1.5 px-3.5"
      >
        <History size={14} />
        今日记录
        <span className="seller-chip px-1.5 py-0 text-[10px] leading-5">
          {journalTodayCount} 条
        </span>
      </button>
      <button
        type="button"
        onClick={onOpenLeaderboard}
        className="seller-button-secondary inline-flex h-9 items-center gap-1.5 px-3.5"
      >
        <Medal size={14} />
        游戏排行榜
      </button>
    </div>
  );
}
