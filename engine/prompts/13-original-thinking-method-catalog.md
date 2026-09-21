# 13 — Replace the active thinking-method catalog

## User request

Replace the current workflows with those in `thinking-methods-app-copyright-guidance.md`. Continue through implementation and verification.

## Implementation constraints

- Read CLAUDE.md, design/engine context, the specification and the supplied guidance first.
- Implement the six named methods using original prompts, instructions, examples and rubrics.
- Change actual reasoning sequences, not only names. Preserve the method-agnostic engine and deterministic gates.
- Update scenarios, walkthroughs, navigation, current documentation and tests.
- Preserve retired working-tree content outside published assets. Refresh generated assets so removed methods do not remain available.
- Make no claim that this implementation is legally cleared or deployed.

## Result

Six original method configs and six fictional scenarios replace the active catalog. Walkthrough/replay recordings were regenerated. Earlier-round context supports multi-stage reasoning. Build cleanup and catalog refresh remove stale public content; historical materials remain in an offline archive.

195 tests in 21 suites pass. All method/scenario validation, application/static builds and compiled browser checks pass. Matrix calculations and fishbone branches are recorded in text; no graphical editor or automatic calculator was added. See [the complete migration record](../../design/CATALOG_MIGRATION.md).

Commit: not created; changes are in the working tree. Deployment: none.
