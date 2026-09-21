import { loadScenarioForSession, clearScenarioForSession, scriptedCallForcedTool, type ScenarioData } from '../src/agents/scripted-client';

const cannedData: ScenarioData = {
  reveals: {
    'observations-reveal': {
      clusters: [
        { label: 'Facts group', seats: ['seat-1', 'seat-2'], summary: 'Key facts about the problem.' }
      ],
      disagreements: ['seat-1 says X, seat-2 says Y'],
      agreements: ['Both agree on Z']
    }
  },
  verdicts: {
    'decide': [
      {
        pass: false,
        scores: [
          { criterion: 'addresses-top-risk', score: 0, evidence: '' },
          { criterion: 'uses-a-fact', score: 1, evidence: 'some fact' },
          { criterion: 'single-option', score: 0, evidence: '' }
        ],
        ignoredLenses: ['risks'],
        oneLineFeedback: 'Decision bundles two options and ignores risks.',
        confidence: 0.7
      },
      {
        pass: true,
        scores: [
          { criterion: 'addresses-top-risk', score: 2, evidence: 'addresses the repair risk' },
          { criterion: 'uses-a-fact', score: 2, evidence: 'emergency PO under NT$15,000' },
          { criterion: 'single-option', score: 2, evidence: 'one coherent plan' }
        ],
        ignoredLenses: [],
        oneLineFeedback: 'Clear plan addressing risks with evidence.',
        confidence: 0.9
      }
    ]
  }
};

const clusterTool = {
  name: 'cluster_submissions',
  description: 'Cluster submissions',
  input_schema: { type: 'object' }
};

const verdictTool = {
  name: 'submit_verdict',
  description: 'Submit verdict',
  input_schema: { type: 'object' }
};

function passThrough(input: unknown) {
  return { ok: true as const, value: input as any };
}

describe('scripted client', () => {
  const roomCode = 'TEST01';

  beforeEach(() => {
    loadScenarioForSession(roomCode, cannedData);
  });

  afterEach(() => {
    clearScenarioForSession(roomCode);
  });

  it('returns canned cluster data for a reveal block', () => {
    const result = scriptedCallForcedTool(roomCode, {
      role: 'cluster',
      systemPrompt: 'test',
      userContent: 'Submissions from block "observations-input":\nseat-1: some text\nseat-2: other text',
      tool: clusterTool,
      validate: passThrough,
    });
    expect(result.input).toEqual(cannedData.reveals['observations-reveal']);
    expect(result.metric.model).toBe('scripted');
  });

  it('returns first failing verdict then passing verdict', () => {
    const userContent = '<session-facts>\nblock: decide [8/10] type=converge\n</session-facts>';
    const result1 = scriptedCallForcedTool(roomCode, {
      role: 'reviewer',
      systemPrompt: 'test',
      userContent,
      tool: verdictTool,
      validate: passThrough,
    });
    expect(result1.input).toEqual(cannedData.verdicts['decide'][0]);
    expect((result1.input as any).pass).toBe(false);

    const result2 = scriptedCallForcedTool(roomCode, {
      role: 'reviewer',
      systemPrompt: 'test',
      userContent,
      tool: verdictTool,
      validate: passThrough,
    });
    expect(result2.input).toEqual(cannedData.verdicts['decide'][1]);
    expect((result2.input as any).pass).toBe(true);
  });

  it('throws for unknown room', () => {
    expect(() => scriptedCallForcedTool('UNKNOWN', {
      role: 'cluster',
      systemPrompt: 'test',
      userContent: 'Submissions from block "observations-input"',
      tool: clusterTool,
      validate: passThrough,
    })).toThrow('No scenario loaded');
  });

  it('throws for missing reveal data', () => {
    expect(() => scriptedCallForcedTool(roomCode, {
      role: 'cluster',
      systemPrompt: 'test',
      userContent: 'Submissions from block "nonexistent-input"',
      tool: clusterTool,
      validate: passThrough,
    })).toThrow('no canned reveal');
  });

  it('throws for unsupported tool', () => {
    expect(() => scriptedCallForcedTool(roomCode, {
      role: 'helper',
      systemPrompt: 'test',
      userContent: 'test',
      tool: { name: 'give_hint', description: 'hint', input_schema: {} },
      validate: passThrough,
    })).toThrow('unsupported tool');
  });
});
