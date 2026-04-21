import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const registrySource = readFileSync(new URL('../src/workspaces/workspaceRegistry.tsx', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('../src/selling-houses/SellingHousesWorkspace.tsx', import.meta.url), 'utf8');
const useGameSource = readFileSync(new URL('../src/selling-houses/application/useGame.ts', import.meta.url), 'utf8');
const sessionSource = readFileSync(new URL('../src/hooks/useAppSession.ts', import.meta.url), 'utf8');
const apiServiceSource = readFileSync(new URL('../src/services/apiService.ts', import.meta.url), 'utf8');

assert.ok(
  registrySource.includes('export function preloadSellingHousesWorkspace'),
  'Expected registry to expose selling-houses workspace preloading',
);
assert.ok(
  workspaceSource.includes('export function preloadSellingHousesPrimaryViews'),
  'Expected selling-houses workspace to expose primary-view preloading',
);
assert.ok(
  appSource.includes('preloadSellingHousesWorkspace()')
    && appSource.includes('preloadSellingHousesPrimaryViews'),
  'Expected App to warm selling-houses workspace and primary views before user waits on them',
);
assert.ok(
  sessionSource.includes("activeWorkspace !== 'sabrina'"),
  'Expected model catalog loading to wait until the Sabrina workspace is actually active',
);
assert.ok(
  useGameSource.includes('cloudHydrationInFlight')
    && useGameSource.includes('scenarioCatalogRefreshInFlight')
    && useGameSource.includes('dedupeInFlight'),
  'Expected selling-houses background startup requests to be deduped across remounts',
);
assert.ok(
  apiServiceSource.includes('authenticatedUserInFlight'),
  'Expected auth restoration to reuse an in-flight /api/auth?mode=me request during startup',
);

console.log('selling-houses startup contract verification passed');
