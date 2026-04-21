import { spawn } from 'node:child_process';

interface Step {
  label: string;
  command: string;
  args: string[];
}

const steps: Step[] = [
  {
    label: 'TypeScript lint',
    command: 'npm',
    args: ['run', 'lint'],
  },
  {
    label: 'Maintainer core verify',
    command: 'npm',
    args: ['run', 'verify:maintainer'],
  },
  {
    label: 'Maintainer identity verify',
    command: 'npm',
    args: ['run', 'verify:maintainer-identity'],
  },
  {
    label: 'Maintainer cloud resume verify',
    command: 'npm',
    args: ['run', 'verify:maintainer-cloud-resume'],
  },
  {
    label: 'Maintainer command contract verify',
    command: 'npm',
    args: ['run', 'verify:maintainer-command-contract'],
  },
  {
    label: 'Maintainer file repository verify',
    command: 'npm',
    args: ['run', 'verify:maintainer-file-repository'],
  },
  {
    label: 'Maintainer projection verify',
    command: 'npm',
    args: ['run', 'verify:maintainer-projections'],
  },
  {
    label: 'Maintainer shell contract verify',
    command: 'npm',
    args: ['run', 'verify:maintainer-shell'],
  },
  {
    label: 'Maintainer scoring contract verify',
    command: 'npm',
    args: ['run', 'verify:maintainer-scoring'],
  },
  {
    label: 'Generated maintainer verify',
    command: 'npm',
    args: ['run', 'verify:generated-maintainer'],
  },
  {
    label: 'Open-day auth contract verify',
    command: 'npm',
    args: ['run', 'verify:open-day-auth'],
  },
  {
    label: 'SMTP safety check (dry-run)',
    command: 'npx',
    args: ['tsx', 'scripts/send-smtp-test.ts'],
  },
];

async function runStep(step: Step) {
  const commandLabel = [step.command, ...step.args].join(' ');
  console.log(`\n[smoke] START ${step.label}`);
  console.log(`[smoke] CMD   ${commandLabel}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[smoke] PASS  ${step.label}`);
        resolve();
        return;
      }

      reject(new Error(`[smoke] FAIL ${step.label} (exit ${code ?? 'null'})`));
    });
  });
}

async function main() {
  const startedAt = Date.now();
  console.log('[smoke] Platform smoke started');

  for (const step of steps) {
    await runStep(step);
  }

  const durationMs = Date.now() - startedAt;
  console.log(`\n[smoke] Platform smoke passed in ${durationMs}ms`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
