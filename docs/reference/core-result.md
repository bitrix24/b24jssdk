---
outline: deep
---

# Result {#result}

The `Result` class represents an object used to store the outcome of an operation, including success/failure status, associated data, and errors.

It is similar to the `\Bitrix\Main\Result` class from the Bitrix Framework.

## Interface IResult

```js
import { type IResult } from '@bitrix24/b24jssdk/core/result'
```

The `IResult` interface defines the structure and methods of a result object:

- `isSuccess`: Indicates whether the operation completed successfully (without errors).
- `setData(data: any): IResult`: Sets the data associated with the result.
- `getData(): any`: Returns the data associated with the result.
- `addError(error: Error|string): IResult`: Adds an error message or error object to the result.
- `addErrors(errors: (Error|string)[]): IResult`: Adds multiple errors to the result in one call.
- `getErrors(): IterableIterator<Error>`: Returns an iterator for the errors collected in the result.
- `getErrorMessages(): string[]`: Returns an array of strings with error messages.
- `[Symbol.toPrimitive](hint: string): string | number`: Converts the `Result` object to a primitive value.

## Result Class

```js
import { Result } from '@bitrix24/b24jssdk/core/result'

const result = new Result()
```

### isSuccess

```ts
get isSuccess(): boolean
```

Returns `true` if the error collection is empty, indicating the operation was successful.

### setData

```ts
setData(data: any): Result
```

| Parameter | Type    | Description                         |
|----------|--------|----------------------------------|
| `data` | `any` | Data to be stored. |

Sets the data associated with the result and returns the current `Result` object for chaining.

### getData

```ts
getData(): any
```

Returns the data associated with the result.

### addError

```ts
addError(error: Error|string): Result
```

| Parameter | Type                 | Description                                     |
|----------|----------------------|----------------------------------------------|
| `error` | `Error` \| `string` | Error message or error object.     |

Adds an error message or error object to the result and returns the current `Result` object for chaining.

### addErrors

```ts
addErrors(errors: (Error|string)[]): Result
```

| Parameter | Type                     | Description                                         |
|----------|---------------------------|---------------------------------------------------|
| `errors` | (`Error` \| `string`)[] | Array of error messages or error objects. |

Adds multiple errors to the result in one call and returns the current `Result` object for chaining.

### getErrors

```ts
getErrors(): IterableIterator<Error>
```

Returns an iterator for the error objects collected in the result.

### getErrorMessages

```ts
getErrorMessages(): string[]
```

Returns an array of strings representing error messages.

### toString

```ts
toString(): string
```

Converts the `Result` object to a string, returning a string representation of the operation's result.

If the operation is successful, it returns a string with the data.

If the operation ended with errors, it returns a string with error messages.

## Usage Example

```ts
import { Result } from '@bitrix24/b24jssdk/core/result'
import { LoggerBrowser } from '@bitrix24/b24jssdk/logger/browser';

const logger = LoggerBrowser.build(
    'Demo: Result',
    true
);

// This function contains errors ////
function proc1(): Result
{
    const result = new Result()
    if(1 > 0)
    {
        return result.addError(new Error('Some error 1'));
    }
    
    return result.setData({someKey1: 'This data will not be used'});
}

// This function does not contain an error ////
function proc2(): Result
{
    const result = new Result()
    if(1 > 2)
    {
        return result.addError(new Error('Some error 2'));
    }
    
    return result.setData({someKey2: 'This data will be used'});
}

const result = new Result()
result.setData({
    someKey0: 'SomeData'
})

if(result.isSuccess)
{
    // proc1 returns a non-successful response ////
    const response = proc1()
    if(!response.isSuccess)
    {
        // this code works ////
        result.addErrors([
            ...response.getErrors()
        ])
    }
    else
    {
        result.setData(Object.assign(
            result.getData(),
            response.getData()
        ))
    }
}

if(result.isSuccess)
{
    // this code does not work ////
    const response = proc2()
    if(!response.isSuccess)
    {
        result.addErrors([
            ...response.getErrors()
        ])
    }
    else
    {
        result.setData(Object.assign(
            result.getData(),
            response.getData()
        ))
    }
}

if(!result.isSuccess)
{
    // this code works ////
    logger.error(result.getErrorMessages());
}
else
{
    logger.log(result.getData());
}
```

This example demonstrates how to use the `Result` class to store data and handle errors in the outcome of an operation.

- A new `Result` object is created, and initial data `{someKey0: 'SomeData'}` is set.
- It checks if the current result is successful (`result.isSuccess`):
	- **Calling `proc1`:**
	- If `proc1` returns an unsuccessful result, errors from `proc1` are added to the current result.
	- If `proc1` is successful, data from `proc1` is merged with the current data.
	- **Calling `proc2`:**
	- If `proc2` returns an unsuccessful result, errors from `proc2` are added to the current result.
	- If `proc2` is successful, data from `proc2` is merged with the current data.
- **Outcome**
  - The `proc1` function always returns an error, so the final result will be unsuccessful.
  - The logger will output the error message `['Some error 1']` because `proc1` adds an error to the result.

::: tip
You can test the `Result` in the [sandbox](https://github.com/bitrix24/b24jssdk/blob/main/playgrounds/jssdk/src/pages/core-result.vue).
:::