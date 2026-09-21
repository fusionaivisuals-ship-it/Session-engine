import type { SessionState, Method, MethodBlock, StuckEvent, Submission } from '../types.js';
import { getHint, getExample, getExampleFromPool } from '../agents/helper.js';

export type StuckStep = 'hint' | 'example' | 'swap' | 'pass' | 'facilitator';
const LADDER_ROTATING: StuckStep[] = ['hint', 'example', 'pass', 'facilitator'];
const LADDER_FIXED: StuckStep[] = ['hint', 'example', 'swap', 'facilitator'];
const LADDER_SOLO: StuckStep[] = ['hint', 'example', 'pass'];

export interface StuckResult {
  step: StuckStep;
  hint?: string;
  example?: string;
  passForm?: boolean;   // true when the step is 'pass' — UI should show the pass form
  swapForm?: boolean;   // true when the step is 'swap' — UI should show the swap form
  facilitatorFlag?: boolean;
}

// Get the steps already taken by this seat in this block
function stepsUsed(session: SessionState, blockId: string, seat: string): Set<StuckStep> {
  const record = session.blocks[blockId];
  if (!record?.stuckEvents) return new Set();
  return new Set(
    record.stuckEvents
      .filter((e: StuckEvent) => e.seat === seat)
      .map((e: StuckEvent) => e.step as StuckStep)
  );
}

function ladderFor(roleMode: 'rotating' | 'fixed', solo: boolean = false): StuckStep[] {
  if (solo) return LADDER_SOLO;
  return roleMode === 'fixed' ? LADDER_FIXED : LADDER_ROTATING;
}

// Get the next ladder step for a seat (or null if fully exhausted)
export function nextStep(session: SessionState, blockId: string, seat: string, roleMode: 'rotating' | 'fixed' = 'rotating'): StuckStep | null {
  const solo = session.mode === 'solo';
  const used = stepsUsed(session, blockId, seat);
  for (const step of ladderFor(roleMode, solo)) {
    if (!used.has(step)) return step;
  }
  return null;
}

// No-op — ladders are now separate so step is already correct for the mode

// Log a stuck event into the manifest
function logEvent(session: SessionState, blockId: string, seat: string, step: StuckStep): void {
  const record = session.blocks[blockId];
  record.stuckEvents = record.stuckEvents ?? [];
  record.stuckEvents.push({
    seat,
    step,
    at: new Date().toISOString(),
  });
}

// Execute one ladder step. Returns result for the UI.
export async function advanceStuckLadder(
  session: SessionState,
  method: Method,
  block: MethodBlock,
  seat: string,
  requestedStep?: StuckStep,
): Promise<StuckResult | null> {
  if (requestedStep && !ladderFor(method.roleMode, session.mode === 'solo').includes(requestedStep)) throw new Error('Help option unavailable');
  const step = requestedStep ?? nextStep(session, block.id, seat, method.roleMode);
  if (!step) return null; // fully exhausted

  switch (step) {
    case 'hint': {
      const result = await getHint(session, method, block, seat);
      logEvent(session, block.id, seat, step);
      return { step: 'hint', hint: result.question };
    }
    case 'example': {
      // Use pool first; call model only if no pool
      const poolExample = getExampleFromPool(block);
      if (poolExample) {
        logEvent(session, block.id, seat, step);
        return { step: 'example', example: poolExample };
      }
      const result = await getExample(session, method, block, seat);
      logEvent(session, block.id, seat, step);
      return { step: 'example', example: result.example };
    }
    case 'swap': {
      logEvent(session, block.id, seat, step);
      return { step: 'swap', swapForm: true };
    }
    case 'pass': {
      logEvent(session, block.id, seat, step);
      return { step: 'pass', passForm: true };
    }
    case 'facilitator': {
      logEvent(session, block.id, seat, step);
      return { step: 'facilitator', facilitatorFlag: true };
    }
  }
}

// Swap roles between two seats (fixed mode, stuck ladder step 3)
export function swapRoles(
  session: SessionState,
  seatA: string,
  seatB: string,
): void {
  const pA = session.participants.find(p => p.seat === seatA);
  const pB = session.participants.find(p => p.seat === seatB);
  if (!pA || !pB) throw new Error('Seat not found');

  if (pA.swapsUsed >= 1) throw new Error('Swap cap reached for this seat');
  if (pB.swapsUsed >= 1) throw new Error('Swap cap reached for partner seat');

  const tmpRole = pA.roleId;
  pA.roleId = pB.roleId;
  pB.roleId = tmpRole;

  pA.swapsUsed += 1;
  pB.swapsUsed += 1;
}

// Submit a pass (counts as submitted with passed:true)
export function submitPass(
  session: SessionState,
  blockId: string,
  seat: string,
  passReason: string,
): void {
  const record = session.blocks[blockId];
  if (!record) throw new Error('Block not started');

  // Prevent duplicate
  if (record.submissions?.some((s: Submission) => s.seat === seat)) {
    throw new Error('Already submitted');
  }

  record.submissions = record.submissions ?? [];
  record.submissions.push({
    seat,
    text: '',
    submittedAt: new Date().toISOString(),
    autoSubmitted: false,
    passed: true,
    passReason,
    wordCount: 0,
  });
}

// Idle detection: returns seats idle beyond the configured seconds
export function getIdleSeats(
  session: SessionState,
  block: MethodBlock,
  method: Method,
  lastKeystrokeMap: Map<string, number>,
): string[] {
  const now = Date.now();
  const thresholdSec = block.stuck?.idleSec ?? method.timing.idleSec;
  const idle: string[] = [];

  for (const p of session.participants) {
    if (p.presence === 'absent') continue;
    // Skip if already submitted
    const record = session.blocks[block.id];
    if (record?.submissions?.some((s: Submission) => s.seat === p.seat)) continue;
    // Check keystroke
    const lastKey = lastKeystrokeMap.get(p.seat) ?? 0;
    if (lastKey > 0 && (now - lastKey) / 1000 >= thresholdSec) {
      // Only trigger if they haven't exhausted the ladder
      if (nextStep(session, block.id, p.seat, method.roleMode) !== null) {
        idle.push(p.seat);
      }
    }
  }

  return idle;
}
