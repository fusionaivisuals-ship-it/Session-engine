// Audit probes against the compiled runtime. No model calls; isolated manifests.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from '../../engine/dist/src/engine/store.js';
import * as manifests from '../../engine/dist/src/engine/manifest.js';
import { setMethodsDir, loadMethod } from '../../engine/dist/src/engine/methods.js';
import { enterBlock } from '../../engine/dist/src/engine/session.js';
import { anonymizePayload } from '../../engine/dist/src/engine/anonymize.js';
import { generateArtifact } from '../../engine/dist/src/web/artifact.js';
import { verifyEvidence, buildReviewerInput } from '../../engine/dist/src/agents/reviewer.js';
import vm from 'node:vm';

const auditDir = fileURLToPath(new URL('.', import.meta.url));
const fixtureDir = resolve(auditDir, 'fixtures');
mkdirSync(fixtureDir, { recursive: true });
manifests.setSessionsDir(fixtureDir);
setMethodsDir(resolve(auditDir, '../../design/methods'));
const results = [];
function record(name, data) { results.push({ name, ...data }); }

const first = store.createNewSession('six-hats', { mode: 'solo', anonymous: true });
store.joinSession(first.roomCode, 'Audit Alice');
store.startSessionAction(first.roomCode, 'seat-1');
store.agreeFrame(first.roomCode, 'seat-1');
const inputId = first.currentBlockId;
store.submitInput(first.roomCode, 'seat-1', 'private audit answer');
const reveal = first.blocks[first.currentBlockId].reveal;
assert.equal(reveal.clusters.length, 0);
record('Solo reveal uses empty reveal submissions instead of source block', { sourceSubmissions: first.blocks[inputId].submissions.length, clusters: reveal.clusters.length });

const summary = store.getSessionSummary(first);
const viewerPayload = anonymizePayload(summary.session, summary.method, 'seat-2');
assert.equal(viewerPayload.blocks[inputId].submissions[0].text, 'private audit answer');
record('Viewer projection retains other seats submission text', { text: viewerPayload.blocks[inputId].submissions[0].text });

const second = store.createNewSession('six-hats');
const method = store.getMethodForSession(first);
const proposal = store.checkDetourTrigger(first.roomCode, 'facilitator');
assert.ok(proposal);
store.acceptDetourAction(first.roomCode, proposal);
assert.ok(store.getMethodForSession(second).blocks.some(b => b.id.startsWith('detour-')));
store.acceptDetourAction(first.roomCode, proposal);
assert.equal(first.detours.filter(d => d.accepted).length, 2);
const onDiskMethod = JSON.parse(readFileSync(resolve(auditDir, '../../design/methods/six-hats.json'), 'utf8'));
assert.ok(!onDiskMethod.blocks.some(b => b.id === proposal.blocks[0].id));
record('Detour mutates another room and accepts same proposal twice', { otherRoomHasDetour: true, acceptedDetours: first.detours.length, insertedBlockDefinitionsPersisted: false });

// Enter the final commit explicitly to isolate artifact completion behavior.
enterBlock(first, method.blocks.find(b => b.type === 'commit'));
store.submitCommitment(first.roomCode, 'seat-1', { owner: 'Audit Alice', firstAction: 'Act', dueDate: 'not-a-date', successSignal: 'Done' });
assert.equal(first.status, 'complete');
assert.equal(first.artifacts, undefined);
record('Completion skips artifact generation and accepts invalid due date', { status: first.status, artifacts: first.artifacts ?? null, dueDate: first.facts.commitment.dueDate });
const artifact = generateArtifact(first.roomCode);
const onePager = readFileSync(artifact.onePagerPath, 'utf8');
assert.ok(onePager.includes('Audit Alice'));
assert.equal(manifests.loadManifest(first.roomCode).artifacts, undefined);
record('Anonymous one-pager leaks commitment name; generated paths not saved', { nameLeaked: true, persistedArtifacts: false });

const reviewBlock = method.blocks.find(b => b.type === 'converge');
const reviewerInput = buildReviewerInput(first, method, reviewBlock);
const rubricQuote = reviewBlock.rubric.criteria[0].text;
const verification = verifyEvidence([{ criterion: reviewBlock.rubric.criteria[0].id, score: 2, evidence: rubricQuote }], reviewerInput);
assert.ok(verification.allValid);
record('Evidence check accepts rubric instructions as evidence', { allValid: verification.allValid, source: 'rubric criterion text' });

// Evaluate only the script setup; minimal DOM suffices to test seat handoff.
const joinHtml = readFileSync(resolve(auditDir, '../../engine/src/web/views/join.html'), 'utf8');
const joinScript = joinHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({ location: { pathname: '/join/AUDIT1', search: '?seat=seat-1' }, document: {} });
vm.runInContext(joinScript, context);
assert.equal(vm.runInContext('mySeat', context), null);
record('Solo redirect seat query is ignored by participant page', { seatAfterLoad: null });

writeFileSync(resolve(auditDir, 'reproduction-results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
