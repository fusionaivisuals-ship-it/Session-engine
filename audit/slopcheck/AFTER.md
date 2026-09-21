# Audit repair record — 2026-09-20

The original REPORT.md and reproduction JSON files preserve the pre-repair evidence. Their probes intentionally assert broken behavior; use the regression suite and browser test to validate the repaired application.

## Corrections

All eight confirmed behavioral findings have corresponding fixes:

1. WebSocket projections withhold other seats' private answers, drafts and hidden role briefs. Internal method snapshots are removed from transport.
2. Compiled builds include views, method/scenario assets and the run-log template. Runtime paths work from the built entry point. Docker now uses the repository-root build context.
3. Detours use persisted per-session method snapshots, enforce one acceptance and evaluate real trigger predicates.
4. Completion creates reports and persists paths; ESM download routes serve both report formats.
5. Anonymous reports and serialized commitment submissions project the commitment owner consistently.
6. Solo seat handoff, source-answer reveal and no-key rubric self-check complete the start-to-report flow.
7. Clock-only WebSocket updates tick without replacing draft inputs. Recovery freezes at the saved checkpoint, excluding downtime (up to one second between periodic checkpoints).
8. Reviewer evidence is checked only against decision/reveal content, excluding rubric instructions and examples.

Additional corrections: validated commitment date and participant owner; per-seat votes, majority and tie resolution; block-specific persisted drafts and timeout submission; identity helper integration; consistent REST error handling; readable OpenRouter URL; typed/session-local scripted model routing; strict scenario simulation; updated manifest schema and static inline data escaping.

The handwritten QR encoder was replaced by pinned qrcode-generator 2.0.4, retaining its MIT notice in the standalone page. Independent jsQR tests decode short and long URLs. Rendering/report sections were extracted into focused functions without adding a frontend framework. Some complex renderers remain; a complexity warning alone is not a behavioral defect.

Scenario fixtures previously quoted paraphrases as evidence. Positive evidence now uses actual decision text, and all 14 recordings were regenerated through strict simulation. Replay snapshots use anonymous public projections and report-generation errors fail recording.

## Verification

- All 186 automated tests in 20 suites pass, covering privacy, detour isolation/recovery, anonymous artifacts, validation, voting, solo self-check, drafts, reviewer evidence, QR decoding, inline-script syntax and restart clocks.
- Browser test (`npm run test:e2e`) launches the compiled server and exercises full solo completion/report download, facilitator seat handoff, live group privacy, draft reload and standalone file-based pages with no page errors.
- All 14 scenarios complete without silent forced advancement.
- Method/scenario validation and both application/static builds are checked locally.

Docker is corrected by inspection but cannot be built here because Docker is unavailable. Live model-provider calls and remote deployment were not tested. The documented no-auth boundary remains; this repair does not add authentication.

## Measurements

Preserved original baselines are alongside REPORT.md; supplemental measurements are in `after/` and final TypeScript baselines in `after-final/`. Source TypeScript erosion fell from 0.4659 to 0.3436; owned inline JavaScript from 0.8002 to 0.7090. Explicit-any rule hits fell from 41 to 10. These are diagnostic measures, not claims that the code is defect-free. New inline metrics exclude the identified third-party vendor script; clone percentages include a changed denominator and should not be compared directly.

Changes are in the working tree, not a new commit. Existing unrelated edits were preserved.
