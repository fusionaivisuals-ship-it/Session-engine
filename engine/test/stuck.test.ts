import { nextStep, advanceStuckLadder, submitPass, swapRoles, getIdleSeats } from '../src/engine/stuck.js';
import { setClient } from '../src/agents/client.js';
import type { SessionState, Method, MethodBlock } from '../src/types.js';

function mockClientForTool(name: string, input: any) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'tool_use', id: 'tu_1', name, input }],
        usage: { input_tokens: 50, output_tokens: 20 },
      }),
    },
  } as any;
}

function makeSession(): SessionState {
  return {
    roomCode: 'TEST', methodId: 'test', methodVersion: '1',
    createdAt: new Date().toISOString(), status: 'running', anonymous: false, mode: 'group', facilitatorSeat: 'seat-1',
    clock: { blockStartedAt: new Date().toISOString(), remainingSecAtPause: null, extensionsUsed: {}, totalElapsedSec: 0 },
    participants: [
      { seat: 'seat-1', displayName: 'A', presence: 'present', lastSeenAt: new Date().toISOString(), swapsUsed: 0 },
      { seat: 'seat-2', displayName: 'B', presence: 'present', lastSeenAt: new Date().toISOString(), swapsUsed: 0 },
    ],
    currentBlockId: 'b1',
    blocks: { b1: { enteredAt: new Date().toISOString(), exitReason: 'pending', submissions: [], stuckEvents: [] } },
    facts: { problemStatement: 'Test' },
    metrics: {},
  };
}

const method: Method = {
  id: 'test', name: 'Test', version: '1', roleMode: 'rotating',
  groupSize: { min: 2, max: 6 },
  timing: { totalBudgetSec: 3600, extensionSec: 60, idleSec: 30, presenceTimeoutSec: 120 },
  lenses: [{ id: 'l1', name: 'Lens', instruction: 'Do things' }],
  blocks: [{
    id: 'b1', type: 'private_input', title: 'Input', timeboxSec: 180, completion: 'all_submitted',
    lensId: 'l1', prompt: 'Write.',
    helper: { systemPrompt: 'Help.', examplePool: ['Pool example'] },
    stuck: { idleSec: 20 },
  }],
};

const block = method.blocks[0];

afterEach(() => setClient(null));

describe('stuck ladder', () => {
  it('steps follow order: hint, example, pass, facilitator', () => {
    const session = makeSession();
    expect(nextStep(session, 'b1', 'seat-1')).toBe('hint');

    session.blocks['b1'].stuckEvents!.push({ seat: 'seat-1', step: 'hint', at: new Date().toISOString() });
    expect(nextStep(session, 'b1', 'seat-1')).toBe('example');

    session.blocks['b1'].stuckEvents!.push({ seat: 'seat-1', step: 'example', at: new Date().toISOString() });
    expect(nextStep(session, 'b1', 'seat-1')).toBe('pass');

    session.blocks['b1'].stuckEvents!.push({ seat: 'seat-1', step: 'pass', at: new Date().toISOString() });
    expect(nextStep(session, 'b1', 'seat-1')).toBe('facilitator');

    session.blocks['b1'].stuckEvents!.push({ seat: 'seat-1', step: 'facilitator', at: new Date().toISOString() });
    expect(nextStep(session, 'b1', 'seat-1')).toBeNull();
  });

  it('never repeats a step', async () => {
    const session = makeSession();
    setClient(mockClientForTool('give_hint', { question: 'Why?' }));

    const r1 = await advanceStuckLadder(session, method, block, 'seat-1');
    expect(r1?.step).toBe('hint');

    // Second call should go to example (pool), not hint again
    const r2 = await advanceStuckLadder(session, method, block, 'seat-1');
    expect(r2?.step).toBe('example');
    expect(r2?.example).toBe('Pool example');
  });

  it('hint step calls model', async () => {
    const session = makeSession();
    setClient(mockClientForTool('give_hint', { question: 'What data do you have?' }));

    const result = await advanceStuckLadder(session, method, block, 'seat-1');
    expect(result?.step).toBe('hint');
    expect(result?.hint).toBe('What data do you have?');
  });

  it('example uses pool when available', async () => {
    const session = makeSession();
    // Skip hint
    session.blocks['b1'].stuckEvents!.push({ seat: 'seat-1', step: 'hint', at: new Date().toISOString() });

    const result = await advanceStuckLadder(session, method, block, 'seat-1');
    expect(result?.step).toBe('example');
    expect(result?.example).toBe('Pool example');
  });

  it('pass step returns passForm: true', async () => {
    const session = makeSession();
    session.blocks['b1'].stuckEvents!.push(
      { seat: 'seat-1', step: 'hint', at: new Date().toISOString() },
      { seat: 'seat-1', step: 'example', at: new Date().toISOString() },
    );

    const result = await advanceStuckLadder(session, method, block, 'seat-1');
    expect(result?.step).toBe('pass');
    expect(result?.passForm).toBe(true);
  });

  it('submitPass creates a passed submission', () => {
    const session = makeSession();
    submitPass(session, 'b1', 'seat-1', 'Cannot think of anything');
    const sub = session.blocks['b1'].submissions![0];
    expect(sub.passed).toBe(true);
    expect(sub.passReason).toBe('Cannot think of anything');
    expect(sub.text).toBe('');
  });

  it('submitPass throws on duplicate', () => {
    const session = makeSession();
    submitPass(session, 'b1', 'seat-1', 'reason');
    expect(() => submitPass(session, 'b1', 'seat-1', 'again')).toThrow('Already submitted');
  });

  it('getIdleSeats detects idle participants', () => {
    const session = makeSession();
    const now = Date.now();
    const map = new Map<string, number>();
    map.set('seat-1', now - 25000); // 25s idle, threshold 20s
    map.set('seat-2', now - 5000);  // 5s, under threshold

    const idle = getIdleSeats(session, block, method, map);
    expect(idle).toEqual(['seat-1']);
  });

  it('getIdleSeats skips already submitted', () => {
    const session = makeSession();
    session.blocks['b1'].submissions!.push({
      seat: 'seat-1', text: 'done', submittedAt: new Date().toISOString(),
      autoSubmitted: false, passed: false, wordCount: 1,
    });
    const now = Date.now();
    const map = new Map<string, number>();
    map.set('seat-1', now - 25000);

    const idle = getIdleSeats(session, block, method, map);
    expect(idle).toEqual([]);
  });

  it('returns null when ladder exhausted', async () => {
    const session = makeSession();
    for (const step of ['hint', 'example', 'pass', 'facilitator'] as const) {
      session.blocks['b1'].stuckEvents!.push({ seat: 'seat-1', step, at: new Date().toISOString() });
    }
    const result = await advanceStuckLadder(session, method, block, 'seat-1');
    expect(result).toBeNull();
  });

  it('fixed mode ladder order: hint, example, swap, facilitator', () => {
    const session = makeSession();
    expect(nextStep(session, 'b1', 'seat-1', 'fixed')).toBe('hint');

    session.blocks['b1'].stuckEvents!.push({ seat: 'seat-1', step: 'hint', at: new Date().toISOString() });
    expect(nextStep(session, 'b1', 'seat-1', 'fixed')).toBe('example');

    session.blocks['b1'].stuckEvents!.push({ seat: 'seat-1', step: 'example', at: new Date().toISOString() });
    expect(nextStep(session, 'b1', 'seat-1', 'fixed')).toBe('swap');

    session.blocks['b1'].stuckEvents!.push({ seat: 'seat-1', step: 'swap', at: new Date().toISOString() });
    expect(nextStep(session, 'b1', 'seat-1', 'fixed')).toBe('facilitator');

    session.blocks['b1'].stuckEvents!.push({ seat: 'seat-1', step: 'facilitator', at: new Date().toISOString() });
    expect(nextStep(session, 'b1', 'seat-1', 'fixed')).toBeNull();
  });

  it('swap step returns swapForm: true in fixed mode', async () => {
    const session = makeSession();
    const fixedMethod = { ...method, roleMode: 'fixed' as const };
    session.blocks['b1'].stuckEvents!.push(
      { seat: 'seat-1', step: 'hint', at: new Date().toISOString() },
      { seat: 'seat-1', step: 'example', at: new Date().toISOString() },
    );

    const result = await advanceStuckLadder(session, fixedMethod, block, 'seat-1');
    expect(result?.step).toBe('swap');
    expect(result?.swapForm).toBe(true);
  });

  it('swapRoles exchanges roleIds between two seats', () => {
    const session = makeSession();
    session.participants[0].roleId = 'role-a';
    session.participants[1].roleId = 'role-b';

    swapRoles(session, 'seat-1', 'seat-2');

    expect(session.participants[0].roleId).toBe('role-b');
    expect(session.participants[1].roleId).toBe('role-a');
    expect(session.participants[0].swapsUsed).toBe(1);
    expect(session.participants[1].swapsUsed).toBe(1);
  });

  it('swapRoles cap enforced — second swap throws', () => {
    const session = makeSession();
    session.participants[0].roleId = 'role-a';
    session.participants[1].roleId = 'role-b';

    swapRoles(session, 'seat-1', 'seat-2');
    expect(() => swapRoles(session, 'seat-1', 'seat-2')).toThrow('Swap cap reached');
  });
});
