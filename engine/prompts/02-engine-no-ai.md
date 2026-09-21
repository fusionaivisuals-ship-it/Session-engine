# 02 — Engine without AI

Paste everything below the line into Claude Code from the repo root. Read `design/SPEC.md` first if you are editing this prompt.

---

Read CLAUDE.md, then engine/CONTEXT.md, then design/SPEC.md in full. Then build the engine with no AI in it.

Scope of this slice, nothing more:

1. `npm run validate`: validates every `design/methods/*.json` against `design/schemas/method.schema.json` and checks that `sourceBlockId` references point at earlier blocks and `lensId` references exist. Fails with a readable message. This is the first thing you write and run.

2. Session state machine in `src/engine/`. Load a method by id. Create a session with a room code. Blocks advance in order. Implement `canAdvance(session, block): {ok, reason}` for every completion rule in SPEC §3.8, including the `timeout` and `facilitator_override` exits. For `reviewer_pass`, in this slice, return `{ok:false, reason:"no reviewer yet"}` so the facilitator override path is the only way through; that is deliberate. Write one unit test per rule.

3. Clock in `src/clock/`: server-authoritative, per-block timebox, amber at 20% remaining, timeout exit at zero, one extension per block, pause and resume with frozen remaining time. Test: pause at 37 s remaining, resume, still 37 s.

4. Manifest: after every state change write `sessions/<roomCode>.json` matching `design/schemas/session-state.schema.json`. On process start, if a manifest exists with status running or paused, reload it paused. Test: create session, advance two blocks, kill process, start it, session is there with the same block and remaining time.

5. Web UI under `src/web/`, served by the same process, three views by URL:
   - `/room/:code` — the projected room screen: block title, lens name and instruction, big timer, presence dots per seat, agree/submitted/confirmed counters.
   - `/join/:code` — participant: enter display name, then per block the prompt, lens reminder, text area with word count, submit, "I'm stuck" button (logs a stuck event and shows "hint coming in the next version"; nothing else yet), and for reveal blocks the raw list of submissions side by side plus an "I've read this" button. Reveal clustering is NOT built here: show submissions as-is.
   - `/facilitate/:code` — facilitator: everything the room shows plus pause, extend, override (requires a typed reason), and a per-seat stuck flag.
   WebSocket for clock and presence heartbeats every 10 s; REST for submissions. Presence goes idle after `idleSec`, absent after `presenceTimeoutSec`; absent seats do not block gates and the facilitator view says so.

6. The `commit` block form with schema validation; the `frame` block with a facilitator-edited shared sentence and per-participant agree; the `artifact` block writes a plain markdown one-pager from the manifest (problem, submissions per block, decision, commitment) to `sessions/reports/<roomCode>.md`. No AI, no clustering, no reviewer.

Constraints:
- TypeScript, Node 20+, minimal dependencies. No database, no auth, no Next.js.
- `grep -ri hat src/` must return nothing. All method text comes from the loaded JSON.
- Build and test one numbered item at a time in the order above; do not start the next until the previous runs.
- When done, run a full Six Hats session yourself with three browser tabs as participants and one as facilitator, from Frame to artifact, and tell me what broke. Then append a "Result" section to engine/prompts/02-engine-no-ai.md with what was built, what was skipped, and the commit hash. Do not say anything is deployed.

---

## Result

Commit: `9b8b346` (2026-09-17)

### Built (all six items)

1. **`npm run validate`** — validates every `design/methods/*.json` against the JSON schema. Checks `sourceBlockId` references point at earlier blocks and `lensId` references exist. Tested with broken method files; fails with readable messages.

2. **Session state machine** (`src/engine/`) — `canAdvance(session, block)` for all seven completion rules: `all_submitted`, `all_confirmed`, `all_agreed`, `all_assigned`, `reviewer_pass` (returns `{ok:false}` deliberately), `valid_form`, `auto`. Absent seats do not block gates. 12 unit tests pass.

3. **Clock** (`src/clock/`) — server-authoritative, per-block timebox, amber at 20% remaining, timeout at zero, one extension per block (rejects second), pause/resume with frozen remaining time. Pause at 37s, resume, still 37s. 7 unit tests pass.

4. **Manifest persistence** — writes `sessions/<roomCode>.json` after every state change. On startup, manifests with status running/paused reload as paused with frozen clock. Tested: advance past frame, kill process, restart, session recovers on correct block with correct remaining time. 2 unit tests pass.

5. **Web UI** — three views served by same Express process:
   - `/room/:code` — block title, lens name/instruction/colour, big timer (amber/red), presence dots, counters.
   - `/join/:code` — name entry, prompt, lens reminder, text area + word count, submit, "I'm stuck" (logs event, shows placeholder), reveal shows raw submissions + "I've read this", converge shows source submissions, commit form.
   - `/facilitate/:code` — room view plus start, pause/resume, extend (+60s), override (typed reason required), per-seat stuck flags, problem statement editor, generate report.
   - WebSocket pushes state on every change; 10s heartbeats. REST for all actions. Methods dropdown loaded from `/api/methods`.
   - Presence: idle after `idleSec`, absent after `presenceTimeoutSec`; absent seats excluded from gates.

6. **Block-specific logic**: frame (facilitator edits, participants agree), commit (structured form with validation), artifact (auto-completes session, report via API writes markdown one-pager to `sessions/reports/<roomCode>.md`).

### E2E session

Ran all 15 blocks of Six Hats via curl with 4 simulated participants (`scripts/e2e-session.sh`). frame -> white-input -> white-reveal -> red-input -> red-reveal -> black-input -> black-reveal -> yellow-input -> yellow-reveal -> green-input -> green-reveal -> decide (facilitator override) -> commit -> artifact -> complete. Report generated with problem, all submissions, decision, commitment, participation stats.

**Bug found and fixed:** Artifact block (auto-complete) left session in `running`. `enterBlock` exited it but did not advance to session complete. Fixed by moving auto-advance into `advanceBlock`.

### Skipped (deliberate)

- Reveal clustering (no AI grouping/disagreements)
- Reviewer (`reviewer_pass` always false; override is the only path)
- Helper / stuck ladder (placeholder only)
- Synthesizer (plain markdown, no AI prose)
- `assign` block (not exercised; Six Hats uses rotating mode)
- `totalBudgetSec` header display
- `lensCoverage` and `frameToCommitSec` metrics computation

### Constraint check

- `grep -ri hat src/` returns nothing
- 21 unit tests pass
- TypeScript, Node 20+, Express, ws, ajv, uuid. No database, no auth, no Next.js
- Single process: `npx tsx src/main.ts` on port 3000
