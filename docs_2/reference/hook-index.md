---
outline: deep
---

# `B24Hook` Class {#B24Hook}

Designed for managing Bitrix24 webhooks. It inherits functionality from [`AbstractB24`](core-abstract-b24) and provides
methods for working with authentication via webhooks.

Implements the [`TypeB24`](types-type-b24) interface.

::: tip
You can test working with **B24Hook** in
this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/02-nuxt-hook/pages/hook/crm-item-list.client.vue).
:::

## Constructor {#constructor}

```ts
constructor(b24HookParams: B24HookParams)
```

The [`B24HookParams`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/auth.ts) type describes
the webhook parameters used to initialize the authorization manager and HTTP client:

| Field    | Type     | Description                                                           |
|----------|----------|-----------------------------------------------------------------------|
| `b24Url` | `string` | Bitrix24 portal URL, e.g., `https://your-bitrix-portal.bitrix24.com`. |
| `userId` | `number` | User identifier.                                                      |
| `secret` | `string` | Secret key.                                                           |

## `fromWebhookUrl` {#fromWebhookUrl}

```ts
fromWebhookUrl(url: string): B24Hook
```

This static method creates an instance of `B24Hook` from full webhook URL.

| param | Type     | Description                                                                |
|-------|----------|----------------------------------------------------------------------------|
| `url` | `string` | Bitrix24 webhook URL, e.g., `https://your_domain.bitrix24.com/rest/1/xxx/` |

```ts
import { B24Hook } from '@bitrix24/b24jssdk'

const $b24 = B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/xxxx/')

```

## Methods {#methods}

::: info
Implements the [`TypeB24`](types-type-b24) interface.
:::

### `offClientSideWarning` {#offClientSideWarning}

```ts
offClientSideWarning(): void
```

Disables warning about front-end query execution.

::: warning
You should not use hook requests on the front-end side.
This operation is unsafe.
Instead, use the back-end.
:::

## Usage {#usage}

This code creates an instance of `B24Hook` to interact with the Bitrix24 API and performs a batch request to retrieve a
list of companies, sorting them by ID in descending order.

The retrieved data is transformed into an array of objects with fields `id`, `title`, and `createdTime`, after which the
results are logged to the console, and in case of an error, an error message is displayed.

```ts
import {
  B24Hook,
  Text,
  EnumCrmEntityTypeId,
  LoggerBrowser,
  Result,
  type ISODate
} from '@bitrix24/b24jssdk'

const $logger = LoggerBrowser.build(
  'MyApp',
  import.meta.env?.DEV === true
)

const $b24 = B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/xxxx/')
const $b24 = new B24Hook({
  b24Url: 'https://your_domain.bitrix24.com',
  userId: 123,
  secret: 'k32t88gf3azpmwv3',
})

// $b24.offClientSideWarning() ////

/**
 * @memo You should not use hook requests on the front-end side.
 * This operation is unsafe. Instead, use the back-end.
 */
$b24.callBatch({
  CompanyList: {
    method: 'crm.item.list',
    params: {
      entityTypeId: EnumCrmEntityTypeId.company,
      order: { id: 'desc' },
      select: [
        'id',
        'title',
        'createdTime'
      ]
    }
  }
}, true)
  .then((response: Result) => {
    const data = response.getData()
    const dataList = (data.CompanyList.items || []).map((item: any) => {
      return {
        id: Number(item.id),
        title: item.title,
        createdTime: Text.toDateTime(item.createdTime as ISODate)
      }
    })
    $logger.info('response >> ', dataList)
  })
  .catch((error) => {
    $logger.error(error)
  })
  .finally(() => {
    $logger.info('load >> stop ')
  })
```
