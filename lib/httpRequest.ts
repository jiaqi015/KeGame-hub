export interface LooseRequest {
  path?: string;
  url?: string;
  nextUrl?: { pathname?: string };
  headers?: Record<string, string | string[] | undefined> & {
    get?(name: string): string | string[] | null | undefined;
  };
}

export function extractHeaderValue(req: LooseRequest, name: string): string {
  const headers = req?.headers;

  if (!headers) {
    return '';
  }

  if (typeof headers.get === 'function') {
    const value = headers.get(name) ?? headers.get(name.toLowerCase());
    return typeof value === 'string' ? value.trim() : '';
  }

  const directValue = headers[name] ?? headers[name.toLowerCase()];

  if (Array.isArray(directValue)) {
    return typeof directValue[0] === 'string' ? directValue[0].trim() : '';
  }

  return typeof directValue === 'string' ? directValue.trim() : '';
}

export function extractCookieValue(req: LooseRequest, name: string): string {
  const rawCookie = req?.headers?.cookie;
  if (typeof rawCookie !== 'string' || !rawCookie) {
    return '';
  }

  const matches = rawCookie.split(';').map((part: string) => part.trim());
  const prefix = `${name}=`;
  const entry = matches.find((part: string) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : '';
}
