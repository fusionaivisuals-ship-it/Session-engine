/**
 * Extract meaningful walkthrough steps from a completed session.
 * One step per significant moment, not per state write.
 */
import type {
  SessionState,
  Method,
  BlockRecord,
  MethodBlock,
  BlockWalkthrough,
  WalkthroughIntro,
} from '../types.js';
import { seatNumber } from './anonymize.js';
import { readyToAct } from './review-advice.js';

export interface WalkthroughStep {
  n: number;
  blockId: string;
  blockTitle: string;
  lensOrRoleName: string;
  phase: 'enter' | 'submissions' | 'reveal' | 'verdict' | 'complete';
  narration: BlockWalkthrough | null;
  state: WalkthroughStepState;
  newSinceLastStep: string[];
}

export interface WalkthroughStepState {
  problemStatement: string | null;
  currentBlockId: string;
  blockType: string;
  seats: WalkthroughSeat[];
  submissions: WalkthroughSubmission[];
  reveal: WalkthroughReveal | null;
  verdict: WalkthroughVerdict | null;
  decision: string | null;
  commitment: SessionState['facts']['commitment'] | null;
  timerSec: number;
  acceptanceReason?: string;
}

export interface WalkthroughSeat {
  id: string;
  label: string;
  roleName: string | null;
  hasSubmitted: boolean;
}

export interface WalkthroughSubmission {
  seatLabel: string;
  text: string;
  wordCount: number;
}

export interface WalkthroughReveal {
  clusters: { label: string; seats: string[]; summary?: string }[];
  agreements: string[];
  disagreements: string[];
}

export interface WalkthroughVerdict {
  pass: boolean;
  feedback: string;
  attempt: number;
}

export interface WalkthroughJSON {
  scenarioId: string;
  title: string;
  tier: string;
  methodId: string;
  methodName: string;
  walkthroughIntro: WalkthroughIntro | null;
  lenses: Method['lenses'];
  roles: Method['roles'];
  blockSequence: { id: string; title: string; type: string }[];
  steps: WalkthroughStep[];
  report: string;
}

function getLensOrRoleName(method: Method, block: MethodBlock, session: SessionState): string {
  if (method.roleMode === 'rotating' && block.lensId) {
    const lens = method.lenses?.find(l => l.id === block.lensId);
    return lens?.name ?? block.lensId;
  }
  if (method.roleMode === 'fixed' && block.type === 'assign') {
    return 'Role assignment';
  }
  return '';
}

function buildSeats(session: SessionState, method: Method): WalkthroughSeat[] {
  return session.participants.map(p => {
    const roleName = p.roleId && method.roles
      ? method.roles.find(r => r.id === p.roleId)?.name ?? null
      : null;
    return {
      id: p.seat,
      label: seatNumber(p.seat),
      roleName,
      hasSubmitted: false,
    };
  });
}

function buildSubmissions(blockRec: BlockRecord): WalkthroughSubmission[] {
  if (!blockRec.submissions) return [];
  return blockRec.submissions.map(s => ({
    seatLabel: seatNumber(s.seat),
    text: s.text,
    wordCount: s.wordCount,
  }));
}

function buildReveal(blockRec: BlockRecord): WalkthroughReveal | null {
  if (!blockRec.reveal) return null;
  return {
    clusters: (blockRec.reveal.clusters ?? []).map(c => ({ ...c, seats: c.seats.map(seatNumber) })),
    agreements: blockRec.reveal.agreements ?? [],
    disagreements: blockRec.reveal.disagreements ?? [],
  };
}

export function extractSteps(
  session: SessionState,
  method: Method,
  scenario: { id: string; title: string; tier: string; methodId: string },
  report: string,
): WalkthroughJSON {
  const steps: WalkthroughStep[] = [];
  let stepN = 0;

  const seats = buildSeats(session, method);

  for (const methodBlock of method.blocks) {
    const blockRec = session.blocks[methodBlock.id];
    if (!blockRec) continue;

    const lensOrRoleName = getLensOrRoleName(method, methodBlock, session);
    const narration = methodBlock.walkthrough ?? null;

    // Step 1: block entered
    const enterState: WalkthroughStepState = {
      problemStatement: session.facts.problemStatement ?? null,
      currentBlockId: methodBlock.id,
      blockType: methodBlock.type,
      seats: seats.map(s => ({ ...s, hasSubmitted: false })),
      submissions: [],
      reveal: null,
      verdict: null,
      decision: null,
      commitment: null,
      timerSec: methodBlock.timeboxSec,
    };

    const enterNews: string[] = [`Entered: ${methodBlock.title}`];
    if (methodBlock.prompt) enterNews.push(`Prompt: "${methodBlock.prompt}"`);

    steps.push({
      n: ++stepN,
      blockId: methodBlock.id,
      blockTitle: methodBlock.title,
      lensOrRoleName,
      phase: 'enter',
      narration,
      state: enterState,
      newSinceLastStep: enterNews,
    });

    // For assign blocks: show role assignments
    if (methodBlock.type === 'assign') {
      // Roles are visible in seats already — the enter step covers it
      const assignedSeats = seats.map(s => {
        const p = session.participants.find(pp => pp.seat === s.id);
        const roleName = p?.roleId && method.roles
          ? method.roles.find(r => r.id === p.roleId)?.name ?? null
          : null;
        return { ...s, roleName };
      });
      steps[steps.length - 1].state.seats = assignedSeats;
      steps[steps.length - 1].newSinceLastStep.push(
        ...assignedSeats.filter(s => s.roleName).map(s => `${s.label} → ${s.roleName}`),
      );
    }

    // For private_input: submissions step
    if (blockRec.submissions && blockRec.submissions.length > 0) {
      const subs = buildSubmissions(blockRec);
      const subSeats = seats.map(s => ({
        ...s,
        hasSubmitted: blockRec.submissions!.some(sub => sub.seat === s.id),
      }));

      steps.push({
        n: ++stepN,
        blockId: methodBlock.id,
        blockTitle: methodBlock.title,
        lensOrRoleName,
        phase: 'submissions',
        narration,
        state: {
          ...enterState,
          seats: subSeats,
          submissions: subs,
        },
        newSinceLastStep: subs.map(s => `${s.seatLabel} submitted (${s.wordCount} words)`),
      });
    }

    // For reveal blocks: show clustering
    if (blockRec.reveal) {
      const reveal = buildReveal(blockRec);
      steps.push({
        n: ++stepN,
        blockId: methodBlock.id,
        blockTitle: methodBlock.title,
        lensOrRoleName,
        phase: 'reveal',
        narration,
        state: {
          ...enterState,
          reveal,
          submissions: (methodBlock.sourceBlockId ?? '').split(',').flatMap(id => session.blocks[id.trim()] ? buildSubmissions(session.blocks[id.trim()]) : []),
        },
        newSinceLastStep: [
          `${reveal!.clusters.length} clusters formed`,
          ...(reveal!.agreements.length > 0 ? [`${reveal!.agreements.length} agreement(s)`] : []),
          ...(reveal!.disagreements.length > 0 ? [`${reveal!.disagreements.length} disagreement(s)`] : []),
        ],
      });
    }

    // For converge blocks: verdict steps
    if (blockRec.reviewerVerdicts && blockRec.reviewerVerdicts.length > 0) {
      for (let vi = 0; vi < blockRec.reviewerVerdicts.length; vi++) {
        const v = blockRec.reviewerVerdicts[vi];
        steps.push({
          n: ++stepN,
          blockId: methodBlock.id,
          blockTitle: methodBlock.title,
          lensOrRoleName,
          phase: 'verdict',
          narration,
          state: {
            ...enterState,
            decision: blockRec.decision ?? null,
            verdict: {
              pass: readyToAct(v),
              feedback: v.oneLineFeedback,
              attempt: vi + 1,
            },
          },
          newSinceLastStep: [
            `Review ${vi + 1}: ${readyToAct(v) ? 'Ready to act' : 'Needs attention'}`,
            v.oneLineFeedback,
          ],
        });
      }
    }

    // For commit blocks: show commitment
    if (blockRec.decisionAcceptance) {
      steps.push({ n: ++stepN, blockId: methodBlock.id, blockTitle: methodBlock.title, lensOrRoleName, phase: 'verdict', narration,
        state: { ...enterState, decision: blockRec.decision ?? null, acceptanceReason: blockRec.decisionAcceptance.reason || 'The participants reviewed the advice and chose to proceed.' },
        newSinceLastStep: ['Decision deliberately accepted', blockRec.decisionAcceptance.reason] });
    }

    if (methodBlock.type === 'commit' && session.facts.commitment) {
      steps[steps.length - 1].state.commitment = session.facts.commitment;
      steps[steps.length - 1].newSinceLastStep.push(
        `Owner: ${session.facts.commitment.owner}`,
        `Action: ${session.facts.commitment.firstAction}`,
        `Due: ${session.facts.commitment.dueDate}`,
      );
    }

    // For artifact blocks: complete step
    if (methodBlock.type === 'artifact') {
      steps[steps.length - 1].phase = 'complete';
      steps[steps.length - 1].newSinceLastStep = ['Session complete — report generated'];
    }
  }

  return {
    scenarioId: scenario.id,
    title: scenario.title,
    tier: scenario.tier,
    methodId: scenario.methodId,
    methodName: method.name,
    walkthroughIntro: method.walkthroughIntro ?? null,
    lenses: method.lenses,
    roles: method.roles,
    blockSequence: method.blocks.map(b => ({ id: b.id, title: b.title, type: b.type })),
    steps,
    report,
  };
}
