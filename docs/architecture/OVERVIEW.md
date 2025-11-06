# Architecture Overview

This document provides a high-level summary of the AI-Powered Medical Documentation Assistant platform. It describes the core applications, supporting services, and shared packages that make up the monorepo.

## Monorepo Layout

- `apps/`: End-user applications (web, mobile, admin) and gateway services.
- `services/`: Backend microservices powering transcription, documentation, coding, retrieval, orchestration, and integrations.
- `packages/`: Shared libraries for database access, authentication, logging, monitoring, configuration, UI, and common utilities.
- `infrastructure/`: Terraform modules, Kubernetes manifests, Docker images, and deployment scripts.
- `docs/`: Architecture references, API specifications, compliance documentation, and operational runbooks.

## Next Steps

Detailed architecture decision records (ADRs) and component diagrams will be added as implementation progresses.
