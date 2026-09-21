import { v4 as uuidv4 } from 'uuid';
import type { SessionState, Method, MethodBlock, Participant, ExitReason } from '../types.js';

export function generateRoomCode(): string {
  return uuidv4().slice(0, 6).toUpperCase();
}

export function createSession(method: Method, roomCode: string, opts?: { anonymous?: boolean; mode?: 'solo' | 'group' }): SessionState {
  const anonymous = opts?.anonymous ?? method.defaults?.anonymous ?? false;
  const mode = opts?.mode ?? 'group';
  if (mode === 'solo' && method.roleMode === 'fixed') {
    throw new Error('Solo mode is only available for rotating-mode methods');
  }
  return {
    roomCode,
    methodId: method.id,
    methodVersion: method.version,
    createdAt: new Date().toISOString(),
    status: 'lobby',
    mode,
    anonymous,
    effectiveMethod: structuredClone(method),
    clock: {
      blockStartedAt: null,
      remainingSecAtPause: null,
      extensionsUsed: {},
      totalElapsedSec: 0,
    },
    participants: [],
    currentBlockId: null,
    blocks: {},
    facts: {
      problemStatement: null,
      decision: null,
      commitment: null,
    },
    metrics: {
      frameToCommitSec: null,
      wordsBySeat: {},
      lensCoverage: {},
      anonymous,
    },
  };
}

export function addParticipant(session: SessionState, displayName: string): Participant {
  const seat = `seat-${session.participants.length + 1}`;
  const participant: Participant = {
    seat,
    displayName,
    roleId: null,
    presence: 'present',
    lastSeenAt: new Date().toISOString(),
    swapsUsed: 0,
  };
  session.participants.push(participant);
  return participant;
}

export function startSession(session: SessionState, method: Method): void {
  if (session.status !== 'lobby') throw new Error('Session not in lobby');
  const minParticipants = session.mode === 'solo' ? 1 : method.groupSize.min;
  if (session.participants.length < minParticipants) {
    throw new Error(`Need at least ${minParticipants} participants`);
  }
  session.status = 'running';
  enterBlock(session, method.blocks[0]);
}

export function enterBlock(session: SessionState, block: MethodBlock): void {
  const now = new Date().toISOString();
  session.currentBlockId = block.id;
  session.clock.blockStartedAt = now;
  session.clock.remainingSecAtPause = null;
  session.blocks[block.id] = {
    enteredAt: now,
    exitedAt: null,
    exitReason: 'pending',
    overrideReason: null,
    submissions: [],
    confirmations: [],
    stuckEvents: [],
  };
}

export function exitBlock(session: SessionState, block: MethodBlock, exitReason: ExitReason, overrideReason?: string): void {
  const now = new Date().toISOString();
  const record = session.blocks[block.id];
  record.exitedAt = now;
  record.exitReason = exitReason;
  if (overrideReason) record.overrideReason = overrideReason;
}

export function advanceBlock(session: SessionState, method: Method, exitReason: ExitReason = 'gate', overrideReason?: string): MethodBlock | null {
  const currentBlock = method.blocks.find(b => b.id === session.currentBlockId);
  if (!currentBlock) throw new Error('No current block');

  exitBlock(session, currentBlock, exitReason, overrideReason);

  const currentIndex = method.blocks.indexOf(currentBlock);
  const nextBlock = method.blocks[currentIndex + 1];
  if (!nextBlock) {
    session.status = 'complete';
    session.currentBlockId = null;
    return null;
  }

  enterBlock(session, nextBlock);

  // Auto-complete blocks advance immediately
  if (nextBlock.completion === 'auto') {
    exitBlock(session, nextBlock, 'auto');
    const nextIndex = method.blocks.indexOf(nextBlock) + 1;
    if (nextIndex >= method.blocks.length) {
      session.status = 'complete';
      session.currentBlockId = null;
      return null;
    }
    enterBlock(session, method.blocks[nextIndex]);
    return method.blocks[nextIndex];
  }

  return nextBlock;
}

export function getCurrentBlock(session: SessionState, method: Method): MethodBlock | undefined {
  return method.blocks.find(b => b.id === session.currentBlockId);
}

export function getBlockIndex(method: Method, blockId: string): number {
  return method.blocks.findIndex(b => b.id === blockId);
}
