Last updated: 2026-09-20

Current catalog: the six methods in `thinking-methods-app-copyright-guidance.md` replace the retired branded methods. See the 2026-09-20 original-thinking-method-catalog decision and `design/CATALOG_MIGRATION.md` (paths relative to repository root). Historical build milestones below describe the earlier catalog.

## Current verified status

Prompts 11b/12 are implemented locally. The 2026-09-20 audit repairs connect private viewer projections, session-specific persisted detours, automatic reports, solo self-check, voting, draft recovery and ticking clocks. Built assets and standalone pages are covered by `npm run test:e2e`. See `../audit/slopcheck/AFTER.md` for validation and limits. These changes are uncommitted; no deployment is claimed. Historical prompt Result sections describe their original implementation and are superseded by this repair record where they conflict.

# /engine — building the thing

## What this workspace is for
The running code: a Node service (state machine, clock, gates, agents) and a browser UI (participant view, facilitator view, room screen). Everything here implements `../design/SPEC.md`; if the code and the spec disagree, the spec wins and the code changes, or the spec changes first with a decision record.

## Stack (decided for v1)
- Node 20+, TypeScript, single service. Web UI served by the same process (plain HTML/JS or a minimal framework; no Next.js until v2 so the whole thing runs with `npm start` on a laptop in a room).
- WebSocket for clock and presence; REST for submissions.
- State: in-memory plus `sessions/<roomCode>.json` written after every change (SPEC §9). No database.
- Agent code lives under `src/agents/`; current single-turn calls use provider APIs with forced tool schemas. The Agent SDK Synthesizer remains deferred in prompt 06b.
- `npm run validate` checks every `design/methods/*.json` against the schema. Add it in prompt 02; it is the first test.

## Process
1. Take the next numbered file in `prompts/`. Do not skip ahead.
2. Build only what that prompt asks. Run it end to end with a fake group (two browser tabs is enough) before marking it done.
3. Record in `prompts/NN-*.md` under "Result" what was built, what was not, and the exact commit hash. Never write "deployed" without a timestamp and hash.
4. Update `../design/exam-map.md` with two or three lines of what you learned.

## Files
- `src/` — code. `src/engine/` state machine and gates, `src/clock/`, `src/agents/`, `src/web/`.
- `prompts/` — numbered build prompts, each a single deployable slice.
- `test/` — one test per gate rule and one per block type at minimum.

## What good looks like
- A full pros-and-cons session can be run with humans only (prompt 02) before any AI exists. If it is not usable that way, the AI will not save it.
- Killing the process mid-block and restarting it resumes with the same remaining time and everyone rejoined by room code.
- Engine logic reads method definitions from JSON; checks should detect hardcoded method IDs or role rules, not incidental substrings such as the API path `chat/completions`.

## Prior milestones (historical)
- Prompt 09 (Walkthrough and Site Pages) is complete. Stepped walkthrough replaces autoplay demo. Method configs gain walkthrough narration (block.walkthrough, method.walkthroughIntro). Record script emits *.walkthrough.json (25-40 steps per session). Self-contained HTML pages: walkthrough.html (stepped player with narration, Back/Next/Play, keyboard arrows), method.html (method explainer from JSON), site-index.html (landing page with scenario cards by tier). npm run build:site copies everything to dist/site/ as static files that work from file://. 145 tests, 16 suites.
- Prompt 08 (Scenarios and Demo) is complete. Scenario schema with cross-reference validation, scripted model client (canned outputs keyed by block id), headless simulation engine, facilitator presets, demo mode (GET /demo/:scenarioId), static replay (replay.html works from file://), 14 scenario files across 5 tiers with recordings. 141 tests, 15 suites.
- Prompt 07 (Anonymity and Detour) is complete. Part A: anonymous sessions with per-viewer payload anonymisation, count-based reports. Part B: group-level detour with trigger evaluation, dynamic block insertion, facilitator proposal card. lateral-provocation.json created as detour method.
- Prompt 06b (Synthesizer, Agent SDK) follows once a model key exists. 06a covers metrics and report generation with no model calls.

## What to avoid
- Deploying to Vercel or anywhere before prompt 05 works locally. Serverless timeouts fight the Agent SDK; deployment is a v2 problem with its own decision record.
- Letting the model decide if a block is complete. Gates are functions.
- Adding auth or a database "while we're at it".
