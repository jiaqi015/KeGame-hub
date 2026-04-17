import { GameState } from './models';

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function wave(day: number, freq: number): number {
  return Math.sin(day / freq);
}

export function chance(p: number): boolean {
  return Math.random() < p;
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
  if (action.costCash > 0) parts.push(`${action.costCash} W 预算`);
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
