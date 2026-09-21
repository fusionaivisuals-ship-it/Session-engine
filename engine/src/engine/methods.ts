import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import type { Method } from '../types.js';

let methodsDir = resolve(process.cwd(), '..', 'design', 'methods');

export function setMethodsDir(dir: string) {
  methodsDir = dir;
  cache.clear();
}

export function getMethodsDir(): string {
  return methodsDir;
}

const cache = new Map<string, Method>();

export function loadMethod(id: string): Method {
  if (cache.has(id)) return cache.get(id)!;
  const files = readdirSync(methodsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const m: Method = JSON.parse(readFileSync(join(methodsDir, file), 'utf-8'));
    cache.set(m.id, m);
  }
  const method = cache.get(id);
  if (!method) throw new Error(`Method "${id}" not found in ${methodsDir}`);
  return method;
}

export function listMethods(): Method[] {
  // The directory is the active catalog, not everything loaded in the past.
  cache.clear();
  const files = readdirSync(methodsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const m: Method = JSON.parse(readFileSync(join(methodsDir, file), 'utf-8'));
    cache.set(m.id, m);
  }
  return [...cache.values()];
}

export function loadMethodFromPath(filePath: string): Method {
  const m: Method = JSON.parse(readFileSync(filePath, 'utf-8'));
  cache.set(m.id, m);
  return m;
}
