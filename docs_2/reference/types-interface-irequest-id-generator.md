---
outline: deep
---
# `IRequestIdGenerator` {#IRequestIdGenerator}

Used for generating unique request identifiers and retrieving associated parameters.

```ts
import { type IRequestIdGenerator } from '@bitrix24/b24jssdk'
```

## Methods {#methods}

### `getRequestId`
```ts
getRequestId(): string
```
Generates and returns a unique request identifier.

### `getHeaderFieldName`
```ts
getHeaderFieldName(): string
```
Returns the name of the header field used to pass the request identifier.

### `getQueryStringParameterName`
```ts
getQueryStringParameterName(): string
```
Returns the name of the query string parameter used to pass the request identifier.

### `getQueryStringSdkParameterName`
```ts
getQueryStringSdkParameterName(): string
```
Returns the name of the query string parameter used to pass the SDK identifier.