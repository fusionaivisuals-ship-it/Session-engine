import { checkSessionCreationRate, checkActiveSessionCap, MAX_PROBLEM_CHARS, MAX_SUBMISSION_CHARS, MAX_SEATS, MAX_ACTIVE_SESSIONS } from '../src/engine/limits.js';
import type { Request, Response, NextFunction } from 'express';

function fakeReq(ip: string = '1.2.3.4'): Request {
  return { headers: {}, socket: { remoteAddress: ip } } as any;
}

function fakeRes(): Response & { statusCode: number; body: any } {
  const res: any = { statusCode: 200, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: any) => { res.body = body; };
  return res;
}

describe('Rate limits', () => {
  it('allows up to 5 sessions per hour from same IP', () => {
    const ip = '10.0.0.' + Math.floor(Math.random() * 255);
    for (let i = 0; i < 5; i++) {
      const req = fakeReq(ip);
      const res = fakeRes();
      let called = false;
      checkSessionCreationRate(req, res as any, () => { called = true; });
      expect(called).toBe(true);
    }
    // 6th should be rejected
    const req = fakeReq(ip);
    const res = fakeRes();
    let called = false;
    checkSessionCreationRate(req, res as any, () => { called = true; });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(429);
  });

  it('allows different IPs independently', () => {
    const ip1 = '10.1.0.' + Math.floor(Math.random() * 255);
    const ip2 = '10.2.0.' + Math.floor(Math.random() * 255);
    for (let i = 0; i < 5; i++) {
      const res = fakeRes();
      let called = false;
      checkSessionCreationRate(fakeReq(ip1), res as any, () => { called = true; });
      expect(called).toBe(true);
    }
    // ip2 should still be allowed
    const res = fakeRes();
    let called = false;
    checkSessionCreationRate(fakeReq(ip2), res as any, () => { called = true; });
    expect(called).toBe(true);
  });
});

describe('Active session cap', () => {
  it('returns null when under cap', () => {
    expect(checkActiveSessionCap(10)).toBeNull();
  });
  it('returns error at cap', () => {
    expect(checkActiveSessionCap(MAX_ACTIVE_SESSIONS)).not.toBeNull();
  });
});

describe('Input caps', () => {
  it('has correct constants', () => {
    expect(MAX_PROBLEM_CHARS).toBe(500);
    expect(MAX_SUBMISSION_CHARS).toBe(4000);
    expect(MAX_SEATS).toBe(8);
  });
});
