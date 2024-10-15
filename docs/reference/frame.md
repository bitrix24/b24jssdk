---
outline: deep
---

# Frame

## Connecting and Using

[ory.Api](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/index.html)

### Native JavaScript

::: code-group
```html [index.html]
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Bitrix24 Frame Demo</title>
</head>
<body>
	<div id="app">
		<div id="initialization">Process initialization ...</div>
		<div id="ready" style="display: none;">B24Frame is ready to use</div>
	</div>
	<script type="module" src="./main.js"></script>
</body>
</html>
```

```js [main.js]
import { LoggerBrowser } from '@bitrix24/b24jssdk';
import { B24Frame } from '@bitrix24/b24jssdk/frame';

const logger = LoggerBrowser.build('Demo: Frame');
let B24;
let isInit = false;

document.addEventListener('DOMContentLoaded', async () => {
	try
	{
		B24 = await initializeB24Frame();
		B24.setLogger(LoggerBrowser.build('Core'));
		isInit = true;
		updateUI();
	}
	catch (error)
	{
		logger.error(error);
	}
});

function initializeB24Frame() {
	return new Promise((resolve, reject) => {
		let b24Frame = null;

		let queryParams = {
			DOMAIN: null,
			PROTOCOL: false,
			APP_SID: null,
			LANG: null
		};

		if(window.name)
		{
			let q = window.name.split('|');
			queryParams.DOMAIN = q[0];
			queryParams.PROTOCOL = (parseInt(q[1]) || 0) === 1;
			queryParams.APP_SID = q[2];
			queryParams.LANG = null;
		}

		if(!queryParams.DOMAIN || !queryParams.APP_SID)
		{
			return reject(new Error('Unable to initialize Bitrix24Frame library!'));
		}

		b24Frame = new B24Frame(queryParams);

		b24Frame.init()
		.then(() => {
			logger.log(`b24Frame:mounted`);
			resolve(b24Frame);
		})
		.catch((error) => {
			reject(error);
		});
	});
}

function updateUI()
{
	const initializationDiv = document.getElementById('initialization');
	const readyDiv = document.getElementById('ready');

	if (isInit) {
		initializationDiv.style.display = 'none';
		readyDiv.style.display = 'block';
	} else {
		initializationDiv.style.display = 'block';
		readyDiv.style.display = 'none';
	}
}
```
:::

### Vue
```vue [page.vue]
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { LoggerBrowser } from '@bitrix24/b24jssdk';
import { B24Frame } from '@bitrix24/b24jssdk/frame';
import type { B24FrameQueryParams } from '@bitrix24/b24jssdk/types/auth';

const logger = LoggerBrowser.build('Demo: Frame');
let B24: B24Frame;
const isInit = ref(false);

const initializeB24Frame = async (): Promise<B24Frame> => {
	const queryParams: B24FrameQueryParams = {
		DOMAIN: null,
		PROTOCOL: false,
		APP_SID: null,
		LANG: null
	};

	if(window.name)
	{
		const [domain, protocol, appSid] = window.name.split('|');
		queryParams.DOMAIN = domain;
		queryParams.PROTOCOL = parseInt(protocol) === 1;
		queryParams.APP_SID = appSid;
		queryParams.LANG = null;
	}

	if(!queryParams.DOMAIN || !queryParams.APP_SID)
	{
		throw new Error('Unable to initialize Bitrix24Frame library!');
	}

	const b24Frame = new B24Frame(queryParams);
	await b24Frame.init();
	logger.log('b24Frame:mounted');
	return b24Frame;
}

onMounted(async () => {
	try
	{
		B24 = await initializeB24Frame();
		B24.setLogger(LoggerBrowser.build('Core'));
		isInit.value = true;
	}
	catch (error)
	{
		logger.error(error);
	}
});

onUnmounted(() => {
	if(isInit.value)
	{
		B24.destroy();
	}
});
</script>

<template>
	<div v-if="!isInit">
		Process initialization ...
	</div>
	<div v-else>
		B24Frame is ready to use
	</div>
</template>
```

## Functions

### B24.setLogger

### B24.getHttpClient

## System Functions
[ory.Api](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/index.html)

Use - `B24.auth`

- BX24.getAuth - `B24.auth.getAuthData`
- BX24.refreshAuth - `B24.auth.refreshAuth`
- BX24.init - `B24.isInit`
- BX24.install - `B24.isFirstRun` || `B24.isInstallMode`
- BX24.installFinish - `B24.installFinish`

## Call Rest Methods
[ory.Api](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/how-to-call-rest-methods/index.html)

- BX24.callMethod - `B24.callMethod` | `B24.callListMethod` | `B24.fetchListMethod`
- BX24.callBatch - `B24.callBatch`
- BX24.callBind - `@deprecate`
- BX24.callUnbind - `@deprecate`
- Process Files - `@todo`

## Additional Functions
[ory.Api](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/index.html)
- BX24.isAdmin - **✔**`B24.properties.userInfo.isAdmin` | `B24.auth.isAdmin`
- BX24.getLang - **✔**`B24.getLang`
- BX24.resizeWindow - `B24.parent.resizeWindow` | `B24.parent.resizeWindowAuto`
- BX24.fitWindow - **✔**`B24.parent.fitWindow`
- BX24.getScrollSize - `B24.parent.getScrollSize`
- BX24.scrollParentWindow - `B24.parent.scrollParentWindow`
- BX24.reloadWindow - **✔**`B24.parent.reloadWindow`
- BX24.setTitle - `B24.parent.setTitle`
- BX24.ready - ?
- BX24.isReady - ?
- BX24.getDomain - **✔**`B24.properties.hostName` | `B24.getTargetOrigin` | `B24.slider.getTargetOrigin` | `B24.getTargetOriginWithPath` | `B24.slider.getUrl` | `B24.getAppSid`
- BX24.im.callTo - **✔**`B24.parent.imCallTo`
- BX24.im.phoneTo - **✔**`B24.parent.imPhoneTo`
- BX24.im.openMessenger - **✔**`B24.parent.imOpenMessenger`
- BX24.im.openHistory - ? `@deprecate` **✔**`B24.parent.imOpenHistory`
- BX24.openPath - **✔**`B24.slider.openPath`
- BX24.openApplication - `B24.slider.openSliderAppPage`
- BX24.closeApplication - `B24.parent.closeApplication`
- ? BX24.showAppForm - `@wtf` **?** `B24.slider.showAppForm`

- BX24.proxy - `@deprecate`
- BX24.proxyContext - `@deprecate`
- BX24.bind - `@deprecate`
- BX24.unbind - `@deprecate`
- BX24.loadScript - `@deprecate`

## System Dialogues
[ory.Api](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-dialogues/index.html)
- BX24.selectUser - **✔**`B24.dialog.selectUser`
- BX24.selectUsers - @problem{close} **✔**`B24.dialog.selectUsers`
- BX24.selectAccess - @problem{close} **✔**`B24.dialog.selectAccess`
- BX24.selectCRM - @problem{close|invoice|order} **✔**`B24.dialog.selectCRM`

## Options
[ory.Api](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/options/index.html)
- BX24.userOption.set - `B24.options.userSet`
- BX24.userOption.get - `B24.options.userGet`
- BX24.appOption.set - `B24.options.appSet`
- BX24.appOption.get - `B24.options.appGet`

## Properties

```js
const B24Characteristics = new CharacteristicsManager(B24)
await B24Characteristics.loadData([
	LoadDataType.Profile,
	LoadDataType.App,
	LoadDataType.Currency,
	LoadDataType.AppOptions,
	LoadDataType.UserOptions,
])
```
**+/-** process

- `CharacteristicsManager.licenseInfo`
- `CharacteristicsManager.paymentInfo`
- `CharacteristicsManager.appInfo`
- `CharacteristicsManager.hostName`
- `CharacteristicsManager.userInfo`
- `CharacteristicsManager.forB24Form`
- `CharacteristicsManager.currency`
- `CharacteristicsManager.appOptions`
- `CharacteristicsManager.userOptions`

## Placement

- `B24.placement` - `@todo`

## Push & Pull

- `@todo`