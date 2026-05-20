import type {
  AgentMemoryFact,
  AgentMemoryStore,
} from './models.js';
import { AGENT_CHANNELS, type AgentChannel } from './models.js';

export interface AgentMemoryQuery {
  readonly agentId?: string;
  readonly conversationKey?: string;
  readonly caseId?: string;
  readonly opportunityId?: string;
  readonly channel?: AgentChannel;
  readonly day?: number;
  readonly kinds?: readonly string[];
  readonly limit?: number;
}

const DEFAULT_MEMORY_LIMIT = 8;
const MAX_STORE_FACTS = 240;

export function createEmptyAgentMemoryStore(): AgentMemoryStore {
  return { facts: [] };
}

export function normalizeAgentMemoryStore(input: unknown): AgentMemoryStore {
  const facts = isRecord(input) && Array.isArray(input.facts)
    ? normalizeAgentMemoryFacts(input.facts)
    : [];
  return compactAgentMemoryStore({ facts });
}

export function normalizeAgentMemoryFacts(input: unknown): AgentMemoryFact[] {
  return Array.isArray(input)
    ? input.map(normalizeAgentMemoryFact).filter((fact): fact is AgentMemoryFact => Boolean(fact))
    : [];
}

export function selectAgentMemoryFacts(
  store: AgentMemoryStore | undefined,
  query: AgentMemoryQuery,
): AgentMemoryFact[] {
  const limit = Math.max(1, Math.min(query.limit || DEFAULT_MEMORY_LIMIT, 16));
  const kinds = query.kinds ? new Set(query.kinds) : null;
  const day = Number.isFinite(query.day) ? Number(query.day) : undefined;
  return [...(store?.facts || [])]
    .filter((fact) => {
      if (query.agentId && fact.agentId !== query.agentId) return false;
      if (kinds && !kinds.has(fact.kind)) return false;
      if (query.conversationKey && fact.scope?.conversationKey !== query.conversationKey) return false;
      // Intentional: facts without scope.caseId match any caseId query (cross-case memory sharing).
      // Facts with an explicit caseId are filtered strictly.
      if (query.caseId && fact.scope?.caseId && fact.scope.caseId !== query.caseId) return false;
      // Same cross-entity sharing pattern for opportunityId.
      if (query.opportunityId && fact.scope?.opportunityId && fact.scope.opportunityId !== query.opportunityId) return false;
      if (query.channel && fact.scope?.channel && fact.scope.channel !== query.channel) return false;
      if (typeof day === 'number' && typeof fact.expiresAtDay === 'number' && fact.expiresAtDay < day) return false;
      return true;
    })
    .sort(compareMemoryFacts)
    .slice(0, limit);
}

export function mergeAgentMemoryFacts(
  store: AgentMemoryStore | undefined,
  facts: readonly AgentMemoryFact[],
): AgentMemoryStore {
  const byId = new Map<string, AgentMemoryFact>();
  (store?.facts || []).forEach((fact) => {
    byId.set(fact.factId, fact);
  });
  facts.forEach((fact) => {
    const existing = byId.get(fact.factId);
    byId.set(fact.factId, existing ? mergeFact(existing, fact) : normalizeFactStrength(fact));
  });
  return compactAgentMemoryStore({ facts: [...byId.values()] });
}

function compactAgentMemoryStore(store: AgentMemoryStore): AgentMemoryStore {
  return {
    facts: [...store.facts]
      .sort(compareMemoryFacts)
      .slice(0, MAX_STORE_FACTS),
  };
}

function compareMemoryFacts(left: AgentMemoryFact, right: AgentMemoryFact) {
  const leftDay = left.updatedAtDay ?? left.createdAtDay ?? 0;
  const rightDay = right.updatedAtDay ?? right.createdAtDay ?? 0;
  if (leftDay !== rightDay) return rightDay - leftDay;
  if (left.strength !== right.strength) return right.strength - left.strength;
  return left.factId.localeCompare(right.factId);
}

function mergeFact(existing: AgentMemoryFact, incoming: AgentMemoryFact): AgentMemoryFact {
  // Explicit field listing prevents accidental overwrites when multiple sources
  // write to the same factId concurrently.
  return {
    factId: incoming.factId,
    agentId: incoming.agentId,
    kind: incoming.kind,
    summary: incoming.summary,
    strength: Math.max(existing.strength, incoming.strength),
    createdAtDay: existing.createdAtDay ?? incoming.createdAtDay,
    updatedAtDay: Math.max(existing.updatedAtDay ?? existing.createdAtDay ?? 0, incoming.updatedAtDay ?? incoming.createdAtDay ?? 0) || undefined,
    scope: {
      ...existing.scope,
      ...incoming.scope,
    },
    sourceRef: incoming.sourceRef || existing.sourceRef,
    expiresAtDay: incoming.expiresAtDay ?? existing.expiresAtDay,
  };
}

function normalizeAgentMemoryFact(input: unknown): AgentMemoryFact | null {
  if (!isRecord(input)) return null;
  const factId = normalizeString(input.factId, 180);
  const agentId = normalizeString(input.agentId, 120);
  const kind = normalizeString(input.kind, 80);
  const summary = normalizeString(input.summary, 220);
  if (!factId || !agentId || !kind || !summary) return null;
  return normalizeFactStrength({
    factId,
    agentId,
    kind,
    summary,
    strength: normalizeNumber(input.strength, 0.5),
    scope: normalizeScope(input.scope),
    createdAtDay: normalizeOptionalNumber(input.createdAtDay),
    updatedAtDay: normalizeOptionalNumber(input.updatedAtDay),
    expiresAtDay: normalizeOptionalNumber(input.expiresAtDay),
    sourceRef: normalizeSourceRef(input.sourceRef),
  });
}

function normalizeFactStrength(fact: AgentMemoryFact): AgentMemoryFact {
  return {
    ...fact,
    strength: Math.max(0, Math.min(1, Number.isFinite(fact.strength) ? fact.strength : 0.5)),
  };
}

function normalizeScope(input: unknown): AgentMemoryFact['scope'] {
  if (!isRecord(input)) return undefined;
  const scope = {
    conversationKey: normalizeString(input.conversationKey, 160) || undefined,
    caseId: normalizeString(input.caseId, 120) || undefined,
    opportunityId: normalizeString(input.opportunityId, 120) || undefined,
    channel: normalizeChannel(input.channel),
  };
  return Object.values(scope).some(Boolean) ? scope : undefined;
}

function normalizeSourceRef(input: unknown): AgentMemoryFact['sourceRef'] {
  if (!isRecord(input)) return undefined;
  const refType = normalizeString(input.refType, 80);
  const refId = normalizeString(input.refId, 180);
  return refType && refId ? { refType, refId } : undefined;
}

function normalizeChannel(value: unknown): AgentChannel | undefined {
  return AGENT_CHANNELS.includes(value as AgentChannel) ? value as AgentChannel : undefined;
}

function normalizeString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

function normalizeNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeOptionalNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
