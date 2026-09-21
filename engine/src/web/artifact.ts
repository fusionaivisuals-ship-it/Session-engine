import { getSession, getMethodForSession } from '../engine/store.js';
import { writeArtifacts } from '../engine/artifacts.js';

export function generateArtifact(roomCode: string) {
  const session = getSession(roomCode);
  if (!session) throw new Error('Session not found');
  return writeArtifacts(session, getMethodForSession(session));
}
