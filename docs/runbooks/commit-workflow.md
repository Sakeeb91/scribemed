# Commit Workflow Guide

This document describes the commit strategy and workflow practices for the ScribeMed monorepo, including when and how to use multi-stage commits.

## Standard Commit Workflow

### Single-Stage Commits

For most changes, use a single commit that includes all related changes:

```bash
git add .
git commit -m "feat: add user authentication service"
```

### Pre-Commit Hooks

Husky and lint-staged automatically run on every commit:

- **ESLint** - Lints TypeScript/JavaScript files and auto-fixes when possible
- **Prettier** - Formats code, JSON, and Markdown files

These hooks ensure consistent code quality before changes enter the repository.

## Multi-Stage Commits

Multi-stage commits are used when you need to logically separate related configuration changes that should land together but represent distinct logical steps.

### When to Use Multi-Stage Commits

Use multi-stage commits when:

1. **Scaffolding new features** - Separating infrastructure setup from implementation

   ```bash
   # Stage 1: Infrastructure
   git add turbo.json package.json
   git commit -m "chore: configure turbo for new service"

   # Stage 2: Implementation
   git add services/new-service/
   git commit -m "feat: implement new service"
   ```

2. **Configuration changes** - Separating config updates from code changes

   ```bash
   # Stage 1: Update configuration
   git add .github/workflows/ci.yml
   git commit -m "ci: update workflow configuration"

   # Stage 2: Update related scripts
   git add scripts/ci/
   git commit -m "ci: update CI helper scripts"
   ```

3. **Database migrations** - Separating schema changes from application code

   ```bash
   # Stage 1: Migration
   git add packages/database/migrations/V2__add_users_table.sql
   git commit -m "db: add users table migration"

   # Stage 2: Application code using new schema
   git add packages/database/src/
   git commit -m "feat: add user repository implementation"
   ```

### Keeping Multi-Stage Commits Coherent

When using multi-stage commits:

1. **Keep related changes together** - Don't split changes that depend on each other
2. **Use descriptive commit messages** - Follow [Conventional Commits](https://www.conventionalcommits.org/) format
3. **Test after each stage** - Ensure the repository is in a valid state after each commit
4. **Reference related commits** - Use commit messages to link related stages:
   ```bash
   git commit -m "feat: add authentication service (follows infrastructure setup)"
   ```

### Example: Complete Feature Implementation

```bash
# Stage 1: Add dependencies and configuration
git add package.json pnpm-lock.yaml
git commit -m "chore: add authentication dependencies"

# Stage 2: Create service structure
git add services/auth/
git commit -m "feat: scaffold authentication service"

# Stage 3: Implement core functionality
git add services/auth/src/
git commit -m "feat: implement JWT authentication"

# Stage 4: Add tests
git add services/auth/tests/
git commit -m "test: add authentication service tests"
```

## Commit Message Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks, dependency updates
- `ci:` - CI/CD changes
- `perf:` - Performance improvements

### Examples

```bash
git commit -m "feat(auth): add OAuth2 provider support"
git commit -m "fix(database): resolve connection pool leak"
git commit -m "docs(readme): update installation instructions"
git commit -m "chore(deps): update TypeScript to 5.3"
```

## Best Practices

1. **Commit often** - Make small, focused commits rather than large monolithic ones
2. **Test before committing** - Run `pnpm lint`, `pnpm test`, and `pnpm build` locally
3. **Review your changes** - Use `git diff --staged` to review before committing
4. **Keep commits atomic** - Each commit should represent a single logical change
5. **Write clear messages** - Commit messages should explain _what_ and _why_, not _how_

## Troubleshooting

### Pre-commit hook failed

If the pre-commit hook fails:

1. Review the error message
2. Fix the issues (ESLint/Prettier will often auto-fix)
3. Stage the fixes: `git add .`
4. Commit again

### Bypassing hooks (not recommended)

Only bypass hooks in emergencies:

```bash
git commit --no-verify -m "emergency: hotfix deployment"
```

**Note:** This should be extremely rare. Always fix linting/formatting issues properly.

## Related Documentation

- [Contributing Guide](../../CONTRIBUTING.md) - General contribution guidelines
- [CI/CD Documentation](../ci-cd/README.md) - Continuous integration workflow
