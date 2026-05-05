# Helper manager

`useB24Helper()` is a closure-based composable that wires lifecycle around `B24HelperManager`. It loads portal/app/user metadata up front and exposes the Pull client. Use it whenever you need:

- Current user info (`profileInfo`).
- App metadata (`appInfo`, `appInfo.statusCode`).
- Currency formatting (`currency.format`, `currency.getCurrencyLiteral`).
- License-aware throttling (enterprise auto-tunes `RestrictionManager`).
- Bulk app/user options with optional Pull notifications.
- Pull (push) subscription — see [pull-client](pull-client.md).

## Boot

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
console.log(helper.profileInfo.data.id)
```

Pass only the `LoadDataType` entries you actually need — each adds REST calls to the boot path. `Profile` and `App` are the most common.

## Cleanup

```ts
destroyB24Helper()
$b24.destroy()
```

In a Vue component, call `destroyB24Helper()` in `onBeforeUnmount` *before* `$b24.destroy()`.

## Currency

```ts
const helper = getB24Helper()

const fullName = helper.currency.getCurrencyFullName('USD', 'en')
const symbol = helper.currency.getCurrencyLiteral('USD', 'en')
const formatted = helper.currency.format(1234.56, 'USD', 'en')
```

Use these for any UI that displays prices — they respect the portal's currency configuration. Don't hard-code `'$'` / decimal separators.

## App options (helper level)

The helper-level `OptionsManager` adds bulk save + optional Pull notifications on top of the frame-level `options.appSet/userSet`:

```ts
await helper.appOptions.save(
  { featureFlags: helper.appOptions.encode({ a: 1 }) },
  {
    moduleId: 'application',
    command: 'FEATURES_UPDATED',
    params: { source: 'app' }
  }
)

const cfg = helper.appOptions.getJsonObject('featureFlags', {})
```

Use this when:

- You're saving multiple keys at once (one round-trip instead of N).
- Other open instances of the app should react to the change — pass the Pull `command` and they'll receive it.

## License-aware throttling

`LicenseManager` (loaded as part of `LoadDataType.App`) detects enterprise portals and swaps `RestrictionManager` params automatically. No code change needed — just include `LoadDataType.App` in the boot list.

## Anti-patterns

- Loading all `LoadDataType.*` entries "to be safe" — adds REST calls at boot for data you don't use.
- Calling `getB24Helper()` before `initB24Helper()` resolves — returns no data.
- Bypassing `useB24Helper()` and using `B24HelperManager` directly — you lose the lifecycle wiring around Pull.
