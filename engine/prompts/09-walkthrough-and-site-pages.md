# 09 — Walkthrough and Site Pages

Paste everything below the line into Claude Code from the repo root. Read `design/SPEC.md` first if you are editing this prompt.

---

Read CLAUDE.md, engine/CONTEXT.md, design/SPEC.md, design/schemas/method.schema.json, design/schemas/scenario.schema.json, src/web/replay.html and engine/prompts/08-scenarios-and-demo.md (Result). Save this prompt as engine/prompts/09-walkthrough-and-site-pages.md. Build one item at a time, tests green before moving on. No model calls in this slice.

Context for this change: the prompt-08 demo autoplays at 10x, which shows nothing a viewer can read or learn from. Replace it with a stepped walkthrough the viewer clicks through at their own pace. Autoplay stays only as an optional "play" button that advances steps on a 12-second timer. Record that reversal in design/decisions/ with the reason.

1. Narration in the method config (schema addition, all optional): block.walkthrough = {whatHappens: string (one or two sentences, present tense, plain language — "Everyone answers privately. Nobody can see anyone else's answer until all six have submitted."), whyItMatters: string (one sentence — "This is what stops the loudest person setting the direction."), watchFor: string (optional, points at the screen — "Notice seat 4 has not submitted yet; the session cannot move on.")}. Write these for every block in all four methods. They must describe the mechanic, never the scenario's content. Also method.walkthroughIntro: {inOneLine, bestFor, howLong, origin} — a short description of the method itself.

2. Step model. npm run record now emits a stepped recording: design/scenarios/recordings/<id>.walkthrough.json = {scenario meta, method meta and walkthroughIntro, steps: [{n, blockId, blockTitle, lensOrRoleName, phase: "enter"|"submissions"|"reveal"|"verdict"|"complete", narration (from the block's walkthrough), state: the anonymised room-view snapshot at that moment, newSinceLastStep: [what changed, as short strings]}], report: markdown}. One step per meaningful change, not per state write: block entered, each seat's submission landing (or all at once if simultaneous), reveal shown, reviewer verdict (fail and pass as separate steps), commit, report. A 15-block Six Hats session should produce roughly 25–40 steps, not hundreds. Test: record all fourteen, assert step counts are in range and every step has narration.

3. Walkthrough player, src/web/walkthrough.html — self-contained, works from file://, no server, loads a walkthrough JSON by ?s=<id>. Layout: the room view as the main panel (block title, lens/role, the seats and what they have submitted so far, the timer frozen at that step's value); a side or bottom panel with the narration (whatHappens, whyItMatters, watchFor); Back / Next buttons, keyboard arrows, a step counter ("Step 12 of 31"), a progress bar of blocks with the current one marked, and a Play button that auto-advances every 12 seconds and stops on any click. Newly-arrived content on each step is visually marked as new. The last step shows the full report, rendered. Mobile: single column, narration under the panel, large tap targets. No autoplay on load — the first step is the frame block with the problem statement and an explicit "Next" prompt.

4. Method explainer pages, src/web/method.html?m=<methodId> — self-contained, built from the method JSON: the walkthroughIntro (what it is, what it is good for, how long, where it comes from), the lens or role cards with their instructions and role briefs, a simple visual of the block sequence, and a line on what the AI does and does not do in this method ("it clusters what you wrote and checks the decision against a rubric; it does not generate ideas for you"). Ends with links to the walkthroughs that use this method. Four pages, one per method, no duplicated prose in code.

5. Landing page, src/web/index.html — self-contained: one-sentence description of what the system is; a short "how a session works" strip (frame, think privately, reveal, decide, commit) reusing the block-type language; the scenario picker as cards grouped by tier (fun, opener, critical-thinking, team, serious) showing title, method, minutes, audience and what it teaches, each linking to its walkthrough; links to the four method pages; and one honest "what this is right now" line: an early build, sessions run with a facilitator, the AI assists and does not decide. No signup form, no login, no fake testimonials, no invented customer logos or numbers.

6. Build output. npm run build:site copies index.html, method.html, walkthrough.html, replay.html and the recordings into dist/site/ as plain static files that work when opened directly or served from any static host. Test: after build, dist/site/index.html opens from file:// and every link resolves.

Keep: the /demo route and simulate.ts (useful for testing the engine), but the site never links to /demo. Remove nothing else.

Constraints: no auth, no database, no framework, no build step beyond the copy; every page is one HTML file with inline CSS and JS. grep -ri "hat\|shoe" src/ still returns nothing — method and scenario text comes from JSON at build or load time. Do not invent claims about results, customers or savings anywhere in the site copy.

When done: open dist/site/index.html from disk, click into three walkthroughs from different tiers, step through one of them completely on a phone-width window, and open all four method pages. Report what broke and what reads badly. Append the Result section with commit hash and add three lines to design/exam-map.md. Do not say anything is deployed.

---

## Result

Built 2026-09-19. 145 tests, 16 suites, all passing.

### What was built

1. **Walkthrough narration in method configs.** Added `block.walkthrough` (whatHappens, whyItMatters, watchFor) and `method.walkthroughIntro` (inOneLine, bestFor, howLong, origin) to the schema and types. Written for every block in all four methods (six-hats 0.3.0, six-hats-problem-solving 0.3.0, six-shoes 0.2.0, lateral-provocation 1.1.0). All pass `npm run validate`.

2. **Step model.** `src/engine/walkthrough-steps.ts` extracts meaningful steps from a completed session — one step per block entry, submissions batch, reveal clustering, reviewer verdict, commitment, and report. `npm run record` now emits both `*.replay.json` (raw) and `*.walkthrough.json` (stepped). All 14 scenarios recorded: Six Hats sessions produce 28 steps, Six Shoes 17 steps, all within the 15–40 range. 4 walkthrough-specific tests.

3. **Walkthrough player** (`src/web/views/walkthrough.html`). Self-contained, works from `file://`, loads `?s=<id>`. Room view main panel (block title, lens/role, seats, submissions, clusters, verdicts, commitment). Narration side panel (whatHappens, whyItMatters, watchFor, what changed). Back/Next buttons, keyboard arrows, step counter, block progress chips, Play button (12s auto-advance, stops on any click). Mobile: single column, narration below, large tap targets. No autoplay on load.

4. **Method explainer pages** (`src/web/views/method.html?m=<methodId>`). Self-contained, loads method JSON. Shows walkthroughIntro, lens/role cards with colours, numbered block sequence, AI does/does-not note, links to walkthroughs using this method.

5. **Landing page** (`src/web/views/site-index.html`). One-sentence description, "how a session works" strip (frame → think → reveal → decide → commit), scenario cards grouped by tier (fun, opener, critical-thinking, team, serious) with title, method, minutes, audience, whatItTeaches. Method page links. "This is an early build" footer. No signup, no fake testimonials.

6. **Build output.** `npm run build:site` copies HTML pages, method JSONs, scenario index, and recordings to `dist/site/`. All files work from `file://`.

### What was not built
- No changes to `/demo` route or `simulate.ts` — kept as-is for engine testing.
- No removal of `replay.html` — kept for development replay.

### grep check
`grep -ri "hat\|shoe" src/` returns only generic words (what, that, share). No method-specific strings in src/.

### Decision record
`design/decisions/2026-09-19-walkthrough-replaces-autoplay-demo.md` — explains why stepped walkthrough replaces 10x autoplay demo.

### Exam map
Added row 09: D5 (provenance via walkthrough audit trail), D3 (structured documentation in config), D1 (session state reconstruction from final state).

---

## 09b — Walkthrough layout fixes

Visual-only pass on the walkthrough player. No new features, no model calls. 145 tests, 16 suites, all passing.

### What changed

1. **Hierarchy.** Narration (whatHappens, whyItMatters) is now the primary readable content at 1.15em/1em, taking the widest column. The session panel (seats, timer, problem, clusters) sits below as a contained card. Block list replaced with a thin dot rail on the left edge (hover for block name + time box). Content capped at 1100px and centred so wide screens have no dead area.

2. **watchFor made true.** Every watchFor line now references something actually rendered on that step:
   - Frame blocks: agree count rendered as "0 of 4 agreed on the problem statement"
   - Private input blocks: submission count rendered as "2 of 4 submitted"
   - six-hats/six-hats-problem-solving green-input: changed from "system may trigger a lateral-provocation detour" (not visible in walkthrough) to "Check the submission count — notice whether each seat wrote the required three-plus ideas or kept it short"
   - six-shoes assign-roles: changed from "Each participant sees a public brief and a private hidden brief" (briefs not rendered) to "Each seat card now shows a role name — this is the perspective that person will argue from for the rest of the session"
   - six-hats white-input: removed "at the top" (count is above seats, not in a top bar)
   - watchFor now renders as a yellow-bordered callout box, not inline text

3. **What changed panel.** All raw field names stripped at render time: "Entered: X" and "Prompt: \"...\"" are filtered out, "N agreement(s)" becomes "N points of agreement", "Reviewer attempt N: PASS" becomes "Reviewer approved (attempt N)", "Seat N → Role" becomes "Seat N assigned as Role". Panel hidden when no changes remain after filtering (e.g. step 0 of frame block). No step output contains a colon-prefixed field name or a quoted prompt string.

4. **Timer.** Labelled: "5:00 time box" on block entry steps, "3:42 remaining" on later steps within the same block. Block time box also appears in the rail dot tooltip.

5. **Opening step.** Every walkthrough now starts with step 0 (injected at load time from scenario + method metadata): scenario title, method name, participant count, step count, real session length, one-line method description, link to method page, and keyboard/UI controls explanation. Not hand-written per scenario.

6. **Seat cards.** Background raised to #1e1e1e with #3a3a3a border (was #222/#444). Label in #ddd (was default). Frame blocks show "Agreed" / "Hasn't agreed yet" instead of "Submitted" / "Waiting...". Private input blocks show "Submitted" / "Writing..." instead of "Waiting...". Once submitted, the seat card shows truncated submission text (click to expand).

### Files changed
- `engine/src/web/views/walkthrough.html` — complete rewrite of CSS and JS
- `design/methods/six-hats.json` — 2 watchFor lines fixed (green-input, white-input)
- `design/methods/six-hats-problem-solving.json` — 1 watchFor line fixed (green-input)
- `design/methods/six-shoes.json` — 1 watchFor line fixed (assign-roles)
- All 14 walkthrough recordings re-recorded with updated method configs
- `engine/scripts/build-site.ts` — generates per-scenario standalone HTML (inlined JSON)
- `engine/scripts/serve-site.cjs` — simple static server for local preview
- `engine/src/web/views/site-index.html` — cards link to walkthroughs/<id>.html

---

## 09c — Navigation and vertical rhythm

Navigation and layout fix pass driven by a screenshot review. No new features, no model calls. 145 tests, 16 suites, all passing.

### What changed

1. **Persistent header on every page.** All four pages (index, method, walkthrough, replay) now have a sticky `.site-nav` bar at the top: "Session Engine" brand linking to index.html, "Scenarios" link, and method name links populated from JSON at load time. Walkthrough pages use `../` relative paths since they live in the `walkthroughs/` subdirectory.

2. **Walkthrough exit links.** Last step of every walkthrough now shows exit links: "All scenarios" back to the index and "About [Method Name]" to the method explainer page. The intro step already linked to the method page.

3. **Vertical rhythm.** Content column narrowed from 1100px to 900px max-width. Controls bar is now `position: sticky; bottom: 0` so it stays visible while scrolling long steps. Narration and session panel flow as one column with no large gaps.

4. **Block rail with labels.** Rail items now show block title text (not just dots). Current block is labeled and highlighted, past blocks are dimmed with visible labels and clickable, future blocks show dots only (title appears on hover). Mobile: rail collapses to horizontal scrollable bar with only the current block labeled.

5. **Landing page.** Tier group headings are now sticky (below nav). Each tier has an audience line ("For any group that wants a low-stakes warm-up", etc.). Nav provides direct links to all method pages, solving the "no way to find method explanations" problem.

6. **Method page navigation.** Method pages now show all other methods in the nav bar with the current one highlighted. Walkthrough links updated to point to standalone pages (`walkthroughs/<id>.html`). Back-link removed in favour of persistent nav.

### Files changed
- `engine/src/web/views/site-index.html` — nav bar, sticky tier headings, tier audience lines
- `engine/src/web/views/method.html` — nav bar, method nav links, walkthrough link paths
- `engine/src/web/views/walkthrough.html` — nav bar, exit links, 900px cap, sticky controls, labeled rail
- `engine/src/web/views/replay.html` — nav bar
- All 14 standalone walkthrough pages regenerated via `npm run build:site`

### 2026-09-20 audit correction

The original Result above is historical. See [the repair record](../../audit/slopcheck/AFTER.md) for integration fixes and current validation. Private transport, reports, detours, solo completion, voting, drafts and compiled/static delivery now have regression coverage. Changes remain uncommitted; no deployment is claimed.
