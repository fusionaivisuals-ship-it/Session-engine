import type { SessionState, Method, MethodBlock, Submission } from '../types.js';
import { callForcedTool, buildSessionFacts, logMetric, type ToolDef } from './client.js';

export interface ClusterResult {
  clusters: { label: string; seats: string[]; summary?: string }[];
  disagreements: string[];
  agreements: string[];
}

const clusterTool: ToolDef = {
  name: 'cluster_submissions',
  description: 'Group the submissions into thematic clusters. Identify key disagreements and agreements.',
  input_schema: {
    type: 'object',
    properties: {
      clusters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            seats: { type: 'array', items: { type: 'string' } },
            summary: { type: 'string' },
          },
          required: ['label', 'seats', 'summary'],
        },
      },
      disagreements: { type: 'array', items: { type: 'string' } },
      agreements: { type: 'array', items: { type: 'string' } },
    },
    required: ['clusters', 'disagreements', 'agreements'],
  },
};

function validateCluster(input: unknown): { ok: true; value: ClusterResult } | { ok: false; error: string } {
  const obj = input as any;
  if (!Array.isArray(obj?.clusters)) return { ok: false, error: 'clusters must be an array' };
  for (const c of obj.clusters) {
    if (typeof c.label !== 'string' || !c.label) return { ok: false, error: 'each cluster needs a label' };
    if (!Array.isArray(c.seats) || c.seats.some((s: unknown) => typeof s !== 'string')) return { ok: false, error: 'each cluster needs a seats array of strings' };
    if (c.summary !== undefined && typeof c.summary !== 'string') return { ok: false, error: 'summary must be text' };
  }
  if (!Array.isArray(obj?.disagreements) || obj.disagreements.some((s: unknown) => typeof s !== 'string')) return { ok: false, error: 'disagreements must be a text array' };
  if (!Array.isArray(obj?.agreements) || obj.agreements.some((s: unknown) => typeof s !== 'string')) return { ok: false, error: 'agreements must be a text array' };
  return { ok: true, value: obj as ClusterResult };
}

export const CLUSTER_SYSTEM_PROMPT = 'Organize responses by topic, not by presumed consensus. Include every submitted seat in at least one theme. Retain minority views and outliers explicitly, using a standalone theme when needed; never discard a response for being unique. Similar wording is not agreement. Theme summaries must preserve opposing positions and uncertainty, and must not imply group consensus. Retain all unresolved disagreements, including different priorities or conditions, in disagreements. List an agreement only when the actual claims and conditions align; say which seats support it. Do not resolve a disagreement or invent one. If submissions do not actually disagree, disagreements must be an empty array. Original responses remain the source of truth.';

export function preserveClusterSources(result: ClusterResult, submissions: Submission[]): ClusterResult {
  const validSeats = new Set(submissions.map(s => s.seat));
  const clusters = result.clusters.map(c => ({ ...c, seats: [...new Set(c.seats.filter(s => validSeats.has(s)))] })).filter(c => c.seats.length);
  const covered = new Set(clusters.flatMap(c => c.seats));
  for (const sub of submissions) {
    if (!covered.has(sub.seat)) clusters.push({ label: sub.passed ? 'Passed' : 'Additional perspective — not grouped', seats: [sub.seat], summary: sub.passed ? sub.passReason ?? 'Passed' : sub.text });
  }
  return { ...result, clusters };
}

export function buildClusterUserContent(
  session: SessionState,
  method: Method,
  block: MethodBlock,
): string | null {
  const sourceBlockId = block.sourceBlockId;
  if (!sourceBlockId) return null;

  const sourceRecord = session.blocks[sourceBlockId];
  if (!sourceRecord?.submissions) return null;

  const facts = buildSessionFacts(session, method, block.id);

  const subLines = sourceRecord.submissions.map((s: Submission) => {
    if (s.passed) return `${s.seat}: [passed]`;
    return `${s.seat}: ${s.text}`;
  });

  return `${facts}\n\nSubmissions from block "${sourceBlockId}":\n${subLines.join('\n')}\n\nCluster these submissions. Passed submissions should appear in their own cluster labelled "Passed", not merged with others.`;
}

export async function clusterSubmissions(
  session: SessionState,
  method: Method,
  block: MethodBlock,
): Promise<{ result: ClusterResult; failed: false } | { result: null; failed: true }> {
  const userContent = buildClusterUserContent(session, method, block);
  if (!userContent) return { result: null, failed: true };

  try {
    const response = await callForcedTool<ClusterResult>({
      roomCode: session.roomCode, blockId: block.id,
      role: 'cluster',
      systemPrompt: CLUSTER_SYSTEM_PROMPT,
      userContent,
      tool: clusterTool,
      validate: validateCluster,
    });

    logMetric(session, response.metric);
    return { result: preserveClusterSources(response.input, session.blocks[block.sourceBlockId ?? '']?.submissions ?? []), failed: false };
  } catch {
    return { result: null, failed: true };
  }
}
