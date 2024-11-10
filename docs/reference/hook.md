---
outline: deep
---

# Hook

This code provides an implementation of the `B24Hook` class, which is used for working with webhooks in Bitrix24.

## B24Hook Class

```ts
import { B24Hook } from '@bitrix24/b24jssdk'
const B24 = new B24Hook({
    b24Url: 'https://your_domain.bitrix24.com',
    userId: 123,
    secret: 'k32t88gf3azpmwv3',
})
```

`B24Hook` extends [`AbstractB24`](abstract-b24) and is used for managing webhooks in Bitrix24.

### Constructor

```ts
constructor(b24HookParams: B24HookParams)
```

The type [`B24HookParams`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/auth.ts) describes the webhook 
parameters used for initializing the authorization manager and HTTP client:

| Field    | Type     | Description                                                           |
|----------|----------|-----------------------------------------------------------------------|
| `b24Url` | `string` | Bitrix24 portal URL, e.g., `https://your-bitrix-portal.bitrix24.com`. |
| `userId` | `number` | User identifier.                                                      |
| `secret` | `string` | Secret key.                                                           |

## Usage

The `B24Hook` class provides interaction with the Bitrix24 API through webhooks.

This class can be used to integrate applications with Bitrix24, ensuring secure and efficient interaction with the API via webhooks.

```ts
import {
	B24Hook,
	Text,
	EnumCrmEntityTypeId,
	LoggerBrowser,
	Result
} from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build(
	'MyApp',
	true
)

const B24 = new B24Hook({
	b24Url: 'https://your_domain.bitrix24.com',
	userId: 123,
	secret: 'k32t88gf3azpmwv3',
})
B24.setLogger(logger)

B24.callBatch(
	{
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
	},
	true
)
.then((response: Result) => {
    const data = response.getData()

    const dataList = (data.CompanyList.items || []).map((item) => {
        return {
            id: Number(item.id),
            title: item.title,
            createdTime: Text.toDateTime(item.createdTime as ISODate)
        }
    })

    logger.info('response >> ', dataList)
})
.catch((error: Error|string) => {
    logger.error(error)
})
.finally(() => {
    logger.info('load >> stop ')
})
```

This code creates an instance of `B24Hook` to interact with the Bitrix24 API and performs a batch request to retrieve a 
list of companies, sorting them by ID in descending order.

The retrieved data is transformed into an array of objects with fields `id`, `title`, and `createdTime`, after which the 
results are logged, and in case of an error, an error message is displayed.

::: tip
You can test **B24Hook** in [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/02-nuxt-hook/pages/hook/crm-item-list.client.vue).
:::
