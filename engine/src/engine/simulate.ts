/**
 * Simulation engine — runs a scenario headlessly with simulated participants.
 * No human interaction needed. The scripted client handles all model calls.
 */
import * as store from './store.js';
import { loadScenario, type Scenario, type ScenarioSeat } from './scenario.js';
import { loadScenarioForSession, scriptedCallForcedTool, clearScenarioForSession } from '../agents/scripted-client.js';
import { generateArtifact } from '../web/artifact.js';
import type { SessionState, Method } from '../types.js';

export interface SimulateOptions {
  clockScale?: number;  // 1 = real time, 10 = 10x speed
  onStateChange?: (session: SessionState) => void;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Set up a scenario session synchronously (create, join, start, wire scripted client),
 * then kick off the async block-driving in the background.
 * Returns the session immediately so the caller can redirect before the simulation finishes.
 */
export function startDemoScenario(scenarioId: string, opts?: SimulateOptions): SessionState {
  const scenario = loadScenario(scenarioId);
  const clockScale = opts?.clockScale ?? 1;
  const stagger = Math.max(50, Math.round(500 / clockScale));

  // Wire up the scripted client globally

  // Create session
  const session = store.createNewSession(scenario.methodId, { anonymous: scenario.anonymous });
  const roomCode = session.roomCode;

  // Load canned data for this session
  loadScenarioForSession(roomCode, scenario.canned);

  let unsubscribe = () => {};
  // Register state change listener if provided
  if (opts?.onStateChange) {
    // Listener is filtered and removed when the scenario ends.
    unsubscribe = store.onChange(state => { if (state.roomCode === roomCode) opts.onStateChange!(state); });
  }

  // Join all seats
  for (const seatSpec of scenario.seats) {
    const displayName = `Participant ${seatSpec.seat.replace('seat-', '')}`;
    store.joinSession(roomCode, displayName);
  }

  // Start session
  store.startSessionAction(roomCode, 'seat-1');

  // Prefill problem statement
  store.updateProblemStatement(roomCode, scenario.problemStatement);

  // Drive blocks in background — don't await
  const method = store.getMethodForSession(session);
  driveBlocks(roomCode, session, method, scenario, stagger)
    .catch((err) => console.error(`Demo ${scenarioId} error:`, err))
    .finally(() => {
      unsubscribe();
      clearScenarioForSession(roomCode);
    });

  return session;
}

/**
 * Run a scenario from start to completion headlessly.
 * Returns the final session state.
 */
export async function runScenario(scenarioId: string, opts?: SimulateOptions): Promise<SessionState> {
  const scenario = loadScenario(scenarioId);
  const clockScale = opts?.clockScale ?? 1;
  const stagger = Math.max(50, Math.round(500 / clockScale)); // ms between simulated actions

  // Wire up the scripted client globally

  // Create session
  const session = store.createNewSession(scenario.methodId, { anonymous: scenario.anonymous });
  const roomCode = session.roomCode;

  // Load canned data for this session
  loadScenarioForSession(roomCode, scenario.canned);

  let unsubscribe = () => {};
  // Register state change listener if provided
  if (opts?.onStateChange) {
    // Listener is filtered and removed when the scenario ends.
    unsubscribe = store.onChange(state => { if (state.roomCode === roomCode) opts.onStateChange!(state); });
  }

  try {
    // Join all seats with display names from persona (use seat id as name for anonymity)
    for (const seatSpec of scenario.seats) {
      const displayName = `Participant ${seatSpec.seat.replace('seat-', '')}`;
      store.joinSession(roomCode, displayName);
    }

    // Start session (first seat is facilitator)
    store.startSessionAction(roomCode, 'seat-1');

    // Prefill problem statement
    store.updateProblemStatement(roomCode, scenario.problemStatement);

    // Now drive through each block
    const method = store.getMethodForSession(session);
    await driveBlocks(roomCode, session, method, scenario, stagger);

    return session;
  } finally {
    unsubscribe();
    clearScenarioForSession(roomCode);
  }
}

async function driveBlocks(
  roomCode: string,
  session: SessionState,
  method: Method,
  scenario: Scenario,
  stagger: number,
): Promise<void> {
  while (session.status === 'running' && session.currentBlockId) {
    const block = method.blocks.find(b => b.id === session.currentBlockId);
    if (!block) break;

    switch (block.type) {
      case 'frame':
        await driveFrame(roomCode, session, scenario, stagger);
        break;
      case 'assign':
        await driveAssign(roomCode, stagger);
        break;
      case 'private_input':
        await drivePrivateInput(roomCode, session, block.id, scenario, stagger);
        break;
      case 'reveal':
        await driveReveal(roomCode, session, stagger);
        break;
      case 'converge':
        await driveConverge(roomCode, session, scenario, stagger);
        break;
      case 'commit':
        await driveCommit(roomCode, session, scenario, stagger);
        break;
      case 'artifact':
        // Generate artifact then auto-advance
        try { generateArtifact(roomCode); } catch { /* ok if it fails */ }
        // Artifact blocks auto-complete
        break;
      default:
        break;
    }

    // Small delay to let async operations settle
    await delay(stagger);

    if (session.currentBlockId === block.id && session.status === 'running') throw new Error(`Simulation stalled at ${block.id}`);
  }
}

async function driveFrame(
  roomCode: string,
  session: SessionState,
  scenario: Scenario,
  stagger: number,
): Promise<void> {
  // Problem statement already set; all seats agree
  for (const p of session.participants) {
    if (p.presence !== 'absent') {
      await delay(stagger);
      store.agreeFrame(roomCode, p.seat);
    }
  }
}

async function driveAssign(roomCode: string, stagger: number): Promise<void> {
  await delay(stagger);
  store.assignRandom(roomCode);
}

async function drivePrivateInput(
  roomCode: string,
  session: SessionState,
  blockId: string,
  scenario: Scenario,
  stagger: number,
): Promise<void> {
  for (const seatSpec of scenario.seats) {
    await delay(stagger + Math.random() * stagger); // random stagger

    // Check if this seat should pass
    if (seatSpec.passes?.includes(blockId)) {
      store.handlePass(roomCode, seatSpec.seat, 'Simulated pass');
      continue;
    }

    const text = seatSpec.submissions[blockId];
    if (text) {
      store.submitInput(roomCode, seatSpec.seat, text);
    }
  }
}

async function driveReveal(
  roomCode: string,
  session: SessionState,
  stagger: number,
): Promise<void> {
  // Wait for clustering to complete
  await delay(stagger * 3);

  // All seats confirm
  for (const p of session.participants) {
    if (p.presence !== 'absent') {
      await delay(stagger);
      store.confirmRead(roomCode, p.seat);
    }
  }
}

async function driveConverge(
  roomCode: string,
  session: SessionState,
  scenario: Scenario,
  stagger: number,
): Promise<void> {
  // Submit the canned decision
  await delay(stagger);
  for (const participant of session.participants) store.submitDecision(roomCode, participant.seat, scenario.canned.decision);

  // Trigger review
  await delay(stagger);
  const advice = await store.handleReview(roomCode);

  // If block hasn't advanced (first verdict failed), submit revised decision and retry
  const method = store.getMethodForSession(session);
  const block = method.blocks.find(b => b.id === session.currentBlockId);
  if (block?.type === 'converge' && !advice.pass) {
    await delay(stagger);
    await store.handleReview(roomCode);
  }
  store.acceptDecision(roomCode, session.facilitatorSeat ?? 'seat-1', 'Scripted demonstration: participants choose to proceed after considering the review.');
}

async function driveCommit(
  roomCode: string,
  session: SessionState,
  scenario: Scenario,
  stagger: number,
): Promise<void> {
  await delay(stagger);
  const c = scenario.canned.commitment;
  const ownerSpec = scenario.seats.find(s => s.seat === c.owner || s.persona === c.owner);
  store.submitCommitment(roomCode, 'seat-1', {
      owner: ownerSpec?.seat ?? c.owner,
      firstAction: c.firstAction,
      dueDate: c.dueDate,
      successSignal: c.successSignal,
    });
}
