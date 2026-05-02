# CLAUDE.md

## Git Workflow

**Branching:**
- Create a branch from `main` before code changes
- Naming: `ai/<description>` (lowercase, hyphens)
  - Examples: `ai/add-auth-helper`, `ai/fix-validation`
- No branch needed: search, reading, exploration

**Before commit:**
- `pnpm run lint:fix` — required
- `pnpm run typecheck` — must pass with no errors
- Clear commit messages: `"Add auth helper"`, `"Fix type validation"`

## Conventions

- Read and follow `AGENTS.md`
- Always run linter and typecheck before push
