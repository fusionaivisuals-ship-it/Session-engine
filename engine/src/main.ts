import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { resolve } from 'path';
import { setSessionsDir } from './engine/manifest.js';
import { setMethodsDir } from './engine/methods.js';
import * as store from './engine/store.js';
import { apiRouter } from './web/api.js';
import { projectViewer } from './engine/anonymize.js';
import { setScenariosDir } from './engine/scenario.js';
import { startDemoScenario } from './engine/simulate.js';

import { cleanupOldSessions, getSessionsDir } from './engine/manifest.js';
import { listMethods, loadMethod } from './engine/methods.js';
import { listScenarios, loadScenario } from './engine/scenario.js';
import { inlinePageData, publicMethod } from './web/page-data.js';
import { inlineViewAssets } from './web/view-assets.js';
import { getPublicOrigin } from './engine/origin.js';
import { existsSync, accessSync, constants as fsConstants } from 'fs';
import { readFileSync } from 'fs';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const runtimeDir = resolve(import.meta.dirname, '..');
const engineDir = existsSync(resolve(runtimeDir, 'package.json')) ? runtimeDir : resolve(runtimeDir, '..');
const designDir = existsSync(resolve(runtimeDir, 'design')) ? resolve(runtimeDir, 'design') : resolve(engineDir, '..', 'design');
const sessionsDir = process.env.SESSIONS_DIR
  ? resolve(process.env.SESSIONS_DIR)
  : resolve(engineDir, 'sessions');
setSessionsDir(sessionsDir);
setMethodsDir(resolve(designDir, 'methods'));
setScenariosDir(resolve(designDir, 'scenarios'));

// Clean up old session files (>30 days) and recover active sessions
cleanupOldSessions(30);
store.recoverOnStartup();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// API routes
app.use('/api', apiRouter);

// Pre-flight check page
app.get('/check', (req, res) => {
  const sd = getSessionsDir();
  let writable = false;
  try { accessSync(sd, fsConstants.W_OK); writable = true; } catch { /* not writable */ }

  let version = '0.0.0';
  try {
    const pkg = JSON.parse(readFileSync(resolve(engineDir, 'package.json'), 'utf-8'));
    version = pkg.version || version;
  } catch { /* fallback */ }

  let methodCount = 0;
  try { methodCount = listMethods().length; } catch { /* none */ }

  const origin = getPublicOrigin(req);
  const active = store.getActiveSessionCount();
  const hasApiKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY);

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const row = (label: string, value: string, ok: boolean) =>
    `<tr><td>${esc(label)}</td><td>${esc(value)}</td><td style="color:${ok ? '#2e9e5b' : '#d64545'}">${ok ? 'OK' : 'WARN'}</td></tr>`;

  res.type('html').send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pre-flight Check</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px}
h1{margin-bottom:16px}table{width:100%;border-collapse:collapse}td{padding:8px 12px;border-bottom:1px solid #eee}
td:first-child{font-weight:600;width:40%}td:last-child{width:60px;text-align:center}</style></head>
<body><h1>Pre-flight Check</h1><table>
${row('Engine version', version, true)}
${row('PUBLIC_ORIGIN', origin, !!process.env.PUBLIC_ORIGIN)}
${row('SESSIONS_DIR', sd, writable)}
${row('Sessions dir writable', writable ? 'yes' : 'no', writable)}
${row('Active sessions', String(active), active < 50)}
${row('Methods loaded', String(methodCount), methodCount > 0)}
${row('AI key configured', hasApiKey ? 'yes' : 'no', hasApiKey)}
</table><p style="color:#888;margin-top:24px;font-size:0.85em">Generated at ${new Date().toISOString()}</p></body></html>`);
});

// Serve static assets (method JSONs, scenarios, recordings)
app.get('/methods/:file', (req, res) => {
  try { res.json(publicMethod(loadMethod(req.params.file.replace(/\.json$/, '')))); }
  catch { res.status(404).json({ error: 'Method not found' }); }
});
app.get('/scenarios/index.json', (_req, res) => res.json(listScenarios()));
app.use('/methods', express.static(resolve(designDir, 'methods')));
app.use('/scenarios', express.static(resolve(designDir, 'scenarios')));
app.use('/recordings', express.static(resolve(designDir, 'scenarios', 'recordings')));

// Serve static HTML views — unified frontend (site pages + engine views)
const viewsDir = resolve(import.meta.dirname, 'web', 'views');

function page(name: string): string {
  const scenarios = listScenarios();
  const sample = name === 'site-index.html' ? scenarios.find(s => s.tier === 'opener') ?? scenarios[0] : undefined;
  const html = inlineViewAssets(readFileSync(resolve(viewsDir, name), 'utf8'), resolve(import.meta.dirname, 'web/assets'));
  return inlinePageData(html, listMethods(), scenarios, sample ? loadScenario(sample.id) : undefined);
}

app.get('/', (_req, res) => {
  res.type('html').send(page('site-index.html'));
});
app.get('/index.html', (_req, res) => {
  res.type('html').send(page('site-index.html'));
});
app.get('/method.html', (_req, res) => {
  res.type('html').send(page('method.html'));
});
app.get('/walkthrough.html', (_req, res) => {
  res.type('html').send(page('walkthrough.html'));
});
app.get('/start.html', (_req, res) => {
  res.type('html').send(page('start.html'));
});
app.get('/walkthroughs/:id.html', (req, res) => {
  if (!listScenarios().some(s => s.id === req.params.id)) {
    res.status(404).send('Walkthrough not found');
    return;
  }
  res.type('html').send(page('walkthrough.html'));
});
app.get('/replay', (_req, res) => {
  res.type('html').send(page('replay.html'));
});
app.get('/room/:code', (_req, res) => {
  res.type('html').send(page('room.html'));
});
app.get('/join/:code', (_req, res) => {
  res.type('html').send(page('join.html'));
});
app.get('/facilitate/:code', (_req, res) => {
  res.type('html').send(page('facilitate.html'));
});

// Demo mode: creates a scripted session at 10x speed
app.get('/demo/:scenarioId', (req, res) => {
  try {
    const scenarioId = req.params.scenarioId;
    const session = startDemoScenario(scenarioId, { clockScale: 10 });
    res.redirect(`/room/${session.roomCode}?demo=1`);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

const server = createServer(app);

// WebSocket
const wss = new WebSocketServer({ server });
const roomClients = new Map<string, Set<{ ws: WebSocket; seat?: string }>>();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const roomCode = url.searchParams.get('room');
  const seat = url.searchParams.get('seat') ?? undefined;

  if (!roomCode) { ws.close(); return; }

  if (!roomClients.has(roomCode)) roomClients.set(roomCode, new Set());
  const client = { ws, seat };
  roomClients.get(roomCode)!.add(client);

  // Send server time for clock sync
  ws.send(JSON.stringify({ type: 'time', serverMs: Date.now() }));

  // Send initial state
  const session = store.getSession(roomCode);
  if (session) {
    const summary = store.getSessionSummary(session);
    const method = store.getMethodForSession(session);
    const projected = projectViewer(summary.session, method, seat);
    ws.send(JSON.stringify({ type: 'state', data: { ...summary, ...projected } }));
  }

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'heartbeat' && seat) {
        store.heartbeat(roomCode, seat);
      }
      if (msg.type === 'typing' && seat) {
        const saved = store.recordKeystroke(roomCode, seat, msg.blockId, msg.text);
        ws.send(JSON.stringify({ type: 'draft_saved', blockId: msg.blockId, revision: msg.revision, saved }));
      }
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', clientMs: msg.clientMs, serverMs: Date.now() }));
      }
    } catch { /* ignore */ }
  });

  ws.on('close', () => {
    roomClients.get(roomCode)?.delete(client);
  });
});

// Broadcast state changes
store.onChange((session) => {
  const clients = roomClients.get(session.roomCode);
  if (!clients) return;
  const summary = store.getSessionSummary(session);
  const method = store.getMethodForSession(session);
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      const projected = projectViewer(summary.session, method, client.seat);
      client.ws.send(JSON.stringify({ type: 'state', data: { ...summary, ...projected } }));
    }
  }
});

// Clock-only messages avoid replacing a participant's active form on each tick.
setInterval(() => {
  for (const [roomCode, clients] of roomClients) {
    const session = store.getSession(roomCode);
    if (!session || session.status === 'complete' || session.status === 'lobby') continue;
    const { clockStatus } = store.getSessionSummary(session);
    const message = JSON.stringify({ type: 'clock', blockId: session.currentBlockId, clockStatus });
    for (const client of clients) if (client.ws.readyState === WebSocket.OPEN) client.ws.send(message);
  }
}, 1000);

// Periodic checks
setInterval(() => store.checkTimeouts(), 1000);
setInterval(() => store.updatePresence(), 5000);
// Assistance is requested by participants; idle time does not consume help steps.

server.listen(PORT, () => {
  const origin = process.env.PUBLIC_ORIGIN || `http://localhost:${PORT}`;
  console.log(`Session engine running on ${origin}`);
});
