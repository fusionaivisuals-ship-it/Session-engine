import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { saveManifest, loadManifest, recoverSessions, freezeRecoveredSession, cleanupOldSessions, getSessionsDir, setSessionsDir } from '../src/engine/manifest.js';
import { createSession, addParticipant, startSession, advanceBlock } from '../src/engine/session.js';
import type { Method } from '../src/types.js';

const testDir = join(tmpdir(), 'session-engine-test-' + process.pid);

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });
  setSessionsDir(testDir);
});

afterAll(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true });
});

function makeMethod(): Method {
  return {
    id: 'test', name: 'Test', version: '0.1.0', roleMode: 'rotating',
    groupSize: { min: 2, max: 6 },
    timing: { totalBudgetSec: 600, extensionSec: 60, idleSec: 90, presenceTimeoutSec: 120 },
    lenses: [{ id: 'l1', name: 'L1', instruction: 'Go' }],
    blocks: [
      { id: 'b1', type: 'frame', title: 'Frame', timeboxSec: 120, completion: 'all_agreed', lensId: 'l1' },
      { id: 'b2', type: 'private_input', title: 'Input', timeboxSec: 120, completion: 'all_submitted', lensId: 'l1' },
      { id: 'b3', type: 'reveal', title: 'Reveal', timeboxSec: 60, completion: 'all_confirmed', lensId: 'l1', sourceBlockId: 'b2' },
    ],
  };
}

function cleanup(roomCode: string) {
  const file = join(getSessionsDir(), `${roomCode}.json`);
  if (existsSync(file)) unlinkSync(file);
}

describe('Manifest persistence', () => {
  const roomCode = 'MTEST1';

  afterEach(() => cleanup(roomCode));

  test('save and load round-trip', () => {
    const method = makeMethod();
    const session = createSession(method, roomCode);
    addParticipant(session, 'Alice');
    addParticipant(session, 'Bob');
    saveManifest(session);

    const loaded = loadManifest(roomCode);
    expect(loaded).not.toBeNull();
    expect(loaded!.roomCode).toBe(roomCode);
    expect(loaded!.participants).toHaveLength(2);
    expect(loaded!.status).toBe('lobby');
  });

  test('advance two blocks, save, reload paused with same block and remaining time', () => {
    const method = makeMethod();
    const session = createSession(method, roomCode);
    addParticipant(session, 'Alice');
    addParticipant(session, 'Bob');
    startSession(session, method);

    // Advance past block 1 (frame)
    session.blocks['b1'].confirmations = ['seat-1', 'seat-2'];
    advanceBlock(session, method, 'gate');

    // Now on block 2. Simulate 30s elapsed.
    session.clock.blockStartedAt = new Date(Date.now() - 30_000).toISOString();
    saveManifest(session);

    expect(session.currentBlockId).toBe('b2');
    expect(session.status).toBe('running');

    // Simulate "kill process, restart" -> recoverSessions
    const recovered = recoverSessions();
    const found = recovered.find(s => s.roomCode === roomCode);
    expect(found).toBeDefined();
    expect(found!.status).toBe('paused');
    expect(found!.currentBlockId).toBe('b2');

    // Freeze with proper timebox
    freezeRecoveredSession(found!, 120);
    // Should have ~90s remaining (120 - 30)
    expect(found!.clock.remainingSecAtPause).toBeGreaterThanOrEqual(88);
    expect(found!.clock.remainingSecAtPause).toBeLessThanOrEqual(92);
  });

  test('recovery excludes downtime and freezes a resumed clock at its saved budget', () => {
    const session = createSession(makeMethod(), roomCode);
    session.status = 'running';
    session.currentBlockId = 'b1';
    session.clock.blockStartedAt = '2026-09-20T00:00:00.000Z';
    session.clock.savedAt = '2026-09-20T00:00:30.000Z';
    session.clock.remainingSecAtPause = 80;
    freezeRecoveredSession(session, 120);
    expect(session.clock.remainingSecAtPause).toBe(50);
    expect(session.clock.blockStartedAt).toBeNull();
  });
});

describe('cleanupOldSessions', () => {
  const { writeFileSync, utimesSync } = require('fs');

  test('removes files older than maxAgeDays', () => {
    const method = makeMethod();
    const old = createSession(method, 'OLD001');
    saveManifest(old);

    // Backdate the file to 31 days ago
    const filePath = join(getSessionsDir(), 'OLD001.json');
    const past = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    utimesSync(filePath, past, past);

    const fresh = createSession(method, 'NEW001');
    saveManifest(fresh);

    const removed = cleanupOldSessions(30);
    expect(removed).toBe(1);
    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(join(getSessionsDir(), 'NEW001.json'))).toBe(true);

    // Cleanup
    cleanup('NEW001');
  });
});
