# Changelog

## [Unreleased]

### Features

* **core:** `Result.getErrorsByKey()` / `getErrorMessagesByKey()` — keyed error accessors that preserve the batch request label (`Record<string, Error>` / `Record<string, string>`), so `isHaltOnError: false` callers can tell which request failed. Existing `getErrors()` / `getErrorMessages()` are unchanged (#184)

### Bug Fixes

* **http:** a 401 `expired_token` / `invalid_token` response now refreshes the token and retries the request once on every entry point (`B24Frame`, `B24OAuth`, `B24Hook`). Previously the auth-retry branch was silently skipped, so the 401 surfaced to the caller on the first attempt — e.g. a long-lived Frame app idling past the access-token TTL (#182)
* **actions:** `callList` / `fetchList` (v2 and v3) gain a `cursorIdKey` option so keyset pagination works when a method sorts/filters by one field name but returns another — e.g. `tasks.task.list` sorts by `ID` (uppercase) yet returns a lowercase `id`. Previously the single `idKey` drove both the request cursor and the response read, so the default silently stopped after the first 50 records (the `b24jssdk-rest` skill cheat sheet recommended that broken config — now corrected). The helpers now also log a `warning` when a full page is returned but no numeric id can be read via `idKey` (#185)

### Security

* **deps:** pin `esbuild` to `>=0.28.1` via a pnpm override — clears the high-severity advisory GHSA-gv7w-rqvm-qjhr (esbuild's Deno module fetched its native binary without integrity verification → RCE via `NPM_CONFIG_REGISTRY`; affected `>=0.17.0 <0.28.1`) that `pnpm audit --audit-level=high` was failing CI on repo-wide. esbuild is a transitive build dependency (Vite / Nuxt tooling); all instances collapse to a single 0.28.1. The path was already unreachable here (Node-only project, and `allowBuilds: esbuild: false` blocks esbuild's install script) — the override clears the audit gate and adds defense-in-depth (#196)

### Chore

* **docs-lint:** audit-freshness now tracks source-code link targets only — Markdown sources (skills, `AGENTS.md`, `CHANGELOG.md`) no longer staleify the pages that cite them, removing the 1→N `audited:` bump cascade on every skill/changelog edit (#190)
* **nuxt:** the Nuxt module's `meta.version` is now injected from `package.json` at build time via the `__SDK_VERSION__` token (matching the core SDK) instead of a hand-maintained literal in `module.ts`, so `release:bump` can no longer leave it stale; CI and the publish workflow both fail if the token is left unreplaced (#119)
* **ci:** a release now runs through a single `release.yml` — one CI invocation instead of two, then `@bitrix24/b24jssdk` and `@bitrix24/b24jssdk-nuxt` publish sequentially (core first, since the Nuxt module depends on the released core version) behind a combined status gate, so a partial release turns the run red instead of passing unnoticed. Replaces the two separate `npm-publish-*` workflows; CI also gained an `actionlint` gate so workflow errors are caught on PRs (#177)
* **ci:** the docs site is built once per push to `main` — `deploy.yml` is removed and its Pages build + deploy fold into `ci.yml` (the `docs-build` job uploads the Pages artifact; a new `deploy` job ships it), eliminating the duplicate `docs:generate` that previously ran in both workflows on every main push. PRs still validate the docs build (#111)
* **docs:** add a [`RELEASING.md`](RELEASING.md) runbook — the bump → changelog → tag → publish flow (single `release.yml`, npm OIDC trusted publishing, partial-release recovery) plus a bus-factor/handover checklist, so cutting a release is no longer tribal knowledge — though the account-level items (a second npm publisher and a `CODEOWNERS` file) still need a repo/org admin (#171)
* **ci:** `release.yml` now publishes pre-release versions (e.g. `1.3.0-rc.1`) under the `next` dist-tag instead of `latest`, so a pre-release can't move `npm install` consumers off the last stable release; stable releases are unaffected (#198)

## [1.2.0](https://github.com/bitrix24/b24jssdk/compare/v1.1.2...v1.2.0) (2026-05-29)

### Features

* **skills:** new public [`skills/`](https://github.com/bitrix24/b24jssdk/tree/main/skills) directory with 7 task-focused skill files for AI coding agents — `b24jssdk-core`, `b24jssdk-rest`, `b24jssdk-filtering`, `b24jssdk-frame-ui`, `b24jssdk-helpers`, `b24jssdk-recipes`, `b24jssdk-vibecode`. Designed for selective consumption (load only what the current task needs). Landing page: [/docs/getting-started/ai/skills](https://bitrix24.github.io/b24jssdk/docs/getting-started/ai/skills/) (#38, #114)
* **examples:** 12 end-to-end SDK-native recipes published at [/docs/examples](https://bitrix24.github.io/b24jssdk/docs/examples/) — CRM analytics, mass messaging, task automation, ERP sync, disk files, Telegram bot, webhook handler, AI assistant, web-search LLM, error-handling cookbook, outbound event registration, OAuth install. Each recipe ships as a typed `.ts` file under `skills/b24jssdk-recipes/examples/`, type-checked in CI via `pnpm run skills:typecheck` (#38)
* **docs(reference):** 29 new reference pages covering `B24Hook`, `B24OAuth`, frame sub-managers (`auth`, `dialog`, `slider`, `placement`, `parent`, `options`, `initializeB24Frame`), pull client, core/tools/types, error codes, telemetry, plus 3 worked examples (#114)

### Bug Fixes

* **http:** stop retrying HTTP 4xx client errors. Retryability was decided by a hardcoded error-code allowlist, so any 4xx whose code was not enumerated (e.g. v3 validation errors, `tasks.task.pause` code `1048582`) fell through and burned `maxRetries` round-trips on a deterministic failure. `RestrictionManager.handleError` now gates on HTTP status: 4xx (except `429` rate/operating limit and `408` request timeout) fails fast on the first attempt. Soft codes still surface via `AjaxResult`. Closes #44, #46 (#45)

### Security

* **deps:** bump `nuxt` to `^4.4.6` across all workspaces — fixes reflected XSS in `navigateTo()` external redirects (GHSA-fx6j-w5w5-h468) and shared-cache poisoning via `__nuxt_island` endpoint (GHSA-g8wj-3cr3-6w7v) (#86)
* **deps:** add pnpm overrides for transitive vulnerabilities — `fast-uri >=3.1.2` (path traversal GHSA-q3j6-qgpj-74h6, host confusion GHSA-v39h-62p7-jpjc), `devalue >=5.8.1` (DoS sparse array GHSA-77vg-94rm-hx3p), `hono >=4.12.18` (CSS injection, cache leakage, JWT validation GHSA-qp7p-654g-cw7p), `ws >=8.20.1` (memory disclosure GHSA-58qx-3vcg-4xpx), `qs >=6.15.2` (DoS stringify GHSA-q8mj-m7cp-5q26), `ip-address >=10.1.1` (XSS GHSA-v2v4-37r5-5v8g), `brace-expansion >=5.0.6` (DoS GHSA-jxxr-4gwj-5jf2) (#86)

### Chore

* **deps:** upgrade pnpm `10.33.2` → `11.4.0`; migrate overrides from `package.json` to `pnpm-workspace.yaml` (pnpm v11 requirement) (#86)
* **pnpm-workspace:** replace deprecated `ignoredBuiltDependencies` / `onlyBuiltDependencies` with `allowBuilds` map (pnpm v11 requirement) (#86)
* **vitest:** add `jsSdk:unit` project for portal-free unit tests; exclude `*.unit.spec.ts` from `jsSdk:integration` to prevent duplicate test execution (#86)
* **ci:** add unit-test step (`vitest run --project jsSdk:unit`) and security-audit step (`pnpm audit --prod --audit-level=high`) to CI workflow (#86)
* **ci:** parallelize lint, typecheck, build, and docs-build jobs (#92)
* **ci(docs):** type-check TS code blocks in `docs/content/docs/` (104 blocks, 0 errors) (#87)
* **test(some-code-from-docs):** compile-check canonical contributing snippets (#88)

### Docs

* **agents:** introduce `AGENTS.md` and `.github/contributing/` guides (`package-structure.md`, `transports-and-results.md`, `testing.md`, `documentation.md`, `maintenance.md`, `report.md`, `suggested-examples.md`), `CLAUDE.md` reduced to a single-line redirect to `AGENTS.md` (#35, #59, #114)
* **README:** full rewrite — badges, three entry points (`B24Hook` / `B24Frame` / `B24OAuth`), Quick Start (#114)
* **cookbook:** 5 cookbook recipes + REST page lint + `audited:` freshness contract (#36)
* **examples landing:** refresh `/docs/examples` to list all 20 recipes — Cookbook (5) / Extended catalogue (12) / UI showcases (3) (#116)
* **logging:** document credential redaction in HTTP layer (#67), log-archive audit patterns + logging hygiene cross-link (#75)
* **examples (code align):** align inline TS examples with v1.1.0 / v1.1.1 type changes (#37)
* **homepage:** examples nav cleanup, top-nav entry, cookbook + extended-catalogue sections (#104), card hover polish (#107), vite optimizeDeps + homepage improvements (#115)
* **prerender / 404:** register 12 recipe pages in prerender list (#95), resolve remaining `docs:generate` failures (#99), absolute paths in examples index (#101), GitHub Pages 404 for trailing-slash URLs (#100)
* **maintenance:** weekly `llms-full.txt` triage playbook (#97), VibeCode sync playbook v2 (#98)
* **contributing:** reflect v1.1.2 transport hardening in `transports-and-results.md` (#76)
* **skills relocation cleanup:** repair 43 stale frontmatter `links:` after `.claude/skills/` → `skills/` relocation (#116)

## [1.1.2](https://github.com/bitrix24/b24jssdk/compare/v1.1.1...v1.1.2) (2026-05-18)

### Security

* **http:** stop logging the full webhook URL in the `post/send` info-level log — only the bare REST method name (e.g. `user.current`) enters the logger context, preventing webhook-secret disclosure to user-supplied loggers wired via `B24Hook.setLogger(...)`. The `post/response` and `post/catchError` callsites stay URL-free as well. (#39)
* **http:** redact credential-bearing keys (`auth`, `password`, `token`, `secret`, `access_token`, `refresh_token`) from the serialised `params` blob that enters the `post/send` info log. Closes a smear path for `B24OAuth`/`B24Frame` where `_prepareParams` injects `auth = access_token` into the request body on every call. (#39)
* **http\AjaxError:** redact the same credential-bearing keys from `requestInfo.params` at error-construction time so they do not leak via `AjaxError.toJSON()` / `toString()` if the caller passed sensitive fields directly in their REST payload. (#39)
* **http\AjaxError:** drop the unused `url` field from `requestInfo` typing, `toString()`, and `formatErrorMessage()` so a future change cannot accidentally re-introduce the original webhook-URL leak through error rendering. (#39)

### Migration (affects `>= 1.1.0, < 1.1.2`)

* Update to 1.1.2.
* If you wired a custom logger via `setLogger(...)` on any 1.1.x release, audit historical log sinks (stdout, files, third-party aggregators) for entries matching `/rest/{userId}/{secret}/` (webhook auth) or `"auth":"<token>"` (OAuth / Frame) and rotate the corresponding credentials.
* Downstream redaction shims (e.g. `templates-mcp`'s `logger-redactor`) remain useful as defence in depth — keep them in place.

## [1.1.1](https://github.com/bitrix24/b24jssdk/compare/v1.1.0...v1.1.1) (2026-05-15)

### Features

* **limiters\RestrictionParams:** add `retryOnNetworkError` flag — set to `false` to throw immediately on `NETWORK_ERROR` / `REQUEST_TIMEOUT` instead of retrying. Important for non-idempotent calls (e.g. `crm.documentgenerator.document.add`) where retries can create duplicates
* **limiters\RestrictionParams:** add `hardErrorCodes` and `softErrorCodes` — merge custom REST error codes into the built-in hard/soft lists so business-specific codes can opt out of automatic retry or be returned as soft errors via `AjaxResult` (#24)
* **limiters\RestrictionManager:** expose `BUILT_IN_HARD_ERROR_CODES` / `BUILT_IN_SOFT_ERROR_CODES` as readonly static fields so callers can introspect the defaults

### Bug Fixes

* **batch:** preserve `null` results in batch responses — previously coerced to `{}` via `resultData ?? {}`, which broke nullable interfaces (e.g. `im.chat.get` with non-matching params) and hid the difference between "no data" and "empty object"
* **batch-v3:** tighten response parsing — drop the misleading `result_error`/`result_time` split (a v2-only envelope shape), guard against missing entries in the all-or-nothing v3 model, and stop polluting per-method stats with cross-method failures (#23)

### Chore

* **release:** add `pnpm run release:bump <version>` ([scripts/bump-version.mjs](scripts/bump-version.mjs)) — updates root + both package workspaces in lockstep, refreshes the pnpm lockfile, refuses on out-of-sync versions / invalid semver / no-op bumps
* **ci:** unify CI into `.github/workflows/ci.yml`; both npm publish workflows now gate on green CI, matching versions across all three `package.json` files, the GitHub release tag matching the version, and the `package@version` not already being on npm. `workflow_dispatch` is restricted to `main`

### Docs

* **limiters:** expand long-running request guidance and cross-link the new retry / error-code knobs
* **batch:** document `null` result passthrough and the v3 all-or-nothing model
* **test:** document required webhook scopes for the integration suite (`main` scope for webhook tests)

## [1.1.0](https://github.com/bitrix24/b24jssdk/compare/v1.0.6...v1.1.0) (2026-05-08)

### ⚠ BREAKING CHANGES

* **frame\selectCRM:** result buckets are now real arrays instead of `Record<string, SelectedCRMEntity>`, matching the documented `SelectedCRM` types. Code using array operations keeps working; code that relied on numeric-key record access must switch to array access (#21)
* **types\AjaxResult.getData():** return shape narrowed to `{ result: P, time: PayloadTime }`. The v2-only envelope fields `next` and `total` are no longer exposed on the success type — restApi:v3 has no counterpart for them (#22)

### Deprecations

* **AjaxResult paging helpers:** `isMore`, `hasMore`, `getNext`, `fetchNext`, `getTotal` are deprecated and scheduled for removal in 2.0.0. Use `b24.actions.v{2,3}.{callList,fetchList}.make` instead — these hide pagination for both API versions (#22)
* **AbstractB24 low-level helpers:** `callMethod`, `callBatch`, `callBatchByChunk`, `callListMethod`, `fetchListMethod` are deprecated in favour of `b24.actions.v{2,3}.*` (#22)

### Bug Fixes

* **frame\selectCRM:** normalise parent-window response buckets via `Object.values` so `.length` / `.map` and the documented array shape work as expected; pre-existing arrays pass through untouched (#21)
* **placement\setValue:** add `placement.setValue(value: unknown)` helper that JSON-serialises for the caller, add a `call('setValue', { value: string })` overload to surface the requirement, and throw `TypeError` from `call()` when `value` is not a string instead of silently shipping `[object Object]` on the wire (#20)
* **types\AjaxResult.getData():** narrow result to the generic type — single REST calls no longer leak `T[]` / `BatchPayloadResult<T>` from the previous `SuccessPayload<P>` union (#22)

### Docs

* **placement:** document the `setValue` JSON-string constraint and the new helper
* **frame\dialog:** flesh out `selectAccess` / `selectCRM` coverage with parameter tables and data-type references
* **rest-api\CallV2 / CallV3:** correct `.getData()` return type after #22; drop the deprecated `.isMore()` bullet from the v2 page
* **api-v3:** add internal reference
* **README-AI:** top-level deprecation notice mapping legacy helpers to their `actions.v{2,3}.*` replacements

## [1.0.6](https://github.com/bitrix24/b24jssdk/compare/v1.0.5...v1.0.6) (2026-05-04)

### Bug Fixes

* **callList/fetchList** ignored cursor filter, breaking pagination

### Docs

* improve

## [1.0.5](https://github.com/bitrix24/b24jssdk/compare/v1.0.4...v1.0.5) (2026-03-28)

### Features

* **playgrounds\cli:** CLI command to mass generate deals

### Bug Fixes

* **B24HelperManager\CurrencyManage:** improve batch call

## [1.0.4](https://github.com/bitrix24/b24jssdk/compare/v1.0.3...v1.0.4) (2026-03-06)

### Bug Fixes

* **B24HelperManager:** improve batch call
* **B24HelperManager\OptionsManager:** improve batch call

## [1.0.3](https://github.com/bitrix24/b24jssdk/compare/v1.0.2...v1.0.3) (2026-02-26)

### Bug Fixes

* **ListPayload**: remove any from the union 

## [1.0.2](https://github.com/bitrix24/b24jssdk/compare/v1.0.1...v1.0.2) (2026-03-17)

### Bug Fixes

* **core\RestrictionManager:** add the error code 'ERROR_ENTITY_NOT_FOUND' to the soft exception
* **playground\cli:** increased the number of entities created
* **UMD:** : improve build min version

## [1.0.1](https://github.com/bitrix24/b24jssdk/compare/v0.5.1...v1.0.1) (2026-02-02)

### ⚠ BREAKING CHANGES

For ease of migration, the new version retains compatibility with v0.5.1.
Please see the full [SDK v1 migration guide](https://bitrix24.github.io/b24jssdk/docs/getting-started/migration/v1/)

### Features

* **core:** add tools and actions
* **apiVersion:** support api 3
* **core\logger:** add new logger system
* **core\TypeHttp:** now return ajaxClient
* **core\SdkError:** add SdkError
* **core\restrictions:** new restrictions
* **b24Frame\PlacementManager**: use the property name `placement` instead of `title`
* **core\logger\handler\TelegramHandler:** add Telegram handler
* **tools\environment:** added tool for environment detection

### Docs

* **use Bitrix24 UI** (llms and more demo)

## [0.5.1](https://github.com/bitrix24/b24jssdk/compare/v0.4.10...v0.5.1) (2025-10-29)

### Features

* **AuthActions.getAuthData:** fix `expires` and add `expires_in`

## [0.4.10](https://github.com/bitrix24/b24jssdk/compare/v0.4.9...v0.4.10) (2025-10-09)

### Features

* **B24OAuth:** add CustomRefreshAuth

### Bug Fixes

* **Http.#prepareMethod:** telemetry transfer to task methods

## [0.4.9] (2025-09-12)
## [0.4.8] (2025-09-12)

## [0.4.7](https://github.com/bitrix24/b24jssdk/compare/v0.4.6...v0.4.7) (2025-09-12)

### Bug Fixes
* **MessageManager:** fix null value

## [0.4.6](https://github.com/bitrix24/b24jssdk/compare/v0.4.5...v0.4.6) (2025-09-11)

### Features
* **MessageManager:** add param isRawValue `MessageManager.send`, `PlacementManager.call('setValue', { value: 'some string' })`
* **README:** add AI usage guide for Bitrix24 SDK

### Chore
* **deps:** update

## [0.4.5](https://github.com/bitrix24/b24jssdk/compare/v0.4.4...v0.4.5) (2025-07-07)

### Features
* **Http:** batch now can return AjaxResult in response
* **TypeManager:** support for type casting in check functions


## [0.4.4](https://github.com/bitrix24/b24jssdk/compare/v0.4.3...v0.4.4) (2025-07-01)

### Features

* **B24Hook:** add fromWebhookUrl
* **EventOnAppUnInstallHandlerParams:** improve

## [0.4.3](https://github.com/bitrix24/b24jssdk/compare/v0.4.2...v0.4.3) (2025-05-22)

### ⚠ BREAKING CHANGES
* **AuthHookManager:** fix getTargetOrigin, getTargetOriginWithPath

### Features

* **B24LocaleMap:** add map for B24LangList and Locale
* **types/bizproc/activity:** add some type for `bizproc.activity`
* **types/bizproc:** add some type/functions for `bizproc`
* **types/crm:** add convertor EnumCrmEntityTypeId to EnumCrmEntityTypeShort
* **types/events:** add some interface for EventHandler
* **B24OAuth:** add `issuer` for B24OAuthParams

### Docs

* **we will add new information in the next update**
* for `OAuth` work it is worth looking at an example [@bitrix24/b24sdk-examples/08-nuxt-oauth](https://github.com/bitrix24/b24sdk-examples/tree/main/js/08-nuxt-oauth)

## [0.4.2](https://github.com/bitrix24/b24jssdk/compare/v0.4.1...v0.4.2) (2025-05-08)

### ⚠ BREAKING CHANGES

* **Node.js:** support only Node.js >= 18.0.0
* **uuidv7:** improve

### Features

* **B24OAuth:** add - not a stable implementation - not worth using for now

## [0.4.1](https://github.com/bitrix24/b24jssdk/compare/v0.4.0...v0.4.1) (2025-05-07)

### ⚠ BREAKING CHANGES

* **Node.js:** support only Node.js >= 20.0.0

### Bug Fixes
* **uuidv7:** improve

## [0.4.0](https://github.com/bitrix24/b24jssdk/compare/v0.3.0...v0.4.0) (2025-05-07)

### ⚠ BREAKING CHANGES

* **commonjs:** not support commonjs, only esm and umd
* **Node.js:** support only Node.js >= 18.0.0

### Bug Fixes

* **uuidv7:** support Node.js (Issue #2)

### Chore
* **pullClient:** support Node.js types
* **browser:** add for test UMD
* **esm:** add for test ESM

## [0.3.0](https://github.com/bitrix24/b24jssdk/compare/v0.2.3...v0.3.0) (2025-05-06)

### Features

* **Http:** improve some request params

### Chore

* **deps:** improve

## [0.2.3](https://github.com/bitrix24/b24jssdk/compare/v0.2.2...v0.2.3) (2025-04-30)

### Features

* **PlacementManager::callCustomBind:** make bind for custom events

## [0.2.2](https://github.com/bitrix24/b24jssdk/compare/v0.2.1...v0.2.2) (2025-04-26)

### Features

* **types:** add types for catalog scope, TextType, order, EnumCrmEntityTypeShort, CrmItemProductRow, CrmItemPayment, CrmItemDelivery

## [0.2.1](https://github.com/bitrix24/b24jssdk/compare/v0.2.0...v0.2.1) (2025-04-25)

### Features

* **tools:** add pick, omit and isArrayOfArray functions

### Bug Fixes
* **placement.bindEvent:** restore callBack

## [0.2.0](https://github.com/bitrix24/b24jssdk/compare/v0.1.7...v0.2.0) (2025-04-24)

### Features

* **Result\AjaxResult\AjaxError:** change code-style, improve error collection
* **Http.batch:** improve error collection

### Chore

* **code-style:** improve
* **deps:** remove prettier, npm-run-all, improve vitepress

## 0.1.7 (2025-01-25)

### Features

* **new methods**: PlacementManager::getInterface, PlacementManager::bindEvent, PlacementManager::call

## 0.1.6 (2024-11-22)

- fix FormatterNumbers -> check navigator
- fix Http -> check `error_.response` & check window
- add dependencies @types/luxon
- add docs/guide/example-hook-node-work

## 0.1.5 (2024-11-20)

- add warning about client-side query execution

## 0.1.4 (2024-11-18)

- migrate to `qs-esm`

## 0.1.3 (2024-11-18)

- Fix the error at fetchListMethod

## 0.1.2 (2024-11-18)

- The `protobufjs` module has been moved to internal

## 0.1.1 (2024-11-16)

- fix code Style

## 0.1.0 (2024-11-16)

### Features

- Hooks like initializeB24Frame, useB24Helper, and useFormatter simplify development.
- Text, Type, Pull, Slider, Feedback, LicenseManager, CurrencyManager, RestrictionManager...
