# Thinking-method catalog migration — 2026-09-20

Implemented the user's request to replace the active workflows with the six methods in [the supplied guidance](../thinking-methods-app-copyright-guidance.md).

## Active catalog

| Method | Config | New fictional walkthrough |
|---|---|---|
| Pros-and-cons analysis | `methods/pros-cons.json` | An extra evening at the garden |
| Five Whys | `methods/five-whys.json` | Feedback waits in the queue |
| Cause-and-effect / fishbone analysis | `methods/fishbone-analysis.json` | Tool kits return incomplete |
| Decision matrix | `methods/decision-matrix.json` | One feature for the volunteer portal |
| Brainstorming with prioritization | `methods/brainstorming-prioritization.json` | A quieter museum evening |
| Hypothesis testing | `methods/hypothesis-testing.json` | Does a clearer course title help? |

Each method has its own sequence, original instructions, private helper prompts, examples, review criteria and narration. These are new workflows rather than renamed stages from the previous catalog. All six work with solo self-check or group voting/review. Previous round content is available during later input and convergence so participants can follow causal links, retain criteria and compare alternatives.

Five Whys explicitly allows an evidence gap instead of an invented cause. Fishbone branches are possible causal links organized by category. The matrix uses weights totaling 100, anchored scores and a worked sensitivity calculation. Hypothesis testing distinguishes a proposed experiment from collected results. Fishbone maps and matrices are currently textual worksheets; this migration does not add a graphical diagram editor or automatic matrix calculator.

The old configs, 14 demonstrations and old shell smoke scripts are preserved in `archive/retired-method-content/`, outside the served directories. Existing session manifests and reports were not rewritten. Saved method snapshots still support existing sessions; legacy sessions whose methods are unavailable are skipped on recovery with a warning rather than preventing startup. Their files remain on disk.

Application builds copy only current methods, scenarios and schemas. Static rebuilds clear generated files before publishing the six new walkthroughs and twelve recording files. The method cache refreshes with the active directory. Retired method/recording URLs and retired walkthrough URLs return 404. Navigation uses a compact method menu that fits mobile screens.

## Validation

- `npm run validate`: six methods and six scenarios pass schema/reference checks.
- All six scenarios were recorded through actual session gates with scripted model responses.
- `npm test -- --runInBand`: 195 tests across 21 suites pass, including catalog isolation, absence of retired content and completion/report generation for every new method.
- `npm run build` and `npm run build:site`: pass.
- `npm run test:e2e`: compiled catalog and all six live/static method pages; mobile navigation; solo completion/report download; group WebSocket privacy and draft reload; retired URLs unavailable; zero browser page errors.

No third-party teaching text, worksheet, diagram or logo was imported for this migration. No legal clearance, live model-provider validation or remote deployment is claimed. Changes are uncommitted in the existing working tree.
