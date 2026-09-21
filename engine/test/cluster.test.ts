import { clusterSubmissions, buildClusterUserContent, CLUSTER_SYSTEM_PROMPT } from '../src/agents/cluster.js';
import { setClient } from '../src/agents/client.js';
import type { SessionState, Method, MethodBlock } from '../src/types.js';

function mockClusterClient(input: any) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'tool_use', id: 'tu_1', name: 'cluster_submissions', input }],
        usage: { input_tokens: 200, output_tokens: 150 },
      }),
    },
  } as any;
}

function failingClient() {
  return {
    messages: {
      create: async () => { throw new Error('API down'); },
    },
  } as any;
}

function countingClient(input: any) {
  let count = 0;
  const client = {
    messages: {
      create: async () => {
        count++;
        return {
          content: [{ type: 'tool_use', id: 'tu_1', name: 'cluster_submissions', input }],
          usage: { input_tokens: 200, output_tokens: 150 },
        };
      },
    },
    getCount: () => count,
  };
  return client as any;
}

function makeSession(): SessionState {
  return {
    roomCode: 'TEST', methodId: 'test', methodVersion: '1',
    createdAt: new Date().toISOString(), status: 'running', anonymous: false, mode: 'group', facilitatorSeat: 'seat-1',
    clock: { blockStartedAt: new Date().toISOString(), remainingSecAtPause: null, extensionsUsed: {}, totalElapsedSec: 0 },
    participants: [
      { seat: 'seat-1', displayName: 'A', presence: 'present', lastSeenAt: new Date().toISOString(), swapsUsed: 0 },
      { seat: 'seat-2', displayName: 'B', presence: 'present', lastSeenAt: new Date().toISOString(), swapsUsed: 0 },
      { seat: 'seat-3', displayName: 'C', presence: 'present', lastSeenAt: new Date().toISOString(), swapsUsed: 0 },
      { seat: 'seat-4', displayName: 'D', presence: 'present', lastSeenAt: new Date().toISOString(), swapsUsed: 0 },
    ],
    currentBlockId: 'reveal-1',
    blocks: {
      'input-1': {
        enteredAt: new Date().toISOString(), exitReason: 'gate',
        submissions: [
          { seat: 'seat-1', text: 'Fast CI matters', submittedAt: new Date().toISOString(), autoSubmitted: false, passed: false, wordCount: 3 },
          { seat: 'seat-2', text: 'Budget is there', submittedAt: new Date().toISOString(), autoSubmitted: false, passed: false, wordCount: 3 },
        ],
      },
      'reveal-1': { enteredAt: new Date().toISOString(), exitReason: 'pending' },
    },
    facts: { problemStatement: 'Test' },
    metrics: {},
  };
}

const method: Method = {
  id: 'test', name: 'Test', version: '1', roleMode: 'rotating',
  groupSize: { min: 2, max: 6 },
  timing: { totalBudgetSec: 3600, extensionSec: 60, idleSec: 30, presenceTimeoutSec: 120 },
  blocks: [
    { id: 'input-1', type: 'private_input', title: 'Input', timeboxSec: 180, completion: 'all_submitted' },
    { id: 'reveal-1', type: 'reveal', title: 'Reveal', timeboxSec: 120, completion: 'all_confirmed', sourceBlockId: 'input-1' },
  ],
};

const revealBlock = method.blocks[1];

afterEach(() => setClient(null));

describe('cluster', () => {
  it('returns clusters on success', async () => {
    setClient(mockClusterClient({
      clusters: [
        { label: 'Speed', seats: ['seat-1'], summary: 'CI speed' },
        { label: 'Resources', seats: ['seat-2'], summary: 'Budget' },
      ],
      disagreements: ['No direct contradictions'],
      agreements: ['Both want improvement'],
    }));

    const session = makeSession();
    const r = await clusterSubmissions(session, method, revealBlock);
    expect(r.failed).toBe(false);
    if (!r.failed) {
      expect(r.result.clusters).toHaveLength(2);
      expect(r.result.agreements).toContain('Both want improvement');
    }
    expect(session.metrics.modelCalls?.length).toBe(1);
  });

  it('returns failed:true on API error (graceful fallback)', async () => {
    setClient(failingClient());
    const session = makeSession();
    const r = await clusterSubmissions(session, method, revealBlock);
    expect(r.failed).toBe(true);
  });

  it('returns failed:true when no sourceBlockId', async () => {
    const blockNoSource: MethodBlock = { ...revealBlock, sourceBlockId: undefined };
    const session = makeSession();
    const r = await clusterSubmissions(session, method, blockNoSource);
    expect(r.failed).toBe(true);
  });

  it('produces exactly one model call per reveal block', async () => {
    const mockInput = {
      clusters: [{ label: 'All', seats: ['seat-1', 'seat-2'], summary: 'Same' }],
      disagreements: [],
      agreements: ['All agree'],
    };
    const client = countingClient(mockInput);
    setClient(client);

    const session = makeSession();
    // Call clustering for the same reveal twice
    await clusterSubmissions(session, method, revealBlock);
    await clusterSubmissions(session, method, revealBlock);

    // Both calls go through (each is independent), but metrics should record each
    expect(session.metrics.modelCalls?.length).toBe(2);
    expect(client.getCount()).toBe(2);
  });

  it('system prompt instructs empty disagreements when no actual disagreement', () => {
    expect(CLUSTER_SYSTEM_PROMPT).toContain('disagreements must be an empty array');
  });

  it('prompt with near-identical submissions contains the empty-disagreements instruction', () => {
    const session = makeSession();
    // Replace submissions with near-identical ones
    session.blocks['input-1'].submissions = [
      { seat: 'seat-1', text: 'CI pipeline is too slow', submittedAt: new Date().toISOString(), autoSubmitted: false, passed: false, wordCount: 5 },
      { seat: 'seat-2', text: 'CI pipeline is too slow for us', submittedAt: new Date().toISOString(), autoSubmitted: false, passed: false, wordCount: 6 },
      { seat: 'seat-3', text: 'The CI pipeline is slow', submittedAt: new Date().toISOString(), autoSubmitted: false, passed: false, wordCount: 5 },
      { seat: 'seat-4', text: 'CI is too slow', submittedAt: new Date().toISOString(), autoSubmitted: false, passed: false, wordCount: 4 },
    ];

    const userContent = buildClusterUserContent(session, method, revealBlock);
    expect(userContent).not.toBeNull();
    expect(userContent).toContain('seat-1');
    expect(userContent).toContain('CI pipeline is too slow');
    // The system prompt (not user content) contains the instruction about empty disagreements
    expect(CLUSTER_SYSTEM_PROMPT).toContain('If submissions do not actually disagree, disagreements must be an empty array');
  });
});
