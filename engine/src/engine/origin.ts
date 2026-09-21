import type { IncomingMessage } from 'http';

/**
 * Returns the public-facing origin for link generation.
 * Reads PUBLIC_ORIGIN from env first; falls back to request headers.
 */
export function getPublicOrigin(req?: IncomingMessage): string {
  const env = process.env.PUBLIC_ORIGIN?.replace(/\/+$/, '');
  if (env) return env;

  if (!req) return 'http://localhost:' + (process.env.PORT ?? '3000');

  const proto = req.headers['x-forwarded-proto'] as string | undefined ?? 'http';
  const host = req.headers['x-forwarded-host'] as string | undefined
    ?? req.headers.host
    ?? 'localhost:' + (process.env.PORT ?? '3000');
  return `${proto}://${host}`;
}
