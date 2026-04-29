import type { GameState, MatterEntry, MatterLifecycleCategory } from '../../domain/models.js';
import { freezeProjection } from './readOnly.js';
import type { MatterProjectionState, MatterWorkspaceItem, MatterWorkspaceProjection, WorkspaceItemTone } from './types.js';

const LIFECYCLE_CATEGORIES: MatterLifecycleCategory[] = ['report', 'diagnose', 'execute', 'negotiate'];

function resolveProjectionState(stage: MatterEntry['stage']): MatterProjectionState {
  return stage === 'completed' || stage === 'abandoned' ? 'resolved' : 'open';
}

function resolveMatterTone(entry: MatterEntry): WorkspaceItemTone {
  if (entry.stage === 'completed') return 'chance';
  if (entry.stage === 'abandoned') return 'risk';
  if ((entry.urgency || 0) >= 82 || entry.lifecycleCategory === 'negotiate') return 'risk';
  return 'neutral';
}

function buildMatterWorkspaceItem(entry: MatterEntry): MatterWorkspaceItem {
  return {
    projectionKind: 'matter_adapter_state',
    domainMatterId: entry.id,
    domainSource: entry.source,
    domainSourceKey: entry.sourceKey,
    domainStage: entry.stage,
    projectionState: resolveProjectionState(entry.stage),
    caseId: entry.caseId,
    scene: entry.scene,
    lifecycleCategory: entry.lifecycleCategory,
    title: entry.title,
    detail: entry.detail,
    badge: entry.badge,
    template: entry.template,
    presentation: entry.presentation,
    kind: entry.kind,
    urgency: entry.urgency ?? 0,
    openedAtDay: entry.openedAtDay,
    updatedAtDay: entry.updatedAtDay,
    resolvedAtDay: entry.resolvedAtDay,
    resolutionSummary: entry.resolutionSummary,
    tone: resolveMatterTone(entry),
  };
}

export function buildMatterWorkspaceProjection(state: GameState): MatterWorkspaceProjection {
  const items = state.matters.map(buildMatterWorkspaceItem);
  const pendingItems = items.filter((entry) => entry.projectionState === 'open');
  const resolvedItems = items.filter((entry) => entry.projectionState === 'resolved');
  const byLifecycle = LIFECYCLE_CATEGORIES.reduce<Record<MatterLifecycleCategory, number>>((result, category) => {
    result[category] = pendingItems.filter((entry) => entry.lifecycleCategory === category).length;
    return result;
  }, {
    report: 0,
    diagnose: 0,
    execute: 0,
    negotiate: 0,
  });

  return freezeProjection({
    projectionKind: 'matter_adapter_state',
    day: state.day,
    pendingItems,
    resolvedItems,
    counts: {
      pending: pendingItems.length,
      resolved: resolvedItems.length,
      byLifecycle,
    },
  }) as MatterWorkspaceProjection;
}
