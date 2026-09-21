Last updated: 2026-09-20

Current catalog: the six methods in `thinking-methods-app-copyright-guidance.md` replace the retired branded methods. See the 2026-09-20 original-thinking-method-catalog decision and `design/CATALOG_MIGRATION.md` (paths relative to repository root). Historical build milestones below describe the earlier catalog.

# /design — how the engine and methods are meant to work

## What this workspace is for
Everything that decides behaviour before code exists: the block system, the method config format, the AI roles, the stuck ladder, the metrics. If a question is "what should happen when…", the answer is written here first, then implemented in /engine.

## Files
- `SPEC.md` — the full spec. Source of truth. Sections are numbered; reference them from prompts and decisions ("per SPEC §4.2").
- `schemas/method.schema.json` — JSON Schema for a method config (roles, blocks, rubrics, timings).
- `schemas/session-state.schema.json` — JSON Schema for the persisted session manifest (what gets written to disk and reloaded on resume).
- `methods/*.json` — one file per method. `pros-cons.json` is the reference implementation; every new method must validate against the schema and use only the seven block types.
- `frameworks.md` — reference list of thinking frameworks suitable (and unsuitable) for a single timed session. Used when designing new method configs.
- `decisions/` — dated one-page decision records. Write one whenever a spec section changes for a non-obvious reason.
- `exam-map.md` — which part of the build exercises which CCAR-F task statement. Update when a build prompt lands.

**Current status:** Solo/group sessions and local packaging are implemented through prompts 11b/12, with audit repairs described in `../audit/slopcheck/AFTER.md`. Synthesizer (06b) remains explicitly deferred. No remote deployment is claimed.

## Process
1. Change SPEC.md first, then the schema if the change needs a new field, then the method config, then a decision record if the reason is not obvious.
2. Validate any edited method config against the schema before committing (`npm run validate` once the engine exists; until then, eyeball it against the schema).
3. Keep timings realistic and show the configured budget in the app. The current focused workflows budget 26–36 minutes for 2–6 participants; facilitators can extend a block once when needed.

## What good looks like
- A facilitator who has never seen the code can read SPEC §3 and predict exactly what the screen does at each block.
- A new method can be added by writing one JSON file and zero code.
- Every rubric criterion is checkable from the submitted text alone (no "was the group engaged?").

## What to avoid
- Putting method-specific words (named stages or method-specific reasoning rules) anywhere except `methods/`.
- Rubrics that score enthusiasm or effort. Score presence, specificity and coverage.
- Adding an eighth block type. If something does not fit the seven, it is probably two blocks or a block option.
