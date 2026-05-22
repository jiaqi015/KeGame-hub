import type { Tone } from './caseNarrativeTypes.js';

export const DOMAIN_EVENT_KINDS = [
  'journal',
  'action_executed',
  'budget_changed',
  'opportunity_advanced',
  'opportunity_closed',
  'case_sold',
  'case_withdrawn',
  'case_lost_to_rival',
  'window_extended',
  'market_event',
  'decision_moment_triggered',
  'business_flow_step_advanced',
] as const;
export type DomainEventKind = (typeof DOMAIN_EVENT_KINDS)[number];

export interface DomainEventEntry {
  id: string;
  day: number;
  date: string;
  kind: DomainEventKind;
  actor: string;
  title: string;
  detail: string;
  tone: Tone;
  caseId?: string;
  opportunityId?: string;
  customerId?: string;
  payload: Record<string, unknown>;
}

const DOMAIN_EVENT_KIND_SET: ReadonlySet<string> = new Set(DOMAIN_EVENT_KINDS);
export function isDomainEventKind(value: unknown): value is DomainEventKind {
  return typeof value === 'string' && DOMAIN_EVENT_KIND_SET.has(value);
}
