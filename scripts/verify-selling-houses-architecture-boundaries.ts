import { spawnSync } from 'node:child_process';

interface ContractScript {
  name: string;
  path: string;
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
    name: 'action transaction contract',
    path: 'scripts/verify-selling-houses-action-transaction-contract.ts',
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
    name: 'architecture parity contract',
    path: 'scripts/verify-selling-houses-architecture-parity-contract.ts',
  },
];

const startedAt = Date.now();

console.log('[architecture-boundaries] Selling-houses architecture boundary verification started');

for (const script of contractScripts) {
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
