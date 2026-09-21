import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clearGeneratedAssets } from './clean-generated-assets.js';
import { inlineViewAssets } from '../src/web/view-assets.js';

const engine = resolve(import.meta.dirname, '..');
mkdirSync(resolve(engine, 'dist/src/web'), { recursive: true });
cpSync(resolve(engine, 'src/web/views'), resolve(engine, 'dist/src/web/views'), { recursive: true });
for (const file of readdirSync(resolve(engine, 'src/web/views')).filter(f => f.endsWith('.html'))) {
  writeFileSync(resolve(engine, 'dist/src/web/views', file), inlineViewAssets(readFileSync(resolve(engine, 'src/web/views', file), 'utf8'), resolve(engine, 'src/web/assets')));
}
const outputDesign = resolve(engine, 'dist/design');
clearGeneratedAssets(outputDesign, resolve(engine, 'dist'));
mkdirSync(outputDesign, { recursive: true });
for (const folder of ['methods', 'scenarios', 'schemas']) {
  cpSync(resolve(engine, '../design', folder), resolve(outputDesign, folder), { recursive: true });
}
cpSync(resolve(engine, '../sessions/_template-run-log.md'), resolve(engine, 'dist/_template-run-log.md'));
