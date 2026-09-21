// Quick smoke test: call OpenRouter with a forced tool to verify the integration works
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env manually (no dotenv dependency)
const envPath = resolve(import.meta.dirname ?? '.', '..', '.env');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

import { callForcedTool, getModelId } from '../src/agents/client.js';

const tool = {
  name: 'say_hello',
  description: 'Say hello to someone.',
  input_schema: {
    type: 'object',
    properties: {
      greeting: { type: 'string' },
    },
    required: ['greeting'],
  },
};

function validate(input: unknown): { ok: true; value: { greeting: string } } | { ok: false; error: string } {
  const obj = input as any;
  if (typeof obj?.greeting === 'string' && obj.greeting.length > 0) {
    return { ok: true, value: { greeting: obj.greeting } };
  }
  return { ok: false, error: 'greeting must be a non-empty string' };
}

async function main() {
  console.log('Using model:', getModelId('helper'));
  console.log('OPENROUTER_API_KEY set:', !!process.env.OPENROUTER_API_KEY);
  console.log('');

  try {
    const result = await callForcedTool({
      role: 'helper',
      systemPrompt: 'You are a friendly assistant. Always use the provided tool.',
      userContent: 'Say hello to the user in a creative way.',
      tool,
      validate,
    });

    console.log('SUCCESS');
    console.log('Greeting:', result.input.greeting);
    console.log('Tokens — input:', result.metric.inputTokens, 'output:', result.metric.outputTokens);
    console.log('Model:', result.metric.model);
  } catch (err: any) {
    console.error('FAILED:', err.message);
    process.exit(1);
  }
}

main();
