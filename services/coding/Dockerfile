# syntax=docker/dockerfile:1.5

FROM node:20-alpine AS base
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/tooling/package.json packages/tooling/package.json
COPY services/coding/package.json services/coding/package.json

RUN pnpm fetch --filter @scribemed/coding-service...

COPY . .

RUN pnpm install --filter @scribemed/coding-service... --prod --offline \
  && pnpm --filter @scribemed/coding-service run build

EXPOSE 8082

CMD ["node", "services/coding/dist/server.js"]

