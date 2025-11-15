---
outline: deep
---
# `AjaxResult` Class {#AjaxResult}

The `AjaxResult` class represents the result of a REST API request and extends the [`Result`](core-result) class, implementing the [`IResult`](types-interface-iresult) interface.

## Constructor {#constructor}

```ts
constructor(
	answer: AjaxResultParams,
	query: AjaxQuery,
	status: number
)
```

- **`answer`**: [`AjaxResultParams`](#AjaxResultParams) - Response parameters.
- **`query`**: [`AjaxQuery`](#AjaxQuery) - The query that was executed.
- **`status`**: `number` - Response status.

## Methods {#methods}

> **Note**: The `setData` method is not supported in `AjaxResult` and will throw an error if attempted.

##### `getData` {#getData}
```ts
getData(): Payload<unknown>
```

Retrieves the data associated with the result.

##### `isMore` {#isMore}
```ts
isMore(): boolean
```

Checks if there are more data to request.

##### `getTotal` {#getTotal}
```ts
getTotal(): number
```

Returns the total number of items.

##### `getStatus` {#getStatus}
```ts
getStatus(): number
```

Returns the response status.

##### `getQuery` {#getQuery}
```ts
getQuery(): AjaxQuery
```

Returns the [query](#AjaxQuery) that was executed.

##### `getNext` {#getNext}
```ts
getNext(
	http: TypeHttp
): Promise<false|AjaxResult>
```

Asynchronously retrieves the next result, if available.

| Parameter | Type      | Description                      |
|-----------|-----------|----------------------------------|
| `http`    | `TypeHttp`| HTTP client to execute the query.|

Returns a `Promise` that resolves to `AjaxResult` or `false` if no more data is available.

## Data Types {#types}

### `AjaxResultParams` {#AjaxResultParams}

The `AjaxResultParams` type is used to represent the parameters of an API request result.

| Property           | Type                                                  | Description                            |
|--------------------|-------------------------------------------------------|----------------------------------------|
| `error`            | `string\|{error: string, error_description: string}`  | Error or error object.                 |
| `error_description`| `string`                                              | Error description.                     |
| `result`           | `any`                                                 | Request result.                        |
| `next`             | `NumberString`                                        | Next item (if available).              |
| `total`            | `NumberString`                                        | Total number of items (if available).  |

### `AjaxQuery` {#AjaxQuery}

The `AjaxQuery` type is used to represent an API request.

| Property | Type      | Description       |
|----------|-----------|-------------------|
| `method` | `string`  | Request method.   |
| `params` | `{}`      | Request parameters.|
| `start`  | `number`  | Starting position.|