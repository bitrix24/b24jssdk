---
name: b24jssdk-helpers
description: Use B24HelperManager / useB24Helper to preload portal data (profile, app, currencies, options, license, payment), format currency, and subscribe to the Pull (push) client. Designed primarily for in-frame apps; the helpers can also work with B24Hook / B24OAuth for read-only data.
---

# b24jssdk helpers and Pull

The `useB24Helper()` composable wraps `B24HelperManager` and the Pull client lifecycle. It's the recommended way to load portal-wide context (currencies, your app's install info, the current user) once per app boot.

## Initial setup

```ts
import {
  initializeB24Frame,
  useB24Helper,
  LoadDataType,
  type TypePullMessage
} from '@bitrix24/b24jssdk'

const {
  initB24Helper,
  destroyB24Helper,
  getB24Helper,
  usePullClient,
  useSubscribePullClient,
  startPullClient
} = useB24Helper()

const $b24 = await initializeB24Frame()

await initB24Helper($b24, [
  LoadDataType.Profile,
  LoadDataType.App,
  LoadDataType.Currency,
  LoadDataType.AppOptions,
  LoadDataType.UserOptions
])

const helper = getB24Helper()
```

Pass only the `LoadDataType` flags you actually need — each adds a REST call. `Profile` and `App` are usually the minimum.

## Reading helper data

```ts
const me = helper.profileInfo.data
// { id, name, lastName, isAdmin, ... }

const app = helper.appInfo.data
const status = helper.appInfo.statusCode  // EnumAppStatus

const license = helper.license  // for enterprise checks
const payment = helper.payment

const baseCurrency = helper.currency.baseCurrency
```

## Currency formatting

```ts
const symbol = helper.currency.getCurrencyLiteral('USD', 'en')   // '$'
const fullName = helper.currency.getCurrencyFullName('USD', 'en')// 'US Dollar'
const formatted = helper.currency.format(1234.56, 'USD', 'en')   // '$1,234.56'
```

`format` honours per-currency rules (decimal places, separators) loaded from the portal.

## Bulk options with notification

The helper-level `OptionsManager` can save many keys in one batch and broadcast a Pull event:

```ts
await helper.appOptions.save(
  {
    featureFlags: helper.appOptions.encode({ exportCsv: true, beta: false }),
    lastSyncAt: new Date().toISOString()
  },
  {
    moduleId: 'application',
    command: 'FEATURES_UPDATED',
    params: { source: 'app' }
  }
)

const flags = helper.appOptions.getJsonObject<{ exportCsv: boolean; beta: boolean }>(
  'featureFlags',
  { exportCsv: false, beta: false }
)
```

`encode` JSON-stringifies into a Bitrix24-compatible string; `getJsonObject` reverses it with a typed default.

## Pull client (push events)

```ts
usePullClient('appPrefix' /*, optional userId */)

useSubscribePullClient((m: TypePullMessage) => {
  if (m.command === 'FEATURES_UPDATED') {
    // re-read options, update UI
  }
}, /* moduleId */ 'application')

startPullClient()
```

Subscribe before `startPullClient()` — the client connects after start.

To unsubscribe / shut down:

```ts
destroyB24Helper()
```

…which also tears the Pull client down.

## Multiple subscriptions

Call `useSubscribePullClient` once per moduleId you care about. Each call adds a listener:

```ts
useSubscribePullClient(handleAppEvent, 'application')
useSubscribePullClient(handleImEvent, 'im')
useSubscribePullClient(handleCrmEvent, 'crm')
```

## Using helpers with B24Hook / B24OAuth

`B24HelperManager` itself works with any `TypeB24`. `useB24Helper()` is designed around the in-frame composable lifecycle, but for backend code you can construct the manager directly:

```ts
import { B24HelperManager, LoadDataType } from '@bitrix24/b24jssdk'

const helper = new B24HelperManager($b24)
await helper.loadData([LoadDataType.Profile, LoadDataType.Currency])
const baseCurrency = helper.currency.baseCurrency
```

Pull is only meaningful in an interactive context (frame). Don't `startPullClient()` from a CLI script.

## Anti-patterns

- ❌ Calling `initB24Helper` twice — call `destroyB24Helper()` between hot reloads.
- ❌ `usePullClient` without `useSubscribePullClient` — connection runs but nothing handles messages.
- ❌ Loading every `LoadDataType` "just in case" — every flag costs REST calls.
- ❌ Reading `helper.profileInfo` before `initB24Helper` resolves.
