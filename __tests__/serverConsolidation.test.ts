import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const serverContent = fs.readFileSync(
  path.resolve(__dirname, '../server.ts'),
  'utf8',
);

describe('server.ts — route consolidation', () => {
  it('does not register duplicate /api/auth-start route', () => {
    expect(serverContent).not.toContain('app.post("/api/auth-start"');
  });

  it('does not register duplicate /api/auth-complete route', () => {
    expect(serverContent).not.toContain('app.post("/api/auth-complete"');
  });

  it('does not register duplicate /api/auth-me route', () => {
    expect(serverContent).not.toContain('app.get("/api/auth-me"');
  });

  it('does not register duplicate /api/auth-logout route', () => {
    expect(serverContent).not.toContain('app.post("/api/auth-logout"');
  });

  it('has exactly one app.post("/api/auth" handler', () => {
    const matches = serverContent.match(/app\.post\("\/api\/auth"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('has exactly one app.get("/api/auth" handler', () => {
    const matches = serverContent.match(/app\.get\("\/api\/auth"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('auth middleware skip list only contains /auth (not legacy routes)', () => {
    expect(serverContent).not.toContain('/auth-start');
    expect(serverContent).not.toContain('/auth-complete');
    expect(serverContent).not.toContain('/auth-me');
    expect(serverContent).not.toContain('/auth-logout');
  });
});

describe('server.ts — error response format', () => {
  it('does not use res.send() for error responses', () => {
    const sendMatches = serverContent.match(/res\.status\(\d+\)\.send\(/g);
    expect(sendMatches).toBeNull();
  });

  it('all error responses use res.json()', () => {
    const statusJsonMatches = serverContent.match(/res\.status\(\d+\)\.json\(/g);
    expect(statusJsonMatches).not.toBeNull();
    expect(statusJsonMatches!.length).toBeGreaterThan(0);
  });
});
