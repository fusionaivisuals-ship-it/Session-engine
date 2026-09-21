import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const output = resolve('../audit/editorial');
mkdirSync(output, { recursive: true });
const prefix = process.argv[2] || 'before';
const sessions = mkdtempSync(resolve(tmpdir(), 'editorial-preview-'));
const server = spawn(process.execPath, ['dist/src/main.js'], { windowsHide: true, env: { ...process.env, PORT: '31985', SESSIONS_DIR: sessions, ANTHROPIC_API_KEY: '', OPENROUTER_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', d => log += d);
server.stderr.on('data', d => log += d);
let browser;
try {
  for (let i = 0; i < 100 && !log.includes('Session engine running'); i++) await new Promise(r => setTimeout(r, 100));
  if (!log.includes('Session engine running')) throw new Error(log);
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:31985');
  await page.locator('.loading').waitFor({ state: 'hidden' });
  await page.screenshot({ path: resolve(output, `${prefix}-home.png`), fullPage: true });
  const post = async (path, data) => (await fetch('http://127.0.0.1:31985/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json();
  const { roomCode } = await post('sessions', { methodId: 'pros-cons', anonymous: true });
  for (const displayName of ['Alice', 'Bob', 'Carol', 'Dan']) await post(`sessions/${roomCode}/join`, { displayName });
  await post(`sessions/${roomCode}/problem`, { text: 'Should we open the community garden for one extra evening each week?' });
  await post(`sessions/${roomCode}/start`, { facilitatorSeat: 'seat-1' });
  for (let i = 1; i <= 4; i++) await post(`sessions/${roomCode}/agree`, { seat: `seat-${i}` });
  await page.goto(`http://127.0.0.1:31985/join/${roomCode}?seat=seat-1`);
  await page.locator('#inputText').waitFor();
  await page.screenshot({ path: resolve(output, `${prefix}-session.png`), fullPage: true });
  console.log('Screenshots:', output);
} finally {
  await browser?.close();
  server.kill();
  if (server.exitCode === null) await once(server, 'exit');
}
