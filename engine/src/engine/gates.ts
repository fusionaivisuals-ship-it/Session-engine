import type { SessionState, MethodBlock, CanAdvanceResult, Participant } from '../types.js';

function activeSeatIds(session: SessionState): string[] {
  return session.participants
    .filter(p => p.presence !== 'absent')
    .map(p => p.seat);
}

function allSubmitted(session: SessionState, block: MethodBlock): CanAdvanceResult {
  const active = activeSeatIds(session);
  const record = session.blocks[block.id];
  if (!record) return { ok: false, reason: 'Block not started' };
  const submitted = new Set((record.submissions ?? []).map(s => s.seat));
  const missing = active.filter(s => !submitted.has(s));
  if (missing.length === 0) return { ok: true, reason: 'All active participants submitted' };
  return { ok: false, reason: `Waiting for submissions from: ${missing.join(', ')}` };
}

function allConfirmed(session: SessionState, block: MethodBlock): CanAdvanceResult {
  const active = activeSeatIds(session);
  const record = session.blocks[block.id];
  if (!record) return { ok: false, reason: 'Block not started' };
  const confirmed = new Set(record.confirmations ?? []);
  const missing = active.filter(s => !confirmed.has(s));
  if (missing.length === 0) return { ok: true, reason: 'All active participants confirmed' };
  return { ok: false, reason: `Waiting for confirmations from: ${missing.join(', ')}` };
}

function allAgreed(session: SessionState, block: MethodBlock): CanAdvanceResult {
  const active = activeSeatIds(session);
  const record = session.blocks[block.id];
  if (!record) return { ok: false, reason: 'Block not started' };
  const agreed = new Set(record.confirmations ?? []);
  const missing = active.filter(s => !agreed.has(s));
  if (missing.length === 0) return { ok: true, reason: 'All active participants agreed' };
  return { ok: false, reason: `Waiting for agreement from: ${missing.join(', ')}` };
}

function allAssigned(session: SessionState, _block: MethodBlock): CanAdvanceResult {
  const active = activeSeatIds(session);
  const assigned = session.participants.filter(p => p.roleId && active.includes(p.seat));
  if (assigned.length === active.length) return { ok: true, reason: 'All active seats assigned' };
  return { ok: false, reason: `${active.length - assigned.length} seats not assigned` };
}

function reviewerPass(session: SessionState, block: MethodBlock): CanAdvanceResult {
  const record = session.blocks[block.id];
  if (!record) return { ok: false, reason: 'Block not started' };
  const accepted = record.decisionAcceptance;
  if (record.decision && accepted?.decision === record.decision && accepted.round === (record.decisionRound ?? 0)) {
    return { ok: true, reason: 'Decision deliberately accepted' };
  }
  return { ok: false, reason: 'Awaiting a deliberate decision to proceed; review is advisory' };
}

function validForm(session: SessionState, block: MethodBlock): CanAdvanceResult {
  const record = session.blocks[block.id];
  if (!record) return { ok: false, reason: 'Block not started' };
  const subs = record.submissions ?? [];
  if (subs.length === 0) return { ok: false, reason: 'No form submitted' };
  // For commit blocks, verify commitment fields exist in facts
  if (block.type === 'commit') {
    const c = session.facts.commitment;
    if (!c) return { ok: false, reason: 'Commitment not yet submitted' };
    if (!c.owner || !c.firstAction || !c.dueDate || !c.successSignal) {
      return { ok: false, reason: 'Commitment form is incomplete' };
    }
    return { ok: true, reason: 'Valid commitment form submitted' };
  }
  return { ok: true, reason: 'Form submitted' };
}

function auto(_session: SessionState, _block: MethodBlock): CanAdvanceResult {
  return { ok: true, reason: 'Auto-complete' };
}

const ruleCheckers: Record<string, (session: SessionState, block: MethodBlock) => CanAdvanceResult> = {
  all_submitted: allSubmitted,
  all_confirmed: allConfirmed,
  all_agreed: allAgreed,
  all_assigned: allAssigned,
  reviewer_pass: reviewerPass,
  valid_form: validForm,
  auto,
};

export function canAdvance(session: SessionState, block: MethodBlock): CanAdvanceResult {
  const checker = ruleCheckers[block.completion];
  if (!checker) return { ok: false, reason: `Unknown completion rule: ${block.completion}` };
  return checker(session, block);
}
