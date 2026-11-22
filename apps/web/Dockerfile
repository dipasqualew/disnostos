# Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://... .
FROM oven/bun:1.3.13 AS build
ARG VITE_API_URL
RUN test -n "$VITE_API_URL" || (echo "VITE_API_URL build arg is required" >&2; exit 1)
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/model/package.json packages/model/
RUN bun install --frozen-lockfile
COPY apps/web apps/web
RUN VITE_API_URL="$VITE_API_URL" bun run --cwd apps/web build

# Runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
