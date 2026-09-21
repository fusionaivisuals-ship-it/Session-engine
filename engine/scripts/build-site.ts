/**
 * Build the static site into dist/site/.
 * Copies HTML pages, method JSONs, scenario index, and walkthrough recordings.
 * Everything works from file:// with no server.
 */
import { resolve, join } from 'path';
import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { clearGeneratedAssets } from './clean-generated-assets.js';
import { inlinePageData } from '../src/web/page-data.js';
import { inlineViewAssets } from '../src/web/view-assets.js';
import type { Method } from '../src/types.js';

const root = resolve(import.meta.dirname, '..', '..');
const engineRoot = resolve(import.meta.dirname, '..');
const distSite = join(engineRoot, 'dist', 'site');
const viewsDir = join(engineRoot, 'src', 'web', 'views');
const methodsDir = join(root, 'design', 'methods');
const scenariosDir = join(root, 'design', 'scenarios');
const recordingsDir = join(scenariosDir, 'recordings');

// Remove stale published methods and walkthroughs when the catalog changes.
clearGeneratedAssets(distSite, resolve(engineRoot, 'dist'));

// Create output dirs
for (const dir of [distSite, join(distSite, 'methods'), join(distSite, 'scenarios'), join(distSite, 'recordings')]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// 1. Copy HTML pages
copyFileSync(join(viewsDir, 'site-index.html'), join(distSite, 'index.html'));
copyFileSync(join(viewsDir, 'method.html'), join(distSite, 'method.html'));
copyFileSync(join(viewsDir, 'walkthrough.html'), join(distSite, 'walkthrough.html'));
copyFileSync(join(viewsDir, 'replay.html'), join(distSite, 'replay.html'));
if (existsSync(join(viewsDir, 'start.html'))) {
  copyFileSync(join(viewsDir, 'start.html'), join(distSite, 'start.html'));
}
console.log('Copied HTML pages');

// 1b. Generate per-scenario walkthrough pages with inlined data
const walkthroughsDir = join(distSite, 'walkthroughs');
if (!existsSync(walkthroughsDir)) mkdirSync(walkthroughsDir, { recursive: true });
const walkthroughTemplate = inlineViewAssets(readFileSync(join(viewsDir, 'walkthrough.html'), 'utf8'), join(engineRoot, 'src/web/assets'));
if (existsSync(recordingsDir)) {
  const wtFiles = readdirSync(recordingsDir).filter(f => f.endsWith('.walkthrough.json'));
  for (const f of wtFiles) {
    const scenarioId = f.replace('.walkthrough.json', '');
    const jsonData = JSON.stringify(JSON.parse(readFileSync(join(recordingsDir, f), 'utf8'))).replace(/</g, '\\u003c');
    // Inject the data as a global variable before the main script
    const inlined = walkthroughTemplate.replace(
      '<script>',
      `<script>window.__WALKTHROUGH_DATA__ = ${jsonData};</script>\n  <script>`
    );
    writeFileSync(join(walkthroughsDir, `${scenarioId}.html`), inlined);
  }
  console.log(`Generated ${wtFiles.length} standalone walkthrough pages`);
}

// 2. Copy method JSONs
const methodFiles = readdirSync(methodsDir).filter(f => f.endsWith('.json'));
for (const f of methodFiles) {
  copyFileSync(join(methodsDir, f), join(distSite, 'methods', f));
}
console.log(`Copied ${methodFiles.length} method files`);

// 3. Build and write scenario index
const scenarioFiles = readdirSync(scenariosDir).filter(f => f.endsWith('.json'));
const scenarioIndex: Array<{
  id: string; title: string; tier: string; methodId: string;
  minutes: number; audience: string; whatItTeaches: string;
}> = [];

for (const f of scenarioFiles) {
  const s = JSON.parse(readFileSync(join(scenariosDir, f), 'utf8'));
  scenarioIndex.push({
    id: s.id,
    title: s.title,
    tier: s.tier,
    methodId: s.methodId,
    minutes: s.minutes,
    audience: s.audience,
    whatItTeaches: s.whatItTeaches,
  });
}

writeFileSync(join(distSite, 'scenarios', 'index.json'), JSON.stringify(scenarioIndex, null, 2));
console.log(`Built scenario index with ${scenarioIndex.length} entries`);

// 4. Copy recordings (replay + walkthrough)
if (existsSync(recordingsDir)) {
  const recFiles = readdirSync(recordingsDir).filter(f => f.endsWith('.json'));
  for (const f of recFiles) {
    copyFileSync(join(recordingsDir, f), join(distSite, 'recordings', f));
  }
  console.log(`Copied ${recFiles.length} recording files`);
}

console.log(`\nSite built to ${distSite}`);
const allMethods: Method[] = methodFiles.map(f => JSON.parse(readFileSync(join(methodsDir, f), 'utf8')));
const sampleMeta = scenarioIndex.find(s => s.tier === 'opener') ?? scenarioIndex[0];
const sample = sampleMeta ? JSON.parse(readFileSync(join(scenariosDir, sampleMeta.id + '.json'), 'utf8')) : null;
for (const name of ['index.html', 'method.html', 'start.html']) {
  const target = join(distSite, name);
  writeFileSync(target, inlinePageData(readFileSync(target, 'utf8'), allMethods, scenarioIndex, name === 'index.html' ? sample : undefined));
}
for (const name of ['index.html', 'method.html', 'start.html', 'walkthrough.html', 'replay.html']) {
  const target = join(distSite, name);
  writeFileSync(target, inlineViewAssets(readFileSync(target, 'utf8'), join(engineRoot, 'src/web/assets')));
}
console.log('Open dist/site/index.html in a browser to view.');
