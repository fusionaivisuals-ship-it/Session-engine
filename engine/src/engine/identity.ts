import type { SessionState } from '../types.js';

export interface ParticipantIdentity {
  seatId: string;
  displayName: string;
}

/**
 * Returns the identity of a participant in a session.
 * Today this reads from the session state directly.
 * An accounts slice would replace this with a lookup against a users table,
 * mapping seat → userId → profile, and adding auth context to the request.
 */
export function getParticipantIdentity(session: SessionState, seat: string): ParticipantIdentity | null {
  const p = session.participants.find(pp => pp.seat === seat);
  if (!p) return null;
  return { seatId: p.seat, displayName: p.displayName };
}

export function findParticipantSeat(session: SessionState, nameOrSeat: string): string | undefined {
  return session.participants.find(p => p.seat === nameOrSeat ||
    getParticipantIdentity(session, p.seat)?.displayName === nameOrSeat)?.seat;
}

export function requireParticipant(session: SessionState, seat: string): ParticipantIdentity {
  const identity = getParticipantIdentity(session, seat);
  if (!identity) throw new Error('Seat not found');
  return identity;
}
