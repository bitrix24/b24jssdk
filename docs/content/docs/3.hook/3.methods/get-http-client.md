---
title: B24Hook.getHttpClient()
description: 'Returns an HTTP client for requests.'
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

::caution
B24Hook (Webhook) is not safe for client-side use — keep and use it only on the server
::

## Usage

`getHttpClient(): TypeHttp`{lang="ts-type"}

Returns an HTTP client implementing the [`TypeHttp`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/http.ts) interface for requests.

## Example

In this example, we will set fine-tuning a `LoggerBrowser` for HttpClient.

Then get the current time on the Bitrix24 side and see logs in console. 

::code-group

```ts [Example.ts]
import { B24Hook, LoggerBrowser, LoggerType } from '@bitrix24/b24jssdk'

// Define the dev mode
const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)

const $logger = LoggerBrowser.build('MyApp', devMode)
const $b24 = B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/xxxx/')

// init custom logger for debug
const loggerForDebugB24 = LoggerBrowser.build('MyApp:DebugB24')
loggerForDebugB24.setConfig({
  [LoggerType.desktop]: false,
  [LoggerType.log]: true,
  [LoggerType.info]: true,
  [LoggerType.warn]: true,
  [LoggerType.error]: true,
  [LoggerType.trace]: true
})

const httpClient = $b24.getHttpClient()
httpClient.setLogger(loggerForDebugB24)

// call some method and see log in console
const response = await $b24.callMethod('server.time')
$logger.log(`Server time: ${response.getData()?.result}`)
```

```ts [TypeHttp.ts]
type TypeHttp = {
  setLogger(logger: LoggerBrowser): void
  getLogger(): LoggerBrowser

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

- [callMethod](/docs/hook/methods/call-method/) - Learn how to call a REST API method with the specified parameters
- [callListMethod](/docs/hook/methods/call-list-method/) - Calls a REST API list method with the specified parameters
- [fetchListMethod](/docs/hook/methods/fetch-list-method/) - Calls a REST API list method and returns a generator object
- [callBatchByChunk](/docs/hook/methods/call-batch-by-chunk/) - Executes a batch request with any number of commands
- [callBatch](/docs/hook/methods/call-batch/) - Executes a batch request with a maximum of 50 commands
