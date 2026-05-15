# API surface

Categorized index of public exports from `@bitrix24/b24jssdk` — useful for finding the right import name. For full signatures, parameters, and return shapes consult the source under `packages/jssdk/src/`, the [docs site](https://bitrix24.github.io/b24jssdk/), or `packages/jssdk/README-AI.md` (aligned with the current `b24.actions.*` API).

## Entry points & loaders

| Export | Purpose | Recipe |
|---|---|---|
| `initializeB24Frame()` | Boot a `B24Frame` (parent-window handshake, dedupes concurrent inits) | [frame-apps](recipes/frame-apps.md) |
| `B24Frame` | iframe placement entry point — UI managers + REST | [frame-apps](recipes/frame-apps.md) |
| `B24Hook` | Webhook-based server entry point | [webhook-server](recipes/webhook-server.md) |
| `B24Hook.fromWebhookUrl(url, options?)` | Construct from a full webhook URL (v2 or v3 shape) | [webhook-server](recipes/webhook-server.md) |
| `B24OAuth` | OAuth-based local app entry point | [oauth-apps](recipes/oauth-apps.md) |
| `AbstractB24` | Shared base class — exposes `actions`, `tools`, `getHttpClient`, `setRestrictionManagerParams`, `destroy` | [conventions](guidelines/conventions.md) |

## REST surface — `b24.actions.*`

Every entry point exposes `actions.v2` and `actions.v3` managers — independent mirror trees, not old-vs-new. Each action is a class with a `make(options)` method.

| Action class | Path | Returns |
|---|---|---|
| `CallV2` / `CallV3` | `b24.actions.v2.call` / `v3.call` | `Promise<AjaxResult<T>>` |
| `CallListV2` / `CallListV3` | `b24.actions.v2.callList` / `v3.callList` | `Promise<Result<T[]>>` |
| `FetchListV2` / `FetchListV3` | `b24.actions.v2.fetchList` / `v3.fetchList` | `AsyncGenerator<T[]>` |
| `BatchV2` / `BatchV3` | `b24.actions.v2.batch` / `v3.batch` | `Promise<CallBatchResult<T>>` |
| `BatchByChunkV2` / `BatchByChunkV3` | `b24.actions.v2.batchByChunk` / `v3.batchByChunk` | `Promise<Result<T[]>>` |

Default to v2; v3 currently supports only `tasks.task.*`, `main.eventlog.*`, and meta endpoints — see [rest-api-v3 → When to use](recipes/rest-api-v3.md#when-to-use-v3--and-when-not-to).

Options types (re-exported from the package root): `ActionCallV2`, `ActionCallV3`, `ActionCallListV2`, `ActionCallListV3`, `ActionFetchListV2`, `ActionFetchListV3`, `ActionBatchV2`, `ActionBatchV3`, `ActionBatchByChunkV2`, `ActionBatchByChunkV3`, `IB24BatchOptions`, `BatchCommandsArrayUniversal`, `BatchCommandsObjectUniversal`, `BatchNamedCommandsUniversal`.

Full per-version reference: [rest-api-v2](recipes/rest-api-v2.md), [rest-api-v3](recipes/rest-api-v3.md). Decision pages: [batch-calls](recipes/batch-calls.md), [list-pagination](recipes/list-pagination.md).

### Deprecated REST helpers on `AbstractB24`

For backwards compatibility, `AbstractB24` still exposes `callMethod`, `callBatch`, `callListMethod`, `fetchListMethod`, `callBatchByChunk`, `chunkArray`. All log deprecation warnings and **will be removed in v2.0.0** — translate to the action managers above.

## Tools — `b24.tools.*`

| Path | Returns | Purpose |
|---|---|---|
| `b24.tools.healthCheck.make({ requestId? })` | `Promise<boolean>` | Reach the portal? |
| `b24.tools.ping.make({ requestId? })` | `Promise<number>` | Latency in ms |

## Helpers & Pull

| Export | Purpose |
|---|---|
| `useB24Helper()` | Closure-based composable that wires helper lifecycle + Pull |
| `B24HelperManager` | Underlying helper container (profile / app / payment / license / currency / options) |
| `LoadDataType` | Enum of preload datasets for `initB24Helper` |
| `usePullClient`, `useSubscribePullClient`, `startPullClient` | Pull subscription helpers (returned from `useB24Helper()`) |

See [helper-manager](recipes/helper-manager.md) and [pull-client](recipes/pull-client.md).

## REST results & errors

| Export | Purpose |
|---|---|
| `Result` | Aggregated batch / list result (`getData`, `isSuccess`, `getErrorMessages`, `errors`, `getTotal`) |
| `AjaxResult` | Single-call result (`getData`, `isMore`, `getNext`, `errors`) |
| `AjaxError` | REST/transport error (`code`, `description`, `status`, `requestInfo`) |
| `SdkError` | SDK-internal error (`code`, `description`, `status`) |
| `RefreshTokenError` | OAuth-specific failure when refresh fails (thrown by `B24OAuth`) |

See [conventions](guidelines/conventions.md) and [error-handling](guidelines/error-handling.md).

## Limiters

| Export | Purpose |
|---|---|
| `RestrictionManager` | Orchestrates rate / operating / adaptive limiters |
| `RateLimiter` | Token-bucket REST quota limiter |
| `OperatingLimiter` | Guards bursty `OPERATING` budget |
| `AdaptiveDelayer` | Backs off on temporary overload |
| `ParamsFactory` | Preset limiter params: `getDefault()`, `getEnterprise()`, `getBatchProcessing()`, `getRealtime()`, `fromTariffPlan(plan)` |
| `RestrictionParams` (type) | Full param shape: `rateLimit`, `operatingLimit`, `adaptiveConfig`, `maxRetries`, `retryDelay`, `retryOnNetworkError` |

See [rate-limiting](guidelines/rate-limiting.md).

## Tools (utilities)

| Export | Purpose |
|---|---|
| `Text` | Luxon-backed dates (`toDateTime`, `toB24Format`), number formatting (`numberFormat`), UUID v7 (`getUuidRfc4122`) |
| `Type` | Runtime type guards (`isStringFilled`, `isPlainObject`, `isArray`, …) |
| `Browser` | Lightweight browser environment helpers |
| `useFormatters` | Number/date formatter hook |
| `pick`, `omit`, `getEnumValue` | Object/enum helpers |

## Logging

| Export | Purpose |
|---|---|
| `LoggerBrowser` | Default browser/Node logger with dev-mode gate (`build(name, isDev)`) |
| `LoggerFactory` | Per-component logger factory (used internally) |

See [logger](guidelines/logger.md).

## Types & enums (frequently used)

| Export | Purpose |
|---|---|
| `EnumCrmEntityTypeId` | CRM entity type ids (`company`, `contact`, `deal`, …) |
| `ApiVersion` | `v2` / `v3` enum |
| `ISODate` | ISO date string brand for `Text.toDateTime` |
| `TypeCallParams` | Param shape for REST calls (`filter`, `select`, `order`, `pagination`, `start`) |
| `TypePullMessage` | Pull message shape |
| `B24OAuthParams`, `B24OAuthSecret`, `B24HookParams` | Auth config shapes for entry-point constructors |
| Type modules: `types/crm`, `types/catalog`, `types/bizproc`, `types/event`, `types/placement`, `types/payloads`, `types/pull`, `types/auth`, `types/handler`, `types/slider`, `types/user`, `types/b24`, `types/http`, `types/limiters`, `types/b24-helper`, `types/common` | Domain-specific types |

The SDK re-exports everything from the package root — always `import { ... } from '@bitrix24/b24jssdk'`. Don't deep-import (`@bitrix24/b24jssdk/dist/...`).

## Source map (for browsing)

```
packages/jssdk/src/
├── core/
│   ├── abstract-b24.ts         # AbstractB24 base
│   ├── actions/                # actions.{v2,v3}.{call,callList,fetchList,batch,batchByChunk}
│   ├── tools/                  # tools.{healthCheck, ping}
│   ├── http/                   # transport + limiter stack
│   ├── language/               # language list
│   ├── result.ts               # Result
│   ├── sdk-error.ts            # SdkError
│   └── version-manager.ts      # v2/v3 method routing
├── frame/                      # B24Frame + UI managers (auth, parent, slider, dialog, placement, options)
├── hook/                       # B24Hook
├── oauth/                      # B24OAuth + RefreshTokenError
├── helper/                     # useB24Helper, B24HelperManager, profile/app/currency/license/options/payment managers
├── pullClient/                 # Pull WebSocket + long-polling, channel manager, JSON-RPC, protobuf
├── tools/                      # Text, Type, Browser, useFormatters, pick/omit, scroll-size, environment
├── types/                      # public types (crm, catalog, bizproc, event, placement, payloads, pull, …)
├── logger/                     # LoggerBrowser, LoggerFactory
├── loader-b24frame.ts          # initializeB24Frame
└── index.ts                    # public re-exports (this is the contract)
```

The contract is `packages/jssdk/src/index.ts` — anything not re-exported there is internal and may change without a deprecation cycle.
