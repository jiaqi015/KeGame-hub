import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const loadingSceneSource = readFileSync(
  new URL('../src/components/Common/LoadingScene.tsx', import.meta.url),
  'utf8',
);
const useGameSource = readFileSync(
  new URL('../src/selling-houses/application/useGame.ts', import.meta.url),
  'utf8',
);

assert.ok(
  !loadingSceneSource.includes('animate-[ping') && !loadingSceneSource.includes('loading-slide'),
  'Expected loading scene to avoid anxious looping ping/slide animation',
);
assert.ok(
  loadingSceneSource.includes('减少首屏阻塞'),
  'Expected loading scene to explain what startup is doing in useful business language',
);
assert.ok(
  useGameSource.includes('hydrateFromCloudInBackground'),
  'Expected useGame bootstrap to move cloud resume hydration into a background step',
);
assert.ok(
  useGameSource.includes('refreshScenarioCatalogInBackground'),
  'Expected useGame bootstrap to refresh scenario catalog in the background',
);
assert.ok(
  useGameSource.indexOf('setBooting(false);')
    < useGameSource.indexOf('void hydrateFromCloudInBackground(nextState, localMeta);'),
  'Expected local-first boot to end before background cloud hydration starts',
);
assert.ok(
  useGameSource.indexOf('setBooting(false);')
    < useGameSource.indexOf('void refreshScenarioCatalogInBackground();'),
  'Expected local-first boot to end before background catalog refresh starts',
);

console.log('selling-houses boot loading contract verification passed');
