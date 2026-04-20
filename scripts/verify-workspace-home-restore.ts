import { resolveWorkspaceRestorePath } from '../src/hooks/useAppSession';

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(
  resolveWorkspaceRestorePath('/', '/selling-houses'),
  null,
  'home path must not restore a cached child workspace',
);

assertEqual(
  resolveWorkspaceRestorePath('/selling-houses', '/open-day'),
  '/selling-houses',
  'explicit child path should still be restorable',
);

console.log('workspace home restore verification passed');
