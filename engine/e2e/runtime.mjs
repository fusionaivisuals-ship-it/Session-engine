import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import WebSocket from 'ws';

const engine = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sessions = mkdtempSync(join(tmpdir(), 'session-browser-'));
const port = 31983;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['dist/src/main.js'], {
  cwd: engine, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(port), PUBLIC_ORIGIN: origin, SESSIONS_DIR: sessions, ANTHROPIC_API_KEY: '', OPENROUTER_API_KEY: '' },
});
let serverOutput = '';
server.stdout.on('data', value => { serverOutput += value; });
server.stderr.on('data', value => { serverOutput += value; });
let browser;
const sockets = [];
const screenshots = resolve(engine, '../audit/editorial');
mkdirSync(screenshots, { recursive: true });
async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow: ${page.url()}`);
}
async function capture(page, name, fullPage = true) {
  await noOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(screenshots, name + '.png'), fullPage });
}
try {
  for (let attempt = 0; attempt < 100 && !serverOutput.includes('Session engine running'); attempt++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(serverOutput.includes('Session engine running'), serverOutput);
  const methodsResponse = await fetch(origin + '/api/methods');
  assert.equal(methodsResponse.status, 200);
  const catalog = await methodsResponse.json();
  assert.equal(catalog.length, 6);
  for (const retiredId of ['six-hats', 'six-hats-problem-solving', 'six-shoes', 'lateral-provocation']) {
    assert.equal((await fetch(`${origin}/methods/${retiredId}.json`)).status, 404);
  }
  assert.equal((await fetch(`${origin}/walkthroughs/coffee-machine-died.html`)).status, 404);
  assert.equal((await fetch(`${origin}/recordings/coffee-machine-died.walkthrough.json`)).status, 404);
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
  await page.goto(origin);
  await expect(page.locator('.scenario-card')).toHaveCount(6);
  await expect(page.locator('#heroTitle')).toContainText('Different perspectives.');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 246, 242)');
  await capture(page, 'home-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Methods', exact: true })).toBeVisible();
  await capture(page, 'home-mobile', false);
  await page.setViewportSize({ width: 320, height: 740 });
  await noOverflow(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const method of catalog) {
    await page.goto(origin + '/method.html?m=' + method.id);
    await expect(page.getByRole('heading', { name: method.name, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Run this on your problem' })).toHaveAttribute('href', 'start.html?method=' + method.id);
  }
  await page.goto(origin + '/method.html?m=pros-cons');
  await expect(page.getByRole('link', { name: 'Run this on your problem' })).toBeVisible();
  await page.getByRole('link', { name: 'Run this on your problem' }).click();
  await expect(page.locator('[role="radio"]')).toHaveCount(6);
  await page.getByRole('radio', { name: 'Pros-and-cons analysis', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio', { name: 'Pros-and-cons analysis', exact: true })).toHaveAttribute('aria-checked', 'true');
  await capture(page, 'setup-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'setup-mobile');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('#problem').fill('Choose one small improvement to trial this week.');
  await expect(page.locator('#btnStart')).toBeEnabled();
  await page.locator('#btnStart').click();
  await page.waitForURL(/\/join\/[^?]+\?seat=seat-1/);
  await expect(page.locator('#joinForm')).toBeHidden();
  const roomCode = new URL(page.url()).pathname.split('/').at(-1);
  const state = async code => (await (await fetch(`${origin}/api/sessions/${code}`)).json());
  const post = async (code, action, body = {}) => {
    const response = await fetch(`${origin}/api/sessions/${code}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  };

  await page.getByRole('button', { name: 'I agree with this', exact: true }).click();
  let blocks = 0;
  let checkedClock = false;
  while (blocks++ < 30) {
    const summary = await state(roomCode);
    if (summary.session.status === 'complete') break;
    await page.waitForFunction(id => currentState?.block?.id === id, summary.block.id);
    switch (summary.block.type) {
      case 'private_input': {
        await expect(page.locator('#inputText')).toHaveValue('');
        if (blocks > 2) {
          await expect(page.locator('.earlier-rounds')).toContainText('A specific useful idea');
        }
        await page.locator('#inputText').fill('A specific useful idea with enough details to discuss and evaluate.');
        if (!checkedClock) {
          await expect(page.locator('#draftStatus')).toHaveText('All changes saved');
          await expect(page.locator('#wc')).toHaveText('11 words');
          await page.getByRole('button', { name: 'I’m stuck', exact: true }).click();
          await expect(page.getByRole('button', { name: 'Ask one question' })).toBeDisabled();
          await page.getByRole('button', { name: 'Show an example', exact: true }).click();
          await expect(page.locator('.stuck-msg.example')).toBeVisible();
          await page.getByRole('button', { name: 'Back to writing', exact: true }).click();
          await expect(page.locator('#inputText')).toBeFocused();
          await expect(page.locator('#inputText')).toHaveValue('A specific useful idea with enough details to discuss and evaluate.');
          const sidebar = await page.locator('.session-sidebar').boundingBox();
          const task = await page.locator('.task-panel').boundingBox();
          assert.ok(sidebar.x + sidebar.width <= task.x, 'The timer sidebar must be left of the task');
          await capture(page, 'session-desktop');
          await page.setViewportSize({ width: 390, height: 844 });
          const mobileSidebar = await page.locator('.session-sidebar').boundingBox();
          const mobileTask = await page.locator('.task-panel').boundingBox();
          assert.ok(mobileSidebar.y + mobileSidebar.height <= mobileTask.y, 'Mobile status belongs above the task');
          await capture(page, 'session-mobile');
          await page.setViewportSize({ width: 320, height: 740 });
          await noOverflow(page);
          await page.setViewportSize({ width: 1280, height: 800 });
          const before = await page.locator('.timer').textContent();
          await expect(page.locator('.timer')).not.toHaveText(before, { timeout: 4000 });
          await expect(page.locator('#inputText')).toHaveValue('A specific useful idea with enough details to discuss and evaluate.');
          checkedClock = true;
        }
        await page.getByRole('button', { name: 'Submit my thoughts' }).click();
        break;
      }
      case 'reveal':
        await expect(page.locator('#app')).toContainText('A specific useful idea');
        await page.getByRole('button', { name: "I've read this", exact: true }).click();
        break;
      case 'converge':
        await page.locator('#decisionText').fill('Run one small trial and measure the result.');
        await page.getByRole('button', { name: 'Vote for Decision', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Confirm self-check and continue' })).toBeEnabled();
        for (const checkbox of await page.locator('input[name="selfCheck"]').all()) await checkbox.check();
        await page.getByRole('button', { name: 'Confirm self-check and continue' }).click();
        break;
      case 'commit':
        await page.locator('#commitAction').fill('Run the trial');
        await page.locator('#commitDate').fill('2026-10-01');
        await page.locator('#commitSignal').fill('One measured result');
        await page.getByRole('button', { name: 'Submit Commitment' }).click();
        break;
      default: throw new Error(`Unexpected solo block ${summary.block.type}`);
    }
    await page.waitForFunction(id => currentState?.session?.currentBlockId !== id, summary.block.id);
  }
  await expect(page.getByRole('heading', { name: 'Session Complete' })).toBeVisible();
  await capture(page, 'decision-record-desktop');
  const download = await fetch(`${origin}/api/sessions/${roomCode}/report`);
  assert.equal(download.status, 200);
  assert.ok((await download.text()).includes('Run the trial'));
  console.log('PASS: compiled homepage, method/start, solo browser flow, fresh drafts, ticking clock, self-check, report download');

  // Group flow and actual WebSocket privacy before reveal.
  const create = await fetch(origin + '/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ methodId: 'pros-cons', anonymous: true }) });
  const group = (await create.json()).roomCode;
  for (let i = 1; i <= 4; i++) await post(group, 'join', { displayName: `Private Name ${i}` });
  await post(group, 'problem', { text: 'Test group privacy' });
  await post(group, 'start', { facilitatorSeat: 'seat-1' });
  const facilitator = await context.newPage();
  facilitator.on('pageerror', error => errors.push(error.message));
  await facilitator.goto(`${origin}/facilitate/${group}?seat=seat-1`);
  await expect(facilitator.locator('#joinForm')).toBeHidden();
  await expect(facilitator.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  // Scripted provider response tests comparison/application UI without a paid call.
  await facilitator.route('**/suggest-rewrite', route => route.fulfill({ json: { ok: true, original: 'Test group privacy', rewrite: 'How should we test group privacy?', changeNote: 'Expressed the same topic as a question; scope unchanged.' } }));
  await facilitator.getByRole('button', { name: 'Suggest Rewrite', exact: true }).click();
  await expect(facilitator.locator('.rewrite-comparison')).toContainText('Test group privacy');
  await expect(facilitator.locator('#problemText')).toHaveValue('Test group privacy');
  await facilitator.getByRole('button', { name: 'Use suggestion in editor' }).click();
  await expect(facilitator.locator('#problemText')).toHaveValue('How should we test group privacy?');
  assert.equal((await state(group)).session.facts.problemStatement, 'Test group privacy');
  await capture(facilitator, 'rewrite-comparison');
  await facilitator.getByRole('button', { name: 'Update Statement', exact: true }).click();
  await expect.poll(async () => (await state(group)).session.facts.problemStatement).toBe('How should we test group privacy?');
  await capture(facilitator, 'facilitator-desktop');
  const participant = await context.newPage();
  participant.on('pageerror', error => errors.push(error.message));
  await participant.goto(`${origin}/join/${group}?seat=seat-2`);
  const room = await context.newPage();
  room.on('pageerror', error => errors.push(error.message));
  await room.goto(`${origin}/room/${group}`);
  for (let i = 1; i <= 4; i++) await post(group, 'agree', { seat: `seat-${i}` });
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?room=${group}&seat=seat-2`);
  sockets.push(ws);
  const messages = [];
  ws.on('message', value => messages.push(JSON.parse(value.toString())));
  await once(ws, 'open');
  await post(group, 'submit', { seat: 'seat-1', text: 'PRIVATE ANSWER MARKER' });
  await expect.poll(() => messages.filter(m => m.type === 'state').length).toBeGreaterThan(0);
  assert.ok(!JSON.stringify(messages).includes('PRIVATE ANSWER MARKER'));
  assert.ok(!JSON.stringify(messages).includes('Private Name 1'));
  await participant.locator('#inputText').fill('Other participant draft');
  await expect(participant.locator('#draftStatus')).toHaveText('All changes saved');
  await expect.poll(async () => (await state(group)).session.blocks['arguments-input'].drafts?.['seat-2']).toBe('Other participant draft');
  await participant.reload();
  await expect(participant.locator('#inputText')).toHaveValue('Other participant draft');
  await participant.locator('#inputText').focus();
  await post(group, 'submit', { seat: 'seat-3', text: 'ANOTHER PRIVATE MARKER' });
  await expect(participant.locator('.participant-count')).toHaveText('2 of 4 submitted');
  await expect(participant.locator('#inputText')).toHaveValue('Other participant draft');
  await expect(participant.locator('#inputText')).toBeFocused();
  await expect(participant.locator('#app')).not.toContainText('PRIVATE ANSWER MARKER');
  await expect(participant.locator('#app')).not.toContainText('ANOTHER PRIVATE MARKER');
  await expect(room.locator('.participant-count')).toHaveText('2 of 4 submitted');
  await expect(room.locator('#app')).not.toContainText('PRIVATE ANSWER MARKER');
  await expect(room.locator('#app')).not.toContainText('Private Name 1');
  await capture(room, 'room-desktop');
  await room.setViewportSize({ width: 390, height: 844 });
  await capture(room, 'room-mobile');
  await facilitator.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(participant.locator('.clock-state')).toHaveText('Paused');
  const paused = await participant.locator('.timer').textContent();
  await page.waitForTimeout(1200);
  await expect(participant.locator('.timer')).toHaveText(paused);
  await facilitator.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(participant.locator('.clock-state')).toHaveText('Time to think');
  await participant.getByRole('button', { name: 'Submit my thoughts' }).click();
  await post(group, 'submit', { seat: 'seat-4', text: 'The fourth answer for the reveal.' });
  await expect(participant.locator('.task-panel')).toContainText('PRIVATE ANSWER MARKER');
  await expect(participant.locator('.task-panel')).not.toContainText('Private Name 1');
  await capture(participant, 'reveal-desktop');
  await participant.setViewportSize({ width: 390, height: 844 });
  await capture(participant, 'reveal-mobile');
  await facilitator.setViewportSize({ width: 390, height: 844 });
  await capture(facilitator, 'facilitator-mobile');
  // Finish subsequent thinking rounds through the existing gates, then explicitly accept.
  for (let step = 0; step < 15; step++) {
    const snapshot = await state(group);
    if (snapshot.block.type === 'converge') break;
    for (let i = 1; i <= 4; i++) {
      await post(group, snapshot.block.type === 'reveal' ? 'confirm' : 'submit', { seat: `seat-${i}`, text: 'Consider the access risk and run a small reversible trial.' });
    }
  }
  for (let i = 1; i <= 4; i++) await post(group, 'decision', { seat: `seat-${i}`, decision: 'Run a small trial while monitoring access.' });
  await participant.waitForFunction(() => currentState?.block?.type === 'converge' && currentState.session.blocks.decide.decision);
  // Presentation-only review fixture; server acceptance is tested independently below.
  await participant.evaluate(() => {
    currentState.modelConfigured = true;
    document.querySelector('.workspace-header').insertAdjacentHTML('afterend', '<div class="demo-label">Scripted review preview — test fixture</div>');
    const record = currentState.session.blocks.decide;
    record.reviewerVerdicts = [{ pass: false, confidence: .8, ignoredLenses: [], oneLineFeedback: 'Clarify what remains unknown before choosing to proceed.', at: new Date().toISOString(), decisionRound: 0,
      scores: currentState.block.rubric.criteria.map((c, i) => ({ criterion: c.id, score: i === 0 ? 0 : 1, concern: ['missing_evidence', 'weak_reasoning', 'contradiction'][i], explanation: ['The notes do not address who loses access.', 'A small trial alone does not establish the expected benefit.', 'Check whether the proposed access restriction conflicts with the shared concern.'][i], evidence: i === 0 ? '' : 'Run a small trial while monitoring access.' })) }];
    render();
  });
  await expect(participant.getByRole('heading', { name: 'Needs attention', exact: true })).toBeVisible();
  await expect(participant.locator('.review-criterion')).toHaveCount(3);
  await expect(participant.locator('.verdict-panel')).toContainText('Missing evidence');
  await capture(participant, 'advisory-review-mobile');
  await participant.setViewportSize({ width: 1280, height: 800 });
  await capture(participant, 'advisory-review-desktop');
  await participant.reload();
  await expect(facilitator.locator('#proceedReason')).toBeVisible();
  await facilitator.locator('#proceedReason').fill('We accept the remaining uncertainty and will stop if access falls.');
  await capture(facilitator, 'advisory-acceptance-mobile');
  await facilitator.getByRole('button', { name: 'Proceed with a recorded reason' }).click();
  await expect.poll(async () => (await state(group)).block.type).toBe('commit');
  const accepted = (await state(group)).session.blocks.decide.decisionAcceptance;
  assert.ok(accepted.reason.includes('stop if access falls'));
  console.log('PASS: facilitator handoff, group privacy on WebSocket, persisted own draft after reload');

  await page.goto(origin + '/start.html?method=pros-cons');
  await page.getByRole('button', { name: 'With a group' }).click();
  await page.locator('#problem').fill('Choose a day for our next meeting.');
  await page.locator('#btnStart').click();
  await expect(page.getByRole('heading', { name: 'Waiting for participants' })).toBeVisible();
  await expect(page.locator('#lobbyQr svg')).toBeVisible();
  await capture(page, 'lobby-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'lobby-mobile');

  // Static output must render with file:// and no network data fetches.
  const staticPage = await context.newPage();
  staticPage.on('pageerror', error => errors.push(error.message));
  await staticPage.goto(pathToFileURL(resolve(engine, 'dist/site/index.html')).href);
  await expect(staticPage.locator('.scenario-card')).toHaveCount(6);
  for (const method of catalog) {
    await staticPage.goto(pathToFileURL(resolve(engine, 'dist/site/method.html')).href + '?m=' + method.id);
    await expect(staticPage.getByRole('heading', { name: method.name, exact: true })).toBeVisible();
  }
  await staticPage.goto(pathToFileURL(resolve(engine, 'dist/site/method.html')).href + '?m=pros-cons');
  await expect(staticPage.locator('#content')).toContainText('Pros-and-cons analysis');
  await capture(staticPage, 'method-desktop');
  await staticPage.setViewportSize({ width: 390, height: 844 });
  await capture(staticPage, 'method-mobile');
  await staticPage.setViewportSize({ width: 1280, height: 800 });
  await staticPage.goto(pathToFileURL(resolve(engine, 'dist/site/walkthroughs/garden-evening-hours.html')).href);
  await expect(staticPage.locator('body')).toContainText('An extra evening at the garden');
  await expect(staticPage.locator('.demo-label')).toContainText('Scripted demonstration');
  await capture(staticPage, 'demo-desktop');
  await staticPage.setViewportSize({ width: 390, height: 844 });
  await staticPage.locator('#btnNext').click();
  await capture(staticPage, 'demo-mobile');
  // Local recording import, scrub, playback, and report remain usable.
  const replayFile = resolve(engine, '../design/scenarios/recordings/garden-evening-hours.replay.json');
  const recording = JSON.parse(readFileSync(replayFile, 'utf8'));
  await staticPage.goto(pathToFileURL(resolve(engine, 'dist/site/replay.html')).href);
  await staticPage.locator('#fileInput').setInputFiles(replayFile);
  const privateIndex = recording.snapshots.findIndex(s => s.state.block?.type === 'private_input');
  await staticPage.locator('#scrubber').fill(String(privateIndex));
  await expect(staticPage.locator('.task-panel')).toContainText('Participants are thinking privately');
  await expect(staticPage.locator('.demo-label')).toContainText('Scripted demonstration');
  await capture(staticPage, 'replay-mobile');
  await staticPage.setViewportSize({ width: 1280, height: 800 });
  await capture(staticPage, 'replay-desktop');
  await staticPage.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(staticPage.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await staticPage.getByRole('button', { name: 'Pause', exact: true }).click();
  await staticPage.locator('#scrubber').fill(String(recording.snapshots.length - 1));
  await staticPage.getByRole('button', { name: 'Show Report' }).click();
  await expect(staticPage.locator('.report-view')).not.toBeEmpty();
  await staticPage.getByRole('button', { name: 'Back to Replay' }).click();
  assert.deepEqual(errors, []);
  console.log('PASS: standalone index, method and walkthrough pages; zero page errors');
} finally {
  for (const ws of sockets) ws.terminate();
  await browser?.close();
  server.kill();
  await once(server, 'exit');
  if (!sessions.startsWith(resolve(tmpdir()) + '\\') && !sessions.startsWith(resolve(tmpdir()) + '/')) throw new Error('Unsafe cleanup');
  rmSync(sessions, { recursive: true, force: true });
}
