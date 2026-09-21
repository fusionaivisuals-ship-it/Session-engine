# Session Engine

A guided workspace for individual and group thinking, decisions, and commitments. Participants join a room link with a display name; no accounts are required.

The current catalog includes brainstorming with prioritization, decision matrix, cause-and-effect / fishbone analysis, Five Whys, hypothesis testing, and pros-and-cons analysis. Methods, prompts, rubric anchors, and fictional demonstrations live in configuration files.

## Run locally

Install Node.js 22 or newer, then run:

```sh
cd engine
npm ci
npm run build
npm start
```

Open **http://localhost:3000**. Choose a method and either **Just me** or **With a group**. Group setup provides an invitation link and QR code. For devices on the same network, create the session using your computer's network address instead of `localhost`. Keep the server running while participants use it.

The generated `engine/dist/site` directory is a standalone demonstration site, not a session server. Run `npm run build:site` to build it. Real sessions require the Node engine.

## Optional AI

Core solo sessions work without an API key, using a self-check. Groups can proceed through human facilitation with a recorded reason. Personalized hints, group theme generation, decision review, and problem rewrites can use Anthropic or OpenRouter.

Copy `engine/.env.example` to `engine/.env`, supply your own key and provider-compatible model IDs, then use `npm run dev` to load that file. `npm start` reads the process environment; it does not automatically load `.env`. Never commit keys.

Models are configured separately with `MODEL_HELPER`, `MODEL_CLUSTER`, and `MODEL_REVIEWER`. Code defaults use Haiku for assistance and clustering, and Sonnet for review; there is no automatic escalation to Opus. The commented OpenRouter example is an alternative configuration, not a guarantee of model availability or pricing.

AI review is advisory. A person accepts the decision, with a recorded reason when advice is absent or concerns remain. Themes preserve access to original responses; summaries do not imply consensus. Problem rewrites require manual application. The optional solo checkpoint and AI Synthesizer are deferred.

## Verify

From `engine`:

```sh
npm run validate
npm test -- --runInBand
npm run build
npm run build:site
npm run test:e2e
```

Browser checks use installed Microsoft Edge on Windows and Playwright Chromium on other platforms. Install the appropriate Playwright browser if needed. Provider calls in automated tests use scripted fixtures or test doubles.

## Project map

- `CLAUDE.md`: project conventions.
- `design/`: specification, schemas, methods, fictional scenarios, and decisions.
- `engine/src/`: TypeScript engine and browser UI.
- `engine/prompts/`: implementation prompts and result records.
- `engine/test/` and `engine/e2e/`: automated checks.
- `audit/`: audit findings, validation records, and UI screenshots.
- `engine/DEPLOY.md`: server configuration notes.

This repository publishes the current project snapshot. Local secrets, real session records, machine-specific agent settings, and retired working materials are excluded. Publishing the source does not host a running service for remote participants.
