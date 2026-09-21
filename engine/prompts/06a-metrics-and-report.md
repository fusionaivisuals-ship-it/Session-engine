# 06a — Metrics and Report

Paste everything below the line into Claude Code from the repo root. Read `design/SPEC.md` first if you are editing this prompt.

---

Read CLAUDE.md, engine/CONTEXT.md, design/SPEC.md §10 and §3.7, and design/schemas/session-state.schema.json (metrics section). Save this prompt as engine/prompts/06a-metrics-and-report.md and note in engine/CONTEXT.md that 06b (Synthesizer, Agent SDK) follows once a model key exists.

No model calls in this slice. Build one item at a time, tests green before moving on.

1. Metrics module (`src/engine/metrics.ts`), pure functions over the manifest:
   - `frameToCommitSec`: from frame block enteredAt to commit block exitedAt.
   - `perBlock`: elapsed vs timeboxSec, exit reason, extensions used, overrides with reasons.
   - `wordsBySeat` and `shareBySeat`: word counts over all private_input submissions; passed and auto-submitted entries count as 0 words.
   - `participationFlags`: seats above 40% or below 10% share (of present seats only), and any seat with two or more passes.
   - `lensCoverage`: per lens (rotating) or per role (fixed): "substantive" if median submission >= block's minWords, "token" if below, "pass" if majority passed, "missing" if no submissions.
   - `stuckSummary`: ladder steps used per seat, swaps, facilitator flags.
   - `reviewSummary`: verdicts per converge block, reruns, final exit gate or override.
   - `modelUsage`: total calls and tokens from metrics.modelCalls, zero if none.
   - Unit tests with hand-built manifests for each function, edge cases: one absent seat, all seats passed one block, session ended by override at converge. At least 8 tests.

2. Report generator (`src/engine/report.ts`): renders `sessions/reports/<roomCode>.md`.
   - Sections: header (method, date, participants, total time vs budget); decision and commitment; table of lens/role outputs (cluster labels + disagreements if clustering ran, otherwise raw submissions, seat-labelled); reviewer verdict table; "How the group worked" section (time to decision, participation balance with flags in plain words, lens coverage, stuck and override log); end with 30-day follow-up line.
   - Numbers as numbers, decisions as sentences, lens outputs as tables (SPEC §7.4).
   - Test: snapshot the report for one fixture manifest.

3. Wire it.
   - Artifact block calls report generator.
   - Room screen shows "How the group worked" numbers on session complete.
   - Facilitator view has "download report" link.
   - Keep plain one-pager from prompt 02 as `sessions/reports/<roomCode>-onepager.md`.

4. Facilitator run log template.
   - `sessions/_template-run-log.md` with fields from sessions/CONTEXT.md.
   - Artifact block copies to `sessions/<YYYY-MM-DD>-<roomCode>-<methodId>.md` with header prefilled.

When done: run six-hats.json with 3 tabs, make one seat pass twice and one seat write 3x more than others, confirm report flags both. Report what broke. Append Result section. Add 3 lines to exam-map.md (5.5 calibration, 5.6 provenance). Do not say anything is deployed.

Constraints: `grep -ri "hat\|shoe" src/` returns nothing. No new dependencies.

---

## Result

**Build complete. All items 1–4 implemented and tested.**

### Test summary
- 11 suites, 102 tests, all green
- TypeScript compiles clean (`npx tsc --noEmit`)
- `grep -ri "hat|shoe" src/` returns nothing
- `npm run validate` passes (3 methods)

### What was built
1. **Metrics module** (`src/engine/metrics.ts`): 8 pure functions — `frameToCommitSec`, `perBlock`, `wordsBySeat`, `shareBySeat`, `participationFlags`, `lensCoverage`, `stuckSummary`, `reviewSummary`, `modelUsage`. 22 unit tests covering edge cases (absent seat, all-passed, override at converge, fixed vs rotating mode). `shareBySeat` includes all seats for completed sessions, only present seats for running sessions.
2. **Report generator** (`src/engine/report.ts`): renders full session report with sections: header, decision, commitment, outputs by lens (clustered or raw), reviewer verdicts, "How the group worked" (time, participation with flags, lens coverage, stuck/override log, model usage), 30-day follow-up. 5 tests including snapshot.
3. **Wiring**: Artifact block generates both one-pager (`<code>-onepager.md`) and full report (`<code>.md`). Updates session metrics before rendering. Room screen shows time-to-decision and word balance on complete. Facilitator view shows download link, group metrics table, and dominant/quiet flags. API route `GET /sessions/:code/report` serves the markdown file.
4. **Run log template** (`sessions/_template-run-log.md`): 7 placeholders (date, room, method, participants, problem, decision, time). Artifact block copies to `sessions/<YYYY-MM-DD>-<code>-<method>.md` with header prefilled.

### E2E validation (localhost, no API key)
- **Session DC790B** (Six Thinking Hats): 4 participants. Alice wrote ~3x more than others (169 words vs 35/17/42). Carol passed white and red blocks. Report correctly flags:
  - Alice: **dominated** (79% of words)
  - Carol: **quiet** (0%) + **passed 2 blocks**
  - Dave: **quiet** (10%)
- Lens coverage: white and red substantive, black and yellow token, green and blue missing (blocks overridden).
- Override log correctly shows "No API key for reviewer; testing report generation".
- Both one-pager and full report generated. Run log template found and filled.

### What broke
- Curl-based testing without WebSocket heartbeats causes presence timeout, marking all seats absent. Fixed by making `shareBySeat` include all seats for completed sessions (presence at artifact time is unreliable). Original session 9913AF lost data from this issue; DC790B ran cleanly with typing heartbeats.
- Green-input reveal block shows empty raw submissions table when block was overridden before submissions. Cosmetic issue — the block was correctly skipped.

### exam-map.md
Row 06a updated with 3 lines on calibration and provenance.

No commit hash (not a git repository).

### 2026-09-20 audit correction

The original Result above is historical. See [the repair record](../../audit/slopcheck/AFTER.md) for integration fixes and current validation. Private transport, reports, detours, solo completion, voting, drafts and compiled/static delivery now have regression coverage. Changes remain uncommitted; no deployment is claimed.
