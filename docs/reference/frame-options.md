---
outline: deep
---
# `OptionsManager` Class {#OptionsManager}

Used for managing application and user settings in the Bitrix24 application. It allows initializing data, getting, and setting options through messages to the parent window.

## Methods {#methods}

### `appGet` {#appGet}
```ts
appGet(option: string): any
```

Retrieves the value of an application option.

Returns the option value or throws an error if the option is not set.

[Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/options/bx24-app-option-get.html)

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
const value: any = $b24.options.appGet('test')
```

### `appSet` {#appSet}
```ts
async appSet(
	option: string,
	value: any
): Promise<void>
```

Sets the value of an application option.

[Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/options/bx24-app-option-set.html)

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
await $b24.options.appSet('test', 123)
```

### `userGet` {#userGet}
```ts
userGet(
	option: string
): any
```

Retrieves the value of a user option.

Returns the option value or throws an error if the option is not set.

[Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/options/bx24-user-option-get.html)

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
const value: any = $b24.options.userGet('test')
```

### `userSet` {#userSet}
```ts
async userSet(
	option: string,
	value: any
): Promise<void>
```

Sets the value of a user option.

[Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/options/bx24-user-option-set.html)

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
await $b24.options.userSet('test', 123)
```