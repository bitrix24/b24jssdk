---
outline: deep
---
# `OptionsManager` Class {#OptionsManager}

The `OptionsManager` class is used to manage application or user options in Bitrix24. It extends the functionality of [`AbstractHelper`](helper-abstract-helper) and provides methods for retrieving, encoding, and saving options.

::: tip
You can test working with **OptionsManager** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/app.options.client.vue) and [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/user.options.client.vue).
:::

## Getters {#getters}

### `data` {#data}
```ts
get data(): Map<string, any>
```

Returns a `Map` of option data.

## Methods {#methods}

### `getSupportTypes` {#getSupportTypes}
```ts
static getSupportTypes(): TypeOption[]
```

Returns an array of supported option types [`TypeOption`](#typeOption).

### `prepareArrayList` {#prepareArrayList}
```ts
static prepareArrayList(list: any): any[]
```

Converts input data into an array, if possible.

### `reset` {#reset}
```ts
reset(): void
```

Resets the option data.

### `getJsonArray` {#getJsonArray}
```ts
getJsonArray(
	key: string,
	defValue: any[] = []
): any[]
```

Returns the option value as an array.

### `getJsonObject` {#getJsonObject}
```ts
getJsonObject(
	key: string,
	defValue: Object = {}
): Object
```

Returns the option value as an object.

### `getFloat` {#getFloat}
```ts
getFloat(
	key: string,
	defValue: number = 0.0
): number
```

Returns the option value as a floating-point number.

### `getInteger` {#getInteger}
```ts
getInteger(
	key: string,
	defValue: number = 0
): number
```

Returns the option value as an integer.

### `getBoolYN` {#getBoolYN}
```ts
getBoolYN(
	key: string,
	defValue: boolean = true
): boolean
```

Returns the option value as a boolean (yes/no).

### `getBoolNY` {#getBoolNY}
```ts
getBoolNY(
	key: string,
	defValue: boolean = false
): boolean
```

Returns the option value as a boolean (no/yes).

### `getString` {#getString}
```ts
getString(
	key: string,
	defValue: string = ''
): string
```

Returns the option value as a string.

### `getDate` {#getDate}
```ts
getDate(
	key: string,
	defValue: null|DateTime = null
): null|DateTime
```

Returns the option value as a [`DateTime`](tools-date-time) object.

### `encode` {#encode}
```ts
encode(
	value: any
): string
```

Encodes a value into a JSON string.

### `decode` {#decode}
```ts
decode(
	data: string,
	defaultValue: any
): any
```

Decodes a JSON string into an object.

### `save` {#save}
```ts
async save(
	options: any,
	optionsPull?: {
		moduleId: string,
		command: string,
		params: any
	}
): Promise<Result>
```

Saves options and sends an event through [`Pull`](pull-client).

## Data Types {#types}

### `TypeOption` {#typeOption}

The `TypeOption` enumeration defines option types.

- **`NotSet`**: Not set.
- **`JsonArray`**: JSON array.
- **`JsonObject`**: JSON object.
- **`FloatVal`**: Floating-point number.
- **`IntegerVal`**: Integer.
- **`BoolYN`**: Boolean value (yes/no).
- **`StringVal`**: String.