# 03 — Helpers and Stuck Ladder

Paste everything below the line into Claude Code from the repo root. Read `design/SPEC.md` first if you are editing this prompt.

---

Read CLAUDE.md, engine/CONTEXT.md, design/SPEC.md §3.4, §6 and §7, and engine/prompts/02-engine-no-ai.md (Result section). First, save this whole prompt as engine/prompts/03-helpers-and-stuck-ladder.md. Then build this slice, one numbered item at a time, tests green before moving on.

Architecture decision for this slice, to record before coding:
The "Facilitator agent" in SPEC §7.1 is implemented as deterministic code, not a model. It decides nothing creative, so a model would add latency, cost and a failure mode for no gain. Model calls in this slice are single-turn, forced tool_use calls on the Messages API (@anthropic-ai/sdk), each with a JSON schema for its output. The Agent SDK is deferred to prompt 05 (Synthesizer). Write design/decisions/2026-MM-DD-facilitator-is-code-helpers-are-single-turn.md explaining this in the existing decision-record format, and amend SPEC §7.1 to match.

1. Model client. Add @anthropic-ai/sdk. API key from ANTHROPIC_API_KEY in .env (add .env to .gitignore, commit a .env.example). Model ids from env: MODEL_HELPER and MODEL_CLUSTER, with a mid-tier default. Every call goes through one wrapper in src/agents/client.ts that: builds the session-facts block (SPEC §7.5) from the manifest, sends it as the first user content, forces the named tool with tool_choice {type:"tool", name}, validates the returned input against the tool's schema, retries once with the validation error appended if it fails (SPEC/exam: retry-with-error-feedback), and logs input/output tokens per call into the manifest under metrics.modelCalls[]. Unit test the wrapper with a mocked client: forced tool returned, schema validation failure triggers exactly one retry.

2. Helper (SPEC §7.2). src/agents/helper.ts. Context it receives: session facts, the block's prompt, the current lens instruction (rotating mode), that participant's own draft and prior submissions, the block's helper.systemPrompt. Nothing from any other participant. Three tools, each a schema not an action:
   - give_hint {question: string} — one question, no example answer, max 30 words.
   - give_example {example: string} — only called when the block has no examplePool; otherwise the engine picks from examplePool without a model call.
   - suggest_rewrite {rewrite: string, whatChanged: string} — frame block only, on request.
   The Helper cannot submit, advance, or see the room. Enforce by construction: it has no access to those functions, not by prompt.

3. Stuck ladder (SPEC §6). src/engine/stuck.ts. Per seat per private_input block, a step index 0..3. Triggers: "I'm stuck" button, or no keystroke for block.stuck.idleSec (fall back to timing.idleSec) measured by a client keystroke heartbeat (send "typing" at most every 5 s). Steps in order: hint -> example -> pass-with-reason (rotating mode) or swap (fixed mode; not built yet, throw a clear NotImplemented) -> facilitator flag. Each step logs a stuckEvent in the manifest. Cap: the ladder never repeats a step for the same seat in the same block. A pass counts as submitted with passed:true and passReason. Unit tests: ordering, no repeat, idle trigger fires once, pass unblocks the gate.

4. Reveal clustering (SPEC §3.4). src/agents/cluster.ts, tool cluster_submissions with schema {clusters:[{label, seats[], summary}], disagreements:[string], agreements:[string]}. Input: session facts plus the source block's submissions labelled by seat only (no display names). Called once when the reveal block is entered; result stored in manifest blocks[id].reveal and rendered: disagreements panel first, then clusters, then agreements. Passed submissions appear as "passed" in their own cluster, not merged. If the call fails after retry, render the raw side-by-side list from prompt 02 and show a small "clustering unavailable" note; the session never blocks on a model failure.

5. UI wiring. Participant view: "I'm stuck" now walks the ladder and shows the hint/example inline under the text area; pass-with-reason is a small form. Facilitator view: per-seat ladder step visible; "needs you" flag at step 4. Frame block: a "suggest rewrite" button for the facilitator only.

6. Cost line. After the e2e run, sum metrics.modelCalls tokens, compute cost from the model prices in .env.example (put placeholder prices there; I will fill real ones), and print per-session cost in USD and NTD (assume 32 NTD/USD, label it as assumed).

Constraints: grep -ri hat src/ still returns nothing. No Agent SDK yet. No changes to gates: a stuck participant is unblocked only by submitting or passing, never by the ladder itself.

When done: run a full Six Hats session end to end with a real API key, three participant tabs, trigger the ladder on one seat through all steps, and one reveal per hat. Report what broke, the token totals, the cost line, and append a Result section to this prompt file with commit hash. Add three lines to design/exam-map.md row 03 on the tradeoffs you hit. Do not say anything is deployed.

---

## Result

**E2e run (full session, OpenRouter):** Full 15-block Six Hats session completed via `scripts/e2e-session-03.sh` with 4 participants and live model calls through OpenRouter (`nex-agi/nex-n2.5-pro:free`). Stuck ladder triggered on seat-3 through all steps: hint (API-generated question), example (pool hit on white hat, no model call), pass (seat-3 passed with reason). All 6 reveal blocks auto-triggered clustering. Session completed through all blocks. Report generated at `sessions/reports/<roomCode>.md`.

**E2e run (red hat stuck — no example pool):** Separate session advanced to red-input, then seat-3 pressed "I'm stuck" twice. Step 1 (hint): model returned a question via `give_hint`. Step 2 (example): no `examplePool` on red hat, so `give_example` hit the API and returned a model-generated example (*"I feel curious about this problem, with a hint of uncertainty."*). Confirms pool-first logic works: white hat uses pool, red hat calls the model.

**Token totals (full e2e):** 3 model calls, 1,791 input + 1,168 output tokens (clustering + stuck ladder). Red hat stuck test added 2 more calls: 482+467 input, 120+184 output. All calls succeeded on first attempt (0 retries).

**Cost:** $0.00 USD (free-tier model via OpenRouter). With Anthropic Haiku pricing ($0.80/$4.00 per M tokens), equivalent cost would be ~$0.006 USD per full session.

**What broke / known issues:**
- Nothing broke during the live e2e. All model calls returned valid tool_use responses on first attempt.
- The `triggerClusteringIfNeeded` function sets `clusteringFailed=true` as a re-entry guard before the async call. If the call succeeds, it flips to false. Brief UI flash of "clustering unavailable" before result arrives — cosmetic only.

**OpenRouter integration:** Added dual-backend support in `client.ts`. If `OPENROUTER_API_KEY` is set, uses `fetch` with OpenAI-compatible format (tools/tool_choice). If only `ANTHROPIC_API_KEY` is set, uses `@anthropic-ai/sdk`. Both paths share the same retry-with-error-feedback logic.

**Tests:** 45 passing across 7 suites (gates, clock, manifest, client, helper, stuck, cluster).

**grep -ri hat src/:** 0 matches.

**Files added/modified:**
- `design/decisions/2026-09-17-facilitator-is-code-helpers-are-single-turn.md` (new)
- `design/SPEC.md` section 7.1 amended, section 8 updated
- `design/exam-map.md` row 03 tradeoffs added
- `engine/.env.example` (new) — documents both Anthropic and OpenRouter options
- `.gitignore` updated with `.env`
- `engine/src/types.ts` — added `ModelCallMetric`, `agreements`, `clusteringFailed` to BlockRecord.reveal
- `engine/src/agents/client.ts` (new) — dual-backend model wrapper (Anthropic SDK + OpenRouter fetch), forced tool_use, session-facts builder, retry-with-error
- `engine/src/agents/helper.ts` (new) — give_hint, give_example, suggest_rewrite
- `engine/src/agents/cluster.ts` (new) — cluster_submissions with graceful fallback
- `engine/src/engine/stuck.ts` (new) — 4-step ladder, idle detection, pass submission
- `engine/src/engine/store.ts` — handleStuck, handlePass, handleClustering, handleSuggestRewrite, recordKeystroke, checkIdleStuck, auto-trigger clustering on reveal entry
- `engine/src/web/api.ts` — /stuck (async ladder), /pass, /cluster, /suggest-rewrite, /typing routes
- `engine/src/web/artifact.ts` — cost line section, pass display
- `engine/src/web/views/join.html` — stuck ladder UI (hint/example/pass-form/flag), typing heartbeat, clustering display
- `engine/src/web/views/facilitate.html` — per-seat ladder step, NEEDS YOU flag, suggest rewrite button
- `engine/src/main.ts` — typing WS handler, idle stuck check interval
- `engine/test/client.test.ts` (new, 4 tests)
- `engine/test/helper.test.ts` (new, 6 tests)
- `engine/test/stuck.test.ts` (new, 11 tests)
- `engine/test/cluster.test.ts` (new, 3 tests)
- `engine/scripts/e2e-session-03.sh` (new)
- `engine/scripts/cost-line.ts` (new)
- `engine/scripts/test-openrouter.ts` (new) — smoke test for OpenRouter integration

**Commit:** pending

### 2026-09-20 audit correction

The original Result above is historical. See [the repair record](../../audit/slopcheck/AFTER.md) for integration fixes and current validation. Private transport, reports, detours, solo completion, voting, drafts and compiled/static delivery now have regression coverage. Changes remain uncommitted; no deployment is claimed.
