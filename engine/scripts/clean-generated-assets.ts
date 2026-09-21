import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Clear generated files while retaining directories that a Windows preview may hold open. */
export function clearGeneratedAssets(directory: string, distRoot: string): void {
  const target = resolve(directory);
  if (dirname(target) !== resolve(distRoot)) throw new Error('Invalid generated asset directory');
  if (!existsSync(target)) return;
  function clearFiles(folder: string): void {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) clearFiles(path);
      else unlinkSync(path);
    }
  }
  clearFiles(target);
}
