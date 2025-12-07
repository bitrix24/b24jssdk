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

::caution
B24Hook (Webhook) is not safe for client-side use — keep and use it only on the server
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

- [callMethod](/docs/hook/methods/call-method/) - Learn how to calls a REST API method with the specified parameters
- [callBatch](/docs/hook/methods/call-batch/) - Executes a batch request with a maximum of 50 commands
- [callBatchByChunk](/docs/hook/methods/call-batch-by-chunk/) - Executes a batch request with any number of commands
- [callListMethod](/docs/hook/methods/call-list-method/) - Calls a REST API list method with the specified parameters
- [fetchListMethod](/docs/hook/methods/fetch-list-method/) - Calls a REST API list method and returns a generator object
