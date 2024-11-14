---
outline: deep
---
# `TypeB24` {#TypeB24}

```ts
import { type TypeB24 } from '@bitrix24/b24jssdk'
```

Implementation:
- [AbstractB24](core-abstract-b24)
  - [Hook](hook-index)
  - [Frame](frame-index)

## Getters {#getters}

### `isInit` {#isInit}
```ts
get isInit(): boolean
```
Indicates whether the data is initialized. [Similar function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/bx24-init.html)

### `auth` {#auth}
```ts
get auth(): AuthActions
```
Returns the [`AuthActions`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/auth.ts) interface for handling authorization.

## Methods {#methods}

### `init` {#init}
```ts
init(): Promise<void>
```
Used to initialize data.

### `destroy` {#destroy}
```ts
destroy(): void
```
Used to destroy or clean up resources.

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

### `getTargetOrigin` {#getTargetOrigin}
```ts
getTargetOrigin(): string
```
Returns the Bitrix24 address (e.g., `https://name.bitrix24.com`). [Similar function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-get-domain.html)

### `getTargetOriginWithPath` {#getTargetOriginWithPath}
```ts
getTargetOriginWithPath(): string
```
Returns the Bitrix24 REST API address (e.g., `https://name.bitrix24.com/rest`). [Similar function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-get-domain.html)

### `callMethod` {#callMethod}
```ts
callMethod(
	method: string,
    params?: object,
    start?: number
): Promise<AjaxResult>
```
Calls a REST API method with the specified parameters.

Returns a `Promise` that resolves to an [`AjaxResult`](core-ajax-result).

[Similar function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/how-to-call-rest-methods/bx24-call-method.html)

### `callListMethod` {#callListMethod}
```ts
callListMethod(
    method: string,
    params?: object,
    progress?: null|((progress: number) => void),
    customKeyForResult?: string|null
): Promise<Result>
```
Calls a REST API list method with the specified parameters.

| Parameter            | Type                                  | Description                           |
|----------------------|---------------------------------------|---------------------------------------|
| `method`             | `string`                              | Request method.                       |
| `params`             | `object`                              | Request parameters.                   |
| `progress`           | `null\|((progress: number) => void)`  | Progress handler.                     |
| `customKeyForResult` | `string\|null`                        | Custom field for grouping results.    |

Returns a `Promise` that resolves to a [`Result`](core-result).

### `fetchListMethod` {#fetchListMethod}
```ts
fetchListMethod(
	method: string,
    params?: any,
    idKey?: string,
    customKeyForResult?: string|null
): AsyncGenerator<any[]>
```
Calls a REST API list method and returns a generator object.

| Parameter            | Type            | Description                               |
|----------------------|-----------------|-------------------------------------------|
| `method`             | `string`        | Request method.                           |
| `params`             | `any`           | Request parameters.                       |
| `idKey`              | `string`        | Entity ID field name ('ID' or 'id').      |
| `customKeyForResult` | `string\|null`  | Custom field for grouping results.        |

### `callBatch` {#callBatch}
```ts
callBatch(
	calls: Array<any>|object,
    isHaltOnError?: boolean
): Promise<Result>
```
Executes a batch request with a maximum of 50 commands.

| Parameter        | Type                  | Description                           |
|------------------|-----------------------|---------------------------------------|
| `calls`          | `Array<any>\|object`  | Batch of requests.                    |
| `isHaltOnError`  | `boolean`             | Halt execution on error.              |

Returns a `Promise` that resolves to an [`AjaxResult`](core-ajax-result).

[Similar function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/how-to-call-rest-methods/bx24-call-batch.html)

### `callBatchByChunk` {#callBatchByChunk}
```ts
callBatchByChunk(
	calls: Array<any>,
    isHaltOnError: boolean
): Promise<Result>
```
Executes a batch request with any number of commands.

| Parameter        | Type          | Description                           |
|------------------|---------------|---------------------------------------|
| `calls`          | `Array<any>`  | Batch of requests.                    |
| `isHaltOnError`  | `boolean`     | Halt execution on error.              |

Returns a `Promise` that resolves to an [`AjaxResult`](core-ajax-result).

### `getHttpClient` {#getHttpClient}
```ts
getHttpClient(): TypeHttp
```
Returns an HTTP client implementing the [TypeHttp](types-type-http) interface for requests.