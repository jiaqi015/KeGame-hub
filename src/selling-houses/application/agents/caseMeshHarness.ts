import type { CaseAgentMeshPlan } from './caseMesh.js';

export type CaseAgentMeshReadiness = 'ready' | 'needs-review' | 'blocked';

export interface CaseAgentMeshHarnessRoleSnapshot {
  readonly roleId: CaseAgentMeshPlan['roleCards'][number]['roleId'];
  readonly kind: CaseAgentMeshPlan['roleCards'][number]['kind'];
  readonly promptPresetId: CaseAgentMeshPlan['roleCards'][number]['promptPresetId'];
  readonly roleLabel: string;
  readonly promptLineCount: number;
  readonly supportRoleIds: readonly CaseAgentMeshPlan['roleCards'][number]['supportRoleIds'][number][];
  readonly objectiveSummary: string;
}

export interface CaseAgentMeshHarnessReport {
  readonly reportId: string;
  readonly meshId: string;
  readonly sceneId: string;
  readonly caseId: string;
  readonly day: number;
  readonly readiness: CaseAgentMeshReadiness;
  readonly executionOrder: readonly CaseAgentMeshPlan['executionOrder'][number][];
  readonly signals: readonly string[];
  readonly summary: string;
  readonly roleSnapshots: readonly CaseAgentMeshHarnessRoleSnapshot[];
}

export function buildCaseAgentMeshHarnessReport(plan: CaseAgentMeshPlan): CaseAgentMeshHarnessReport {
  const roleSnapshots = plan.roleCards.map((card) => ({
    roleId: card.roleId,
    kind: card.kind,
    promptPresetId: card.promptPresetId,
    roleLabel: card.roleLabel,
    promptLineCount: card.promptLines.length,
    supportRoleIds: card.supportRoleIds,
    objectiveSummary: card.objective.slice(0, 80),
  }));

  const signals = buildSignals(plan, roleSnapshots);
  const readiness = resolveReadiness(roleSnapshots);

  return Object.freeze({
    reportId: `case-mesh-harness:${plan.meshId}`,
    meshId: plan.meshId,
    sceneId: plan.sceneId,
    caseId: plan.caseId,
    day: plan.day,
    readiness,
    executionOrder: Object.freeze([...plan.executionOrder]),
    signals: Object.freeze(signals),
    summary: buildSummary(plan, readiness, signals, roleSnapshots),
    roleSnapshots: Object.freeze(roleSnapshots),
  });
}

function buildSignals(
  plan: CaseAgentMeshPlan,
  roleSnapshots: readonly CaseAgentMeshHarnessRoleSnapshot[],
): string[] {
  const signals: string[] = [];
  signals.push(`role_count:${roleSnapshots.length}`);
  signals.push(`primary:${plan.primaryRoleId}`);
  signals.push(`execution_order:${plan.executionOrder.join('>')}`);
  if (roleSnapshots.some((snapshot) => snapshot.kind === 'shadow')) {
    signals.push('has_shadow_role');
  }
  if (roleSnapshots.some((snapshot) => snapshot.roleId === 'world')) {
    signals.push('supports_world');
  }
  if (plan.sharedContextSummary.length >= 8) {
    signals.push('long_shared_context');
  }
  if (roleSnapshots.every((snapshot) => snapshot.promptLineCount > 0)) {
    signals.push('prompt_lines_ready');
  }
  return signals;
}

function resolveReadiness(roleSnapshots: readonly CaseAgentMeshHarnessRoleSnapshot[]): CaseAgentMeshReadiness {
  if (roleSnapshots.length === 0) return 'blocked';
  if (roleSnapshots.some((snapshot) => snapshot.promptLineCount === 0)) return 'needs-review';
  if (!roleSnapshots.some((snapshot) => snapshot.kind === 'primary')) return 'needs-review';
  return 'ready';
}

function buildSummary(
  plan: CaseAgentMeshPlan,
  readiness: CaseAgentMeshReadiness,
  signals: readonly string[],
  roleSnapshots: readonly CaseAgentMeshHarnessRoleSnapshot[],
): string {
  const primary = roleSnapshots.find((snapshot) => snapshot.kind === 'primary');
  const world = roleSnapshots.find((snapshot) => snapshot.roleId === 'world');
  return [
    `case ${plan.caseId} mesh ${readiness}`,
    `primary=${primary?.roleId || 'unknown'}`,
    `world=${world ? 'enabled' : 'missing'}`,
    `signals=${signals.join(',')}`,
  ].join(' | ');
}
