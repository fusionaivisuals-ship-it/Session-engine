# 2026-09-17 — Seven fixed block types; Six Hats runs in rotating role mode

## Decision
1. Every method is assembled from exactly seven block types: frame, assign, private_input, reveal, converge, commit, artifact. New behaviour is a block option, not a new type.
2. Six Hats uses `roleMode: rotating` (the block sets everyone's hat; there is no assign block). Fixed roles arrive with the second method (Six Shoes) in build prompt 06.

## Why
- The inspiration (a gated partner workshop seen at a conference) worked because the steps were few and rigid. A method editor that allows arbitrary steps recreates the "form wizard with a chatbot" failure. Seven types is enough to express Six Hats, Six Shoes, retros and stakeholder role-play on paper; if a method needs an eighth, that is a signal to rethink the method.
- Canonical de Bono is parallel thinking: everyone wears the same hat at the same time. Assigning one hat per person is a common variant but loses the method's main point (no adversarial positions). Rotating mode is also simpler to build first: no dealing, no hidden briefs, no swaps.
- Consequence accepted: in rotating mode the stuck ladder's "role swap" step becomes "pass with reason". Swaps only exist in fixed mode.

## Alternatives rejected
- Free-form step list per method: rejected, see above.
- Six Hats with assigned hats as v1: rejected; it would make the first config non-canonical and push fixed-mode complexity into prompt 02.

## Revisit when
- A third method cannot be expressed with seven types.
- A test group asks for assigned hats specifically (then add it as a `six-hats-assigned.json` in fixed mode, not by changing the canonical config).
