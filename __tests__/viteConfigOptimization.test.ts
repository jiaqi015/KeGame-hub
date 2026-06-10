import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const viteConfigContent = fs.readFileSync(
  path.resolve(__dirname, '../vite.config.ts'),
  'utf8',
);

describe('vite.config.ts — package.json read optimization', () => {
  it('does not have separate getAppVersion/getVersionType/getLineCount/getBuildCode functions', () => {
    expect(viteConfigContent).not.toContain('function getAppVersion');
    expect(viteConfigContent).not.toContain('function getVersionType');
    expect(viteConfigContent).not.toContain('function getLineCount');
    expect(viteConfigContent).not.toContain('function getBuildCode');
  });

  it('has a single readPackageJson function', () => {
    const matches = viteConfigContent.match(/function readPackageJson/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('reads package.json only once via readPackageJson()', () => {
    const readFileSyncMatches = viteConfigContent.match(
      /fs\.readFileSync\(.*package\.json/g,
    );
    expect(readFileSyncMatches).not.toBeNull();
    expect(readFileSyncMatches!.length).toBe(1);
  });
});
