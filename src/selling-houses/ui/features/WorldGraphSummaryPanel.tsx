/**
 * WorldGraphSummaryPanel — "大世界态势" compact world-state entry.
 *
 * Shows player-visible summary of the WorldGraph:
 *   - Top-level counts: market cells, listings, rival listings, active customers
 *   - Per-market-cell: name, heat, supply/demand balance, coSalePressure vs rivalPressure
 *
 * Architecture:
 *   - Only receives PlayerVisibleWorldGraph (shadow_listing counts already filtered)
 *   - Does NOT import from domain/ or core/
 *   - Pure presentational component
 */

import React from 'react';
import { TrendingUp, Shield, Users, Home, Flame } from 'lucide-react';
import type { WorldGraphSummary, MarketCellGraphSummary } from '../../domain/world-model/runtime/types';

interface WorldGraphSummaryPanelProps {
  worldGraphSummary: WorldGraphSummary | null;
  onOpenMarket?: (layer?: 'macro' | 'district') => void;
}

function heatColor(heat: number): string {
  if (heat >= 70) return 'text-[var(--seller-chance)]';
  if (heat >= 40) return 'text-[var(--seller-accent)]';
  return 'text-[var(--seller-muted)]';
}

function pressureTone(value: number): string {
  if (value >= 60) return 'text-[var(--seller-risk)]';
  if (value >= 30) return 'text-[var(--seller-accent)]';
  return 'text-[var(--seller-chance)]';
}

function pressureBarWidth(value: number): string {
  return `${Math.min(100, Math.max(4, value))}%`;
}

const MarketCellRow = React.memo(function MarketCellRow({ cell }: { cell: MarketCellGraphSummary }) {
  const supplyDemandBalance = cell.supplyPressure - cell.activeCustomerCount * 10;

  return (
    <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[12px] font-semibold text-[var(--seller-ink)]">{cell.cellName}</span>
            <HeatBadge heat={cell.heat} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--seller-subtle)]">
            <span>我的 {cell.listingCount} 套</span>
            <span>竞品 {cell.rivalListingCount} 套</span>
            <span>客户 {cell.activeCustomerCount}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <PressureMiniBar label="竞对" value={cell.rivalPressure} />
          <PressureMiniBar label="内部" value={cell.internalPressure} />
          <PressureMiniBar label="联动" value={cell.coSalePressure} />
        </div>
      </div>
    </div>
  );
});

function HeatBadge({ heat }: { heat: number }) {
  let tone: string;
  let label: string;
  if (heat >= 70) {
    tone = 'bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]';
    label = '热';
  } else if (heat >= 40) {
    tone = 'bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]';
    label = '温';
  } else {
    tone = 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-muted)]';
    label = '冷';
  }

  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tone}`}>
      {label}
    </span>
  );
}

function PressureMiniBar({ label, value }: { label: string; value: number }) {
  const barColor = value >= 60
    ? 'bg-[var(--seller-risk)]'
    : value >= 30
      ? 'bg-[var(--seller-accent)]'
      : 'bg-[var(--seller-chance)]';

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-[var(--seller-subtle)]">{label}</span>
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: pressureBarWidth(value) }} />
      </div>
      <span className={`text-[9px] font-bold ${pressureTone(value)}`}>{value}</span>
    </div>
  );
}

function CountTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] bg-[rgba(255,255,255,0.04)] px-2.5 py-2">
      <div className="text-[var(--seller-subtle)]">{icon}</div>
      <div>
        <div className="text-[10px] text-[var(--seller-subtle)]">{label}</div>
        <div className="text-[13px] font-bold text-[var(--seller-ink)]">{value}</div>
      </div>
    </div>
  );
}

export function WorldGraphSummaryPanel({ worldGraphSummary }: WorldGraphSummaryPanelProps) {
  if (!worldGraphSummary) return null;
  const summary = worldGraphSummary;
  const sortedCells = [...summary.marketCellSummaries].sort(
    (a, b) => b.heat - a.heat,
  );

  return (
    <section className="seller-panel overflow-hidden">
      <div className="px-4 py-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <CountTile
            icon={<TrendingUp size={14} />}
            label="板块"
            value={summary.marketCellCount}
          />
          <CountTile
            icon={<Home size={14} />}
            label="我的房源"
            value={summary.listingCount}
          />
          <CountTile
            icon={<Shield size={14} />}
            label="竞品房源"
            value={summary.rivalListingCount}
          />
          <CountTile
            icon={<Users size={14} />}
            label="活跃客户"
            value={summary.customerCount}
          />
        </div>
      </div>

      <div className="border-t border-[var(--seller-border)] px-4 py-2.5">
        <div className="mb-2 flex items-center gap-1.5">
          <Flame size={12} className="text-[var(--seller-accent)]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">
            板块态势
          </span>
        </div>
        <div className="space-y-2">
          {sortedCells.map((cell) => (
            <MarketCellRow key={cell.cellId} cell={cell} />
          ))}
          {sortedCells.length === 0 && (
            <p className="py-3 text-center text-[11px] text-[var(--seller-muted)]">
              暂无板块数据
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
