---
outline: deep
---

# `B24Frame` Class {#B24Frame}

Designed for managing Bitrix24 applications. It inherits functionality from [`AbstractB24`](core-abstract-b24) and provides methods for working with authentication, messages, sliders, and more.

Implements the [`TypeB24`](types-type-b24) interface.

::: tip
You can test working with **B24Frame** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/index.client.vue).
:::

## Constructor {#constructor}

```ts
constructor(queryParams: B24FrameQueryParams)
```

The [`B24FrameQueryParams`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/auth.ts) type describes the parameters needed to initialize a Bitrix24 application frame.

| Field      | Type      | Description                        |
|------------|-----------|------------------------------------|
| `DOMAIN`   | `string`  | Bitrix24 account domain name.      |
| `PROTOCOL` | `boolean` | Connection protocol.               |
| `LANG`     | `string`  | Bitrix24 interface language.       |
| `APP_SID`  | `string`  | Application session identifier.    |

## Getters {#getters}
### `isInit` {#isInit}
```ts
get isInit(): boolean
```
Indicates whether the data is initialized. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/bx24-init.html)

### `isFirstRun` {#isFirstRun}
```ts
get isFirstRun(): boolean
```
Returns a flag indicating whether this is the first run of the application. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/bx24-install.html)

### `isInstallMode` {#isInstallMode}
```ts
get isInstallMode(): boolean
```
Returns a flag indicating whether the application is in installation mode. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/bx24-install.html)

### `auth` {#auth}
```ts
get auth(): AuthManager
```
Returns the [authorization manager](frame-auth).

### `parent` {#parent}
```ts
get parent(): ParentManager
```
Returns the [parent window manager](frame-parent).

### `slider` {#slider}
```ts
get slider(): SliderManager
```
Returns the [slider manager](frame-slider).

### `placement` {#placement}
```ts
get placement(): PlacementManager
```
Returns the [placement manager](frame-placement).

### `options` {#options}
```ts
get options(): OptionsManager
```
Returns the [options manager](frame-options).

### `dialog` {#dialog}
```ts
get dialog(): DialogManager
```
Returns the [dialog manager](frame-dialog).

## Methods {#methods}
::: info
Implements the [`TypeB24`](types-type-b24) interface.
:::

### `installFinish` {#installFinish}
```ts
async installFinish(): Promise<any>
```

Signals the completion of the application installation. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/bx24-install-finish.html)

### `getAppSid` {#getAppSid}
```ts
getAppSid(): string
```

Returns the application identifier relative to the parent window.

### `getLang` {#getLang}
```ts
getLang(): B24LangList
```

Returns the [localization](core-lang-list) of the Bitrix24 interface. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-get-lang.html)

## Usage {#usage}

This code creates an instance of `B24Frame` to interact with the Bitrix24 API and performs a batch request to retrieve a list of companies, sorting them by ID in descending order.

The retrieved data is transformed into an array of objects with fields `id`, `title`, and `createdTime`, after which the results are logged to the console, and in case of an error, an error message is displayed.

::: warning
The code must be run as a [Bitrix24 application](https://apidocs.bitrix24.com/api-reference/app-installation/local-apps/index.html) (in a frame).
:::

::: code-group
```ts [TypeScript]
import {
	initializeB24Frame,
	LoggerBrowser,
	B24Frame,
	Result,
	EnumCrmEntityTypeId,
	Text,
	type ISODate
} from '@bitrix24/b24jssdk'
	
const $logger = LoggerBrowser.build('MyApp', import.meta.env?.DEV === true)
let $b24: B24Frame

initializeB24Frame()
.then((response: B24Frame) => {
	$b24 = response
	
	return $b24.callBatch({
		CompanyList: {
			method: 'crm.item.list',
			params: {
				entityTypeId: EnumCrmEntityTypeId.company,
				order: { id: 'desc' },
				select: [
					'id',
					'title',
					'createdTime'
				]
			}
		}
	}, true )
})
.then((response: Result) => {
	const data = response.getData()
	const dataList = (data.CompanyList.items || []).map((item: any) => {
		return {
			id: Number(item.id),
			title: item.title,
			createdTime: Text.toDateTime(item.createdTime as ISODate)
		}
	})
	
	$logger.info('response >> ', dataList)
	$logger.info('load >> stop ')
})
.catch((error) => {
	$logger.error(error)
})
```
```html [UMD.js]
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Bitrix24 Frame Demo</title>
</head>
<body>
<p>See the result in the developer console</p>
<script src="https://unpkg.com/@bitrix24/b24jssdk@latest/dist/umd/index.min.js"></script>
<script>
document.addEventListener('DOMContentLoaded', async () => {
	try
	{
		const $logger = B24Js.LoggerBrowser.build('MyApp', true);
		let $b24;
		
		$b24 = await B24Js.initializeB24Frame();
		
		const response = await $b24.callBatch({
			CompanyList: {
				method: 'crm.item.list',
				params: {
					entityTypeId: B24Js.EnumCrmEntityTypeId.company,
					order: { id: 'desc' },
					select: [
						'id',
						'title',
						'createdTime'
					]
				}
			}
		}, true );
		
		const data = response.getData();
		const dataList = (data.CompanyList.items || []).map((item) => {
			return {
				id: Number(item.id),
				title: item.title,
				createdTime: B24Js.Text.toDateTime(item.createdTime)
			}
		});
		
		$logger.info('response >> ', dataList);
		$logger.info('load >> stop ');
	}
	catch (error)
	{
		console.error(error);
	}
});
</script>
</body>
</html>
```
```vue [VUE]
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import {
	initializeB24Frame,
	LoggerBrowser,
	B24Frame,
	EnumCrmEntityTypeId,
	Text,
	type ISODate
} from '@bitrix24/b24jssdk'

const $logger = LoggerBrowser.build('MyApp', import.meta.env?.DEV === true)
let $b24: B24Frame

onMounted(async () => {
	try
	{
		$b24 = await initializeB24Frame()
		
		const response = await $b24.callBatch({
			CompanyList: {
				method: 'crm.item.list',
				params: {
					entityTypeId: EnumCrmEntityTypeId.company,
					order: { id: 'desc' },
					select: [
						'id',
						'title',
						'createdTime'
					]
				}
			}
		}, true)
		
		const data = response.getData()
		const dataList = (data.CompanyList.items || []).map((item: any) => {
			return {
				id: Number(item.id),
				title: item.title,
				createdTime: Text.toDateTime(item.createdTime as ISODate)
			}
		})
		
		$logger.info('response >> ', dataList)
		$logger.info('load >> stop ')
	}
	catch (error)
	{
		$logger.error(error)
	}
})

onUnmounted(() => {
	$b24?.destroy()
})
</script>

<template>
	<p>See the result in the developer console</p>
</template>
```
:::