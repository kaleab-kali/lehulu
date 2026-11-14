# Lehulu: web component + Rust API + SQLite in one small image.
# Build context is the repo root (it needs web/, server/ and flows/).

# ---- 1. Web component (Lit + Vite), API mode ----
FROM node:24-bookworm-slim AS web
WORKDIR /src/web
RUN corepack enable pnpm
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY flows /src/flows
COPY server/seed /src/server/seed
COPY web/ ./
RUN VITE_BASE=/ pnpm run build

# ---- 2. Rust server ----
FROM rust:1-slim-bookworm AS api
WORKDIR /src/server
COPY server/Cargo.toml server/Cargo.lock ./
COPY server/migrations ./migrations
COPY server/src ./src
RUN cargo build --release --locked

# ---- 3. Runtime ----
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* && useradd --system --home /app lehulu
WORKDIR /app
COPY --from=api /src/server/target/release/lehulu /app/lehulu
COPY --from=web /src/web/dist /app/public
COPY flows /app/flows
COPY server/seed /app/seed
RUN mkdir -p /app/data && chown -R lehulu /app/data
USER lehulu
ENV BIND=0.0.0.0:8080 \
    DATABASE_URL=sqlite:///app/data/lehulu.db?mode=rwc \
    PUBLIC_DIR=/app/public \
    FLOWS_DIR=/app/flows \
    SEED_DIR=/app/seed \
    MEDIA_DIR=/app/data/media
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD ["/app/lehulu", "healthcheck"]
CMD ["/app/lehulu", "serve"]
