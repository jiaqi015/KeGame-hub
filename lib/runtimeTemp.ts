import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function isServerlessRuntime() {
  return Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT,
  );
}

export function getRuntimeTempRoot() {
  if (isServerlessRuntime()) {
    return path.join(os.tmpdir(), 'sabrina-workspace');
  }

  return path.join(process.cwd(), 'tmp');
}

export function getRuntimeTempDir(...segments: string[]) {
  return path.join(getRuntimeTempRoot(), ...segments);
}

export async function ensureRuntimeTempDir(...segments: string[]) {
  const targetDir = getRuntimeTempDir(...segments);
  await fs.mkdir(targetDir, { recursive: true });
  return targetDir;
}
