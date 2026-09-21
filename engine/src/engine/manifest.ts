import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync, statSync } from 'fs';
import { resolve, join } from 'path';
import type { SessionState } from '../types.js';

let sessionsDir = resolve(process.cwd(), 'sessions');

export function setSessionsDir(dir: string) {
  sessionsDir = dir;
}

export function getSessionsDir(): string {
  return sessionsDir;
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function saveManifest(session: SessionState): void {
  ensureDir(sessionsDir);
  const filePath = join(sessionsDir, `${session.roomCode}.json`);
  session.clock.savedAt = new Date().toISOString();
  writeFileSync(filePath, JSON.stringify(session, null, 2));
}

export function loadManifest(roomCode: string): SessionState | null {
  const filePath = join(sessionsDir, `${roomCode}.json`);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export function loadAllManifests(): SessionState[] {
  ensureDir(sessionsDir);
  const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
  const sessions: SessionState[] = [];
  for (const file of files) {
    try {
      const state: SessionState = JSON.parse(readFileSync(join(sessionsDir, file), 'utf-8'));
      sessions.push(state);
    } catch {
      // skip corrupt files
    }
  }
  return sessions;
}

export function recoverSessions(): SessionState[] {
  const all = loadAllManifests();
  const recovered: SessionState[] = [];
  for (const session of all) {
    // Backfill mode for manifests created before solo support
    if (!session.mode) session.mode = 'group';
    if (session.status === 'running' || session.status === 'paused') {
      if (session.status === 'running') {
        session.status = 'paused';
        // blockStartedAt is preserved so caller can compute remaining with freezeRecoveredSession
      }
    }
    recovered.push(session);
  }
  return recovered;
}

export function cleanupOldSessions(maxAgeDays: number): number {
  ensureDir(sessionsDir);
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const filePath = join(sessionsDir, file);
      const stat = statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        unlinkSync(filePath);
        removed++;
      }
    } catch { /* skip */ }
  }
  if (removed > 0) console.log(`Cleaned up ${removed} session file(s) older than ${maxAgeDays} days`);
  return removed;
}

export function freezeRecoveredSession(session: SessionState, blockTimeboxSec: number): void {
  if (session.clock.blockStartedAt === null && session.clock.remainingSecAtPause !== null) return;
  if (!session.clock.blockStartedAt) {
    session.clock.remainingSecAtPause = blockTimeboxSec;
    return;
  }
  const blockId = session.currentBlockId ?? '';
  const extensionSec = session.clock.extensionSeconds?.[blockId] ?? (session.clock.extensionsUsed[blockId] ?? 0) * 60;
  const totalSec = session.clock.remainingSecAtPause ?? (blockTimeboxSec + extensionSec);
  const checkpoint = session.clock.savedAt ? new Date(session.clock.savedAt).getTime() : Date.now();
  const elapsed = Math.max(0, (checkpoint - new Date(session.clock.blockStartedAt).getTime()) / 1000);
  session.clock.remainingSecAtPause = Math.max(0, Math.round(totalSec - elapsed));
  session.clock.blockStartedAt = null;
  saveManifest(session);
}
