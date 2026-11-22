# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM oven/bun:1.3.13 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/model/package.json packages/model/
COPY packages/fixtures/package.json packages/fixtures/
COPY e2e/package.json e2e/
RUN bun install --frozen-lockfile
COPY packages/model packages/model
COPY apps/api apps/api
RUN bun run --cwd apps/api build

FROM oven/bun:1.3.13-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist/index.js ./index.js
USER bun
EXPOSE 8080
CMD ["bun", "index.js"]
