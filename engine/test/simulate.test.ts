import { resolve } from 'path';
import { setSessionsDir } from '../src/engine/manifest';
import { setMethodsDir } from '../src/engine/methods';
import { setScenariosDir } from '../src/engine/scenario';
import { existsSync, mkdirSync, readdirSync, unlinkSync, rmdirSync } from 'fs';

// Set up dirs before importing store (which triggers recovery)
const testSessionsDir = resolve(__dirname, '..', 'test-sessions-sim');
const methodsDir = resolve(__dirname, '..', '..', 'design', 'methods');
const scenariosDir = resolve(__dirname, '..', '..', 'design', 'scenarios');

if (!existsSync(testSessionsDir)) mkdirSync(testSessionsDir, { recursive: true });
setSessionsDir(testSessionsDir);
setMethodsDir(methodsDir);
setScenariosDir(scenariosDir);

import { runScenario } from '../src/engine/simulate';

function cleanDir(dir: string) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    const path = resolve(dir, f);
    try { unlinkSync(path); } catch { /* ignore dirs */ }
  }
}

describe('simulate', () => {
  beforeEach(() => {
    cleanDir(testSessionsDir);
  });

  afterAll(() => {
    cleanDir(testSessionsDir);
    try { rmdirSync(testSessionsDir); } catch { /* ok */ }
  });

  it.each([
    'garden-evening-hours', 'feedback-queue-delay', 'incomplete-tool-kits',
    'volunteer-portal-feature', 'museum-quiet-evening', 'course-signup-headline',
  ])('runs %s through its actual gates to a report', async (scenarioId) => {
    const session = await runScenario(scenarioId, { clockScale: 100 });

    expect(session.status).toBe('complete');
    expect(session.participants).toHaveLength(2);
    expect(session.facts.problemStatement).toBeTruthy();
    expect(session.facts.decision).toBeTruthy();
    expect(session.facts.commitment).toBeTruthy();
    expect(session.facts.commitment?.firstAction).toBeTruthy();
    expect(existsSync(session.artifacts!.reportPath!)).toBe(true);
  }, 30000);

  it('produces a manifest file', async () => {
    const session = await runScenario('garden-evening-hours', { clockScale: 100 });
    const manifestPath = resolve(testSessionsDir, `${session.roomCode}.json`);
    expect(existsSync(manifestPath)).toBe(true);
  }, 30000);
});
