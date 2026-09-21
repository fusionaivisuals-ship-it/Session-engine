// Supplemental coverage using the upstream collector and rule pack unchanged.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { Project } from '../../.audit-tools/slopcheck-deslop/node_modules/ts-morph/dist/ts-morph.js';
import { collectCallablesFrom, projectFiles } from '../../.audit-tools/slopcheck-deslop/src/collect.ts';
import { computeErosion } from '../../.audit-tools/slopcheck-deslop/src/metrics.ts';
import { runRules, computeVerbosity } from '../../.audit-tools/slopcheck-deslop/src/rules.ts';

const root = resolve(import.meta.dirname, '../../engine/src').replaceAll('\\', '/');
const files = projectFiles(root);
const texts = files.map(f => ({ path: relative(root, f.getFilePath()).replaceAll('\\', '/'), text: f.getFullText() }));
const flags = runRules(texts);
const outputDir = resolve(import.meta.dirname, process.argv[2] ?? '.');
mkdirSync(outputDir, { recursive: true });
const cloneReport = JSON.parse(readFileSync(resolve(outputDir, 'clones/jscpd-report.json'), 'utf8'));
const clones = new Map<string, Set<number>>();
for (const duplicate of cloneReport.duplicates) {
  for (const side of [duplicate.firstFile, duplicate.secondFile]) {
    // jscpd emits paths relative to its scanned root.
    const path = side.name.replaceAll('\\', '/');
    const lines = clones.get(path) ?? new Set<number>();
    for (let line = side.start; line <= side.end; line++) lines.add(line);
    clones.set(path, lines);
  }
}
const project = new Project({ useInMemoryFileSystem: true });
for (const name of readdirSync(`${root}/web/views`).filter(f => f.endsWith('.html'))) {
  const html = readFileSync(`${root}/web/views/${name}`, 'utf8');
  // Preserve original line positions; omit markup and JSON data scripts.
  const pieces: string[] = [];
  let previousEnd = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/application\/json|\bsrc\s*=|data-vendor/.test(match[1])) continue;
    const start = match.index! + match[0].indexOf('>') + 1;
    pieces.push(html.slice(previousEnd, start).replace(/[^\n]/g, ''), match[2]);
    previousEnd = start + match[2].length;
  }
  project.createSourceFile(`/web/views/${name}.ts`, pieces.join(''));
}
const inline = collectCallablesFrom(project.getSourceFiles(), '', 'named');
for (const callable of inline) callable.file = callable.file.replace(/\.ts$/, '');
const result = {
  typescriptFiles: files.length,
  ruleFlags: { ...flags, perFile: Object.fromEntries([...flags.perFile].map(([p, s]) => [p, [...s]])) },
  typescriptVerbosity: computeVerbosity(texts, flags, clones),
  inlineHtmlScripts: { files: project.getSourceFiles().length, definition: 'named', erosion: computeErosion(inline, 30) },
  note: 'Inline JS is parsed as TypeScript for supplemental measurement. Do not compare this separate scope to the default TS baseline. Clone paths normalized for Windows before TS-only union.',
};
writeFileSync(resolve(outputDir, 'supplemental.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
