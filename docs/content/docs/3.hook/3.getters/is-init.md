---
title: B24Hook.isInit
description: 'Use B24Hook.isInit to retrieve initialization state information. Works only in server environment.'
navigation:
  title: isInit
links:
  - label: B24Hook
    iconName: GitHubIcon
    to: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/hook/controller.ts
  - label: TypeB24
    iconName: GitHubIcon
    to: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/b24.ts
---

::caution
B24Hook (Webhook) is not safe for client-side use — keep and use it only on the server
::

## Usage

`get isInit(): boolean`{lang="ts-type"}

Indicates whether the data is initialized. [Similar function](https://apidocs.bitrix24.com/sdk/bx24-js-sdk/system-functions/bx24-init.html) in BX24.js.

## Example

```ts [Example.ts]
import { B24Hook, LoggerBrowser } from '@bitrix24/b24jssdk'

// Define the dev mode
const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)

const $logger = LoggerBrowser.build('MyApp', devMode)
const $b24 = B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/xxxx/')

$logger.info($b24.isInit)  // true
```

## Next Steps

Core API methods:

- [callMethod()](/docs/hook/methods/call-method/) — Call any REST API method
- [callBatch()](/docs/hook/methods/call-batch/) — Batch execution of up to 50 commands

Working with lists:

- [callFastListMethod()](/docs/hook/methods/call-fast-list-method/) — Automatic retrieval of all list pages
- [fetchListMethod()](/docs/hook/methods/fetch-list-method/) — Incremental loading of large lists via generator

Advanced scenarios:

- [callBatchByChunk()](/docs/hook/methods/call-batch-by-chunk/) — Batch execution of any number of commands with automatic chunking
