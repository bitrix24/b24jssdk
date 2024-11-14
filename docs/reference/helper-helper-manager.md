---
outline: deep
---
# `B24HelperManager` Class {#B24HelperManager}

A versatile class that manages initial application data in Bitrix24. It provides methods for loading data, managing profiles, applications, payments, licenses, currencies, and options, as well as working with the [`Pull`](pull-client) client.

::: tip
You can test working with **B24HelperManager** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/index.client.vue).
:::

Initialization should be done through the hook [`useB24Helper.initB24Helper`](helper-use-b24-helper#initB24Helper).

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()
// ... ////
async function init(): Promise<void>
{
	// ... ////
	$b24 = await initializeB24Frame()
	await initB24Helper(
		$b24,
		[
			LoadDataType.Profile,
			LoadDataType.App,
			LoadDataType.Currency,
			LoadDataType.AppOptions,
			LoadDataType.UserOptions,
		]
	)
	// ... ////
}
// ... ////
```

## Methods {#methods}

### `getLogger` {#getLogger}
```ts
getLogger(): LoggerBrowser
```

Returns the current [logger](core-logger-browser).

### `setLogger` {#setLogger}
```ts
setLogger(
	logger: LoggerBrowser
): void
```

Sets the [logger](core-logger-browser).

### `destroy` {#destroy}
```ts
destroy(): void
```

Destroys the [`Pull`](pull-client) client.

### `loadData` {#loadData}
```ts
async loadData(
	dataTypes: LoadDataType[] = [
		LoadDataType.App,
		LoadDataType.Profile
	]
): Promise<void>
```

Loads data for the specified [types](helper-use-b24-helper#enum-LoadDataType).

[See `initB24Helper`](helper-use-b24-helper#initB24Helper)

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
const {	initB24Helper, getB24Helper } = useB24Helper()
// ... ////
async function init(): Promise<void>
{
	// ... ////
	$b24 = await initializeB24Frame()
	await initB24Helper(
		$b24,
		[
			LoadDataType.Profile,
			LoadDataType.App,
			LoadDataType.AppOptions
		]
	)
	// ... ////
}
// ... ////

async function reloadData(): Promise<void>
{
	// ... ////
	return getB24Helper().loadData([
		LoadDataType.Profile,
		LoadDataType.App,
		LoadDataType.AppOptions
	])
	.then(() => {
		// ... ////
	})
}
```

### `usePullClient` {#usePullClient}
```ts
usePullClient(
	prefix: string = 'prefix',
	userId?: number
): B24HelperManager
```

Initializes the use of the `Pull` client.

[Learn more](helper-use-b24-helper#usePullClient)

### `subscribePullClient` {#subscribePullClient}
```ts
subscribePullClient(
	callback: (message: TypePullMessage) => void,
	moduleId: string = 'application'
): B24HelperManager
```

Subscribes to events from the `Pull` client.

[Learn more](helper-use-b24-helper#useSubscribePullClient)

### `startPullClient` {#startPullClient}
```ts
startPullClient(): void
```

Starts the `Pull` client.

[Learn more](helper-use-b24-helper#startPullClient)

### `getModuleIdPullClient` {#getModuleIdPullClient}
```ts
getModuleIdPullClient(): string
```

Returns the `moduleId` from [`subscribePullClient`](#subscribePullClient).

Should be used when sending a message to `Pull`.

## Getters {#getters}

### `isInit` {#isInit}
```ts
get isInit(): boolean
```
Returns `true` if the data is initialized.

```ts
import { useB24Helper } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()
// ... ////
await initB24Helper($b24)
// ... ////
$logger.info(getB24Helper().isInit)
// ... ////
```

### `profileInfo` {#profileInfo}
```ts
get profileInfo(): ProfileManager
```
Returns [profile](helper-profile-manager) data.

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()

// ... ////
await initB24Helper($b24, [LoadDataType.Profile])
// ... ////
$logger.info(getB24Helper().profileInfo.data)
// ... ////
```

### `appInfo` {#appInfo}
```ts
get appInfo(): AppManager
```
Returns [application status](helper-app-manager) data.

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()

// ... ////
await initB24Helper($b24, [LoadDataType.App])
// ... ////
$logger.info(getB24Helper().appInfo.data)
// ... ////
```

### `paymentInfo` {#paymentInfo}
```ts
get paymentInfo(): PaymentManager
```
Returns [application payment](helper-payment-manager) data.

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()

// ... ////
await initB24Helper($b24, [LoadDataType.App])
// ... ////
$logger.info(getB24Helper().paymentInfo.data)
// ... ////
```

### `licenseInfo` {#licenseInfo}
```ts
get licenseInfo(): LicenseManager
```
Returns [Bitrix24 license](helper-license-manager) data.

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()

// ... ////
await initB24Helper($b24, [LoadDataType.App])
// ... ////
$logger.info(getB24Helper().licenseInfo.data)
// ... ////
```

### `currency` {#currency}
```ts
get currency(): CurrencyManager
```
Returns [currency](helper-currency-manager) data.

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()

// ... ////
await initB24Helper($b24, [LoadDataType.Currency])
// ... ////
$logger.info({
	baseCurrency: getB24Helper().currency.baseCurrency,
	currencyList: getB24Helper().currency.currencyList
})
// ... ////
```

### `appOptions` {#appOptions}
```ts
get appOptions(): OptionsManager
```
Returns application [options](helper-options-manager).

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()

// ... ////
await initB24Helper($b24, [LoadDataType.AppOptions])
// ... ////
$logger.info(getB24Helper().appOptions.data)
// ... ////
```

### `userOptions` {#userOptions}
```ts
get userOptions(): OptionsManager
```
Returns user [options](helper-options-manager).

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()

// ... ////
await initB24Helper($b24, [LoadDataType.UserOptions])
// ... ////
$logger.info(getB24Helper().userOptions.data)
// ... ////
```

### `forB24Form` {#forB24Form}
```ts
get forB24Form(): TypeB24Form
```
Returns [data](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/b24Helper.ts) for submission to a Bitrix24 feedback form (CRM form).

| Field             | Type          | Description                                                                                                                |
|-------------------|--------------|----------------------------------------------------------------------------------------------------------------------------|
| `app_code`        | `string`     | Application code in Bitrix24                                                                                                |
| `app_status`      | `string`     | Application status                                                                                                          |
| `payment_expired` | `BoolString` | String representation of a boolean value indicating whether the payment has expired (`'Y'` for expired, `'N'` for active)   |
| `days`            | `number`     | Number of days until payment expiration or after expiration                                                                 |
| `b24_plan`        | `string`     | Bitrix24 tariff plan identifier (relevant for cloud versions)                                                               |
| `c_name`          | `string`     | User's first name.                                                                                                          |
| `c_last_name`     | `string`     | User's last name.                                                                                                           |
| `hostname`        | `string`     | Bitrix24 address (e.g., `name.bitrix24.com`).                                                                               |

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()

// ... ////
await initB24Helper($b24, [LoadDataType.App, LoadDataType.Profile])
// ... ////
$logger.info(getB24Helper().forB24Form)
// ... ////
```

::: tip
You can test working with **Bitrix24 feedback form (CRM form)** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/feedback.client.vue).
:::

### `hostName` {#hostName}
```ts
get hostName(): string
```
Returns the Bitrix24 address.

```ts
import { useB24Helper } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()

// ... ////
await initB24Helper($b24)
// ... ////
$logger.info(getB24Helper().hostName)
// ... ////
```

### `isSelfHosted` {#isSelfHosted}
```ts
get isSelfHosted(): boolean
```
Returns `true` if the application is deployed on a self-hosted server.

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()

// ... ////
await initB24Helper($b24, [LoadDataType.App])
// ... ////
$logger.info(getB24Helper().isSelfHosted)
// ... ////
```

### `primaryKeyIncrementValue` {#primaryKeyIncrementValue}
```ts
get primaryKeyIncrementValue(): number
```
Returns the increment step for ID-type fields.

For self-hosted, it's `1`; for cloud, it's `2`.

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()

// ... ////
await initB24Helper($b24, [LoadDataType.App])
// ... ////
$logger.info(getB24Helper().primaryKeyIncrementValue)
// ... ////
```

### `b24SpecificUrl` {#b24SpecificUrl}
```ts
get b24SpecificUrl(): Record<keyof typeof TypeSpecificUrl, string>

export const TypeSpecificUrl = {
	MainSettings: 'MainSettings',
	UfList: 'UfList',
	UfPage: 'UfPage'
} as const
```
Returns specific URLs for Bitrix24.

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
const { initB24Helper, getB24Helper } = useB24Helper()

// ... ////
await initB24Helper($b24, [LoadDataType.App])
// ... ////
$logger.info(getB24Helper().b24SpecificUrl.MainSettings)
// ... ////
```