import type { SessionState, Method, MethodBlock, MethodLens, DetourTrigger, DetourRecord, MethodFallback } from '../types.js';
import { loadMethod } from './methods.js';

export interface DetourProposal {
  trigger: DetourTrigger;
  detourMethodId: string;
  blocks: MethodBlock[];
  lenses: MethodLens[];
  addedMinutes: number;
  reason: string;
}

/**
 * Check if a detour trigger condition is met.
 * Returns the matching fallback or null.
 */
export function evaluateTrigger(
  session: SessionState,
  method: Method,
  trigger: DetourTrigger,
): MethodFallback | null {
  if (!method.fallbacks?.length) return null;
  if (method.roleMode === 'fixed') return null; // v1: rotating only

  // At most one detour per session
  if (session.detours?.some(d => d.accepted)) return null;

  const fb = method.fallbacks.find(f => f.trigger === trigger);
  if (!fb) return null;

  if (trigger === 'ideas_thin' && !shouldTriggerIdeasThin(session, method)) return null;
  if (trigger === 'converge_failed_twice' && !shouldTriggerConvergeFailedTwice(session, method)) return null;
  if (session.detours?.some(d => d.trigger === trigger && !d.accepted)) return null;

  return fb;
}

/**
 * Check if converge_failed_twice trigger should fire.
 * Returns true if the current converge block has 2+ failed reviewer verdicts.
 */
export function shouldTriggerConvergeFailedTwice(session: SessionState, method: Method): boolean {
  if (!session.currentBlockId) return false;
  const block = method.blocks.find(b => b.id === session.currentBlockId);
  if (!block || block.type !== 'converge') return false;
  const record = session.blocks[block.id];
  if (!record?.reviewerVerdicts) return false;
  const failCount = record.reviewerVerdicts.filter(v => !v.pass).length;
  return failCount >= 2;
}

/**
 * Check if ideas_thin trigger should fire.
 * Returns true if an ideaBlock had majority passes or very low word counts.
 */
export function shouldTriggerIdeasThin(session: SessionState, method: Method): boolean {
  const ideaBlocks = method.blocks.filter(b => b.ideaBlock);
  for (const block of ideaBlocks) {
    const record = session.blocks[block.id];
    if (!record?.submissions?.length) continue;
    // Already exited this block
    if (!record.exitedAt) continue;

    const active = session.participants.filter(p => p.presence !== 'absent').length;
    const passed = record.submissions.filter(s => s.passed).length;
    const submitted = record.submissions.filter(s => !s.passed && !s.autoSubmitted);
    const avgWords = submitted.length > 0
      ? submitted.reduce((sum, s) => sum + s.wordCount, 0) / submitted.length
      : 0;

    // Majority passed or average words below minWords
    if (passed > active / 2) return true;
    if (block.minWords && avgWords < block.minWords && submitted.length > 0) return true;
  }
  return false;
}

/**
 * Build a detour proposal from a fallback definition.
 * Deep-copies the detour method's blocks, prefixes ids with "detour-".
 */
export function buildProposal(
  fallback: MethodFallback,
  session: SessionState,
): DetourProposal | null {
  let detourMethod: Method;
  try {
    detourMethod = loadMethod(fallback.detourMethodId);
  } catch {
    return null;
  }

  const selectedBlocks = fallback.blockIds
    .map(id => detourMethod.blocks.find(b => b.id === id))
    .filter((b): b is MethodBlock => b != null);

  if (selectedBlocks.length === 0) return null;

  // Deep copy and prefix ids
  const prefixedBlocks: MethodBlock[] = selectedBlocks.map(b => {
    const copy: MethodBlock = JSON.parse(JSON.stringify(b));
    copy.id = `detour-${copy.id}`;
    if (copy.sourceBlockId) {
      copy.sourceBlockId = copy.sourceBlockId.split(',').map(s => `detour-${s.trim()}`).join(',');
    }
    if (copy.lensId) {
      copy.lensId = `detour-${copy.lensId}`;
    }
    return copy;
  });

  // Copy referenced lenses
  const lensIds = new Set(selectedBlocks.map(b => b.lensId).filter(Boolean));
  const copiedLenses: MethodLens[] = (detourMethod.lenses ?? [])
    .filter(l => lensIds.has(l.id))
    .map(l => ({ ...l, id: `detour-${l.id}` }));

  const addedSec = prefixedBlocks.reduce((sum, b) => sum + b.timeboxSec, 0);

  return {
    trigger: fallback.trigger,
    detourMethodId: fallback.detourMethodId,
    blocks: prefixedBlocks,
    lenses: copiedLenses,
    addedMinutes: Math.ceil(addedSec / 60),
    reason: fallback.reason,
  };
}

/**
 * Accept a detour proposal: insert blocks after the current block in the method.
 * Returns the modified method blocks array. Records the detour in the session.
 */
export function acceptDetour(
  session: SessionState,
  method: Method,
  proposal: DetourProposal,
): void {
  if (session.detours?.some(d => d.accepted)) throw new Error('Only one detour is allowed per session');
  if (session.status !== 'running') throw new Error('Session must be running');
  const currentIdx = method.blocks.findIndex(b => b.id === session.currentBlockId);
  if (currentIdx < 0) throw new Error('No current block');
  if (proposal.blocks.some(b => method.blocks.some(existing => existing.id === b.id))) throw new Error('Detour block already exists');
  // Add lenses to method
  method.lenses = method.lenses ?? [];
  for (const lens of proposal.lenses) {
    if (!method.lenses.find(l => l.id === lens.id)) {
      method.lenses.push(lens);
    }
  }

  // Insert blocks after current block
  method.blocks.splice(currentIdx + 1, 0, ...structuredClone(proposal.blocks));
  session.effectiveMethod = method;
  delete session.pendingDetour;

  // Record in manifest
  session.detours = session.detours ?? [];
  session.detours.push({
    trigger: proposal.trigger,
    detourMethodId: proposal.detourMethodId,
    insertedBlockIds: proposal.blocks.map(b => b.id),
    reason: proposal.reason,
    accepted: true,
    at: new Date().toISOString(),
  });
}

/**
 * Decline a detour proposal: just log it in the manifest.
 */
export function declineDetour(
  session: SessionState,
  proposal: DetourProposal,
): void {
  delete session.pendingDetour;
  session.detours = session.detours ?? [];
  session.detours.push({
    trigger: proposal.trigger,
    detourMethodId: proposal.detourMethodId,
    insertedBlockIds: [],
    reason: proposal.reason,
    accepted: false,
    at: new Date().toISOString(),
  });
}
