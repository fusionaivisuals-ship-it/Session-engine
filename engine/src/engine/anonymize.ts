import type { SessionState, Method, Participant } from '../types.js';
import { getParticipantIdentity, findParticipantSeat } from './identity.js';

/**
 * Get the display label for a seat in context.
 * If anonymous, returns "Seat N" (rotating) or the role name (fixed).
 * If not anonymous, returns displayName.
 */
export function seatLabel(session: SessionState, method: Method, seat: string, viewerSeat?: string): string {
  const p = session.participants.find(pp => pp.seat === seat);
  if (!p) return seat;
  if (!session.anonymous) return getParticipantIdentity(session, seat)!.displayName;

  // In anonymous mode: own screen shows "You", everyone else is anonymous
  if (viewerSeat === seat) return `You`;

  if (method.roleMode === 'fixed' && p.roleId) {
    const role = method.roles?.find(r => r.id === p.roleId);
    if (role) return role.name;
  }

  return seatNumber(seat);
}

/** Returns "Seat N" from "seat-N" */
export function seatNumber(seat: string): string {
  const n = seat.replace('seat-', '');
  return `Seat ${n}`;
}

/**
 * Anonymize a full session state payload for a specific viewer.
 * Returns a deep copy with displayNames replaced.
 */
export function anonymizePayload(session: SessionState, method: Method, viewerSeat?: string): SessionState {
  if (!session.anonymous) return session;

  const copy: SessionState = JSON.parse(JSON.stringify(session));
  for (const p of copy.participants) {
    p.displayName = seatLabel(session, method, p.seat, viewerSeat);
  }

  // Anonymize commitment owner
  if (copy.facts.commitment) {
    const ownerSeat = findParticipantSeat(session, copy.facts.commitment.owner);
    copy.facts.commitment.owner = ownerSeat ? seatLabel(session, method, ownerSeat, viewerSeat) : 'anonymous';
  }
  for (const block of method.blocks.filter(b => b.type === 'commit')) {
    for (const submission of copy.blocks[block.id]?.submissions ?? []) {
      submission.text = JSON.stringify(copy.facts.commitment ?? {});
    }
  }

  return copy;
}

/** Public transport projection. Preserve submission receipts, never private text. */
export function projectViewer(session: SessionState, method: Method, viewerSeat?: string) {
  const copy = structuredClone(anonymizePayload(session, method, viewerSeat));
  delete copy.effectiveMethod;
  const visibleMethod = structuredClone(method);
  const ownRole = session.participants.find(p => p.seat === viewerSeat)?.roleId;
  for (const role of visibleMethod.roles ?? []) {
    if (role.id !== ownRole) delete role.hiddenBrief;
  }
  for (const block of method.blocks) {
    const record = copy.blocks[block.id];
    if (!record) continue;
    record.drafts = viewerSeat && record.drafts?.[viewerSeat] !== undefined
      ? { [viewerSeat]: record.drafts[viewerSeat] } : {};
    if (block.type === 'private_input' && !record.exitedAt) {
      record.submissions = record.submissions?.map(s => s.seat === viewerSeat ? s :
        { seat: s.seat, text: '', submittedAt: s.submittedAt, autoSubmitted: s.autoSubmitted, passed: s.passed, wordCount: 0 });
    }
  }
  return { session: copy, method: visibleMethod };
}

/**
 * Render anonymous participation balance for reports.
 * Returns count-based summary ("one seat above 40%") instead of seat-labelled table.
 */
export function anonymousParticipationSummary(
  shares: Record<string, number>,
  flags: { seat: string; flag: string; detail: string }[]
): string[] {
  const lines: string[] = [];
  const total = Object.keys(shares).length;
  const dominant = flags.filter(f => f.flag === 'dominant').length;
  const quiet = flags.filter(f => f.flag === 'quiet').length;
  const multiPass = flags.filter(f => f.flag === 'multi_pass').length;

  lines.push(`${total} seats participated.`);
  if (dominant > 0) lines.push(`${dominant} seat(s) above 40% share.`);
  if (quiet > 0) lines.push(`${quiet} seat(s) below 10% share.`);
  if (multiPass > 0) lines.push(`${multiPass} seat(s) passed 2 or more blocks.`);

  return lines;
}
