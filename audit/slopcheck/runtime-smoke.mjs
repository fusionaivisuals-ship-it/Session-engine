import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import WebSocket from '../../engine/node_modules/ws/wrapper.mjs';

const dir = fileURLToPath(new URL('.', import.meta.url));
const engine = resolve(dir, '../../engine');
const results = [];
async function inspect(mode, port) {
  const sessionsDir = resolve(dir, `runtime-${mode}`);
  mkdirSync(sessionsDir, { recursive: true });
  const args = mode === 'compiled' ? ['dist/src/main.js'] : ['--import', 'tsx', 'src/main.ts'];
  const child = spawn(process.execPath, args, {
    cwd: engine, windowsHide: true,
    env: { ...process.env, PORT: String(port), SESSIONS_DIR: sessionsDir, ANTHROPIC_API_KEY: '', OPENROUTER_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  const origin = `http://127.0.0.1:${port}`;
  let ws;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      if (output.includes('Session engine running')) { ready = true; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(ready, output);
    const health = await fetch(`${origin}/api/health`);
    const home = await fetch(origin);
    const methodsResponse = await fetch(`${origin}/api/methods`);
    const methods = await methodsResponse.json();
    results.push({ mode, health: health.status, home: home.status, methods: methodsResponse.status, methodError: methods.error ?? null });
    if (mode === 'compiled') {
      assert.equal(home.status, 404);
      assert.equal(methodsResponse.status, 500);
      return;
    }
    const post = async (path, data) => {
      const response = await fetch(origin + '/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    const { roomCode } = await post('/sessions', { methodId: 'six-hats', anonymous: true });
    const path = `/sessions/${roomCode}`;
    for (let i = 1; i <= 4; i++) await post(path + '/join', { displayName: `Audit person ${i}` });
    await post(path + '/start', { facilitatorSeat: 'seat-1' });
    for (let i = 1; i <= 4; i++) await post(path + '/agree', { seat: `seat-${i}` });
    ws = new WebSocket(`ws://127.0.0.1:${port}/?room=${roomCode}&seat=seat-2`);
    const states = [];
    ws.on('message', raw => { const msg = JSON.parse(raw.toString()); if (msg.type === 'state') states.push(msg.data); });
    await once(ws, 'open');
    await post(path + '/submit', { seat: 'seat-1', text: 'PRIVATE BEFORE EVERYONE COMMITS' });
    await new Promise(r => setTimeout(r, 100));
    const latest = states.at(-1);
    assert.equal(latest.block.type, 'private_input');
    assert.ok(JSON.stringify(latest).includes('PRIVATE BEFORE EVERYONE COMMITS'));
    const before = states.length;
    await new Promise(r => setTimeout(r, 2200));
    results.push({ mode, privateTextSentToOtherSeatBeforeReveal: true, block: latest.block.id, timerStateUpdatesOver2Seconds: states.length - before });
    await post(path + '/artifact', {});
    const download = await fetch(`${origin}/api${path}/report`);
    const errorBody = await download.text();
    assert.equal(download.status, 500);
    assert.ok(errorBody.includes('require is not defined'));
    results.push({ mode, reportDownload: download.status, error: 'ReferenceError: require is not defined' });
  } finally {
    ws?.terminate();
    child.kill();
    await once(child, 'exit');
  }
}
await inspect('compiled', 31981);
await inspect('source', 31982);
writeFileSync(resolve(dir, 'runtime-results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
