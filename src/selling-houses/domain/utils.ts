import { GameState } from './models.js';

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export interface RandomSource {
  rngState: number;
  rngCalls: number;
}

export function wave(day: number, freq: number): number {
  return Math.sin(day / freq);
}

export function normalizeSeed(seed: number) {
  const normalized = Math.abs(Math.floor(seed)) >>> 0;
  return normalized || 1;
}

export function nextRandom(source: RandomSource): number {
  if (!source) {
    throw new Error('RandomSource is required for deterministic selling-houses simulation');
  }

  source.rngState = (source.rngState + 0x6d2b79f5) >>> 0;
  let t = source.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  source.rngCalls += 1;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(min: number, max: number, source: RandomSource): number {
  return Math.floor(nextRandom(source) * (max - min + 1)) + min;
}

export function randomFloat(min: number, max: number, source: RandomSource): number {
  return min + nextRandom(source) * (max - min);
}

export function chance(p: number, source: RandomSource): boolean {
  return nextRandom(source) < p;
}

export function pickRandom<T>(arr: T[], source: RandomSource): T {
  return arr[randomInt(0, arr.length - 1, source)];
}

export function pickWeighted<T extends { weight: number }>(items: T[], source: RandomSource): T {
  const totalWeight = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (totalWeight <= 0) {
    return items[0];
  }

  let cursor = nextRandom(source) * totalWeight;
  for (const item of items) {
    cursor -= Math.max(0, item.weight);
    if (cursor <= 0) {
      return item;
    }
  }

  return items[items.length - 1];
}

export function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function costText(action: any): string {
  const parts = [];
  if (action.costEnergy > 0) parts.push(`${action.costEnergy} 精力`);
  if (action.costPromotionBudget > 0) parts.push(`${action.costPromotionBudget} 点推广金`);
  return parts.join(' + ') || '免费';
}

export function caseSortValue(c: any): number {
  return (c.urgency * 1.5) + (c.heat) - (c.windowDays * 10);
}

export function getOpportunityPriority(o: any): number {
  return (o.intent * 1.2) + (o.confidence);
}

export function intersections(arr1: any[], arr2: any[]): number {
  return arr1.filter(x => arr2.includes(x)).length;
}

export function getCaseById(world: GameState, id: string) {
  return world.cases.find(c => c.id === id);
}

export function getDayOfWeek(day: number): number {
  return ((day - 1) % 7) + 1;
}

export function getRoutine(day: number, routineConfig: any[]) {
  const dow = getDayOfWeek(day);
  return routineConfig.find(r => r.day === (dow === 7 ? 0 : dow)) || routineConfig[0];
}
