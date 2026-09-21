import { renderReport } from '../src/engine/report.js';
import type { SessionState, Method } from '../src/types.js';

function makeMethod(): Method {
  return {
    id: 'test-method',
    name: 'Test Method',
    version: '0.1.0',
    roleMode: 'rotating',
    groupSize: { min: 2, max: 6 },
    timing: { totalBudgetSec: 3600, extensionSec: 60, idleSec: 90, presenceTimeoutSec: 120 },
    lenses: [
      { id: 'alpha', name: 'Alpha — facts', instruction: 'Alpha lens' },
      { id: 'beta', name: 'Beta — risks', instruction: 'Beta lens' },
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
  };
}

function makeSession(): SessionState {
  return {
    roomCode: 'SNAP01',
    methodId: 'test-method',
    methodVersion: '0.1.0',
    createdAt: '2026-09-17T10:00:00Z',
    status: 'complete',
    anonymous: false,
  mode: 'group',
    facilitatorSeat: 'seat-1',
    clock: {
      blockStartedAt: null,
      remainingSecAtPause: null,
      extensionsUsed: { 'beta-input': 1 },
      totalElapsedSec: 1800,
    },
    participants: [
      { seat: 'seat-1', displayName: 'Alice', presence: 'present', lastSeenAt: '2026-09-17T10:30:00Z', swapsUsed: 0 },
      { seat: 'seat-2', displayName: 'Bob', presence: 'present', lastSeenAt: '2026-09-17T10:30:00Z', swapsUsed: 0 },
      { seat: 'seat-3', displayName: 'Carol', presence: 'present', lastSeenAt: '2026-09-17T10:30:00Z', swapsUsed: 0 },
    ],
    currentBlockId: null,
    blocks: {
      'frame': {
        enteredAt: '2026-09-17T10:00:00Z', exitedAt: '2026-09-17T10:05:00Z', exitReason: 'gate',
        submissions: [], confirmations: ['seat-1', 'seat-2', 'seat-3'], stuckEvents: [],
      },
      'alpha-input': {
        enteredAt: '2026-09-17T10:05:00Z', exitedAt: '2026-09-17T10:09:00Z', exitReason: 'gate',
        submissions: [
          { seat: 'seat-1', text: 'Alice wrote a long thoughtful analysis about the alpha facts lens here', submittedAt: '2026-09-17T10:06:00Z', autoSubmitted: false, passed: false, wordCount: 12 },
          { seat: 'seat-2', text: 'Bob also contributed his perspective on the facts', submittedAt: '2026-09-17T10:07:00Z', autoSubmitted: false, passed: false, wordCount: 9 },
          { seat: 'seat-3', text: '', submittedAt: '2026-09-17T10:08:30Z', autoSubmitted: false, passed: true, passReason: 'not sure what to write', wordCount: 0 },
        ],
        stuckEvents: [
          { seat: 'seat-3', step: 'hint', at: '2026-09-17T10:07:00Z' },
        ],
      },
      'alpha-reveal': {
        enteredAt: '2026-09-17T10:09:00Z', exitedAt: '2026-09-17T10:12:00Z', exitReason: 'gate',
        confirmations: ['seat-1', 'seat-2', 'seat-3'],
        reveal: {
          clusters: [
            { label: 'Data-driven approach', seats: ['seat-1', 'seat-2'], summary: 'Both emphasized verifiable data' },
          ],
          disagreements: ['Alice focused on numbers, Bob on process'],
        },
        stuckEvents: [],
      },
      'beta-input': {
        enteredAt: '2026-09-17T10:12:00Z', exitedAt: '2026-09-17T10:16:00Z', exitReason: 'gate',
        submissions: [
          { seat: 'seat-1', text: 'Alice wrote even more here about risks and concerns and potential problems and failure modes and edge cases and all the things that could go wrong', submittedAt: '2026-09-17T10:13:00Z', autoSubmitted: false, passed: false, wordCount: 26 },
          { seat: 'seat-2', text: 'Bob wrote a bit about risk', submittedAt: '2026-09-17T10:14:00Z', autoSubmitted: false, passed: false, wordCount: 7 },
          { seat: 'seat-3', text: '', submittedAt: '2026-09-17T10:15:30Z', autoSubmitted: false, passed: true, passReason: 'nothing to add', wordCount: 0 },
        ],
        stuckEvents: [],
      },
      'beta-reveal': {
        enteredAt: '2026-09-17T10:16:00Z', exitedAt: '2026-09-17T10:19:00Z', exitReason: 'gate',
        confirmations: ['seat-1', 'seat-2', 'seat-3'], stuckEvents: [],
      },
      'decide': {
        enteredAt: '2026-09-17T10:19:00Z', exitedAt: '2026-09-17T10:27:00Z', exitReason: 'gate',
        decision: 'We will pursue option A because it addresses the top risk identified.',
        reviewerVerdicts: [
          {
            pass: false, scores: [
              { criterion: 'addresses-risk', score: 1, evidence: 'partially addressed' },
              { criterion: 'uses-fact', score: 0, evidence: '' },
            ], ignoredLenses: ['beta'], oneLineFeedback: 'Missing fact reference', confidence: 0.6, at: '2026-09-17T10:22:00Z',
          },
          {
            pass: true, scores: [
              { criterion: 'addresses-risk', score: 2, evidence: 'the top risk identified' },
              { criterion: 'uses-fact', score: 2, evidence: 'verifiable data' },
            ], ignoredLenses: [], oneLineFeedback: 'Good decision', confidence: 0.85, at: '2026-09-17T10:26:00Z',
          },
        ],
        stuckEvents: [],
      },
      'commit': {
        enteredAt: '2026-09-17T10:27:00Z', exitedAt: '2026-09-17T10:30:00Z', exitReason: 'gate',
        submissions: [{ seat: 'seat-1', text: '{}', submittedAt: '2026-09-17T10:29:00Z', autoSubmitted: false, passed: false, wordCount: 1 }],
        stuckEvents: [],
      },
      'artifact': {
        enteredAt: '2026-09-17T10:30:00Z', exitedAt: '2026-09-17T10:30:01Z', exitReason: 'auto', stuckEvents: [],
      },
    },
    facts: {
      problemStatement: 'We cannot ship on time because of bottleneck X',
      decision: 'We will pursue option A because it addresses the top risk identified.',
      commitment: { owner: 'Alice', firstAction: 'Schedule a meeting with the bottleneck team', dueDate: '2026-10-01', successSignal: 'Meeting held and action items assigned' },
    },
    metrics: {
      frameToCommitSec: null,
      wordsBySeat: {},
      lensCoverage: {},
      modelCalls: [],
    },
  };
}

describe('report', () => {
  test('snapshot: full report for fixture manifest', () => {
    const report = renderReport(makeSession(), makeMethod());
    expect(report).toMatchSnapshot();
  });

  test('report contains all required sections', () => {
    const report = renderReport(makeSession(), makeMethod());
    expect(report).toContain('# Session Report: Test Method');
    expect(report).toContain('## Decision');
    expect(report).toContain('## Commitment');
    expect(report).toContain('## Outputs by lens');
    expect(report).toContain('## Advisory decision reviews');
    expect(report).toContain('## How the group worked');
    expect(report).toContain('**Time to decision:**');
    expect(report).toContain('**Participation balance:**');
    expect(report).toContain('**Lens coverage:**');
    expect(report).toContain('**30-day follow-up:**');
  });

  test('report flags dominant and quiet and multi-pass participants', () => {
    const report = renderReport(makeSession(), makeMethod());
    // Alice: 12+26=38 words out of 38+9+0=54 total → 70% → dominant
    expect(report).toContain('**dominated**');
    // Carol: 0 words → 0% → quiet
    expect(report).toContain('**quiet**');
    // Carol passed 2 blocks → multi_pass
    expect(report).toContain('**passed 2 blocks**');
  });

  test('report shows clustered outputs when available', () => {
    const report = renderReport(makeSession(), makeMethod());
    expect(report).toContain('Data-driven approach');
    expect(report).toContain('Both emphasized verifiable data');
    expect(report).toContain('Alice focused on numbers');
  });

  test('report shows raw submissions when no clusters', () => {
    const report = renderReport(makeSession(), makeMethod());
    // beta-reveal has no clusters, so beta-input shows raw
    expect(report).toContain('Alice wrote even more here');
  });
});
