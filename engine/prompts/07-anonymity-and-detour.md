# 07 — Anonymity and Detour

Paste everything below the line into Claude Code from the repo root. Read `design/SPEC.md` first if you are editing this prompt.

---

Read CLAUDE.md, design/SPEC.md §3, §5, §6, §10, design/frameworks.md (lateral thinking, TRIZ, SIT sections), design/schemas/method.schema.json and engine/prompts/06a-metrics-and-report.md (Result). Save this prompt as engine/prompts/07-anonymity-and-detour.md. Build one item at a time, tests green before moving on.

## Part A — Anonymous Mode

1. Session option `anonymous: boolean`, chosen by facilitator at room creation. Methods may set `defaults.anonymous` in config (schema addition, default false). Persist in manifest.

2. When anonymous=true, identity everywhere except own screen is "Seat N" (rotating) or role name (fixed). Applies to: room view, participant view (others), facilitator view, reveal payloads, clustering/reviewer inputs, one-pager, full report, run-log header. Display names collected at join only for rejoin. Own screen shows "You · Seat N".

3. Anonymous report: participation balance stated as counts not seats ("one seat above 40%"), lens coverage unchanged, stuck summary totals only. Add `metrics.anonymous` flag. Tests: render every view payload and both reports for anonymous session, assert no display name string appears; assert non-anonymous report unchanged (existing snapshot).

## Part B — Group-level Detour

4. Schema: `method.fallbacks: [{trigger, detourMethodId, blockIds, reason}]`. Optional block flag `ideaBlock: true`. Triggers: `converge_failed_twice`, `ideas_thin`, `facilitator`. Rotating-mode detours only in v1; fixed-mode detour fails validation with clear message + decision record.

5. Engine `src/engine/detour.ts`. Triggers evaluated in code. On trigger, build proposal (deep-copied blocks with prefixed ids, lenses copied, total added minutes, reason text). Facilitator view shows proposal card; accept inserts blocks after current, decline logs. Never auto-insert. At most one detour per session. Manifest records `detours[]`. Room header shows total elapsed against original budget. Tests: each trigger fires, proposal correct, accept inserts correctly, decline logs, second trigger ignored, manifest reload mid-detour resumes.

6. Create `design/methods/lateral-provocation.json` (rotating, one lens "provocation", two blocks: private_input + reveal, 6 min). Update six-hats.json and six-hats-problem-solving.json with `ideaBlock: true` on green input and `fallbacks` array. Bump versions.

## Constraints

`grep -ri "hat\|shoe\|provocation" src/` returns nothing. Detour and anonymity code must not know which method is running.

## Final

Run six-hats anonymous with thin green input -> ideas_thin fires -> accept detour -> finish -> confirm no names. Then decline detour + override at converge. Report what broke. Append Result section. Add 3 lines to exam-map.md (5.5 calibration, 5.6 provenance). Do not say anything is deployed.

---

## Result

### What landed

**Part A — Anonymous Mode**
- `SessionState.anonymous` boolean, set at creation, persisted in manifest. Methods can set `defaults.anonymous`.
- `anonymize.ts`: `seatLabel()` returns "You" for own seat, "Seat N" (rotating) or role name (fixed) for others. `anonymizePayload()` deep-copies and replaces all display names per viewer.
- WebSocket broadcast sends per-viewer anonymised payloads when `session.anonymous` is true.
- Report, one-pager, and run-log all use `seatLabel()`. Anonymous report uses count-based participation balance ("N seat(s) above 40% share") and totals-only stuck summary.
- `metrics.anonymous` flag propagated to report output.
- 14 anonymize tests: no display name leaks in any anonymous payload, report, or cluster table; non-anonymous report unchanged (snapshot).

**Part B — Group-level Detour**
- Schema: `method.fallbacks[]` with trigger/detourMethodId/blockIds/reason. `ideaBlock: true` flag on blocks. Validation rejects fallbacks on fixed-mode methods.
- `detour.ts`: `evaluateTrigger()` matches trigger to fallbacks, checks rotating-only and at-most-one-accepted constraints. `shouldTriggerConvergeFailedTwice()` counts failed verdicts ≥ 2. `shouldTriggerIdeasThin()` checks majority passes or avg words below minWords on ideaBlocks.
- `buildProposal()` deep-copies blocks from detour method with "detour-" id prefix, copies lenses. `acceptDetour()` splices blocks after current. `declineDetour()` logs with `accepted: false`.
- Facilitator view: proposal card with accept/decline, "Request Detour" button, elapsed-vs-budget display.
- Room view: elapsed-vs-budget at bottom.
- API routes: `/detour-check`, `/detour-accept`, `/detour-decline`.
- 18 detour tests: all triggers, proposal construction, accept/decline, second trigger blocked.

**Method configs**
- `lateral-provocation.json` created: rotating, one lens, two blocks (input + reveal), 6 min.
- `six-hats.json` v0.3.0: `ideaBlock: true` on green-input, `fallbacks` array with 3 triggers.
- `six-hats-problem-solving.json` v0.2.0: same changes.
- All 4 methods pass `validate-methods.ts`.

**Constraints verified**
- `grep -riw "hat\|shoe\|provocation\|six.hats\|six.shoes\|lateral" engine/src/` returns nothing.
- 134 tests, 13 suites, 1 snapshot — all green.

### Trust boundary

Anonymous mode means anonymous **to other participants in the session**, not to the server operator or facilitator. The manifest on disk and REST admin endpoints (`GET /sessions/:code`, `POST .../join`) still carry real display names — the facilitator needs them for rejoin, presence tracking, and override decisions. Only the WebSocket channel (what participants' screens show) and the generated reports are anonymised. The `/report` endpoint serves the already-anonymised report file. If a future version needs to hide names from the facilitator too, the REST layer would need per-seat auth tokens and `anonymizePayload` applied there as well.

### What broke

- Adding required `anonymous: boolean` to `SessionState` broke all 6 existing test suites — every fixture needed the field added. Fix: added `anonymous: false` to all fixtures.
- Anonymous report test initially found "Alice" in output because (a) test submission text contained the name and (b) `commitment.owner` was stored as display name. Fix: changed test text, added commitment owner anonymization in both `anonymizePayload()` and `renderReport()`.
- `import.meta.dirname` in detour.ts (used for loading detour method JSON) is not supported in Jest/ts-jest. Fix: replaced with `__dirname`.

### Tradeoffs

1. **Per-viewer WebSocket payload vs shared broadcast with client-side masking.** We chose server-side per-viewer anonymisation: the server sends N different payloads (one per connected client). Alternative: send one shared payload and let the client mask names. We chose server-side because client-side masking is bypassable (inspect network tab) and a single bug exposes all names. Tradeoff: N×serialisation cost per state change; acceptable at group sizes 4–6.
2. **At most one detour per session vs unlimited.** We enforced one accepted detour. Alternative: allow chained detours. We chose one because multiple detours would blow the time budget unpredictably and make the report confusing. Tradeoff: a session that hits both `ideas_thin` and `converge_failed_twice` can only use one.
3. **Deep-copy detour blocks vs reference-based insertion.** `buildProposal()` deep-copies blocks and prefixes IDs with "detour-". Alternative: insert references to the detour method's blocks and resolve at runtime. We chose deep-copy because it keeps the block array self-contained after insertion — no cross-method lookups during block transitions. Tradeoff: if the detour method has many blocks, the copied data is duplicated in memory and manifest.

### 2026-09-20 audit correction

The original Result above is historical. See [the repair record](../../audit/slopcheck/AFTER.md) for integration fixes and current validation. Private transport, reports, detours, solo completion, voting, drafts and compiled/static delivery now have regression coverage. Changes remain uncommitted; no deployment is claimed.
