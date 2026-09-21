import { getPublicOrigin } from '../src/engine/origin.js';
import type { IncomingMessage } from 'http';

function fakeReq(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as any;
}

describe('getPublicOrigin', () => {
  const origEnv = process.env.PUBLIC_ORIGIN;
  afterEach(() => {
    if (origEnv === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = origEnv;
  });

  it('returns PUBLIC_ORIGIN when set', () => {
    process.env.PUBLIC_ORIGIN = 'https://session.example.com';
    expect(getPublicOrigin(fakeReq({ host: 'localhost:3000' }))).toBe('https://session.example.com');
  });

  it('strips trailing slashes from PUBLIC_ORIGIN', () => {
    process.env.PUBLIC_ORIGIN = 'https://session.example.com/';
    expect(getPublicOrigin()).toBe('https://session.example.com');
  });

  it('falls back to request Host header', () => {
    delete process.env.PUBLIC_ORIGIN;
    expect(getPublicOrigin(fakeReq({ host: 'myhost:4000' }))).toBe('http://myhost:4000');
  });

  it('uses x-forwarded-proto and x-forwarded-host', () => {
    delete process.env.PUBLIC_ORIGIN;
    const req = fakeReq({
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'proxy.example.com',
      host: 'localhost:3000',
    });
    expect(getPublicOrigin(req)).toBe('https://proxy.example.com');
  });

  it('returns localhost fallback when no request given', () => {
    delete process.env.PUBLIC_ORIGIN;
    process.env.PORT = '5555';
    expect(getPublicOrigin()).toBe('http://localhost:5555');
    delete process.env.PORT;
  });
});
