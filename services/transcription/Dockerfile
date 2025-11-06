# syntax=docker/dockerfile:1.5

FROM node:20-alpine AS base
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/tooling/package.json packages/tooling/package.json
COPY services/transcription/package.json services/transcription/package.json

RUN pnpm fetch --filter @scribemed/transcription-service...

COPY . .

RUN pnpm install --filter @scribemed/transcription-service... --prod --offline \
  && pnpm --filter @scribemed/transcription-service run build

EXPOSE 8080

CMD ["node", "services/transcription/dist/server.js"]

