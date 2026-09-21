# 05 — Fixed Roles and Second Method

Paste everything below the line into Claude Code from the repo root. Read `design/SPEC.md` first if you are editing this prompt.

---

Read CLAUDE.md, design/CONTEXT.md, design/SPEC.md §3.2, §5, §6, the decision record on seven block types, and .claude/rules/methods.md. Save this prompt as engine/prompts/05-fixed-roles-and-second-method.md. Build one item at a time, tests green before moving on.

0. Reference material. Copy the attached "Thinking Frameworks" markdown into design/frameworks.md. At the bottom add a note: "PDCA, DMAIC and Design Thinking are not suitable for a single timed session because they span weeks or months; they are good meta-frameworks to wrap around multiple sessions." Update design/CONTEXT.md: add frameworks.md to the file list and note that the Synthesizer (prompt 06) is next.

1. assign block (SPEC §3.2, §5). Add handling for `type: 'assign'` in the engine.
   - Strategy `random`: shuffle roles[] and deal one per seat. Strategy `choose`: first come first served via an API call. Strategy `facilitator`: facilitator picks from a dropdown.
   - Each participant object gets `roleId`. The role's `brief` is shown to everyone; `hiddenBrief` is shown only to the holder.
   - Completion: `all_assigned`.
   - Roles persist across blocks — once assigned, the participant's roleId stays for the rest of the session.
   - Tests: random assigns all seats, choose first-come works, all_assigned gate opens after all seats have roleId. At least 4 tests.

2. Role swap in stuck ladder (SPEC §6 step 3, fixed mode). Replace the NotImplemented throw from prompt 03.
   - Swap: pick a partner (volunteer or unassigned role). The two seats exchange roleIds. Cap: one swap per seat per session (`swapsUsed` already exists on participant).
   - Log a `swap` stuck event. The UI shows a swap form when step is 'swap'.
   - Tests: swap exchanges roleIds, cap enforced (second swap throws), swapsUsed incremented, stuck ladder step order in fixed mode is hint → example → swap → facilitator. At least 4 tests.

3. Six Action Shoes config (design/methods/six-shoes.json). roleMode fixed, 6 roles:
   - navy-formal (formal authority), grey-sneakers (investigation), brown-brogues (pragmatism), orange-gumboots (emergency), pink-slippers (empathy), purple-riding-boots (unconventional).
   - Each with brief, hiddenBrief, and matching blocks (private_input → reveal pairs per role focus area, converge with rubric, commit, artifact).
   - Full block sequence with helpers and rubric. npm run validate passes.

4. Six Hats Problem Solving variant (design/methods/six-hats-problem-solving.json). Same lenses as six-hats.json but different block order: white → black → yellow → green → red → blue (facts first, feelings last). roleMode rotating. npm run validate passes.

5. Prove config-only claim. `grep -ri "shoe\|gumboot" src/` returns nothing. `grep -ri "hat" src/` still returns nothing. The engine code is method-agnostic.

When done: run six-shoes.json with 3 tabs (trigger a swap), run six-hats-problem-solving.json to artifact. Report what broke. Append Result section. Update exam-map.md row 05. Do not say anything is deployed.

No new model calls in this slice; the helper from prompt 03 is reused as-is.

---

## Result

**Build complete. All items 0–5 implemented and tested.**

### Test summary
- 9 suites, 75 tests, all green
- TypeScript compiles clean (`npx tsc --noEmit`)
- `grep -ri hat src/` returns nothing
- `grep -ri "shoe\|gumboot" src/` returns nothing
- `npm run validate` passes (3 methods: six-hats, six-shoes, six-hats-problem-solving)

### What was built
0. **Reference material**: `design/frameworks.md` with 8 frameworks (suitable) and 3 (unsuitable: PDCA, DMAIC, Design Thinking). CONTEXT.md updated with file entry and note that Synthesizer is prompt 06.
1. **Assign block**: 3 strategies (`random`, `choose`, `facilitator`). Assigns `roleId` on participant. `all_assigned` gate. Roles persist across blocks. 3 new API routes. UI for both participant and facilitator views. 7 tests.
2. **Role swap**: Replaced `NotImplemented` throw. Separate ladders: `LADDER_ROTATING` (hint→example→pass→facilitator) and `LADDER_FIXED` (hint→example→swap→facilitator). `swapRoles()` exchanges roleIds, increments `swapsUsed`, cap at 1 per seat per session. Swap API route + UI. 4 new tests (ladder order, swapForm, exchange, cap). 14 total stuck tests.
3. **Six Action Shoes** (`six-shoes.json`): roleMode fixed, 6 roles with brief and hiddenBrief, 9 blocks (frame, assign, 2 input/reveal pairs, converge with rubric + 2 examples, commit, artifact). Budget 70 min, block sum 36 min.
4. **Six Hats Problem Solving** (`six-hats-problem-solving.json`): roleMode rotating, same 6 lenses, different order: white→black→yellow→green→red→blue (facts first, feelings last). Budget 65 min, block sum 48 min.
5. **Config-only claim**: Both grep commands return nothing. Adding two new methods required zero code changes.

### E2E validation (localhost, no API key)
- **Six Shoes session (7B67BD)**: Created → 4 participants → frame → assign (random) → all 4 roles dealt correctly → action-input → stuck ladder: hint failed (no API key) → example (pool) → swap → Dave/Carol swapped roles successfully → swapsUsed=1 → second swap rejected (cap) → overridden through remaining blocks → artifact generated.
- **Six Hats Problem Solving session (79217F)**: Created → 4 participants → frame → white-input → white-reveal → black-input (verified facts-first order) → overridden through all blocks → commit → artifact → complete. Block order matches spec: white→black→yellow→green→red→blue.
- No model calls in this slice (as specified). Helper reused from prompt 03.

### What broke
- Stuck ladder hint step logs the event even when the model call fails (no API key). The hint is consumed without delivering anything useful. Pre-existing issue from prompt 03, not introduced in this slice.

### exam-map.md
Row 05 updated with 3 tradeoff notes: separate ladders vs conditional steps, random assign as default vs facilitator choice, config-only method addition vs engine hooks.

No commit hash (not a git repository).
