# Contributing Guide

## Prerequisites

- Node.js >= 18
- PNPM >= 8

## Setup

```bash
pnpm install
pnpm lint
pnpm test
```

## Workflow

1. Create a feature branch from `main`.
2. Make changes with accompanying tests and docs.
3. Run `pnpm lint`, `pnpm test`, and `pnpm build` before pushing.
4. Submit a pull request referencing related issues.

## Commit Hooks

Husky and lint-staged enforce formatting and linting on commit.
