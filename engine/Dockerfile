# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app/engine
COPY engine/package.json engine/package-lock.json ./
RUN npm ci
COPY engine/tsconfig.json ./
COPY engine/src/ src/
COPY engine/scripts/ scripts/
COPY design/ /app/design/
COPY sessions/_template-run-log.md /app/sessions/_template-run-log.md
RUN npm run build

# --- Production stage ---
FROM node:20-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY engine/package.json engine/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/engine/dist dist/

# Sessions dir (mount a volume for persistence)
RUN mkdir -p /app/sessions && chown app:app /app/sessions
ENV SESSIONS_DIR=/app/sessions

USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

CMD ["node", "dist/src/main.js"]
