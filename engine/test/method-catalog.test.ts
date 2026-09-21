import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { listMethods, loadMethod, setMethodsDir } from '../src/engine/methods';
import type { Method } from '../src/types';

const methodDir = resolve(__dirname, '../../design/methods');
const ids = ['brainstorming-prioritization', 'decision-matrix', 'fishbone-analysis', 'five-whys', 'hypothesis-testing', 'pros-cons'];
const retired = /six[ -](?:thinking[ -])?hats|six[ -](?:action[ -])?shoes|lateral[ -]provocation|de bono/i;

beforeEach(() => setMethodsDir(methodDir));

test('the published catalog contains exactly the six replacement methods', () => {
  expect(listMethods().map(m => m.id).sort()).toEqual(ids);
  const sequences = new Set<string>();
  for (const method of listMethods()) {
    expect(retired.test(JSON.stringify(method))).toBe(false);
    expect(method.roleMode).toBe('rotating');
    const inputs = method.blocks.filter(b => b.type === 'private_input');
    sequences.add(inputs.map(b => b.id).join(','));
    expect(method.blocks[0].type).toBe('frame');
    expect(method.blocks.at(-1)?.type).toBe('artifact');
    for (const fallback of method.fallbacks ?? []) {
      const detour = loadMethod(fallback.detourMethodId);
      for (const id of fallback.blockIds) expect(detour.blocks.some(b => b.id === id)).toBe(true);
    }
  }
  expect(sequences.size).toBe(6);
});

test('uncertainty safeguards and real matrix arithmetic are retained in the new content', () => {
  const whys = loadMethod('five-whys');
  expect(whys.blocks.filter(b => b.type === 'private_input')).toHaveLength(5);
  expect(JSON.stringify(whys)).toContain('instead of inventing a cause');
  expect(JSON.stringify(loadMethod('hypothesis-testing'))).toContain('Results not yet collected');
  const matrix = JSON.parse(readFileSync(resolve(methodDir, '../scenarios/volunteer-portal-feature.json'), 'utf8'));
  expect(matrix.canned.decision).toContain('(150+150+100)/100 = 4.0');
  expect(matrix.canned.decision).toContain('its total is 3.5');
});

test('scenarios and regenerated recordings contain no retired method content', () => {
  const scenarios = resolve(methodDir, '../scenarios');
  for (const dir of [scenarios, join(scenarios, 'recordings')]) {
    for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(retired.test(text)).toBe(false);
      expect(ids).toContain(JSON.parse(text).methodId);
    }
  }
});

test('catalog refresh drops deleted files and changing directories drops cached methods', () => {
  const temp = mkdtempSync(join(tmpdir(), 'catalog-refresh-'));
  const method: Method = structuredClone(loadMethod('pros-cons'));
  method.id = 'temporary-method';
  const path = join(temp, 'temporary-method.json');
  try {
    writeFileSync(path, JSON.stringify(method));
    setMethodsDir(temp);
    expect(() => loadMethod('pros-cons')).toThrow('not found');
    expect(listMethods().map(m => m.id)).toEqual(['temporary-method']);
    rmSync(path);
    expect(listMethods()).toEqual([]);
    expect(() => loadMethod('temporary-method')).toThrow('not found');
  } finally {
    rmSync(temp, { recursive: true, force: true });
    setMethodsDir(methodDir);
  }
});
