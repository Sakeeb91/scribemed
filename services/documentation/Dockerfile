# syntax=docker/dockerfile:1.5

FROM node:20-alpine AS base
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/tooling/package.json packages/tooling/package.json
COPY services/documentation/package.json services/documentation/package.json

RUN pnpm fetch --filter @scribemed/documentation-service...

COPY . .

RUN pnpm install --filter @scribemed/documentation-service... --prod --offline \
  && pnpm --filter @scribemed/documentation-service run build

EXPOSE 8081

CMD ["node", "services/documentation/dist/server.js"]

