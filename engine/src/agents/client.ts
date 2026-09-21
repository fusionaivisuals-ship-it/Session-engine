import { hasScenario, scriptedCallForcedTool } from './scripted-client.js';
import Anthropic from '@anthropic-ai/sdk';
import type { SessionState, Method, ModelCallMetric } from '../types.js';

// ---- env config ----

const apiKey = () => process.env.ANTHROPIC_API_KEY;
const openRouterKey = () => process.env.OPENROUTER_API_KEY;
const modelHelper = () => process.env.MODEL_HELPER || 'claude-haiku-4-5-20251001';
const modelCluster = () => process.env.MODEL_CLUSTER || 'claude-haiku-4-5-20251001';
const modelReviewer = () => process.env.MODEL_REVIEWER || 'claude-sonnet-4-6';

function useOpenRouter(): boolean {
  return !!openRouterKey();
}

export function getModelId(role: 'helper' | 'cluster' | 'reviewer'): string {
  if (role === 'reviewer') return modelReviewer();
  return role === 'helper' ? modelHelper() : modelCluster();
}

// ---- session-facts builder (SPEC §7.5) ----

export function buildSessionFacts(session: SessionState, method: Method, blockId: string): string {
  const block = method.blocks.find(b => b.id === blockId);
  const lens = block?.lensId ? method.lenses?.find(l => l.id === block.lensId) : null;
  const idx = method.blocks.findIndex(b => b.id === blockId);
  const lines = [
    `<session-facts>`,
    `method: ${method.name} (${method.roleMode} mode)`,
    `block: ${blockId} [${idx + 1}/${method.blocks.length}] type=${block?.type}`,
  ];
  if (lens) lines.push(`lens: ${lens.name} — ${lens.instruction}`);
  if (session.facts.problemStatement) lines.push(`problem: ${session.facts.problemStatement}`);
  if (session.facts.decision) lines.push(`decision: ${session.facts.decision}`);
  lines.push(`participants: ${session.participants.length} (${session.participants.filter(p => p.presence !== 'absent').length} active)`);
  lines.push(`</session-facts>`);
  return lines.join('\n');
}

// ---- tool schema types ----

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ForcedToolResult<T = unknown> {
  input: T;
  metric: ModelCallMetric;
}

// ---- injectable client for testing (Anthropic path) ----

let clientInstance: Anthropic | null = null;

export function setClient(c: Anthropic | null): void {
  clientInstance = c;
}

function getClient(): Anthropic {
  if (clientInstance) return clientInstance;
  const key = apiKey();
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  clientInstance = new Anthropic({ apiKey: key });
  return clientInstance;
}

// ---- OpenRouter path (OpenAI-compatible via fetch) ----

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export function isModelConfigured(): boolean {
  return !!(apiKey() || openRouterKey());
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  messages: OpenRouterMessage[],
  tool: ToolDef,
): Promise<{ input: unknown; inputTokens: number; outputTokens: number; rawAssistant: OpenRouterMessage }> {
  const key = openRouterKey();
  if (!key) throw new Error('OPENROUTER_API_KEY not set');

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    tools: [{
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }],
    tool_choice: { type: 'function', function: { name: tool.name } },
    max_tokens: 1024,
  };

  const res = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error('OpenRouter returned no choices');

  const msg = choice.message;
  const toolCall = msg?.tool_calls?.[0];

  if (!toolCall) {
    // Model returned text instead of a tool call — try to parse JSON from content
    const content = msg?.content ?? '';
    try {
      const parsed = JSON.parse(content);
      return {
        input: parsed,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        rawAssistant: msg,
      };
    } catch {
      throw new Error(`Model did not return tool call for ${tool.name}. Got: ${content.slice(0, 200)}`);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error(`Failed to parse tool arguments: ${toolCall.function.arguments.slice(0, 200)}`);
  }

  return {
    input: parsed,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    rawAssistant: msg,
  };
}

// ---- core wrapper ----

export async function callForcedTool<T>(opts: {
  roomCode?: string;
  blockId?: string;
  role: 'helper' | 'cluster' | 'reviewer';
  systemPrompt: string;
  userContent: string;
  tool: ToolDef;
  validate: (input: unknown) => { ok: true; value: T } | { ok: false; error: string };
}): Promise<ForcedToolResult<T>> {
  if (opts.roomCode && hasScenario(opts.roomCode)) return scriptedCallForcedTool(opts.roomCode, opts);

  const model = getModelId(opts.role);

  if (useOpenRouter()) {
    return callForcedToolOpenRouter<T>(model, opts);
  }
  return callForcedToolAnthropic<T>(model, opts);
}

// ---- OpenRouter implementation ----

async function callForcedToolOpenRouter<T>(model: string, opts: {
  systemPrompt: string;
  userContent: string;
  tool: ToolDef;
  validate: (input: unknown) => { ok: true; value: T } | { ok: false; error: string };
}): Promise<ForcedToolResult<T>> {
  const messages: OpenRouterMessage[] = [
    { role: 'user', content: opts.userContent },
  ];

  let retried = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callOpenRouter(model, opts.systemPrompt, messages, opts.tool);
    const validation = opts.validate(result.input);

    if (validation.ok) {
      const metric: ModelCallMetric = {
        tool: opts.tool.name, model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        at: new Date().toISOString(), retried,
      };
      return { input: validation.value, metric };
    }

    if (attempt === 0) {
      retried = true;
      messages.push(
        result.rawAssistant,
        { role: 'user', content: `Schema validation failed: ${validation.error}\nPlease fix and try again.` },
      );
    } else {
      throw new Error(`Tool ${opts.tool.name} failed validation after retry: ${validation.error}`);
    }
  }

  throw new Error('Unreachable');
}

// ---- Anthropic SDK implementation ----

async function callForcedToolAnthropic<T>(model: string, opts: {
  systemPrompt: string;
  userContent: string;
  tool: ToolDef;
  validate: (input: unknown) => { ok: true; value: T } | { ok: false; error: string };
}): Promise<ForcedToolResult<T>> {
  const client = getClient();

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: opts.userContent },
  ];

  const toolDef: Anthropic.Tool = {
    name: opts.tool.name,
    description: opts.tool.description,
    input_schema: opts.tool.input_schema as Anthropic.Tool['input_schema'],
  };

  let retried = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: opts.systemPrompt,
      messages,
      tools: [toolDef],
      tool_choice: { type: 'tool', name: opts.tool.name },
    });

    const toolBlock = response.content.find(
      (b): b is Anthropic.ContentBlock & { type: 'tool_use' } => b.type === 'tool_use'
    );

    if (!toolBlock) {
      throw new Error(`Model did not return tool_use block for ${opts.tool.name}`);
    }

    const validation = opts.validate(toolBlock.input);

    if (validation.ok) {
      const metric: ModelCallMetric = {
        tool: opts.tool.name,
        model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        at: new Date().toISOString(),
        retried,
      };
      return { input: validation.value, metric };
    }

    if (attempt === 0) {
      retried = true;
      messages.push(
        { role: 'assistant', content: response.content },
        { role: 'user', content: `Schema validation failed: ${validation.error}\nPlease fix and try again.` },
      );
    } else {
      throw new Error(`Tool ${opts.tool.name} failed validation after retry: ${validation.error}`);
    }
  }

  throw new Error('Unreachable');
}

// ---- metric logging helper ----

export function logMetric(session: SessionState, metric: ModelCallMetric): void {
  session.metrics.modelCalls = session.metrics.modelCalls ?? [];
  session.metrics.modelCalls.push(metric);
}
