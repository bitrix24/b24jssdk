# AGENTS.md

## Project overview

`@bitrix24/b24jssdk` is a JS SDK for using the Bitrix24 REST API in local applications, production applications, or via webhooks. It is a pnpm monorepo.

## Repository structure

```
b24jssdk/
├── packages/
│   ├── jssdk/          # Core SDK package (@bitrix24/b24jssdk)
│   └── jssdk-nuxt/     # Nuxt module wrapper (@bitrix24/b24jssdk-nuxt)
├── playgrounds/
│   ├── cli/            # CLI playground for testing
│   └── nuxt/           # Nuxt playground
├── docs/               # Documentation site (Nuxt)
├── skills/             # Agent skills: when-to-use guidance for the SDK
├── test/               # Integration tests
└── vitest.config.ts    # Vitest workspace configuration
```

## Agent skills

The `skills/` directory follows the layout used by [`bitrix24/b24ui/skills`](https://github.com/bitrix24/b24ui/tree/main/skills): a top-level `index.json` manifest + per-skill folders with `SKILL.md` and `references/` (guidelines, recipes, api-surface). Skills teach **when** to use which entry point/method; detailed API references live in `packages/jssdk/README-AI.md` and the docs site.

Available skills:

- `skills/b24-jssdk/` — building Bitrix24 REST integrations: frame placements, server-side webhooks, OAuth apps, Pull events, Nuxt module. Read `skills/b24-jssdk/SKILL.md` first; its routing table tells you which references to load for a given task.

## Tech stack

- **Runtime:** Node.js, TypeScript (strict)
- **Package manager:** pnpm (10.x), workspaces
- **Build:** Each package manages its own build via its `package.json` scripts
- **Testing:** Vitest with workspace projects (integration, underLoad)
- **Linting:** ESLint 9 with `@nuxt/eslint-config`
- **Type checking:** `vue-tsc` + `tsc`

## Conventions

- The project uses pnpm workspaces. Always run scripts via root `pnpm run` or scoped `pnpm --filter`.
- Workspace references use `workspace:*` protocol.
- Every package and playground has its own `tsconfig.json`.
- The `packages/jssdk` directory is the core — most changes happen here.

## Common commands

```bash
pnpm install                        # Install all dependencies
pnpm run package-jssdk:build        # Build the core SDK
pnpm run package-jssdk:test:run     # Run integration tests
pnpm run lint                       # Lint all workspaces
pnpm run typecheck                  # Type-check all workspaces
pnpm run docs:dev                   # Start docs dev server
```

## Code style

- ESLint with `@nuxt/eslint-config`, run `pnpm run lint:fix` before committing.
- TypeScript strict mode — all new code must pass `pnpm run typecheck`.
- No default exports; use named exports.
- Keep packages tree-shakeable (`sideEffects: false`)
- Stylistic rules: 2-space indentation, no trailing commas, 1tbs brace style
- Editor: `.editorconfig` enforces 2-space indentation and LF line endings.

### Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages, which allows a changelog to be auto-generated based on the commits. Please read the [guide](https://www.conventionalcommits.org/en/v1.0.0/#summary) through if you aren't familiar with it already.

- Use `fix` and `feat` for code changes that affect functionality or logic
- Use `docs` for documentation changes and `chore` for maintenance tasks

## AI-specific notes

- This is a client-facing SDK — API surface changes in `packages/jssdk` must be backward-compatible or follow a deprecation cycle.
- The Nuxt module (`packages/jssdk-nuxt`) wraps the core SDK for Nuxt auto-import and SSR compatibility.
- When adding a new feature to the core SDK, check if the Nuxt module also needs updates.
- Tests are integration-style and hit real Bitrix24 APIs. Never mock REST responses — tests validate real API contracts.
- The `.claude/` directory is gitignored except for tracked config files.
