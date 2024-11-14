---
outline: deep
---
# `TypeHttp` {#TypeHttp}

```ts
import { type TypeHttp } from '@bitrix24/b24jssdk'
```

Implementation:
- [Http](core-http)

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

### `batch` {#batch}
```ts
batch(
	calls: any[]|object,
	isHaltOnError: boolean
): Promise<Result>
```
Executes a batch request.

| Parameter        | Type             | Description                           |
|------------------|------------------|---------------------------------------|
| `calls`          | `any[]\|object`  | Batch of requests.                    |
| `isHaltOnError`  | `boolean`        | Halt execution on error.              |

Returns a `Promise` that resolves to a [`Result`](core-result) object.

### `call` {#call}
```ts
call(
	method: string,
	params: object,
	start: number
): Promise<AjaxResult>
```
Calls a method with the specified parameters.

| Parameter | Type      | Description           |
|-----------|-----------|-----------------------|
| `method`  | `string`  | Method to call.       |
| `params`  | `object`  | Request parameters.   |
| `start`   | `number`  | Starting position.    |

Returns a `Promise` that resolves to an [`AjaxResult`](core-ajax-result) object.

### `setRestrictionManagerParams` {#setRestrictionManagerParams}
```ts
setRestrictionManagerParams(
	params: TypeRestrictionManagerParams
): void
```
Sets [parameters](types-type-restriction-manager-params) for the [restriction manager](core-restriction-manager).

| Parameter | Type                            | Description                 |
|-----------|---------------------------------|-----------------------------|
| `params`  | `TypeRestrictionManagerParams`  | Parameters to set.          |

### `getRestrictionManagerParams` {#getRestrictionManagerParams}
```ts
getRestrictionManagerParams(): TypeRestrictionManagerParams
```
Returns [parameters](types-type-restriction-manager-params) for the [restriction manager](core-restriction-manager).

### `setLogTag` {#setLogTag}
```ts
setLogTag(
	logTag?: string
): void
```
Sets a tag for logging.

### `clearLogTag` {#clearLogTag}
```ts
clearLogTag(): void
```
Clears the set tag for logging.