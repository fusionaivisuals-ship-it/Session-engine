import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import vm from 'node:vm';
import jsQR from 'jsqr';
import * as store from '../src/engine/store.js';
import { setSessionsDir, loadManifest } from '../src/engine/manifest.js';
import { setMethodsDir } from '../src/engine/methods.js';
import { projectViewer } from '../src/engine/anonymize.js';
import { buildEvidenceCorpus, buildReviewerInput, verifyEvidence } from '../src/agents/reviewer.js';
import { grantExtension, getClockStatus } from '../src/clock/clock.js';
import type { Method, SessionState } from '../src/types.js';
import { setClient } from '../src/agents/client.js';
import { preserveClusterSources } from '../src/agents/cluster.js';

const sandbox = mkdtempSync(join(tmpdir(), 'session-audit-'));
const method: Method = {
  id: 'audit', name: 'Audit', version: '1', roleMode: 'rotating', groupSize: { min: 2, max: 6 },
  timing: { totalBudgetSec: 600, extensionSec: 90, idleSec: 90, presenceTimeoutSec: 120 },
  lenses: [{ id: 'focus', name: 'Focus', instruction: 'Think' }],
  blocks: [
    { id: 'frame', title: 'Frame', type: 'frame', timeboxSec: 60, completion: 'all_agreed' },
    { id: 'input', title: 'Input', type: 'private_input', timeboxSec: 60, completion: 'all_submitted', ideaBlock: true, minWords: 5 },
    { id: 'reveal', title: 'Reveal', type: 'reveal', sourceBlockId: 'input', timeboxSec: 60, completion: 'all_confirmed' },
    { id: 'decide', title: 'Decide', type: 'converge', sourceBlockId: 'reveal', timeboxSec: 60, completion: 'reviewer_pass', rubric: { passThreshold: 1, criteria: [{ id: 'specific', text: 'A specific action' }], examples: [{ decision: 'Illustration only', verdict: 'pass', why: 'An instruction' }] } },
    { id: 'commit', title: 'Commit', type: 'commit', timeboxSec: 60, completion: 'valid_form' },
    { id: 'artifact', title: 'Artifact', type: 'artifact', timeboxSec: 0, completion: 'auto' },
  ],
  fallbacks: ['facilitator', 'ideas_thin', 'converge_failed_twice'].map(trigger => ({ trigger: trigger as 'facilitator', detourMethodId: 'detour', blockIds: ['input', 'reveal'], reason: 'Try another approach' })),
};
const originalKeys = [process.env.ANTHROPIC_API_KEY, process.env.OPENROUTER_API_KEY];
beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  mkdirSync(join(sandbox, 'methods'));
  writeFileSync(join(sandbox, 'methods/audit.json'), JSON.stringify(method));
  writeFileSync(join(sandbox, 'methods/detour.json'), JSON.stringify({ ...method, id: 'detour', blocks: method.blocks.slice(1, 3) }));
  setMethodsDir(join(sandbox, 'methods'));
  setSessionsDir(join(sandbox, 'sessions'));
});
afterAll(() => {
  for (const [i, name] of ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY'].entries()) {
    if (originalKeys[i] === undefined) delete process.env[name]; else process.env[name] = originalKeys[i];
  }
  if (!sandbox.startsWith(resolve(tmpdir()) + '\\') && !sandbox.startsWith(resolve(tmpdir()) + '/')) throw new Error('Unsafe cleanup');
  rmSync(sandbox, { recursive: true, force: true });
});

function room(solo = false, anonymous = false): SessionState {
  const session = store.createNewSession('audit', { mode: solo ? 'solo' : 'group', anonymous });
  store.joinSession(session.roomCode, 'Alice Private');
  if (!solo) store.joinSession(session.roomCode, 'Bob Private');
  store.startSessionAction(session.roomCode, 'seat-1');
  return session;
}
function enter(session: SessionState, id: string) {
  while (session.currentBlockId !== id) {
    if (session.currentBlockId === 'decide') {
      for (const p of session.participants) store.submitDecision(session.roomCode, p.seat, 'Test setup decision');
    }
    store.facilitatorOverride(session.roomCode, 'Test setup');
  }
}
const commitment = { owner: 'seat-1', firstAction: 'Run the trial', dueDate: '2026-10-01', successSignal: 'One result' };

test('withholds private text and drafts from another participant but retains receipts', () => {
  const s = room(false, true); enter(s, 'input');
  store.recordKeystroke(s.roomCode, 'seat-1', 'input', 'Unsubmitted secret');
  let payload = projectViewer(s, store.getMethodForSession(s), 'seat-2');
  expect(JSON.stringify(payload)).not.toContain('Unsubmitted secret');
  store.submitInput(s.roomCode, 'seat-1', 'Submitted secret');
  payload = projectViewer(s, store.getMethodForSession(s), 'seat-2');
  expect(payload.session.blocks.input.submissions).toHaveLength(1);
  expect(JSON.stringify(payload)).not.toContain('Submitted secret');
  expect(JSON.stringify(projectViewer(s, store.getMethodForSession(s), 'seat-1'))).toContain('Submitted secret');
  store.submitInput(s.roomCode, 'seat-2', 'A sufficiently detailed answer with many words');
  expect(JSON.stringify(projectViewer(s, store.getMethodForSession(s), 'seat-2'))).toContain('Submitted secret');
});

test('withholds other role secrets, including the persisted method snapshot', () => {
  const s = room(); const m = store.getMethodForSession(s);
  m.roles = [{ id: 'a', name: 'A', brief: 'Public A', hiddenBrief: 'Secret A' }, { id: 'b', name: 'B', brief: 'Public B', hiddenBrief: 'Secret B' }];
  s.participants[0].roleId = 'a';
  const payload = JSON.stringify(projectViewer(s, m, 'seat-1'));
  expect(payload).toContain('Secret A'); expect(payload).not.toContain('Secret B');
});

test('solo reveal uses the source answers without model calls', () => {
  const s = room(true); enter(s, 'input');
  store.submitInput(s.roomCode, 'seat-1', 'My real answer');
  expect(s.blocks.reveal.reveal?.clusters?.[0].summary).toBe('My real answer');
  expect(s.metrics.modelCalls).toBeUndefined();
});

test('detour remains in its own room, rejects duplicate acceptance, and recovers mid-detour', () => {
  const a = room(); const b = room();
  const proposal = store.checkDetourTrigger(a.roomCode, 'facilitator')!;
  store.acceptDetourAction(a.roomCode, proposal);
  expect(store.getMethodForSession(b).blocks.some(b => b.id.startsWith('detour-'))).toBe(false);
  expect(() => store.acceptDetourAction(a.roomCode, proposal)).toThrow();
  store.facilitatorOverride(a.roomCode, 'Enter detour');
  store.recoverOnStartup();
  const recovered = store.getSession(a.roomCode)!;
  expect(recovered.status).toBe('paused');
  expect(recovered.currentBlockId).toBe('detour-input');
  expect(store.getMethodForSession(recovered).blocks.find(b => b.id === recovered.currentBlockId)).toBeDefined();
});

test('automatic detour checks require the actual condition and surface proposals', () => {
  const s = room();
  expect(store.checkDetourTrigger(s.roomCode, 'ideas_thin')).toBeNull();
  enter(s, 'input');
  store.submitInput(s.roomCode, 'seat-1', 'one');
  store.submitInput(s.roomCode, 'seat-2', 'two');
  expect(s.pendingDetour?.trigger).toBe('ideas_thin');
  store.declineDetourAction(s.roomCode, s.pendingDetour!);
  expect(store.checkDetourTrigger(s.roomCode, 'ideas_thin')).toBeNull();
});

test('anonymous completion generates both reports, persists paths, and masks structured owner data', () => {
  const s = room(true, true); enter(s, 'commit');
  store.submitCommitment(s.roomCode, 'seat-1', { ...commitment, owner: 'Alice Private' });
  expect(s.status).toBe('complete');
  for (const path of [s.artifacts!.reportPath!, s.artifacts!.onePagerPath!]) {
    const report = readFileSync(path, 'utf8');
    expect(report).not.toContain('Alice Private');
    expect(report).toContain('Seat 1');
  }
  expect(loadManifest(s.roomCode)!.artifacts).toEqual(s.artifacts);
  expect(JSON.stringify(projectViewer(s, store.getMethodForSession(s), 'seat-2'))).not.toContain('Alice Private');
  store.recoverOnStartup();
  expect(store.getSession(s.roomCode)!.status).toBe('complete');
});

test.each([
  { dueDate: 'not-a-date' }, { dueDate: '2026-02-30' }, { owner: 'stranger' }, { firstAction: '   ' },
])('rejects invalid commitment %j without advancing', invalid => {
  const s = room(true); enter(s, 'commit');
  expect(() => store.submitCommitment(s.roomCode, 'seat-1', { ...commitment, ...invalid })).toThrow();
  expect(s.currentBlockId).toBe('commit');
});

test('one vote per seat, majority resolution, new rounds, and facilitator tie resolution', () => {
  const s = room(); enter(s, 'decide');
  store.submitDecision(s.roomCode, 'seat-1', 'Option A');
  expect(s.facts.decision).toBeNull();
  expect(() => store.submitDecision(s.roomCode, 'seat-1', 'Option B')).toThrow('Already voted');
  store.submitDecision(s.roomCode, 'seat-2', 'Option B');
  expect(s.facts.decision).toBeNull();
  expect(() => store.resolveDecisionTie(s.roomCode, 'seat-2', 'Option B')).toThrow();
  store.resolveDecisionTie(s.roomCode, 'seat-1', 'Option A');
  expect(s.facts.decision).toBe('Option A');
  store.resetDecisionVotes(s.roomCode, 'seat-1');
  store.submitDecision(s.roomCode, 'seat-1', 'Option C'); store.submitDecision(s.roomCode, 'seat-2', 'Option C');
  expect(s.facts.decision).toBe('Option C');
});

test('solo self-check requires every criterion and leads to a downloadable report', () => {
  const s = room(true); enter(s, 'decide');
  store.submitDecision(s.roomCode, 'seat-1', 'Run a trial');
  expect(() => store.selfCheckDecision(s.roomCode, 'seat-1', [])).toThrow();
  store.selfCheckDecision(s.roomCode, 'seat-1', ['specific']);
  expect(s.currentBlockId).toBe('commit');
  store.submitCommitment(s.roomCode, 'seat-1', commitment);
  expect(readFileSync(s.artifacts!.reportPath!, 'utf8')).toContain('self-check');
});

test('a favorable review stays visible until a person explicitly accepts it', async () => {
  const s = room(true); enter(s, 'decide');
  store.submitDecision(s.roomCode, 'seat-1', 'Run a trial');
  setClient({ messages: { create: async () => ({ content: [{ type: 'tool_use', name: 'submit_verdict', input: { pass: true, scores: [{ criterion: 'specific', score: 2, evidence: 'Run a trial', concern: 'none', explanation: 'A bounded action is named.' }], ignoredLenses: [], oneLineFeedback: 'Consider the uncertainty before acting.', confidence: .8 } }], usage: { input_tokens: 1, output_tokens: 1 } }) } } as any);
  try { await store.handleReview(s.roomCode); } finally { setClient(null); }
  expect(s.currentBlockId).toBe('decide');
  store.acceptDecision(s.roomCode, 'seat-1');
  expect(s.currentBlockId).toBe('commit');
  expect(loadManifest(s.roomCode)?.blocks.decide.decisionAcceptance?.decision).toBe('Run a trial');
});

test('group acceptance requires the facilitator, a resolved vote, and a reason without advice', () => {
  const s = room(); enter(s, 'decide');
  expect(() => store.acceptDecision(s.roomCode, 'seat-1', 'Proceed')).toThrow('Finish voting');
  for (const p of s.participants) store.submitDecision(s.roomCode, p.seat, 'Run a trial');
  expect(() => store.acceptDecision(s.roomCode, 'seat-2', 'Proceed')).toThrow('facilitator');
  expect(() => store.acceptDecision(s.roomCode, 'seat-1')).toThrow('Record why');
  store.acceptDecision(s.roomCode, 'seat-1', 'We accept the uncertainty and will stop if the trial causes delays.');
  expect(s.blocks.decide.decisionAcceptance?.reason).toContain('stop');
  expect(s.currentBlockId).toBe('commit');
});

test('advisory concerns require a reason even when the score threshold is met; expired time cannot accept', () => {
  const s = room(true); enter(s, 'decide');
  store.submitDecision(s.roomCode, 'seat-1', 'Run a trial');
  s.blocks.decide.reviewerVerdicts = [{ pass: true, scores: [{ criterion: 'specific', score: 1, evidence: 'Run a trial', concern: 'weak_reasoning', explanation: 'The expected effect is not explained.' }], ignoredLenses: [], oneLineFeedback: 'Needs attention', confidence: .8, at: new Date().toISOString() }];
  s.clock.blockStartedAt = new Date(Date.now() - 120000).toISOString();
  store.checkTimeouts();
  expect(s.currentBlockId).toBe('decide');
  expect(() => store.acceptDecision(s.roomCode, 'seat-1')).toThrow('Record why');
  store.acceptDecision(s.roomCode, 'seat-1', 'The small reversible trial will supply the missing observation.');
  expect(s.currentBlockId).toBe('commit');
});

test('old advice cannot authorize a new voting round and remains in history', () => {
  const s = room(true); enter(s, 'decide');
  store.submitDecision(s.roomCode, 'seat-1', 'Option A');
  s.blocks.decide.reviewerVerdicts = [{ pass: true, scores: [], ignoredLenses: [], oneLineFeedback: 'Old advice', confidence: .8, at: new Date().toISOString(), decision: 'Option A', decisionRound: 0 }];
  store.resetDecisionVotes(s.roomCode, 'seat-1');
  store.submitDecision(s.roomCode, 'seat-1', 'Option B');
  expect(() => store.acceptDecision(s.roomCode, 'seat-1')).toThrow('Record why');
  expect(s.blocks.decide.reviewerVerdicts).toHaveLength(1);
});

test('clustering retains omitted minority responses and removes invented seats', () => {
  const s = room(); enter(s, 'input');
  store.submitInput(s.roomCode, 'seat-1', 'Supports the trial');
  store.submitInput(s.roomCode, 'seat-2', 'Opposes the trial because access would be reduced');
  const result = preserveClusterSources({ clusters: [{ label: 'Trial', seats: ['seat-1', 'invented'], summary: 'One person supports a trial.' }], agreements: [], disagreements: ['Access concerns remain unresolved'] }, s.blocks.input.submissions!);
  expect(result.clusters.flatMap(c => c.seats)).toEqual(['seat-1', 'seat-2']);
  expect(result.clusters[1].summary).toContain('Opposes');
  expect(result.disagreements).toEqual(['Access concerns remain unresolved']);
});

test('timeout submits the latest server draft and rejects stale draft writes', () => {
  const s = room(true); enter(s, 'input');
  store.recordKeystroke(s.roomCode, 'seat-1', 'input', 'Draft survives');
  s.clock.blockStartedAt = new Date(Date.now() - 61_000).toISOString();
  store.checkTimeouts();
  expect(s.blocks.input.submissions![0]).toMatchObject({ text: 'Draft survives', autoSubmitted: true });
  store.recordKeystroke(s.roomCode, 'seat-1', 'input', 'Too late');
  expect(s.blocks.input.submissions![0].text).toBe('Draft survives');
});

test('reviewer evidence excludes rubric instructions and worked illustrations', () => {
  const s = room(true); enter(s, 'decide');
  s.facts.decision = 'Real decision';
  const block = store.getMethodForSession(s).blocks.find(b => b.id === 'decide')!;
  expect(buildReviewerInput(s, method, block)).toContain('Illustration only');
  const corpus = buildEvidenceCorpus(s, block);
  expect(verifyEvidence([{ criterion: 'specific', score: 2, evidence: 'Illustration only' }], corpus).allValid).toBe(false);
  expect(verifyEvidence([{ criterion: 'specific', score: 2, evidence: 'Real decision' }], corpus).allValid).toBe(true);
});

test('configured extension length survives pause and recovery', () => {
  const s = room(true); const block = store.getMethodForSession(s).blocks[0];
  grantExtension(s, block, 90);
  expect(getClockStatus(s, block).totalSec).toBe(150);
});

test('all inline browser scripts parse', () => {
  for (const file of readdirSync(resolve(__dirname, '../src/web/views'))) {
    const html = readFileSync(resolve(__dirname, '../src/web/views', file), 'utf8');
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], { filename: file });
  }
});

test.each(['http://localhost:3000/join/ABC123', 'https://' + 'a'.repeat(55) + '.example.com/join/ABC123', 'https://example.com/' + 'x'.repeat(200)])('QR encodes a decodable complete link: %s', url => {
  const html = readFileSync(resolve(__dirname, '../src/web/views/start.html'), 'utf8');
  const vendor = html.match(/<script data-vendor[^>]*>([\s\S]*?)<\/script>/)![1];
  const encode = html.match(/function encodeQr\(text\) \{[\s\S]*?\n      \}/)![0];
  const context = vm.createContext({ TextEncoder });
  vm.runInContext(vendor + '\n' + encode, context);
  const grid: number[][] = vm.runInContext(`encodeQr(${JSON.stringify(url)})`, context);
  const size = (grid.length + 8) * 4;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  grid.forEach((row, y) => row.forEach((value, x) => {
    if (!value) return;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const offset = (((y + 4) * 4 + dy) * size + (x + 4) * 4 + dx) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  }));
  expect(jsQR(pixels, size, size)?.data).toBe(url);
});
