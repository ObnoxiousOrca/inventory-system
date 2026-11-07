# Build from the repo root with:
#   docker build -f docker/Dockerfile -t inventory-backend ./backend
# (the build CONTEXT is ./backend, this file just lives in docker/ to match the synopsis layout)

# ---- Stage 1: install production dependencies only ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm ci` needs a package-lock.json (run `npm install` once locally to generate it and commit it).
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# ---- Stage 2: small runtime image ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts

# Run as the unprivileged "node" user that ships with the base image.
USER node

EXPOSE 3000

# Used by Docker/Compose. (ECS/ALB use their own health checks against /health.)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
