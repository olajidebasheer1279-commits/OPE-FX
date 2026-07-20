# ── OPE-FX Dockerfile ────────────────────────────────────────────────────────
# Single-stage build: installs deps, bundles frontend (Vite) and backend
# (esbuild), then runs the Express server which serves both.
#
# IMPORTANT: VITE_CLERK_PUBLISHABLE_KEY must be passed at build time because
# Vite inlines it into the frontend bundle:
#
#   docker build \
#     --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_live_... \
#     -t ope-fx .
#
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

# Install pnpm (pin major to match workspace expectations)
RUN npm install -g pnpm@10

WORKDIR /app

# Copy workspace manifests and lockfile first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all source needed for the build
COPY tsconfig*.json ./
COPY artifacts/ ./artifacts/
COPY lib/ ./lib/
COPY scripts/ ./scripts/
# attached_assets is referenced by the Vite @assets alias in ope-fx
COPY attached_assets/ ./attached_assets/

# Install all dependencies (including devDeps needed to build)
RUN pnpm install --frozen-lockfile

# Build-time arg for Vite frontend env var
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

# Build only the two application artifacts — lib packages have no build step;
# they are bundled from TypeScript source by Vite (frontend) and esbuild (API).
RUN pnpm run build:render

# Runtime environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Start the Express server (serves both API and frontend static files)
CMD ["node", "artifacts/api-server/dist/index.mjs"]
