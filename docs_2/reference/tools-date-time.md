---
outline: deep
---
# DateTime {#dateTime}

The [Luxon](https://moment.github.io/luxon/) library is used for date and time operations.

::: tip
You can test working with **Date/Time** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/02-nuxt-hook/pages/tools/date-time.client.vue).
:::

```ts
import { DateTime } from 'luxon'
import { Text, LoggerBrowser } from '@bitrix24/b24jssdk'

const $logger = LoggerBrowser.build('Test', import.meta.env?.DEV === true)

$logger.info(
	Text.toDateTime('2012-04-12T09:53:51')
	.toFormat('HH:mm:ss y-MM-dd')
) // '09:53:51 2012-04-12' ////

$logger.info(Text.getDateForLog()) // '2012-04-12 09:53:51' ////

$logger.info(
	Text.toDateTime('2012-04-12 14:05:56', 'y-MM-dd HH:mm:ss')
	.toISO()
) // '2012-04-12T14:05:56.000+03:00' ////
```