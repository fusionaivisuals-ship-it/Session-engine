# 2026-09-17 — Facilitator agent is deterministic code; helpers are single-turn forced tool_use calls

## Decision
1. The "Facilitator agent" described in SPEC 7.1 is implemented as deterministic code (the existing state machine in `src/engine/`), not as a model call. It spawns nothing; the engine calls helpers and clustering directly when the block type requires them.
2. All model calls in this slice (Helper, Cluster) are single-turn, forced `tool_use` calls on the Anthropic Messages API (`@anthropic-ai/sdk`). Each call sends a JSON schema as a tool definition and forces `tool_choice: {type: "tool", name}`. The response is validated against the schema; on validation failure, one retry is attempted with the error appended.
3. The Agent SDK is deferred to prompt 05 (Synthesizer), where multi-turn orchestration and tool routing justify the extra abstraction.

## Why
- The Facilitator decides nothing creative. Its job is: check the gate, advance the block, log metrics. A model call would add 1-2 s latency, ~500 tokens of cost, and a failure mode (hallucinated advance, schema mismatch) for zero gain. Deterministic code is faster, cheaper, and testable with plain unit tests.
- Helpers need structured output (a hint, an example, a rewrite) not a conversation. Forced tool_use with a schema guarantees the shape. A single turn is sufficient because the helper sees the session-facts block, the block prompt, and the participant's draft — enough context to produce one useful nudge.
- The retry-with-error-feedback pattern (append the validation error as a user message, call again) gives the model a second chance to fix a schema violation without adding conversational state management.
- The Agent SDK adds dependency weight, opinionated tool routing, and multi-turn loop logic that none of these calls need yet. Pulling it in now would be premature abstraction.

## Alternatives rejected
- Model-based facilitator: rejected; deterministic code is strictly better for a non-creative coordinator. See reasoning above.
- Multi-turn agent loop for helpers: rejected; one turn is enough, and a loop risks the helper "chatting" with itself or producing multiple outputs when exactly one is needed.
- Agent SDK now: rejected; deferred to prompt 05 where the Synthesizer's multi-step artifact generation justifies it.

## Revisit when
- A helper needs to ask the participant a clarifying question before giving a hint (would require multi-turn).
- The Synthesizer slice (prompt 05) reveals that the Agent SDK should have been adopted earlier.
