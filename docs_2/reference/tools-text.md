---
outline: deep
---
# `Text` {#Text}

The `Text` object of the `TextManager` class provides methods for working with text data, including encoding and decoding HTML entities, generating random strings, converting values to various data types, and changing the case and format of strings.

> It uses the [`Luxon`](https://moment.github.io/luxon/) library for date and time operations.

```ts
import { Text, LoggerBrowser } from '@bitrix24/b24jssdk'

const $logger = LoggerBrowser.build('Test', import.meta.env?.DEV === true)

$logger.info(`${Text.getDateForLog()} UuidRfc4122:`, Text.getUuidRfc4122())
// 2012-04-12 09:53:51 UuidRfc4122: 019323ac-8ace-725b-a3dc-6a7c333da066 ////
```

## Methods {#methods}

### `getRandom`
```ts
getRandom(
	length = 8
): string
```

Generates a random string of the specified length, consisting of characters [a-z0-9].

```ts
$logger.info(Text.getRandom(15))
// cavomfautfjwr7n ////
```

### `getUniqId`
```ts
getUniqId(): string
```

Generates a unique identifier in UUID format.

```ts
$logger.info(Text.getUniqId())
// 212c0ca2-4lse-4e03-b0a8-adc1f661d64b ////
```

### `getUuidRfc4122`
```ts
getUuidRfc4122(): string
```

Generates a version 7 UUID.

```ts
$logger.info(Text.getUuidRfc4122())
// 019323b3-7926-70c1-9e2a-81c2e48fb04c ////
```

### `encode`
```ts
encode(
	value: string
): string
```

Encodes all unsafe HTML entities in a string.

```ts
const testString =  `<${'s'}cript>alert('test');<\/${'s'}cript>`
$logger.info(Text.encode(testString))
// &ltscript&gtalert(&#39test&#39);&lt/script&gt ////
```

### `decode`
```ts
decode(
	value: string
): string
```

Decodes all encoded HTML entities in a string.

```ts
const testString =  `&ltscript&gtalert(&#39test&#39);&lt/script&gt`
$logger.info(Text.decode(testString)) // <script>alert('test');</script> ////
```

### `toNumber`
```ts
toNumber(
	value: any
): number
```

Converts a value to a number. Returns 0.0 if conversion is not possible.

```ts
$logger.info(Text.toNumber(`123.44`)) // 123.44 ////
```

### `toInteger`
```ts
toInteger(
	value: any
): number
```

Converts a value to an integer.

```ts
$logger.info(Text.toInteger(`123.44`)) // 123 ////
$logger.info(Text.toInteger(123.44)) // 123 ////
```

### `toBoolean`
```ts
toBoolean(
	value: any,
	trueValues = []
): boolean
```

Converts a value to a boolean. Compares the value with `'true'`, `y`, `1`, `true`, and additional values from `trueValues`.

```ts
$logger.info(Text.toBoolean(`1`)) // true ////
$logger.info(Text.toBoolean(1)) // true ////
$logger.info(Text.toBoolean(`0`)) // false ////
$logger.info(Text.toBoolean(0)) // false ////
$logger.info(Text.toBoolean('y')) // true ////
$logger.info(Text.toBoolean('Y')) // true ////
$logger.info(Text.toBoolean('true')) // true ////
$logger.info(Text.toBoolean('TRUE')) // true ////
$logger.info(Text.toBoolean('ok', ['ok', 'success'])) // true ////
$logger.info(Text.toBoolean('success', ['ok', 'success'])) // true ////
$logger.info(Text.toBoolean('fail', ['ok', 'success'])) // false ////
```

### `toCamelCase`
```ts
toCamelCase(
	str: string
): string
```

Converts a string to camelCase.

```ts
$logger.info(Text.toCamelCase('sOmE StrIng')) // someString ////
```

### `toPascalCase`
```ts
toPascalCase(
	str: string
): string
```

Converts a string to PascalCase.

```ts
$logger.info(Text.toPascalCase('sOmE StrIng')) // SomeString ////
```

### `toKebabCase`
```ts
toKebabCase(
	str: string
): string
```

Converts a string to kebab-case.

```ts
$logger.info(Text.toPascalCase('sOmE StrIng')) // s-om-e-str-ing ////
$logger.info(Text.toKebabCase('some string')) // some-string ////
$logger.info(Text.toKebabCase('someString')) // some-string ////
```

### `capitalize`
```ts
capitalize(
	str: string
): string
```

Returns a string with the first letter capitalized.

```ts
$logger.info(Text.capitalize('some string')) // Some string ////
```

### `numberFormat`
```ts
numberFormat(
	number: number,
	decimals: number = 0,
	decPoint: string = '.',
	thousandsSep: string = ','
): string
```

Formats a number with the specified number of decimal places, decimal point, and thousands separator.

```ts
$logger.info(Text.numberFormat(15678.987)) // '15,679' ////
$logger.info(Text.numberFormat(15678.987, 2)) // '15,678.99' ////
$logger.info(Text.numberFormat(15678.987, 2, ',', ' ')) // '15 678,99' ////
$logger.info(Text.numberFormat(15678.984, 2, ',', ' ')) // '15 678,98' ////
```

### `toDateTime`
```ts
toDateTime(
	dateString: string,
	template?: string,
	opts?: DateTimeOptions
): DateTime
```

Converts a string to a [`DateTime`](tools-date-time) object from ISO 8601 or using a specified template.

[Similar function](https://moment.github.io/luxon/#/parsing?id=parsing-technical-formats) for decoding

```ts
$logger.info(
	Text.toDateTime('2012-04-12T09:53:51').toFormat('HH:mm:ss y-MM-dd')
)
// '09:53:51 2012-04-12' ////
```

### `getDateForLog`
```ts
getDateForLog(): string
```

Returns the current date and time.

```ts
$logger.info(Text.getDateForLog())
// '2012-04-12 09:53:51' ////
```

### `buildQueryString`
```ts
buildQueryString(
	params: any
): string
```

Creates a query string from an object of parameters.

```ts
$logger.info(Text.buildQueryString({
	par1: 'val_1',
	par2: [
		'val_21',
		'val_22',
	],
}))
// 'par1=val_1&par2%5B0%5D=val_21&par2%5B1%5D=val_22' ////
// 'par1=val_1&par2[0]=val_21&par2[1]=val_22' ////
```