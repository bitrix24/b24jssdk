---
title: B24Hook.destroy()
description: 'Destructor. Used to destroy or clean up resources.'
navigation:
  title: destroy
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

`destroy(): void`{lang="ts-type"}

Destructor. Used to destroy or clean up resources.

## Example

```ts
import { B24Hook } from '@bitrix24/b24jssdk'

const $b24: undefined | B24Hook = B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/xxxx/')

function makeDestroy() {
  if ($b24 instanceof B24Hook) {
    $b24.destroy()
    $b24 = undefined
  }
}
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
