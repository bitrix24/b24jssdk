---
outline: deep
---
# `useB24Helper` Hook {#useB24Helper}

Provides a simple interface for working with Bitrix24, simplifying integration and application management.

It offers centralized management and access to the functionality of [`B24HelperManager`](helper-helper-manager) and the [`Pull`](pull-client) client.

```ts
import { useB24Helper, LoadDataType } from '@bitrix24/b24jssdk'
```

::: tip
You can test working with **useB24Helper** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/index.client.vue).
:::

## Methods {#methods}

### `initB24Helper` {#initB24Helper}

```ts
initB24Helper(
	$b24: TypeB24,
	dataTypes: LoadDataType[] = [
		LoadDataType.App,
		LoadDataType.Profile
	]
): Promise<B24HelperManager>
```

Initializes the [`B24HelperManager`](helper-helper-manager) and loads data.

- **`$b24`**: Instance of [`TypeB24`](types-type-b24)
- **`dataTypes`**: Array of data types [`LoadDataType`](#enum-LoadDataType) to load
	- By default, application and profile data are loaded.

### `isInitB24Helper` {#isInitB24Helper}

```ts
isInitB24Helper(): boolean
```

Returns `true` if the [`B24HelperManager`](helper-helper-manager) has been initialized.

### `destroyB24Helper` {#destroyB24Helper}

```ts
destroyB24Helper(): void
```

Destroys the [`B24HelperManager`](helper-helper-manager) and resets the initialization state.

### `getB24Helper` {#getB24Helper}

```ts
getB24Helper(): B24HelperManager
```

Returns an instance of [`B24HelperManager`](helper-helper-manager).

Throws an error if `B24HelperManager` has not been initialized.

### `usePullClient` {#usePullClient}

```ts
usePullClient(): void
```

Initializes the use of the [`Pull`](pull-client) client.

Throws an error if [`B24HelperManager`](helper-helper-manager) has not been initialized through [`initB24Helper`](#initB24Helper).

### `useSubscribePullClient` {#useSubscribePullClient}

```ts
useSubscribePullClient(
	callback: (message: TypePullMessage) => void,
	moduleId: string = 'application'
): void
```

Subscribes to events from the [`Pull`](pull-client) client.

[`TypePullMessage`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/pull.ts)

- **`callback`**: Callback function invoked when a message is received.
- **`moduleId`**: Module identifier for subscription (default is `'application'`).

Throws an error if the [`Pull`](pull-client) client has not been initialized through [`usePullClient`](#usePullClient).

> Methods `initB24Helper`, `usePullClient`, and `useSubscribePullClient` must be called in the correct sequence for proper operation.

### `startPullClient` {#startPullClient}

```ts
startPullClient(): void
```

Starts the [`Pull`](pull-client) client.

Throws an error if the [`Pull`](pull-client) client has not been initialized through [`usePullClient`](#usePullClient).

## Data Types {#types}
### `LoadDataType` {#enum-LoadDataType}

Defines the types of data that can be loaded in the application.

- **`App`**: Data on [application status](helper-app-manager), [application payment](helper-payment-manager), [Bitrix24 license](helper-license-manager).
- **`Profile`**: Data on the [profile](helper-profile-manager).
- **`Currency`**: Data on [currency](helper-currency-manager).
- **`AppOptions`**: [Application options](helper-options-manager).
- **`UserOptions`**: [User options](helper-options-manager).

## Usage {#usage}

```ts
import {
	initializeB24Frame,
	LoggerBrowser,
	B24Frame,
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

let $b24: B24Frame
let $isInitB24Helper = false
const $logger = LoggerBrowser.build('MyApp', import.meta.env?.DEV === true)

// ... ////
async function init(): Promise<void>
{
	try
	{
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
		$isInitB24Helper = true
		
		usePullClient()
		useSubscribePullClient(
			pullCommandHandler.bind(this),
			'main'
		)
		startPullClient()
	}
	catch(error: any)
	{
		// ... ////
	}
}

function pullCommandHandler(message: TypePullMessage): void
{
	$logger.warn('<< pull.get <<<', message)
	
	if(message.command === 'reload.options')
	{
		$logger.info("Get pull command for update. Reinit the application")
		reloadData()
		return
	}
}

async function reloadData(): Promise<void>
{
	if(!$isInitB24Helper)
	{
		return
	}
	
	return getB24Helper().loadData([
		LoadDataType.Profile,
		LoadDataType.App,
		LoadDataType.Currency,
		LoadDataType.AppOptions,
		LoadDataType.UserOptions,
	])
	.then(() => {
		return makeFitWindow()
	})
}

const b24Helper = (): null|B24HelperManager => {
	if($isInitB24Helper)
	{
		return getB24Helper()
	}
	
	return null
}
// ... ////

$logger.info({
	profileInfo: b24Helper?.profileInfo.data,
	appOptions: b24Helper?.appOptions.data,
	userOptions: b24Helper?.userOptions.data,
	isSelfHosted: b24Helper?.isSelfHosted ? 'Y' : 'N'
})
```