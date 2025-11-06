# AI-Powered Medical Documentation Assistant

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- PNPM >= 8.0.0
- Docker & Docker Compose
- PostgreSQL 15+

### Installation

```
# Clone repository
git clone https://github.com/Sakeeb91/scribemed.git
cd scribemed

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
pnpm run migrate

# Start development servers
pnpm run dev
```

### Available Commands

- `pnpm dev` - Start all services in development mode
- `pnpm build` - Build all packages
- `pnpm test` - Run all tests
- `pnpm lint` - Lint all code
- `pnpm format` - Format all code

## Project Structure

```
scribemed/
├── .github/
│   ├── workflows/
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── apps/
├── services/
├── packages/
├── infrastructure/
├── docs/
├── .husky/
├── .vscode/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.json
├── .eslintrc.js
├── .prettierrc
├── .gitignore
└── README.md
```

See `docs/architecture/OVERVIEW.md`, `docs/ci-cd/README.md`, and `docs/database/README.md` for more details.

## Contributing

See `CONTRIBUTING.md` for development guidelines.
