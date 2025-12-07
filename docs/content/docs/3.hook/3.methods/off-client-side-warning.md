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

::caution
B24Hook (Webhook) is not safe for client-side use — keep and use it only on the server
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

- [callMethod](/docs/hook/methods/call-method/) - Learn how to calls a REST API method with the specified parameters
- [callBatch](/docs/hook/methods/call-batch/) - Executes a batch request with a maximum of 50 commands
- [callBatchByChunk](/docs/hook/methods/call-batch-by-chunk/) - Executes a batch request with any number of commands
- [callListMethod](/docs/hook/methods/call-list-method/) - Calls a REST API list method with the specified parameters
- [fetchListMethod](/docs/hook/methods/fetch-list-method/) - Calls a REST API list method and returns a generator object
