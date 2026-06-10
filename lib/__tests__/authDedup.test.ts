import { describe, it, expect } from 'vitest';
import {
  authorizeSession,
  authorizeSessionPersisted,
  AUTH_SESSION_COOKIE_NAME,
} from '../auth';

describe('auth — authorizeSession deduplication', () => {
  it('authorizeSession and authorizeSessionPersisted return same result for missing session', async () => {
    const req = { headers: {} };
    const syncResult = authorizeSession(req);
    const asyncResult = await authorizeSessionPersisted(req);

    expect(syncResult.ok).toBe(false);
    expect(asyncResult.ok).toBe(false);
  });

  it('activation key auth is handled identically in both functions', async () => {
    const configuredKey = process.env.ACTIVATION_KEYS;
    if (!configuredKey) {
      return;
    }

    const key = configuredKey.split(',')[0].trim();
    const req = { headers: { 'x-activation-key': key } };

    const syncResult = authorizeSession(req);
    const asyncResult = await authorizeSessionPersisted(req);

    expect(syncResult.ok).toBe(true);
    expect(asyncResult.ok).toBe(true);
    if (syncResult.ok && asyncResult.ok) {
      expect(syncResult.source).toBe('activation-key');
      expect(asyncResult.source).toBe('activation-key');
      expect(syncResult.allowedWorkspaces).toEqual(asyncResult.allowedWorkspaces);
    }
  });
});

describe('auth — getHeaderValue is NOT duplicated', () => {
  it('activation.ts imports extractHeaderValue from httpRequest.ts (not its own copy)', () => {
    const fs = require('fs');
    const path = require('path');
    const activationContent = fs.readFileSync(
      path.resolve(__dirname, '../activation.ts'),
      'utf8',
    );
    expect(activationContent).toContain("from './httpRequest.js'");
    expect(activationContent).not.toMatch(/function getHeaderValue/);
  });

  it('auth.ts imports extractHeaderValue from httpRequest.ts (not its own copy)', () => {
    const fs = require('fs');
    const path = require('path');
    const authContent = fs.readFileSync(
      path.resolve(__dirname, '../auth.ts'),
      'utf8',
    );
    expect(authContent).toContain("from './httpRequest.js'");
    expect(authContent).not.toMatch(/function getHeaderValue/);
  });
});
