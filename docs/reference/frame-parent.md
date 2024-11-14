---
outline: deep
---
# `ParentManager` Class {#ParentManager}

Provides methods for managing the parent application window in Bitrix24, including resizing the window, managing scroll, initiating calls, and opening the messenger.

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
await $b24.parent.fitWindow()
```

::: tip
You can test working with **B24Frame.parent** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/index.client.vue).
:::

## Methods {#methods}

### `closeApplication` {#closeApplication}
```ts
async closeApplication(): Promise<void>
```

Closes the application slider. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-close-application.html)

### `fitWindow` {#fitWindow}
```ts
async fitWindow(): Promise<any>
```

Sets the application frame size according to its content size. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-fit-window.html)

### `resizeWindow` {#resizeWindow}
```ts
async resizeWindow(
	width: number,
	height: number
): Promise<void>
```

Resizes the application frame to the specified width and height. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-resize-window.html)

### `resizeWindowAuto` {#resizeWindowAuto}
```ts
async resizeWindowAuto(
	appNode: null|HTMLElement = null,
	minHeight: number = 0,
	minWidth: number = 0
): Promise<void>
```

Automatically resizes the `document.body` of the application frame according to its content size.

| Parameter  | Type                 | Description                         |
|------------|----------------------|-------------------------------------|
| `appNode`  | `null\|HTMLElement`  | Application node for height calculation. |
| `minHeight`| `number`             | Minimum height.                     |
| `minWidth` | `number`             | Minimum width.                      |

### `getScrollSize` {#getScrollSize}
```ts
getScrollSize(): {
	scrollWidth: number,
	scrollHeight: number
}
```

Returns the internal dimensions of the application frame. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-get-scroll-size.html)

### `scrollParentWindow` {#scrollParentWindow}
```ts
async scrollParentWindow(scroll: number): Promise<void>
```

Scrolls the parent window to the specified position. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-scroll-parent-window.html)

### `reloadWindow` {#reloadWindow}
```ts
async reloadWindow(): Promise<void>
```

Reloads the application page. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-reload-window.html)

### `setTitle` {#setTitle}
```ts
async setTitle(
	title: string
): Promise<void>
```

Sets the page title. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-set-title.html)

### `imCallTo` {#imCallTo}
```ts
async imCallTo(
	userId: number,
	isVideo: boolean = true
): Promise<void>
```

Initiates a call through internal communication. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-im-call-to.html)

| Parameter | Type      | Description                                         |
|-----------|-----------|-----------------------------------------------------|
| `userId`  | `number`  | User identifier.                                    |
| `isVideo` | `boolean` | `true` for video call, `false` for audio call.      |

### `imPhoneTo` {#imPhoneTo}
```ts
async imPhoneTo(
	phone: string
): Promise<void>
```

Makes a call to the specified phone number. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-im-phone-to.html)

| Parameter | Type      | Description        |
|-----------|-----------|--------------------|
| `phone`   | `string`  | Phone number.      |

### `imOpenMessenger` {#imOpenMessenger}
```ts
async imOpenMessenger(
	dialogId: number|'chat${number}'|'sg${number}'|'imol|${number}'|undefined
): Promise<void>
```

Opens the messenger window. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-im-open-messenger.html)

| Parameter  | Type                                                              | Description            |
|------------|-------------------------------------------------------------------|------------------------|
| `dialogId` | `number\|chat${number}\|sg${number}\|imol\|${number}\|undefined`  | Dialog identifier.     |

### `imOpenHistory` {#imOpenHistory}
```ts
async imOpenHistory(
	dialogId: number|'chat${number}'|'imol|${number}'
): Promise<void>
```

Opens the message history window. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-im-open-history.html)

| Parameter  | Type                                      | Description            |
|------------|-------------------------------------------|------------------------|
| `dialogId` | `number\|chat${number}\|imol\|${number}`  | Dialog identifier.     |