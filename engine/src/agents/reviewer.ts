import type { SessionState, Method, MethodBlock, ReviewerVerdict, VerdictScore } from '../types.js';
import { callForcedTool, buildSessionFacts, logMetric, type ToolDef } from './client.js';

// ---- tool schema ----

const submitVerdictTool: ToolDef = {
  name: 'submit_verdict',
  description: 'Submit your review verdict for the proposed decision.',
  input_schema: {
    type: 'object',
    properties: {
      pass: { type: 'boolean' },
      scores: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            criterion: { type: 'string' },
            score: { type: 'integer', minimum: 0, maximum: 2 },
            evidence: { type: 'string' },
            concern: { type: 'string', enum: ['none', 'missing_evidence', 'weak_reasoning', 'contradiction'] },
            explanation: { type: 'string', minLength: 1 },
          },
          required: ['criterion', 'score', 'evidence', 'concern', 'explanation'],
        },
      },
      ignoredLenses: { type: 'array', items: { type: 'string' } },
      oneLineFeedback: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['pass', 'scores', 'ignoredLenses', 'oneLineFeedback', 'confidence'],
  },
};

// ---- raw verdict type from model ----

interface RawVerdict {
  pass: boolean;
  scores: VerdictScore[];
  ignoredLenses: string[];
  oneLineFeedback: string;
  confidence: number;
}

// ---- validator ----

function validateVerdict(input: unknown): { ok: true; value: RawVerdict } | { ok: false; error: string } {
  const obj = input as any;
  if (typeof obj?.pass !== 'boolean') return { ok: false, error: 'pass must be a boolean' };
  if (!Array.isArray(obj?.scores)) return { ok: false, error: 'scores must be an array' };
  for (const s of obj.scores) {
    if (typeof s.criterion !== 'string') return { ok: false, error: 'each score needs a criterion string' };
    if (!Number.isInteger(s.score) || s.score < 0 || s.score > 2) return { ok: false, error: `score must be 0, 1 or 2 (got ${s.score})` };
    if (typeof s.evidence !== 'string') return { ok: false, error: 'each score needs an evidence string' };
    if (!['none', 'missing_evidence', 'weak_reasoning', 'contradiction'].includes(s.concern)) return { ok: false, error: 'Each criterion needs a concern classification' };
    if (typeof s.explanation !== 'string' || !s.explanation.trim()) return { ok: false, error: 'explanation must be non-empty text' };
    if (s.concern === 'missing_evidence' && (s.score !== 0 || s.evidence.trim())) return { ok: false, error: 'Missing evidence uses score 0 and no invented quote' };
    if (s.concern === 'contradiction' && !s.evidence.trim()) return { ok: false, error: 'Contradiction requires quoted evidence' };
  }
  if (!Array.isArray(obj?.ignoredLenses)) return { ok: false, error: 'ignoredLenses must be an array' };
  if (typeof obj?.oneLineFeedback !== 'string') return { ok: false, error: 'oneLineFeedback must be a string' };
  if (typeof obj?.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) {
    return { ok: false, error: 'confidence must be a number between 0 and 1' };
  }
  return { ok: true, value: obj as RawVerdict };
}

// ---- prompt builders (exported for testing) ----

export const REVIEWER_SYSTEM_PROMPT = 'You provide advisory decision review, not permission or a guarantee. Score each criterion using its 0/1/2 anchors. Classify each concern: missing_evidence means the notes do not address it (score 0, empty evidence); weak_reasoning means a stated inference is unsupported; contradiction means the proposal conflicts with supplied evidence; none means no concern identified for that criterion. Explain the specific gap or inference separately from the quotation. Missing notes do not prove a proposal false. Use verbatim quotes from actual decision, original responses or reveal content; never rubric illustrations. Preserve minority views and unresolved disagreements; summaries do not establish consensus. A matching quote does not prove your interpretation. State uncertainty and what would change your assessment. Return every criterion exactly once. Do not demand prose written to please the reviewer.';

export function buildReviewerInput(
  session: SessionState,
  method: Method,
  block: MethodBlock,
): string {
  const facts = buildSessionFacts(session, method, block.id);
  const lines: string[] = [facts, ''];

  // Gather reveal content from sourceBlockIds
  const sourceIds = (block.sourceBlockId ?? '').split(',').map(s => s.trim()).filter(Boolean);
  for (const sid of sourceIds) {
    const record = session.blocks[sid];
    if (!record?.reveal) continue;
    const reveal = record.reveal;
    lines.push(`--- Reveal: ${sid} ---`);
    const revealBlock = method.blocks.find(b => b.id === sid);
    for (const source of (revealBlock?.sourceBlockId ?? '').split(',')) {
      for (const submission of session.blocks[source.trim()]?.submissions ?? []) {
        lines.push(`Original response [${submission.seat}]: ${submission.passed ? '[passed]' : submission.text}`);
      }
    }
    if (reveal.clusters && reveal.clusters.length > 0) {
      for (const c of reveal.clusters) {
        lines.push(`Cluster "${c.label}": ${c.summary ?? '(no summary)'} [${c.seats.join(', ')}]`);
      }
    }
    if (reveal.disagreements && reveal.disagreements.length > 0) {
      lines.push(`Disagreements: ${reveal.disagreements.join('; ')}`);
    }
    if (reveal.agreements && reveal.agreements.length > 0) {
      lines.push(`Agreements: ${reveal.agreements.join('; ')}`);
    }
    lines.push('');
  }

  // Decision text
  const decision = session.facts.decision ?? '(no decision submitted)';
  lines.push(`--- Proposed decision ---`);
  lines.push(decision);
  lines.push('');

  // Rubric
  if (block.rubric) {
    lines.push('--- Rubric criteria ---');
    for (const c of block.rubric.criteria) {
      const w = c.weight ?? 1;
      lines.push(`- ${c.id} (weight ${w}): ${c.text}`);
      if (c.scoring) lines.push(`  0: ${c.scoring.zero}\n  1: ${c.scoring.one}\n  2: ${c.scoring.two}`);
    }
    lines.push(`Advisory readiness threshold: ${(block.rubric.passThreshold * 100).toFixed(0)}% of maximum score. People decide whether to proceed.`);

    if (block.rubric.examples && block.rubric.examples.length > 0) {
      lines.push('');
      lines.push('--- Rubric worked illustrations ---');
      for (const ex of block.rubric.examples) {
        lines.push(`Decision: "${ex.decision}"`);
        lines.push(`Verdict: ${ex.verdict}. ${ex.why}`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

// ---- evidence verification ----

export function verifyEvidence(
  scores: VerdictScore[],
  reviewerInput: string,
): { allValid: boolean; failedCriteria: string[] } {
  const failedCriteria: string[] = [];
  for (const s of scores) {
    if (s.score === 0 && !s.concern) continue; // legacy recordings
    if (s.concern === 'missing_evidence' && !s.evidence.trim()) continue;
    if (!s.evidence || s.evidence.trim().length === 0) {
      failedCriteria.push(s.criterion);
      continue;
    }
    // Check if evidence is a verbatim substring of the input
    if (!reviewerInput.includes(s.evidence.trim())) {
      failedCriteria.push(s.criterion);
    }
  }
  return { allValid: failedCriteria.length === 0, failedCriteria };
}

/** Only actual decision/reveal content is evidence; rubric illustrations are not. */
export function buildEvidenceCorpus(session: SessionState, block: MethodBlock, method?: Method): string {
  const content = [session.facts.decision ?? ''];
  for (const id of (block.sourceBlockId ?? '').split(',').map(s => s.trim())) {
    for (const source of (method?.blocks.find(b => b.id === id)?.sourceBlockId ?? '').split(',')) {
      content.push(...(session.blocks[source.trim()]?.submissions ?? []).filter(s => !s.passed).map(s => s.text));
    }
    const reveal = session.blocks[id]?.reveal;
    if (!reveal) continue;
    for (const cluster of reveal.clusters ?? []) content.push(cluster.label, cluster.summary ?? '');
    content.push(...(reveal.disagreements ?? []), ...(reveal.agreements ?? []));
  }
  return content.join('\n');
}

// ---- compute pass from scores ----

export function computePass(
  scores: { criterion: string; score: number }[],
  rubric: { passThreshold: number; criteria: { id: string; weight?: number }[] },
): boolean {
  let totalScore = 0;
  let maxScore = 0;
  for (const criterion of rubric.criteria) {
    const w = criterion.weight ?? 1;
    maxScore += 2 * w;
    const s = scores.find(sc => sc.criterion === criterion.id);
    if (s) totalScore += s.score * w;
  }
  if (maxScore === 0) return true;
  return (totalScore / maxScore) >= rubric.passThreshold;
}

// ---- main review function ----

export async function reviewDecision(
  session: SessionState,
  method: Method,
  block: MethodBlock,
): Promise<ReviewerVerdict> {
  if (!block.rubric) throw new Error('Block has no rubric');

  const reviewerInput = buildReviewerInput(session, method, block);
  const evidenceCorpus = buildEvidenceCorpus(session, block, method);

  // First attempt
  let rawVerdict = await callModel(reviewerInput, session.roomCode, block.id);
  logMetric(session, rawVerdict.metric);
  const expected = new Set(block.rubric.criteria.map(c => c.id));
  const validCriteria = (scores: VerdictScore[]) => scores.length === expected.size && new Set(scores.map(s => s.criterion)).size === expected.size && scores.every(s => expected.has(s.criterion));
  if (!validCriteria(rawVerdict.input.scores)) throw new Error('Review must cover each rubric criterion exactly once');

  // Evidence check
  let check = verifyEvidence(rawVerdict.input.scores, evidenceCorpus);
  if (!check.allValid) {
    // Retry once with feedback about which criteria failed
    const feedback = `Evidence verification failed for criteria: ${check.failedCriteria.join(', ')}. Each evidence string must be a verbatim substring of the decision text or reveal content provided. Please fix the evidence for these criteria.`;
    rawVerdict = await callModelWithFeedback(reviewerInput, feedback, session.roomCode, block.id);
    logMetric(session, rawVerdict.metric);
    if (!validCriteria(rawVerdict.input.scores)) throw new Error('Review must cover each rubric criterion exactly once');

    // Re-check
    check = verifyEvidence(rawVerdict.input.scores, evidenceCorpus);
    if (!check.allValid) {
      // Zero out failed criteria and mark unverified
      for (const cid of check.failedCriteria) {
        const s = rawVerdict.input.scores.find(sc => sc.criterion === cid);
        if (s) {
          s.score = 0;
          (s as any).unverifiedEvidence = true;
        }
      }
    }
  }

  // Engine computes pass from scores, overriding model's opinion
  const enginePass = computePass(rawVerdict.input.scores, block.rubric);
  const modelPassDiffered = rawVerdict.input.pass !== enginePass;

  const verdict: ReviewerVerdict = {
    pass: enginePass,
    scores: rawVerdict.input.scores.map(s => ({
      criterion: s.criterion,
      score: s.score,
      evidence: s.evidence,
      concern: s.concern,
      explanation: s.explanation,
      unverifiedEvidence: (s as any).unverifiedEvidence ?? false,
    })),
    ignoredLenses: rawVerdict.input.ignoredLenses,
    oneLineFeedback: rawVerdict.input.oneLineFeedback,
    confidence: rawVerdict.input.confidence,
    modelPassDiffered,
    at: new Date().toISOString(),
  };

  return verdict;
}

// ---- model call helpers ----

function callModel(reviewerInput: string, roomCode: string, blockId: string) {
  return callForcedTool<RawVerdict>({
    roomCode, blockId,
    role: 'reviewer',
    systemPrompt: REVIEWER_SYSTEM_PROMPT,
    userContent: reviewerInput,
    tool: submitVerdictTool,
    validate: validateVerdict,
  });
}

function callModelWithFeedback(
  reviewerInput: string,
  feedback: string,
  roomCode: string,
  blockId: string,
) {
  // Build a new prompt with the feedback appended
  const userContent = `${reviewerInput}\n\n--- Feedback from evidence verification ---\n${feedback}`;
  return callForcedTool<RawVerdict>({
    roomCode, blockId,
    role: 'reviewer',
    systemPrompt: REVIEWER_SYSTEM_PROMPT,
    userContent,
    tool: submitVerdictTool,
    validate: validateVerdict,
  });
}
