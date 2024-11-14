---
outline: deep
---
# Хук `useFormatter` {#useFormatter}

The `useFormatter` hook returns `formatterNumber` and `formatterIban` objects for use in an application.

```ts
import { useFormatter, LoggerBrowser } from '@bitrix24/b24jssdk'

const { formatterIban, formatterNumber } = useFormatter()
const $logger = LoggerBrowser.build('Test', import.meta.env?.DEV === true)

$logger.info(formatterIban.printFormat('IT60X0542811101000000123456', ' '))
// IT60 X054 2811 1010 0000 0123 456 ////

$logger.info(formatterNumber.format(15678.987, B24LangList.de)) // 15.678,99 ///
```

## `FormatterIban` {#formatterIban}

Provides methods for working with IBAN, including validation and conversion to BBAN.

### Methods {#methods-formatterIban}

#### isValid
```ts
isValid(
	iban: string
): boolean
```
Checks if the IBAN is valid.

#### printFormat
```ts
printFormat(
	iban: string,
	separator?: string
): string
```
Formats the IBAN with the specified separator.

#### electronicFormat
```ts
electronicFormat(
	iban: string
): string
```
Converts the IBAN to electronic format.

#### toBBAN
```ts
toBBAN(
	iban: string,
	separator?: string
): string
```
Converts the IBAN to BBAN.

#### fromBBAN
```ts
fromBBAN(
	countryCode: string,
	bban: string
): string
```
Converts BBAN to IBAN.

#### isValidBBAN
```ts
isValidBBAN(
	countryCode: string,
	bban: string
): boolean
```
Checks if the BBAN is valid.

```ts
$logger.info(
	formatterIban.printFormat('IT60X0542811101000000123456', ' ')
)
// IT60 X054 2811 1010 0000 0123 456 ////
```

::: tip
You can test working with **formatterIban** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/02-nuxt-hook/pages/tools/iban.server.vue).
:::

## `FormatterNumbers` {#formatterNumbers}

Provides methods for formatting numbers based on locale.

### Methods {#methods-formatterNumbers}

#### setDefLocale
```ts
setDefLocale(
	locale: string
): void
```
Sets the default locale.

#### format
```ts
format(
	value: number,
	locale?: string
): string
```
Formats the number based on the specified locale.

```ts
$logger.info(
	formatterNumber.format(15678.987, B24LangList.en)
) // 15,678.99 ///

$logger.info(
	formatterNumber.format(15678.987, B24LangList.de)
) // 15.678,99 ///

$logger.info(
	formatterNumber.format(15678.987, B24LangList.ru)
) // 15 678,99 ///
```