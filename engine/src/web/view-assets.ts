import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Inline local assets so built pages also work directly from file://. */
export function inlineViewAssets(html: string, assetDir: string): string {
  return html
    .replace(/<link[^>]+data-inline="editorial.css"[^>]*>/g, () => `<style>${readFileSync(join(assetDir, 'editorial.css'), 'utf8')}</style>`)
    .replace(/<script[^>]+data-inline="workspace.js"[^>]*><\/script>/g, () => `<script>${readFileSync(join(assetDir, 'workspace.js'), 'utf8')}</script>`);
}
