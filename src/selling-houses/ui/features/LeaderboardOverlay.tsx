import React, { useMemo, useState } from 'react';
import { Crown, LoaderCircle, Trophy, Users, X } from 'lucide-react';
import type { MaintainerLeaderboardDetail } from '../../application/cloudSync';
import {
  type LeaderboardProjectionTabId,
  buildLeaderboardProjection,
} from '../../application/projections/leaderboardProjection.js';

interface LeaderboardOverlayProps {
  loading: boolean;
  detail: MaintainerLeaderboardDetail | null;
  error?: string | null;
  onClose: () => void;
}

const TAB_ICONS: Record<LeaderboardProjectionTabId, React.ReactNode> = {
  'total-score': <Trophy size={15} />,
  'best-score': <Crown size={15} />,
  'play-count': <Users size={15} />,
};

export function LeaderboardOverlay({ loading, detail, error, onClose }: LeaderboardOverlayProps) {
  const projection = useMemo(() => buildLeaderboardProjection(detail), [detail]);
  const [activeTab, setActiveTab] = useState<LeaderboardProjectionTabId>('total-score');
  const active = projection.tabs.find((item) => item.id === activeTab) || projection.tabs[0];

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center bg-[#04080dcc] px-4 py-4 backdrop-blur-md sm:px-6 sm:py-6"
      onClick={onClose}
    >
      <div
        className="relative h-full w-full max-w-[620px] overflow-y-auto rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,#111923_0%,#0b1118_100%)] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.5)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-end gap-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-white/10 bg-white/4 text-white/70 transition hover:bg-white/8 hover:text-white"
            aria-label="关闭游戏排行榜"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-5 flex gap-1 rounded-full border border-white/10 bg-[#121b27] p-1">
          {projection.tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-3 text-sm font-semibold transition ${
                  selected
                    ? 'bg-[#efe8da] text-[#161b22] shadow-[0_8px_24px_rgba(0,0,0,0.25)]'
                    : 'text-white/60 hover:bg-white/5 hover:text-white/82'
                }`}
              >
                {TAB_ICONS[tab.id]}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,28,39,0.98),rgba(14,21,30,0.98))] p-5">
          {loading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-white/60">
              <LoaderCircle size={28} className="animate-spin" />
              <div className="text-sm font-medium">正在拉取跨局榜单...</div>
            </div>
          ) : error ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center text-white/60">
              <div className="text-lg font-semibold text-white">跨局榜单暂时打不开</div>
              <div className="max-w-[280px] text-sm leading-6">{error}</div>
            </div>
          ) : active.entries.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center text-white/60">
              <div className="text-lg font-semibold text-white">{active.emptyTitle}</div>
              <div className="max-w-[320px] text-sm leading-6">{active.emptyDetail}</div>
              <div className="max-w-[320px] text-xs leading-6 text-white/35">正式结算后会显示。</div>
            </div>
          ) : (
            <div className="space-y-3">
              {active.entries.map((entry) => (
                <div key={`${active.id}-${entry.ownerKey}-${entry.rank}`}>
                  <LeaderboardEntryCard
                    entry={entry}
                    tabId={active.id}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeaderboardEntryCard({
  entry,
  tabId,
}: {
  entry: {
    rank: number;
    playerName: string;
    valueLabel: string;
    badge?: string;
    note: string;
  };
  tabId: LeaderboardProjectionTabId;
}) {
  const topThree = entry.rank <= 3;
  const valueText = entry.valueLabel.replace(/\s+/g, '');

  return (
    <div
      className={`relative overflow-hidden rounded-[20px] border px-4 py-4 ${
        topThree
          ? 'border-[#b88745]/70 bg-[linear-gradient(135deg,#fff5df_0%,#efd3a7_100%)] shadow-[0_12px_28px_rgba(43,31,18,0.18)]'
          : 'border-white/10 bg-[linear-gradient(180deg,rgba(23,32,43,0.95),rgba(16,24,33,0.95))]'
      }`}
    >
      <div
        className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[42px] font-black tracking-[-0.05em] ${
          topThree ? 'text-[#8a5a1f]/38' : 'text-white/10'
        }`}
      >
        {valueText}
      </div>
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-sm font-bold ${
              entry.rank === 1
                ? 'bg-[#9a632d] text-white'
                : entry.rank === 2
                  ? 'bg-[#293241] text-white'
                  : entry.rank === 3
                    ? 'bg-[#7d5a3a] text-white'
                    : 'bg-white/10 text-white/82'
            }`}
          >
            {entry.rank}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={`truncate text-[20px] font-semibold tracking-[-0.03em] ${
                  topThree ? 'text-[#243042]' : 'text-white'
                }`}
              >
                {entry.playerName}
              </div>
              {entry.badge && (
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.02em] ${
                    topThree ? 'bg-[#243042] text-white' : 'bg-white/8 text-white/62'
                  }`}
                >
                  {entry.badge}
                </span>
              )}
            </div>
            <div
              className={`mt-1 text-[12px] leading-6 ${
                topThree ? 'text-[#5d554b]' : 'text-white/52'
              }`}
            >
              {buildEntryDetail(tabId, entry.valueLabel, entry.note)}
            </div>
          </div>
        </div>
        <div className="w-[76px] shrink-0" />
      </div>
    </div>
  );
}

function buildEntryDetail(
  tabId: LeaderboardProjectionTabId,
  valueLabel: string,
  fallback: string,
) {
  if (tabId === 'total-score') {
    return `生涯有效总分 ${valueLabel}。`;
  }
  if (tabId === 'best-score') {
    return `单局最高做到 ${valueLabel}。`;
  }
  if (tabId === 'play-count') {
    return `正式完局 ${valueLabel}。`;
  }
  return fallback;
}
