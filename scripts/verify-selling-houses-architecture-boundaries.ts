import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

interface ContractScript {
  name: string;
  path: string;
  optional?: boolean;
}

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

const startedAt = Date.now();

console.log('[architecture-boundaries] Selling-houses architecture boundary verification started');

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
