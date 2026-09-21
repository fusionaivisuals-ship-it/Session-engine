# session-engine — Specification v0.1

Last updated: 2026-09-17. Status: draft for review before engine build (prompt 02).

## 1. Purpose and v1 scope

A group of 4–6 people, in one room or on a video call, works through a hard problem using a structured thinking method under a visible clock. The system enforces the order, times each step, keeps individual thinking private until everyone has committed, coaches anyone who is stuck, reviews the group's output against a rubric, and produces a one-page result plus a session report.

The current catalog delivers six methods: pros-and-cons analysis, Five Whys, cause-and-effect (fishbone) analysis, decision matrix, brainstorming with prioritization, and hypothesis testing. Each has original instructional copy, helpers, rubrics and fictional walkthroughs. Sessions run as a local Node service with a browser UI reachable by room code, in solo or facilitated group mode. No accounts, no database.

Out of scope for v1: multiple tables competing, async sessions over days, video/audio, billing, method editor UI.

## 2. Concepts

- **Method**: a JSON config describing roles, blocks, timings, helper prompts and reviewer rubrics. The engine reads it; it never hard-codes any of it.
- **Session**: one run of one method with one group. Identified by a room code. Has a state machine, a clock, participants, submissions, metrics, and a manifest on disk.
- **Block**: one step of the session. Exactly one block is active at a time. There are seven block types (§3). A method is an ordered list of blocks.
- **Participant**: a person with a display name and a seat. **Facilitator**: the human running the session; has override powers (§8). The facilitator may also be a participant.
- **Role**: a lens a participant thinks through. Two role modes (§5): *rotating* (the block sets the reasoning task for everyone) and *fixed* (each seat keeps a role for the session; generic stakeholder role-play).
- **Submission**: one participant's answer inside one block. Immutable once submitted.
- **Gate**: the code-enforced condition that lets the session advance from one block to the next.

## 3. Block types

Each block has: `id`, `type`, `title`, `timeboxSec`, `completion` (§3.8), optional `lens` (rotating mode), optional `helper` and `reviewer` sections, optional `stuck` overrides. Screen behaviour per type:

### 3.1 frame
Group agrees one problem sentence. Screen: a shared text field the facilitator edits, a live "agree" count. Helper offers a rewrite if the sentence contains more than one problem or no subject. Completes when all participants have agreed, or facilitator override. Output: `problemStatement`.

### 3.2 assign
Roles are dealt to seats. `strategy`: `random`, `choose` (first come), or `facilitator`. Screen: each participant sees their role card and a one-paragraph brief; hidden briefs are shown only to the holder. Completes when every seat has a role. Omitted in rotating-mode methods. Output: `seatRoles`.

### 3.3 private_input
Each participant answers the block's prompt alone through their current lens. Screen: prompt, lens reminder, text area, submit button, own timer, "I'm stuck" button. Nobody sees anyone else's input. Completes when all participants have submitted, or the clock runs out (unsubmitted drafts are auto-submitted as-is and flagged `autoSubmitted`). Output: one submission per participant.

### 3.4 reveal
The AI groups responses by topic while retaining outliers and unresolved disagreements. Every theme links to the original responses; omitted responses remain visible separately. Themes do not imply consensus. Screen: themes, originals, disagreements, and one "I've read this" button per participant. Completes when all have confirmed or the clock runs out. Output: `clusters[]`, `disagreements[]`, `agreements[]`.

### 3.5 converge
The group chooses one option through voting. The reviewer provides advisory feedback labeled “Ready to act” or “Needs attention”; a review alone never advances the session. The solo participant or group facilitator deliberately accepts the current decision. Proceeding without a review or despite concerns requires a recorded reason. A favorable review still requires acknowledgment. Solo self-check remains a deliberate alternative without a model key. An expired decision timer does not accept a decision. Revised votes invalidate earlier advice for acceptance while preserving review history.

Criterion feedback separates missing evidence, weak reasoning, and contradiction, with an explanation and quoted support where available. Every active method criterion defines concrete 0/1/2 scoring anchors. Quotation checks establish that text exists, not that the interpretation is sound. Missing evidence is not evidence that a proposal is false.

### 3.6 commit
Structured form: `owner` (a participant), `firstAction` (one sentence), `dueDate`, `successSignal` (how they'll know it worked). Completes on valid submission. Output: `commitment`.

### 3.7 artifact
No participant input. The Synthesizer generates the one-pager (problem, what each lens said, decision, commitment) and the session report (§10). Screen: download links, "session complete". Completes automatically.

### 3.8 completion rules (vocabulary)
`all_submitted`, `all_confirmed`, `all_agreed`, `all_assigned`, `reviewer_pass`, `valid_form`, `auto`. Every rule also accepts `timeout` (clock ran out) and `facilitator_override` as alternative exits, and the exit reason is recorded in metrics. `reviewer_pass` accepts override only with a typed reason.

## 4. Timer rules

- The server clock is authoritative. Clients display it; they never decide it.
- Each block has `timeboxSec`. At 20% remaining the screen turns amber; at zero the block's timeout exit fires.
- The facilitator can grant one extension per block, of `extensionSec` (method default 60). A second extension is not available; the facilitator can instead override the gate.
- The session also has `totalBudgetSec` (informational): the header shows total elapsed against budget so the group sees if they are running long.
- A paused session (facilitator action, or server restart) freezes all clocks; resume continues from the frozen remaining time.

## 5. Role modes

- **rotating** (the six active thinking methods): the block carries `lens` (id, name, one-line instruction). Everyone thinks through that lens at the same time. The `assign` block is omitted. "Role swap" in the stuck ladder becomes "pass with reason" (§6).
- **fixed** (optional stakeholder role-play): the `assign` block deals `roles[]` from the method to seats. Role swap in the stuck ladder swaps the stuck participant's role with a volunteer's or an unused role, capped at one swap per participant per session.

The method declares `roleMode`. The engine branches on that one field; nothing else in the engine is method-aware.

## 6. Stuck ladder

The participant opens "I'm stuck" during private writing, then chooses a question, example, other options, or a direct return to writing. There is no compulsory order. Successful requests are logged. Idle time does not automatically make model calls or consume help options.

1. **Hint** — Helper gives one question in the current lens/role, no example answer.
2. **Worked example** — Helper shows a short example from an unrelated fictional problem in the same lens.
3. **Swap / pass** — fixed mode: role swap (§5). Rotating mode: participant may submit "pass" with a one-line reason; counts as submitted and is flagged.
4. **Facilitator** — the facilitator's screen shows a "needs you" flag on that participant.

The ladder never advances the session on its own. It exists so a stuck person does not stall the gate for everyone else.

## 7. AI roles

Four agents. Each has its own system prompt, isolated context, and a tool set of at most four tools. They communicate only through the session state; none reads another's transcript.

### 7.1 Facilitator (deterministic code, not a model)
Implemented as the existing state machine in `src/engine/`, not as a model call. Owns the block lifecycle: checks gates via `canAdvance()`, calls `advanceBlock()`, logs metrics. Invokes helpers and clustering directly when the block type requires them. Decides nothing creative, so a model would add latency, cost and a failure mode for no gain. See decision record `2026-09-17-facilitator-is-code-helpers-are-single-turn.md`.

### 7.2 Helper (one per participant, per block)
Context it receives: the problem statement, the participant's current lens or role brief, that participant's own prior submissions, nothing from anyone else. Tools: `give_hint`, `give_example`, `suggest_rewrite`. It cannot submit on the participant's behalf.

### 7.3 Reviewer (independent)
Fresh instance with no Helper reasoning in context. Receives the problem, original revealed responses, themes, disagreements, proposal and rubric anchors. Returns structured advisory feedback through `submit_verdict`: scores 0–2, a concern classification (`none`, `missing_evidence`, `weak_reasoning`, `contradiction`), explanation and supporting quotation for each criterion, perspectives to revisit and feedback. The legacy boolean `pass` records the computed score threshold, not permission to proceed. Missing evidence uses score 0 and an empty quote; contradictions require verified quoted support even at score 0. All criteria must appear exactly once. The human acceptance gate is separate from review.

### 7.4 Synthesizer
Receives the session facts block (§9) and produces the one-pager and report through `submit_artifact` with a JSON schema. Renders each content type in its natural shape: decisions as a sentence, lens outputs as a table, metrics as numbers.

### 7.5 Context discipline
Every agent prompt starts with a compact **session facts** block (problem statement, block id, lens/role, timings, prior decisions) rather than a conversation transcript. Tool outputs are trimmed to the fields the agent needs before entering context.

## 8. Gates and enforcement

Advisory refinement (2026-09-20): the legacy `reviewer_pass` completion name is retained for stored configs, but its gate now requires explicit human decision acceptance. Review scores remain advisory. Acceptance records the actor, decision, round, timestamp and reason, and appears in reports.

Reveal themes must keep originals accessible, including omitted/outlier responses and unresolved disagreements. Similar wording alone is not agreement; theme membership is not consensus. Source submissions, not only generated summaries, are supplied to the reviewer.

Personal hints are optional single questions of at most 30 words, without preferred answers. Participants may return directly to writing or independently choose a built-in example or pass. Problem rewrites preserve stakeholders, constraints, uncertainty and solution scope; the UI compares original and suggestion and requires the facilitator to choose and publish any change. The optional solo “What have I missed?” checkpoint is deferred.

- Gates are functions in code: `canAdvance(session, block) -> {ok, reason}`. The deterministic facilitator code calls that function and advances only when it returns true.
- The human facilitator's override is a separate tool path that requires a typed reason and is written to metrics. Prompts never instruct the model to "make sure everyone has submitted"; the gate does.
- The `commit` form is validated by schema before it is accepted.

## 9. Session state and resume

- The whole session is a JSON manifest (`schemas/session-state.schema.json`) written to `sessions/<roomCode>.json` after every state change.
- On server restart the manifest is loaded, clocks resume frozen, participants rejoin by room code plus display name.
- Agents are stateless between blocks; the manifest is the only memory. Nothing depends on a live conversation surviving.

## 10. Metrics and report

Logged automatically: per-block elapsed vs timebox, exit reason per block, per-participant submission time and length, auto-submits, stuck-ladder steps used, swaps or passes, extensions, overrides with reasons, reviewer scores per criterion, time from Frame to Commit.

The report shows: time to committed decision, participation balance (share of words per participant, flagged if one person is above 40% or below 10%), lens coverage (which lenses got substantive input versus token or pass), reviewer verdicts, and the commitment. A 30-day follow-up prompt ("did the first action happen?") is a v2 item; v1 records the due date only.

## 11. In-room and remote

Same build serves both. Requirements that come from remote use and apply everywhere: server-authoritative clock; presence indicator per participant (green/amber/grey by last heartbeat); a participant who drops is not blocking the gate after `presenceTimeoutSec` (default 120) — their seat is marked absent and the facilitator sees it. In-room adds nothing technical; the facilitator projects the room screen.

## 12. Non-goals for v1

No accounts. No persistence beyond JSON files. No multi-table. No method editor. No voice. No integrations to Slack/Teams. No mobile-native app (mobile browser is fine).

### 12.1 Browser presentation (2026-09-20)

The homepage, method pages, setup, participant/facilitator/room workspaces and recorded demonstrations share an editorial visual system: ivory `#F7F6F2`, white surfaces, charcoal `#202824`, secondary text `#626B65`, forest green `#28594B`, thin `#E2E4DE` borders and restrained blue, amber and plum accents. System serif headings and sans-serif controls require no external font requests. Reusable styles and workspace rendering are inlined into built pages so static demonstrations remain self-contained.

The homepage presents the approved method catalog, an explicitly scripted interface preview, Frame → Think privately → Reveal → Decide → Commit, and a fictional decision record. It makes no customer or effectiveness claims.

Active workspaces place session progress below the header, then a 28/72 sidebar/task grid. The circular server-authoritative timer is on the left, followed by participant status and relevant guidance. On mobile these become compact status cards above the task. Current instructions, a labeled writing field, word count, acknowledged draft-save status, help and submission actions occupy the main panel. Same-block updates preserve unfinished form input and keyboard focus. Saved status requires a server acknowledgment for the current block and draft revision.

Private-input views expose other participants' statuses only; existing server projections continue to enforce privacy and anonymity. Demonstrations are labeled as scripted. Walkthrough timeboxes are explicitly recorded values; replay snapshots without clock measurements show no invented countdown. Keyboard focus, form labels, text status and responsive layouts are required throughout. Gates, method definitions, timing rules and provider integrations are unchanged by the presentation layer.

## 13. Cost estimate (flagged per standing rule)

Assumes 1 USD ≈ 32 NTD; I cannot verify today's rate. Model mix: Helper and Synthesizer on a mid-tier model, Reviewer on a stronger one. Rough per-session usage: ~150k input, ~30k output tokens.

| Item | Per session | 20 sessions/month | Yearly |
|---|---|---|---|
| Claude API | ≈ US$0.90 / NT$29 | ≈ US$18 / NT$576 | ≈ US$216 / NT$6,912 |
| Hosting (v1 local) | 0 | 0 | 0 |
| Hosting (v2 small VPS) | — | ≈ US$5–7 / NT$160–224 | ≈ US$60–84 / NT$1,920–2,688 |

All under the US$50/month flag threshold at test volumes. Token figures are estimates until prompt 03 lands and real usage is logged.
