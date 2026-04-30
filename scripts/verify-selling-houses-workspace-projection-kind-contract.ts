import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import type { WorkspaceProjectionKind } from '../src/selling-houses/interface/interaction-workspace/types.js';

const workspaceTypesPath = 'src/selling-houses/interface/interaction-workspace/types.ts';
const workspaceIndexPath = 'src/selling-houses/interface/interaction-workspace/index.ts';
const interactionWorkspacePath = 'src/selling-houses/interface/interaction-workspace';

const boundaryContracts = [
  {
    name: 'workspace view projection',
    path: `${interactionWorkspacePath}/workspaceAdapters.ts`,
    kind: 'workspace_view',
  },
  {
    name: 'workspace POV projection',
    path: `${interactionWorkspacePath}/workspaceAdapters.ts`,
    kind: 'pov_adapter_state',
  },
  {
    name: 'today plan workspace projection',
    path: `${interactionWorkspacePath}/todayPlanBoundary.ts`,
    kind: 'today_plan_adapter_state',
  },
  {
    name: 'matter workspace projection',
    path: `${interactionWorkspacePath}/matterBoundary.ts`,
    kind: 'matter_adapter_state',
  },
  {
    name: 'decision support workspace projection',
    path: `${interactionWorkspacePath}/decisionSupportBoundary.ts`,
    kind: 'decision_support_adapter_state',
  },
  {
    name: 'opportunity relation workspace projection',
    path: `${interactionWorkspacePath}/opportunityRelationBoundary.ts`,
    kind: 'opportunity_relation_adapter_state',
  },
  {
    name: 'process workspace projection',
    path: `${interactionWorkspacePath}/processWorkspaceBoundary.ts`,
    kind: 'process_workspace_projection',
  },
  {
    name: 'process result workspace projection',
    path: `${interactionWorkspacePath}/processResultBoundary.ts`,
    kind: 'process_result_adapter_state',
  },
  {
    name: 'daily tick receipt workspace projection',
    path: `${interactionWorkspacePath}/dailyTickReceiptBoundary.ts`,
    kind: 'daily_tick_receipt_adapter_state',
  },
  {
    name: 'event stream workspace projection',
    path: `${interactionWorkspacePath}/eventStreamBoundary.ts`,
    kind: 'event_stream_adapter_state',
  },
  {
    name: 'world fork workspace projection',
    path: `${interactionWorkspacePath}/worldForkBoundary.ts`,
    kind: 'world_fork_adapter_state',
  },
] as const;

const expectedWorkspaceProjectionKinds = [
  'workspace_view',
  'pov_adapter_state',
  'today_plan_adapter_state',
  'matter_adapter_state',
  'decision_support_adapter_state',
  'opportunity_relation_adapter_state',
  'process_workspace_projection',
  'process_result_adapter_state',
  'daily_tick_receipt_adapter_state',
  'event_stream_adapter_state',
  'world_fork_adapter_state',
] as const satisfies readonly WorkspaceProjectionKind[];

const workspaceBarrelExportContracts = [
  {
    name: 'workspace core types',
    moduleSpecifier: './types.js',
    typeExports: [
      'BrokerWorkspaceView',
      'ManagerWorkspaceView',
      'MatterProjectionState',
      'MatterWorkspaceItem',
      'MatterWorkspaceProjection',
      'OwnerWorkspaceView',
      'TodayPlanCapacityProjection',
      'TodayPlanWorkspaceItem',
      'TodayPlanWorkspaceProjection',
      'TodayPlanWorldTruthKind',
      'WorkspaceItemTone',
      'WorkspaceProjectionBoundaryKind',
      'WorkspacePovProjection',
      'WorkspaceProjectionKind',
      'WorkspaceProjectionMeta',
      'WorkspaceProjectionSource',
      'WorkspaceRole',
    ],
  },
  {
    name: 'workspace decision support boundary',
    moduleSpecifier: './decisionSupportBoundary.js',
    typeExports: [
      'DecisionSupportWorkspaceCaseProjection',
      'DecisionSupportWorkspaceDecisionMomentSummary',
      'DecisionSupportWorkspaceDecisionSupportSummary',
      'DecisionSupportWorkspaceDraftAggregate',
      'DecisionSupportWorkspaceProjection',
      'DecisionSupportWorkspaceProjectionKind',
      'DecisionSupportWorkspaceRecommendationDraftSummary',
      'DecisionSupportWorkspaceSignalAggregate',
      'DecisionSupportWorkspaceSignalSummary',
      'DecisionSupportWorkspaceSummary',
    ],
    valueExports: ['buildDecisionSupportWorkspaceProjection'],
  },
  {
    name: 'workspace opportunity relation boundary',
    moduleSpecifier: './opportunityRelationBoundary.js',
    typeExports: [
      'OpportunityRelationWorkspaceEntry',
      'OpportunityRelationWorkspaceProjection',
      'OpportunityRelationWorkspaceSummary',
    ],
    valueExports: ['buildOpportunityRelationWorkspaceProjection'],
  },
  {
    name: 'workspace process boundary',
    moduleSpecifier: './processWorkspaceBoundary.js',
    typeExports: [
      'ProcessWorkspaceLifecycleMigrationPlan',
      'ProcessWorkspaceManagerContract',
      'ProcessWorkspaceProjection',
      'ProcessWorkspaceReadModel',
    ],
    valueExports: ['buildProcessWorkspaceProjection'],
  },
  {
    name: 'workspace process result boundary',
    moduleSpecifier: './processResultBoundary.js',
    typeExports: [
      'ProcessResultWorkspaceItem',
      'ProcessResultWorkspaceProjection',
    ],
    valueExports: ['buildProcessResultWorkspaceProjection'],
  },
  {
    name: 'workspace daily tick receipt boundary',
    moduleSpecifier: './dailyTickReceiptBoundary.js',
    typeExports: ['DailyTickReceiptWorkspaceProjection'],
    valueExports: ['buildDailyTickReceiptWorkspaceProjection'],
  },
  {
    name: 'workspace event stream boundary',
    moduleSpecifier: './eventStreamBoundary.js',
    typeExports: [
      'BuildEventStreamWorkspaceProjectionOptions',
      'EventStreamWorkspaceProjection',
    ],
    valueExports: ['buildEventStreamWorkspaceProjection'],
  },
  {
    name: 'workspace world fork boundary',
    moduleSpecifier: './worldForkBoundary.js',
    typeExports: [
      'BuildWorldForkWorkspaceProjectionOptions',
      'WorldForkWorkspaceProjection',
    ],
    valueExports: ['buildWorldForkWorkspaceProjection'],
  },
  {
    name: 'workspace matter boundary',
    moduleSpecifier: './matterBoundary.js',
    valueExports: ['buildMatterWorkspaceProjection'],
  },
  {
    name: 'workspace today plan boundary',
    moduleSpecifier: './todayPlanBoundary.js',
    valueExports: ['buildTodayPlanWorkspaceProjection'],
  },
  {
    name: 'workspace view adapters',
    moduleSpecifier: './workspaceAdapters.js',
    valueExports: [
      'buildBrokerWorkspaceView',
      'buildManagerWorkspaceView',
      'buildOwnerWorkspaceView',
    ],
  },
] as const;

const uiImportPattern = /\bfrom\s+['"][^'"]*(?:components|features|pages|ui|react|lucide-react)[^'"]*['"]/;
const workspaceTypesSource = readFileSync(workspaceTypesPath, 'utf8');
const workspaceIndexSource = readFileSync(workspaceIndexPath, 'utf8');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function extractNamedBarrelExports(
  source: string,
  moduleSpecifier: string,
  exportKind: 'type' | 'value',
): Set<string> {
  const exportPrefix = exportKind === 'type' ? 'export\\s+type\\s+' : 'export\\s+';
  const pattern = new RegExp(
    `${exportPrefix}\\{(?<body>[^}]*)\\}\\s+from\\s+['"]${escapeRegExp(moduleSpecifier)}['"];`,
    'g',
  );
  const exports = new Set<string>();

  for (const match of source.matchAll(pattern)) {
    const body = stripComments(match.groups?.body ?? '');
    body.split(',').forEach((entry) => {
      const name = entry.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) {
        exports.add(name);
      }
    });
  }

  return exports;
}

function assertWorkspaceBarrelExports(
  moduleSpecifier: string,
  exportKind: 'type' | 'value',
  expectedExports: readonly string[] = [],
) {
  const actualExports = extractNamedBarrelExports(workspaceIndexSource, moduleSpecifier, exportKind);

  for (const expectedExport of expectedExports) {
    assert.ok(
      actualExports.has(expectedExport),
      `Expected interaction workspace barrel to export ${exportKind} ${expectedExport} from ${moduleSpecifier}`,
    );
  }
}

function extractWorkspaceProjectionKinds(source: string): WorkspaceProjectionKind[] {
  const match = source.match(/export type WorkspaceProjectionKind =(?<body>[\s\S]*?);/);
  assert.ok(match?.groups?.body, 'Expected WorkspaceProjectionKind union to be declared in workspace types');

  return [...match.groups.body.matchAll(/\|\s+'([^']+)'/g)].map((entry) => entry[1] as WorkspaceProjectionKind);
}

assert.ok(
  !uiImportPattern.test(workspaceTypesSource),
  'Expected interaction workspace types boundary not to import UI components',
);
assert.ok(
  !uiImportPattern.test(workspaceIndexSource),
  'Expected interaction workspace barrel not to import or re-export UI/features components',
);

for (const contract of workspaceBarrelExportContracts) {
  const typeExports = 'typeExports' in contract ? contract.typeExports : [];
  const valueExports = 'valueExports' in contract ? contract.valueExports : [];

  assertWorkspaceBarrelExports(contract.moduleSpecifier, 'type', typeExports);
  assertWorkspaceBarrelExports(contract.moduleSpecifier, 'value', valueExports);
}

for (const contract of boundaryContracts) {
  assert.ok(
    workspaceTypesSource.includes(`| '${contract.kind}'`),
    `Expected WorkspaceProjectionKind to include '${contract.kind}'`,
  );

  assert.ok(existsSync(contract.path), `Expected ${contract.name} boundary file to exist at ${contract.path}`);
  const boundarySource = readFileSync(contract.path, 'utf8');
  const projectionKindLiteral = `projectionKind: '${contract.kind}'`;

  assert.ok(
    !uiImportPattern.test(boundarySource),
    `Expected ${contract.name} boundary not to import UI components`,
  );
  assert.ok(
    boundarySource.includes(projectionKindLiteral),
    `Expected ${contract.name} boundary to expose ${projectionKindLiteral}`,
  );
}

assert.deepEqual(
  expectedWorkspaceProjectionKinds,
  extractWorkspaceProjectionKinds(workspaceTypesSource),
  'Expected WorkspaceProjectionKind union in types.ts to exactly match the workspace projection contract list',
);

assert.deepEqual(
  extractWorkspaceProjectionKinds(workspaceTypesSource),
  boundaryContracts.map((contract) => contract.kind),
  'Expected workspace projection kinds in types.ts to mirror boundary contracts in the same order',
);

console.log('selling-houses workspace projection kind contract verification passed');
