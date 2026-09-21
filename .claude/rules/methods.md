---
paths: ["design/methods/**/*.json"]
---

# Rules for method config files

- Must validate against `design/schemas/method.schema.json`. Run `npm run validate` (once the engine exists) before finishing any edit.
- Use only the seven block types. If a step does not fit, split it into two blocks or add a block option to the schema with a decision record; never invent a type.
- Every `private_input` block needs a `helper.systemPrompt` and a `minWords`. Every `converge` block needs a `rubric` whose criteria are checkable from submitted text alone.
- `examplePool` entries are always about a fictional, unrelated problem. Never reference the group's real problem in an example.
- Sum of `timeboxSec` must sit below `timing.totalBudgetSec` with at least 10 minutes of slack for transitions.
- `sourceBlockId` references must point at earlier blocks in the same file.
- Bump `version` on any change that alters timings, prompts or rubric text.
