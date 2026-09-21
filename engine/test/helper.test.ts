import { getHint, getExample, getExampleFromPool, suggestRewrite } from '../src/agents/helper.js';
import { setClient } from '../src/agents/client.js';
import type { SessionState, Method, MethodBlock } from '../src/types.js';

function mockClient(toolInput: any) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'tool_use', id: 'tu_1', name: 'give_hint', input: toolInput }],
        usage: { input_tokens: 80, output_tokens: 30 },
      }),
    },
  } as any;
}

function mockClientForTool(name: string, toolInput: any) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'tool_use', id: 'tu_1', name, input: toolInput }],
        usage: { input_tokens: 80, output_tokens: 30 },
      }),
    },
  } as any;
}

const session: SessionState = {
  roomCode: 'TEST',
  methodId: 'test-method',
  methodVersion: '1',
  createdAt: new Date().toISOString(),
  status: 'running',
  anonymous: false,
  mode: 'group',
  facilitatorSeat: 'seat-1',
  clock: { blockStartedAt: new Date().toISOString(), remainingSecAtPause: null, extensionsUsed: {}, totalElapsedSec: 0 },
  participants: [{ seat: 'seat-1', displayName: 'Alice', presence: 'present', lastSeenAt: new Date().toISOString(), swapsUsed: 0 }],
  currentBlockId: 'b1',
  blocks: { b1: { enteredAt: new Date().toISOString(), exitReason: 'pending', submissions: [] } },
  facts: { problemStatement: 'Test problem' },
  metrics: {},
};

const method: Method = {
  id: 'test-method', name: 'Test', version: '1', roleMode: 'rotating',
  groupSize: { min: 2, max: 6 }, timing: { totalBudgetSec: 3600, extensionSec: 60, idleSec: 30, presenceTimeoutSec: 120 },
  lenses: [{ id: 'l1', name: 'Test Lens', instruction: 'Do test things' }],
  blocks: [{
    id: 'b1', type: 'private_input', title: 'Test Block', timeboxSec: 180, completion: 'all_submitted',
    lensId: 'l1', prompt: 'Write your answer.',
    helper: { systemPrompt: 'You help.', hintStyle: 'Ask a question.', examplePool: ['Example A', 'Example B'] },
  }],
};

const block = method.blocks[0];

afterEach(() => setClient(null));

describe('helper', () => {
  it('rejects an answer or multiple questions instead of one small question', async () => {
    setClient(mockClient({ question: 'Choose option A.' }));
    await expect(getHint(session, method, block, 'seat-1')).rejects.toThrow('exactly one question');
    setClient(mockClient({ question: 'What matters? Who benefits?' }));
    await expect(getHint(session, method, block, 'seat-1')).rejects.toThrow('exactly one question');
  });
  it('getHint returns a question and logs metric', async () => {
    setClient(mockClient({ question: 'What fact do you have?' }));
    const result = await getHint(session, method, block, 'seat-1');
    expect(result.question).toBe('What fact do you have?');
    expect(result.metric.tool).toBe('give_hint');
    expect(session.metrics.modelCalls?.length).toBeGreaterThan(0);
  });

  it('getExample calls model when no pool', async () => {
    const blockNoPool = { ...block, helper: { ...block.helper!, examplePool: undefined } };
    setClient(mockClientForTool('give_example', { example: 'Here is an example.' }));
    const result = await getExample(session, method, blockNoPool, 'seat-1');
    expect(result.example).toBe('Here is an example.');
  });

  it('getExampleFromPool returns pool item when available', () => {
    const ex = getExampleFromPool(block);
    expect(['Example A', 'Example B']).toContain(ex);
  });

  it('getExampleFromPool returns null when no pool', () => {
    const blockNoPool = { ...block, helper: { ...block.helper!, examplePool: undefined } };
    expect(getExampleFromPool(blockNoPool)).toBeNull();
  });

  it('suggestRewrite works for frame blocks', async () => {
    const frameBlock: MethodBlock = { ...block, type: 'frame', completion: 'all_agreed' };
    const frameMethod = { ...method, blocks: [frameBlock] };
    setClient(mockClientForTool('suggest_rewrite', { rewrite: 'Better problem.', changeNote: 'Clarified subject.' }));
    const result = await suggestRewrite(session, frameMethod, frameBlock);
    expect(result.rewrite).toBe('Better problem.');
    expect(result.changeNote).toBe('Clarified subject.');
  });

  it('suggestRewrite throws for non-frame blocks', async () => {
    await expect(suggestRewrite(session, method, block)).rejects.toThrow('only for frame blocks');
  });
});
