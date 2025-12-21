---
title: B24Hook.offClientSideWarning()
description: 'Disables warning about front-end query execution.'
navigation:
  title: offClientSideWarning
links:
  - label: B24Hook
    iconName: GitHubIcon
    to: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/hook/controller.ts
  - label: TypeB24
    iconName: GitHubIcon
    to: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/b24.ts
---

::caution{title="⚠️ CAUTION: SECURITY"}
The `B24Hook` object is intended **exclusively for use on the server**.

- A webhook contains a secret access key, which **MUST NOT** be used in client-side code (browser, mobile app).
- For the client side, use [`B24Frame`](/docs/frame/).
::

## Usage

`offClientSideWarning(): void`{lang="ts-type"}

Disables warning about front-end query execution.

## Example

```ts
import { B24Hook } from '@bitrix24/b24jssdk'

const $b24 = B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/xxxx/')

// @memo: You should not use hook requests on the front-end side. This operation is unsafe. Instead, use the back-end.
$b24.offClientSideWarning()
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
