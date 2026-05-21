import type { AgentChannel, AgentExecutionMode } from '../../core/world-state/agents/models.js';
import type { CaseAgentContextPack } from '../../core/world-state/agents/caseContextPack.js';
import { buildCaseAgentCoordinatorPlan, resolveCaseAgentCoordinatorRoleId, type CaseAgentCoordinatorPlan, type CaseAgentCoordinatorRoleId } from './caseCoordinator.js';
import type { AgentPromptPresetId } from '../../core/world-state/agents/promptCatalog.js';
import type { ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';

export type CaseAgentMeshRoleKind = 'primary' | 'shadow' | 'support';

export interface CaseAgentMeshRoleCard {
  readonly roleId: CaseAgentCoordinatorRoleId;
  readonly kind: CaseAgentMeshRoleKind;
  readonly channel: AgentChannel;
  readonly mode: AgentExecutionMode;
  readonly promptPresetId: AgentPromptPresetId;
  readonly roleLabel: string;
  readonly objective: string;
  readonly supportRoleIds: readonly CaseAgentCoordinatorRoleId[];
  readonly promptLines: readonly string[];
}

export interface CaseAgentMeshPlan {
  readonly meshId: string;
  readonly coordinatorPlanId: string;
  readonly sceneId: string;
  readonly caseId: string;
  readonly day: number;
  readonly primaryRoleId: CaseAgentCoordinatorRoleId;
  readonly executionOrder: readonly CaseAgentCoordinatorRoleId[];
  readonly sharedContextSummary: readonly string[];
  readonly roleCards: readonly CaseAgentMeshRoleCard[];
}

export function buildCaseAgentMeshPlan(input: {
  readonly scene: ConversationSceneInputPack;
  readonly caseContextPack: CaseAgentContextPack;
  readonly primaryRoleId?: CaseAgentCoordinatorRoleId;
}): CaseAgentMeshPlan {
  const coordinatorPlan = buildCaseAgentCoordinatorPlan({
    scene: input.scene,
    caseContextPack: input.caseContextPack,
  });
  const primaryRoleId = input.primaryRoleId || resolveCaseAgentCoordinatorRoleId(input.scene.sceneType);
  const executionOrder = buildExecutionOrder(primaryRoleId);
  const roleCards = coordinatorPlan.rolePlans.map((rolePlan) => buildRoleCard(rolePlan, primaryRoleId));

  return Object.freeze({
    meshId: `case-mesh:${input.scene.sceneId}:${input.caseContextPack.caseIdentity.caseId}`,
    coordinatorPlanId: coordinatorPlan.planId,
    sceneId: input.scene.sceneId,
    caseId: input.caseContextPack.caseIdentity.caseId,
    day: input.scene.day,
    primaryRoleId,
    executionOrder: Object.freeze(executionOrder),
    sharedContextSummary: Object.freeze([
      ...coordinatorPlan.sharedContextLines,
      ...coordinatorPlan.sharedMemoryLines,
      ...coordinatorPlan.sharedBoundaryLines,
    ]),
    roleCards: Object.freeze(roleCards),
  });
}

export function buildCaseAgentMeshOverviewLines(plan: CaseAgentMeshPlan): readonly string[] {
  return [
    `Case Mesh：${plan.caseId} / ${plan.sceneId} / D${plan.day}`,
    `主角色：${plan.primaryRoleId}；执行顺序：${plan.executionOrder.join(' -> ')}`,
    `共享上下文：${plan.sharedContextSummary.join('；')}`,
    ...plan.roleCards.map((card) => `角色 ${card.roleId}(${card.kind})：${card.objective}`),
  ];
}

function buildRoleCard(
  rolePlan: CaseAgentCoordinatorPlan['rolePlans'][number],
  primaryRoleId: CaseAgentCoordinatorRoleId,
): CaseAgentMeshRoleCard {
  const kind: CaseAgentMeshRoleKind = rolePlan.roleId === primaryRoleId
    ? 'primary'
    : rolePlan.roleId === 'world'
      ? 'shadow'
      : 'support';
  const supportRoleIds = resolveSupportRoles(rolePlan.roleId);
  return Object.freeze({
    roleId: rolePlan.roleId,
    kind,
    channel: rolePlan.channel,
    mode: rolePlan.mode,
    promptPresetId: rolePlan.promptPresetId,
    roleLabel: rolePlan.roleLabel,
    objective: rolePlan.missionLines.join(' / '),
    supportRoleIds: Object.freeze([...supportRoleIds]),
    promptLines: rolePlan.promptLines,
  });
}

function buildExecutionOrder(primaryRoleId: CaseAgentCoordinatorRoleId): CaseAgentCoordinatorRoleId[] {
  const seed: CaseAgentCoordinatorRoleId[] = [
    primaryRoleId,
    'broker',
    'manager',
    'customer',
    'world',
  ];
  return [...new Set(seed)];
}

function resolveSupportRoles(roleId: CaseAgentCoordinatorRoleId): CaseAgentCoordinatorRoleId[] {
  if (roleId === 'world') return [];
  if (roleId === 'broker') return ['world'];
  if (roleId === 'manager') return ['broker', 'world'];
  return ['broker', 'world'];
}
