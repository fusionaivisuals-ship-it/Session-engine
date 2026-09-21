import {
  evaluateTrigger,
  shouldTriggerConvergeFailedTwice,
  shouldTriggerIdeasThin,
  buildProposal,
  acceptDetour,
  declineDetour,
} from '../src/engine/detour';
import type { SessionState, Method, MethodFallback } from '../src/types';

// Minimal detour method for testing
const detourMethod: Method = {
  id: 'idea-round',
  name: 'Idea Round',
  version: '1.0.0',
  roleMode: 'rotating',
  groupSize: { min: 2, max: 6 },
  timing: { totalBudgetSec: 360, extensionSec: 60, idleSec: 90, presenceTimeoutSec: 120 },
  lenses: [{ id: 'provocation', name: 'Provocation', instruction: 'Break the rules', colour: '#ff6600' }],
  blocks: [
    { id: 'ideas-input', type: 'private_input', title: 'Provoke', timeboxSec: 180, completion: 'all_submitted', lensId: 'provocation', minWords: 5 },
    { id: 'ideas-reveal', type: 'reveal', title: 'Provocations', timeboxSec: 180, completion: 'all_confirmed', lensId: 'provocation', sourceBlockId: 'ideas-input' },
    { id: 'dummy-decide', type: 'converge', title: 'Dummy', timeboxSec: 0, completion: 'auto' },
  ],
};

// Write detour method file for loadMethod to find
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { setMethodsDir } from '../src/engine/methods';

const testMethodsDir = mkdtempSync(resolve(tmpdir(), 'method-detour-test-'));
beforeAll(() => {
  setMethodsDir(testMethodsDir);
  writeFileSync(resolve(testMethodsDir, 'idea-round.json'), JSON.stringify(detourMethod, null, 2));
});
afterAll(() => rmSync(testMethodsDir, { recursive: true, force: true }));

const fallback: MethodFallback = {
  trigger: 'ideas_thin',
  detourMethodId: 'idea-round',
  blockIds: ['ideas-input', 'ideas-reveal'],
  reason: 'Ideas were thin; try another idea round.',
};

function makeMethod(): Method {
  return {
    id: 'test-method',
    name: 'Test Method',
    version: '1.0.0',
    roleMode: 'rotating',
    groupSize: { min: 2, max: 6 },
    timing: { totalBudgetSec: 3600, extensionSec: 60, idleSec: 90, presenceTimeoutSec: 120 },
    lenses: [{ id: 'lens-a', name: 'Lens A', instruction: 'Do A' }],
    blocks: [
      { id: 'frame', type: 'frame', title: 'Frame', timeboxSec: 300, completion: 'all_agreed' },
      { id: 'input-a', type: 'private_input', title: 'Input A', timeboxSec: 240, completion: 'all_submitted', lensId: 'lens-a', minWords: 10, ideaBlock: true },
      { id: 'reveal-a', type: 'reveal', title: 'Reveal A', timeboxSec: 180, completion: 'all_confirmed', sourceBlockId: 'input-a' },
      { id: 'decide', type: 'converge', title: 'Decide', timeboxSec: 480, completion: 'reviewer_pass' },
      { id: 'commit', type: 'commit', title: 'Commit', timeboxSec: 300, completion: 'valid_form' },
      { id: 'artifact', type: 'artifact', title: 'Artifact', timeboxSec: 0, completion: 'auto' },
    ],
    fallbacks: [
      fallback,
      { trigger: 'converge_failed_twice', detourMethodId: 'idea-round', blockIds: ['ideas-input', 'ideas-reveal'], reason: 'Converge failed twice.' },
      { trigger: 'facilitator', detourMethodId: 'idea-round', blockIds: ['ideas-input', 'ideas-reveal'], reason: 'Facilitator requested.' },
    ],
  };
}

function makeSession(): SessionState {
  return {
    roomCode: 'DET001',
    methodId: 'test-method',
    methodVersion: '1.0.0',
    createdAt: '2026-09-18T10:00:00Z',
    status: 'running',
    anonymous: false,
  mode: 'group',
    facilitatorSeat: 'seat-1',
    clock: { blockStartedAt: '2026-09-18T10:00:00Z', remainingSecAtPause: null, extensionsUsed: {}, totalElapsedSec: 300 },
    participants: [
      { seat: 'seat-1', displayName: 'Alice', presence: 'present', lastSeenAt: '2026-09-18T10:05:00Z', swapsUsed: 0 },
      { seat: 'seat-2', displayName: 'Bob', presence: 'present', lastSeenAt: '2026-09-18T10:05:00Z', swapsUsed: 0 },
      { seat: 'seat-3', displayName: 'Carol', presence: 'present', lastSeenAt: '2026-09-18T10:05:00Z', swapsUsed: 0 },
      { seat: 'seat-4', displayName: 'Dave', presence: 'present', lastSeenAt: '2026-09-18T10:05:00Z', swapsUsed: 0 },
    ],
    currentBlockId: 'decide',
    blocks: {
      'frame': { enteredAt: '2026-09-18T10:00:00Z', exitedAt: '2026-09-18T10:02:00Z', exitReason: 'gate', submissions: [], confirmations: [] },
      'input-a': {
        enteredAt: '2026-09-18T10:02:00Z', exitedAt: '2026-09-18T10:05:00Z', exitReason: 'gate',
        submissions: [
          { seat: 'seat-1', text: 'Short', submittedAt: '2026-09-18T10:03:00Z', autoSubmitted: false, passed: false, wordCount: 1 },
          { seat: 'seat-2', text: '', submittedAt: '2026-09-18T10:03:30Z', autoSubmitted: false, passed: true, passReason: 'skip', wordCount: 0 },
          { seat: 'seat-3', text: '', submittedAt: '2026-09-18T10:04:00Z', autoSubmitted: false, passed: true, passReason: 'skip', wordCount: 0 },
          { seat: 'seat-4', text: 'Also short', submittedAt: '2026-09-18T10:04:30Z', autoSubmitted: false, passed: false, wordCount: 2 },
        ],
        confirmations: [],
      },
      'reveal-a': {
        enteredAt: '2026-09-18T10:05:00Z', exitedAt: '2026-09-18T10:07:00Z', exitReason: 'gate',
        submissions: [], confirmations: [],
      },
      'decide': {
        enteredAt: '2026-09-18T10:07:00Z', exitReason: 'pending',
        submissions: [], confirmations: [],
        reviewerVerdicts: [
          { pass: false, scores: [], ignoredLenses: [], oneLineFeedback: 'Fail 1', confidence: 0.8, at: '2026-09-18T10:07:30Z' },
          { pass: false, scores: [], ignoredLenses: [], oneLineFeedback: 'Fail 2', confidence: 0.7, at: '2026-09-18T10:08:00Z' },
        ],
      },
    },
    facts: { problemStatement: 'Test problem', decision: null, commitment: null },
    metrics: { frameToCommitSec: null, wordsBySeat: {}, lensCoverage: {} },
  };
}

describe('evaluateTrigger', () => {
  test('returns fallback when trigger matches', () => {
    const session = makeSession();
    const method = makeMethod();
    const fb = evaluateTrigger(session, method, 'ideas_thin');
    expect(fb).not.toBeNull();
    expect(fb!.trigger).toBe('ideas_thin');
  });

  test('returns null for no matching trigger', () => {
    const session = makeSession();
    const method = makeMethod();
    method.fallbacks = [fallback];
    const fb = evaluateTrigger(session, method, 'converge_failed_twice');
    expect(fb).toBeNull();
  });

  test('returns null when method has no fallbacks', () => {
    const session = makeSession();
    const method = makeMethod();
    method.fallbacks = undefined;
    expect(evaluateTrigger(session, method, 'ideas_thin')).toBeNull();
  });

  test('returns null for fixed mode', () => {
    const session = makeSession();
    const method = makeMethod();
    method.roleMode = 'fixed';
    expect(evaluateTrigger(session, method, 'ideas_thin')).toBeNull();
  });

  test('returns null if detour already accepted', () => {
    const session = makeSession();
    session.detours = [{ trigger: 'ideas_thin', detourMethodId: 'idea-round', insertedBlockIds: ['detour-ideas-input'], reason: 'test', accepted: true, at: '2026-09-18T10:05:00Z' }];
    const method = makeMethod();
    expect(evaluateTrigger(session, method, 'facilitator')).toBeNull();
  });

  test('allows trigger after declined detour (no accepted)', () => {
    const session = makeSession();
    session.detours = [{ trigger: 'ideas_thin', detourMethodId: 'idea-round', insertedBlockIds: [], reason: 'test', accepted: false, at: '2026-09-18T10:05:00Z' }];
    const method = makeMethod();
    expect(evaluateTrigger(session, method, 'facilitator')).not.toBeNull();
  });
});

describe('shouldTriggerConvergeFailedTwice', () => {
  test('returns true with 2 failed verdicts on converge', () => {
    const session = makeSession();
    const method = makeMethod();
    expect(shouldTriggerConvergeFailedTwice(session, method)).toBe(true);
  });

  test('returns false with 1 failed verdict', () => {
    const session = makeSession();
    const method = makeMethod();
    session.blocks['decide'].reviewerVerdicts = [
      { pass: false, scores: [], ignoredLenses: [], oneLineFeedback: 'Fail', confidence: 0.8, at: '2026-09-18T10:07:30Z' },
    ];
    expect(shouldTriggerConvergeFailedTwice(session, method)).toBe(false);
  });

  test('returns false when not on converge block', () => {
    const session = makeSession();
    const method = makeMethod();
    session.currentBlockId = 'input-a';
    expect(shouldTriggerConvergeFailedTwice(session, method)).toBe(false);
  });
});

describe('shouldTriggerIdeasThin', () => {
  test('returns true when majority passed', () => {
    const session = makeSession();
    const method = makeMethod();
    expect(shouldTriggerIdeasThin(session, method)).toBe(true);
  });

  test('returns true when avg words below minWords', () => {
    const session = makeSession();
    const method = makeMethod();
    // Make nobody pass, but avg words still low
    session.blocks['input-a'].submissions = [
      { seat: 'seat-1', text: 'Short', submittedAt: '2026-09-18T10:03:00Z', autoSubmitted: false, passed: false, wordCount: 1 },
      { seat: 'seat-2', text: 'Also short', submittedAt: '2026-09-18T10:03:30Z', autoSubmitted: false, passed: false, wordCount: 2 },
      { seat: 'seat-3', text: 'Three words here', submittedAt: '2026-09-18T10:04:00Z', autoSubmitted: false, passed: false, wordCount: 3 },
      { seat: 'seat-4', text: 'Four', submittedAt: '2026-09-18T10:04:30Z', autoSubmitted: false, passed: false, wordCount: 1 },
    ];
    expect(shouldTriggerIdeasThin(session, method)).toBe(true);
  });

  test('returns false with substantive submissions', () => {
    const session = makeSession();
    const method = makeMethod();
    session.blocks['input-a'].submissions = [
      { seat: 'seat-1', text: 'A lot of great ideas about many things and more', submittedAt: '2026-09-18T10:03:00Z', autoSubmitted: false, passed: false, wordCount: 20 },
      { seat: 'seat-2', text: 'More ideas that go beyond the minimum threshold', submittedAt: '2026-09-18T10:03:30Z', autoSubmitted: false, passed: false, wordCount: 15 },
      { seat: 'seat-3', text: 'Additional ideas from third person beyond threshold', submittedAt: '2026-09-18T10:04:00Z', autoSubmitted: false, passed: false, wordCount: 12 },
      { seat: 'seat-4', text: 'Yet more ideas to make average high enough', submittedAt: '2026-09-18T10:04:30Z', autoSubmitted: false, passed: false, wordCount: 15 },
    ];
    expect(shouldTriggerIdeasThin(session, method)).toBe(false);
  });
});

describe('buildProposal', () => {
  test('builds correct proposal with prefixed ids', () => {
    const session = makeSession();
    const proposal = buildProposal(fallback, session);
    expect(proposal).not.toBeNull();
    expect(proposal!.blocks).toHaveLength(2);
    expect(proposal!.blocks[0].id).toBe('detour-ideas-input');
    expect(proposal!.blocks[1].id).toBe('detour-ideas-reveal');
    expect(proposal!.blocks[1].sourceBlockId).toBe('detour-ideas-input');
    expect(proposal!.lenses).toHaveLength(1);
    expect(proposal!.lenses[0].id).toBe('detour-provocation');
    expect(proposal!.blocks[0].lensId).toBe('detour-provocation');
    expect(proposal!.addedMinutes).toBe(6);
    expect(proposal!.reason).toBe(fallback.reason);
  });

  test('returns null for unknown detour method', () => {
    const session = makeSession();
    const fb: MethodFallback = { ...fallback, detourMethodId: 'nonexistent' };
    expect(buildProposal(fb, session)).toBeNull();
  });
});

describe('acceptDetour', () => {
  test('inserts blocks after current block', () => {
    const session = makeSession();
    const method = makeMethod();
    const proposal = buildProposal(fallback, session)!;
    const origLen = method.blocks.length;
    acceptDetour(session, method, proposal);

    // Blocks inserted after 'decide' (index 3)
    expect(method.blocks.length).toBe(origLen + 2);
    expect(method.blocks[4].id).toBe('detour-ideas-input');
    expect(method.blocks[5].id).toBe('detour-ideas-reveal');

    // Session records the detour
    expect(session.detours).toHaveLength(1);
    expect(session.detours![0].accepted).toBe(true);
    expect(session.detours![0].insertedBlockIds).toEqual(['detour-ideas-input', 'detour-ideas-reveal']);
  });

  test('adds lenses to method', () => {
    const session = makeSession();
    const method = makeMethod();
    const proposal = buildProposal(fallback, session)!;
    acceptDetour(session, method, proposal);
    expect(method.lenses!.find(l => l.id === 'detour-provocation')).toBeTruthy();
  });
});

describe('declineDetour', () => {
  test('logs declined detour', () => {
    const session = makeSession();
    const proposal = buildProposal(fallback, session)!;
    declineDetour(session, proposal);
    expect(session.detours).toHaveLength(1);
    expect(session.detours![0].accepted).toBe(false);
    expect(session.detours![0].insertedBlockIds).toEqual([]);
  });
});

describe('second trigger ignored', () => {
  test('second trigger returns null after accepted detour', () => {
    const session = makeSession();
    const method = makeMethod();
    const proposal = buildProposal(fallback, session)!;
    acceptDetour(session, method, proposal);
    // Try another trigger
    expect(evaluateTrigger(session, method, 'facilitator')).toBeNull();
  });
});
