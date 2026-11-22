# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM oven/bun:1.3.13 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
COPY apps/api apps/api
RUN bun run --cwd apps/api build

FROM oven/bun:1.3.13-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist/index.js ./index.js
USER bun
EXPOSE 8080
CMD ["bun", "index.js"]
