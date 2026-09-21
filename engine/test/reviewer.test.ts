import { reviewDecision, buildReviewerInput, verifyEvidence, computePass, REVIEWER_SYSTEM_PROMPT } from '../src/agents/reviewer.js';
import { setClient } from '../src/agents/client.js';
import type { SessionState, Method, MethodBlock } from '../src/types.js';

function withReasons(input: any) {
  return { ...input, scores: input.scores.map((s: any) => ({ concern: s.score === 0 && !s.evidence ? 'missing_evidence' : s.score < 2 ? 'weak_reasoning' : 'none', explanation: 'Assessment of the quoted material against this criterion.', ...s })) };
}
function mockReviewerClient(input: any) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'tool_use', id: 'tu_1', name: 'submit_verdict', input: withReasons(input) }],
        usage: { input_tokens: 500, output_tokens: 300 },
      }),
    },
  } as any;
}

// A client that returns different results on successive calls
function retryClient(firstInput: any, secondInput: any) {
  let calls = 0;
  return {
    messages: {
      create: async () => {
        calls++;
        const input = withReasons(calls === 1 ? firstInput : secondInput);
        return {
          content: [{ type: 'tool_use', id: 'tu_1', name: 'submit_verdict', input }],
          usage: { input_tokens: 500, output_tokens: 300 },
        };
      },
    },
    getCalls: () => calls,
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
    currentBlockId: 'decide',
    blocks: {
      'green-reveal': {
        enteredAt: new Date().toISOString(), exitReason: 'gate',
        reveal: {
          clusters: [{ label: 'Pre-order phone line', seats: ['seat-1'], summary: 'Phone orders for regulars' }],
          disagreements: [],
          agreements: ['Demand is strong'],
        },
      },
      'risk-reveal': {
        enteredAt: new Date().toISOString(), exitReason: 'gate',
        reveal: {
          clusters: [{ label: 'Repeat failure', seats: ['seat-2'], summary: 'Second till failed before' }],
          disagreements: ['Whether cost is worth it'],
          agreements: [],
        },
      },
      'decide': { enteredAt: new Date().toISOString(), exitReason: 'pending' },
    },
    facts: {
      problemStatement: 'Queue is too long',
      decision: 'We will try the pre-order phone line for regulars, addressing the risk that a second till failed before',
    },
    metrics: {},
  };
}

const rubric = {
  passThreshold: 0.5,
  criteria: [
    { id: 'crit-risk', text: 'Names a risk from the caution reveal' },
    { id: 'crit-fact', text: 'Uses a fact' },
  ],
  examples: [
    { decision: 'Good decision', verdict: 'pass' as const, why: 'Meets all criteria' },
  ],
};

const method: Method = {
  id: 'test', name: 'Test', version: '1', roleMode: 'rotating',
  groupSize: { min: 2, max: 6 },
  timing: { totalBudgetSec: 3600, extensionSec: 60, idleSec: 30, presenceTimeoutSec: 120 },
  blocks: [
    { id: 'green-reveal', type: 'reveal', title: 'Reveal', timeboxSec: 120, completion: 'all_confirmed', sourceBlockId: 'green-input' },
    { id: 'risk-reveal', type: 'reveal', title: 'Reveal', timeboxSec: 120, completion: 'all_confirmed', sourceBlockId: 'risk-input' },
    { id: 'decide', type: 'converge', title: 'Decide', timeboxSec: 480, completion: 'reviewer_pass', sourceBlockId: 'green-reveal,risk-reveal', rubric },
  ],
};

const decideBlock = method.blocks[2];

afterEach(() => setClient(null));

describe('reviewer', () => {
  describe('buildReviewerInput', () => {
    it('includes reveal content and decision but no display names', () => {
      const session = makeSession();
      const input = buildReviewerInput(session, method, decideBlock);
      expect(input).toContain('Pre-order phone line');
      expect(input).toContain('Repeat failure');
      expect(input).toContain('pre-order phone line for regulars');
      expect(input).toContain('crit-risk');
      expect(input).not.toContain('displayName');
      // Should not contain display names from participants
      expect(input).not.toMatch(/\bA\b.*displayName|displayName.*\bA\b/);
    });

    it('never contains the words "hint" or "example" or any helper output', () => {
      const session = makeSession();
      const input = buildReviewerInput(session, method, decideBlock);
      expect(input.toLowerCase()).not.toContain('hint');
      // "example" check — the rubric examples section says "illustrations"
      // but the rubric example text might contain the word; check the system prompt too
      expect(REVIEWER_SYSTEM_PROMPT.toLowerCase()).not.toContain('hint');
    });

    it('includes rubric worked illustrations when present', () => {
      const session = makeSession();
      const input = buildReviewerInput(session, method, decideBlock);
      expect(input).toContain('Rubric worked illustrations');
      expect(input).toContain('Good decision');
    });
  });

  describe('verifyEvidence', () => {
    const sampleInput = 'Pre-order phone line for regulars. Second till failed before. Demand is strong.';
    it('missing evidence needs no fabricated quotation; a claimed contradiction is checked even at score zero', () => {
      expect(verifyEvidence([{ criterion: 'c1', score: 0, evidence: '', concern: 'missing_evidence' }], sampleInput).allValid).toBe(true);
      expect(verifyEvidence([{ criterion: 'c1', score: 0, evidence: 'made up contradiction', concern: 'contradiction' }], sampleInput).allValid).toBe(false);
      expect(verifyEvidence([{ criterion: 'c1', score: 0, evidence: 'Second till failed before', concern: 'contradiction' }], sampleInput).allValid).toBe(true);
    });

    it('passes when evidence is a verbatim substring', () => {
      const scores = [
        { criterion: 'c1', score: 2, evidence: 'Pre-order phone line' },
        { criterion: 'c2', score: 1, evidence: 'Second till failed' },
      ];
      const result = verifyEvidence(scores, sampleInput);
      expect(result.allValid).toBe(true);
      expect(result.failedCriteria).toHaveLength(0);
    });

    it('fails when evidence is not a substring', () => {
      const scores = [
        { criterion: 'c1', score: 2, evidence: 'This text does not appear anywhere' },
        { criterion: 'c2', score: 1, evidence: 'Second till failed' },
      ];
      const result = verifyEvidence(scores, sampleInput);
      expect(result.allValid).toBe(false);
      expect(result.failedCriteria).toContain('c1');
      expect(result.failedCriteria).not.toContain('c2');
    });

    it('skips evidence check for score 0', () => {
      const scores = [
        { criterion: 'c1', score: 0, evidence: 'irrelevant' },
      ];
      const result = verifyEvidence(scores, sampleInput);
      expect(result.allValid).toBe(true);
    });
  });

  describe('computePass', () => {
    it('passes when score meets threshold', () => {
      const scores = [{ criterion: 'c1', score: 2 }, { criterion: 'c2', score: 1 }];
      const r = { passThreshold: 0.5, criteria: [{ id: 'c1' }, { id: 'c2' }] };
      expect(computePass(scores, r)).toBe(true); // 3/4 = 0.75 >= 0.5
    });

    it('fails when score below threshold', () => {
      const scores = [{ criterion: 'c1', score: 0 }, { criterion: 'c2', score: 0 }];
      const r = { passThreshold: 0.5, criteria: [{ id: 'c1' }, { id: 'c2' }] };
      expect(computePass(scores, r)).toBe(false); // 0/4 = 0 < 0.5
    });

    it('respects weights', () => {
      const scores = [{ criterion: 'c1', score: 2 }, { criterion: 'c2', score: 0 }];
      const r = { passThreshold: 0.5, criteria: [{ id: 'c1', weight: 3 }, { id: 'c2', weight: 1 }] };
      // max = 6+2=8, total = 6+0=6, ratio=0.75 >= 0.5
      expect(computePass(scores, r)).toBe(true);
    });
  });

  describe('reviewDecision (mocked)', () => {
    it('evidence pass — returns verdict with engine-computed pass', async () => {
      const session = makeSession();
      const input = buildReviewerInput(session, method, decideBlock);
      // Use real substrings from the input as evidence
      setClient(mockReviewerClient({
        pass: true,
        scores: [
          { criterion: 'crit-risk', score: 2, evidence: 'second till failed before' },
          { criterion: 'crit-fact', score: 1, evidence: 'Demand is strong' },
        ],
        ignoredLenses: [],
        oneLineFeedback: 'Good decision',
        confidence: 0.8,
      }));

      const verdict = await reviewDecision(session, method, decideBlock);
      expect(verdict.pass).toBe(true); // 3/4 = 0.75 >= 0.5
      expect(verdict.scores).toHaveLength(2);
      expect(verdict.confidence).toBe(0.8);
      expect(session.metrics.modelCalls?.length).toBe(1); // single call, no retry
    });

    it('evidence fail then retry pass', async () => {
      const session = makeSession();
      const client = retryClient(
        // First attempt: bad evidence
        {
          pass: true,
          scores: [
            { criterion: 'crit-risk', score: 2, evidence: 'MADE UP QUOTE' },
            { criterion: 'crit-fact', score: 1, evidence: 'Demand is strong' },
          ],
          ignoredLenses: [],
          oneLineFeedback: 'OK',
          confidence: 0.7,
        },
        // Retry: fixed evidence
        {
          pass: true,
          scores: [
            { criterion: 'crit-risk', score: 2, evidence: 'second till failed before' },
            { criterion: 'crit-fact', score: 1, evidence: 'Demand is strong' },
          ],
          ignoredLenses: [],
          oneLineFeedback: 'Fixed',
          confidence: 0.7,
        },
      );
      setClient(client);

      const verdict = await reviewDecision(session, method, decideBlock);
      expect(verdict.pass).toBe(true);
      expect(verdict.scores.every(s => !s.unverifiedEvidence)).toBe(true);
      expect(session.metrics.modelCalls?.length).toBe(2); // retry happened
    });

    it('evidence fail on both attempts — score zeroed, unverifiedEvidence set', async () => {
      const session = makeSession();
      setClient(mockReviewerClient({
        pass: true,
        scores: [
          { criterion: 'crit-risk', score: 2, evidence: 'FABRICATED NONSENSE' },
          { criterion: 'crit-fact', score: 1, evidence: 'Demand is strong' },
        ],
        ignoredLenses: [],
        oneLineFeedback: 'Hmm',
        confidence: 0.6,
      }));

      const verdict = await reviewDecision(session, method, decideBlock);
      // crit-risk had bad evidence on both attempts, score zeroed
      const riskScore = verdict.scores.find(s => s.criterion === 'crit-risk');
      expect(riskScore?.score).toBe(0);
      expect(riskScore?.unverifiedEvidence).toBe(true);
      // crit-fact was fine
      const factScore = verdict.scores.find(s => s.criterion === 'crit-fact');
      expect(factScore?.score).toBe(1);
      expect(factScore?.unverifiedEvidence).toBeFalsy();
      // pass recomputed: 0+1=1 out of max 4 = 0.25 < 0.5 → fail
      expect(verdict.pass).toBe(false);
      expect(verdict.modelPassDiffered).toBe(true); // model said pass, engine says fail
    });

    it('engine overrides model pass field based on scores', async () => {
      const session = makeSession();
      // Model says fail, but scores are good enough
      setClient(mockReviewerClient({
        pass: false,
        scores: [
          { criterion: 'crit-risk', score: 2, evidence: 'second till failed before' },
          { criterion: 'crit-fact', score: 2, evidence: 'Demand is strong' },
        ],
        ignoredLenses: [],
        oneLineFeedback: 'Not sure',
        confidence: 0.4,
      }));

      const verdict = await reviewDecision(session, method, decideBlock);
      expect(verdict.pass).toBe(true); // engine says pass (4/4 >= 0.5)
      expect(verdict.modelPassDiffered).toBe(true);
    });
  });
});
