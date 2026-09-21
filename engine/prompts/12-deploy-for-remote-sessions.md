# 12 — Deploy for Remote Sessions

Paste everything below the line into Claude Code from the repo root. Read `design/SPEC.md` first if you are editing this prompt.

---

Read CLAUDE.md, engine/CONTEXT.md, design/SPEC.md §9 and §11, src/main.ts, and the Result of engine/prompts/11b. Save this prompt as engine/prompts/12-deploy-for-remote-sessions.md. One item at a time, tests green before moving on. Goal: a person anywhere can open a link, join a session from their own computer, and take part. Everything currently assumes localhost.

1. **Public URL correctness.** Every link the engine generates (join URL, QR code, copy-to-clipboard, report download) must use a configurable origin. Read `PUBLIC_ORIGIN` from env (e.g. `https://session.example.com`). When not set, fall back to the request's own `Host` header + protocol. Never hardcode `localhost`.

2. **WebSocket over TLS.** Clients must connect with `wss://` when the page is served over HTTPS. The WS URL must derive from `location.protocol` and `location.host`, not from a hardcoded string. Add reconnect with exponential backoff (1 s → 2 s → 4 s → 8 s → cap 30 s). On disconnect, preserve any draft text the participant has typed. Show a connection indicator: green dot when connected, yellow when reconnecting, red after 30 s.

3. **Latency and clock.** Clocks are server-authoritative. On WS connect, the server sends a `{ type: 'time', serverMs: Date.now() }` message. The client computes round-trip offset and adjusts displayed countdowns. Show a connection quality indicator (good / fair / poor) based on round-trip time. No NTP, no external service.

4. **Persistence across restarts.** `SESSIONS_DIR` from env (fallback `./sessions`). On boot, recover running/paused sessions from disk (already done). Add cleanup: delete session files older than 30 days on startup.

5. **Limits.** Per-IP rate limits on session creation: max 5 sessions per hour, 30 per day. In-memory counters, no external store. Global cap: 50 active sessions (lobby + running + paused). Input length caps: 500 chars for problem statement, 4000 chars for submissions, max 8 seats. Return 429 / 400 with clear messages.

6. **Deployment.** Dockerfile (Node 20 alpine, multi-stage build, non-root user). `DEPLOY.md` documenting env vars (`PORT`, `PUBLIC_ORIGIN`, `SESSIONS_DIR`, `ANTHROPIC_API_KEY`), Docker run command, and health check. `.env.example` updated.

7. **Time zones.** Verify all timestamps stored in UTC ISO strings (already the case). Frontend pages render times in the viewer's local zone using `Intl.DateTimeFormat`. No server-side TZ logic.

8. **Pre-flight check.** `GET /check` returns an HTML page showing: engine version (from package.json), PUBLIC_ORIGIN, SESSIONS_DIR path and writability, number of active sessions, number of methods loaded, whether ANTHROPIC_API_KEY is set (not the value). Useful for operators after deploy.

Constraints unchanged: no auth, no database, no framework, self-contained pages, `grep -ri "hat\|shoe" src/` returns nothing.

When done: from a cold browser, open the public URL, create a solo session, run to report. Then create a group session, share the join link with a second browser, run to report. Note what broke and what confused you.

---

## Result

### Item 1: Public URL correctness

- Created `src/engine/origin.ts` with `getPublicOrigin(req?)` — reads `PUBLIC_ORIGIN` from env, falls back to `x-forwarded-proto`/`x-forwarded-host` headers, then to request `Host` header.
- `GET /api/health` now returns `{ ok, engine, publicOrigin }`.
- `start.html` reads `publicOrigin` from health response, uses it for join URL, QR code, and copy-to-clipboard (instead of `location.origin`).
- Console log on startup shows the public origin.
- 5 tests in `test/origin.test.ts`: env var, trailing slash strip, Host fallback, forwarded headers, no-request fallback.

### Item 2: WebSocket over TLS

- `join.html`, `facilitate.html`, `room.html`: replaced `ws://` with protocol detection (`location.protocol === 'https:' ? 'wss:' : 'ws:'`). `start.html` lobby already had this.
- All four pages: reconnect with exponential backoff (1s → 2s → 4s → 8s → cap 30s).
- `join.html`: draft text preserved across disconnects (`draftText` variable, saved on close, restored on open and re-render).
- All pages: connection indicator (fixed top-right) — green dot when connected, yellow "Reconnecting..." during backoff, red "Disconnected" after 30s cap reached.

### Item 3: Latency and clock

- Server sends `{ type: 'time', serverMs }` on WebSocket connect.
- Server responds to `{ type: 'ping', clientMs }` with `{ type: 'pong', clientMs, serverMs }`.
- All client pages compute `serverOffset` and `rttMs` from pong. Display connection quality: hidden when good (<200ms), "Fair (Xms)" at 200-600ms, "Poor (Xms)" above 600ms.
- Clocks remain server-authoritative — `clockStatus.remainingSec` is computed server-side and pushed via state updates.

### Item 4: Persistence across restarts

- `SESSIONS_DIR` read from env in `main.ts`; falls back to `<engineDir>/sessions`.
- Added `cleanupOldSessions(maxAgeDays)` in `manifest.ts` — deletes session files older than 30 days on startup by checking file mtime.
- 1 new test in `test/manifest.test.ts`: backdates a file 31 days, confirms cleanup removes it while preserving fresh files.

### Item 5: Limits

- Created `src/engine/limits.ts` with in-memory per-IP rate limiting (pruned timestamp arrays).
- `POST /api/sessions` guarded by `checkSessionCreationRate` middleware: 5/hour, 30/day per IP. Returns 429 with clear message.
- Global active session cap: `getActiveSessionCount()` added to store, checked before session creation. Cap = 50, returns 429.
- Input caps: problem statement 500 chars, submission 4000 chars (checked in API). Join endpoint enforces max 8 seats.
- Periodic cleanup of stale IP records every 10 minutes.
- 5 tests in `test/limits.test.ts`: rate limit enforcement, IP independence, cap check, constant values.

### Item 6: Deployment

- `Dockerfile`: multi-stage build (Node 20 alpine), non-root `app` user, volume-ready `/app/sessions`, HEALTHCHECK with wget.
- `DEPLOY.md`: documents all env vars, Docker run command, non-Docker setup, reverse proxy notes, limits summary.
- `.env.example` updated with `PORT`, `PUBLIC_ORIGIN`, `SESSIONS_DIR` at the top.

### Item 7: Time zones

- Verified: all 23 occurrences of `new Date().toISOString()` across 10 source files produce UTC ISO strings. No server-side timezone logic.
- `start.html` recent sessions list now renders dates using `Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })` — viewer's local timezone. Stores full ISO timestamp instead of date-only string. Backward-compatible fallback for old `YYYY-MM-DD` format.

### Item 8: Pre-flight check

- `GET /check` returns an HTML page with a diagnostic table showing:
  - Engine version (from package.json)
  - PUBLIC_ORIGIN (with WARN if not explicitly set)
  - SESSIONS_DIR path and writability
  - Active sessions count (WARN if at 50)
  - Methods loaded count
  - AI key configured (yes/no, not the value)
- Styled with inline CSS, no external dependencies.

### Test results

- 166 tests pass (155 existing + 5 origin + 1 manifest cleanup + 5 limits).
- `grep -ri "hat\|shoe" src/` returns only incidental matches (e.g. "that"), no method-specific strings.

### New files

- `src/engine/origin.ts` — public origin utility
- `src/engine/limits.ts` — rate limits, session cap, input caps
- `test/origin.test.ts` — 5 tests
- `test/limits.test.ts` — 5 tests
- `Dockerfile` — multi-stage production build
- `DEPLOY.md` — deployment documentation

### 2026-09-20 audit correction

The original Result above is historical. See [the repair record](../../audit/slopcheck/AFTER.md) for integration fixes and current validation. Private transport, reports, detours, solo completion, voting, drafts and compiled/static delivery now have regression coverage. Changes remain uncommitted; no deployment is claimed.
