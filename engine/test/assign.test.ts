import { canAdvance } from '../src/engine/gates.js';
import { createSession, addParticipant, startSession, enterBlock } from '../src/engine/session.js';
import type { Method, SessionState } from '../src/types.js';

function makeFixedMethod(overrides?: Partial<Method>): Method {
  return {
    id: 'test-fixed',
    name: 'Test Fixed',
    version: '0.1.0',
    roleMode: 'fixed',
    groupSize: { min: 2, max: 6 },
    timing: { totalBudgetSec: 3600, extensionSec: 60, idleSec: 90, presenceTimeoutSec: 120 },
    roles: [
      { id: 'role-a', name: 'Role A', brief: 'Brief A' },
      { id: 'role-b', name: 'Role B', brief: 'Brief B' },
      { id: 'role-c', name: 'Role C', brief: 'Brief C', hiddenBrief: 'Secret C' },
    ],
    blocks: [
      { id: 'assign', type: 'assign', title: 'Assign', timeboxSec: 120, completion: 'all_assigned', assignStrategy: 'random' },
      { id: 'b2', type: 'private_input', title: 'Input', timeboxSec: 120, completion: 'all_submitted', prompt: 'Write' },
    ],
    ...overrides,
  };
}

function setup(method: Method): SessionState {
  const session = createSession(method, 'TST01');
  addParticipant(session, 'Alice');
  addParticipant(session, 'Bob');
  return session;
}

describe('assign block', () => {
  test('all_assigned gate: fails when no roles assigned', () => {
    const method = makeFixedMethod();
    const session = setup(method);
    startSession(session, method);
    const block = method.blocks[0]; // assign block
    const result = canAdvance(session, block);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('not assigned');
  });

  test('all_assigned gate: fails when partial assignment', () => {
    const method = makeFixedMethod();
    const session = setup(method);
    startSession(session, method);
    session.participants[0].roleId = 'role-a';
    const block = method.blocks[0];
    const result = canAdvance(session, block);
    expect(result.ok).toBe(false);
  });

  test('all_assigned gate: passes when all active seats assigned', () => {
    const method = makeFixedMethod();
    const session = setup(method);
    startSession(session, method);
    session.participants[0].roleId = 'role-a';
    session.participants[1].roleId = 'role-b';
    const block = method.blocks[0];
    const result = canAdvance(session, block);
    expect(result.ok).toBe(true);
  });

  test('all_assigned gate: absent seats do not block', () => {
    const method = makeFixedMethod();
    const session = setup(method);
    startSession(session, method);
    session.participants[0].roleId = 'role-a';
    session.participants[1].presence = 'absent';
    const block = method.blocks[0];
    const result = canAdvance(session, block);
    expect(result.ok).toBe(true);
  });

  test('random assignment assigns all seats', () => {
    const method = makeFixedMethod();
    const session = setup(method);
    startSession(session, method);
    // Simulate random assign: shuffle roles and deal
    const roles = method.roles!;
    const active = session.participants.filter(p => p.presence !== 'absent');
    for (let i = 0; i < active.length; i++) {
      active[i].roleId = roles[i % roles.length].id;
    }
    // All should be assigned
    for (const p of active) {
      expect(p.roleId).toBeTruthy();
    }
    const block = method.blocks[0];
    expect(canAdvance(session, block).ok).toBe(true);
  });

  test('choose: first-come assigns one role at a time', () => {
    const method = makeFixedMethod({
      blocks: [
        { id: 'assign', type: 'assign', title: 'Assign', timeboxSec: 120, completion: 'all_assigned', assignStrategy: 'choose' },
        { id: 'b2', type: 'private_input', title: 'Input', timeboxSec: 120, completion: 'all_submitted', prompt: 'Write' },
      ],
    });
    const session = setup(method);
    startSession(session, method);

    // Alice picks role-a
    session.participants[0].roleId = 'role-a';
    expect(canAdvance(session, method.blocks[0]).ok).toBe(false); // Bob not assigned yet

    // Bob picks role-b
    session.participants[1].roleId = 'role-b';
    expect(canAdvance(session, method.blocks[0]).ok).toBe(true);
  });

  test('roles persist across blocks', () => {
    const method = makeFixedMethod();
    const session = setup(method);
    startSession(session, method);
    session.participants[0].roleId = 'role-a';
    session.participants[1].roleId = 'role-b';

    // Advance to next block
    enterBlock(session, method.blocks[1]);

    // Roles should still be set
    expect(session.participants[0].roleId).toBe('role-a');
    expect(session.participants[1].roleId).toBe('role-b');
  });
});
