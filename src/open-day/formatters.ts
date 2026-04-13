/**
 * Shared formatting utilities for the Open Day workspace.
 * Single source of truth — all components import from here.
 */

export function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '--';
  return Number(value).toFixed(digits);
}

export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
