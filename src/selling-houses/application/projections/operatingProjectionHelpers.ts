import type { Tone } from '../../domain/models.js';

export function averageValue(values: number[]) {
  const filtered = values.filter(Number.isFinite);
  if (filtered.length === 0) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

export function mapTone(tone: Tone): 'neutral' | 'chance' | 'risk' {
  if (tone === 'danger') return 'risk';
  if (tone === 'success') return 'chance';
  return 'neutral';
}

export function trimTitle(message: string) {
  const first = message.split('，')[0] || message;
  return first.length > 24 ? `${first.slice(0, 24)}...` : first;
}
