# 15 — Advisory AI assistance

Implement the user's refinements: advisory reviews with deliberate, recorded acceptance; missing-evidence versus reasoning concerns and criterion-specific scoring anchors; source-linked clustering that preserves minority views; optional small personal hints; meaning-preserving problem rewrites shown alongside the original. Defer the optional solo checkpoint.

Preserve privacy, anonymity, existing method configuration and no-key solo use. Verify the new gates, review validation, clustering coverage and user-facing actions without paid model calls. See Result below when verification completes.

## Result

Implemented advisory review, explicit human acceptance with persisted reasons, stale-review isolation, protected decision timeouts, classified concerns and scoring anchors for all six methods. Theme cards and reports retain originals and omitted perspectives. Help is optional and rewrites show a comparison before manual application. Scripted recordings reflect human acceptance. The optional solo checkpoint is deferred.

Validation: 202 tests in 21 suites pass; method/scenario validation and runtime/static builds pass. Browser checks cover no-key solo help and self-check, group acceptance, privacy, rewrite comparison/application and desktop/mobile advisory presentation. Reviewer calls use test doubles and scripted fixtures; no paid provider request was made. See `audit/editorial/README.md` from the repository root for screenshots.

Commit: not created. Remote deployment: none.
