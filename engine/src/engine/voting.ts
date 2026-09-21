import type { SessionState, MethodBlock } from '../types.js';
import { requireParticipant } from './identity.js';

export function voteTally(session: SessionState, block: MethodBlock): Record<string, number> {
  const votes = session.blocks[block.id].votes ?? {};
  const tally: Record<string, number> = Object.create(null);
  for (const p of session.participants.filter(p => p.presence !== 'absent')) {
    const choice = votes[p.seat];
    if (choice) tally[choice] = (tally[choice] ?? 0) + 1;
  }
  return tally;
}

export function resolveVotes(session: SessionState, block: MethodBlock): string | null {
  const record = session.blocks[block.id];
  const active = session.participants.filter(p => p.presence !== 'absent');
  if (!active.length || active.some(p => !record.votes?.[p.seat])) return null;
  const ranked = Object.entries(voteTally(session, block)).sort((a, b) => b[1] - a[1]);
  const [choice, count] = ranked[0];
  // An absolute majority wins; otherwise the facilitator chooses from the tally.
  return count > active.length / 2 ? choice : null;
}

export function castVote(session: SessionState, block: MethodBlock, seat: string, choice: string): void {
  requireParticipant(session, seat);
  if (session.participants.find(p => p.seat === seat)!.presence === 'absent') throw new Error('Absent seat cannot vote');
  if (typeof choice !== 'string' || !choice.trim() || choice.length > 4000) throw new Error('Decision must be 1–4000 characters');
  const record = session.blocks[block.id];
  record.votes ??= {};
  if (record.votes[seat]) throw new Error('Already voted in this round');
  record.votes[seat] = choice.trim();
  record.decision = resolveVotes(session, block);
  session.facts.decision = record.decision;
}
