import { anonymizePayload, seatLabel, seatNumber, anonymousParticipationSummary } from '../src/engine/anonymize';
import { renderReport } from '../src/engine/report';
import type { SessionState, Method } from '../src/types';

function makeMethod(): Method {
  return {
    id: 'test-method',
    name: 'Test Method',
    version: '1.0.0',
    roleMode: 'rotating',
    groupSize: { min: 2, max: 6 },
    timing: { totalBudgetSec: 3600, extensionSec: 60, idleSec: 90, presenceTimeoutSec: 120 },
    lenses: [
      { id: 'lens-a', name: 'Lens A', instruction: 'Do lens A', colour: '#aaa' },
    ],
    blocks: [
      { id: 'frame', type: 'frame', title: 'Frame', timeboxSec: 300, completion: 'all_agreed', lensId: 'lens-a' },
      { id: 'input-a', type: 'private_input', title: 'Input A', timeboxSec: 240, completion: 'all_submitted', lensId: 'lens-a', minWords: 10 },
      { id: 'reveal-a', type: 'reveal', title: 'Reveal A', timeboxSec: 180, completion: 'all_confirmed', lensId: 'lens-a', sourceBlockId: 'input-a' },
      { id: 'decide', type: 'converge', title: 'Decide', timeboxSec: 480, completion: 'reviewer_pass' },
      { id: 'commit', type: 'commit', title: 'Commit', timeboxSec: 300, completion: 'valid_form' },
      { id: 'artifact', type: 'artifact', title: 'Artifact', timeboxSec: 0, completion: 'auto' },
    ],
  };
}

function makeSession(anonymous: boolean): SessionState {
  return {
    roomCode: 'ANON01',
    methodId: 'test-method',
    methodVersion: '1.0.0',
    createdAt: '2026-09-18T10:00:00Z',
    status: 'complete',
    anonymous,
    mode: 'group',
    facilitatorSeat: 'seat-1',
    clock: { blockStartedAt: null, remainingSecAtPause: null, extensionsUsed: {}, totalElapsedSec: 600 },
    participants: [
      { seat: 'seat-1', displayName: 'Alice', presence: 'present', lastSeenAt: '2026-09-18T10:10:00Z', swapsUsed: 0 },
      { seat: 'seat-2', displayName: 'Bob', presence: 'present', lastSeenAt: '2026-09-18T10:10:00Z', swapsUsed: 0 },
      { seat: 'seat-3', displayName: 'Carol', presence: 'present', lastSeenAt: '2026-09-18T10:10:00Z', swapsUsed: 0 },
      { seat: 'seat-4', displayName: 'Dave', presence: 'present', lastSeenAt: '2026-09-18T10:10:00Z', swapsUsed: 0 },
    ],
    currentBlockId: null,
    blocks: {
      'frame': { enteredAt: '2026-09-18T10:00:00Z', exitedAt: '2026-09-18T10:02:00Z', exitReason: 'gate', submissions: [], confirmations: ['seat-1', 'seat-2', 'seat-3', 'seat-4'] },
      'input-a': {
        enteredAt: '2026-09-18T10:02:00Z', exitedAt: '2026-09-18T10:05:00Z', exitReason: 'gate',
        submissions: [
          { seat: 'seat-1', text: 'The problem has many dimensions and root causes that we need to explore carefully', submittedAt: '2026-09-18T10:03:00Z', autoSubmitted: false, passed: false, wordCount: 40 },
          { seat: 'seat-2', text: 'Less content but still relevant points here', submittedAt: '2026-09-18T10:03:30Z', autoSubmitted: false, passed: false, wordCount: 15 },
          { seat: 'seat-3', text: '', submittedAt: '2026-09-18T10:04:00Z', autoSubmitted: false, passed: true, passReason: 'nothing to add', wordCount: 0 },
          { seat: 'seat-4', text: 'Some thoughts about the situation', submittedAt: '2026-09-18T10:04:30Z', autoSubmitted: false, passed: false, wordCount: 10 },
        ],
        confirmations: [],
      },
      'reveal-a': {
        enteredAt: '2026-09-18T10:05:00Z', exitedAt: '2026-09-18T10:07:00Z', exitReason: 'gate',
        submissions: [], confirmations: ['seat-1', 'seat-2', 'seat-3', 'seat-4'],
        reveal: {
          clusters: [
            { label: 'Main theme', seats: ['seat-1', 'seat-2'], summary: 'Both agree on core issue' },
            { label: 'Passed', seats: ['seat-3'], summary: 'No submission' },
          ],
          disagreements: [],
          agreements: ['Core issue exists'],
        },
      },
      'decide': {
        enteredAt: '2026-09-18T10:07:00Z', exitedAt: '2026-09-18T10:08:00Z', exitReason: 'facilitator_override',
        overrideReason: 'Testing override',
        submissions: [{ seat: 'seat-1', text: 'We decide X', submittedAt: '2026-09-18T10:07:30Z', autoSubmitted: false, passed: false, wordCount: 3 }],
        confirmations: [], decision: 'We decide X',
      },
      'commit': {
        enteredAt: '2026-09-18T10:08:00Z', exitedAt: '2026-09-18T10:09:00Z', exitReason: 'gate',
        submissions: [{ seat: 'seat-1', text: '{}', submittedAt: '2026-09-18T10:08:30Z', autoSubmitted: false, passed: false, wordCount: 5 }],
        confirmations: [],
      },
      'artifact': {
        enteredAt: '2026-09-18T10:09:00Z', exitedAt: '2026-09-18T10:09:00Z', exitReason: 'auto',
        submissions: [], confirmations: [],
      },
    },
    facts: {
      problemStatement: 'We have a problem that needs solving',
      decision: 'We decide X',
      commitment: { owner: 'Alice', firstAction: 'Do the thing', dueDate: '2026-10-18', successSignal: 'Thing done' },
    },
    metrics: {
      frameToCommitSec: 540,
      wordsBySeat: { 'seat-1': 40, 'seat-2': 15, 'seat-3': 0, 'seat-4': 10 },
      lensCoverage: { 'lens-a': 'substantive' },
      anonymous,
    },
  };
}

const DISPLAY_NAMES = ['Alice', 'Bob', 'Carol', 'Dave'];

describe('seatLabel', () => {
  const method = makeMethod();

  test('non-anonymous returns displayName', () => {
    const session = makeSession(false);
    expect(seatLabel(session, method, 'seat-1')).toBe('Alice');
  });

  test('anonymous returns Seat N for other viewer', () => {
    const session = makeSession(true);
    expect(seatLabel(session, method, 'seat-1', 'seat-2')).toBe('Seat 1');
  });

  test('anonymous returns You for own seat', () => {
    const session = makeSession(true);
    expect(seatLabel(session, method, 'seat-1', 'seat-1')).toBe('You');
  });
});

describe('seatNumber', () => {
  test('converts seat-N to Seat N', () => {
    expect(seatNumber('seat-3')).toBe('Seat 3');
  });
});

describe('anonymizePayload', () => {
  const method = makeMethod();

  test('non-anonymous returns same object', () => {
    const session = makeSession(false);
    const result = anonymizePayload(session, method);
    expect(result).toBe(session); // same reference
  });

  test('anonymous replaces all displayNames', () => {
    const session = makeSession(true);
    const result = anonymizePayload(session, method, 'seat-1');
    expect(result).not.toBe(session); // deep copy
    expect(result.participants[0].displayName).toBe('You');
    expect(result.participants[1].displayName).toBe('Seat 2');
    expect(result.participants[2].displayName).toBe('Seat 3');
    expect(result.participants[3].displayName).toBe('Seat 4');
    // Original unchanged
    expect(session.participants[0].displayName).toBe('Alice');
  });

  test('anonymous payload contains no real display names', () => {
    const session = makeSession(true);
    const result = anonymizePayload(session, method);
    const json = JSON.stringify(result);
    for (const name of DISPLAY_NAMES) {
      expect(json).not.toContain(name);
    }
  });
});

describe('anonymous report', () => {
  const method = makeMethod();

  test('anonymous report contains no display names', () => {
    const session = makeSession(true);
    const report = renderReport(session, method);
    for (const name of DISPLAY_NAMES) {
      expect(report).not.toContain(name);
    }
  });

  test('anonymous report uses count-based participation', () => {
    const session = makeSession(true);
    const report = renderReport(session, method);
    expect(report).toContain('seats participated');
    expect(report).toContain('above 40% share');
  });

  test('anonymous report has anonymous participant header', () => {
    const session = makeSession(true);
    const report = renderReport(session, method);
    expect(report).toContain('4 participants (anonymous)');
  });

  test('non-anonymous report contains display names', () => {
    const session = makeSession(false);
    const report = renderReport(session, method);
    for (const name of DISPLAY_NAMES) {
      expect(report).toContain(name);
    }
  });

  test('anonymous report uses Seat N in cluster tables', () => {
    const session = makeSession(true);
    const report = renderReport(session, method);
    expect(report).toContain('Seat 1');
    expect(report).toContain('Seat 2');
    expect(report).toContain('Seat 3');
  });

  test('anonymous stuck summary uses totals only', () => {
    const session = makeSession(true);
    // Add stuck events
    session.blocks['input-a'].stuckEvents = [
      { seat: 'seat-3', step: 'hint', at: '2026-09-18T10:03:00Z' },
      { seat: 'seat-3', step: 'pass', at: '2026-09-18T10:03:30Z' },
    ];
    const report = renderReport(session, method);
    expect(report).toContain('1 seat(s) used stuck ladder');
    expect(report).not.toContain('Alice');
    expect(report).not.toContain('Carol');
  });
});

describe('anonymousParticipationSummary', () => {
  test('reports correct counts', () => {
    const shares = { 'seat-1': 0.6, 'seat-2': 0.2, 'seat-3': 0, 'seat-4': 0.2 };
    const flags = [
      { seat: 'seat-1', flag: 'dominant', detail: '60%' },
      { seat: 'seat-3', flag: 'quiet', detail: '0%' },
      { seat: 'seat-3', flag: 'multi_pass', detail: 'passed 2 blocks' },
    ];
    const lines = anonymousParticipationSummary(shares, flags);
    expect(lines).toContain('4 seats participated.');
    expect(lines).toContain('1 seat(s) above 40% share.');
    expect(lines).toContain('1 seat(s) below 10% share.');
    expect(lines).toContain('1 seat(s) passed 2 or more blocks.');
  });
});
