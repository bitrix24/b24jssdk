# AGENTS.md

<sub>Last reviewed: 2026-05-24.</sub>

This file is the single source of truth for AI coding agents and human contributors working on the `@bitrix24/b24jssdk` repository. The four detailed guides under `.github/contributing/` are referenced from the relevant sections below — load them only when they apply to your task.

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
│   │   │   ├── actions/            # b24.actions.vX.<call|batch|batchByChunk|callList|fetchList>.make()
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
│   ├── README-AI.md                # caller-facing API guide (being absorbed into this guide)
│   └── build.config.ts             # unbuild config (replaces __SDK_VERSION__ etc.)
├── jssdk-nuxt/                     # Nuxt module — only registers runtime/plugin
playgrounds/
├── cli/                            # Node smoke
└── nuxt/                           # Nuxt smoke (live SDK)
docs/
└── content/docs/                   # documentation site (English only)
test/
├── 0_setup/                        # integration + under-load setup, env loading
├── integration/                    # *.spec.ts — 30s timeouts, real portal
├── under-load/                     # sequential, 40-min timeouts
├── some-code-from-docs/            # manually mirrored snippets from docs/ (not auto-run)
└── umd/                            # browser smoke (browser.html)
scripts/
└── b24-self-task/                  # Python automation that drives Claude Code
```

## Architecture

The core SDK is organised around one abstract base + three concrete entry points:

- [packages/jssdk/src/core/abstract-b24.ts](packages/jssdk/src/core/abstract-b24.ts) — `AbstractB24` exposes the action surface (`b24.actions.vX.<name>.make()`) and owns the v2 + v3 HTTP clients, the restriction/rate-limiter stack, the logger, and helper sub-managers. The legacy shortcuts (`callMethod`, `callBatch`, `callListMethod`, `fetchListMethod`, `callBatchByChunk`) live on this class too but are `@deprecated` — see the `@removed` tag on each method for the target removal version. Do not call them from new code.
- [packages/jssdk/src/frame](packages/jssdk/src/frame) — `B24Frame`, used inside the Bitrix24 iframe. Talks to the parent window via `postMessage`, auto-refreshes auth on 401, and exposes UI managers (`auth`, `parent`, `slider`, `dialog`, `placement`, `options`). **Bootstrap only via `initializeB24Frame()`** in [packages/jssdk/src/loader-b24frame.ts](packages/jssdk/src/loader-b24frame.ts) — it deduplicates concurrent inits and parses `window.name` for the portal handshake. Do not expose an alternative constructor path.
- [packages/jssdk/src/hook](packages/jssdk/src/hook) — `B24Hook` for server-side webhook auth (`B24Hook.fromWebhookUrl(url)`). **Must only be used in server-side (Node.js / edge runtime) code.** A webhook URL contains a secret access key; shipping it in a browser bundle exposes the key to every visitor. The class emits a runtime warning when it detects a browser context — do not suppress it with `offClientSideWarning()`.
- [packages/jssdk/src/oauth](packages/jssdk/src/oauth) — `B24OAuth` for OAuth-based local apps; manages refresh-token errors.

Cross-cutting modules:

- [packages/jssdk/src/core/http](packages/jssdk/src/core/http) — `AbstractHttp` transport (axios-based) implementing `TypeHttp`, `AjaxResult` / `AjaxError`, and the limiter stack: `RateLimiter`, `OperatingLimiter`, `AdaptiveDelayer`, `ParamsFactory`. URL patterns: v2 → `/rest/<method>.json`, v3 → `/rest/v3/<method>`. `Result` and `AjaxResult` are the uniform return types — v2 paging uses `isMore()` + `getNext(b24.getHttpClient(ApiVersion.v2))`; v3 has no `getNext` and uses `actions.v3.callList.make` / `fetchList.make` instead. There is no `b24.http` field — always go through `b24.getHttpClient(version)`. Credentials in request payloads are redacted before reaching the logger via [packages/jssdk/src/core/http/redact.ts](packages/jssdk/src/core/http/redact.ts).
- [packages/jssdk/src/helper](packages/jssdk/src/helper) — `B24HelperManager` aggregates `profile`, `app`, `payment`, `license`, `currency`, and `options` sub-managers (each extending [packages/jssdk/src/helper/abstract-helper.ts](packages/jssdk/src/helper/abstract-helper.ts)). `useB24Helper()` is a closure-based composable that wires lifecycle (init/destroy) and Pull client subscription. `LicenseManager` automatically swaps in enterprise restriction params.
- [packages/jssdk/src/pullClient](packages/jssdk/src/pullClient) — Pull (push) client with WebSocket + long-polling connectors, channel manager, JSON-RPC, and protobuf decoders (the protobuf JS files are eslint-ignored — see [eslint.config.mjs](eslint.config.mjs)).
- [packages/jssdk/src/types](packages/jssdk/src/types) — public types and enums (CRM, catalog, bizproc, event, placement, pull, payloads, etc.). Prefer importing enums like `EnumCrmEntityTypeId` from the package root.
- [packages/jssdk/src/tools](packages/jssdk/src/tools) — `Text` (Luxon dates, number/format helpers, UUID v7), `Type` runtime guards, `Browser`, `useFormatters`, `pick / omit / getEnumValue`, scroll/environment utilities.
- [packages/jssdk/src/logger](packages/jssdk/src/logger) — `LoggerBrowser.build(name, isDev)` + `LoggerFactory`. `AbstractB24` defaults to `LoggerFactory.createNullLogger()`; a real logger is installed via `b24.setLogger(logger)`.
- The build-time tokens `__SDK_VERSION__` and `__SDK_USER_AGENT__` are replaced by unbuild ([packages/jssdk/build.config.ts](packages/jssdk/build.config.ts)).

The Nuxt module ([packages/jssdk-nuxt/src/module.ts](packages/jssdk-nuxt/src/module.ts)) is intentionally tiny — it only registers [packages/jssdk-nuxt/src/runtime/plugin.ts](packages/jssdk-nuxt/src/runtime/plugin.ts). Any new SDK surface that needs Nuxt auto-import / SSR handling has to be wired through that runtime plugin.

> **Keep this section current.** When you add a new cross-cutting module or change the responsibility boundary of an existing one, update this Architecture section in the same PR — the contributing guides are detailed references, but Architecture is the only top-level map agents read by default.

## Commands

Run from the repo root unless noted. All scripts go through pnpm workspaces — never `npm`/`yarn`. Use `pnpm --filter <path>` for package-scoped commands.

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

Two Vitest projects, defined in [vitest.config.ts](vitest.config.ts):

- `jsSdk:integration` — `test/integration/**/*.spec.ts`, 30s timeouts, hits a real portal.
- `jsSdk:underLoad` — `test/under-load/**.spec.ts`, sequential, 40-min timeouts.

Both projects load `.env.test` (gitignored). Copy `.env.test-example` and set `B24_HOOK` to a real webhook URL — the underlying client constructor in [test/0_setup/setup-integration-jssdk.ts](test/0_setup/setup-integration-jssdk.ts) throws without it. In tests, reach this client through `setupB24Tests()` from [test/0_setup/hooks-integration-jssdk.ts](test/0_setup/hooks-integration-jssdk.ts) — see [`.github/contributing/testing.md`](.github/contributing/testing.md) for the canonical pattern.

**Webhook scopes.** The webhook needs at minimum `crm`, `tasks`, `user`, `im`, and `main`. The `im` scope is required by the issue-23 regression spec (`im.chat.get` inside a batch); `main` is a non-obvious scope (not exposed in the standard webhook scope picker) required by the v3 batch-ref spec that calls `main.eventlog.list`. Add it manually.

```bash
pnpm run package-jssdk:test                       # watch, integration project
pnpm run package-jssdk:test:run                   # one-shot, integration project
pnpm run package-jssdk:test-integration-core      # filter by name "core"
pnpm run package-jssdk:test-integration-js-docs   # filter by name "js-docs"

# Under-load runners (each targets one named scenario — see package.json for the full list)
pnpm run package-jssdk:test:run-underLoad-v3-call
pnpm run package-jssdk:test:run-underLoad-v3-batch
pnpm run package-jssdk:test:run-underLoad-v2-call-with-operating

# Single test by name from the root:
pnpm vitest run --project jsSdk:integration -t "<test name>"
```

**Tests hit real Bitrix24 REST endpoints — never mock responses.** They validate API contracts, so a passing mocked test would defeat the suite's purpose.

**Exception — `*.unit.spec.ts` files inside `test/integration/`.** A small number of regression specs (`batch-null-result.unit.spec.ts`, `http-logger-redaction.unit.spec.ts`, `retry-client-error.unit.spec.ts`) exercise pure-logic invariants that have nothing to verify against a live portal. They live in the `jsSdk:integration` project but mock the axios client / construct SDK primitives in isolation, so they run without `.env.test` / `B24_HOOK`. Use this naming when the test is about the **SDK's internal behaviour**, not about the REST contract.

**CI does not run integration tests.** The CI workflow (`.github/workflows/`) only runs `lint`, `typecheck`, and `build`. Vitest is your local-only responsibility — make sure the relevant test filter is green against a real portal before pushing.

## Key Conventions

- **Conventional Commits**: `feat`/`fix` for behaviour, `docs`/`chore` otherwise (e.g. `feat(http): add adaptive delayer`, `fix(frame): refresh auth on 401`). The CHANGELOG is generated from these.
- **No default exports**: every export is named so consumers stay tree-shakeable (`sideEffects: false`).
- **TypeScript strict**: `tsc` for the core SDK; `vue-tsc` for the Nuxt / docs / playground projects.
- **Public contract**: exports from [packages/jssdk/src/index.ts](packages/jssdk/src/index.ts) are a public API. Any breaking change needs a deprecation cycle, not a silent rename.
- **Cross-package awareness**: when you change the core SDK API, check whether [packages/jssdk-nuxt/src/runtime/plugin.ts](packages/jssdk-nuxt/src/runtime/plugin.ts) needs an update.
- **Code formatting**: `@nuxt/eslint-config` (flat) with stylistic overrides — 2-space indent, no trailing commas, 1tbs braces. `.editorconfig` enforces LF + 2 spaces. The protobuf JS files in `packages/jssdk/src/pullClient` are eslint-ignored intentionally.
- **Build tokens**: `__SDK_VERSION__` and `__SDK_USER_AGENT__` are replaced at build time by [packages/jssdk/build.config.ts](packages/jssdk/build.config.ts). Do not hard-code versions.
- **English only** in code, comments, and documentation pages.

## SDK Source (`packages/jssdk/src/` and `test/`)

The references and code conventions below apply specifically when working on files under `packages/jssdk/src/` or `test/`. They do not apply to `docs/`, `playgrounds/`, or the Nuxt module.

### References

Load these based on your task. **Do not load all files at once** — only load what's relevant.

| File | Topics |
|------|--------|
| **[.github/contributing/package-structure.md](.github/contributing/package-structure.md)** | File layout in `packages/jssdk/src/`, AbstractB24-derived classes, managers, public-export rules |
| **[.github/contributing/transports-and-results.md](.github/contributing/transports-and-results.md)** | `AbstractHttp` v2 / v3 transports, `Result` / `AjaxResult` / `AjaxError` / `SdkError`, the limiter stack, `ParamsFactory` presets, paging, batch semantics, log redaction |
| **[.github/contributing/testing.md](.github/contributing/testing.md)** | Vitest projects (integration + under-load), `.env.test`, `setupB24Tests()`, naming filters, no-mock policy + `*.unit.spec.ts` exception |
| **[.github/contributing/documentation.md](.github/contributing/documentation.md)** | `docs/content/docs/` Markdown structure, frontmatter (`links`, `category`, `restApiVersion`), MDC blocks (`::warning`, `::caution`, `::rest-api-version-only`), examples |

### Code Conventions

| Convention | Description |
|------------|-------------|
| Named exports only | No `export default` in `src/`; keeps the package tree-shakeable |
| Type imports | Always separate: `import type { X } from '…'` |
| Public surface | Every type / symbol meant for callers must re-export from [packages/jssdk/src/index.ts](packages/jssdk/src/index.ts) |
| Action surface | Reach REST through `b24.actions.vX.<name>.make({ method, params, requestId })`. The top-level shortcuts (`b24.callMethod`, `callBatch`, `callListMethod`, `fetchListMethod`, `callBatchByChunk`) are `@deprecated` (see `@removed` tag on each method) — do not use them in new code |
| Result types | All transport methods return `Result` or `AjaxResult` — never raw axios responses |
| Paging | v2: `result.isMore()` + `result.getNext(b24.getHttpClient(ApiVersion.v2))`. v3: use `b24.actions.v3.callList.make(...)` / `fetchList.make(...)` (v3 has no `getNext`) |
| Errors | Throw `SdkError({ code, description, status })` for SDK-level invariants; HTTP errors are `AjaxError` and surface via `Result.getErrors()` |
| Logger | New modules hold a `LoggerInterface`, default to `LoggerFactory.createNullLogger()`, and accept a real logger through `setLogger(logger)` — not via the constructor. Suppression of warnings (e.g. `offClientSideWarning()`) is for testing only — never call it in production code |
| Limiters | New transport code paths must respect the limiter stack (`RateLimiter`, `OperatingLimiter`, `AdaptiveDelayer`) — do not bypass it. HTTP 4xx is automatically classified as non-retryable; `hardErrorCodes` is for HTTP 2xx domain-level error codes the SDK doesn't recognise as terminal |
| Enterprise | Treat the enterprise restriction params from `LicenseManager` as load-time switches; do not duplicate them |
| Build tokens | Use `__SDK_VERSION__` / `__SDK_USER_AGENT__` placeholders, never literal version strings |
| Deprecation | Mark with JSDoc `@deprecated`, add `@removed X.Y.Z` and (if useful) `@memo` tags, and emit a runtime warning with `LoggerFactory.forcedLog(this._logger, 'warning', { … })`. See `abstract-b24.ts` for the canonical pattern |
| Pull protobuf | The auto-generated protobuf JS is intentionally eslint-ignored — do not "clean it up" |

## Workflows

### Adding a New Surface (manager, action, transport, helper, type module)

Copy this checklist and track progress:

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
- [ ] 8. If the public API changed: check packages/jssdk-nuxt/src/runtime/plugin.ts
- [ ] 9. Run pnpm run lint:fix
- [ ] 10. Run pnpm run typecheck
- [ ] 11. Run the relevant test filter (e.g. pnpm run package-jssdk:test-integration-core)
```

### Adding a REST Method to an Existing Action

The lightweight path for the most common change — calling a new REST method from caller code or wrapping it in a tiny helper. The full New Surface workflow above is overkill here.

```
Method: [rest.method.name]
Progress:
- [ ] 1. Determine v2 or v3 (default v3 if available; v2 logs a deprecation warning when v3 exists)
- [ ] 2. Call b24.actions.vX.call.make({ method, params, requestId }) from your code, or add a typed helper if used in 3+ places
- [ ] 3. Add an integration test under test/integration/<area>/ tagged @apiVx (real portal, no mocks)
- [ ] 4. Update the matching docs page under docs/content/docs/ — parameter table, signature block, examples
- [ ] 5. Run pnpm run lint:fix and pnpm run typecheck
- [ ] 6. Run the relevant test filter locally
```

**Switch to the New Surface workflow** if step 2 grows beyond a single typed helper — i.e. the change introduces a new public type, a new manager class, or a new re-export from `packages/jssdk/src/index.ts`. At that point you owe the full lifecycle (types, Nuxt-module check, README-AI sync).

## PR Review Checklist

When reviewing PRs that touch `packages/jssdk/src/` or `test/`, verify:

```
PR Review:
- [ ] Follows the file layout in .github/contributing/package-structure.md
- [ ] No default exports introduced
- [ ] Transport changes respect the limiter stack and return Result / AjaxResult
- [ ] Errors use SdkError ({ code, description, status }) / AjaxError — no bare throws or string-form SdkError
- [ ] Public API changes are re-exported from src/index.ts
- [ ] Public API changes have a deprecation cycle (no silent renames): JSDoc @deprecated + @removed tag + LoggerFactory.forcedLog warning
- [ ] Frame changes bootstrap only through initializeB24Frame() (no alternative constructor paths)
- [ ] Helper sub-managers extend AbstractHelper and follow the constructor(b24: TypeB24) + setLogger() shape
- [ ] B24Hook usage is server-side only; no logs of raw request URLs (which contain webhook secrets in the path)
- [ ] Integration tests added / updated and hit a real portal (no response mocks, except *.unit.spec.ts for pure-logic invariants)
- [ ] Matching docs page under docs/content/docs/ updated in the same PR
- [ ] If the change alters a pattern documented in .github/contributing/, the relevant guide is updated in the same PR
- [ ] Conventional commit message
- [ ] All local checks pass (lint, typecheck, relevant test filter)
```

## Documentation Upkeep

After any code change that alters a public API (signatures, accepted parameters, return shapes, runtime behaviour, error codes, or warnings emitted), update the matching Markdown page under `docs/content/docs/`. The docs site is the public source of truth — out-of-date docs are treated as a bug equal to a broken test.

- Find the page that documents the changed surface (e.g. `2.call-list-rest-api-ver2.md` for `CallListV2`, `2.fetch-list-rest-api-ver3.md` for `FetchListV3`). Each page links to its source file in the front-matter `links:` section — use that to confirm the mapping.
- All documentation prose, parameter tables, code samples, and notes must be written in **English**.
- Sync these sections in particular: the parameter table (types and descriptions), the **Method Signature** block, the **Limitations** / **Key Concepts** notes, and any runnable example that uses the changed surface.
- If the change introduces a new `warning`/`error` log message or a new `SdkError` code, mention it in the relevant section (Limitations, Error Handling, or Key Concepts) so users can recognise it.
- Documentation updates belong in the same commit/PR as the code change. Use a `docs:` commit only when the change is documentation-only.

### REST page skeleton (action / tools categories)

Pages with `category: actions` or `category: tools` follow a fixed section order. The lint script `pnpm run docs:lint-pages` enforces this. **Required, in order:**

1. `## Overview`
2. `## Method Signature`
3. `## Examples`
4. `## Alternatives and Recommendations`

`## Error Handling` is recommended (warned if missing) and conventionally placed between `## Method Signature` and `## Examples`. `## Key Concepts`, `## Limitations`, and `## Performance Optimization` are optional but, when present, conventionally appear before `## Examples`. Cookbook recipes under `docs/content/docs/99.examples/` follow a separate, lighter skeleton (`Goal → Stack → Full Example → Run It → How It Works → Limitations → See also`) and are not skeleton-linted.

### `audited:` frontmatter

Every action / tools page should carry an `audited: YYYY-MM-DD` field stating the date its content was verified against the linked source. `pnpm run docs:lint-pages` extracts every `https://github.com/bitrix24/b24jssdk/blob/main/<path>` from the page's `links:` array, runs `git log -1 --format=%cI -- <path>`, and warns if any source's last commit is newer than `audited`. When you sync a page after a code change, bump `audited` to today's date in the same commit. Use `pnpm run docs:lint-pages:strict` in CI gates that should fail on stale pages.

`pnpm run docs:lint-links` is the companion check — validates every internal `](/docs/...)` and frontmatter `to: /docs/...` against the actual file tree, and validates `#fragment` parts against actual page headings (slugified the way Nuxt Content does at runtime, including the `-1` / `-2` suffixes github-slugger emits on duplicate headings).

## Git Workflow

- Branch from `main` before code changes. Naming: `ai/<description>` (lowercase, hyphens) — e.g. `ai/add-auth-helper`, `ai/fix-validation`. Branches created automatically by Claude Code on the web carry a `claude/<description>` prefix instead — both prefixes are acceptable.
- No branch needed for search / read / exploration.
- Before commit: `pnpm run lint:fix` and `pnpm run typecheck` must both pass.
- Keep commit messages clear and Conventional-Commits compliant.

## Before Submitting

- [ ] `pnpm run lint:fix` clean
- [ ] `pnpm run typecheck` passes
- [ ] Relevant Vitest project run is green against a real portal (CI does not run tests)
- [ ] Documentation updated in the same PR if the public surface changed
- [ ] If a pattern documented in `.github/contributing/*.md` changed, the matching guide is updated in the same PR
- [ ] If you touched `AGENTS.md` or any guide under `.github/contributing/` (or `.claude/bitrix24-rest-v3-reference.md`), refresh the `Last reviewed` stamp at the top to today's date
- [ ] Commit messages follow Conventional Commits

Multiple commits are fine — PRs are squash-merged, so no need to rebase or force-push.

## Resources

> **Conflict resolution.** This `AGENTS.md` is the canonical agent-facing guide. The four guides under `.github/contributing/` are authoritative for their respective scopes. [packages/jssdk/README-AI.md](packages/jssdk/README-AI.md) is the current caller-facing API guide and is being progressively absorbed into this guide and the contributing files — when its content disagrees with this guide, this guide wins.

- [packages/jssdk/README-AI.md](packages/jssdk/README-AI.md) — current caller-facing API guide (transitional)
- [Bitrix24 REST API docs](https://apidocs.bitrix24.com/)
- [Repository on GitHub](https://github.com/bitrix24/b24jssdk)
