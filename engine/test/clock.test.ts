import { getClockStatus, pauseSession, resumeSession, canExtend, grantExtension } from '../src/clock/clock.js';
import { createSession, addParticipant, startSession } from '../src/engine/session.js';
import type { Method, MethodBlock, SessionState } from '../src/types.js';

function makeMethod(): Method {
  return {
    id: 'test', name: 'Test', version: '0.1.0', roleMode: 'rotating',
    groupSize: { min: 2, max: 6 },
    timing: { totalBudgetSec: 600, extensionSec: 60, idleSec: 90, presenceTimeoutSec: 120 },
    lenses: [{ id: 'l1', name: 'L1', instruction: 'Go' }],
    blocks: [
      { id: 'b1', type: 'frame', title: 'Frame', timeboxSec: 100, completion: 'all_agreed', lensId: 'l1' },
    ],
  };
}

function setupRunning(): { session: SessionState; method: Method; block: MethodBlock } {
  const method = makeMethod();
  const session = createSession(method, 'CLK001');
  addParticipant(session, 'A');
  addParticipant(session, 'B');
  startSession(session, method);
  return { session, method, block: method.blocks[0] };
}

describe('Clock', () => {
  test('fresh block shows full time', () => {
    const { session, block } = setupRunning();
    // blockStartedAt is "now", so remaining should be ~100
    const status = getClockStatus(session, block);
    expect(status.totalSec).toBe(100);
    expect(status.remainingSec).toBeGreaterThanOrEqual(99);
    expect(status.amber).toBe(false);
    expect(status.expired).toBe(false);
  });

  test('amber fires at 20% remaining', () => {
    const { session, block } = setupRunning();
    // Simulate 82 seconds elapsed (18 remaining, which is 18% of 100 => amber)
    session.clock.blockStartedAt = new Date(Date.now() - 82_000).toISOString();
    const status = getClockStatus(session, block);
    expect(status.remainingSec).toBeLessThanOrEqual(20);
    expect(status.amber).toBe(true);
    expect(status.expired).toBe(false);
  });

  test('expired at zero', () => {
    const { session, block } = setupRunning();
    session.clock.blockStartedAt = new Date(Date.now() - 101_000).toISOString();
    const status = getClockStatus(session, block);
    expect(status.remainingSec).toBe(0);
    expect(status.expired).toBe(true);
  });

  test('pause at 37s remaining, resume, still 37s', () => {
    const { session, block } = setupRunning();
    // Simulate 63 seconds elapsed (37 remaining)
    session.clock.blockStartedAt = new Date(Date.now() - 63_000).toISOString();

    // Verify we're at ~37s
    let status = getClockStatus(session, block);
    expect(status.remainingSec).toBe(37);

    // Pause
    pauseSession(session, block);
    expect(session.status).toBe('paused');
    expect(session.clock.remainingSecAtPause).toBe(37);
    expect(session.clock.blockStartedAt).toBeNull();

    // While paused, time doesn't move
    status = getClockStatus(session, block);
    expect(status.remainingSec).toBe(37);

    // Resume
    resumeSession(session);
    expect(session.status).toBe('running');

    // Immediately after resume, still ~37s
    status = getClockStatus(session, block);
    expect(status.remainingSec).toBe(37);
  });

  test('one extension per block', () => {
    const { session, block } = setupRunning();
    expect(canExtend(session, block.id)).toBe(true);
    const ok = grantExtension(session, block, 60);
    expect(ok).toBe(true);
    expect(canExtend(session, block.id)).toBe(false);

    const ok2 = grantExtension(session, block, 60);
    expect(ok2).toBe(false);
  });

  test('extension adds time', () => {
    const { session, block } = setupRunning();
    // 90s elapsed, 10s remaining
    session.clock.blockStartedAt = new Date(Date.now() - 90_000).toISOString();
    let status = getClockStatus(session, block);
    expect(status.remainingSec).toBe(10);

    grantExtension(session, block, 60);
    status = getClockStatus(session, block);
    // Should now have ~70s remaining (10 + 60)
    expect(status.remainingSec).toBe(70);
  });

  test('zero timebox block', () => {
    const zeroBlock: MethodBlock = { id: 'z', type: 'artifact', title: 'Z', timeboxSec: 0, completion: 'auto' };
    const { session } = setupRunning();
    const status = getClockStatus(session, zeroBlock);
    expect(status.remainingSec).toBe(0);
    expect(status.expired).toBe(false); // zero-timebox is not "expired"
  });
});
