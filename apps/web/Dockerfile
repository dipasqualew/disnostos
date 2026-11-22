# Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://... \
#     --build-arg VITE_FIREBASE_API_KEY=... --build-arg VITE_FIREBASE_PROJECT_ID=... .
FROM oven/bun:1.3.13 AS build
ARG VITE_API_URL
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_PROJECT_ID
RUN test -n "$VITE_API_URL" -a -n "$VITE_FIREBASE_API_KEY" -a -n "$VITE_FIREBASE_PROJECT_ID" \
  || (echo "VITE_API_URL, VITE_FIREBASE_API_KEY, and VITE_FIREBASE_PROJECT_ID are required" >&2; exit 1)
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/model/package.json packages/model/
COPY e2e/package.json e2e/
RUN bun install --frozen-lockfile
COPY apps/web apps/web
RUN VITE_API_URL="$VITE_API_URL" VITE_FIREBASE_API_KEY="$VITE_FIREBASE_API_KEY" \
  VITE_FIREBASE_PROJECT_ID="$VITE_FIREBASE_PROJECT_ID" bun run --cwd apps/web build

# Runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
