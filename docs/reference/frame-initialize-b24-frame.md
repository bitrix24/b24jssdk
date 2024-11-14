---
outline: deep
---
# `B24Frame` Initialization {#initializeB24Frame}

```ts
initializeB24Frame(): Promise<B24Frame>
```

The `initializeB24Frame` function is designed to initialize a [`B24Frame`](frame-index) object, which is used for working with Bitrix24 applications.

It manages the initialization process and handles potential connection errors.

::: info
Supports repeated calls until initialization is complete, using a callback queue.
:::

**Return Value**

- **`Promise<B24Frame>`**: Returns a promise that resolves to a [`B24Frame`](frame-index) object upon successful initialization.

## Usage {#usage}

```ts
import { initializeB24Frame } from '@bitrix24/b24jssdk'
```

::: warning
The code must be run as a [Bitrix24 application](https://apidocs.bitrix24.com/api-reference/app-installation/local-apps/index.html) (in a frame).
:::

::: code-group
```ts [TypeScript]
import {
	initializeB24Frame,
	B24Frame,
} from '@bitrix24/b24jssdk'
	
let $b24: B24Frame

initializeB24Frame()
.then((response: B24Frame) => {
	$b24 = response
})
.catch((error) => {
	console.error(error)
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
		let $b24 = await B24Js.initializeB24Frame();
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
	B24Frame,
} from '@bitrix24/b24jssdk'

let $b24: B24Frame

onMounted(async () => {
	try
	{
		$b24 = await initializeB24Frame()
	}
	catch (error)
	{
		console.error(error)
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