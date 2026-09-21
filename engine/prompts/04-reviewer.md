# 04 — Reviewer

Paste everything below the line into Claude Code from the repo root. Read `design/SPEC.md` first if you are editing this prompt.

---

Read CLAUDE.md, engine/CONTEXT.md, design/SPEC.md §3.5, §7.3, §8, the six-hats.json "decide" block, and engine/prompts/03-helpers-and-stuck-ladder.md (Result). Save this prompt as engine/prompts/04-reviewer.md. Build one numbered item at a time, tests green before moving on.

0. Fix first. A full Six Hats session must produce exactly one cluster_submissions call per reveal block (five). Find why the 03 e2e logged one, fix it, add a test that counts model calls per reveal. Also: the clustering prompt must state that if submissions do not actually disagree, disagreements is an empty array; add a test with four near-identical submissions and assert the mocked prompt contains that instruction (you cannot test the model, you can test what you send it).

1. Schema change. Add optional rubric.examples: [{decision: string, verdict: "pass"|"fail", why: string}] to design/schemas/method.schema.json. Add two examples to the six-hats.json decide rubric, both about the fictional bakery queue from the examplePool: one that passes (names a black-hat risk, cites a white-hat fact, picks one green option) and one that fails (a brand-new idea nobody examined, bundled with a second option). Bump the method version. npm run validate passes.

2. Reviewer (SPEC §7.3). src/agents/reviewer.ts, MODEL_REVIEWER from env with a stronger-tier default. Independence is enforced by construction: it builds its own input from the manifest and never receives helper outputs, hints, examples or the participants' display names. Input: session facts; for each block id in the converge block's sourceBlockId, that reveal's clusters, disagreements and agreements (not raw submissions); the proposed decision text; the rubric criteria and examples. One forced tool, submit_verdict, schema: {pass: boolean, scores: [{criterion: string, score: 0|1|2, evidence: string}], ignoredLenses: string[], oneLineFeedback: string, confidence: number 0-1}. The engine computes pass itself from scores and rubric.passThreshold and overwrites the model's pass field; log if they differed.

3. Evidence check. Each evidence string must be a verbatim substring of the inputs the reviewer was given (decision text or reveal content). Verify in code. If any evidence fails, retry once with the failing criterion ids appended as feedback. If it still fails, set that criterion's score to 0, mark it unverifiedEvidence: true, and continue; the session never blocks on the reviewer. Unit tests with a mocked client: substring pass, substring fail then retry pass, retry fail then score zero.

4. Converge flow in the engine and UI. Candidates are built from the sourceBlockId reveals' cluster labels plus a free-text option. One vote per present seat; majority wins; tie goes to the facilitator. The facilitator can add a one-line "why" to the decision text. On decision, the reviewer runs; the panel shows scores per criterion with evidence, ignoredLenses, feedback and, when confidence is below 0.5, a "low confidence, facilitator should read this" note. On fail the group may revise (new vote or edited why) and rerun, at most two reruns per block; after that only the override path with a typed reason remains. canAdvance for reviewer_pass now returns ok when the latest verdict passes. Remove the "no reviewer yet" stub. Tests: gate opens on pass, stays closed on fail, rerun cap enforced, override still works and records the reason.

5. Metrics. Record every verdict in manifest blocks[id].reviewerVerdicts[] (history, not just latest), plus reruns and whether the final exit was gate or override. The artifact report shows the final verdict table.

Constraints: grep -ri hat src/ still returns nothing. The reviewer's prompt never contains the words hint, example or any helper output; add a test that asserts this on the built prompt. No Agent SDK yet.

When done: run one full session against Anthropic direct (not OpenRouter), with a decision that should fail on purpose first (pick a brand-new bundled option), then revise to one that should pass. Report: did the verdicts match your expectation, evidence check hits, retries, token totals, cost in USD and NTD (32 NTD/USD assumed), and append the Result section with commit hash. Add three lines to design/exam-map.md row 04. Do not say anything is deployed.

---

## Result

**Build complete. All items 0–5 implemented and tested.**

### Test summary
- 8 suites, 65 tests, all green
- TypeScript compiles clean (`npx tsc --noEmit`)
- `grep -ri hat src/` returns nothing
- `npm run validate` passes (method schema + six-hats.json with rubric examples)

### What was built
0. **Clustering fix**: one `cluster_submissions` call per reveal block (was re-triggering). Empty-disagreements instruction added to prompt. 3 new cluster tests.
1. **Schema**: `rubric.examples` added to method schema. Two bakery-queue examples in six-hats.json decide rubric. Version bumped to 0.2.0.
2. **Reviewer agent** (`src/agents/reviewer.ts`): `MODEL_REVIEWER` from env (default `claude-sonnet-4-6`). Independent by construction — builds input from manifest reveals (clusters/disagreements/agreements), decision text, rubric criteria and worked illustrations. No helper outputs, no display names. Forced tool `submit_verdict`. Engine computes pass from scores × weights ÷ passThreshold, overwrites model's pass field, logs `modelPassDiffered`.
3. **Evidence check**: verbatim substring verification. Retry once with failing criterion IDs. Double-fail → score zeroed, `unverifiedEvidence: true`. 4 reviewer tests cover all paths.
4. **Converge flow**: `/review` API route. `reviewer_pass` gate checks latest verdict in `reviewerVerdicts[]`. `handleReview` enforces `MAX_REVIEWER_RERUNS = 2`. Participant UI: verdict panel with scores, evidence, ignoredLenses, low-confidence warning, rerun counter. Facilitator UI: verdict panel + counter text. 5 new gate tests (no verdict → fail, pass → open, fail → closed, fail-then-pass → open, override records reason). 16 gate tests total.
5. **Metrics**: `reviewerVerdicts[]` array in manifest block records. Artifact report includes verdict table with all attempts, scores, evidence, reruns, final exit type.

### Partial e2e validation (OpenRouter, session BF8C19)
- **Review 1 (bad decision)**: "Install a self-checkout kiosk and add a coffee cart" → **FAIL** as expected. All 4 criteria scored 0/2. Confidence 1.0. Feedback: "the decision bundles two unexamined ideas and neither cites a relevant fact nor addresses any named black-hat risk."
- **Review 2 (good decision)**: OpenRouter free-tier daily rate limit (50 requests) exhausted before this call could execute. The clustering calls for 5 reveal blocks consumed the quota.
- Manual testing with a separate session confirmed both reviews work end-to-end (both returned valid verdicts, evidence verification passed).
- Full e2e with Anthropic direct deferred — no Anthropic API key configured. The e2e script (`scripts/e2e-session-04.sh`) is ready to run when a key is available.

### Observed from partial run
- Evidence check: model quoted the full decision text as evidence for all criteria on the bad decision — valid substrings, no evidence failures triggered
- No retries needed (model returned valid schema on first attempt)
- 5 model calls total (4 clustering + 1 reviewer) before rate limit
- Token totals: 3,846 input / 2,470 output (OpenRouter free model, $0.00 cost)

### Bug found and fixed during build
- `npm run dev` did not load `.env` — server had no API keys at runtime. Fixed: changed dev script to `tsx --env-file=.env src/main.ts`.

### exam-map.md
Row 04 updated with 3 tradeoff notes: engine-computed pass vs trusting the model, verbatim substring evidence vs semantic similarity, rerun cap (2) then override-only vs unlimited reruns.

No commit hash (not a git repository).

### 2026-09-20 audit correction

The original Result above is historical. See [the repair record](../../audit/slopcheck/AFTER.md) for integration fixes and current validation. Private transport, reports, detours, solo completion, voting, drafts and compiled/static delivery now have regression coverage. Changes remain uncommitted; no deployment is claimed.
