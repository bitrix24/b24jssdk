# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`@bitrix24/b24jssdk` — JS/TS SDK for the Bitrix24 REST API. pnpm 10 monorepo with workspaces:

- `packages/jssdk` — core SDK (published as `@bitrix24/b24jssdk`). Ships ESM + UMD only (no CJS) since v0.4.0.
- `packages/jssdk-nuxt` — thin Nuxt module wrapper that registers a runtime plugin.
- `docs/` — Nuxt-based documentation site (deployed to GitHub Pages).
- `playgrounds/cli` and `playgrounds/nuxt` — manual smoke environments.
- `test/` — workspace-level Vitest projects (integration + under-load).
- `scripts/b24-self-task` — Python automation that drives Claude Code from a Bitrix24 task.

Read `AGENTS.md` for the full agent-facing convention list. Read `packages/jssdk/README-AI.md` before generating SDK usage code — it is the authoritative API guide for callers.

## Commands

Run from the repo root unless noted. All scripts go through pnpm workspaces.

```bash
pnpm install                        # bootstrap
pnpm run dev:prepare                # build/stub all packages so workspaces resolve

# Core SDK
pnpm run package-jssdk:build        # build packages/jssdk (esm + umd + umd-min via unbuild)
pnpm run package-jssdk:typecheck    # tsc --noEmit on the SDK
pnpm run package-jssdk:lint         # eslint inside the SDK

# Nuxt module
pnpm run package-jssdk-nuxt:build
pnpm run package-jssdk-nuxt:typecheck

# Docs / playgrounds
pnpm run docs:dev                   # docs site dev server
pnpm run playground-nuxt:dev        # Nuxt playground (live SDK)

# Repo-wide
pnpm run lint                       # eslint .
pnpm run lint:fix                   # eslint . --fix  (run before commit)
pnpm run typecheck                  # typecheck every workspace sequentially
```

### Tests

Vitest workspace projects are defined in `vitest.config.ts`:

- `jsSdk:integration` — `test/integration/**/*.spec.ts`, 30s timeouts, hits a real portal.
- `jsSdk:underLoad` — `test/under-load/**.spec.ts`, sequential, 40-min timeouts.

Both projects load `.env.test` (gitignored). Copy `.env.test-example` and set `B24_HOOK` to a real webhook URL — `setupB24Client()` in [test/0_setup/setup-integration-jssdk.ts](test/0_setup/setup-integration-jssdk.ts) throws without it. The webhook needs at least `crm`, `tasks`, `user`, and `im` scopes; the `im` scope is required by the issue-23 regression spec (`im.chat.get` inside a batch).

```bash
pnpm run package-jssdk:test                           # watch, integration project
pnpm run package-jssdk:test:run                       # run once, integration project
pnpm run package-jssdk:test-integration-core          # filter by name "core"
pnpm run package-jssdk:test-integration-js-docs       # filter by name "js-docs"

# Under-load runners (each targets one named scenario)
pnpm run package-jssdk:test:run-underLoad-v3-call
pnpm run package-jssdk:test:run-underLoad-v3-batch
pnpm run package-jssdk:test:run-underLoad-v2-call-with-operating
# (see package.json for the full list)
```

Single test by name from the root: `pnpm vitest run --project jsSdk:integration -t "<test name>"`.

**Tests hit real Bitrix24 REST endpoints — never mock responses.** They validate API contracts, so a passing mocked test would defeat the suite's purpose.

## Architecture

The core SDK is organised around one abstract base + three concrete entry points:

- [packages/jssdk/src/core/abstract-b24.ts](packages/jssdk/src/core/abstract-b24.ts) — `AbstractB24` exposes the REST surface (`callMethod`, `callBatch`, `callListMethod`, `fetchListMethod`, `callBatchByChunk`) and owns the v2 + v3 HTTP clients, restriction/rate limiters, logger, and helper managers (`actions`, `tools`).
- [packages/jssdk/src/frame](packages/jssdk/src/frame) — `B24Frame`, used inside the Bitrix24 iframe. Talks to the parent window via `postMessage`, auto-refreshes auth on 401, and exposes UI managers (`auth`, `parent`, `slider`, `dialog`, `placement`, `options`). Bootstrap only via `initializeB24Frame()` in [packages/jssdk/src/loader-b24frame.ts](packages/jssdk/src/loader-b24frame.ts) — it deduplicates concurrent inits and parses `window.name` for the portal handshake.
- [packages/jssdk/src/hook](packages/jssdk/src/hook) — `B24Hook` for server-side webhook auth (`B24Hook.fromWebhookUrl(url)`). Warns when used in the browser.
- [packages/jssdk/src/oauth](packages/jssdk/src/oauth) — `B24OAuth` for OAuth-based local apps; manages refresh-token errors.

Cross-cutting modules:

- [packages/jssdk/src/core/http](packages/jssdk/src/core/http) — `Http` transport (axios-based), `AjaxResult`/`AjaxError`, and the limiter stack: `RateLimiter`, `OperatingLimiter`, `AdaptiveDelayer`, `ParamsFactory` (`getDefault()`, presets for enterprise). `Result` and `AjaxResult` are the uniform return types — paging uses `isMore()` + `getNext(httpClient)`.
- [packages/jssdk/src/helper](packages/jssdk/src/helper) — `B24HelperManager` aggregates `profile`, `app`, `payment`, `license`, `currency`, and `options` managers. `useB24Helper()` is a closure-based composable that wires lifecycle (init/destroy) and Pull client subscription. `LicenseManager` automatically swaps in enterprise restriction params.
- [packages/jssdk/src/pullClient](packages/jssdk/src/pullClient) — Pull (push) client with WebSocket + long-polling connectors, channel manager, JSON-RPC, and protobuf decoders (the protobuf JS files are eslint-ignored — see [eslint.config.mjs](eslint.config.mjs)).
- [packages/jssdk/src/types](packages/jssdk/src/types) — public types and enums (CRM, catalog, bizproc, event, placement, pull, payloads, etc.). Prefer importing enums like `EnumCrmEntityTypeId` from the package root.
- [packages/jssdk/src/tools](packages/jssdk/src/tools) — `Text` (Luxon dates, number/format helpers, UUID v7), `Type` runtime guards, `Browser`, `useFormatters`, `pick/omit/getEnumValue`, scroll/environment utilities.
- [packages/jssdk/src/logger](packages/jssdk/src/logger) — `LoggerBrowser.build(name, isDev)` + `LoggerFactory`. `AbstractB24` defaults to a null logger.
- The build-time tokens `__SDK_VERSION__` and `__SDK_USER_AGENT__` are replaced by unbuild ([packages/jssdk/build.config.ts](packages/jssdk/build.config.ts)).

The Nuxt module ([packages/jssdk-nuxt/src/module.ts](packages/jssdk-nuxt/src/module.ts)) is intentionally tiny — it only registers `runtime/plugin`. Any new SDK surface that needs Nuxt auto-import / SSR handling has to be wired through that runtime plugin. **When you change the core SDK API, check whether the Nuxt module needs an update.**

The SDK is client-facing. Treat exports from `packages/jssdk/src/index.ts` as a public contract: any breaking change needs a deprecation cycle, not a silent rename.

## Conventions

- pnpm workspaces only — never `npm`/`yarn`. Use `pnpm --filter <path>` for package-scoped commands.
- TypeScript strict; `vue-tsc` for the Nuxt/docs/playground projects, `tsc` for the core SDK.
- ESLint config = `@nuxt/eslint-config` (flat) with stylistic overrides: 2-space indent, no trailing commas, 1tbs braces, no `multi-word-component-names`. `.editorconfig` enforces LF + 2-space.
- No default exports; everything is named so packages stay tree-shakeable (`sideEffects: false`).
- Conventional Commits — `feat`/`fix` for behaviour, `docs`/`chore` otherwise. The CHANGELOG is generated from these.

## Documentation upkeep

After any code change that alters a public API (signatures, accepted parameters, return shapes, runtime behaviour, error codes, or warnings emitted), update the matching Markdown page under `docs/content/docs/`. The docs site is the public source of truth — out-of-date docs are treated as a bug equal to a broken test.

- Find the page that documents the changed surface (e.g. `2.call-list-rest-api-ver2.md` for `CallListV2`, `2.fetch-list-rest-api-ver3.md` for `FetchListV3`). Each page links to its source file in the front-matter `links:` section — use that to confirm the mapping.
- All documentation prose, parameter tables, code samples, and notes must be written in **English**.
- Sync these sections in particular: the parameter table (types and descriptions), the **Method Signature** block, the **Limitations** / **Key Concepts** notes, and any runnable example that uses the changed surface.
- If the change introduces a new `warning`/`error` log message or a new `SdkError` code, mention it in the relevant section (Limitations, Error Handling, or Key Concepts) so users can recognise it.
- Documentation updates belong in the same commit/PR as the code change. Use a `docs:` commit only when the change is documentation-only.

## Git workflow

- Branch from `main` before code changes. Naming: `ai/<description>` (lowercase, hyphens) — e.g. `ai/add-auth-helper`, `ai/fix-validation`.
- No branch needed for search/read/exploration.
- Before commit: `pnpm run lint:fix` and `pnpm run typecheck` must both pass.
- Keep commit messages clear and Conventional-Commits compliant.
