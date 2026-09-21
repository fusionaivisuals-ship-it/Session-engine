/**
 * Record a scenario headlessly and write replay + walkthrough JSON files.
 * Usage: npm run record <scenarioId>
 */
import { resolve, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { setSessionsDir } from '../src/engine/manifest.js';
import { setMethodsDir } from '../src/engine/methods.js';
import { setScenariosDir, loadScenario } from '../src/engine/scenario.js';
import { runScenario } from '../src/engine/simulate.js';
import { projectViewer } from '../src/engine/anonymize.js';
import { renderReport } from '../src/engine/report.js';
import { extractSteps } from '../src/engine/walkthrough-steps.js';
import * as store from '../src/engine/store.js';
import type { SessionState } from '../src/types.js';

const root = resolve(import.meta.dirname, '..', '..');
const tempSessionsDir = resolve(import.meta.dirname, '..', 'sessions-recording');
const methodsDir = join(root, 'design', 'methods');
const scenariosDir = join(root, 'design', 'scenarios');
const recordingsDir = join(root, 'design', 'scenarios', 'recordings');

if (!existsSync(tempSessionsDir)) mkdirSync(tempSessionsDir, { recursive: true });
if (!existsSync(recordingsDir)) mkdirSync(recordingsDir, { recursive: true });

setSessionsDir(tempSessionsDir);
setMethodsDir(methodsDir);
setScenariosDir(scenariosDir);

const scenarioId = process.argv[2];
if (!scenarioId) {
  console.error('Usage: npm run record <scenarioId>');
  process.exit(1);
}

async function main() {
  const scenario = loadScenario(scenarioId);
  console.log(`Recording: ${scenario.title} (${scenarioId})`);

  const snapshots: Array<{ tMs: number; view: string; state: unknown }> = [];
  const startTime = Date.now();

  const session = await runScenario(scenarioId, {
    clockScale: 100, // fast
    onStateChange: (s: SessionState) => {
      const method = store.getMethodForSession(s);
      const block = s.currentBlockId ? method.blocks.find(b => b.id === s.currentBlockId) : null;
      const lens = block?.lensId ? method.lenses?.find(l => l.id === block.lensId) : null;
      // Always anonymise for replay (no viewer seat = everyone sees Seat N)
      const anonSession = projectViewer({ ...s, anonymous: true }, method).session;
      snapshots.push({
        tMs: Date.now() - startTime,
        view: 'room',
        state: {
          session: anonSession,
          method: { name: method.name, timing: method.timing },
          block,
          lens,
        },
      });
    },
  });

  // Generate report
  const method = store.getMethodForSession(session);
  const reportMarkdown = renderReport({ ...session, anonymous: true }, method);

  const replay = {
    scenarioId,
    title: scenario.title,
    tier: scenario.tier,
    methodId: scenario.methodId,
    recordedAt: new Date().toISOString(),
    snapshots,
    report: reportMarkdown,
  };

  const outPath = join(recordingsDir, `${scenarioId}.replay.json`);
  writeFileSync(outPath, JSON.stringify(replay, null, 2));
  console.log(`Recorded ${snapshots.length} snapshots to ${outPath}`);

  // Emit stepped walkthrough JSON
  const walkthrough = extractSteps(
    session,
    method,
    { id: scenarioId, title: scenario.title, tier: scenario.tier, methodId: scenario.methodId },
    reportMarkdown,
  );
  const wtPath = join(recordingsDir, `${scenarioId}.walkthrough.json`);
  writeFileSync(wtPath, JSON.stringify(walkthrough, null, 2));
  console.log(`Walkthrough: ${walkthrough.steps.length} steps to ${wtPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
