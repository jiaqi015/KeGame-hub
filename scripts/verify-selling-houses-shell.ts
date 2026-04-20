import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workspacePath = resolve('/Users/jiaqi/Documents/开放日测算/src/selling-houses/SellingHousesWorkspace.tsx');
const source = readFileSync(workspacePath, 'utf8');

assert.ok(
  !source.includes('function InlineResultsPanel'),
  'Expected SellingHousesWorkspace.tsx to stop inlining InlineResultsPanel.',
);

assert.ok(
  !source.includes('function ProfilePanel'),
  'Expected SellingHousesWorkspace.tsx to stop inlining ProfilePanel.',
);

const loadingReturnIndex = source.indexOf("if (phase === 'loading')");
const setupReturnIndex = source.indexOf("if (phase === 'setup' || !state)");
const shellProjectionHookIndex = source.indexOf('const shellProjection = useMemo');

assert.ok(loadingReturnIndex > -1, 'Expected SellingHousesWorkspace.tsx to keep an explicit loading branch.');
assert.ok(setupReturnIndex > -1, 'Expected SellingHousesWorkspace.tsx to keep an explicit setup branch.');
assert.ok(shellProjectionHookIndex > -1, 'Expected SellingHousesWorkspace.tsx to build shell projection through useMemo.');
assert.ok(
  shellProjectionHookIndex < loadingReturnIndex && shellProjectionHookIndex < setupReturnIndex,
  'Expected shell projection hook to be declared before early returns so setup -> run transitions keep hook order stable.',
);

console.log('selling-houses shell verification passed');
