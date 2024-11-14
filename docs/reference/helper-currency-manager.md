---
outline: deep
---
# `CurrencyManager` Class {#CurrencyManager}

The `CurrencyManager` class is used to manage currency data in Bitrix24. It extends the functionality of [`AbstractHelper`](helper-abstract-helper) and provides methods for formatting and retrieving currency information.

::: tip
You can test working with **CurrencyManager** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/index.client.vue).
:::

## Getters {#getters}

### `data` {#data}
```ts
get data(): {
	currencyBase: string,
	currencyList: Map<string, Currency>
}
```

Returns currency data:
- **Base currency code**
- **List** of currencies [`Currency`](#currency).

### `baseCurrency` {#baseCurrency}
```ts
get baseCurrency(): string
```

Returns the base currency code.

### `currencyList` {#currencyList}
```ts
get currencyList(): string[]
```

Returns a list of all currency codes.

## Methods {#methods}

~~### `format` {#format}
```ts
format(
	value: number,
	currencyCode: string,
	langCode: string
): string
```

Formats a value according to currency and language settings.~~

### `getCurrencyFullName` {#getCurrencyFullName}
```ts
getCurrencyFullName(
	currencyCode: string,
	langCode: string
): string
```

Returns the full name of the currency for the given currency code and language.

### `getCurrencyLiteral` {#getCurrencyLiteral}
```ts
getCurrencyLiteral(
	currencyCode: string,
	langCode: string
): string
```

Returns the string representation of the currency for the given currency code and language.

## Data Types {#types}

### `Currency` {#currency}

The `Currency` type represents information about a currency.

- **`amount: number`**: Amount.
- **`amountCnt: number`**: Number of units.
- **`isBase: boolean`**: Flag indicating whether this is the base currency.
- **`currencyCode: string`**: Currency code.
- **`dateUpdate: DateTime`**: Date of update.
- **`decimals: number`**: Number of decimal places.
- **`decPoint: string`**: Decimal separator.
- **`formatString: string`**: Format string.
- **`fullName: string`**: Full name of the currency.
- **`lid: string`**: Language identifier.
- **`sort: number`**: Sort order.
- **`thousandsSep?: string`**: Thousands separator.
- **`lang: Record<string, CurrencyFormat>`**: Currency formats for different languages.

### `CurrencyFormat` {#CurrencyFormat}

The `CurrencyFormat` type represents the format of a currency.

- **`decimals: number`**: Number of decimal places.
- **`decPoint: string`**: Decimal separator.
- **`formatString: string`**: Format string.
- **`fullName: string`**: Full name of the currency.
- **`isHideZero: boolean`**: Flag indicating whether to hide zeros.
- **`thousandsSep?: string`**: Thousands separator.
- **`thousandsVariant?: 'N'|'D'|'C'|'S'|'B'|'OWN'|string`**: Variant of the thousands separator.