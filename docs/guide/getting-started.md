---
outline: deep
---
# Getting Started {#getting-started}

This page will help you quickly start using `@bitrix24/b24jssdk` in your project.

## Installation {#install}

Before you begin, make sure you have the latest version of Node.js installed. Then run the following command to install the library:

```bash
npm install @bitrix24/b24jssdk
```

## Import {#import}

Import the library into your project:

```javascript
import { initializeB24Frame, B24Frame } from '@bitrix24/b24jssdk'
```

## Example {#example}

Here is a simple example demonstrating the main features of the library:

```ts
import {
    B24Hook,
    Text,
    EnumCrmEntityTypeId,
    LoggerBrowser,
    Result,
    type ISODate
} from '@bitrix24/b24jssdk'

const $logger = LoggerBrowser.build('MyApp', import.meta.env?.DEV === true)

const $b24 = new B24Hook({
    b24Url: 'https://your_domain.bitrix24.com',
    userId: 123,
    secret: 'k32t88gf3azpmwv3',
})

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

## Documentation

For more detailed information on all available functions and parameters, please refer to our documentation for [B24Hook](/reference/hook-index) and [B24Frame](/reference/frame-initialize-b24-frame).

## Support

If you have any questions or issues, you can create an issue on [GitHub](https://github.com/bitrix24/b24jssdk/issues).