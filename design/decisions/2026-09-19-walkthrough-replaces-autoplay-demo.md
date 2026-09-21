# Stepped walkthrough replaces autoplay demo

**Date**: 2026-09-19
**Status**: accepted

## Context

Prompt 08 built a `/demo/:scenarioId` route that runs a scripted session at 10x speed and redirects the browser to the room view. In practice this either (a) awaited the full simulation, showing only the completed "Session Complete" screen, or (b) after the fix to run in background, played back too fast for a viewer to read any content.

A 45-minute session compressed to 4.5 minutes is still too fast for someone unfamiliar with the system. The viewer cannot read submissions, cannot see what the AI clusters, and cannot understand why the reviewer rejected a decision. The demo shows motion but teaches nothing.

## Decision

Replace the autoplay demo with a stepped walkthrough:

1. Each step is a meaningful moment (block entered, submissions arrive, reveal shown, verdict, commit, report) — roughly 25–40 steps for a full Six Hats session instead of hundreds of raw state snapshots.
2. The viewer clicks Next/Back at their own pace. Keyboard arrows work.
3. Each step shows narration from the method config explaining what is happening and why, written for someone who has never seen the system.
4. A Play button auto-advances every 12 seconds (optional, stops on any click). No autoplay on load.
5. The walkthrough JSON is a static file that works from `file://` with no server.

## What stays

- The `/demo` route and `simulate.ts` stay in the engine — they are useful for end-to-end testing.
- The `replay.html` player stays for raw state-level replay during development.
- The site pages never link to `/demo`; they link to the static walkthrough files.

## Consequences

- Method configs gain `walkthrough` narration on every block and a `walkthroughIntro` on the method. These are optional in the schema so existing methods without narration still validate.
- The `npm run record` script now emits both `*.replay.json` (raw) and `*.walkthrough.json` (stepped).
- A new `walkthrough.html` player replaces `replay.html` as the public-facing viewer.
