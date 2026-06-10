import { describe, it, expect } from 'vitest';
import { extractHeaderValue, extractCookieValue, type LooseRequest } from '../httpRequest.js';

describe('httpRequest — extractHeaderValue', () => {
  it('returns empty string when headers are undefined', () => {
    expect(extractHeaderValue({}, 'x-test')).toBe('');
  });

  it('reads from record-style headers (case-insensitive fallback)', () => {
    const req: LooseRequest = { headers: { 'x-activation-key': 'abc123' } };
    expect(extractHeaderValue(req, 'x-activation-key')).toBe('abc123');
    expect(extractHeaderValue(req, 'X-Activation-Key')).toBe('abc123');
  });

  it('reads from Headers.get()-style headers', () => {
    const req: LooseRequest = {
      headers: { get: (name: string) => (name === 'x-token' ? 'val' : undefined) } as any,
    };
    expect(extractHeaderValue(req, 'x-token')).toBe('val');
  });

  it('handles array values by taking the first element', () => {
    const req: LooseRequest = { headers: { 'x-multi': ['first', 'second'] } };
    expect(extractHeaderValue(req, 'x-multi')).toBe('first');
  });

  it('trims whitespace', () => {
    const req: LooseRequest = { headers: { 'x-spaced': '  hello  ' } };
    expect(extractHeaderValue(req, 'x-spaced')).toBe('hello');
  });
});

describe('httpRequest — extractCookieValue', () => {
  it('returns empty when no cookie header', () => {
    expect(extractCookieValue({}, 'session')).toBe('');
  });

  it('parses named cookie from cookie string', () => {
    const req: LooseRequest = { headers: { cookie: 'other=x; sabrina-session=tok123; foo=bar' } };
    expect(extractCookieValue(req, 'sabrina-session')).toBe('tok123');
  });

  it('returns empty when cookie not present', () => {
    const req: LooseRequest = { headers: { cookie: 'other=x' } };
    expect(extractCookieValue(req, 'missing')).toBe('');
  });

  it('decodes URI-encoded values', () => {
    const req: LooseRequest = { headers: { cookie: 'val=hello%20world' } };
    expect(extractCookieValue(req, 'val')).toBe('hello world');
  });
});

describe('LooseRequest — Express Request compatibility', () => {
  it('accepts an object with path, url, headers (Express shape)', () => {
    const getFn = (name: string): string | undefined => {
      const map: Record<string, string> = {
        'content-type': 'application/json',
      };
      return map[name];
    };
    const expressReq: LooseRequest = {
      path: '/api/auth',
      url: '/api/auth?mode=me',
      headers: { cookie: 'a=b', 'content-type': 'application/json', get: getFn } as any,
    };
    expect(expressReq.path).toBe('/api/auth');
    expect(extractHeaderValue(expressReq, 'content-type')).toBe('application/json');
  });
});
