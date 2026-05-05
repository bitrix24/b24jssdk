# Package Structure

How to author code inside `packages/jssdk/src/`. This is the published `@bitrix24/b24jssdk` surface — every change here ships to consumers.

## File Location

Source files live in `packages/jssdk/src/` and are grouped by responsibility, not by class hierarchy. Pick the directory that matches what the code *does*, not what it *extends*:

| Directory | Owns |
|-----------|------|
| `src/core/` | `AbstractB24`, `Result`, `SdkError`, request-id generation, version manager |
| `src/core/actions/` | `callMethod` / `callBatch` / `callList*` / `fetchList*` (split into `v2/` and `v3/`) |
| `src/core/http/` | `Http` transports (`v2.ts`, `v3.ts`), `AjaxResult`, `AjaxError`, `abstract-http.ts` |
| `src/core/http/limiters/` | `RateLimiter`, `OperatingLimiter`, `AdaptiveDelayer`, `ParamsFactory` |
| `src/frame/` | `B24Frame` and iframe-only managers (`auth`, `parent`, `slider`, `dialog`, `placement`, `options`) |
| `src/hook/` | `B24Hook` (server-side webhook auth) |
| `src/oauth/` | `B24OAuth` (OAuth-based local apps) |
| `src/helper/` | `B24HelperManager`, `useB24Helper`, sub-managers (`profile`, `app`, `payment`, `license`, `currency`, `options`) |
| `src/pullClient/` | Pull (push) client — WebSocket + long-poll connectors, channel manager, JSON-RPC, protobuf decoders |
| `src/tools/` | Public utilities — `Text` (Luxon, UUID v7), `Type` (runtime guards), `Browser`, `useFormatters`, `pick`/`omit`/`getEnumValue`, scroll/env utils |
| `src/types/` | Public types and enums (CRM, catalog, bizproc, event, placement, pull, payloads, …) |
| `src/logger/` | `LoggerBrowser`, `LoggerFactory` |
| `src/index.ts` | The single public-export barrel — treat as a contract |

File naming is `kebab-case.ts`. Class names inside are `PascalCase`. One primary export per file.

## Standard Module Template

A typical SDK module — a manager, a helper, or a transport — looks like this:

```ts
// 1. Type imports first (always separate)
import type { LoggerBrowser } from '../logger/logger-browser'
import type { Http } from '../core/http/abstract-http'
import type { TypeMyPayload } from '../types/payloads'

// 2. Value imports
import { Result } from '../core/result'
import { SdkError } from '../core/sdk-error'
import { LoggerFactory } from '../logger/logger-factory'

// 3. Class — one primary export per file, named export
export class MyManager {
  // 4. Dependencies passed in via constructor; logger is always optional
  constructor(
    private readonly http: Http,
    private readonly logger: LoggerBrowser = LoggerFactory.null()
  ) {}

  // 5. Public methods return Result / AjaxResult — never raw transport responses
  async fetch(id: number): Promise<Result> {
    if (id <= 0) {
      // 6. Use SdkError for invariant violations, AjaxError surfaces via Result
      throw new SdkError('MyManager.fetch: id must be positive')
    }

    return this.http.callMethod('my.entity.get', { id })
  }
}
```

## Adding to the Public Surface

A symbol is *only* public once it is re-exported from `packages/jssdk/src/index.ts`. Internal-only helpers stay unexported.

```ts
// packages/jssdk/src/index.ts
export { MyManager } from './my-area/my-manager'
export type { TypeMyPayload } from './types/payloads'
```

- Prefer `export { Foo } from './…'` over star re-exports for public types — it keeps the contract auditable.
- Star re-exports are acceptable for `src/types/index.ts` because that file is an internal aggregator.
- Removing or renaming a public export is a **breaking change** and must go through a deprecation cycle. Add the new symbol, mark the old one with `@deprecated` JSDoc that points to the replacement, and keep both for at least one minor release.

## Class Hierarchies

The four canonical classes inherit from a single abstract base. When extending, pick the lowest one that fits — do not duplicate logic into `B24Frame`/`B24Hook`/`B24OAuth` if it can live in `AbstractB24`.

```
AbstractB24                       packages/jssdk/src/core/abstract-b24.ts
├── B24Frame                      packages/jssdk/src/frame/b24-frame.ts
├── B24Hook                       packages/jssdk/src/hook/b24-hook.ts
└── B24OAuth                      packages/jssdk/src/oauth/b24-oauth.ts
```

`AbstractB24` already owns:

- `callMethod`, `callBatch`, `callListMethod`, `fetchListMethod`, `callBatchByChunk`,
- the v2 + v3 HTTP clients,
- the limiter stack,
- the logger,
- helper sub-managers (`actions`, `tools`).

If a new feature is auth-agnostic, put it on `AbstractB24`. Only specialise on a subclass when it requires iframe `postMessage`, webhook URL parsing, or OAuth refresh-token handling.

## Manager Modules

Helper-style managers (under `src/helper/`, iframe managers under `src/frame/`) follow a consistent shape:

```ts
export class FooManager {
  constructor(
    private readonly http: Http,
    private readonly logger: LoggerBrowser = LoggerFactory.null()
  ) {}

  async load(): Promise<this> { /* eager init, returns this for chaining */ }

  // Domain methods return Result/AjaxResult or domain DTOs derived from them
}
```

- Construction takes a transport + optional logger. No global state.
- `load()` is the convention for one-shot eager initialisation; subsequent calls are no-ops or throw `SdkError`.
- Lifecycle managers expose `destroy()` if they hold subscriptions (e.g. Pull).

The composable [`useB24Helper()`](../../packages/jssdk/src/helper/use-b24-helper.ts) is a closure-based composable — it wires init/destroy and Pull subscription. New cross-cutting helpers should plug into it rather than introducing parallel lifecycle code.

## Frame, Hook, OAuth

These are the three caller-facing entry points and have stricter rules:

- **`B24Frame`** — bootstrap **only** through [`initializeB24Frame()`](../../packages/jssdk/src/loader-b24frame.ts). It deduplicates concurrent inits and parses `window.name` for the portal handshake. Do not export an alternative constructor path.
- **`B24Hook`** — construct via the static factory `B24Hook.fromWebhookUrl(url)`. Direct `new B24Hook()` is internal. The class warns when used in the browser.
- **`B24OAuth`** — owns refresh-token error handling. New OAuth flows must reuse its error reporting rather than re-implement token refresh.

## Types and Enums

- All public types live under `src/types/`, organised by domain (`crm.ts`, `catalog.ts`, `bizproc.ts`, `event.ts`, `placement.ts`, `pull.ts`, `payloads.ts`, …).
- Prefer importing enums like `EnumCrmEntityTypeId` from the package root, not from a deep path.
- Type files contain *only* types and enums. No runtime classes — those go to a dedicated module.
- When adding a new domain, create a new file rather than expanding an unrelated one.

## Tools

`src/tools/` is the home for caller-facing utilities:

- `Text` — Luxon-based date helpers, number/format helpers, UUID v7 generation.
- `Type` — runtime guards (`Type.isString`, `Type.isPlainObject`, …).
- `Browser` — environment detection.
- `useFormatters` — currency / locale formatting.
- Misc: `pick`, `omit`, `getEnumValue`, scroll utilities.

Internal-only helpers go to `src/core/tools/`. Do not export those from `index.ts`.

## Logger

- Every module that emits diagnostic output accepts an optional `LoggerBrowser` and defaults to `LoggerFactory.null()`.
- `AbstractB24` defaults to a null logger — passing a real logger is the caller's choice.
- Build new loggers via `LoggerBrowser.build(name, isDev)`. The `name` becomes the prefix in console output.

## Build Tokens

The build replaces these placeholders at bundle time (see [packages/jssdk/build.config.ts](../../packages/jssdk/build.config.ts)):

- `__SDK_VERSION__` → the `version` from `packages/jssdk/package.json`
- `__SDK_USER_AGENT__` → the user-agent string sent on REST calls

Use the placeholders directly — never read `package.json` at runtime, never hard-code a version string.

## Key Patterns

| Pattern | Usage |
|---------|-------|
| Named exports only | `export class Foo`, `export function bar` — no `export default` |
| Constructor injection | Pass `Http` + `LoggerBrowser` — no module-level singletons |
| `Result` / `AjaxResult` | All transport / domain methods return these — never raw axios responses |
| `SdkError` | Invariant violations and SDK-level errors |
| `AjaxError` | HTTP-level errors, surfaced via `Result.getErrors()` |
| `@deprecated` JSDoc | Mandatory for any public symbol being phased out |
| Star re-exports | Allowed only in internal aggregators (e.g. `src/types/index.ts`) |
| Build tokens | `__SDK_VERSION__`, `__SDK_USER_AGENT__` — never literal versions |

## Export Types

Add to `packages/jssdk/src/index.ts`:

```ts
export { MyManager } from './my-area/my-manager'
export type { MyManagerOptions } from './my-area/my-manager'
```

## Cross-Package Awareness

The Nuxt module ([packages/jssdk-nuxt/src/module.ts](../../packages/jssdk-nuxt/src/module.ts)) is intentionally tiny — it only registers `runtime/plugin`. Any new SDK surface that needs Nuxt auto-import or SSR handling must be wired through that runtime plugin.

When you change the core SDK API:

1. Re-run `pnpm run package-jssdk-nuxt:typecheck`.
2. If the new surface is Nuxt-relevant (composables, app-config integration, plugin-time setup), update `packages/jssdk-nuxt/src/runtime/plugin` in the same PR.
3. If [packages/jssdk/README-AI.md](../../packages/jssdk/README-AI.md) shows usage of the changed surface, update it — that file is the authoritative API guide for callers and other agents read it before generating SDK code.
