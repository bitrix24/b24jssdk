# API surface

Categorized index of public exports from `@bitrix24/b24jssdk` — useful for finding the right import name. For full signatures, parameters, and return shapes consult [`packages/jssdk/README-AI.md`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/README-AI.md), the [docs site](https://bitrix24.github.io/b24jssdk/), or the source under `packages/jssdk/src/`.

## Entry points & loaders

| Export | Purpose | Recipe |
|---|---|---|
| `initializeB24Frame()` | Boot a `B24Frame` (parent-window handshake, dedupes concurrent inits) | [frame-apps](recipes/frame-apps.md) |
| `B24Frame` | iframe placement entry point — UI managers + REST | [frame-apps](recipes/frame-apps.md) |
| `B24Hook` | Webhook-based server entry point | [webhook-server](recipes/webhook-server.md) |
| `B24Hook.fromWebhookUrl(url)` | Construct from a full webhook URL | [webhook-server](recipes/webhook-server.md) |
| `B24OAuth` | OAuth-based local app entry point | [oauth-apps](recipes/oauth-apps.md) |
| `AbstractB24` | Shared REST surface (`callMethod`, `callBatch`, `callListMethod`, `fetchListMethod`, `callBatchByChunk`, `chunkArray`) — the base of the three concrete classes | [conventions](guidelines/conventions.md) |

## Helpers & Pull

| Export | Purpose |
|---|---|
| `useB24Helper()` | Closure-based composable that wires helper lifecycle + Pull |
| `B24HelperManager` | Underlying helper container (profile / app / payment / license / currency / options) |
| `LoadDataType` | Enum of preload datasets for `initB24Helper` |
| `usePullClient`, `useSubscribePullClient`, `startPullClient` | Pull subscription helpers (returned from `useB24Helper()`) |

See [helper-manager](recipes/helper-manager.md) and [pull-client](recipes/pull-client.md).

## REST results

| Export | Purpose |
|---|---|
| `Result` | Aggregated batch / list result (`getData`, `isSuccess`, `getErrors`, `getTotal`) |
| `AjaxResult` | Single-call result (`getData`, `isMore`, `getNext`) |
| `AjaxError` | REST/transport error (`code`, `description`, `status`, `requestInfo`) |
| `SdkError` | SDK-internal error |

See [conventions](guidelines/conventions.md) and [error-handling](guidelines/error-handling.md).

## Limiters

| Export | Purpose |
|---|---|
| `RestrictionManager` | Orchestrates rate / operating / adaptive limiters |
| `RateLimiter` | Bucketed REST quota limiter |
| `OperatingLimiter` | Guards bursty `OPERATING` errors |
| `AdaptiveDelayer` | Backs off on temporary overload |
| `ParamsFactory` | Preset limiter params (`getDefault()`, enterprise preset) |

See [rate-limiting](guidelines/rate-limiting.md).

## Tools

| Export | Purpose |
|---|---|
| `Text` | Luxon-backed dates, number/format helpers, UUID v7 |
| `Type` | Runtime type guards (`isStringFilled`, `isPlainObject`, …) |
| `Browser` | Lightweight browser environment helpers |
| `useFormatters` | Number/date formatter hook |
| `pick`, `omit`, `getEnumValue` | Object/enum helpers |

## Logging

| Export | Purpose |
|---|---|
| `LoggerBrowser` | Default browser/Node logger with dev-mode gate (`build(name, isDev)`) |
| `LoggerFactory` | Per-component logger factory (used internally by SDK modules) |

See [logger](guidelines/logger.md).

## Types & enums (frequently used)

| Export | Purpose |
|---|---|
| `EnumCrmEntityTypeId` | CRM entity type ids (`company`, `contact`, `deal`, …) |
| `ISODate` | ISO date string brand for `Text.toDateTime` |
| `TypePullMessage` | Pull message shape |
| `Messages`, `defineLocale`, `extendLocale` | i18n primitives (mainly used by `b24ui-nuxt` integrations) |
| Type modules: `types/crm`, `types/catalog`, `types/bizproc`, `types/event`, `types/placement`, `types/payloads`, `types/pull`, `types/auth`, `types/handler`, `types/slider`, `types/user`, `types/b24`, `types/http`, `types/limiters`, `types/b24-helper`, `types/common` | Domain-specific types |

The SDK re-exports everything from the package root — always `import { ... } from '@bitrix24/b24jssdk'`. Don't deep-import (`@bitrix24/b24jssdk/dist/...`).

## Source map (for browsing)

```
packages/jssdk/src/
├── core/                # AbstractB24, Result, SdkError, http/, language/, version-manager
├── frame/               # B24Frame + UI managers (auth, parent, slider, dialog, placement, options)
├── hook/                # B24Hook
├── oauth/               # B24OAuth
├── helper/              # useB24Helper, B24HelperManager, profile/app/currency/license/options/payment managers
├── pullClient/          # Pull WebSocket + long-polling, channel manager, JSON-RPC, protobuf
├── tools/               # Text, Type, Browser, useFormatters, pick/omit, scroll-size, environment
├── types/               # public types (crm, catalog, bizproc, event, placement, payloads, pull, …)
├── logger/              # LoggerBrowser, LoggerFactory
├── loader-b24frame.ts   # initializeB24Frame
└── index.ts             # public re-exports (this is the contract)
```

The contract is `packages/jssdk/src/index.ts` — anything not re-exported there is internal and may change without a deprecation cycle.
