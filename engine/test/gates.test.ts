import { canAdvance } from '../src/engine/gates.js';
import { createSession, addParticipant, startSession, enterBlock, advanceBlock } from '../src/engine/session.js';
import type { Method, MethodBlock, SessionState } from '../src/types.js';

function makeMethod(overrides?: Partial<Method>): Method {
  return {
    id: 'test-method',
    name: 'Test',
    version: '0.1.0',
    roleMode: 'rotating',
    groupSize: { min: 2, max: 6 },
    timing: { totalBudgetSec: 600, extensionSec: 60, idleSec: 90, presenceTimeoutSec: 120 },
    lenses: [{ id: 'lens-a', name: 'Lens A', instruction: 'Think about A' }],
    blocks: [
      { id: 'b1', type: 'frame', title: 'Frame', timeboxSec: 120, completion: 'all_agreed', lensId: 'lens-a', prompt: 'Frame it' },
      { id: 'b2', type: 'private_input', title: 'Input', timeboxSec: 120, completion: 'all_submitted', lensId: 'lens-a', prompt: 'Write' },
      { id: 'b3', type: 'reveal', title: 'Reveal', timeboxSec: 60, completion: 'all_confirmed', lensId: 'lens-a', sourceBlockId: 'b2' },
      { id: 'b4', type: 'converge', title: 'Decide', timeboxSec: 120, completion: 'reviewer_pass', lensId: 'lens-a', sourceBlockId: 'b3' },
      { id: 'b5', type: 'commit', title: 'Commit', timeboxSec: 120, completion: 'valid_form', lensId: 'lens-a' },
      { id: 'b6', type: 'artifact', title: 'Done', timeboxSec: 0, completion: 'auto' },
    ],
    ...overrides,
  };
}

function setupSession(method: Method): SessionState {
  const session = createSession(method, 'TEST01');
  addParticipant(session, 'Alice');
  addParticipant(session, 'Bob');
  return session;
}

describe('canAdvance gate checks', () => {
  const method = makeMethod();

  test('all_agreed: fails when no agreements', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[0]; // frame, all_agreed
    const result = canAdvance(session, block);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('agreement');
  });

  test('all_agreed: fails when partial agreements', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[0];
    session.blocks[block.id].confirmations = ['seat-1'];
    const result = canAdvance(session, block);
    expect(result.ok).toBe(false);
  });

  test('all_agreed: passes when all active seats agreed', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[0];
    session.blocks[block.id].confirmations = ['seat-1', 'seat-2'];
    const result = canAdvance(session, block);
    expect(result.ok).toBe(true);
  });

  test('all_agreed: absent seats do not block', () => {
    const session = setupSession(method);
    startSession(session, method);
    session.participants[1].presence = 'absent';
    const block = method.blocks[0];
    session.blocks[block.id].confirmations = ['seat-1'];
    const result = canAdvance(session, block);
    expect(result.ok).toBe(true);
  });

  test('all_submitted: fails when nobody submitted', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[1]; // private_input, all_submitted
    enterBlock(session, block);
    const result = canAdvance(session, block);
    expect(result.ok).toBe(false);
  });

  test('all_submitted: passes when all active seats submitted', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[1];
    enterBlock(session, block);
    session.blocks[block.id].submissions = [
      { seat: 'seat-1', text: 'stuff', submittedAt: new Date().toISOString(), autoSubmitted: false, passed: false, wordCount: 1 },
      { seat: 'seat-2', text: 'more', submittedAt: new Date().toISOString(), autoSubmitted: false, passed: false, wordCount: 1 },
    ];
    const result = canAdvance(session, block);
    expect(result.ok).toBe(true);
  });

  test('all_confirmed: fails when nobody confirmed', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[2]; // reveal, all_confirmed
    enterBlock(session, block);
    const result = canAdvance(session, block);
    expect(result.ok).toBe(false);
  });

  test('all_confirmed: passes when all confirmed', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[2];
    enterBlock(session, block);
    session.blocks[block.id].confirmations = ['seat-1', 'seat-2'];
    const result = canAdvance(session, block);
    expect(result.ok).toBe(true);
  });

  test('reviewer_pass: fails when no verdict exists', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[3]; // converge, reviewer_pass
    enterBlock(session, block);
    const result = canAdvance(session, block);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Awaiting a deliberate decision');
  });

  test('reviewer_pass: favorable advice alone does not open the gate', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[3];
    enterBlock(session, block);
    session.blocks[block.id].reviewerVerdicts = [{
      pass: true, scores: [], ignoredLenses: [],
      oneLineFeedback: 'Good', confidence: 0.8, at: new Date().toISOString(),
    }];
    const result = canAdvance(session, block);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Awaiting a deliberate decision');
  });

  test('reviewer_pass: stays closed when latest verdict fails', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[3];
    enterBlock(session, block);
    session.blocks[block.id].reviewerVerdicts = [{
      pass: false, scores: [], ignoredLenses: [],
      oneLineFeedback: 'Needs work', confidence: 0.7, at: new Date().toISOString(),
    }];
    const result = canAdvance(session, block);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Awaiting a deliberate decision');
  });

  test('reviewer_pass: deliberate acceptance opens the gate after advice', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[3];
    enterBlock(session, block);
    session.blocks[block.id].reviewerVerdicts = [
      { pass: false, scores: [], ignoredLenses: [], oneLineFeedback: 'Bad', confidence: 0.6, at: new Date().toISOString() },
      { pass: true, scores: [], ignoredLenses: [], oneLineFeedback: 'Fixed', confidence: 0.8, at: new Date().toISOString() },
    ];
    session.blocks[block.id].decision = 'Run a trial';
    session.blocks[block.id].decisionAcceptance = { seat: 'seat-1', decision: 'Run a trial', round: 0, reason: '', at: new Date().toISOString() };
    const result = canAdvance(session, block);
    expect(result.ok).toBe(true);
  });

  test('valid_form: fails when no commitment', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[4]; // commit, valid_form
    enterBlock(session, block);
    const result = canAdvance(session, block);
    expect(result.ok).toBe(false);
  });

  test('valid_form: passes when commitment is complete', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[4];
    enterBlock(session, block);
    session.blocks[block.id].submissions = [
      { seat: 'seat-1', text: 'committed', submittedAt: new Date().toISOString(), autoSubmitted: false, passed: false, wordCount: 1 },
    ];
    session.facts.commitment = {
      owner: 'Alice',
      firstAction: 'Do the thing',
      dueDate: '2026-10-01',
      successSignal: 'Thing is done',
    };
    const result = canAdvance(session, block);
    expect(result.ok).toBe(true);
  });

  test('reviewer_pass: facilitator override advances and records reason', () => {
    const session = setupSession(method);
    startSession(session, method);
    // Navigate to converge block
    const convergeBlock = method.blocks[3];
    enterBlock(session, convergeBlock);
    session.currentBlockId = convergeBlock.id;
    // Gate is closed (no verdict)
    expect(canAdvance(session, convergeBlock).ok).toBe(false);
    // Facilitator overrides
    advanceBlock(session, method, 'facilitator_override', 'Team agreed verbally');
    // Block record should have override reason
    expect(session.blocks[convergeBlock.id].exitReason).toBe('facilitator_override');
    expect(session.blocks[convergeBlock.id].overrideReason).toBe('Team agreed verbally');
    // Session moved to next block
    expect(session.currentBlockId).toBe('b5');
  });

  test('auto: always passes', () => {
    const session = setupSession(method);
    startSession(session, method);
    const block = method.blocks[5]; // artifact, auto
    enterBlock(session, block);
    const result = canAdvance(session, block);
    expect(result.ok).toBe(true);
  });
});
