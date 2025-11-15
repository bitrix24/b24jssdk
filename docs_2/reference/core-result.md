---
outline: deep
---
# `Result` Class {#result}

The `Result` class represents the outcome of an operation, indicating success or failure, along with associated data and errors.

It is analogous to the `\Bitrix\Main\Result` class from the Bitrix Framework.

Implements the [`IResult`](types-interface-iresult) interface.

## Usage Example

```ts
import { Result, LoggerBrowser } from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build(
    'Demo: Result',
    import.meta.env?.DEV === true
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

This example demonstrates how to use the `Result` class to store data and handle errors resulting from an operation.

- A new `Result` object is created, and initial data `{someKey0: 'SomeData'}` is set.
- The current result is checked for success (`result.isSuccess`):
- **Calling `proc1`:**
	- If `proc1` returns an unsuccessful result, errors from `proc1` are added to the current result.
	- If `proc1` is successful, data from `proc1` is merged with the current data.
- **Calling `proc2`:**
	- If `proc2` returns an unsuccessful result, errors from `proc2` are added to the current result.
	- If `proc2` is successful, data from `proc2` is merged with the current data.
- **Outcome**
- The `proc1` function always returns an error, so the final result will be unsuccessful.
- `logger.log` will output the error message `['Some error 1']`, as `proc1` adds an error to the result.

::: tip
You can test working with **Result** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/02-nuxt-hook/pages/core/use-result.client.vue).
:::