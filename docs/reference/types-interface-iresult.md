---
outline: deep
---
# `IResult`

```ts
import { type IResult } from '@bitrix24/b24jssdk'
```

Implementation:
- [Result](core-result)
- [AjaxResult](core-ajax-result)

## Getters {#getters}

### `isSuccess` {#isSuccess}
```ts
get isSuccess(): boolean
```
Indicates whether the operation was successful (without errors).

## Methods {#methods}

### `setData`
```ts
setData(
    data: any
): IResult
```
Sets the data associated with the result.

Returns the current object for method chaining.

### `getData`
```ts
getData(): any
```
Retrieves the data associated with the result.

Returns the data stored in the result, if any.

### `addError`
```ts
addError(
    error: Error|string
): IResult
```
Adds an error message or `Error` object to the result.

Returns the current object for method chaining.

### `addErrors`
```ts
addErrors(
    errors: (Error|string)[]
): IResult
```
Adds multiple errors to the result in a single call.

Returns the current object for method chaining.

### `getErrors`
```ts
getErrors(): IterableIterator<Error>
```
Retrieves an iterator for the errors collected in the result.

Returns an iterator over the stored `Error` objects.

### `getErrorMessages`
```ts
getErrorMessages(): string[]
```
Retrieves an array of error messages from the collected errors.

Returns an array of strings representing the error messages.

### `toString`
```ts
toString(): string
```
Converts the data to a string.

Returns a string representation of the result operation.