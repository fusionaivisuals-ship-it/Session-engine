import { createSession, addParticipant, startSession } from '../src/engine/session.js';
import { canAdvance } from '../src/engine/gates.js';
import { nextStep } from '../src/engine/stuck.js';
import type { Method, SessionState } from '../src/types.js';

function makeMethod(roleMode: 'rotating' | 'fixed' = 'rotating'): Method {
  return {
    id: 'test-method', name: 'Test', version: '1', roleMode,
    groupSize: { min: 2, max: 6 },
    timing: { totalBudgetSec: 3600, extensionSec: 60, idleSec: 90, presenceTimeoutSec: 120 },
    lenses: [{ id: 'l1', name: 'Lens 1', instruction: 'Think' }],
    blocks: [
      { id: 'frame', type: 'frame', title: 'Frame', timeboxSec: 120, completion: 'all_agreed' },
      { id: 'input1', type: 'private_input', title: 'Input', timeboxSec: 180, completion: 'all_submitted', lensId: 'l1', prompt: 'Write.', helper: { systemPrompt: 'Help.' } },
      { id: 'reveal1', type: 'reveal', title: 'Reveal', timeboxSec: 60, completion: 'all_confirmed' },
      { id: 'converge', type: 'converge', title: 'Converge', timeboxSec: 120, completion: 'reviewer_pass', rubric: { passThreshold: 4, criteria: [{ id: 'c1', text: 'Covers all' }] } },
      { id: 'commit', type: 'commit', title: 'Commit', timeboxSec: 60, completion: 'valid_form' },
    ],
  };
}

describe('solo mode', () => {
  describe('session creation', () => {
    it('creates a solo session with mode=solo', () => {
      const method = makeMethod();
      const session = createSession(method, 'SOLO01', { mode: 'solo' });
      expect(session.mode).toBe('solo');
    });

    it('defaults to group mode', () => {
      const method = makeMethod();
      const session = createSession(method, 'GRP01');
      expect(session.mode).toBe('group');
    });

    it('rejects solo mode for fixed-role methods', () => {
      const method = makeMethod('fixed');
      expect(() => createSession(method, 'SOLO02', { mode: 'solo' })).toThrow('rotating-mode');
    });
  });

  describe('solo start', () => {
    it('starts with one participant in solo mode', () => {
      const method = makeMethod();
      const session = createSession(method, 'SOLO03', { mode: 'solo' });
      addParticipant(session, 'Solo Player');
      startSession(session, method);
      expect(session.status).toBe('running');
      expect(session.currentBlockId).toBe('frame');
    });

    it('refuses to start group session with one participant', () => {
      const method = makeMethod();
      const session = createSession(method, 'GRP02', { mode: 'group' });
      addParticipant(session, 'Lone Player');
      expect(() => startSession(session, method)).toThrow('at least 2');
    });
  });

  describe('solo gates', () => {
    it('all_agreed gate passes with one seat in solo', () => {
      const method = makeMethod();
      const session = createSession(method, 'SOLO04', { mode: 'solo' });
      addParticipant(session, 'Player');
      startSession(session, method);

      const block = method.blocks[0]; // frame
      session.blocks[block.id].confirmations = ['seat-1'];
      const result = canAdvance(session, block);
      expect(result.ok).toBe(true);
    });

    it('all_submitted gate passes with one submission in solo', () => {
      const method = makeMethod();
      const session = createSession(method, 'SOLO05', { mode: 'solo' });
      addParticipant(session, 'Player');
      startSession(session, method);

      const block = method.blocks[1]; // private_input
      // Manually enter the block
      session.currentBlockId = block.id;
      session.blocks[block.id] = { enteredAt: new Date().toISOString(), exitReason: 'pending', submissions: [{ seat: 'seat-1', text: 'My answer', submittedAt: new Date().toISOString(), autoSubmitted: false, passed: false, wordCount: 2 }], confirmations: [], stuckEvents: [] };

      const result = canAdvance(session, block);
      expect(result.ok).toBe(true);
    });

    it('all_confirmed gate passes with one confirmation in solo', () => {
      const method = makeMethod();
      const session = createSession(method, 'SOLO06', { mode: 'solo' });
      addParticipant(session, 'Player');
      startSession(session, method);

      const block = method.blocks[2]; // reveal
      session.currentBlockId = block.id;
      session.blocks[block.id] = { enteredAt: new Date().toISOString(), exitReason: 'pending', submissions: [], confirmations: ['seat-1'], stuckEvents: [] };

      const result = canAdvance(session, block);
      expect(result.ok).toBe(true);
    });
  });

  describe('solo stuck ladder', () => {
    it('offers hint, example, pass — no swap or facilitator', () => {
      const method = makeMethod();
      const session = createSession(method, 'SOLO07', { mode: 'solo' });
      addParticipant(session, 'Player');
      startSession(session, method);

      const blockId = 'input1';
      session.currentBlockId = blockId;
      session.blocks[blockId] = { enteredAt: new Date().toISOString(), exitReason: 'pending', submissions: [], confirmations: [], stuckEvents: [] };

      // Step 1: hint
      expect(nextStep(session, blockId, 'seat-1', 'rotating')).toBe('hint');
      session.blocks[blockId].stuckEvents!.push({ seat: 'seat-1', step: 'hint', at: new Date().toISOString() });

      // Step 2: example
      expect(nextStep(session, blockId, 'seat-1', 'rotating')).toBe('example');
      session.blocks[blockId].stuckEvents!.push({ seat: 'seat-1', step: 'example', at: new Date().toISOString() });

      // Step 3: pass
      expect(nextStep(session, blockId, 'seat-1', 'rotating')).toBe('pass');
      session.blocks[blockId].stuckEvents!.push({ seat: 'seat-1', step: 'pass', at: new Date().toISOString() });

      // No more steps (no facilitator in solo)
      expect(nextStep(session, blockId, 'seat-1', 'rotating')).toBe(null);
    });

    it('group mode still has facilitator step', () => {
      const method = makeMethod();
      const session = createSession(method, 'GRP03', { mode: 'group' });
      addParticipant(session, 'Alice');
      addParticipant(session, 'Bob');

      const blockId = 'input1';
      session.currentBlockId = blockId;
      session.blocks[blockId] = { enteredAt: new Date().toISOString(), exitReason: 'pending', submissions: [], confirmations: [], stuckEvents: [] };

      session.blocks[blockId].stuckEvents!.push({ seat: 'seat-1', step: 'hint', at: new Date().toISOString() });
      session.blocks[blockId].stuckEvents!.push({ seat: 'seat-1', step: 'example', at: new Date().toISOString() });
      session.blocks[blockId].stuckEvents!.push({ seat: 'seat-1', step: 'pass', at: new Date().toISOString() });

      // Group still has facilitator
      expect(nextStep(session, blockId, 'seat-1', 'rotating')).toBe('facilitator');
    });
  });
});
