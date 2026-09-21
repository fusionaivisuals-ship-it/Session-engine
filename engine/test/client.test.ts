import { callForcedTool, setClient } from '../src/agents/client.js';

// Mock Anthropic client
function mockClient(responses: any[]) {
  let callIdx = 0;
  return {
    messages: {
      create: async (_opts: any) => {
        const resp = responses[callIdx++];
        if (!resp) throw new Error('No more mock responses');
        return resp;
      },
    },
  } as any;
}

function makeToolUseResponse(input: any, inputTokens = 100, outputTokens = 50) {
  return {
    content: [{ type: 'tool_use', id: 'tu_1', name: 'test_tool', input }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

const testTool = {
  name: 'test_tool',
  description: 'A test tool',
  input_schema: {
    type: 'object' as const,
    properties: { value: { type: 'string' } },
    required: ['value'],
  },
};

function simpleValidator(input: unknown) {
  const obj = input as any;
  if (typeof obj?.value === 'string' && obj.value.length > 0) {
    return { ok: true as const, value: obj as { value: string } };
  }
  return { ok: false as const, error: 'value must be a non-empty string' };
}

afterEach(() => setClient(null));

describe('callForcedTool', () => {
  it('returns validated input on first try', async () => {
    setClient(mockClient([makeToolUseResponse({ value: 'hello' })]));

    const result = await callForcedTool({
      role: 'helper',
      systemPrompt: 'You are a test.',
      userContent: 'Do something.',
      tool: testTool,
      validate: simpleValidator,
    });

    expect(result.input).toEqual({ value: 'hello' });
    expect(result.metric.retried).toBe(false);
    expect(result.metric.inputTokens).toBe(100);
    expect(result.metric.outputTokens).toBe(50);
    expect(result.metric.tool).toBe('test_tool');
  });

  it('retries once on validation failure then succeeds', async () => {
    setClient(mockClient([
      makeToolUseResponse({ value: '' }),       // fails validation
      makeToolUseResponse({ value: 'fixed' }),  // succeeds
    ]));

    const result = await callForcedTool({
      role: 'helper',
      systemPrompt: 'You are a test.',
      userContent: 'Do something.',
      tool: testTool,
      validate: simpleValidator,
    });

    expect(result.input).toEqual({ value: 'fixed' });
    expect(result.metric.retried).toBe(true);
  });

  it('throws after two validation failures', async () => {
    setClient(mockClient([
      makeToolUseResponse({ value: '' }),
      makeToolUseResponse({ value: '' }),
    ]));

    await expect(callForcedTool({
      role: 'helper',
      systemPrompt: 'You are a test.',
      userContent: 'Do something.',
      tool: testTool,
      validate: simpleValidator,
    })).rejects.toThrow('failed validation after retry');
  });

  it('throws if model returns no tool_use block', async () => {
    setClient(mockClient([{
      content: [{ type: 'text', text: 'oops' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }]));

    await expect(callForcedTool({
      role: 'helper',
      systemPrompt: 'You are a test.',
      userContent: 'Do something.',
      tool: testTool,
      validate: simpleValidator,
    })).rejects.toThrow('did not return tool_use');
  });
});
