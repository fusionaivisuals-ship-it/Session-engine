import { resolve } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'fs';
import { setSessionsDir } from '../src/engine/manifest';
import { setMethodsDir } from '../src/engine/methods';
import { setScenariosDir, loadScenario } from '../src/engine/scenario';

const testSessionsDir = resolve(__dirname, '..', 'test-sessions-wt');
const methodsDir = resolve(__dirname, '..', '..', 'design', 'methods');
const scenariosDir = resolve(__dirname, '..', '..', 'design', 'scenarios');
const recordingsDir = resolve(__dirname, '..', '..', 'design', 'scenarios', 'recordings');

if (!existsSync(testSessionsDir)) mkdirSync(testSessionsDir, { recursive: true });
setSessionsDir(testSessionsDir);
setMethodsDir(methodsDir);
setScenariosDir(scenariosDir);

import { runScenario } from '../src/engine/simulate';
import { extractSteps } from '../src/engine/walkthrough-steps';
import { renderReport } from '../src/engine/report';
import * as store from '../src/engine/store';

function cleanDir(dir: string) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    try { unlinkSync(resolve(dir, f)); } catch { /* ignore */ }
  }
}

describe('walkthrough steps', () => {
  beforeEach(() => {
    cleanDir(testSessionsDir);
  });

  it('produces a narrated pros-and-cons session', async () => {
    const session = await runScenario('garden-evening-hours', { clockScale: 100 });
    const method = store.getMethodForSession(session);
    const scenario = loadScenario('garden-evening-hours');
    const report = renderReport(session, method);
    const wt = extractSteps(session, method, scenario, report);

    expect(wt.steps.length).toBeGreaterThanOrEqual(15);
    expect(wt.steps.length).toBeLessThanOrEqual(40);
    expect(wt.methodName).toBe('Pros-and-cons analysis');
    expect(wt.walkthroughIntro).toBeTruthy();
  }, 30000);

  it('produces a narrated Five Whys investigation', async () => {
    const session = await runScenario('feedback-queue-delay', { clockScale: 100 });
    const method = store.getMethodForSession(session);
    const scenario = loadScenario('feedback-queue-delay');
    const report = renderReport(session, method);
    const wt = extractSteps(session, method, scenario, report);

    expect(wt.steps.length).toBeGreaterThanOrEqual(10);
    expect(wt.steps.length).toBeLessThanOrEqual(40);
    expect(wt.methodName).toBe('Five Whys');
    expect(wt.walkthroughIntro).toBeTruthy();
  }, 30000);

  it('every step has narration', async () => {
    const session = await runScenario('garden-evening-hours', { clockScale: 100 });
    const method = store.getMethodForSession(session);
    const scenario = loadScenario('garden-evening-hours');
    const report = renderReport(session, method);
    const wt = extractSteps(session, method, scenario, report);

    for (const step of wt.steps) {
      expect(step.narration).toBeTruthy();
      expect(step.narration!.whatHappens).toBeTruthy();
      expect(step.narration!.whyItMatters).toBeTruthy();
    }
  }, 30000);

  it('all six recorded walkthroughs have valid step counts and narration', () => {
    const files = readdirSync(recordingsDir).filter(f => f.endsWith('.walkthrough.json'));
    expect(files.length).toBe(6);

    for (const file of files) {
      const wt = JSON.parse(readFileSync(resolve(recordingsDir, file), 'utf8'));
      expect(wt.steps.length).toBeGreaterThanOrEqual(10);
      expect(wt.steps.length).toBeLessThanOrEqual(40);
      for (const step of wt.steps) {
        expect(step.narration).toBeTruthy();
        expect(step.narration.whatHappens.length).toBeGreaterThan(0);
      }
    }
  });
});
