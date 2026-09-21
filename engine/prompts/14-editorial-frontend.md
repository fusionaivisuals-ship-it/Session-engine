# 14 — Editorial frontend redesign

## User request

Inspect and redesign the existing site as a calm, professional workspace for structured group thinking. Preserve functionality and the approved methods. Use ivory, white, charcoal and forest green, serif headings, subtle pastel accents and restrained borders. Build the specified two-column homepage, five-stage process, method grid and decision-record preview. Put the real session timer on the left, with participant status and guidance; make the task panel dominant. Adapt this layout to mobile and retain privacy, anonymity, timing, gates and integrations.

## Implementation

- Shared CSS tokens, navigation, typography, cards, forms, buttons and responsive layouts cover all eight views.
- Shared workspace components render progress, the server clock, participant status, instructions and decision records. Homepage content uses the existing catalog and a clearly fictional scenario.
- The participant editor shows an accurate word count and save acknowledgments. Same-block rerenders preserve drafts, other unfinished fields and focus. Pause/resume continues to use the existing server state.
- Runtime and static builds inline shared assets; standalone demonstrations still work over `file://`. Walkthroughs hide answers during private input and identify their timeboxes as recorded. Replay retains upload, playback, scrub and report controls.
- Existing setup, QR invitation, help, voting, self-check, facilitator controls, report downloads and six approved methods remain available.

## Result

Implemented in the working tree. Verification and reviewed desktop/mobile screenshots are recorded in [the design review](../../audit/editorial/README.md).

Commit: not created. Deployment: none. The Synthesizer remains deferred under prompt 06b; this slice does not change provider integrations.
