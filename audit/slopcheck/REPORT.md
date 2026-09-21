# Slopcheck audit — 2026-09-20 (Asia/Taipei)

The project has useful modular code and a passing unit suite, but substantial complexity in browser rendering and several unfinished integrations. Fix the behavioral failures before pursuing a lower complexity score.

This is an audit, not a refactor. Application source, prompts, and dependencies were not edited. Findings describe the existing working tree, which already contained extensive uncommitted changes.

## Scope and method

- Read `CLAUDE.md` first, then engine/design context, the specification, and numbered build prompts. Requirements explicitly deferred in the prompts, including the model-based Synthesizer, are not treated as missing work.
- Used [godagoo/slopcheck-deslop](https://github.com/godagoo/slopcheck-deslop) at commit `e47e7d6b1b242038b0d92aad407f417ec2cfbd3a`. Its source was not modified. Tool dependencies and a local Bun executable are isolated under `.audit-tools/`.
- Project HEAD: `ac93777b8a70170c7d103f44ab0f5111118a66b3`, plus the existing modified/untracked working tree. Upstream JSON reports have `gitSha: null`; this audit records the independently retrieved hashes here.
- Ran upstream CLI baselines on `engine` and `engine/src`, using default **named** callables and CC cutoff **10**. Used `--no-clones` because upstream invokes `bunx`; ran local jscpd 5.3.0 separately. No baseline for a pristine historical revision was measured.
- Measured inline JavaScript from all eight HTML views separately with upstream's unchanged collector. Extraction preserves original HTML line numbers. This is supplemental coverage: upstream's normal `.ts`/`.tsx` scan does not see these scripts.
- Ran the upstream 11-rule TypeScript pack and normalized jscpd's Windows paths before computing the TS-only flagged/clone line union. Generated recordings, dependency code, and build output are not part of source metrics.
- Reproduced selected behavior using isolated fixture sessions, a local source server, and the compiled Node entry point. No model requests were made. These probes are not a full browser or deployment test.

## Measurements

| Scope | Named functions | CC > 10 | Erosion |
|---|---:|---:|---:|
| Engine TypeScript, including scripts/tests | 236 | 13 | 0.4406 |
| Source TypeScript only, 26 files | 183 | 13 | 0.4659 |
| Inline JavaScript, eight HTML views | 102 | 17 | 0.8002 |

Erosion is the share of complexity mass in functions above CC 10. It is **not a percentage of defective code**, an AI-authorship detector, or a pass/fail threshold. Compare future results within the same scope and callable definition.

The TS rule pack found 41 explicit `any` occurrences, three async functions without await, three nested ternaries, and one explicit boolean comparison. Its flagged/clone union is **449 / 4,777 lines (9.40%)**, including 377 unique clone-covered TS lines. These are candidates for review, not 48 proven bugs. In particular, returning a Promise from an async function is not inherently incorrect.

Standalone jscpd reports **61 exact clone pairs**, with its own duplicated-line statistic **490 / 8,319 (5.89%)** across TS and HTML. That statistic counts a different scope and uses different duplicate accounting from the TS union; do not equate the two.

### Main complexity hotspots

| Function | Location | CC | Source lines |
|---|---|---:|---:|
| `render` | [facilitate.html](../../engine/src/web/views/facilitate.html#L167) | 71 | 180 |
| `encodeQr` | [start.html](../../engine/src/web/views/start.html#L518) | 60 | 144 |
| `renderReport` | [report.ts](../../engine/src/engine/report.ts#L16) | 53 | 184 |
| `buildContentHTML` | [walkthrough.html](../../engine/src/web/views/walkthrough.html#L416) | 48 | 129 |
| `render` | [join.html](../../engine/src/web/views/join.html#L184) | 32 | 63 |
| `render` | [room.html](../../engine/src/web/views/room.html#L97) | 31 | 58 |
| `generateOnePager` | [artifact.ts](../../engine/src/web/artifact.ts#L17) | 23 | 55 |
| `extractSteps` | [walkthrough-steps.ts](../../engine/src/engine/walkthrough-steps.ts#L121) | 21 | 145 |

The QR feature and self-contained pages were explicitly requested in prompt 11b/09. Their existence is not scope creep. The handwritten QR algorithm deserves separate correctness tests; its complexity score alone does not establish a defect. Split rendering into coherent per-block/section functions without introducing a framework or breaking standalone pages.

## Confirmed findings, in repair order

### 1. High — private answers are transmitted before reveal

[main.ts:157](../../engine/src/main.ts#L157), [main.ts:174](../../engine/src/main.ts#L174), [anonymize.ts:35](../../engine/src/engine/anonymize.ts#L35).

WebSocket payloads contain the full session, with only selected names replaced in anonymous mode. A live probe connected seat 2, submitted from seat 1 while the other three participants had not submitted, and received seat 1's complete text while still on `white-input`. Hiding it in HTML does not provide the private-input behavior required by SPEC §3.3. The full method is also transmitted, including other roles' hidden briefs.

Build a server-side viewer projection that withholds other seats' private answers and role secrets until the appropriate phase. This is separate from prompt 07's explicitly documented unauthenticated REST/admin boundary; the failure occurs on the ordinary participant WebSocket itself.

### 2. High — the compiled entry point reports healthy but cannot serve the app

[main.ts:20](../../engine/src/main.ts#L20), [main.ts:84](../../engine/src/main.ts#L84), [package.json](../../engine/package.json).

After `npm run build`, launching the same entry point used by `npm start` returned health **200**, home **404**, and methods **500**. `engineDir` becomes `engine/dist`, so methods are sought under `engine/design/methods`, while HTML is sought under `engine/dist/src/web/views`. TypeScript compilation does not copy the HTML files. The source entry point returned 200 for all three requests.

Define asset roots that work in the built package and copy required assets during build. Include a compiled-runtime smoke test; a successful `tsc` and health check currently mask this failure. Docker was inspected but not built in this audit.

### 3. High — a detour changes other rooms and cannot be reconstructed on restart

[store.ts:103](../../engine/src/engine/store.ts#L103), [detour.ts:130](../../engine/src/engine/detour.ts#L130), [store.ts:579](../../engine/src/engine/store.ts#L579).

Methods are cached by method ID; `acceptDetour` splices the cached block array in place. A two-room probe confirmed that accepting a detour in room A adds it to room B. Calling acceptance again with the same proposal adds a second accepted detour despite the documented cap. The manifest records inserted IDs, not the inserted definitions or enough reconstruction information, and recovery reloads the original method without rebuilding the detour. A resumed detour block therefore has no matching block definition.

Keep session-specific method state, enforce the cap when accepting, and persist/reconstruct the effective block sequence. Also wire the two automatic trigger predicates: they are imported into the store but never invoked there; `evaluateTrigger` only selects a configured trigger.

### 4. High — completion skips reports; downloading a generated report throws

[session.ts:88](../../engine/src/engine/session.ts#L88), [artifact.ts:84](../../engine/src/web/artifact.ts#L84), [api.ts:372](../../engine/src/web/api.ts#L372).

Submitting a commitment completes the session by stepping over the automatic artifact block, without calling its generator. A probe reached `status: complete` with no artifacts. Explicit generation writes the files and updates the in-memory session, but does not save those artifact paths back to the manifest. The download endpoint then returns **500: `ReferenceError: require is not defined`** in the ESM source server.

Wire generation into the completion lifecycle, persist its result, and use ESM imports in the download route. Verify completion through an actual download, as prompt 06a requires.

### 5. High — anonymous one-pagers still contain the real commitment owner

[artifact.ts:17](../../engine/src/web/artifact.ts#L17), [store.ts:223](../../engine/src/engine/store.ts#L223).

The one-pager writes `commitment.owner` directly, and also prints the commit submission containing `JSON.stringify(data)`. With an anonymous fixture, the generated document contained `Audit Alice`. The WebSocket anonymizer likewise leaves the serialized commitment submission untouched. This is a structured identity leak, not a name voluntarily mentioned in free-form prose. Prompt 07 explicitly requires both reports to be anonymous.

Apply consistent identity projection to all structured output paths, including commit submissions and the legacy one-pager. Tests currently exercising the full report do not cover this separate renderer.

### 6. High — solo flow is only partially connected

[start.html:375](../../engine/src/web/views/start.html#L375), [join.html:80](../../engine/src/web/views/join.html#L80), [store.ts:59](../../engine/src/engine/store.ts#L59), [join.html:417](../../engine/src/web/views/join.html#L417).

Start joins as `You` and redirects with `?seat=seat-1`, but the participant script ignores that query and initializes `mySeat = null`; the name form appears again. Separately, solo reveal builds clusters from the newly entered reveal record's empty submissions rather than its `sourceBlockId`. The probe confirmed one source answer and zero clusters. The requested no-key rubric self-check is also absent: converge always offers Request Review and no solo self-check path.

Complete the seat handoff, source-answer lookup, and deterministic no-key solo convergence. Test the full start-to-report flow, not just one-seat gate functions.

### 7. Medium — visible clocks have no ticking update path

[main.ts:201](../../engine/src/main.ts#L201), [join.html:144](../../engine/src/web/views/join.html#L144), [join.html:208](../../engine/src/web/views/join.html#L208).

The server checks timeouts each second, but broadcasts only when state changes. Clients render the received `remainingSec` without a countdown, and their calculated `serverOffset` is unused. A quiet running session produced zero clock state updates during a 2.2-second probe. Server timeouts still happen; the displayed countdown can sit unchanged until another event.

Either broadcast clock ticks or derive the display from a server-provided deadline, respecting pause/resume. Keep gate decisions on the server.

### 8. Medium — reviewer evidence accepts the rubric itself

[reviewer.ts:126](../../engine/src/agents/reviewer.ts#L126).

`verifyEvidence` searches the entire reviewer input, including rubric instructions and worked illustrations. A probe quoted a criterion's own text for a score of 2 and passed verification. Prompt 04 restricts evidence to the actual decision or reveal content.

Build a separate evidence corpus containing only the allowed session content. Validate every criterion against that corpus; rubric examples are instructions, not evidence about this session.

## Further concrete drift and cleanup

- **Commit validation:** the commitment probe accepted `dueDate: 'not-a-date'`. The store/gate only check truthiness, despite the spec requiring schema validation and a participant owner.
- **Voting:** prompt 04 requests one vote per present seat, a majority, and tie handling. `submitDecision` directly overwrites the global decision with each request; no tally selects a winner.
- **Drafts:** prompt 02/spec require timeout submission of existing drafts. Typing messages carry no draft text and `checkTimeouts` stores an empty string. Separately, `join.html` keeps one global `draftText`, never resets it by block, and restores it into later input blocks.
- **Identity seam:** `getParticipantIdentity` exists but has no callers in `src`; the account seam promised in prompt 11b is unused. Either wire it consistently or correct the completion claim.
- **Duplication:** similar rendering/reporting paths have diverged, as shown by anonymous full-report vs one-pager behavior. Repeated REST try/catch/`any` handling is a smaller cleanup target; use typed boundary validation and consistent error handling rather than cosmetic wrapper layers.
- **Prompt overfitting:** `client.ts:71` assembles the OpenRouter `chat/completions` URL from fragments to avoid a substring grep matching `hat`. The architecture rule is about method knowledge, not English substrings. Restore a readable URL and use a precise check for actual method-specific identifiers.
- **Documentation:** engine context stops at prompt 09 although prompts 11b/12 landed; design context still names prompt 06 as next. Several Result sections overstate integration completion. The absent 06b Synthesizer is documented as deferred and is not a finding.
- **Test blind spots:** scenario simulation catches errors and can force advancement, so scenario completion does not prove live gates/UI behavior. Existing tests largely cover pure modules; they missed the compiled launch, WebSocket privacy, artifact lifecycle, and real solo handoff above.

## Validation and artifacts

Completed checks:

- `npm test -- --runInBand`: **166 tests, 19 suites, one snapshot passed**.
- `npm run build`: passed.
- `npm run validate`: all **four methods and 14 scenarios** passed.
- [reproduce.mjs](reproduce.mjs): seven probes confirmed the recorded defects, with [JSON results](reproduction-results.json).
- [runtime-smoke.mjs](runtime-smoke.mjs): compiled/source HTTP checks, live WebSocket privacy check, clock traffic observation, and ESM download failure; [JSON results](runtime-results.json).

Measurements: [source baseline](src.json), [engine baseline](engine.json), [supplemental metrics](supplemental.json), and [clone report](clones/jscpd-report.json). Fixture manifests and local tooling are ignored by Git. The probes deliberately assert current broken behavior to preserve audit evidence; they are not regression tests asserting desired behavior.

Re-run from the repository root in PowerShell after building the engine:

```powershell
node audit/slopcheck/reproduce.mjs
node audit/slopcheck/runtime-smoke.mjs
& ./.audit-tools/slopcheck-deslop/node_modules/@oven/bun-windows-x64/bin/bun.exe audit/slopcheck/measure.ts
```

`measure.ts` consumes the saved clone report. Refresh the upstream baselines and clones from `.audit-tools/slopcheck-deslop` before comparing later source changes:

```powershell
& ./node_modules/@oven/bun-windows-x64/bin/bun.exe cli.ts baseline ../../engine ../../engine/src --no-clones --out=../../audit/slopcheck
& ./node_modules/.bin/jscpd.cmd ../../engine/src --reporters json --output ../../audit/slopcheck/clones --min-lines 5 --silent
```

Recommended order: repair privacy, compiled launch, and session isolation first; complete report and solo flows next; then simplify the render/report hotspots with behavior coverage. Preserve method-agnostic configuration, deterministic gates, self-contained pages, and the documented no-auth/no-database scope.
