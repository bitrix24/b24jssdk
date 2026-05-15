# AGENTS.md

This file provides guidance for AI coding agents working on the `@bitrix24/b24jssdk` repository.

## Project Overview

`@bitrix24/b24jssdk` is a JS/TS SDK for the Bitrix24 REST API. It is a pnpm 10 monorepo that ships:

- a framework-agnostic core SDK (`packages/jssdk`, published as `@bitrix24/b24jssdk`, ESM + UMD only since v0.4.0),
- a thin Nuxt module wrapper (`packages/jssdk-nuxt`),
- a public docs site (`docs/`, deployed to GitHub Pages),
- manual smoke playgrounds (`playgrounds/cli`, `playgrounds/nuxt`),
- workspace-level Vitest projects under `test/` that hit a real Bitrix24 portal.

The core SDK exposes three concrete entry points over a shared abstract base — `B24Frame` (iframe apps), `B24Hook` (server-side webhooks), `B24OAuth` (local OAuth apps) — plus cross-cutting modules for HTTP, limiting, helpers, push (Pull), logging, and types.

## Project Structure

```
packages/
├── jssdk/                          # core SDK (published)
│   ├── src/
│   │   ├── core/                   # AbstractB24, Result, SdkError
│   │   │   ├── actions/            # b24.actions.vX.<call|batch|callList|fetchList>.make()
│   │   │   ├── http/               # transports + limiters
│   │   │   │   ├── limiters/       # rate / operating / adaptive delay
│   │   │   │   ├── ajax-result.ts
│   │   │   │   ├── ajax-error.ts
│   │   │   │   ├── v2.ts
│   │   │   │   └── v3.ts
│   │   │   └── tools/              # internal helpers
│   │   ├── frame/                  # B24Frame + iframe managers (auth, slider, dialog, …)
│   │   ├── hook/                   # B24Hook (server-side webhook auth)
│   │   ├── oauth/                  # B24OAuth (local OAuth apps)
│   │   ├── helper/                 # B24HelperManager, useB24Helper composable
│   │   ├── pullClient/             # WebSocket / long-poll Pull client
│   │   ├── tools/                  # public tools (Text, Type, Browser, formatters)
│   │   ├── types/                  # public types and enums
│   │   ├── logger/                 # LoggerBrowser / LoggerFactory
│   │   ├── loader-b24frame.ts      # initializeB24Frame()
│   │   └── index.ts                # public surface — treat as a contract
│   ├── README-AI.md                # authoritative API guide for callers
│   └── build.config.ts             # unbuild config (replaces __SDK_VERSION__ etc.)
├── jssdk-nuxt/                     # Nuxt module — only registers runtime/plugin
playgrounds/
├── cli/                            # Node smoke
└── nuxt/                           # Nuxt smoke (live SDK)
docs/
└── content/docs/                   # documentation site (English only)
test/
├── 0_setup/                        # setupB24Client(), env loading
├── integration/                    # *.spec.ts — 30s timeouts, real portal
├── under-load/                     # sequential, 40-min timeouts
└── some-code-from-docs/            # snippets mirrored from docs/
scripts/
└── b24-self-task/                  # Python automation that drives Claude Code
```

## Commands

Run from the repo root unless noted. All scripts go through pnpm workspaces — never `npm`/`yarn`.

```bash
pnpm install
pnpm run dev:prepare                # build/stub all packages so workspaces resolve

# Core SDK
pnpm run package-jssdk:build        # esm + umd + umd-min via unbuild
pnpm run package-jssdk:typecheck
pnpm run package-jssdk:lint

# Nuxt module
pnpm run package-jssdk-nuxt:build
pnpm run package-jssdk-nuxt:typecheck

# Docs / playgrounds
pnpm run docs:dev
pnpm run playground-nuxt:dev

# Repo-wide
pnpm run lint
pnpm run lint:fix                   # run before commit
pnpm run typecheck                  # every workspace, sequential
```

### Tests

Two Vitest projects, defined in `vitest.config.ts`:

- `jsSdk:integration` — `test/integration/**/*.spec.ts`, 30s timeouts.
- `jsSdk:underLoad` — `test/under-load/**.spec.ts`, sequential, 40-min timeouts.

Both projects load `.env.test` (gitignored). Copy `.env.test-example` and set `B24_HOOK` to a real webhook URL — `setupB24Client()` in [test/0_setup/setup-integration-jssdk.ts](test/0_setup/setup-integration-jssdk.ts) throws without it.

```bash
pnpm run package-jssdk:test                       # watch, integration project
pnpm run package-jssdk:test:run                   # one-shot, integration project
pnpm run package-jssdk:test-integration-core      # filter by name "core"
pnpm run package-jssdk:test-integration-js-docs   # filter by name "js-docs"

# Single test by name from the root:
pnpm vitest run --project jsSdk:integration -t "<test name>"
```

**Tests hit real Bitrix24 REST endpoints — never mock responses.** They validate API contracts, so a passing mocked test would defeat the suite's purpose.

## Key Conventions

- **Conventional Commits**: `feat`/`fix` for behaviour, `docs`/`chore` otherwise (e.g. `feat(http): add adaptive delayer`, `fix(frame): refresh auth on 401`). The CHANGELOG is generated from these.
- **No default exports**: every export is named so consumers stay tree-shakeable (`sideEffects: false`).
- **TypeScript strict**: `tsc` for the core SDK; `vue-tsc` for the Nuxt/docs/playground projects.
- **Public contract**: exports from [packages/jssdk/src/index.ts](packages/jssdk/src/index.ts) are a public API. Any breaking change needs a deprecation cycle, not a silent rename.
- **Cross-package awareness**: when you change the core SDK API, check whether [packages/jssdk-nuxt/src/runtime/plugin](packages/jssdk-nuxt/src/) needs an update.
- **Code formatting**: `@nuxt/eslint-config` (flat) with stylistic overrides — 2-space indent, no trailing commas, 1tbs braces. `.editorconfig` enforces LF + 2 spaces. The protobuf JS files in `packages/jssdk/src/pullClient` are eslint-ignored intentionally.
- **Build tokens**: `__SDK_VERSION__` and `__SDK_USER_AGENT__` are replaced at build time by [packages/jssdk/build.config.ts](packages/jssdk/build.config.ts). Do not hard-code versions.
- **English only** in code, comments, and documentation pages.

## SDK Source (`packages/jssdk/src/` and `test/`)

The references and code conventions below apply **only** when working on files under `packages/jssdk/src/` or `test/`. They do not apply to `docs/`, `playgrounds/`, or the Nuxt module.

### References

Load these based on your task. **Do not load all files at once** — only load what's relevant.

| File | Topics |
|------|--------|
| **[.github/contributing/package-structure.md](.github/contributing/package-structure.md)** | File layout in `packages/jssdk/src/`, AbstractB24-derived classes, managers, public-export rules |
| **[.github/contributing/transports-and-results.md](.github/contributing/transports-and-results.md)** | `Http` v2/v3 transports, `Result` / `AjaxResult` / `AjaxError` / `SdkError`, `RateLimiter` / `OperatingLimiter` / `AdaptiveDelayer`, `ParamsFactory` presets, paging |
| **[.github/contributing/testing.md](.github/contributing/testing.md)** | Vitest projects (integration + under-load), `.env.test`, `setupB24Client()`, naming filters, no-mock policy |
| **[.github/contributing/documentation.md](.github/contributing/documentation.md)** | `docs/content/docs/` Markdown structure, frontmatter (`links`, `category`, `restApiVersion`), MDC blocks (`::warning`, `::caution`, `::rest-api-version-only`), examples |

### Code Conventions

| Convention | Description |
|------------|-------------|
| Named exports only | No `export default` in `src/`; keeps the package tree-shakeable |
| Type imports | Always separate: `import type { X } from '…'` |
| Public surface | Every type/symbol meant for callers must re-export from [packages/jssdk/src/index.ts](packages/jssdk/src/index.ts) |
| Action surface | Reach REST through `b24.actions.vX.<name>.make({ method, params, requestId })`. The top-level shortcuts (`b24.callMethod`, `callBatch`, `callListMethod`, `fetchListMethod`, `callBatchByChunk`) are `@deprecated` — do not use them in new code |
| Result types | All transport methods return `Result` or `AjaxResult` — never raw axios responses |
| Paging | v2: `result.isMore()` + `result.getNext(b24.getHttpClient(ApiVersion.v2))`. v3: use `b24.actions.v3.callList.make(...)` / `fetchList.make(...)` (v3 has no `getNext`) |
| Errors | Throw `SdkError({ code, description, status })` for SDK-level invariants; HTTP errors are `AjaxError` and surface via `Result.getErrors()` |
| Logger | New modules hold a `LoggerInterface`, default to `LoggerFactory.createNullLogger()`, and accept a real logger through `setLogger(logger)` — not via the constructor |
| Limiters | New transport code paths must respect the limiter stack (`RateLimiter`, `OperatingLimiter`, `AdaptiveDelayer`) — do not bypass it |
| Enterprise | Treat the enterprise restriction params from `LicenseManager` as load-time switches; do not duplicate them |
| Build tokens | Use `__SDK_VERSION__` / `__SDK_USER_AGENT__` placeholders, never literal version strings |
| Pull protobuf | The auto-generated protobuf JS is intentionally eslint-ignored — do not "clean it up" |

## New Surface Workflow

Copy this checklist and track progress when adding a new public surface (manager, action, transport, helper, type module):

```
Surface: [name]
Progress:
- [ ] 1. Decide the entry point that owns it (B24Frame, B24Hook, B24OAuth, or shared in core)
- [ ] 2. Implement under packages/jssdk/src/<area>/  (named exports only)
- [ ] 3. Add / extend types under packages/jssdk/src/types/
- [ ] 4. Re-export from packages/jssdk/src/index.ts if part of the public contract
- [ ] 5. If transport-related: respect RateLimiter / OperatingLimiter / AdaptiveDelayer
- [ ] 6. Add integration test under test/integration/<area>/  (real portal, no mocks)
- [ ] 7. Add or update the matching docs page under docs/content/docs/
- [ ] 8. If the public API changed: check packages/jssdk-nuxt/src/runtime/plugin
- [ ] 9. Update README-AI.md if the change affects how callers should write code
- [ ] 10. Run pnpm run lint:fix
- [ ] 11. Run pnpm run typecheck
- [ ] 12. Run the relevant test filter (e.g. pnpm run package-jssdk:test-integration-core)
```

## PR Review Checklist

When reviewing PRs that touch `packages/jssdk/src/` or `test/`, verify:

```
PR Review:
- [ ] Follows the file layout in .github/contributing/package-structure.md
- [ ] No default exports introduced
- [ ] Transport changes respect the limiter stack and return Result / AjaxResult
- [ ] Errors use SdkError / AjaxError — no bare throws or stringly-typed errors
- [ ] Public API changes are re-exported from src/index.ts
- [ ] Public API changes have a deprecation cycle (no silent renames)
- [ ] Integration tests added / updated and hit a real portal (no response mocks)
- [ ] Matching docs page under docs/content/docs/ updated in the same PR
- [ ] Conventional commit message
- [ ] All checks pass (lint, typecheck, test)
```

## Before Submitting

- [ ] `pnpm run lint:fix` clean
- [ ] `pnpm run typecheck` passes
- [ ] Relevant Vitest project run is green against a real portal
- [ ] Documentation updated in the same PR if the public surface changed
- [ ] Commit messages follow Conventional Commits

Multiple commits are fine — PRs are squash merged, so no need to rebase or force push.

## Resources

- [README-AI.md](packages/jssdk/README-AI.md) — authoritative API guide for callers; read before generating SDK usage code
- [CLAUDE.md](CLAUDE.md) — general project guidance (commands, architecture, doc upkeep policy)
- [Bitrix24 REST API docs](https://apidocs.bitrix24.com/)
- [Repository on GitHub](https://github.com/bitrix24/b24jssdk)
