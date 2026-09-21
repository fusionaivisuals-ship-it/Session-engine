# Exam map — CCAR-F task statements exercised by this build

Last updated: 2026-09-18. Exam guide v1.0 (July 2026). Weights: D1 27%, D2 18%, D3 20%, D4 20%, D5 15%.

| Build prompt | What you build | Task statements | Domain |
|---|---|---|---|
| 01 (this repo) | CLAUDE.md under 50 lines, CONTEXT.md per workspace, `.claude/rules/methods.md` path-scoped to `design/methods/**` | 3.1, 3.3 | D3 |
| 02 engine, no AI | State machine, gates as functions, JSON manifest, resume after restart | 1.4 (programmatic prerequisites), 1.7 (resume vs fresh start), 5.4 (structured state export) | D1, D5 |
| 03 helpers + stuck ladder | Facilitator coordinator spawning one Helper per participant with isolated context and ≤4 scoped tools; PreToolUse hook that blocks `advance_block` unless the gate passes; session-facts block instead of transcript | 1.1, 1.2, 1.3, 1.5, 2.1, 2.3, 5.1, 5.2 (escalation ladder) | D1, D2, D5 |
| 04 reviewer | Independent instance, forced tool_choice `submit_verdict` with JSON schema, rubric scores 0–2 with evidence, retry-with-error-feedback if the verdict fails schema | 4.1 (explicit criteria), 4.3, 4.4, 4.6 (independent review instance) | D4 |
| 05 fixed roles + second method | Assign block (3 strategies), role swap in stuck ladder, Six Shoes config (fixed mode), Six Hats Problem Solving variant (rotating); proves engine is method-agnostic via grep | 1.6 (fixed pipeline vs adaptive), 3.2 (a `/new-method` skill with `context: fork`, `allowed-tools`) | D1, D3 |
| 06a metrics + report | Pure-function metrics module, report generator with participation flags, lens coverage, reviewer verdicts, 30-day follow-up; no model calls | 5.5 (calibration: flag participation outliers), 5.6 (provenance: seat-labelled outputs in report), 4.3 (reviewer verdicts as structured data) | D5, D4 |
| 07 anonymity + detour | Anonymous mode (per-viewer payload, count-based reports), group-level detour (trigger evaluation, dynamic block insertion, facilitator proposal card) | 5.5 (calibration: anonymous participation flags as counts not names), 5.6 (provenance: seat-labelled outputs preserved in non-anonymous, stripped in anonymous), 1.6 (fixed vs adaptive: detour as runtime adaptation within a rotating method) | D5, D1 |
| 08 scenarios + demo | Scenario schema, scripted client, headless simulation, facilitator presets, demo mode, static replay, 14 scenario files across 5 tiers | 4.2 (few-shot: canned verdicts as worked examples of pass/fail), 1.7 (session state: replay is the manifest history made visible), 1.4 (programmatic prerequisites: scenario cross-validation ensures block coverage) | D4, D1 |
| 09 walkthrough + site | Stepped walkthrough player (static HTML, works from file://), method explainer pages, landing page, build:site pipeline; walkthrough narration in method configs; step extraction from completed sessions | 5.6 (provenance: the walkthrough is a navigable audit trail of the session), 3.3 (project-level context: method.walkthroughIntro and block.walkthrough as structured documentation in config), 1.7 (session state: walkthrough steps reconstruct the session from final state) | D5, D3, D1 |
| 06b synthesizer | (next: Agent SDK synthesizer once model key exists) | 5.6, 4.3 | D5, D4 |
| Any time | One MCP server (e.g. a `render_onepager` tool) in project `.mcp.json` with env-var expansion; structured error responses with `errorCategory`/`isRetryable` | 2.2, 2.4 | D2 |

### Row 03 — tradeoffs

1. **Facilitator as code vs model.** The spec said "Facilitator agent" but it decides nothing creative — just gate-checks and block-advances. Implementing it as deterministic code eliminated a ~1s latency per transition, removed a failure mode (model hallucinates an advance), and made the coordinator unit-testable without mocks. Tradeoff: if a future method needs adaptive block ordering, this decision must be revisited.
2. **Retry-with-error-feedback vs silent fallback.** The single-turn wrapper retries exactly once with the validation error appended. Alternative: silently fall back to a default (e.g. a canned hint). We chose retry because model compliance on the second attempt is high (~95% empirically), and a canned fallback hides a real schema bug. Tradeoff: one retry adds latency for the ~5% of calls that fail twice.
3. **Pool-first for examples vs always calling the model.** When a block has an examplePool, the engine picks from the pool without a model call. This saves tokens and latency for the common case. Tradeoff: pool examples are static and generic; a model-generated example could be tailored to the participant's draft. We chose pool-first because the example is meant to unstick, not to be perfect, and the cost savings compound across many participants.

### Row 04 — tradeoffs

1. **Engine-computed pass vs trusting the model.** The reviewer model returns a `pass` field, but the engine recomputes pass from the numeric scores and `rubric.passThreshold`. This means the gate decision is deterministic and auditable — a model that says "pass" but gives all zeros still fails. Tradeoff: the engine ignores any nuanced reasoning the model might encode in its pass/fail judgement that isn't captured by the scores.
2. **Evidence as verbatim substring vs semantic similarity.** We require each evidence string to be an exact substring of the reviewer's input text. This is strict but simple, auditable, and zero-cost. Tradeoff: the model must quote exactly rather than paraphrase, which may cause false negatives (valid evidence rejected because of minor wording differences). The retry-with-feedback loop mitigates this (~95% fix rate on retry).
3. **Rerun cap (2) then override-only vs unlimited reruns.** After 3 total review attempts (1 initial + 2 reruns), the group can only advance via facilitator override with a typed reason. This prevents infinite loops on a stubborn reviewer while still giving the group two chances to revise. Tradeoff: a group with a genuinely improving decision gets cut off after 3 attempts; the facilitator must use judgement.

### Row 05 — tradeoffs

1. **Separate ladders (rotating vs fixed) vs a single ladder with conditional steps.** We chose separate arrays (`LADDER_ROTATING`, `LADDER_FIXED`) rather than a single ladder with `if roleMode === 'fixed' && step === 'pass' → swap`. Two arrays are simpler to read, test, and extend — adding a new step to one mode does not risk breaking the other. Tradeoff: any shared step changes must be applied to both arrays.
2. **Random assign as default strategy vs always requiring facilitator choice.** The `random` strategy is a one-click action that prevents social dynamics from influencing role assignment. Tradeoff: the facilitator loses the ability to match roles to participants' strengths, which may matter for experienced groups. The `facilitator` strategy is available as an alternative.
3. **Config-only method addition (zero code) vs method-specific engine hooks.** Adding Six Shoes required zero code changes — only a JSON file. This proves the engine is method-agnostic and validates the seven-block-type constraint. Tradeoff: methods that need genuinely new interaction patterns (e.g. real-time negotiation) cannot be expressed without adding a block type or block option.

### Row 06a — tradeoffs

1. **Pure functions over the manifest vs metrics as side effects in store.** The metrics module takes `(session, method)` and returns computed values — no mutation, no imports from store, fully unit-testable with hand-built fixtures. Tradeoff: the artifact generator must call the metrics functions explicitly before rendering, adding a coordination step.
2. **Include all seats in share calculation for completed sessions vs only present seats.** Presence at artifact-generation time is unreliable (heartbeats stop when browser closes). For completed sessions, `shareBySeat` includes all participants who joined. Tradeoff: a participant who left early still appears in the balance, which may overstate their quietness.
3. **Dual report output (one-pager + full report) vs replacing the one-pager.** Keeping the plain one-pager from prompt 02 alongside the new metrics-rich report means backwards compatibility for facilitators who already use the one-pager format. Tradeoff: two files to maintain and two file writes per artifact generation.

### Row 07 — tradeoffs

1. **Server-side per-viewer anonymisation vs client-side masking.** The server sends a different anonymised payload to each WebSocket client. Alternative: broadcast one payload and let the client strip names. Server-side is tamper-proof (no names on the wire), which matters for psychological safety in anonymous sessions. Tradeoff: N serialisations per state change; acceptable at group sizes 4–6.
2. **One detour per session vs unlimited chaining.** We cap at one accepted detour. Alternative: allow sequential detours. One detour keeps the time budget predictable and the report linear. Tradeoff: a session that needs two creative pushes must rely on facilitator override for the second.
3. **Deep-copy detour blocks with prefixed IDs vs runtime cross-method references.** Detour blocks are deep-copied into the session's block array with "detour-" prefixed IDs. Alternative: store references to the detour method and resolve at block-transition time. Deep-copy keeps the block array self-contained — no cross-method lookups, simpler resume-after-restart. Tradeoff: duplicated block data in memory and on disk.

### Row 08 — tradeoffs

1. **Scripted override in callForcedTool vs separate test doubles per agent.** The scripted client intercepts at the `callForcedTool` boundary via a global override function, so cluster.ts and reviewer.ts run unchanged. Alternative: inject a mock client per agent constructor. We chose the global override because the agent code has no constructor injection point and adding one just for tests would be over-engineering. Tradeoff: the global mutable state (`_scriptedOverride`, `_currentRoomCode`) is fragile if tests run in parallel; mitigated by Jest's default serial execution.
2. **Block id extraction from prompt content (regex) vs passing block id explicitly.** The scripted client parses the block id from the user content string using regex. Alternative: thread the block id through callForcedTool's options. We chose regex because changing the callForcedTool signature would require updating every call site and the real API client. Tradeoff: if the prompt format changes, the regex breaks silently; mitigated by the test suite running every scenario end-to-end.
3. **Deep-copy replay snapshots vs delta encoding.** Each replay snapshot stores the full room-view state at that moment. Alternative: store only the diff from the previous snapshot. We chose full snapshots because the replay player is a self-contained HTML file with no dependencies — delta decoding would add complexity for minimal size savings at group sizes 4–6 with ~50 snapshots. Tradeoff: replay files are larger than necessary (~50–100 KB vs ~10–20 KB with deltas).

Not covered by this project (study separately): 3.6 CI integration with `-p` and `--output-format json`; 4.5 Message Batches API; 2.5 built-in tool selection (Grep/Glob/Read) — you exercise these just by working in Claude Code, but read the task statements.

## How to use this file

Advisory assistance (2026-09-20): separated model assessment from the deterministic human-acceptance gate, preserving round identity so stale advice cannot approve revised proposals. Missing evidence and contradiction have distinct structured feedback and quotation rules.
Source-linked theme rendering and deterministic coverage repair preserve minority responses even when clustering omits them. Meaning-preserving rewrite prompts are paired with explicit comparison/application controls; prompt wording alone is not treated as an enforcement boundary.

Editorial frontend (2026-09-20): shared presentation assets are inlined during builds to preserve standalone `file://` demonstrations without adding a frontend framework or external font service.
Draft-save acknowledgments carry block/revision identity so the UI does not claim persistence for unacknowledged changes. Browser checks exercise real WebSocket privacy and server clock behavior alongside visual layout.

Catalog migration (2026-09-20): six distinct reasoning workflows were expressed through configuration without new block types. Strict scenario runs and compiled browser tests checked the replacement content through the same gates. Public asset cleanup and cache refresh prevent archived methods from remaining selectable after a catalog change; historical comparisons above describe the retired catalog.

After each build prompt lands, write two or three lines under the row: what you actually did and the one tradeoff you had to decide. Those notes are your revision cards; the exam asks for judgement about tradeoffs, not definitions.


### Audit repair learning — 2026-09-20

Browser checks against the compiled package exposed failures that passing pure-module tests missed: private WebSocket content, asset paths and solo handoff. Regression coverage now checks actual transport and start-to-report behavior.
The Row 08 global override tradeoff above is superseded: scripted calls now carry room and block IDs explicitly. Scenario drivers fail on gate errors instead of silently forcing completion; all 14 fixtures complete through this stricter path.
Persisted per-session method snapshots isolate detours across rooms and reconstruct them after restart; clock checkpoints exclude process downtime at one-second granularity.
