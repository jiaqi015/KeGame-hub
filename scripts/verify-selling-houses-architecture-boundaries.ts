import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

interface ContractScript {
  name: string;
  path: string;
  optional?: boolean;
}

interface BarrelExportContract {
  name: string;
  path: string;
  starExports?: readonly string[];
  namedTypeExports?: Readonly<Record<string, readonly string[]>>;
  namedValueExports?: Readonly<Record<string, readonly string[]>>;
}

const runtimeBarrelExportContracts: BarrelExportContract[] = [
  {
    name: 'runtime simulation barrel',
    path: 'src/selling-houses/runtime/simulation/index.ts',
    starExports: [
      './action-boundary-report.js',
      './action-migration-plan.js',
      './action-split-plan.js',
      './dailyProcessResult.js',
      './dailyTickReceipt.js',
      './eventStreamReceipt.js',
    ],
  },
  {
    name: 'runtime decision-support barrel',
    path: 'src/selling-houses/runtime/decision-support/index.ts',
    namedTypeExports: {
      './types.js': [
        'CaseDecisionSupportContext',
        'DecisionSupportActionSpec',
        'DecisionSupportContext',
        'DecisionSupportContextSource',
        'DecisionSupportDecisionMoment',
        'DecisionSupportRecommendationDraft',
        'DecisionSupportSignal',
        'DecisionSupportSignalKind',
        'DecisionSupportSignalSeverity',
      ],
      './evaluation-boundary-report.js': [
        'DecisionSupportEvaluationBoundaryReadiness',
        'DecisionSupportEvaluationBoundaryReport',
      ],
      './worldFork.js': [
        'CreateCounterfactualWorldForkOptions',
        'WorldForkDraft',
        'WorldForkReceipt',
      ],
    },
    namedValueExports: {
      './evaluation-boundary-report.js': ['buildDecisionSupportEvaluationBoundaryReport'],
      './legacyAdapter.js': ['buildDecisionSupportContextFromLegacyState'],
      './worldFork.js': ['createCounterfactualWorldFork'],
    },
  },
];

const contractScripts: ContractScript[] = [
  {
    name: 'architecture smoke export contract',
    path: 'scripts/verify-selling-houses-architecture-contract.ts',
  },
  {
    name: 'layer import contract',
    path: 'scripts/verify-selling-houses-layer-imports.ts',
  },
  {
    name: 'world model contract',
    path: 'scripts/verify-selling-houses-world-model-contract.ts',
  },
  {
    name: 'legacy Case field ownership contract',
    path: 'scripts/verify-selling-houses-case-field-ownership-contract.ts',
  },
  {
    name: 'action transaction contract',
    path: 'scripts/verify-selling-houses-action-transaction-contract.ts',
  },
  {
    name: 'action executor boundary contract',
    path: 'scripts/verify-selling-houses-action-executor-boundary-contract.ts',
  },
  {
    name: 'decision support contract',
    path: 'scripts/verify-selling-houses-decision-support-contract.ts',
  },
  {
    name: 'opportunity relation contract',
    path: 'scripts/verify-selling-houses-opportunity-relation-contract.ts',
  },
  {
    name: 'process boundary contract',
    path: 'scripts/verify-selling-houses-process-boundary-contract.ts',
  },
  {
    name: 'score separation contract',
    path: 'scripts/verify-selling-houses-score-separation-contract.ts',
  },
  {
    name: 'workspace decision support contract',
    path: 'scripts/verify-selling-houses-workspace-decision-support-contract.ts',
  },
  {
    name: 'workspace opportunity relation contract',
    path: 'scripts/verify-selling-houses-workspace-opportunity-relation-contract.ts',
  },
  {
    name: 'workspace process contract',
    path: 'scripts/verify-selling-houses-workspace-process-contract.ts',
  },
  {
    name: 'workspace projection kind contract',
    path: 'scripts/verify-selling-houses-workspace-projection-kind-contract.ts',
  },
  {
    name: 'daily process results contract',
    path: 'scripts/verify-selling-houses-daily-process-results-contract.ts',
  },
  {
    name: 'process result ownership contract',
    path: 'scripts/verify-selling-houses-process-result-ownership-contract.ts',
  },
  {
    name: 'process results projection contract',
    path: 'scripts/verify-selling-houses-process-results-projection-contract.ts',
  },
  {
    name: 'process results persistence contract',
    path: 'scripts/verify-selling-houses-process-results-persistence-contract.ts',
  },
  {
    name: 'daily tick receipt contract',
    path: 'scripts/verify-selling-houses-daily-tick-receipt-contract.ts',
  },
  {
    name: 'workspace daily tick receipt contract',
    path: 'scripts/verify-selling-houses-workspace-daily-tick-receipt-contract.ts',
  },
  {
    name: 'event stream receipt contract',
    path: 'scripts/verify-selling-houses-event-stream-receipt-contract.ts',
  },
  {
    name: 'workspace event stream contract',
    path: 'scripts/verify-selling-houses-workspace-event-stream-contract.ts',
  },
  {
    name: 'world fork contract',
    path: 'scripts/verify-selling-houses-world-fork-contract.ts',
  },
  {
    name: 'workspace world fork contract',
    path: 'scripts/verify-selling-houses-workspace-world-fork-contract.ts',
  },
  {
    name: 'process lifecycle migration plan contract',
    path: 'scripts/verify-selling-houses-process-lifecycle-migration-plan-contract.ts',
    optional: true,
  },
  {
    name: 'product run process manager contract',
    path: 'scripts/verify-selling-houses-product-run-process-manager-contract.ts',
    optional: true,
  },
  {
    name: 'architecture parity contract',
    path: 'scripts/verify-selling-houses-architecture-parity-contract.ts',
  },
  {
    name: 'architecture migration readiness contract',
    path: 'scripts/verify-selling-houses-architecture-migration-readiness-contract.ts',
  },
  {
    name: 'case segments contract',
    path: 'scripts/verify-selling-houses-case-segments-contract.ts',
    optional: true,
  },
  {
    name: 'legacy Case owned read models contract',
    path: 'scripts/verify-selling-houses-case-owned-read-models-contract.ts',
    optional: true,
  },
  {
    name: 'legacy Case migration plan contract',
    path: 'scripts/verify-selling-houses-case-migration-plan-contract.ts',
    optional: true,
  },
  {
    name: 'evaluation model boundaries contract',
    path: 'scripts/verify-selling-houses-evaluation-model-boundaries-contract.ts',
    optional: true,
  },
  {
    name: 'evaluation boundary guards contract',
    path: 'scripts/verify-selling-houses-evaluation-boundary-guards-contract.ts',
    optional: true,
  },
  {
    name: 'decision-support evaluation boundary report contract',
    path: 'scripts/verify-selling-houses-decision-support-evaluation-boundary-report-contract.ts',
    optional: true,
  },
  {
    name: 'action boundary report contract',
    path: 'scripts/verify-selling-houses-action-boundary-report-contract.ts',
    optional: true,
  },
  {
    name: 'action migration plan contract',
    path: 'scripts/verify-selling-houses-action-migration-plan-contract.ts',
    optional: true,
  },
  {
    name: 'action split plan contract',
    path: 'scripts/verify-selling-houses-action-split-plan-contract.ts',
    optional: true,
  },
  {
    name: 'owner action executor split contract',
    path: 'scripts/verify-selling-houses-owner-action-executor-split-contract.ts',
    optional: true,
  },
  {
    name: 'pricing action executor split contract',
    path: 'scripts/verify-selling-houses-pricing-action-executor-split-contract.ts',
    optional: true,
  },
  {
    name: 'marketing action executor split contract',
    path: 'scripts/verify-selling-houses-marketing-action-executor-split-contract.ts',
    optional: true,
  },
  {
    name: 'showing action executor split contract',
    path: 'scripts/verify-selling-houses-showing-action-executor-split-contract.ts',
    optional: true,
  },
  {
    name: 'open-day action executor split contract',
    path: 'scripts/verify-selling-houses-open-day-action-executor-split-contract.ts',
    optional: true,
  },
  {
    name: 'sincerity-sale action executor split contract',
    path: 'scripts/verify-selling-houses-sincerity-sale-action-executor-split-contract.ts',
    optional: true,
  },
  {
    name: 'negotiation action lifecycle contract',
    path: 'scripts/verify-selling-houses-negotiation-action-lifecycle-contract.ts',
    optional: true,
  },
  {
    name: 'negotiation process manager contract',
    path: 'scripts/verify-selling-houses-negotiation-process-manager-contract.ts',
    optional: true,
  },
  {
    name: 'negotiation action executor split contract',
    path: 'scripts/verify-selling-houses-negotiation-action-executor-split-contract.ts',
    optional: true,
  },
  {
    name: 'product run action lifecycle contract',
    path: 'scripts/verify-selling-houses-product-run-action-lifecycle-contract.ts',
    optional: true,
  },
  {
    name: 'residual legacy action executor contract',
    path: 'scripts/verify-selling-houses-residual-legacy-action-executor-contract.ts',
    optional: true,
  },
];

const requiredRuntimeReceiptContractPaths = [
  'scripts/verify-selling-houses-layer-imports.ts',
  'scripts/verify-selling-houses-workspace-projection-kind-contract.ts',
  'scripts/verify-selling-houses-daily-process-results-contract.ts',
  'scripts/verify-selling-houses-process-result-ownership-contract.ts',
  'scripts/verify-selling-houses-process-results-projection-contract.ts',
  'scripts/verify-selling-houses-process-results-persistence-contract.ts',
  'scripts/verify-selling-houses-daily-tick-receipt-contract.ts',
  'scripts/verify-selling-houses-workspace-daily-tick-receipt-contract.ts',
  'scripts/verify-selling-houses-event-stream-receipt-contract.ts',
  'scripts/verify-selling-houses-workspace-event-stream-contract.ts',
  'scripts/verify-selling-houses-world-fork-contract.ts',
  'scripts/verify-selling-houses-workspace-world-fork-contract.ts',
  'scripts/verify-selling-houses-architecture-parity-contract.ts',
  'scripts/verify-selling-houses-architecture-migration-readiness-contract.ts',
] as const;

for (const path of requiredRuntimeReceiptContractPaths) {
  const contract = contractScripts.find((entry) => entry.path === path);
  assert.ok(contract, `Expected architecture boundaries to include required runtime receipt contract ${path}`);
  assert.equal(
    contract.optional,
    undefined,
    `Expected architecture boundaries to run ${path} as a required contract`,
  );
}

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

function assertNamedBarrelExports(
  source: string,
  barrelName: string,
  moduleSpecifier: string,
  exportKind: 'type' | 'value',
  expectedExports: readonly string[],
) {
  const actualExports = extractNamedBarrelExports(source, moduleSpecifier, exportKind);

  for (const expectedExport of expectedExports) {
    assert.ok(
      actualExports.has(expectedExport),
      `Expected ${barrelName} to export ${exportKind} ${expectedExport} from ${moduleSpecifier}`,
    );
  }
}

function assertStarBarrelExports(
  source: string,
  barrelName: string,
  expectedExports: readonly string[],
) {
  for (const moduleSpecifier of expectedExports) {
    const pattern = new RegExp(`export\\s+\\*\\s+from\\s+['"]${escapeRegExp(moduleSpecifier)}['"];`);
    assert.ok(
      pattern.test(source),
      `Expected ${barrelName} to export * from ${moduleSpecifier}`,
    );
  }
}

function verifyRuntimeBarrelExports() {
  for (const contract of runtimeBarrelExportContracts) {
    assert.ok(existsSync(contract.path), `Expected ${contract.name} to exist at ${contract.path}`);

    const source = readFileSync(contract.path, 'utf8');

    assertStarBarrelExports(source, contract.name, contract.starExports ?? []);

    for (const [moduleSpecifier, expectedExports] of Object.entries(contract.namedTypeExports ?? {})) {
      assertNamedBarrelExports(source, contract.name, moduleSpecifier, 'type', expectedExports);
    }

    for (const [moduleSpecifier, expectedExports] of Object.entries(contract.namedValueExports ?? {})) {
      assertNamedBarrelExports(source, contract.name, moduleSpecifier, 'value', expectedExports);
    }
  }
}

const startedAt = Date.now();

console.log('[architecture-boundaries] Selling-houses architecture boundary verification started');

console.log('\n[architecture-boundaries] START runtime barrel export contract');
verifyRuntimeBarrelExports();
console.log('[architecture-boundaries] PASS  runtime barrel export contract');

for (const script of contractScripts) {
  if (script.optional && !existsSync(script.path)) {
    console.log(`\n[architecture-boundaries] SKIP  ${script.name} (${script.path} not present yet)`);
    continue;
  }

  console.log(`\n[architecture-boundaries] START ${script.name}`);
  console.log(`[architecture-boundaries] CMD   npx tsx ${script.path}`);

  const result = spawnSync('npx', ['tsx', script.path], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(`[architecture-boundaries] FAIL  ${script.path}`);
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[architecture-boundaries] FAIL  ${script.path} (exit ${result.status ?? 'null'})`);
    process.exit(1);
  }

  console.log(`[architecture-boundaries] PASS  ${script.name}`);
}

const durationMs = Date.now() - startedAt;

console.log(
  `\n[architecture-boundaries] Passed ${contractScripts.length} architecture boundary contracts in ${durationMs}ms`,
);

process.exit(0);
