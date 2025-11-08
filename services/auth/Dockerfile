# syntax=docker/dockerfile:1.5

FROM node:20-alpine AS base
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/tooling/package.json packages/tooling/package.json
COPY packages/logging/package.json packages/logging/package.json
COPY packages/database/package.json packages/database/package.json
COPY services/auth/package.json services/auth/package.json

RUN pnpm fetch --filter @scribemed/auth-service...

COPY . .

RUN pnpm install --filter @scribemed/auth-service... --prod --offline \
  && pnpm --filter @scribemed/auth-service run build

EXPOSE 8085

CMD ["node", "services/auth/dist/index.js"]
