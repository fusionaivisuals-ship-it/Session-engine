# session-engine

A timed, gated, AI-facilitated group workshop engine for team building and hard-problem solving. Methods (pros-and-cons, Five Whys, fishbone, decision matrix, brainstorming and hypothesis testing) are config files; the engine is method-agnostic. Doubles as hands-on prep for the Claude Certified Architect – Foundations exam.

## Workspaces
- /design — spec, block and method schemas, method configs, decisions, exam map
- /engine — the running code (Node service + web UI), build prompts in order
- /sessions — facilitator notes, run logs, generated reports from real sessions

## Routing
| Task | Go to | Read | Skills |
|------|-------|------|--------|
| Change how a method or block works | /design | CONTEXT.md, SPEC.md | — |
| Add or edit a thinking method | /design/methods | CONTEXT.md, schemas/method.schema.json | — |
| Build or fix engine code | /engine | CONTEXT.md, ../design/SPEC.md | — |
| Write the next build prompt | /engine/prompts | CONTEXT.md | — |
| Run, review or report on a session | /sessions | CONTEXT.md | — |
| Map work to exam domains | /design | exam-map.md | — |

## Naming conventions
- Method configs: `method-name.json` (kebab-case, matches `id` inside)
- Build prompts: `NN-short-name.md`, numbered in build order
- Decisions: `YYYY-MM-DD-decision-title.md`
- Session logs: `YYYY-MM-DD-group-method.md`
- Versions: `name_v2.md`

## Rules
- Read this file first, then follow the routing table.
- Engine never contains method knowledge (no method-specific reasoning rules in code). If it needs to, the schema is missing something: fix the schema.
- Gates are enforced in code (hooks), never by asking the model nicely. Reason: prompt compliance has a non-zero failure rate.
- One build prompt = one deployable, testable slice. Do not start prompt N+1 until N runs end to end.
- Lightest setup: no auth, no database. Room code + display name; state in memory plus a JSON manifest on disk.
- Any recurring cost over about US$50 gets flagged before building.
