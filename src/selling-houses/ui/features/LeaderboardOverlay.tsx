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
  const leadingEntry = active?.entries[0];
  const leaderboardLabel = active?.label || '排行榜';

  return (
    <div className="fixed inset-0 z-[95] flex justify-end bg-slate-950/35 backdrop-blur-sm" onClick={onClose}>
      <div
        className="seller-panel-muted h-full w-full max-w-[620px] overflow-y-auto rounded-none border-l p-7 shadow-[var(--seller-shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="max-w-[420px]">
            <div className="seller-label flex items-center gap-2">
              <Trophy size={13} />
              排行榜
            </div>
            <h3 className="seller-title mt-2 text-[28px]">{projection.heroTitle}</h3>
            <p className="seller-body mt-2 text-sm">{projection.heroSummary}</p>
            <p className="seller-body mt-1 text-[12px]">
              这里是跨局对比视角，只消费正式完局后的结果，不显示单局过程细节。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="seller-button-secondary inline-flex h-10 w-10 items-center justify-center rounded-[14px]"
            aria-label="关闭排行榜"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          <SummaryCard
            label="当前榜单"
            title={leaderboardLabel}
            detail={active.summary}
          />
          <SummaryCard
            label="榜首"
            title={leadingEntry ? leadingEntry.playerName : '当前还没有榜首'}
            detail={leadingEntry ? `${leaderboardLabel}${leadingEntry.valueLabel}。` : '先完成一局正式结算后，这里才会开始出现跨局排名。'}
          />
        </div>

        <div className="seller-tabbar mb-5">
          {projection.tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`seller-tab flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-3 text-sm font-semibold transition ${
                  selected
                    ? 'seller-tab-active'
                    : ''
                }`}
              >
                {TAB_ICONS[tab.id]}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <section className="seller-panel mb-5 p-5">
          <div className="seller-label text-[11px]">这张榜在比什么</div>
          <div className="mt-2 text-[18px] font-semibold text-slate-900">{active.summary}</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {projection.highlights.map((item) => (
              <div key={item.title} className="rounded-[20px] border border-black/[0.05] bg-slate-50/70 p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{item.title}</div>
                <div className="mt-2 text-[12px] leading-6 text-slate-600">{item.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="seller-panel p-5">
          {loading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-slate-500">
              <LoaderCircle size={28} className="animate-spin" />
              <div className="text-sm font-medium">正在拉取跨局榜单...</div>
            </div>
          ) : error ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center text-slate-500">
              <div className="text-lg font-semibold text-slate-900">跨局榜单暂时打不开</div>
              <div className="max-w-[280px] text-sm leading-6">{error}</div>
            </div>
          ) : active.entries.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center text-slate-500">
              <div className="text-lg font-semibold text-slate-900">{active.emptyTitle}</div>
              <div className="max-w-[320px] text-sm leading-6">{active.emptyDetail}</div>
              <div className="max-w-[320px] text-xs leading-6 text-slate-400">先完成一局正式结算后，这里会出现你的跨局记录。</div>
            </div>
          ) : (
            <div className="space-y-3">
              {active.entries.map((entry) => (
                <div
                  key={`${active.id}-${entry.ownerKey}-${entry.rank}`}
                  className={`rounded-[22px] border px-4 py-4 ${
                    entry.rank <= 3
                      ? 'border-[#F1DFC9] bg-[linear-gradient(180deg,rgba(255,247,237,0.92),rgba(255,255,255,1))]'
                      : 'border-black/[0.05] bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${
                        entry.rank === 1
                          ? 'bg-[#8B5A2B] text-white'
                          : entry.rank === 2
                            ? 'bg-slate-300 text-slate-800'
                            : entry.rank === 3
                              ? 'bg-[#D8A47F] text-white'
                              : 'bg-white text-slate-500'
                      }`}>
                        {entry.rank}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-[15px] font-semibold text-slate-900">{entry.playerName}</div>
                          {entry.badge && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                              {entry.badge}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] leading-5 text-slate-500">{buildEntryDetail(active.id, entry.valueLabel, entry.note)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[24px] font-bold tracking-tight text-slate-900">{entry.valueLabel}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  title,
  detail,
}: {
  label: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="seller-tablet px-4 py-4">
      <div className="seller-label">{label}</div>
      <div className="mt-2 text-[15px] font-semibold text-slate-900">{title}</div>
      <div className="seller-body mt-2 text-[12px]">{detail}</div>
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
