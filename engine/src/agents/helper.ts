import type { SessionState, Method, MethodBlock, Submission, ModelCallMetric } from '../types.js';
import { callForcedTool, buildSessionFacts, logMetric, type ToolDef } from './client.js';

// ---- tool schemas (schemas, not actions) ----

const giveHintTool: ToolDef = {
  name: 'give_hint',
  description: 'Give the participant one question (no example answer) in at most 30 words.',
  input_schema: {
    type: 'object',
    properties: {
      question: { type: 'string', maxLength: 200 },
    },
    required: ['question'],
  },
};

const giveExampleTool: ToolDef = {
  name: 'give_example',
  description: 'Give the participant one fictional example of a good entry.',
  input_schema: {
    type: 'object',
    properties: {
      example: { type: 'string' },
    },
    required: ['example'],
  },
};

const suggestRewriteTool: ToolDef = {
  name: 'suggest_rewrite',
  description: 'Suggest a rewrite of the problem statement (frame block only, on facilitator request).',
  input_schema: {
    type: 'object',
    properties: {
      rewrite: { type: 'string' },
      changeNote: { type: 'string' },
    },
    required: ['rewrite', 'changeNote'],
  },
};

// ---- validators ----

function validateHint(input: unknown): { ok: true; value: { question: string } } | { ok: false; error: string } {
  const obj = input as any;
  if (typeof obj?.question !== 'string' || obj.question.trim().length === 0) {
    return { ok: false, error: 'question must be a non-empty string' };
  }
  const words = obj.question.trim().split(/\s+/).length;
  if (words > 30) return { ok: false, error: `question has ${words} words, max 30` };
  if ((obj.question.match(/[?？]/g) ?? []).length !== 1 || !/[?？]$/.test(obj.question.trim())) return { ok: false, error: 'Return exactly one question, ending with a question mark' };
  return { ok: true, value: { question: obj.question.trim() } };
}

function validateExample(input: unknown): { ok: true; value: { example: string } } | { ok: false; error: string } {
  const obj = input as any;
  if (typeof obj?.example !== 'string' || obj.example.trim().length === 0) {
    return { ok: false, error: 'example must be a non-empty string' };
  }
  return { ok: true, value: { example: obj.example.trim() } };
}

function validateRewrite(input: unknown): { ok: true; value: { rewrite: string; changeNote: string } } | { ok: false; error: string } {
  const obj = input as any;
  if (typeof obj?.rewrite !== 'string' || obj.rewrite.trim().length === 0) {
    return { ok: false, error: 'rewrite must be a non-empty string' };
  }
  if (typeof obj?.changeNote !== 'string' || obj.changeNote.trim().length === 0) {
    return { ok: false, error: 'changeNote must be a non-empty string' };
  }
  return { ok: true, value: { rewrite: obj.rewrite.trim(), changeNote: obj.changeNote.trim() } };
}

// ---- context builders ----

function buildHelperContext(
  session: SessionState,
  method: Method,
  block: MethodBlock,
  seat: string,
): string {
  const facts = buildSessionFacts(session, method, block.id);
  const lens = block.lensId ? method.lenses?.find(l => l.id === block.lensId) : null;
  const record = session.blocks[block.id];
  const priorSubs = (record?.submissions ?? []).filter((s: Submission) => s.seat === seat);
  const draft = record?.drafts?.[seat] ?? priorSubs.at(-1)?.text ?? '(no draft yet)';

  let ctx = facts + '\n\n';
  if (block.prompt) ctx += `Block prompt: ${block.prompt}\n`;
  if (lens) ctx += `Current lens: ${lens.name} — ${lens.instruction}\n`;
  ctx += `\nParticipant's current draft:\n${draft}`;
  return ctx;
}

// ---- public API ----

export interface HintResult { question: string; metric: ModelCallMetric }
export interface ExampleResult { example: string; metric: ModelCallMetric }
export interface RewriteResult { rewrite: string; changeNote: string; metric: ModelCallMetric }

export async function getHint(
  session: SessionState, method: Method, block: MethodBlock, seat: string,
): Promise<HintResult> {
  const systemPrompt = (block.helper?.systemPrompt ?? 'You help participants who are stuck.') + '\nAsk exactly one tailored question of at most 30 words to help the participant take their next thinking step. Do not supply or steer toward a preferred answer, add a checklist, or require another help step. They can return directly to writing.';
  const userContent = buildHelperContext(session, method, block, seat);

  const result = await callForcedTool<{ question: string }>({
    roomCode: session.roomCode, blockId: block.id,
    role: 'helper',
    systemPrompt,
    userContent,
    tool: giveHintTool,
    validate: validateHint,
  });

  logMetric(session, result.metric);
  return { question: result.input.question, metric: result.metric };
}

export async function getExample(
  session: SessionState, method: Method, block: MethodBlock, seat: string,
): Promise<ExampleResult> {
  const systemPrompt = block.helper?.systemPrompt ?? 'You help participants who are stuck.';
  const userContent = buildHelperContext(session, method, block, seat);

  const result = await callForcedTool<{ example: string }>({
    roomCode: session.roomCode, blockId: block.id,
    role: 'helper',
    systemPrompt,
    userContent,
    tool: giveExampleTool,
    validate: validateExample,
  });

  logMetric(session, result.metric);
  return { example: result.input.example, metric: result.metric };
}

export function getExampleFromPool(block: MethodBlock): string | null {
  const pool = block.helper?.examplePool;
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function suggestRewrite(
  session: SessionState, method: Method, block: MethodBlock,
): Promise<RewriteResult> {
  if (block.type !== 'frame') throw new Error('suggest_rewrite is only for frame blocks');
  const systemPrompt = (block.helper?.systemPrompt ?? 'You help rewrite problem statements.') + '\nClarify wording without changing meaning. Preserve stakeholders, constraints, uncertainty, objectives and the full range of possible solutions. Do not insert a preferred solution, assume a cause, or silently narrow the problem. If ambiguity cannot be resolved without guessing, retain it and explain it in changeNote. Describe edits and any ambiguity so the facilitator can compare with the original. The suggestion is never automatically applied.';
  const facts = buildSessionFacts(session, method, block.id);
  const userContent = `${facts}\n\nCurrent problem statement:\n${session.facts.problemStatement ?? '(none)'}\n\nPlease suggest a rewrite.`;

  const result = await callForcedTool<{ rewrite: string; changeNote: string }>({
    roomCode: session.roomCode, blockId: block.id,
    role: 'helper',
    systemPrompt,
    userContent,
    tool: suggestRewriteTool,
    validate: validateRewrite,
  });

  logMetric(session, result.metric);
  return { rewrite: result.input.rewrite, changeNote: result.input.changeNote, metric: result.metric };
}
