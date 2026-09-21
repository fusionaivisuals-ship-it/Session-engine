import type { SessionState, MethodBlock } from '../types.js';

export interface ClockStatus {
  remainingSec: number;
  totalSec: number;
  amber: boolean;
  expired: boolean;
}

/**
 * Clock model:
 * - Fresh block: blockStartedAt is set, remainingSecAtPause is null.
 *   remaining = totalSec - elapsed
 * - Paused: blockStartedAt is null, remainingSecAtPause holds frozen time.
 *   remaining = remainingSecAtPause
 * - Resumed: blockStartedAt is set to resume time, remainingSecAtPause holds budget at resume.
 *   remaining = remainingSecAtPause - elapsedSinceResume
 */
export function getClockStatus(session: SessionState, block: MethodBlock): ClockStatus {
  const extensionSec = session.clock.extensionSeconds?.[block.id] ?? (session.clock.extensionsUsed[block.id] ?? 0) * 60;
  const totalSec = block.timeboxSec + extensionSec;
  if (totalSec === 0) return { remainingSec: 0, totalSec: 0, amber: false, expired: false };

  let remainingSec: number;

  if (session.clock.blockStartedAt === null) {
    // Paused (or not yet started)
    remainingSec = session.clock.remainingSecAtPause ?? totalSec;
  } else if (session.clock.remainingSecAtPause !== null) {
    // Resumed from pause: budget = remainingSecAtPause, counting down from blockStartedAt
    const elapsed = (Date.now() - new Date(session.clock.blockStartedAt).getTime()) / 1000;
    remainingSec = Math.max(0, session.clock.remainingSecAtPause - elapsed);
  } else {
    // Fresh block, never paused
    const elapsed = (Date.now() - new Date(session.clock.blockStartedAt).getTime()) / 1000;
    remainingSec = Math.max(0, totalSec - elapsed);
  }

  const amber = remainingSec > 0 && remainingSec <= totalSec * 0.2;
  const expired = remainingSec <= 0;
  return { remainingSec: Math.round(remainingSec), totalSec, amber, expired };
}

export function pauseSession(session: SessionState, block: MethodBlock): void {
  if (session.status !== 'running') return;
  const status = getClockStatus(session, block);
  session.clock.remainingSecAtPause = status.remainingSec;
  session.clock.blockStartedAt = null;
  session.status = 'paused';
}

export function resumeSession(session: SessionState): void {
  if (session.status !== 'paused') return;
  // remainingSecAtPause stays — it becomes the budget for the resumed run.
  // blockStartedAt resets to now so elapsed counts from resume.
  session.clock.blockStartedAt = new Date().toISOString();
  session.status = 'running';
}

export function canExtend(session: SessionState, blockId: string): boolean {
  return (session.clock.extensionsUsed[blockId] ?? 0) < 1;
}

export function grantExtension(session: SessionState, block: MethodBlock, extensionSec: number): boolean {
  if (!canExtend(session, block.id)) return false;
  session.clock.extensionsUsed[block.id] = 1;
  session.clock.extensionSeconds ??= {};
  session.clock.extensionSeconds[block.id] = extensionSec;

  // Add extension to the remaining budget
  if (session.clock.remainingSecAtPause !== null) {
    session.clock.remainingSecAtPause += extensionSec;
  }
  // If fresh block (never paused), we need to set remainingSecAtPause
  // so the extension is tracked. Get current remaining and add extension.
  if (session.clock.remainingSecAtPause === null && session.clock.blockStartedAt) {
    const elapsed = (Date.now() - new Date(session.clock.blockStartedAt).getTime()) / 1000;
    const remaining = Math.max(0, block.timeboxSec - elapsed);
    session.clock.remainingSecAtPause = Math.round(remaining) + extensionSec;
    session.clock.blockStartedAt = new Date().toISOString();
  }

  return true;
}
