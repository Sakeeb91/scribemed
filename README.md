<div align="center">

# 🏥 ScribeMed

**AI-Powered Medical Documentation Assistant**

_Streamlining healthcare documentation with intelligent transcription, coding, and clinical note generation_

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js)](https://nodejs.org/)
[![PNPM](https://img.shields.io/badge/PNPM-8%2B-orange?logo=pnpm)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2%2B-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-blue?logo=postgresql)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-Private-red)](LICENSE)

</div>

---

## ✨ Overview

ScribeMed is a comprehensive healthcare documentation platform that leverages AI to automate medical transcription, clinical coding, and documentation workflows. Built as a modern monorepo, it provides scalable microservices architecture for healthcare organizations seeking to reduce administrative burden and improve documentation accuracy.

### 🎯 Key Features

- 🎤 **Real-time Audio Transcription** - High-accuracy speech-to-text for clinical encounters
- 📝 **Intelligent Documentation** - AI-powered clinical note generation
- 🏷️ **Automated Coding** - ICD-10 and CPT code suggestions
- 🔍 **RAG-Powered Retrieval** - Context-aware information retrieval
- 🔄 **FHIR Integration** - Standards-compliant healthcare data exchange
- 🎛️ **Agent Orchestration** - Coordinated multi-service workflows
- 📱 **Multi-Platform** - Web, mobile, and admin interfaces

---

## 🚀 Quick Start

### Prerequisites

Ensure you have the following installed:

- **Node.js** ≥ 18.0.0
- **PNPM** ≥ 8.0.0
- **Docker** & Docker Compose
- **PostgreSQL** 15+

### Installation

```bash
# Clone the repository
git clone https://github.com/Sakeeb91/scribemed.git
cd scribemed

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
pnpm run db:migrate

# Seed development database (optional)
pnpm run db:seed:dev

# Start all services in development mode
pnpm run dev
```

### 🛠️ Available Commands

| Command                 | Description                                |
| ----------------------- | ------------------------------------------ |
| `pnpm dev`              | Start all services in development mode     |
| `pnpm build`            | Build all packages and services            |
| `pnpm test`             | Run all unit and integration tests         |
| `pnpm test:unit`        | Run unit tests only                        |
| `pnpm test:integration` | Run integration tests only                 |
| `pnpm lint`             | Lint all code                              |
| `pnpm format`           | Format all code with Prettier              |
| `pnpm format:check`     | Check code formatting                      |
| `pnpm type-check`       | Run TypeScript type checking               |
| `pnpm db:migrate`       | Run database migrations                    |
| `pnpm db:migrate:info`  | Show migration status                      |
| `pnpm db:migrate:undo`  | Rollback last migration                    |
| `pnpm db:seed:dev`      | Seed development database                  |
| `pnpm clean`            | Clean all build artifacts and node_modules |

---

## 📁 Project Structure

```
scribemed/
├── 📱 apps/                    # End-user applications
│   ├── web/                    # Web application
│   ├── mobile/                 # Mobile application
│   ├── admin-portal/           # Admin dashboard
│   └── api-gateway/            # API gateway service
│
├── ⚙️ services/                # Backend microservices
│   ├── transcription/          # Audio transcription service
│   ├── documentation/          # Clinical note generation
│   ├── coding/                 # Medical coding service
│   ├── rag/                    # Retrieval-augmented generation
│   ├── agent-orchestrator/     # Service orchestration
│   ├── audio-capture/          # Audio capture service
│   └── fhir-adapter/           # FHIR integration
│
├── 📦 packages/                # Shared libraries
│   ├── database/               # Database migrations & connection
│   ├── auth/                   # Authentication utilities
│   ├── logging/                # Logging infrastructure
│   ├── monitoring/             # Monitoring & observability
│   ├── config/                 # Configuration management
│   ├── types/                  # Shared TypeScript types
│   ├── ui-components/          # Reusable UI components
│   └── utils/                  # Common utilities
│
├── 🏗️ infrastructure/          # Infrastructure as code
│   ├── terraform/              # Terraform configurations
│   ├── kubernetes/             # K8s manifests
│   ├── docker/                 # Docker configurations
│   └── scripts/                # Deployment scripts
│
└── 📚 docs/                    # Documentation
    ├── architecture/           # Architecture documentation
    ├── api/                    # API specifications
    ├── database/               # Database documentation
    ├── ci-cd/                  # CI/CD documentation
    ├── compliance/             # Compliance documentation
    └── runbooks/               # Operational runbooks
```

---

## 🏗️ Architecture

ScribeMed follows a **monorepo architecture** powered by [Turborepo](https://turbo.build/repo) for efficient builds and task orchestration. The platform is organized into:

- **Applications** (`apps/`) - User-facing interfaces and gateways
- **Services** (`services/`) - Independent microservices with specific responsibilities
- **Packages** (`packages/`) - Shared libraries and utilities
- **Infrastructure** (`infrastructure/`) - IaC and deployment configurations

### 📖 Documentation

Comprehensive documentation is available in the `docs/` directory:

- 📐 [Architecture Overview](docs/architecture/OVERVIEW.md) - System design and architecture decisions
- 🗄️ [Database Documentation](docs/database/README.md) - Schema, migrations, and data dictionary
- 🔌 [API Documentation](docs/api/README.md) - API specifications and endpoints
- 🚀 [CI/CD Guide](docs/ci-cd/README.md) - Continuous integration and deployment
- 📋 [Compliance](docs/compliance/README.md) - Healthcare compliance and security
- 📘 [Runbooks](docs/runbooks/README.md) - Operational procedures

---

## 🧪 Development

### Development Workflow

1. **Create a feature branch** from `main`

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** with accompanying tests and documentation

3. **Run quality checks** before pushing

   ```bash
   pnpm lint
   pnpm test
   pnpm build
   pnpm type-check
   ```

4. **Commit your changes** (Husky will run lint-staged automatically)

   ```bash
   git commit -m "feat: your feature description"
   ```

5. **Push and create a pull request** referencing related issues

### Code Quality

- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier with consistent configuration
- **Type Checking**: TypeScript strict mode
- **Testing**: Node.js built-in test runner
- **Pre-commit Hooks**: Husky + lint-staged

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for:

- Development setup instructions
- Code style guidelines
- Commit message conventions
- Pull request process

### Quick Contribution Checklist

- ✅ Code follows project style guidelines
- ✅ Tests added/updated and passing
- ✅ Documentation updated
- ✅ Linting and type checking passes
- ✅ No breaking changes (or documented if necessary)

---

## 🔒 Security & Compliance

ScribeMed handles Protected Health Information (PHI) and adheres to healthcare compliance standards:

- **HIPAA** compliance considerations
- **FHIR** standards for healthcare data exchange
- Secure credential management via AWS Secrets Manager
- Environment-specific security configurations

For security concerns, please contact the maintainers directly.

---

## 📄 License

This project is private and proprietary. All rights reserved.

---

## 🔗 Links

- [Architecture Documentation](docs/architecture/OVERVIEW.md)
- [Database Schema](docs/database/ERD.md)
- [API Reference](docs/api/README.md)
- [Contributing Guide](CONTRIBUTING.md)

---

<div align="center">

**Built with ❤️ for healthcare professionals**

[Report Bug](https://github.com/Sakeeb91/scribemed/issues) · [Request Feature](https://github.com/Sakeeb91/scribemed/issues)

</div>
