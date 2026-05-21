import type { ConversationReceipt } from '../core/world-state/conversation/models.js';
import type { CaseAgentMeshHarnessReport } from './agents/caseMeshHarness.js';

export interface SelfPlayMeshReadinessCounts {
  ready: number;
  needsReview: number;
  blocked: number;
  none: number;
}

export interface SelfPlayMeshStats {
  readonly conversationCount: number;
  readonly meshTurnCount: number;
  readonly readinessCounts: SelfPlayMeshReadinessCounts;
  readonly dominantReadiness: 'ready' | 'needs-review' | 'blocked' | 'none';
  readonly primaryRoleCounts: Readonly<Record<string, number>>;
  readonly dominantPrimaryRoleId: string | null;
  readonly executionOrderCounts: Readonly<Record<string, number>>;
  readonly dominantExecutionOrder: string | null;
  readonly shadowTurnCount: number;
  readonly supportWorldTurnCount: number;
  readonly latestSummary: string | null;
  readonly signals: readonly string[];
  readonly summary: string;
}

export interface SelfPlayMeshComparison {
  readonly comparable: boolean;
  readonly matched: boolean;
  readonly differences: readonly string[];
  readonly observedSummary: string;
  readonly referenceSummary: string;
}

export function buildSelfPlayMeshStats(receipts: readonly ConversationReceipt[] | undefined): SelfPlayMeshStats {
  const conversationCount = receipts?.length ?? 0;
  const readinessCounts = {
    ready: 0,
    needsReview: 0,
    blocked: 0,
    none: 0,
  };
  const primaryRoleCounts = new Map<string, number>();
  const executionOrderCounts = new Map<string, number>();
  let meshTurnCount = 0;
  let shadowTurnCount = 0;
  let supportWorldTurnCount = 0;
  let latestSummary: string | null = null;
  let latestSummaryIndex = -1;

  receipts?.forEach((receipt, index) => {
    const snapshot = receipt.traceSnapshot;
    if (!snapshot) {
      return;
    }

    const hasMeshEvidence =
      snapshot.meshReadiness != null ||
      snapshot.meshPrimaryRoleId != null ||
      (snapshot.meshSignals?.length ?? 0) > 0 ||
      Boolean(snapshot.meshSummary);

    if (!hasMeshEvidence) {
      return;
    }

    meshTurnCount += 1;

    const readiness = snapshot.meshReadiness ?? 'none';
    readinessCounts[readinessKey(readiness)] += 1;

    if (snapshot.meshPrimaryRoleId) {
      bumpCounter(primaryRoleCounts, snapshot.meshPrimaryRoleId);
    }

    const executionOrder = resolveExecutionOrder(snapshot.meshSignals);
    if (executionOrder) {
      bumpCounter(executionOrderCounts, executionOrder);
    }

    if ((snapshot.meshSignals || []).includes('has_shadow_role')) {
      shadowTurnCount += 1;
    }
    if ((snapshot.meshSignals || []).includes('supports_world')) {
      supportWorldTurnCount += 1;
    }

    if (snapshot.meshSummary && index >= latestSummaryIndex) {
      latestSummary = snapshot.meshSummary;
      latestSummaryIndex = index;
    }
  });

  const primaryRoleCountsObject = toSortedRecord(primaryRoleCounts);
  const executionOrderCountsObject = toSortedRecord(executionOrderCounts);
  const dominantReadiness = resolveDominantReadiness(readinessCounts);
  const dominantPrimaryRoleId = resolveDominantKey(primaryRoleCountsObject);
  const dominantExecutionOrder = resolveDominantKey(executionOrderCountsObject);
  const signals = buildSignals({
    conversationCount,
    meshTurnCount,
    readinessCounts,
    dominantReadiness,
    dominantPrimaryRoleId,
    dominantExecutionOrder,
    shadowTurnCount,
    supportWorldTurnCount,
  });

  return Object.freeze({
    conversationCount,
    meshTurnCount,
    readinessCounts: Object.freeze({ ...readinessCounts }),
    dominantReadiness,
    primaryRoleCounts: Object.freeze({ ...primaryRoleCountsObject }),
    dominantPrimaryRoleId,
    executionOrderCounts: Object.freeze({ ...executionOrderCountsObject }),
    dominantExecutionOrder,
    shadowTurnCount,
    supportWorldTurnCount,
    latestSummary,
    signals: Object.freeze(signals),
    summary: buildSummary({
      conversationCount,
      meshTurnCount,
      readinessCounts,
      dominantReadiness,
      primaryRoleCounts: primaryRoleCountsObject,
      dominantPrimaryRoleId,
      executionOrderCounts: executionOrderCountsObject,
      dominantExecutionOrder,
      shadowTurnCount,
      supportWorldTurnCount,
      latestSummary,
    }),
  });
}

export function compareSelfPlayMeshStatsToHarness(
  observed: SelfPlayMeshStats,
  reference: CaseAgentMeshHarnessReport | null | undefined,
): SelfPlayMeshComparison | null {
  if (!reference) {
    return null;
  }

  const referencePrimary = reference.roleSnapshots.find((role) => role.kind === 'primary')?.roleId || 'unknown';
  const referenceOrder = reference.executionOrder.join('>');
  const referenceHasShadow = reference.roleSnapshots.some((role) => role.kind === 'shadow');
  const observedOrder = observed.dominantExecutionOrder || 'unknown';
  const observedPrimary = observed.dominantPrimaryRoleId || 'unknown';
  const observedHasShadow = observed.shadowTurnCount > 0;
  const observedReadiness = observed.dominantReadiness;

  const differences: string[] = [];
  if (observedReadiness !== reference.readiness) {
    differences.push(`readiness:${reference.readiness}->${observedReadiness}`);
  }
  if (observedPrimary !== referencePrimary) {
    differences.push(`primary:${referencePrimary}->${observedPrimary}`);
  }
  if (observedOrder !== referenceOrder) {
    differences.push(`execution_order:${referenceOrder}->${observedOrder}`);
  }
  if (observedHasShadow !== referenceHasShadow) {
    differences.push(`shadow_role:${referenceHasShadow ? 'present' : 'missing'}->${observedHasShadow ? 'present' : 'missing'}`);
  }

  return {
    comparable: true,
    matched: differences.length === 0,
    differences: Object.freeze(differences),
    observedSummary: buildComparisonSummary({
      readiness: observedReadiness,
      primary: observedPrimary,
      executionOrder: observedOrder,
      shadow: observedHasShadow,
    }),
    referenceSummary: buildComparisonSummary({
      readiness: reference.readiness,
      primary: referencePrimary,
      executionOrder: referenceOrder,
      shadow: referenceHasShadow,
    }),
  };
}

function buildSignals(input: {
  conversationCount: number;
  meshTurnCount: number;
  readinessCounts: SelfPlayMeshReadinessCounts;
  dominantReadiness: SelfPlayMeshStats['dominantReadiness'];
  dominantPrimaryRoleId: string | null;
  dominantExecutionOrder: string | null;
  shadowTurnCount: number;
  supportWorldTurnCount: number;
}): string[] {
  const signals: string[] = [
    `mesh_turns:${input.meshTurnCount}/${input.conversationCount}`,
    `mesh_ready:${input.readinessCounts.ready}`,
    `mesh_needs_review:${input.readinessCounts.needsReview}`,
    `mesh_blocked:${input.readinessCounts.blocked}`,
    `mesh_none:${input.readinessCounts.none}`,
    `mesh_dominant_readiness:${input.dominantReadiness}`,
  ];
  if (input.dominantPrimaryRoleId) {
    signals.push(`mesh_primary:${input.dominantPrimaryRoleId}`);
  }
  if (input.dominantExecutionOrder) {
    signals.push(`mesh_order:${input.dominantExecutionOrder}`);
  }
  if (input.shadowTurnCount > 0) {
    signals.push(`mesh_shadow:${input.shadowTurnCount}`);
  }
  if (input.supportWorldTurnCount > 0) {
    signals.push(`mesh_world:${input.supportWorldTurnCount}`);
  }
  return signals;
}

function buildSummary(input: {
  conversationCount: number;
  meshTurnCount: number;
  readinessCounts: SelfPlayMeshReadinessCounts;
  dominantReadiness: SelfPlayMeshStats['dominantReadiness'];
  primaryRoleCounts: Record<string, number>;
  dominantPrimaryRoleId: string | null;
  executionOrderCounts: Record<string, number>;
  dominantExecutionOrder: string | null;
  shadowTurnCount: number;
  supportWorldTurnCount: number;
  latestSummary: string | null;
}): string {
  const readinessText = `ready=${input.readinessCounts.ready},review=${input.readinessCounts.needsReview},blocked=${input.readinessCounts.blocked},none=${input.readinessCounts.none}`;
  const primaryText = formatCounterMap(input.primaryRoleCounts);
  const orderText = formatCounterMap(input.executionOrderCounts);
  return [
    `mesh ${input.meshTurnCount}/${input.conversationCount}`,
    `dominant=${input.dominantReadiness}`,
    readinessText,
    `primary_dom=${input.dominantPrimaryRoleId || 'none'}`,
    `order_dom=${input.dominantExecutionOrder || 'none'}`,
    `primary=${primaryText || 'none'}`,
    `order=${orderText || 'none'}`,
    `shadow=${input.shadowTurnCount}`,
    `world=${input.supportWorldTurnCount}`,
    input.latestSummary ? `latest=${input.latestSummary}` : '',
  ].filter(Boolean).join(' | ');
}

function buildComparisonSummary(input: {
  readiness: SelfPlayMeshStats['dominantReadiness'];
  primary: string;
  executionOrder: string;
  shadow: boolean;
}): string {
  return `readiness=${input.readiness};primary=${input.primary};order=${input.executionOrder};shadow=${input.shadow ? 'yes' : 'no'}`;
}

function resolveExecutionOrder(signals: readonly string[] | undefined): string | null {
  const signal = signals?.find((entry) => entry.startsWith('execution_order:'));
  if (!signal) {
    return null;
  }
  return signal.slice('execution_order:'.length);
}

function readinessKey(value: SelfPlayMeshStats['dominantReadiness']): keyof SelfPlayMeshReadinessCounts {
  switch (value) {
    case 'ready':
      return 'ready';
    case 'needs-review':
      return 'needsReview';
    case 'blocked':
      return 'blocked';
    case 'none':
      return 'none';
    default:
      return 'none';
  }
}

function resolveDominantReadiness(counts: SelfPlayMeshReadinessCounts): SelfPlayMeshStats['dominantReadiness'] {
  const ranked: Array<[SelfPlayMeshStats['dominantReadiness'], number]> = [
    ['ready', counts.ready],
    ['needs-review', counts.needsReview],
    ['blocked', counts.blocked],
    ['none', counts.none],
  ];
  ranked.sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return readinessPriority(right[0]) - readinessPriority(left[0]);
  });
  return ranked[0][0];
}

function readinessPriority(value: SelfPlayMeshStats['dominantReadiness']): number {
  switch (value) {
    case 'ready':
      return 3;
    case 'needs-review':
      return 2;
    case 'blocked':
      return 1;
    case 'none':
      return 0;
    default:
      return 0;
  }
}

function resolveDominantKey(record: Record<string, number>): string | null {
  const entries = Object.entries(record);
  if (!entries.length) {
    return null;
  }
  entries.sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return left[0].localeCompare(right[0]);
  });
  return entries[0][0];
}

function bumpCounter(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1);
}

function toSortedRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    }),
  );
}

function formatCounterMap(record: Record<string, number>): string {
  return Object.entries(record)
    .map(([key, value]) => `${key}:${value}`)
    .join(',');
}
