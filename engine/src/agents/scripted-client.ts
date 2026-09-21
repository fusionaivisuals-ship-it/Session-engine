/**
 * Scripted model client — returns canned outputs from a loaded scenario.
 * Implements the same callForcedTool interface as client.ts but requires no API key.
 * Selected by MODEL_MODE=scripted or per-session when a scenario is loaded.
 */
import type { ForcedToolResult, ToolDef } from './client.js';

export interface ScenarioData {
  reveals: Record<string, { clusters: { label: string; seats: string[]; summary?: string }[]; disagreements: string[]; agreements: string[] }>;
  verdicts: Record<string, Array<{
    pass: boolean;
    scores: { criterion: string; score: number; evidence: string }[];
    ignoredLenses: string[];
    oneLineFeedback: string;
    confidence: number;
  }>>;
}

// Per-session scripted data
const sessionScenarios = new Map<string, ScenarioData>();
// Per-session verdict counters (track which verdict to return next per block)
const verdictCounters = new Map<string, Map<string, number>>();

export function loadScenarioForSession(roomCode: string, canned: ScenarioData): void {
  sessionScenarios.set(roomCode, canned);
  verdictCounters.set(roomCode, new Map());
}

export function clearScenarioForSession(roomCode: string): void {
  sessionScenarios.delete(roomCode);
  verdictCounters.delete(roomCode);
}

export function hasScenario(roomCode: string): boolean {
  return sessionScenarios.has(roomCode);
}

/**
 * Extract the block id from the user content.
 * The clustering prompt includes 'Submissions from block "blockId"'.
 * The reviewer prompt includes 'block: blockId [N/M]'.
 */
function extractBlockId(userContent: string, toolName: string): string | null {
  if (toolName === 'cluster_submissions') {
    // Look for sourceBlockId in the clustering prompt: Submissions from block "X"
    const match = userContent.match(/Submissions from block "([^"]+)"/);
    if (match) return match[1];
  }
  if (toolName === 'submit_verdict') {
    // Look for block id in session facts: block: X [N/M]
    const match = userContent.match(/block:\s+(\S+)\s+\[/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Find the reveal block id that sources from this input block.
 * The canned data is keyed by reveal block id, not source block id.
 */
function findRevealBlockForSource(canned: ScenarioData, sourceBlockId: string): string | null {
  // Reveal block ids in the scenario follow a convention like "X-reveal" for source "X-input",
  // but we can't rely on that. Instead, the canned reveals are keyed by reveal block id.
  // The clustering is called with the source block id from the reveal block's sourceBlockId.
  // We need to match: if the user content mentions source block "X-input", find a reveal
  // whose key in the canned data ends with the corresponding reveal id.
  // Since we can't know the mapping here, we'll use a simple heuristic:
  // the reveal for source "foo-input" is likely "foo-reveal".
  const guessRevealId = sourceBlockId.replace(/-input$/, '-reveal');
  if (canned.reveals[guessRevealId]) return guessRevealId;

  // Also try just appending -reveal if no -input suffix
  // Fallback: try all reveals
  for (const key of Object.keys(canned.reveals)) {
    if (key.includes(sourceBlockId.replace(/-input$/, ''))) return key;
  }
  return null;
}

export function scriptedCallForcedTool<T>(
  roomCode: string,
  opts: {
    blockId?: string;
    role: 'helper' | 'cluster' | 'reviewer';
    systemPrompt: string;
    userContent: string;
    tool: ToolDef;
    validate: (input: unknown) => { ok: true; value: T } | { ok: false; error: string };
  }
): ForcedToolResult<T> {
  const canned = sessionScenarios.get(roomCode);
  if (!canned) {
    throw new Error(`No scenario loaded for session ${roomCode}`);
  }

  const toolName = opts.tool.name;
  const blockId = opts.blockId ?? extractBlockId(opts.userContent, toolName);

  if (toolName === 'cluster_submissions') {
    if (!blockId) throw new Error('Scripted client: cannot extract source block id from clustering prompt');
    const revealId = opts.blockId ?? findRevealBlockForSource(canned, blockId);
    if (!revealId || !canned.reveals[revealId]) {
      throw new Error(`Scripted client: no canned reveal for source block "${blockId}" (tried reveal "${revealId}")`);
    }
    const result = canned.reveals[revealId];
    const validation = opts.validate(result);
    if (!validation.ok) throw new Error(`Scripted client: canned cluster data failed validation: ${validation.error}`);
    return {
      input: validation.value,
      metric: { tool: toolName, model: 'scripted', inputTokens: 0, outputTokens: 0, at: new Date().toISOString(), retried: false },
    };
  }

  if (toolName === 'submit_verdict') {
    if (!blockId) throw new Error('Scripted client: cannot extract block id from reviewer prompt');
    const verdictList = canned.verdicts[blockId];
    if (!verdictList || verdictList.length === 0) {
      throw new Error(`Scripted client: no canned verdicts for block "${blockId}"`);
    }
    // Track which verdict to return (supports multiple calls — first may fail)
    const counters = verdictCounters.get(roomCode) ?? new Map();
    const idx = counters.get(blockId) ?? 0;
    const verdict = structuredClone(verdictList[Math.min(idx, verdictList.length - 1)]);
    counters.set(blockId, idx + 1);
    verdictCounters.set(roomCode, counters);

    const validation = opts.validate(verdict);
    if (!validation.ok) throw new Error(`Scripted client: canned verdict data failed validation: ${validation.error}`);
    return {
      input: validation.value,
      metric: { tool: toolName, model: 'scripted', inputTokens: 0, outputTokens: 0, at: new Date().toISOString(), retried: false },
    };
  }

  // For helper tools (give_hint, give_example, suggest_rewrite) — not needed in simulation
  // but provide a fallback
  throw new Error(`Scripted client: unsupported tool "${toolName}" for block "${blockId}"`);
}
