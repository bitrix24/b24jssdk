---
title: B24Hook.getHttpClient()
description: 'Returns an HTTP client for requests. Works only in server environment.'
navigation:
  title: getHttpClient
links:
  - label: B24Hook
    iconName: GitHubIcon
    to: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/hook/controller.ts
  - label: TypeB24
    iconName: GitHubIcon
    to: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/b24.ts
  - label: TypeHttp
    iconName: GitHubIcon
    to: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/http.ts
---

::caution{title="⚠️ CAUTION: SECURITY"}
The `B24Hook` object is intended **exclusively for use on the server**.

- A webhook contains a secret access key, which **MUST NOT** be used in client-side code (browser, mobile app).
- For the client side, use [`B24Frame`](/docs/frame/).
::

## Usage

`getHttpClient(): TypeHttp`{lang="ts-type"}

Returns an HTTP client implementing the [`TypeHttp`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/http.ts) interface for requests.

## Example

@todo

In this example, we will set fine-tuning a `LoggerInterface` for HttpClient.

Then get the current time on the Bitrix24 side and see logs in console. 

::code-group

```ts [Example.ts]
import { B24Hook, LoggerFactory, LogLevel } from '@bitrix24/b24jssdk'

// Define the dev mode
const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)

const $logger = LoggerFactory.createForBrowser('MyApp', devMode)
const $b24 = B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/xxxx/')

// init custom logger for debug
const loggerForDebugB24 = Logger.create('MyApp:DebugB24')
loggerForDebugB24.pushHandler(new ConsoleHandler(LogLevel.DEBUG))

const httpClient = $b24.getHttpClient()
httpClient.setLogger(loggerForDebugB24)

// call some method and see log in console
const response = await $b24.callMethod('server.time')
$logger.debug(`Server time`, { result: response.getData()?.result })
```

```ts [TypeHttp.ts]
// @todo
type TypeHttp = {
  setLogger(logger: LoggerInterface): void
  getLogger(): LoggerInterface

  batch(calls: any[] | object, isHaltOnError: boolean, returnAjaxResult: boolean): Promise<Result>

  call(method: string, params: object, start: number): Promise<AjaxResult>

  setRestrictionManagerParams(params: TypeRestrictionManagerParams): void

  getRestrictionManagerParams(): TypeRestrictionManagerParams

  /**
   * On|Off warning about client-side query execution
   * @param {boolean} value
   * @param {string} message
   */
  setClientSideWarning(value: boolean, message: string): void
}
```
::

## Next Steps

Core API methods:

- [callMethod()](/docs/hook/methods/call-method/) — Call any REST API method
- [callBatch()](/docs/hook/methods/call-batch/) — Batch execution of up to 50 commands

Working with lists:

- [callFastListMethod()](/docs/hook/methods/call-fast-list-method/) — Automatic retrieval of all list pages
- [fetchListMethod()](/docs/hook/methods/fetch-list-method/) — Incremental loading of large lists via generator

Advanced scenarios:

- [callBatchByChunk()](/docs/hook/methods/call-batch-by-chunk/) — Batch execution of any number of commands with automatic chunking
