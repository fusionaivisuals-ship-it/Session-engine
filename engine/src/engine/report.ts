import type { SessionState, Method } from '../types.js';
import { readyToAct } from './review-advice.js';
import {
  frameToCommitSec,
  perBlock,
  wordsBySeat,
  shareBySeat,
  participationFlags,
  lensCoverage,
  stuckSummary,
  reviewSummary,
  modelUsage,
} from './metrics.js';
import { seatLabel, anonymousParticipationSummary } from './anonymize.js';
import { getParticipantIdentity, findParticipantSeat } from './identity.js';

export function renderReport(session: SessionState, method: Method): string {
  return [
    ...reportHeader(session, method),
    ...reportDecision(session, method),
    ...reportOutputs(session, method),
    ...reportReviews(session, method),
    ...reportTiming(session, method),
    ...reportParticipation(session, method),
    ...reportCoverage(session, method),
    ...reportStuck(session, method),
    ...reportUsage(session, method),
    ...reportFollowUp(session, method),
  ].join('\n');
}

function reportHeader(session: SessionState, method: Method): string[] {
  const lines: string[] = [];
  // --- Header ---
  const totalTimeSec = frameToCommitSec(session, method);
  const budgetMin = Math.round(method.timing.totalBudgetSec / 60);
  const totalTimeMin = totalTimeSec != null ? Math.round(totalTimeSec / 60) : '?';
  const isAnon = session.anonymous;
  const participants = isAnon
    ? `${session.participants.length} participants (anonymous)`
    : session.participants.map(p => getParticipantIdentity(session, p.seat)!.displayName).join(', ');
  const date = session.createdAt.split('T')[0];

  lines.push(`# Session Report: ${method.name}`);
  lines.push('');
  lines.push(`- **Room:** ${session.roomCode}`);
  lines.push(`- **Date:** ${date}`);
  lines.push(`- **Participants:** ${participants}`);
  lines.push(`- **Time:** ${totalTimeMin} min (budget: ${budgetMin} min)`);
  lines.push('');

  return lines;
}

function reportDecision(session: SessionState, method: Method): string[] {
  const lines: string[] = [];
  const isAnon = session.anonymous;
  // --- Decision and Commitment ---
  lines.push('## Decision');
  lines.push(session.facts.decision ?? '(no decision recorded)');
  lines.push('');

  if (session.facts.commitment) {
    const c = session.facts.commitment;
    let ownerLabel = seatToName(session, c.owner);
    if (isAnon) {
      const ownerP = session.participants.find(p => p.seat === findParticipantSeat(session, c.owner));
      ownerLabel = ownerP ? seatLabel(session, method, ownerP.seat) : 'anonymous';
    }
    lines.push('## Commitment');
    lines.push(`- **Owner:** ${ownerLabel}`);
    lines.push(`- **First action:** ${c.firstAction}`);
    lines.push(`- **Due:** ${c.dueDate}`);
    lines.push(`- **Success signal:** ${c.successSignal}`);
    lines.push('');
  }

  return lines;
}

function reportOutputs(session: SessionState, method: Method): string[] {
  const lines: string[] = [];
  const isAnon = session.anonymous;
  // --- Lens/Role Outputs ---
  lines.push('## Outputs by lens');
  lines.push('');
  const inputBlocks = method.blocks.filter(b => b.type === 'private_input');
  const revealBlocks = method.blocks.filter(b => b.type === 'reveal');

  for (const inputBlock of inputBlocks) {
    const record = session.blocks[inputBlock.id];
    if (!record) continue;
    const lensOrRole = getLensOrRoleLabel(method, inputBlock);
    lines.push(`### ${lensOrRole}`);
    lines.push('');

    // Check if there's a corresponding reveal with clusters
    const revealBlock = revealBlocks.find(r => r.sourceBlockId === inputBlock.id);
    const revealRecord = revealBlock ? session.blocks[revealBlock.id] : null;

    if (revealRecord?.reveal?.clusters && revealRecord.reveal.clusters.length > 0) {
      // Clustered view
      lines.push('| Cluster | Seats | Summary |');
      lines.push('|---------|-------|---------|');
      for (const cl of revealRecord.reveal.clusters) {
        const seatNames = cl.seats.map(s => isAnon ? seatLabel(session, method, s) : seatToName(session, s)).join(', ');
        lines.push(`| ${cl.label} | ${seatNames} | ${cl.summary ?? ''} |`);
      }
      lines.push('');
      if (revealRecord.reveal.disagreements && revealRecord.reveal.disagreements.length > 0) {
        lines.push('**Disagreements:** ' + revealRecord.reveal.disagreements.join('; '));
        lines.push('');
      }
      lines.push('Themes are not consensus. Original responses, including minority views:', '');
      for (const sub of record.submissions ?? []) {
        const name = isAnon ? seatLabel(session, method, sub.seat) : seatToName(session, sub.seat);
        lines.push(`**${name}:** ${sub.passed ? '(passed)' : sub.text}`, '');
      }
    } else {
      // Raw submissions
      lines.push('| Seat | Submission |');
      lines.push('|------|-----------|');
      for (const sub of record.submissions ?? []) {
        const name = isAnon ? seatLabel(session, method, sub.seat) : seatToName(session, sub.seat);
        const text = sub.passed ? `*(passed: ${sub.passReason ?? 'no reason'})* ` : sub.autoSubmitted ? '*(auto-submitted)*' : sub.text.replace(/\n/g, ' ');
        lines.push(`| ${name} | ${text} |`);
      }
      lines.push('');
    }
  }

  return lines;
}

function reportReviews(session: SessionState, method: Method): string[] {
  const lines: string[] = [];
  const isAnon = session.anonymous;
  for (const block of method.blocks) {
    const accepted = session.blocks[block.id]?.decisionAcceptance;
    if (accepted) lines.push('## Decision acceptance', `Decision: ${accepted.decision}`, `Accepted by: ${isAnon ? seatLabel(session, method, accepted.seat) : seatToName(session, accepted.seat)}`, `Reason: ${accepted.reason || 'Reviewed the advice and chose to proceed.'}`, `Recorded: ${accepted.at}`, '');
  }
  // --- Reviewer Verdict Table ---
  const reviews = reviewSummary(session, method);
  if (reviews.length > 0) {
    lines.push('## Advisory decision reviews');
    lines.push('These assessments are advice, not guarantees. Verified quotations do not establish sound interpretation.');
    lines.push('');
    lines.push('| Block | Attempts | Final | Exit |');
    lines.push('|-------|----------|-------|------|');
    for (const r of reviews) {
      const block = method.blocks.find(b => b.id === r.blockId);
      const title = block?.title ?? r.blockId;
      lines.push(`| ${title} | ${r.verdicts} | ${readyToAct(session.blocks[r.blockId]?.reviewerVerdicts?.at(-1)) ? 'Ready to act' : 'Needs attention'} | ${r.finalExit} |`);
    }
    lines.push('');

    // Detailed verdicts
    for (const r of reviews) {
      const block = method.blocks.find(b => b.id === r.blockId);
      const record = session.blocks[r.blockId];
      if (!record?.reviewerVerdicts?.length) continue;
      for (let i = 0; i < record.reviewerVerdicts.length; i++) {
        const v = record.reviewerVerdicts[i];
        lines.push(`### ${block?.title ?? r.blockId} — Attempt ${i + 1} (${readyToAct(v) ? 'Ready to act' : 'Needs attention'})`);
        if (v.decision) lines.push(`Proposal reviewed: ${v.decision}`);
        lines.push(`Confidence: ${(v.confidence * 100).toFixed(0)}% | ${v.oneLineFeedback}`);
        lines.push('');
        if (v.scores.length > 0) {
          lines.push('| Criterion | Score | Concern | Reason | Quotation |');
          lines.push('|-----------|-------|---------|--------|-----------|');
          for (const s of v.scores) {
            lines.push(`| ${s.criterion} | ${s.score}/2 | ${s.concern ?? 'Not classified (older review)'} | ${s.explanation ?? ''} | ${s.evidence}${s.unverifiedEvidence ? ' (quotation unverified)' : ''} |`);
          }
          lines.push('');
        }
        if (v.ignoredLenses.length > 0) {
          lines.push(`Ignored lenses: ${v.ignoredLenses.join(', ')}`);
          lines.push('');
        }
      }
    }
  }

  return lines;
}

function reportTiming(session: SessionState, method: Method): string[] {
  const lines: string[] = [];
  const isAnon = session.anonymous;
  // --- How the group worked ---
  lines.push('## How the group worked');
  lines.push('');

  // Time to decision
  const ttd = frameToCommitSec(session, method);
  if (ttd != null) {
    lines.push(`**Time to decision:** ${Math.round(ttd / 60)} min`);
    lines.push('');
  }

  return lines;
}

function reportParticipation(session: SessionState, method: Method): string[] {
  const lines: string[] = [];
  const isAnon = session.anonymous;
  // Participation balance
  const words = wordsBySeat(session, method);
  const shares = shareBySeat(session, method);
  const flags = participationFlags(session, method);

  if (isAnon) {
    lines.push('**Participation balance:**');
    lines.push('');
    const summary = anonymousParticipationSummary(shares, flags);
    for (const line of summary) lines.push(line);
    lines.push('');
  } else {
    lines.push('**Participation balance:**');
    lines.push('');
    lines.push('| Participant | Words | Share |');
    lines.push('|-------------|-------|-------|');
    for (const p of session.participants) {
      const w = words[p.seat] ?? 0;
      const s = shares[p.seat];
      const pct = s != null ? `${(s * 100).toFixed(0)}%` : 'absent';
      const seatFlags = flags.filter(f => f.seat === p.seat);
      const flagStr = seatFlags.length > 0 ? ' ' + seatFlags.map(f => flagToPlainWords(f)).join(', ') : '';
      lines.push(`| ${seatToName(session, p.seat)} | ${w} | ${pct}${flagStr} |`);
    }
    lines.push('');
  }

  return lines;
}

function reportCoverage(session: SessionState, method: Method): string[] {
  const lines: string[] = [];
  const isAnon = session.anonymous;
  // Lens coverage
  const coverage = lensCoverage(session, method);
  if (coverage.length > 0) {
    lines.push('**Lens coverage:**');
    lines.push('');
    lines.push('| Lens/Role | Coverage |');
    lines.push('|-----------|----------|');
    for (const c of coverage) {
      const label = getLensOrRoleName(method, c.lensOrRoleId);
      lines.push(`| ${label} | ${c.coverage} |`);
    }
    lines.push('');
  }

  return lines;
}

function reportStuck(session: SessionState, method: Method): string[] {
  const lines: string[] = [];
  const isAnon = session.anonymous;
  // Stuck and override log
  const stuck = stuckSummary(session, method);
  const blocks = perBlock(session, method);
  const overrides = blocks.filter(b => b.overrideReason);

  if (stuck.length > 0 || overrides.length > 0) {
    lines.push('**Stuck and override log:**');
    lines.push('');
    if (isAnon) {
      // Totals only
      const totalStuck = stuck.length;
      const totalSwaps = stuck.reduce((sum, s) => sum + s.swapsUsed, 0);
      if (totalStuck > 0) lines.push(`- ${totalStuck} seat(s) used stuck ladder.`);
      if (totalSwaps > 0) lines.push(`- ${totalSwaps} swap(s) total.`);
    } else {
      for (const s of stuck) {
        const name = seatToName(session, s.seat);
        lines.push(`- ${name}: stuck steps [${s.steps.join(', ')}]${s.swapsUsed > 0 ? `, ${s.swapsUsed} swap(s)` : ''}`);
      }
    }
    for (const o of overrides) {
      lines.push(`- Override at "${o.title}": ${o.overrideReason}`);
    }
    lines.push('');
  }

  return lines;
}

function reportUsage(session: SessionState, method: Method): string[] {
  const lines: string[] = [];
  const isAnon = session.anonymous;
  // Model usage
  const usage = modelUsage(session);
  if (usage.totalCalls > 0) {
    lines.push(`**Model usage:** ${usage.totalCalls} calls, ${usage.totalInputTokens.toLocaleString()} input tokens, ${usage.totalOutputTokens.toLocaleString()} output tokens`);
    lines.push('');
  }

  return lines;
}

function reportFollowUp(session: SessionState, method: Method): string[] {
  const lines: string[] = [];
  const isAnon = session.anonymous;
  // Follow-up
  const dueDate = session.facts.commitment?.dueDate;
  if (dueDate) {
    lines.push(`---`);
    lines.push('');
    lines.push(`**30-day follow-up:** Check on ${dueDate} whether the first action happened.`);
    lines.push('');
  }

  return lines;
}

// --- Helpers ---

function seatToName(session: SessionState, seat: string): string {
  return getParticipantIdentity(session, seat)?.displayName ?? seat;
}

function getLensOrRoleLabel(method: Method, block: { lensId?: string }): string {
  if (block.lensId) {
    const lens = method.lenses?.find(l => l.id === block.lensId);
    return lens?.name ?? block.lensId;
  }
  return 'Input';
}

function getLensOrRoleName(method: Method, id: string): string {
  const lens = method.lenses?.find(l => l.id === id);
  if (lens) return lens.name;
  const role = method.roles?.find(r => r.id === id);
  if (role) return role.name;
  return id;
}

function flagToPlainWords(flag: { flag: string; detail: string }): string {
  switch (flag.flag) {
    case 'dominant': return `**dominated** (${flag.detail})`;
    case 'quiet': return `**quiet** (${flag.detail})`;
    case 'multi_pass': return `**${flag.detail}**`;
    default: return flag.detail;
  }
}
