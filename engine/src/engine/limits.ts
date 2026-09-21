import type { Request, Response, NextFunction } from 'express';

// --- Input length caps ---
export const MAX_PROBLEM_CHARS = 500;
export const MAX_SUBMISSION_CHARS = 4000;
export const MAX_SEATS = 8;

// --- Per-IP rate limits for session creation ---
const HOURLY_LIMIT = 5;
const DAILY_LIMIT = 30;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface IpRecord {
  hourly: number[];  // timestamps of session creations in the last hour
  daily: number[];   // timestamps of session creations in the last day
}

const ipRecords = new Map<string, IpRecord>();

function getIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? req.socket.remoteAddress
    ?? 'unknown';
}

function getIpRecord(ip: string): IpRecord {
  let rec = ipRecords.get(ip);
  if (!rec) { rec = { hourly: [], daily: [] }; ipRecords.set(ip, rec); }
  return rec;
}

function pruneTimestamps(timestamps: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter(t => t > cutoff);
}

export function checkSessionCreationRate(req: Request, res: Response, next: NextFunction): void {
  const ip = getIp(req);
  const rec = getIpRecord(ip);

  rec.hourly = pruneTimestamps(rec.hourly, HOUR_MS);
  rec.daily = pruneTimestamps(rec.daily, DAY_MS);

  if (rec.hourly.length >= HOURLY_LIMIT) {
    res.status(429).json({ error: `Rate limit: max ${HOURLY_LIMIT} sessions per hour. Try again later.` });
    return;
  }
  if (rec.daily.length >= DAILY_LIMIT) {
    res.status(429).json({ error: `Rate limit: max ${DAILY_LIMIT} sessions per day. Try again tomorrow.` });
    return;
  }

  const now = Date.now();
  rec.hourly.push(now);
  rec.daily.push(now);
  next();
}

// --- Global active session cap ---
export const MAX_ACTIVE_SESSIONS = 50;

export function checkActiveSessionCap(activeCount: number): string | null {
  if (activeCount >= MAX_ACTIVE_SESSIONS) {
    return `Server at capacity: ${MAX_ACTIVE_SESSIONS} active sessions. Please try again later.`;
  }
  return null;
}

// Periodic cleanup of stale IP records (every 10 minutes)
setInterval(() => {
  for (const [ip, rec] of ipRecords) {
    rec.hourly = pruneTimestamps(rec.hourly, HOUR_MS);
    rec.daily = pruneTimestamps(rec.daily, DAY_MS);
    if (rec.hourly.length === 0 && rec.daily.length === 0) {
      ipRecords.delete(ip);
    }
  }
}, 10 * 60 * 1000);
