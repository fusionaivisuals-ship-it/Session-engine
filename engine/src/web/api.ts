import { Router, type Request, type Response, type RequestHandler } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { isModelConfigured } from '../agents/client.js';
import * as store from '../engine/store.js';
import { generateArtifact } from './artifact.js';
import { listMethods } from '../engine/methods.js';
import { listScenarios, loadScenario } from '../engine/scenario.js';
import { getPublicOrigin } from '../engine/origin.js';
import { checkSessionCreationRate, checkActiveSessionCap, MAX_PROBLEM_CHARS, MAX_SUBMISSION_CHARS, MAX_SEATS } from '../engine/limits.js';

export const apiRouter = Router();

function route(action: (req: Request, res: Response) => unknown | Promise<unknown>, errorStatus = 400): RequestHandler {
  return async (req, res) => {
    try { await action(req, res); }
    catch (error) { res.status(errorStatus).json({ error: error instanceof Error ? error.message : 'Request failed' }); }
  };
}

function text(req: Request, field: string, max = 4000, allowEmpty = false): string {
  const value: unknown = req.body?.[field];
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new Error(`${field} must be ${allowEmpty ? 0 : 1}–${max} characters`);
  return value;
}


// Health check — used by frontend pages to detect whether the engine is running
apiRouter.get('/health', (req, res) => {
  res.json({ ok: true, engine: true, publicOrigin: getPublicOrigin(req), modelConfigured: isModelConfigured() });
});

// List available methods
apiRouter.get('/methods', route((_req, res) => {
    const methods = listMethods();
    res.json(methods.map(m => ({
      id: m.id, name: m.name, description: m.description,
      roleMode: m.roleMode, groupSize: m.groupSize,
      totalBudgetSec: m.timing.totalBudgetSec,
    })));
}, 500));

// List available scenarios (for facilitator preset picker)
apiRouter.get('/scenarios', route((_req, res) => {
    const scenarios = listScenarios();
    res.json(scenarios.map(s => ({
      id: s.id, title: s.title, tier: s.tier,
      methodId: s.methodId, minutes: s.minutes,
      audience: s.audience, whatItTeaches: s.whatItTeaches,
      anonymous: s.anonymous,
    })));
}, 500));

// Create a new session (optionally from a scenario preset)
apiRouter.post('/sessions', checkSessionCreationRate, route((req, res) => {
    // Check global active session cap
    const capErr = checkActiveSessionCap(store.getActiveSessionCount());
    if (capErr) return res.status(429).json({ error: capErr });

    const { methodId, anonymous, scenarioId, mode } = req.body;
    const sessionMode = mode === 'solo' ? 'solo' : 'group';

    // If scenarioId provided, use it as a preset (live humans, no simulation)
    if (scenarioId) {
      const scenario = loadScenario(scenarioId);
      const session = store.createNewSession(scenario.methodId, { anonymous: scenario.anonymous, mode: sessionMode });
      // Prefill problem statement from scenario
      store.updateProblemStatement(session.roomCode, scenario.problemStatement);
      res.json({ roomCode: session.roomCode, session, preset: { scenarioId: scenario.id, title: scenario.title } });
      return;
    }

    if (!methodId) return res.status(400).json({ error: 'methodId required' });
    const session = store.createNewSession(methodId, { anonymous: anonymous === true, mode: sessionMode });
    res.json({ roomCode: session.roomCode, session });
}, 400));

// Get session state (facilitator/admin — not anonymised; see prompt 07 trust boundary)
apiRouter.get('/sessions/:code', (req, res) => {
  const session = store.getSession(req.params.code);
  if (!session) return res.status(404).json({ error: 'Not found' });
  res.json(store.getSessionSummary(session));
});

// Join a session
apiRouter.post('/sessions/:code/join', route((req, res) => {
    const displayName = text(req, 'displayName', 80).trim();
    if (!displayName) return res.status(400).json({ error: 'displayName required' });
    const existing = store.getSession(req.params.code);
    if (existing && existing.participants.length >= MAX_SEATS && !existing.participants.some(p => p.displayName === displayName)) {
      return res.status(400).json({ error: `Session full (max ${MAX_SEATS} seats)` });
    }
    const { session, seat } = store.joinSession(req.params.code, displayName);
    res.json({ seat, session });
}, 400));

// Start session (facilitator)
apiRouter.post('/sessions/:code/start', route((req, res) => {
    const { facilitatorSeat } = req.body;
    if (!facilitatorSeat) return res.status(400).json({ error: 'facilitatorSeat required' });
    const session = store.startSessionAction(req.params.code, facilitatorSeat);
    res.json({ session });
}, 400));

// Submit input (private_input block)
apiRouter.post('/sessions/:code/submit', route((req, res) => {
    const { seat, text } = req.body;
    if (typeof text === 'string' && text.length > MAX_SUBMISSION_CHARS) {
      return res.status(400).json({ error: `Submission too long (max ${MAX_SUBMISSION_CHARS} characters)` });
    }
    store.submitInput(req.params.code, seat, text);
    res.json({ ok: true });
}, 400));

// Confirm (reveal block)
apiRouter.post('/sessions/:code/confirm', route((req, res) => {
    const { seat } = req.body;
    store.confirmRead(req.params.code, seat);
    res.json({ ok: true });
}, 400));

// Agree (frame block)
apiRouter.post('/sessions/:code/agree', route((req, res) => {
    const { seat } = req.body;
    store.agreeFrame(req.params.code, seat);
    res.json({ ok: true });
}, 400));

// Update problem statement (frame block, facilitator)
apiRouter.post('/sessions/:code/problem', route((req, res) => {
    const { text } = req.body;
    if (typeof text === 'string' && text.length > MAX_PROBLEM_CHARS) {
      return res.status(400).json({ error: `Problem statement too long (max ${MAX_PROBLEM_CHARS} characters)` });
    }
    store.updateProblemStatement(req.params.code, text);
    res.json({ ok: true });
}, 400));

// Submit decision (converge block)
apiRouter.post('/sessions/:code/decision', route((req, res) => {
    const { seat, decision } = req.body;
    store.submitDecision(req.params.code, seat, decision);
    res.json({ ok: true });
}, 400));

// Submit commitment (commit block)
apiRouter.post('/sessions/:code/commitment', route((req, res) => {
    const { seat, owner, firstAction, dueDate, successSignal } = req.body;
    store.submitCommitment(req.params.code, seat, { owner, firstAction, dueDate, successSignal });
    res.json({ ok: true });
}, 400));

// Facilitator override
apiRouter.post('/sessions/:code/override', route((req, res) => {
    const { reason } = req.body;
    store.facilitatorOverride(req.params.code, reason);
    res.json({ ok: true });
}, 400));

// Facilitator pause
apiRouter.post('/sessions/:code/pause', route((_req, res) => {
    store.facilitatorPause(_req.params.code);
    res.json({ ok: true });
}, 400));

// Facilitator resume
apiRouter.post('/sessions/:code/resume', route((_req, res) => {
    store.facilitatorResume(_req.params.code);
    res.json({ ok: true });
}, 400));

// Facilitator extend
apiRouter.post('/sessions/:code/extend', route((_req, res) => {
    store.facilitatorExtend(_req.params.code);
    res.json({ ok: true });
}, 400));

// I'm stuck — advance the ladder
apiRouter.post('/sessions/:code/stuck', route(async (req, res) => {
    const { seat } = req.body;
    const result = await store.handleStuck(req.params.code, seat, req.body.step);
    res.json({ ok: true, stuck: result });
}, 400));

// Pass with reason (stuck ladder step 3)
apiRouter.post('/sessions/:code/pass', route((req, res) => {
    const { seat, reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'reason required' });
    store.handlePass(req.params.code, seat, reason);
    res.json({ ok: true });
}, 400));

// Trigger reviewer on converge block
apiRouter.post('/sessions/:code/accept-decision', route((req, res) => {
  store.acceptDecision(req.params.code, req.body.seat, req.body.reason);
  res.json({ ok: true });
}, 400));

apiRouter.post('/sessions/:code/review', route(async (_req, res) => {
    const verdict = await store.handleReview(_req.params.code);
    res.json({ ok: true, verdict });
}, 400));

// Swap roles (stuck ladder step 3 in fixed mode)
apiRouter.post('/sessions/:code/swap', route((req, res) => {
    const { seatA, seatB } = req.body;
    store.handleSwap(req.params.code, seatA, seatB);
    res.json({ ok: true });
}, 400));

// Trigger clustering on reveal block entry
apiRouter.post('/sessions/:code/cluster', route(async (_req, res) => {
    await store.handleClustering(_req.params.code);
    res.json({ ok: true });
}, 400));

// Suggest rewrite (frame block, facilitator)
apiRouter.post('/sessions/:code/suggest-rewrite', route(async (req, res) => {
    const result = await store.handleSuggestRewrite(req.params.code);
    res.json({ ok: true, ...result });
}, 400));

// Assign roles — random strategy
apiRouter.post('/sessions/:code/assign-random', route((req, res) => {
    store.assignRandom(req.params.code);
    res.json({ ok: true });
}, 400));

// Assign roles — choose strategy (one seat picks a role)
apiRouter.post('/sessions/:code/assign-choose', route((req, res) => {
    const { seat, roleId } = req.body;
    store.assignChoose(req.params.code, seat, roleId);
    res.json({ ok: true });
}, 400));

// Assign roles — facilitator strategy (batch assignment)
apiRouter.post('/sessions/:code/assign-facilitator', route((req, res) => {
    const { assignments } = req.body;
    store.assignFacilitator(req.params.code, assignments);
    res.json({ ok: true });
}, 400));

// Keystroke heartbeat for idle detection
apiRouter.post('/sessions/:code/typing', route((req, res) => {
  const { seat } = req.body;
  store.recordKeystroke(req.params.code, seat, req.body.blockId, req.body.text);
  res.json({ ok: true });
}));

// Generate artifact
apiRouter.post('/sessions/:code/artifact', route((req, res) => {
    const { onePagerPath, reportPath } = generateArtifact(req.params.code);
    res.json({ ok: true, onePagerPath, reportPath });
}, 400));

// Check detour trigger
apiRouter.post('/sessions/:code/detour-check', route((req, res) => {
    const { trigger } = req.body;
    const proposal = store.checkDetourTrigger(req.params.code, trigger);
    res.json({ ok: true, proposal });
}, 400));

// Accept detour proposal
apiRouter.post('/sessions/:code/detour-accept', route((req, res) => {
    const { proposal } = req.body;
    store.acceptDetourAction(req.params.code, proposal);
    res.json({ ok: true });
}, 400));

// Decline detour proposal
apiRouter.post('/sessions/:code/detour-decline', route((req, res) => {
    const { proposal } = req.body;
    store.declineDetourAction(req.params.code, proposal);
    res.json({ ok: true });
}, 400));

// Download report file
apiRouter.get('/sessions/:code/report', (req, res) => {
  const session = store.getSession(req.params.code);
  if (!session) return res.status(404).json({ error: 'Not found' });
  const reportPath = req.query.kind === 'onepager' ? session.artifacts?.onePagerPath : session.artifacts?.reportPath;
  if (!reportPath) return res.status(404).json({ error: 'Report not generated yet' });
  if (!existsSync(reportPath)) return res.status(404).json({ error: 'Report file not found' });
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.code}.md"`);
  res.send(readFileSync(reportPath, 'utf-8'));
});

apiRouter.post('/sessions/:code/self-check', route((req, res) => {
  const checked: unknown = req.body.checked;
  if (!Array.isArray(checked) || !checked.every(c => typeof c === 'string')) throw new Error('checked must be criterion IDs');
  store.selfCheckDecision(req.params.code, text(req, 'seat', 40), checked);
  res.json({ ok: true });
}));
apiRouter.post('/sessions/:code/resolve-tie', route((req, res) => {
  store.resolveDecisionTie(req.params.code, text(req, 'seat', 40), text(req, 'decision'));
  res.json({ ok: true });
}));
apiRouter.post('/sessions/:code/reset-votes', route((req, res) => {
  store.resetDecisionVotes(req.params.code, text(req, 'seat', 40));
  res.json({ ok: true });
}));
