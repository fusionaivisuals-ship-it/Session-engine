import type { SessionState, Method, MethodBlock, Submission, ExitReason, DetourTrigger } from '../types.js';
import { createSession, addParticipant, startSession, advanceBlock, enterBlock, getCurrentBlock, generateRoomCode } from './session.js';
import { canAdvance } from './gates.js';
import { getClockStatus, pauseSession, resumeSession, canExtend, grantExtension } from '../clock/clock.js';
import { saveManifest, recoverSessions, freezeRecoveredSession } from './manifest.js';
import { loadMethod } from './methods.js';
import { advanceStuckLadder, submitPass as submitPassAction, swapRoles as swapRolesAction, type StuckResult } from './stuck.js';
import { clusterSubmissions } from '../agents/cluster.js';
import { suggestRewrite as suggestRewriteAction } from '../agents/helper.js';
import { reviewDecision } from '../agents/reviewer.js';
import type { ReviewerVerdict } from '../types.js';
import { writeArtifacts } from './artifacts.js';
import { validateCommitment } from './commitment.js';
import { requireParticipant, findParticipantSeat } from './identity.js';
import { castVote, voteTally, resolveVotes } from './voting.js';
import { isModelConfigured } from '../agents/client.js';
import { currentReview, readyToAct } from './review-advice.js';

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type ChangeListener = (session: SessionState) => void;

const sessions = new Map<string, SessionState>();
const listeners: ChangeListener[] = [];

// Per-room, per-seat keystroke timestamps for idle detection
const keystrokeMaps = new Map<string, Map<string, number>>();

export function getKeystrokeMap(roomCode: string): Map<string, number> {
  let m = keystrokeMaps.get(roomCode);
  if (!m) { m = new Map(); keystrokeMaps.set(roomCode, m); }
  return m;
}

export function onChange(fn: ChangeListener) {
  listeners.push(fn);
  return () => { const index = listeners.indexOf(fn); if (index >= 0) listeners.splice(index, 1); };
}

function notify(session: SessionState) {
  if (session.status === 'complete' && !session.artifacts) writeArtifacts(session, getMethodForSession(session));
  updateDetourProposal(session);
  saveManifest(session);
  for (const fn of listeners) fn(session);
  // Auto-trigger clustering when entering a reveal block
  triggerClusteringIfNeeded(session);
}

function triggerClusteringIfNeeded(session: SessionState) {
  if (session.status !== 'running' || !session.currentBlockId) return;
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block || block.type !== 'reveal') return;
  const record = session.blocks[block.id];
  if (record.reveal?.clusters || record.reveal?.clusteringFailed) return;

  // Solo sessions skip AI clustering — show submissions directly
  if (session.mode === 'solo') {
    record.reveal = record.reveal ?? {};
    const subs = (block.sourceBlockId ?? '').split(',').flatMap(id => session.blocks[id.trim()]?.submissions ?? []);
    record.reveal.clusters = subs.map(s => ({
      label: s.text.slice(0, 60) + (s.text.length > 60 ? '...' : ''),
      seats: [s.seat],
      summary: s.text,
    }));
    record.reveal.agreements = [];
    record.reveal.disagreements = [];
    record.reveal.clusteringFailed = false;
    saveManifest(session);
    for (const fn of listeners) fn(session);
    return;
  }

  // Mark as in-progress to prevent duplicate triggers
  record.reveal = record.reveal ?? {};
  record.reveal.clusteringFailed = true; // temporary flag to prevent re-entry
  clusterSubmissions(session, method, block).then(out => {
    if (!out.failed) {
      record.reveal!.clusters = out.result!.clusters;
      record.reveal!.disagreements = out.result!.disagreements;
      record.reveal!.agreements = out.result!.agreements;
      record.reveal!.clusteringFailed = false;
    }
    saveManifest(session);
    for (const fn of listeners) fn(session);
  }).catch(() => {});
}

export function getSession(roomCode: string): SessionState | undefined {
  return sessions.get(roomCode);
}

export function getActiveSessionCount(): number {
  let count = 0;
  for (const s of sessions.values()) {
    if (s.status === 'lobby' || s.status === 'running' || s.status === 'paused') count++;
  }
  return count;
}

export function getMethodForSession(session: SessionState): Method {
  session.effectiveMethod ??= structuredClone(loadMethod(session.methodId));
  return session.effectiveMethod;
}

export function createNewSession(methodId: string, opts?: { anonymous?: boolean; mode?: 'solo' | 'group' }): SessionState {
  const method = loadMethod(methodId);
  let roomCode = generateRoomCode();
  while (sessions.has(roomCode)) roomCode = generateRoomCode();
  const session = createSession(method, roomCode, opts);
  sessions.set(roomCode, session);
  notify(session);
  return session;
}

export function joinSession(roomCode: string, displayName: string): { session: SessionState; seat: string } {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  // Check if already joined (reconnect)
  if (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 80) throw new Error('Display name must be 1–80 characters');
  displayName = displayName.trim();
  const existingSeat = findParticipantSeat(session, displayName);
  const existing = session.participants.find(p => p.seat === existingSeat);
  if (existing) {
    existing.presence = 'present';
    existing.lastSeenAt = new Date().toISOString();
    notify(session);
    return { session, seat: existing.seat };
  }
  const method = getMethodForSession(session);
  if (session.mode === 'solo' && session.participants.length >= 1) throw new Error('Solo session already has a participant');
  if (session.status !== 'lobby') throw new Error('Session already started; rejoin with your original name');
  if (session.participants.length >= method.groupSize.max) {
    throw new Error('Session is full');
  }
  const p = addParticipant(session, displayName);
  notify(session);
  return { session, seat: p.seat };
}

export function startSessionAction(roomCode: string, facilitatorSeat: string): SessionState {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  requireParticipant(session, facilitatorSeat);
  session.facilitatorSeat = facilitatorSeat;
  startSession(session, method);
  notify(session);
  return session;
}

export function submitInput(roomCode: string, seat: string, text: string): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block) throw new Error('No active block');
  const record = session.blocks[block.id];
  if (!record) throw new Error('Block not started');

  requireParticipant(session, seat);
  if (session.status !== 'running' || block.type !== 'private_input') throw new Error('Not on a running private input block');
  if (typeof text !== 'string' || text.length > 4000) throw new Error('Input must be a string up to 4000 characters');

  // Prevent duplicate submissions
  if (record.submissions?.some(s => s.seat === seat)) {
    throw new Error('Already submitted');
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const submission: Submission = {
    seat,
    text,
    submittedAt: new Date().toISOString(),
    autoSubmitted: false,
    passed: false,
    wordCount,
  };
  record.submissions = record.submissions ?? [];
  record.submissions.push(submission);
  if (record.drafts) delete record.drafts[seat];

  // Track words
  session.metrics.wordsBySeat = session.metrics.wordsBySeat ?? {};
  session.metrics.wordsBySeat[seat] = (session.metrics.wordsBySeat[seat] ?? 0) + wordCount;

  // Check if gate opens
  const result = canAdvance(session, block);
  if (result.ok) {
    advanceBlock(session, method, 'gate');
  }

  notify(session);
}

export function confirmRead(roomCode: string, seat: string): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block) throw new Error('No active block');
  const record = session.blocks[block.id];
  requireParticipant(session, seat);
  if (session.status !== 'running' || !['frame', 'reveal'].includes(block.type)) throw new Error('Cannot confirm this block');
  record.confirmations = record.confirmations ?? [];
  if (!record.confirmations.includes(seat)) {
    record.confirmations.push(seat);
  }

  const result = canAdvance(session, block);
  if (result.ok) {
    advanceBlock(session, method, 'gate');
  }

  notify(session);
}

export function agreeFrame(roomCode: string, seat: string): void {
  // Same as confirmRead for the frame block
  confirmRead(roomCode, seat);
}

export function updateProblemStatement(roomCode: string, text: string): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  if (typeof text !== 'string' || text.length > 500) throw new Error('Problem statement must be a string up to 500 characters');
  session.facts.problemStatement = text;
  notify(session);
}

export function submitCommitment(roomCode: string, seat: string, data: { owner: string; firstAction: string; dueDate: string; successSignal: string }): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block || block.type !== 'commit') throw new Error('Not on commit block');

  requireParticipant(session, seat);
  if (session.status !== 'running') throw new Error('Session must be running');
  data = validateCommitment(session, data);

  session.facts.commitment = data;
  const record = session.blocks[block.id];
  record.submissions = record.submissions ?? [];
  record.submissions.push({
    seat,
    text: JSON.stringify(data),
    submittedAt: new Date().toISOString(),
    autoSubmitted: false,
    passed: false,
    wordCount: data.firstAction.split(/\s+/).length,
  });

  const result = canAdvance(session, block);
  if (result.ok) {
    advanceBlock(session, method, 'gate');
  }
  notify(session);
}

export function submitDecision(roomCode: string, seat: string, decision: string): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block || block.type !== 'converge') throw new Error('Not on converge block');

  if (session.status !== 'running') throw new Error('Session must be running');
  castVote(session, block, seat, decision);
  notify(session);
}

// --- Assign block handlers ---

export function assignRandom(roomCode: string): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block || block.type !== 'assign') throw new Error('Not on assign block');
  if (!method.roles?.length) throw new Error('Method has no roles');

  const active = session.participants.filter(p => p.presence !== 'absent');
  const shuffled = shuffle(method.roles);
  for (let i = 0; i < active.length; i++) {
    active[i].roleId = shuffled[i % shuffled.length].id;
  }

  const result = canAdvance(session, block);
  if (result.ok) advanceBlock(session, method, 'gate');
  notify(session);
}

export function assignChoose(roomCode: string, seat: string, roleId: string): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block || block.type !== 'assign') throw new Error('Not on assign block');
  if (!method.roles?.length) throw new Error('Method has no roles');

  const role = method.roles.find(r => r.id === roleId);
  if (!role) throw new Error('Role not found');

  // Check role not already taken
  const taken = session.participants.some(p => p.roleId === roleId);
  if (taken) throw new Error('Role already taken');

  const participant = session.participants.find(p => p.seat === seat);
  if (!participant) throw new Error('Seat not found');
  if (participant.roleId) throw new Error('Seat already has a role');

  participant.roleId = roleId;

  const result = canAdvance(session, block);
  if (result.ok) advanceBlock(session, method, 'gate');
  notify(session);
}

export function assignFacilitator(roomCode: string, assignments: { seat: string; roleId: string }[]): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block || block.type !== 'assign') throw new Error('Not on assign block');
  if (!method.roles?.length) throw new Error('Method has no roles');

  for (const { seat, roleId } of assignments) {
    const participant = session.participants.find(p => p.seat === seat);
    if (!participant) throw new Error(`Seat ${seat} not found`);
    const role = method.roles.find(r => r.id === roleId);
    if (!role) throw new Error(`Role ${roleId} not found`);
    participant.roleId = roleId;
  }

  const result = canAdvance(session, block);
  if (result.ok) advanceBlock(session, method, 'gate');
  notify(session);
}

const MAX_REVIEWER_RERUNS = 2;
const reviewsInFlight = new Set<string>();

export async function handleReview(roomCode: string): Promise<ReviewerVerdict> {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block || block.type !== 'converge') throw new Error('Not on converge block');
  if (!block.rubric) throw new Error('Block has no rubric');

  const record = session.blocks[block.id];
  record.reviewerVerdicts = record.reviewerVerdicts ?? [];

  // Enforce rerun cap
  if (record.reviewerVerdicts.length >= MAX_REVIEWER_RERUNS + 1) {
    throw new Error('Review limit reached. You may proceed with a recorded reason.');
  }

  if (!record.decision) throw new Error('Finish voting before review');
  if (reviewsInFlight.has(roomCode)) throw new Error('Review already in progress');
  const decision = record.decision;
  const round = record.decisionRound ?? 0;
  reviewsInFlight.add(roomCode);
  let verdict: ReviewerVerdict;
  try { verdict = await reviewDecision(session, method, block); } finally { reviewsInFlight.delete(roomCode); }
  if (session.currentBlockId !== block.id || record.decision !== decision || (record.decisionRound ?? 0) !== round) throw new Error('Review became stale; request a new review');
  verdict.decision = decision;
  verdict.decisionRound = round;
  record.reviewerVerdicts.push(verdict);

  // Check gate
  const result = canAdvance(session, block);
  if (result.ok) {
    advanceBlock(session, method, 'gate');
  }

  notify(session);
  return verdict;
}

export function facilitatorOverride(roomCode: string, reason: string): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  if (!reason.trim()) throw new Error('Override reason required');
  if (getCurrentBlock(session, method)?.type === 'converge') {
    acceptDecision(roomCode, session.facilitatorSeat ?? '', reason);
    return;
  }
  advanceBlock(session, method, 'facilitator_override', reason);
  notify(session);
}

export function facilitatorPause(roomCode: string): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block) throw new Error('No active block');
  pauseSession(session, block);
  notify(session);
}

export function facilitatorResume(roomCode: string): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  resumeSession(session);
  notify(session);
}

export function facilitatorExtend(roomCode: string): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block) throw new Error('No active block');
  const ok = grantExtension(session, block, method.timing.extensionSec);
  if (!ok) throw new Error('Extension already used for this block');
  notify(session);
}

export function heartbeat(roomCode: string, seat: string): void {
  const session = sessions.get(roomCode);
  if (!session) return;
  const p = session.participants.find(pp => pp.seat === seat);
  if (!p) return;
  p.presence = 'present';
  p.lastSeenAt = new Date().toISOString();
  // No full notify for heartbeats — just save periodically
}

export async function handleStuck(roomCode: string, seat: string, step?: import('./stuck.js').StuckStep): Promise<StuckResult | null> {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block || block.type !== 'private_input' || session.status !== 'running') throw new Error('Help is available during private writing');
  requireParticipant(session, seat);
  const result = await advanceStuckLadder(session, method, block, seat, step);
  notify(session);
  return result;
}

export function handlePass(roomCode: string, seat: string, passReason: string): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block) throw new Error('No active block');

  submitPassAction(session, block.id, seat, passReason);

  const result = canAdvance(session, block);
  if (result.ok) {
    advanceBlock(session, method, 'gate');
  }
  notify(session);
}

export function handleSwap(roomCode: string, seatA: string, seatB: string): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  swapRolesAction(session, seatA, seatB);
  notify(session);
}

export async function handleClustering(roomCode: string): Promise<void> {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block || block.type !== 'reveal') return;

  const record = session.blocks[block.id];
  // Only cluster once per reveal block
  if (record.reveal?.clusters || record.reveal?.clusteringFailed) return;

  const out = await clusterSubmissions(session, method, block);
  record.reveal = record.reveal ?? {};
  if (out.failed) {
    record.reveal.clusteringFailed = true;
  } else {
    record.reveal.clusters = out.result!.clusters;
    record.reveal.disagreements = out.result!.disagreements;
    record.reveal.agreements = out.result!.agreements;
  }
  notify(session);
}

export async function handleSuggestRewrite(roomCode: string): Promise<{ original: string; rewrite: string; changeNote: string }> {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (!block || block.type !== 'frame') throw new Error('Not on frame block');

  const original = session.facts.problemStatement ?? '';
  const result = await suggestRewriteAction(session, method, block);
  if (session.currentBlockId !== block.id || session.facts.problemStatement !== original) throw new Error('The problem changed while the suggestion was prepared; request a new suggestion');
  notify(session);
  return { original, rewrite: result.rewrite, changeNote: result.changeNote };
}

export function recordKeystroke(roomCode: string, seat: string, blockId?: string, text?: string): boolean {
  const session = sessions.get(roomCode);
  if (!session) return false;
  requireParticipant(session, seat);
  getKeystrokeMap(roomCode).set(seat, Date.now());
  if (text === undefined) return false;
  const block = getCurrentBlock(session, getMethodForSession(session));
  if (session.status !== 'running' || block?.type !== 'private_input' || blockId !== block.id) return false;
  if (typeof text !== 'string' || text.length > 4000) throw new Error('Draft too long');
  const record = session.blocks[block.id];
  if (record.submissions?.some(s => s.seat === seat)) return false;
  record.drafts ??= {};
  record.drafts[seat] = text;
  saveManifest(session);
  return true;
}

export function checkTimeouts(): void {
  for (const [_code, session] of sessions) {
    if (session.status !== 'running' || !session.currentBlockId) continue;
    const method = getMethodForSession(session);
    const block = getCurrentBlock(session, method);
    if (!block || block.timeboxSec === 0) continue;
    const status = getClockStatus(session, block);
    // Checkpoint running clocks so process downtime does not consume the timebox.
    if (!status.expired) saveManifest(session);
    if (status.expired) {
      // A clock cannot accept a decision on a person's behalf.
      if (block.type === 'converge') continue;
      // Auto-submit any unsubmitted inputs for private_input blocks
      if (block.type === 'private_input') {
        const record = session.blocks[block.id];
        const submitted = new Set((record.submissions ?? []).map(s => s.seat));
        for (const p of session.participants) {
          if (p.presence !== 'absent' && !submitted.has(p.seat)) {
            record.submissions = record.submissions ?? [];
            record.submissions.push({
              seat: p.seat,
              text: record.drafts?.[p.seat] ?? '',
              submittedAt: new Date().toISOString(),
              autoSubmitted: true,
              passed: false,
              wordCount: (record.drafts?.[p.seat] ?? '').trim().split(/\s+/).filter(Boolean).length,
            });
          }
        }
      }
      advanceBlock(session, method, 'timeout');
      notify(session);
    }
  }
}

export function updatePresence(): void {
  const now = Date.now();
  for (const [_code, session] of sessions) {
    if (session.status !== 'running') continue;
    const method = getMethodForSession(session);
    let changed = false;
    for (const p of session.participants) {
      const elapsed = (now - new Date(p.lastSeenAt).getTime()) / 1000;
      const newPresence = elapsed > method.timing.presenceTimeoutSec ? 'absent'
        : elapsed > method.timing.idleSec ? 'idle'
        : 'present';
      if (p.presence !== newPresence) {
        p.presence = newPresence;
        changed = true;
      }
    }
    if (changed) {
      // Re-check gate since absent seats don't block
      const block = getCurrentBlock(session, method);
      if (block) {
        const result = canAdvance(session, block);
        if (result.ok) {
          advanceBlock(session, method, 'gate');
        }
      }
      notify(session);
    }
  }
}

export function recoverOnStartup(): void {
  const recovered = recoverSessions();
  for (const session of recovered) {
    let method: Method;
    try {
      method = getMethodForSession(session);
    } catch (error) {
      // A retired legacy method without a snapshot must not prevent startup.
      // Keep the original manifest and reports on disk for manual recovery.
      console.warn(`Skipping session ${session.roomCode}: method unavailable`, error instanceof Error ? error.message : String(error));
      continue;
    }
    sessions.set(session.roomCode, session);
    if (session.currentBlockId) {
      const block = method.blocks.find(b => b.id === session.currentBlockId);
      if (block) {
        freezeRecoveredSession(session, block.timeboxSec);
      }
    }
  }
}

export function getSessionSummary(session: SessionState) {
  const method = getMethodForSession(session);
  const block = session.currentBlockId ? method.blocks.find(b => b.id === session.currentBlockId) : null;
  const lens = block?.lensId ? method.lenses?.find(l => l.id === block.lensId) : null;
  const clockStatus = block ? getClockStatus(session, block) : null;
  return { session, method, block, lens, clockStatus, modelConfigured: isModelConfigured() };
}

// --- Detour ---

import {
  evaluateTrigger,
  buildProposal,
  acceptDetour as doAcceptDetour,
  declineDetour as doDeclineDetour,
  type DetourProposal,
} from './detour.js';

export function checkDetourTrigger(roomCode: string, trigger: DetourTrigger): DetourProposal | null {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const fb = evaluateTrigger(session, method, trigger);
  if (!fb) return null;
  const proposal = buildProposal(fb, session);
  if (proposal) { session.pendingDetour = proposal; saveManifest(session); }
  return proposal;
}

export function acceptDetourAction(roomCode: string, proposal: DetourProposal): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const pending = session.pendingDetour;
  if (!pending || pending.trigger !== proposal?.trigger) throw new Error('No matching detour proposal');
  if (!evaluateTrigger(session, method, pending.trigger)) throw new Error('Detour no longer available');
  doAcceptDetour(session, method, pending);
  notify(session);
}

export function declineDetourAction(roomCode: string, proposal: DetourProposal): void {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  if (!session.pendingDetour || session.pendingDetour.trigger !== proposal?.trigger) throw new Error('No matching detour proposal');
  doDeclineDetour(session, session.pendingDetour);
  notify(session);
}

function updateDetourProposal(session: SessionState): void {
  if (session.status !== 'running' || session.pendingDetour || session.mode === 'solo') return;
  const method = getMethodForSession(session);
  for (const trigger of ['converge_failed_twice', 'ideas_thin'] as const) {
    const fallback = evaluateTrigger(session, method, trigger);
    if (!fallback) continue;
    const proposal = buildProposal(fallback, session);
    if (proposal) { session.pendingDetour = proposal; return; }
  }
}

function convergeContext(roomCode: string) {
  const session = sessions.get(roomCode);
  if (!session) throw new Error('Session not found');
  const method = getMethodForSession(session);
  const block = getCurrentBlock(session, method);
  if (session.status !== 'running' || block?.type !== 'converge') throw new Error('Not on a running converge block');
  return { session, method, block, record: session.blocks[block.id] };
}

export function resolveDecisionTie(roomCode: string, seat: string, choice: string): void {
  const { session, block, record } = convergeContext(roomCode);
  if (seat !== session.facilitatorSeat) throw new Error('Facilitator must resolve the tie');
  const active = session.participants.filter(p => p.presence !== 'absent');
  if (active.some(p => !record.votes?.[p.seat])) throw new Error('Wait for all votes');
  if (resolveVotes(session, block)) throw new Error('Vote already has a majority');
  const tally = voteTally(session, block);
  if (!tally[choice] || tally[choice] !== Math.max(...Object.values(tally))) throw new Error('Choose a leading candidate');
  record.decision = choice;
  session.facts.decision = choice;
  notify(session);
}

export function resetDecisionVotes(roomCode: string, seat: string): void {
  const { session, record } = convergeContext(roomCode);
  if (seat !== session.facilitatorSeat) throw new Error('Facilitator must start a new vote');
  if (reviewsInFlight.has(roomCode)) throw new Error('Wait for the current review');
  record.votes = {};
  record.decision = null;
  record.decisionRound = (record.decisionRound ?? 0) + 1;
  delete record.decisionAcceptance;
  session.facts.decision = null;
  notify(session);
}

export function selfCheckDecision(roomCode: string, seat: string, checked: string[]): void {
  const { session, method, block, record } = convergeContext(roomCode);
  requireParticipant(session, seat);
  if (session.mode !== 'solo' || isModelConfigured()) throw new Error('Self-check is for solo sessions without a model key');
  if (!record.decision || !block.rubric) throw new Error('Submit a decision first');
  if (!Array.isArray(checked) || block.rubric.criteria.some(c => !checked.includes(c.id))) throw new Error('Check every rubric criterion');
  record.reviewerVerdicts ??= [];
  record.reviewerVerdicts.push({ pass: true, scores: block.rubric.criteria.map(c => ({ criterion: c.id, score: 2, evidence: record.decision! })), ignoredLenses: [], oneLineFeedback: 'Participant self-check (no AI review)', confidence: 1, at: new Date().toISOString() });
  record.decisionAcceptance = { seat, decision: record.decision, round: record.decisionRound ?? 0, reason: 'Participant completed the self-check', at: new Date().toISOString() };
  advanceBlock(session, method, 'gate');
  notify(session);
}

export function acceptDecision(roomCode: string, seat: string, reason = ''): void {
  const { session, method, block, record } = convergeContext(roomCode);
  requireParticipant(session, seat);
  if (session.mode !== 'solo' && seat !== session.facilitatorSeat) throw new Error('Only the facilitator can accept the group decision');
  if (!record.decision) throw new Error('Finish voting and resolve any tie first');
  if (reviewsInFlight.has(roomCode)) throw new Error('Wait for the current review');
  if (typeof reason !== 'string' || reason.length > 4000) throw new Error('Reason must be text of at most 4000 characters');
  const needsReason = !readyToAct(currentReview(record));
  if (needsReason && !reason.trim()) throw new Error('Record why you choose to proceed despite concerns or without a review');
  record.decisionAcceptance = { seat, decision: record.decision, round: record.decisionRound ?? 0, reason: reason.trim(), at: new Date().toISOString() };
  if (canAdvance(session, block).ok) advanceBlock(session, method, 'gate');
  notify(session);
}
