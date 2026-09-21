import type { SessionState, Method, MethodBlock, BlockRecord, Submission, ReviewerVerdict, StuckEvent, ModelCallMetric } from '../types.js';

// --- Pure functions over the session manifest ---

export interface PerBlockMetric {
  blockId: string;
  title: string;
  type: string;
  elapsedSec: number | null;
  timeboxSec: number;
  exitReason: string;
  extensionsUsed: number;
  overrideReason: string | null;
}

export interface ParticipationFlag {
  seat: string;
  flag: 'dominant' | 'quiet' | 'multi_pass';
  detail: string;
}

export interface LensCoverageEntry {
  lensOrRoleId: string;
  coverage: 'substantive' | 'token' | 'pass' | 'missing';
}

export interface StuckSeatSummary {
  seat: string;
  steps: string[];
  swapsUsed: number;
}

export interface ReviewBlockSummary {
  blockId: string;
  verdicts: number;
  reruns: number;
  finalPass: boolean;
  finalExit: string;
}

export interface ModelUsageSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

/** Seconds from frame block enteredAt to commit block exitedAt. */
export function frameToCommitSec(session: SessionState, method: Method): number | null {
  const frameBlock = method.blocks.find(b => b.type === 'frame');
  const commitBlock = method.blocks.find(b => b.type === 'commit');
  if (!frameBlock || !commitBlock) return null;

  const frameRecord = session.blocks[frameBlock.id];
  const commitRecord = session.blocks[commitBlock.id];
  if (!frameRecord?.enteredAt || !commitRecord?.exitedAt) return null;

  const start = new Date(frameRecord.enteredAt).getTime();
  const end = new Date(commitRecord.exitedAt).getTime();
  return Math.round((end - start) / 1000);
}

/** Per-block: elapsed vs timebox, exit reason, extensions, overrides. */
export function perBlock(session: SessionState, method: Method): PerBlockMetric[] {
  return method.blocks.map(block => {
    const record = session.blocks[block.id];
    let elapsedSec: number | null = null;
    if (record?.enteredAt && record?.exitedAt) {
      elapsedSec = Math.round(
        (new Date(record.exitedAt).getTime() - new Date(record.enteredAt).getTime()) / 1000
      );
    }
    return {
      blockId: block.id,
      title: block.title,
      type: block.type,
      elapsedSec,
      timeboxSec: block.timeboxSec,
      exitReason: record?.exitReason ?? 'pending',
      extensionsUsed: session.clock.extensionsUsed[block.id] ?? 0,
      overrideReason: record?.overrideReason ?? null,
    };
  });
}

/** Word counts per seat across all private_input blocks. Passed and auto-submitted count as 0. */
export function wordsBySeat(session: SessionState, method: Method): Record<string, number> {
  const counts: Record<string, number> = {};
  // Initialize all present seats
  for (const p of session.participants) {
    counts[p.seat] = 0;
  }

  for (const block of method.blocks) {
    if (block.type !== 'private_input') continue;
    const record = session.blocks[block.id];
    if (!record?.submissions) continue;
    for (const sub of record.submissions) {
      if (sub.passed || sub.autoSubmitted) continue;
      counts[sub.seat] = (counts[sub.seat] ?? 0) + sub.wordCount;
    }
  }
  return counts;
}

/** Share of total words per seat (0-1). Excludes seats that were absent the entire session (never submitted anything). */
export function shareBySeat(session: SessionState, method: Method): Record<string, number> {
  const words = wordsBySeat(session, method);
  // Include all seats that participated (joined the session).
  // Only exclude seats currently absent if the session is still running;
  // for completed sessions, include everyone.
  const activeSeatIds = session.status === 'complete'
    ? session.participants.map(p => p.seat)
    : session.participants.filter(p => p.presence !== 'absent').map(p => p.seat);

  const total = activeSeatIds.reduce((sum, s) => sum + (words[s] ?? 0), 0);
  const shares: Record<string, number> = {};
  for (const seat of activeSeatIds) {
    shares[seat] = total > 0 ? (words[seat] ?? 0) / total : 0;
  }
  return shares;
}

/** Flags: seats above 40% share, below 10% share, or with 2+ passes. */
export function participationFlags(session: SessionState, method: Method): ParticipationFlag[] {
  const shares = shareBySeat(session, method);
  const flags: ParticipationFlag[] = [];

  for (const [seat, share] of Object.entries(shares)) {
    if (share > 0.4) {
      flags.push({ seat, flag: 'dominant', detail: `${(share * 100).toFixed(0)}% of words` });
    } else if (share < 0.1) {
      flags.push({ seat, flag: 'quiet', detail: `${(share * 100).toFixed(0)}% of words` });
    }
  }

  // Count passes per seat
  const passCounts: Record<string, number> = {};
  for (const block of method.blocks) {
    if (block.type !== 'private_input') continue;
    const record = session.blocks[block.id];
    if (!record?.submissions) continue;
    for (const sub of record.submissions) {
      if (sub.passed) {
        passCounts[sub.seat] = (passCounts[sub.seat] ?? 0) + 1;
      }
    }
  }
  for (const [seat, count] of Object.entries(passCounts)) {
    if (count >= 2) {
      flags.push({ seat, flag: 'multi_pass', detail: `passed ${count} blocks` });
    }
  }

  return flags;
}

/** Lens coverage per lens (rotating) or per role (fixed). */
export function lensCoverage(session: SessionState, method: Method): LensCoverageEntry[] {
  const entries: LensCoverageEntry[] = [];

  if (method.roleMode === 'rotating') {
    // Group by lensId across private_input blocks
    const lensIds = (method.lenses ?? []).map(l => l.id);
    for (const lensId of lensIds) {
      const inputBlocks = method.blocks.filter(
        b => b.type === 'private_input' && b.lensId === lensId
      );
      if (inputBlocks.length === 0) {
        entries.push({ lensOrRoleId: lensId, coverage: 'missing' });
        continue;
      }
      entries.push({ lensOrRoleId: lensId, coverage: coverageForBlocks(session, inputBlocks) });
    }
  } else {
    // Fixed mode: per role
    const roleIds = (method.roles ?? []).map(r => r.id);
    const inputBlocks = method.blocks.filter(b => b.type === 'private_input');
    for (const roleId of roleIds) {
      if (inputBlocks.length === 0) {
        entries.push({ lensOrRoleId: roleId, coverage: 'missing' });
        continue;
      }
      // For fixed mode, filter submissions by seats holding this role
      const seats = session.participants.filter(p => p.roleId === roleId).map(p => p.seat);
      if (seats.length === 0) {
        entries.push({ lensOrRoleId: roleId, coverage: 'missing' });
        continue;
      }
      entries.push({ lensOrRoleId: roleId, coverage: coverageForBlocksAndSeats(session, inputBlocks, seats) });
    }
  }

  return entries;
}

function coverageForBlocks(session: SessionState, blocks: MethodBlock[]): 'substantive' | 'token' | 'pass' | 'missing' {
  const wordCounts: number[] = [];
  let passCount = 0;
  let totalSubs = 0;
  let minWords = 15; // default

  for (const block of blocks) {
    if (block.minWords) minWords = block.minWords;
    const record = session.blocks[block.id];
    if (!record?.submissions) continue;
    for (const sub of record.submissions) {
      totalSubs++;
      if (sub.passed || sub.autoSubmitted) {
        passCount++;
        wordCounts.push(0);
      } else {
        wordCounts.push(sub.wordCount);
      }
    }
  }

  if (totalSubs === 0) return 'missing';
  if (passCount > totalSubs / 2) return 'pass';
  const sorted = [...wordCounts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return median >= minWords ? 'substantive' : 'token';
}

function coverageForBlocksAndSeats(
  session: SessionState,
  blocks: MethodBlock[],
  seats: string[]
): 'substantive' | 'token' | 'pass' | 'missing' {
  const wordCounts: number[] = [];
  let passCount = 0;
  let totalSubs = 0;
  let minWords = 15;

  for (const block of blocks) {
    if (block.minWords) minWords = block.minWords;
    const record = session.blocks[block.id];
    if (!record?.submissions) continue;
    for (const sub of record.submissions.filter(s => seats.includes(s.seat))) {
      totalSubs++;
      if (sub.passed || sub.autoSubmitted) {
        passCount++;
        wordCounts.push(0);
      } else {
        wordCounts.push(sub.wordCount);
      }
    }
  }

  if (totalSubs === 0) return 'missing';
  if (passCount > totalSubs / 2) return 'pass';
  const sorted = [...wordCounts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return median >= minWords ? 'substantive' : 'token';
}

/** Stuck ladder steps used per seat, swaps, facilitator flags. */
export function stuckSummary(session: SessionState, method: Method): StuckSeatSummary[] {
  const seatMap: Record<string, { steps: string[]; swapsUsed: number }> = {};

  for (const block of method.blocks) {
    const record = session.blocks[block.id];
    if (!record?.stuckEvents) continue;
    for (const ev of record.stuckEvents) {
      if (!seatMap[ev.seat]) seatMap[ev.seat] = { steps: [], swapsUsed: 0 };
      seatMap[ev.seat].steps.push(ev.step);
    }
  }

  // Add swap counts from participants
  for (const p of session.participants) {
    if (p.swapsUsed > 0) {
      if (!seatMap[p.seat]) seatMap[p.seat] = { steps: [], swapsUsed: 0 };
      seatMap[p.seat].swapsUsed = p.swapsUsed;
    }
  }

  return Object.entries(seatMap).map(([seat, data]) => ({
    seat,
    steps: data.steps,
    swapsUsed: data.swapsUsed,
  }));
}

/** Reviewer verdicts per converge block, reruns, final exit. */
export function reviewSummary(session: SessionState, method: Method): ReviewBlockSummary[] {
  const summaries: ReviewBlockSummary[] = [];

  for (const block of method.blocks) {
    if (block.type !== 'converge') continue;
    const record = session.blocks[block.id];
    if (!record) continue;

    const verdicts = record.reviewerVerdicts ?? [];
    summaries.push({
      blockId: block.id,
      verdicts: verdicts.length,
      reruns: Math.max(0, verdicts.length - 1),
      finalPass: verdicts.length > 0 ? verdicts[verdicts.length - 1].pass : false,
      finalExit: record.exitReason,
    });
  }

  return summaries;
}

/** Total model calls and tokens. */
export function modelUsage(session: SessionState): ModelUsageSummary {
  const calls = session.metrics.modelCalls ?? [];
  return {
    totalCalls: calls.length,
    totalInputTokens: calls.reduce((sum, c) => sum + c.inputTokens, 0),
    totalOutputTokens: calls.reduce((sum, c) => sum + c.outputTokens, 0),
  };
}
