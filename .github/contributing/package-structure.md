# Package Structure

<sub>Last reviewed: 2026-06-17.</sub>

> **Agent-facing mirror:** the published surface from the angle of agents writing usage code lives in [`skills/b24jssdk-core/`](../../skills/b24jssdk-core/SKILL.md), [`b24jssdk-frame-ui/`](../../skills/b24jssdk-frame-ui/SKILL.md), and [`b24jssdk-helpers/`](../../skills/b24jssdk-helpers/SKILL.md). Keep this guide and those skills in sync when the underlying API changes.

How to author code inside `packages/jssdk/src/`. This is the published `@bitrix24/b24jssdk` surface — every change here ships to consumers.

## File Location

Source files live in `packages/jssdk/src/` and are grouped by responsibility, not by class hierarchy. Pick the directory that matches what the code *does*, not what it *extends*:

| Directory | Owns |
|-----------|------|
| `src/core/` | `AbstractB24`, `Result`, `SdkError`, request-id generation, version manager |
| `src/core/actions/` | Public action surface, split into `v2/` and `v3/`. File names are kebab-case (`call.ts`, `batch.ts`, `batch-by-chunk.ts`, `call-list.ts`, `fetch-list.ts`); API names are camelCase (`b24.actions.vX.call.make`, `…batch.make`, `…batchByChunk.make`, `…callList.make`, `…fetchList.make`) |
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

A typical helper-style manager (the dominant shape in `src/helper/` and `src/frame/`) takes the b24 instance and configures its logger through a setter. There are two flavours:

- **Standalone manager** — the shape shown in the template below. Construct it explicitly from caller code or from another manager. No abstract methods to implement.
- **Sub-manager of `B24HelperManager`** — extends [packages/jssdk/src/helper/abstract-helper.ts](../../packages/jssdk/src/helper/abstract-helper.ts), which adds a required `abstract get data(): any` getter and lifecycle hooks. See [packages/jssdk/src/helper/profile-manager.ts](../../packages/jssdk/src/helper/profile-manager.ts) for the canonical sub-manager example. Do not copy the standalone template below for sub-managers — it will not compile.

`B24HelperManager` ([packages/jssdk/src/helper/helper-manager.ts](../../packages/jssdk/src/helper/helper-manager.ts)) is the aggregator that owns those sub-managers and forwards `setLogger` to each; it is not a base class.

The template below is the **standalone** flavour:

```ts
// 1. Type imports first (always separate)
import type { LoggerInterface } from '../logger'
import type { TypeB24 } from '../types/b24'

// 2. Value imports
import { LoggerFactory } from '../logger'
import { SdkError } from '../core/sdk-error'

// 3. Class — one primary export per file, named export.
//    Fields are `protected` so the class can serve as a base or be extended;
//    use `private` only if the class is intentionally final.
export class MyManager {
  protected _b24: TypeB24
  protected _logger: LoggerInterface

  // 4. Manager takes the b24 instance, not a raw transport.
  //    Logger starts as a null logger and is replaced via setLogger().
  constructor(b24: TypeB24) {
    this._b24 = b24
    this._logger = LoggerFactory.createNullLogger()
  }

  setLogger(logger: LoggerInterface): void {
    this._logger = logger
  }

  getLogger(): LoggerInterface {
    return this._logger
  }

  // 5. Public methods go through the action surface and return Result / AjaxResult.
  async fetch(id: number) {
    if (id <= 0) {
      // 6. Use SdkError for invariant violations, AjaxError surfaces via Result.
      //    SdkError takes a SdkErrorDetails object — see packages/jssdk/src/core/sdk-error.ts.
      throw new SdkError({
        code: 'MY_MANAGER_BAD_ID',
        description: 'MyManager.fetch: id must be positive',
        status: 400
      })
    }

    return this._b24.actions.v3.call.make<{ item: { id: number } }>({
      method: 'my.entity.get',
      params: { id },
      requestId: 'my-manager/fetch'
    })
  }
}
```

> Compile-checked example: [`test/some-code-from-docs/contributing/package-structure-manager.ts`](../../test/some-code-from-docs/contributing/package-structure-manager.ts)

For transport-layer actions (under `src/core/actions/v2/` and `v3/`) extend `AbstractAction` (`packages/jssdk/src/core/actions/abstract-action.ts`) instead — see [packages/jssdk/src/core/actions/v3/call.ts](../../packages/jssdk/src/core/actions/v3/call.ts) for the canonical example.

## Adding to the Public Surface

A symbol is *only* public once it is re-exported from `packages/jssdk/src/index.ts`. Internal-only helpers stay unexported.

```ts
// packages/jssdk/src/index.ts
export { MyManager } from './my-area/my-manager'
export type { TypeMyPayload } from './types/payloads'
```

- Prefer `export { Foo } from './…'` over star re-exports for public types — it keeps the contract auditable.
- Star re-exports are acceptable for `src/types/index.ts` because that file is an internal aggregator.
- Removing or renaming a public export is a **breaking change** and must go through a deprecation cycle. Three things are required, not one:

  1. **JSDoc**: mark the old symbol with `@deprecated` pointing to the replacement, plus `@removed X.Y.Z` for the target removal version. Add `@memo` if the deprecation has a non-obvious reason (e.g. "only for `restApi:v2`").
  2. **Runtime warning** (for methods callers might still call): emit a warning via `LoggerFactory.forcedLog`. The signature is `(logger, action, message, context)` — **four arguments**, not three:

      ```ts
      LoggerFactory.forcedLog(
        this._logger,
        'warning',
        'AbstractB24.callMethod() is deprecated and will be removed in version X.Y.Z. Use b24.actions.vX.call.make(options) instead.',
        {
          class: 'AbstractB24',
          method: 'callMethod',
          replacement: 'b24.actions.vX.call.make(options)',
          removalVersion: 'X.Y.Z'
        }
      )
      ```

      > Compile-checked example: [`package-structure-deprecation-warning.ts`](../../test/some-code-from-docs/contributing/package-structure-deprecation-warning.ts)

      The context key is `removalVersion`, not `removeInVersion`. The canonical pattern lives in [packages/jssdk/src/core/abstract-b24.ts](../../packages/jssdk/src/core/abstract-b24.ts) (search for `@deprecated` + `forcedLog`).
  3. **Both symbols ship together** for at least one minor release.

## Class Hierarchies

The four canonical classes inherit from a single abstract base. When extending, pick the lowest one that fits — do not duplicate logic into `B24Frame`/`B24Hook`/`B24OAuth` if it can live in `AbstractB24`.

```
AbstractB24                       packages/jssdk/src/core/abstract-b24.ts
├── B24Frame                      packages/jssdk/src/frame/b24.ts
├── B24Hook                       packages/jssdk/src/hook/b24.ts
└── B24OAuth                      packages/jssdk/src/oauth/b24.ts
```

`AbstractB24` already owns:

- the public `actions.vX.<name>` surface (`call`, `batch`, `batchByChunk`, `callList`, `fetchList` for both v2 and v3),
- the v2 + v3 HTTP clients, reachable via `getHttpClient(version)`,
- the limiter stack,
- the logger (replaced via `setLogger(logger)`),
- the legacy shortcuts `callMethod` / `callBatch` / `callListMethod` / `fetchListMethod` / `callBatchByChunk`, all marked `@deprecated` — see the `@removed` tag on each method in [packages/jssdk/src/core/abstract-b24.ts](../../packages/jssdk/src/core/abstract-b24.ts) for the target removal version. Do not call them from new code.

If a new feature is auth-agnostic, put it on `AbstractB24`. Only specialise on a subclass when it requires iframe `postMessage`, webhook URL parsing, or OAuth refresh-token handling.

## Manager Modules

Helper-style managers (under `src/helper/`, iframe managers under `src/frame/`) follow the [Standard Module Template](#standard-module-template) shape:

- Constructor takes `b24: TypeB24`. No raw http injection, no module-level singletons.
- Logger starts as `LoggerFactory.createNullLogger()` and is swapped via `setLogger(logger: LoggerInterface)`. Sub-managers held inside a manager get the logger forwarded in `setLogger()` — see [packages/jssdk/src/helper/helper-manager.ts](../../packages/jssdk/src/helper/helper-manager.ts) for the canonical fan-out.
- `loadData()` / `load()` is the convention for one-shot eager initialisation; subsequent calls are no-ops or throw `SdkError`.
- Lifecycle managers expose `destroy()` if they hold subscriptions (e.g. Pull).

The composable [`useB24Helper()`](../../packages/jssdk/src/helper/use-b24-helper.ts) is a closure-based composable — it wires init/destroy and Pull subscription. New cross-cutting helpers should plug into it rather than introducing parallel lifecycle code.

## Frame, Hook, OAuth

These are the three caller-facing entry points and have stricter rules:

- **`B24Frame`** — bootstrap **only** through [`initializeB24Frame()`](../../packages/jssdk/src/loader-b24frame.ts). It deduplicates concurrent inits and parses `window.name` for the portal handshake. Do not export an alternative constructor path.
- **`B24Hook`** — **must only be used in server-side (Node.js / edge runtime) code**. A webhook URL contains a secret access key; shipping it in a browser bundle exposes the key to every visitor. Construct via the static factory `B24Hook.fromWebhookUrl(url)`. Direct `new B24Hook()` is internal. The class emits a runtime warning when it detects a browser context — do not suppress the warning with `offClientSideWarning()` in production code (it is intended for tests / SSR shims only).
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

- Every module that emits diagnostic output holds a `LoggerInterface` (imported from `../logger`) and starts with `LoggerFactory.createNullLogger()`.
- The active logger is swapped in through a `setLogger(logger)` method, not via the constructor. `AbstractB24` and `B24HelperManager` follow this shape — copy it.
- A real logger is created with `LoggerBrowser.build(name, isDev)` (from `packages/jssdk/src/logger/browser.ts`); the `name` becomes the prefix in console output. Callers pass it to `b24.setLogger(...)`.

## Build Tokens

The build replaces these placeholders at bundle time (see [packages/jssdk/build.config.ts](../../packages/jssdk/build.config.ts), and [packages/jssdk-nuxt/build.config.ts](../../packages/jssdk-nuxt/build.config.ts) for the Nuxt module's `meta.version`):

- `__SDK_VERSION__` → the `version` from `packages/jssdk/package.json` (the Nuxt module injects the same token from `packages/jssdk-nuxt/package.json` into its `meta.version`)
- `__SDK_USER_AGENT__` → the user-agent string sent on REST calls

Use the placeholders directly — never read `package.json` at runtime, never hard-code a version string.

## Key Patterns

| Pattern | Usage |
|---------|-------|
| Named exports only | `export class Foo`, `export function bar` — no `export default` |
| Constructor takes `TypeB24` | Helper-style managers accept `b24: TypeB24` — no module-level singletons |
| Logger via setter | `LoggerFactory.createNullLogger()` by default; replace via `setLogger(logger)` |
| `Result` / `AjaxResult` | All transport / domain methods return these — never raw axios responses |
| `SdkError` | Invariant violations and SDK-level errors, constructed with `{ code, description, status }` |
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
3. If [packages/jssdk/README-AI.md](../../packages/jssdk/README-AI.md) shows usage of the changed surface, update it — but note this file is **transitional** (being absorbed into `AGENTS.md` and the contributing guides by future PRs). When the README-AI content disagrees with `AGENTS.md`, `AGENTS.md` wins. See the conflict-resolution note in [AGENTS.md Resources](../../AGENTS.md#resources).
