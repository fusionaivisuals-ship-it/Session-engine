# 08 — Scenarios and Demo

Paste everything below the line into Claude Code from the repo root. Read `design/SPEC.md` first if you are editing this prompt.

---

Read CLAUDE.md, design/SPEC.md, design/schemas/method.schema.json, src/agents/client.ts, and engine/prompts/07-anonymity-and-detour.md (Result). Save this prompt as engine/prompts/08-scenarios-and-demo.md. Build one item at a time, tests green before moving on. No model calls anywhere in this slice.

1. Scenario schema, design/schemas/scenario.schema.json: {id, title, tier: "fun"|"opener"|"critical-thinking"|"team"|"serious", methodId, minutes, audience: string, whatItTeaches: string, problemStatement, anonymous: boolean, seats: [{seat, persona: string (one line, never shown to viewers), submissions: {blockId: text}, passes?: [blockId]}], canned: {reveals: {blockId: {clusters, disagreements, agreements}}, verdicts: {blockId: [verdict objects in submit_verdict shape, first may fail]}, decision: string, commitment: {owner, firstAction, dueDate, successSignal}}}. Every blockId must exist in the method; every private_input block must have a submission or pass for every seat; canned reveals must exist for every reveal block; canned verdicts for every converge block. Extend npm run validate to cover design/scenarios/*.json.

2. Scripted model client. src/agents/scripted-client.ts implements the same interface as client.ts but returns canned outputs from the loaded scenario, keyed by block id, and throws a clear error if asked for something the scenario does not contain. Selected by env MODEL_MODE=scripted or per-session when a scenario is loaded. Unit test: the reviewer and clustering code paths run unchanged against the scripted client.

3. Scripted participants. src/engine/simulate.ts: given a session and a scenario, simulated seats join, agree at frame, and submit their text a few seconds into each private_input block with a small random stagger; passes are submitted as passes; confirmations at reveal; votes at converge follow canned.decision. A session-level clockScale (default 1; demo uses 10) multiplies the server clock. Tests: a scenario runs from frame to artifact with no human, produces a manifest that validates, and the report renders.

4. Facilitator preset. On room creation the facilitator can pick a scenario as a preset: problemStatement prefilled into the frame block, anonymous set from the scenario, no simulated seats. Live humans then play it. This is the "pick a scenario" list for real sessions; show tier, minutes, audience and whatItTeaches.

5. Demo mode and static replay. GET /demo/:scenarioId creates a scripted session at clockScale 10 with simulated seats and opens the room view with a "watch" banner; a visitor can optionally take an empty seat via /join. Separately, npm run record <scenarioId> runs a scenario headlessly and writes design/scenarios/recordings/<id>.replay.json: an ordered list of {tMs, view: "room", state} snapshots (one per state change), anonymised, plus the final report markdown. Then src/web/replay.html: a single self-contained page (inline CSS/JS, no server) that loads a replay JSON by URL, renders the room view from snapshots, plays at selectable speed with a scrubber, and shows the report at the end. This file plus a replay JSON is what goes on the marketing site. Test: record six-hats coffee-machine, load it in replay.html, plays to the end.

6. Content. Write these fourteen scenarios in design/scenarios/, each seat with a distinct persona (cautious, blunt, optimistic, quiet, process-minded, new-joiner — vary per scenario) so the submissions read like different people, and the canned clustering must reflect real disagreement between them. Canned verdicts: the "critical-thinking" and "serious" tiers include a first failing verdict (a bundled or sunk-cost decision) followed by a passing revised one, so viewers see the reviewer do its job.
   fun: coffee-machine-died (six-hats), worst-team-building-day (six-hats with lateral-provocation detour triggered by thin green input), replace-the-mascot (six-shoes)
   opener: phones-in-the-room (six-hats, 12 min), ai-wrote-your-job (six-hats-problem-solving)
   critical-thinking: four-day-week-claim (six-hats, white hat heavy, most facts marked unverified), continue-or-kill-140-percent (six-hats, sunk cost named as black-hat risk), two-sources-disagree (six-hats, short)
   team: meetings-eat-the-week (six-hats), second-hire-quit (six-shoes), single-point-of-failure-deploy (six-shoes)
   serious: data-sent-to-wrong-client (six-shoes, orange-gumboots first), cut-15-percent-no-layoffs (six-hats-problem-solving), pivot-or-persist (six-hats, four seats, anonymous)

   Problem statements as given in the titles, written out as proper frame sentences with subject, tension and impact. All fourteen validate; all fourteen run headlessly to artifact; record all fourteen.

7. design/scenarios/README.md: one table of the fourteen with tier, method, minutes, audience, what it teaches, and a line on how to add a scenario (copy, edit, validate, record).

Constraints: grep -ri "hat\|shoe\|coffee\|mascot" src/ returns nothing; scenario content lives only in design/scenarios/. replay.html must work from file:// with no network.

When done: run /demo/coffee-machine-died in a browser at 10x and watch it to the report; open replay.html with two different recordings. Report what broke, append the Result section with commit hash, add three lines to design/exam-map.md (4.2 few-shot: canned verdicts as worked examples of pass/fail; 1.7 session state: replay is the manifest history made visible). Do not say anything is deployed.

---

## Result

### What landed

**Item 1 — Scenario schema**
- `design/schemas/scenario.schema.json`: full schema with id, title, tier, methodId, minutes, audience, whatItTeaches, problemStatement, anonymous, seats (with submissions and passes), canned (reveals, verdicts, decision, commitment).
- `engine/scripts/validate-scenarios.ts`: JSON Schema validation via Ajv plus cross-reference checks — every blockId exists in the method, every private_input has a submission or pass per seat, every reveal block has canned reveal data, every converge block has canned verdicts.
- `npm run validate` now runs both `validate-methods.ts` and `validate-scenarios.ts`.

**Item 2 — Scripted model client**
- `src/agents/scripted-client.ts`: implements canned output lookup keyed by block id. `extractBlockId()` parses block id from prompt content via regex. `findRevealBlockForSource()` maps "X-input" → "X-reveal". Per-room per-block verdict counters support failing-then-passing sequences.
- `src/agents/client.ts`: global `_scriptedOverride` + `_currentRoomCode` checked before real API calls. `store.ts` sets the room code before each cluster/reviewer call.
- 5 unit tests: canned clusters, sequential verdicts, unknown room error, missing reveal error, unsupported tool error.

**Item 3 — Scripted participants (simulate.ts)**
- `src/engine/simulate.ts`: `runScenario()` creates session, loads canned data, wires scripted client, drives through all block types programmatically.
- Handles: frame (problem statement + agree), assign (random), private_input (submissions with stagger, passes), reveal (wait for clustering + confirm), converge (decision + review with retry), commit (commitment from scenario).
- Falls back to facilitator override if a block doesn't advance.
- 2 tests: coffee-machine-died runs to completion with correct state; manifest file written to disk.

**Item 4 — Facilitator preset**
- `POST /api/sessions` accepts optional `scenarioId` — prefills problemStatement, sets anonymous from scenario config. No simulated seats.
- `GET /api/scenarios` returns scenario list with tier, minutes, audience, whatItTeaches for the facilitator picker.

**Item 5 — Demo mode and static replay**
- `GET /demo/:scenarioId` runs scenario at clockScale 10, redirects to room view with watch banner.
- `npm run record` (`scripts/record-scenario.ts`) runs headlessly at 100x, captures anonymised snapshots on each state change, writes `design/scenarios/recordings/<id>.replay.json`.
- `src/web/views/replay.html`: self-contained page (inline CSS/JS, no server), loads replay JSON via file input or URL parameter, renders room view from snapshots, play/pause with speed selector (0.5x–10x), scrubber, shows report at end. Works from `file://`.

**Item 6 — Content (14 scenarios)**
- fun: coffee-machine-died, worst-team-building-day (thin green for detour), replace-the-mascot (six-shoes)
- opener: phones-in-the-room (12 min), ai-wrote-your-job (six-hats-problem-solving)
- critical-thinking: four-day-week-claim, continue-or-kill-140-percent (sunk cost), two-sources-disagree
- team: meetings-eat-the-week, second-hire-quit (six-shoes), single-point-of-failure-deploy (six-shoes)
- serious: data-sent-to-wrong-client (six-shoes), cut-15-percent-no-layoffs (six-hats-problem-solving), pivot-or-persist (anonymous)
- Critical-thinking and serious tiers include failing-then-passing verdicts.
- All 14 recorded to `design/scenarios/recordings/`.

**Item 7 — README and exam-map**
- `design/scenarios/README.md`: table of all 14 scenarios with add-a-scenario instructions.
- `design/exam-map.md` updated with row 08: 4.2 (few-shot: canned verdicts as worked examples), 1.7 (session state: replay as manifest history), 1.4 (programmatic prerequisites: scenario cross-validation).

**Constraints verified**
- `grep -ri "hat\|shoe\|coffee\|mascot" src/` returns nothing. Scenario content lives only in `design/scenarios/`.
- `replay.html` works from `file://` with no network.
- 141 tests, 15 suites — all green.
- All 14 scenarios pass `npm run validate`.

### Trust boundary

The scripted client and simulation engine are development/demo tools. They do not run in production sessions. The `_scriptedOverride` global in `client.ts` is only set by `simulate.ts` and cleared after each run. A production session with `MODEL_MODE=scripted` but no loaded scenario will get clear errors, not silent failures.

### What broke

- `validate-scenarios.ts` initially used `__dirname` in an ESM module — `ReferenceError`. Fixed by switching to `import.meta.dirname`.
- `pivot-or-persist.json` referenced a non-existent block id `black-input-2` (the six-hats method only has `black-input`). Fixed by remapping submissions.
- Three scenario files had extra properties not allowed by the schema (extra keys on seats and reveal data). Fixed by stripping non-schema keys.
- `package.json` edits failed with "File has not been read yet" — had to re-read before editing (tool constraint).

### Tradeoffs

1. **Scripted override in callForcedTool vs separate test doubles per agent.** The scripted client intercepts at the `callForcedTool` boundary via a global override, so `cluster.ts` and `reviewer.ts` run unchanged. Alternative: inject a mock client per agent. We chose the global override because the agent code has no injection point and adding one just for tests would be over-engineering. Tradeoff: global mutable state is fragile if tests run in parallel; mitigated by Jest's serial default.
2. **Block id extraction from prompt content (regex) vs explicit parameter.** The scripted client parses block id from user content strings. Alternative: thread block id through callForcedTool options. We chose regex to avoid changing the callForcedTool signature and every call site. Tradeoff: if prompt format changes, the regex breaks silently; mitigated by end-to-end scenario tests.
3. **Full-state replay snapshots vs delta encoding.** Each snapshot stores complete room-view state. Alternative: store diffs. We chose full snapshots because the replay player is a self-contained HTML file — delta decoding adds complexity for minimal savings at ~50 snapshots. Tradeoff: replay files are ~50–100 KB instead of ~10–20 KB.

### 2026-09-20 audit correction

The original Result above is historical. See [the repair record](../../audit/slopcheck/AFTER.md) for integration fixes and current validation. Private transport, reports, detours, solo completion, voting, drafts and compiled/static delivery now have regression coverage. Changes remain uncommitted; no deployment is claimed.
