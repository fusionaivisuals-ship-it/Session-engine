import {
  frameToCommitSec,
  perBlock,
  wordsBySeat,
  shareBySeat,
  participationFlags,
  lensCoverage,
  stuckSummary,
  reviewSummary,
  modelUsage,
} from '../src/engine/metrics.js';
import type { SessionState, Method } from '../src/types.js';

// --- Fixtures ---

function makeMethod(overrides?: Partial<Method>): Method {
  return {
    id: 'test-method',
    name: 'Test Method',
    version: '0.1.0',
    roleMode: 'rotating',
    groupSize: { min: 2, max: 6 },
    timing: { totalBudgetSec: 3600, extensionSec: 60, idleSec: 90, presenceTimeoutSec: 120 },
    lenses: [
      { id: 'alpha', name: 'Alpha', instruction: 'Alpha lens' },
      { id: 'beta', name: 'Beta', instruction: 'Beta lens' },
    ],
    blocks: [
      { id: 'frame', type: 'frame', title: 'Frame', timeboxSec: 300, completion: 'all_agreed' },
      { id: 'alpha-input', type: 'private_input', title: 'Alpha Input', timeboxSec: 240, completion: 'all_submitted', lensId: 'alpha', minWords: 10 },
      { id: 'alpha-reveal', type: 'reveal', title: 'Alpha Reveal', timeboxSec: 180, completion: 'all_confirmed', lensId: 'alpha', sourceBlockId: 'alpha-input' },
      { id: 'beta-input', type: 'private_input', title: 'Beta Input', timeboxSec: 240, completion: 'all_submitted', lensId: 'beta', minWords: 15 },
      { id: 'beta-reveal', type: 'reveal', title: 'Beta Reveal', timeboxSec: 180, completion: 'all_confirmed', lensId: 'beta', sourceBlockId: 'beta-input' },
      { id: 'decide', type: 'converge', title: 'Decide', timeboxSec: 480, completion: 'reviewer_pass' },
      { id: 'commit', type: 'commit', title: 'Commit', timeboxSec: 300, completion: 'valid_form' },
      { id: 'artifact', type: 'artifact', title: 'Artifact', timeboxSec: 0, completion: 'auto' },
    ],
    ...overrides,
  };
}

function makeSession(overrides?: Partial<SessionState>): SessionState {
  const base = new Date('2026-09-17T10:00:00Z');
  return {
    roomCode: 'TEST01',
    methodId: 'test-method',
    methodVersion: '0.1.0',
    createdAt: base.toISOString(),
    status: 'complete',
    anonymous: false,
  mode: 'group',
    facilitatorSeat: 'seat-1',
    clock: {
      blockStartedAt: null,
      remainingSecAtPause: null,
      extensionsUsed: {},
      totalElapsedSec: 1800,
    },
    participants: [
      { seat: 'seat-1', displayName: 'Alice', presence: 'present', lastSeenAt: base.toISOString(), swapsUsed: 0 },
      { seat: 'seat-2', displayName: 'Bob', presence: 'present', lastSeenAt: base.toISOString(), swapsUsed: 0 },
      { seat: 'seat-3', displayName: 'Carol', presence: 'present', lastSeenAt: base.toISOString(), swapsUsed: 0 },
    ],
    currentBlockId: null,
    blocks: {
      'frame': {
        enteredAt: '2026-09-17T10:00:00Z',
        exitedAt: '2026-09-17T10:05:00Z',
        exitReason: 'gate',
        submissions: [],
        confirmations: ['seat-1', 'seat-2', 'seat-3'],
        stuckEvents: [],
      },
      'alpha-input': {
        enteredAt: '2026-09-17T10:05:00Z',
        exitedAt: '2026-09-17T10:09:00Z',
        exitReason: 'gate',
        submissions: [
          { seat: 'seat-1', text: 'This is a substantial input with enough words to count as substantive contribution', submittedAt: '2026-09-17T10:06:00Z', autoSubmitted: false, passed: false, wordCount: 14 },
          { seat: 'seat-2', text: 'Another substantial input that should also be counted as valid', submittedAt: '2026-09-17T10:07:00Z', autoSubmitted: false, passed: false, wordCount: 10 },
          { seat: 'seat-3', text: 'Third person writes something', submittedAt: '2026-09-17T10:08:00Z', autoSubmitted: false, passed: false, wordCount: 4 },
        ],
        stuckEvents: [],
      },
      'alpha-reveal': {
        enteredAt: '2026-09-17T10:09:00Z',
        exitedAt: '2026-09-17T10:12:00Z',
        exitReason: 'gate',
        confirmations: ['seat-1', 'seat-2', 'seat-3'],
        stuckEvents: [],
      },
      'beta-input': {
        enteredAt: '2026-09-17T10:12:00Z',
        exitedAt: '2026-09-17T10:16:00Z',
        exitReason: 'gate',
        submissions: [
          { seat: 'seat-1', text: 'Alice writes a lot more here because she has a lot to say about this topic and wants to be thorough in her analysis of the beta lens', submittedAt: '2026-09-17T10:13:00Z', autoSubmitted: false, passed: false, wordCount: 28 },
          { seat: 'seat-2', text: 'Bob has some good ideas about this topic too and wants to share them', submittedAt: '2026-09-17T10:14:00Z', autoSubmitted: false, passed: false, wordCount: 14 },
          { seat: 'seat-3', text: 'Short', submittedAt: '2026-09-17T10:15:00Z', autoSubmitted: false, passed: false, wordCount: 1 },
        ],
        stuckEvents: [],
      },
      'beta-reveal': {
        enteredAt: '2026-09-17T10:16:00Z',
        exitedAt: '2026-09-17T10:19:00Z',
        exitReason: 'gate',
        confirmations: ['seat-1', 'seat-2', 'seat-3'],
        stuckEvents: [],
      },
      'decide': {
        enteredAt: '2026-09-17T10:19:00Z',
        exitedAt: '2026-09-17T10:27:00Z',
        exitReason: 'gate',
        decision: 'We chose option A',
        reviewerVerdicts: [
          { pass: true, scores: [{ criterion: 'c1', score: 2, evidence: 'good' }], ignoredLenses: [], oneLineFeedback: 'Good', confidence: 0.9, at: '2026-09-17T10:26:00Z' },
        ],
        stuckEvents: [],
      },
      'commit': {
        enteredAt: '2026-09-17T10:27:00Z',
        exitedAt: '2026-09-17T10:30:00Z',
        exitReason: 'gate',
        submissions: [{ seat: 'seat-1', text: '{"owner":"Alice"}', submittedAt: '2026-09-17T10:29:00Z', autoSubmitted: false, passed: false, wordCount: 1 }],
        stuckEvents: [],
      },
      'artifact': {
        enteredAt: '2026-09-17T10:30:00Z',
        exitedAt: '2026-09-17T10:30:01Z',
        exitReason: 'auto',
        stuckEvents: [],
      },
    },
    facts: {
      problemStatement: 'We need to fix X because Y',
      decision: 'We chose option A',
      commitment: { owner: 'Alice', firstAction: 'Do the thing', dueDate: '2026-10-01', successSignal: 'Done' },
    },
    metrics: {
      frameToCommitSec: null,
      wordsBySeat: {},
      lensCoverage: {},
      modelCalls: [],
    },
  };
}

// --- Tests ---

describe('metrics', () => {
  const method = makeMethod();

  test('frameToCommitSec computes seconds from frame entry to commit exit', () => {
    const session = makeSession();
    const result = frameToCommitSec(session, method);
    // 10:00:00 to 10:30:00 = 1800 seconds
    expect(result).toBe(1800);
  });

  test('frameToCommitSec returns null when commit has no exitedAt', () => {
    const session = makeSession();
    session.blocks['commit'].exitedAt = null;
    expect(frameToCommitSec(session, method)).toBeNull();
  });

  test('perBlock returns elapsed, timebox, exit reason for each block', () => {
    const session = makeSession();
    const result = perBlock(session, method);
    expect(result).toHaveLength(8);
    // frame: 5 min = 300 sec
    expect(result[0]).toMatchObject({ blockId: 'frame', elapsedSec: 300, timeboxSec: 300, exitReason: 'gate' });
    // alpha-input: 4 min = 240 sec
    expect(result[1]).toMatchObject({ blockId: 'alpha-input', elapsedSec: 240, exitReason: 'gate' });
    // artifact: auto
    expect(result[7]).toMatchObject({ blockId: 'artifact', exitReason: 'auto' });
  });

  test('perBlock includes extensions and override reasons', () => {
    const session = makeSession();
    session.clock.extensionsUsed['decide'] = 2;
    session.blocks['decide'].exitReason = 'facilitator_override';
    session.blocks['decide'].overrideReason = 'Time is up';
    const result = perBlock(session, method);
    const decide = result.find(b => b.blockId === 'decide')!;
    expect(decide.extensionsUsed).toBe(2);
    expect(decide.overrideReason).toBe('Time is up');
    expect(decide.exitReason).toBe('facilitator_override');
  });

  test('wordsBySeat counts words from private_input, excludes passed and auto-submitted', () => {
    const session = makeSession();
    const result = wordsBySeat(session, method);
    // seat-1: 14 + 28 = 42
    expect(result['seat-1']).toBe(42);
    // seat-2: 10 + 14 = 24
    expect(result['seat-2']).toBe(24);
    // seat-3: 4 + 1 = 5
    expect(result['seat-3']).toBe(5);
  });

  test('wordsBySeat treats passed submissions as 0 words', () => {
    const session = makeSession();
    // Make seat-3 pass both blocks
    session.blocks['alpha-input'].submissions![2].passed = true;
    session.blocks['alpha-input'].submissions![2].passReason = 'stuck';
    session.blocks['beta-input'].submissions![2].passed = true;
    session.blocks['beta-input'].submissions![2].passReason = 'stuck';
    const result = wordsBySeat(session, method);
    expect(result['seat-3']).toBe(0);
  });

  test('shareBySeat computes fractional shares, only present seats', () => {
    const session = makeSession();
    const result = shareBySeat(session, method);
    // total = 42 + 24 + 5 = 71
    expect(result['seat-1']).toBeCloseTo(42 / 71, 2);
    expect(result['seat-2']).toBeCloseTo(24 / 71, 2);
    expect(result['seat-3']).toBeCloseTo(5 / 71, 2);
  });

  test('shareBySeat excludes absent seats during running session', () => {
    const session = makeSession();
    session.status = 'running';
    session.participants[2].presence = 'absent';
    const result = shareBySeat(session, method);
    // Only seat-1 and seat-2 counted; seat-3 absent
    expect(result['seat-3']).toBeUndefined();
    const total = 42 + 24; // only present seats' words
    expect(result['seat-1']).toBeCloseTo(42 / total, 2);
  });

  test('shareBySeat includes all seats for completed session even if absent', () => {
    const session = makeSession();
    session.status = 'complete';
    session.participants[2].presence = 'absent';
    const result = shareBySeat(session, method);
    // All seats included for completed sessions
    expect(result['seat-3']).toBeDefined();
    const total = 42 + 24 + 5;
    expect(result['seat-1']).toBeCloseTo(42 / total, 2);
    expect(result['seat-3']).toBeCloseTo(5 / total, 2);
  });

  test('participationFlags detects dominant and quiet seats', () => {
    const session = makeSession();
    const flags = participationFlags(session, method);
    // seat-1: 42/71 = 59% → dominant
    // seat-3: 5/71 = 7% → quiet
    expect(flags.some(f => f.seat === 'seat-1' && f.flag === 'dominant')).toBe(true);
    expect(flags.some(f => f.seat === 'seat-3' && f.flag === 'quiet')).toBe(true);
    expect(flags.some(f => f.seat === 'seat-2' && (f.flag === 'dominant' || f.flag === 'quiet'))).toBe(false);
  });

  test('participationFlags detects multi_pass (2+ passes)', () => {
    const session = makeSession();
    session.blocks['alpha-input'].submissions![2].passed = true;
    session.blocks['beta-input'].submissions![2].passed = true;
    const flags = participationFlags(session, method);
    expect(flags.some(f => f.seat === 'seat-3' && f.flag === 'multi_pass')).toBe(true);
  });

  test('lensCoverage rotating: substantive when median >= minWords', () => {
    const session = makeSession();
    const result = lensCoverage(session, method);
    // alpha: minWords=10, submissions [14, 10, 4], median=10 → substantive
    const alpha = result.find(e => e.lensOrRoleId === 'alpha')!;
    expect(alpha.coverage).toBe('substantive');
  });

  test('lensCoverage rotating: token when median < minWords', () => {
    const session = makeSession();
    // Set all alpha submissions below minWords
    session.blocks['alpha-input'].submissions![0].wordCount = 3;
    session.blocks['alpha-input'].submissions![1].wordCount = 2;
    session.blocks['alpha-input'].submissions![2].wordCount = 1;
    const result = lensCoverage(session, method);
    const alpha = result.find(e => e.lensOrRoleId === 'alpha')!;
    expect(alpha.coverage).toBe('token');
  });

  test('lensCoverage: pass when majority passed', () => {
    const session = makeSession();
    session.blocks['alpha-input'].submissions![0].passed = true;
    session.blocks['alpha-input'].submissions![1].passed = true;
    // 2 of 3 passed = majority
    const result = lensCoverage(session, method);
    const alpha = result.find(e => e.lensOrRoleId === 'alpha')!;
    expect(alpha.coverage).toBe('pass');
  });

  test('lensCoverage fixed mode: per role', () => {
    const fixedMethod = makeMethod({
      roleMode: 'fixed',
      roles: [
        { id: 'role-a', name: 'Role A', brief: 'A' },
        { id: 'role-b', name: 'Role B', brief: 'B' },
      ],
      lenses: undefined,
      blocks: [
        { id: 'frame', type: 'frame', title: 'Frame', timeboxSec: 300, completion: 'all_agreed' },
        { id: 'input1', type: 'private_input', title: 'Input', timeboxSec: 240, completion: 'all_submitted', minWords: 10 },
        { id: 'commit', type: 'commit', title: 'Commit', timeboxSec: 300, completion: 'valid_form' },
      ],
    });
    const session = makeSession();
    session.participants[0].roleId = 'role-a';
    session.participants[1].roleId = 'role-b';
    session.participants[2].roleId = 'role-a';
    session.blocks = {
      'frame': { enteredAt: '2026-09-17T10:00:00Z', exitedAt: '2026-09-17T10:05:00Z', exitReason: 'gate', stuckEvents: [] },
      'input1': {
        enteredAt: '2026-09-17T10:05:00Z', exitedAt: '2026-09-17T10:09:00Z', exitReason: 'gate',
        submissions: [
          { seat: 'seat-1', text: 'lots of words here enough to be substantive for the role', submittedAt: '2026-09-17T10:06:00Z', autoSubmitted: false, passed: false, wordCount: 12 },
          { seat: 'seat-2', text: 'short', submittedAt: '2026-09-17T10:07:00Z', autoSubmitted: false, passed: false, wordCount: 1 },
          { seat: 'seat-3', text: 'also lots of words from seat three to make role a substantive', submittedAt: '2026-09-17T10:08:00Z', autoSubmitted: false, passed: false, wordCount: 12 },
        ],
        stuckEvents: [],
      },
      'commit': { enteredAt: '2026-09-17T10:09:00Z', exitedAt: '2026-09-17T10:12:00Z', exitReason: 'gate', stuckEvents: [] },
    };
    const result = lensCoverage(session, fixedMethod);
    const roleA = result.find(e => e.lensOrRoleId === 'role-a')!;
    const roleB = result.find(e => e.lensOrRoleId === 'role-b')!;
    expect(roleA.coverage).toBe('substantive'); // median of [12, 12] = 12 >= 10
    expect(roleB.coverage).toBe('token');       // median of [1] = 1 < 10
  });

  test('stuckSummary collects steps and swaps per seat', () => {
    const session = makeSession();
    session.blocks['alpha-input'].stuckEvents = [
      { seat: 'seat-2', step: 'hint', at: '2026-09-17T10:06:00Z' },
      { seat: 'seat-2', step: 'example', at: '2026-09-17T10:07:00Z' },
    ];
    session.participants[1].swapsUsed = 1;
    const result = stuckSummary(session, method);
    const bob = result.find(s => s.seat === 'seat-2')!;
    expect(bob.steps).toEqual(['hint', 'example']);
    expect(bob.swapsUsed).toBe(1);
  });

  test('reviewSummary reports verdicts, reruns, final exit', () => {
    const session = makeSession();
    const result = reviewSummary(session, method);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      blockId: 'decide',
      verdicts: 1,
      reruns: 0,
      finalPass: true,
      finalExit: 'gate',
    });
  });

  test('reviewSummary with reruns and override', () => {
    const session = makeSession();
    session.blocks['decide'].reviewerVerdicts = [
      { pass: false, scores: [], ignoredLenses: ['alpha'], oneLineFeedback: 'Bad', confidence: 0.5, at: '2026-09-17T10:22:00Z' },
      { pass: false, scores: [], ignoredLenses: [], oneLineFeedback: 'Still bad', confidence: 0.6, at: '2026-09-17T10:24:00Z' },
      { pass: false, scores: [], ignoredLenses: [], oneLineFeedback: 'Nope', confidence: 0.7, at: '2026-09-17T10:26:00Z' },
    ];
    session.blocks['decide'].exitReason = 'facilitator_override';
    const result = reviewSummary(session, method);
    expect(result[0].verdicts).toBe(3);
    expect(result[0].reruns).toBe(2);
    expect(result[0].finalPass).toBe(false);
    expect(result[0].finalExit).toBe('facilitator_override');
  });

  test('modelUsage sums calls and tokens', () => {
    const session = makeSession();
    session.metrics.modelCalls = [
      { tool: 'hint', model: 'test', inputTokens: 100, outputTokens: 50, at: '2026-09-17T10:06:00Z', retried: false },
      { tool: 'cluster', model: 'test', inputTokens: 200, outputTokens: 100, at: '2026-09-17T10:09:00Z', retried: true },
    ];
    const result = modelUsage(session);
    expect(result.totalCalls).toBe(2);
    expect(result.totalInputTokens).toBe(300);
    expect(result.totalOutputTokens).toBe(150);
  });

  test('modelUsage returns zeros when no calls', () => {
    const session = makeSession();
    session.metrics.modelCalls = [];
    const result = modelUsage(session);
    expect(result).toEqual({ totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0 });
  });

  test('all-seats-passed edge case: lensCoverage returns pass', () => {
    const session = makeSession();
    for (const sub of session.blocks['alpha-input'].submissions!) {
      sub.passed = true;
      sub.passReason = 'stuck';
    }
    const result = lensCoverage(session, method);
    const alpha = result.find(e => e.lensOrRoleId === 'alpha')!;
    expect(alpha.coverage).toBe('pass');
  });

  test('session ended by override at converge', () => {
    const session = makeSession();
    session.blocks['decide'].exitReason = 'facilitator_override';
    session.blocks['decide'].overrideReason = 'Group is stuck';
    const blocks = perBlock(session, method);
    const decide = blocks.find(b => b.blockId === 'decide')!;
    expect(decide.exitReason).toBe('facilitator_override');
    expect(decide.overrideReason).toBe('Group is stuck');
    // Review summary still works
    const reviews = reviewSummary(session, method);
    expect(reviews[0].finalExit).toBe('facilitator_override');
  });
});
