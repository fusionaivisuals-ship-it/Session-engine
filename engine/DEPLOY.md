# Deploying the Session Engine

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | HTTP server port |
| `PUBLIC_ORIGIN` | Recommended | auto-detected | Public URL for join links and QR codes (e.g. `https://session.example.com`). Falls back to request Host header. |
| `SESSIONS_DIR` | No | `./sessions` | Directory for session JSON manifests. Mount a volume here for persistence across restarts. |
| `ANTHROPIC_API_KEY` | No | — | Enables AI features: hints, clustering, reviewer. Without it, structure/timing/gates still work. |
| `OPENROUTER_API_KEY` | No | — | Alternative to Anthropic. If set, the engine uses OpenRouter. |
| `MODEL_HELPER` | No | `claude-haiku-4-5-20251001` | Model for hints and examples |
| `MODEL_CLUSTER` | No | `claude-haiku-4-5-20251001` | Model for clustering submissions |
| `MODEL_REVIEWER` | No | `claude-sonnet-4-6` | Model for the reviewer |

## Docker

Build from the repository root (the context includes method configs and the report template):

```bash
docker build -f engine/Dockerfile -t session-engine .
docker run -d \
  --name session-engine \
  -p 3000:3000 \
  -e PUBLIC_ORIGIN=https://session.example.com \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v session-data:/app/sessions \
  session-engine
```

Health check: `GET /api/health` returns `{ ok: true, engine: true }`.

Pre-flight check: `GET /check` shows a status page with config and diagnostics.

## Without Docker

```bash
npm ci
npm run build
PORT=3000 PUBLIC_ORIGIN=https://session.example.com node dist/src/main.js
```

## Behind a Reverse Proxy

The engine reads `X-Forwarded-Proto` and `X-Forwarded-Host` headers to detect the public URL when `PUBLIC_ORIGIN` is not set. Configure your proxy to forward these headers.

WebSocket connections use the standard HTTP upgrade mechanism. Ensure your proxy forwards WebSocket upgrades on the same path.

## Limits

- Session creation: 5 per IP per hour, 30 per IP per day
- Active sessions (global): 50
- Problem statement: 500 characters
- Submission: 4000 characters
- Max seats per session: 8

## Persistence

Session state is saved to JSON files in `SESSIONS_DIR`. On startup:
- Files older than 30 days are automatically cleaned up
- Running/paused sessions are recovered and set to paused
