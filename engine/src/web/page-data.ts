import type { Method } from '../types.js';

export function publicMethod(method: Method): Method {
  const copy = structuredClone(method);
  for (const role of copy.roles ?? []) delete role.hiddenBrief;
  return copy;
}

export function inlinePageData(html: string, methods: Method[], scenarios: unknown[], sample?: unknown): string {
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  const script = `<script>window.__METHODS__=${json(methods.map(publicMethod))};window.__SCENARIOS__=${json(scenarios)};window.__SAMPLE__=${json(sample ?? null)};</script>`;
  return html.replace('</head>', `${script}\n</head>`);
}
