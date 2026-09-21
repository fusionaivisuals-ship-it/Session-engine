import type { BlockRecord, ReviewerVerdict } from '../types.js';

export function currentReview(record: BlockRecord): ReviewerVerdict | undefined {
  return record.reviewerVerdicts?.filter(v => (v.decisionRound ?? 0) === (record.decisionRound ?? 0) && (!v.decision || v.decision === record.decision)).at(-1);
}

export function readyToAct(review?: ReviewerVerdict): boolean {
  return Boolean(review?.pass && review.confidence >= 0.5 && !review.scores.some(s => s.unverifiedEvidence || (s.concern && s.concern !== 'none')));
}
