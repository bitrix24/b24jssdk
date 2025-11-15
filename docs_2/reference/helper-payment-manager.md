---
outline: deep
---
# `PaymentManager` Class {#PaymentManager}

The `PaymentManager` class is used to manage payment data in Bitrix24. It extends the functionality of [`AbstractHelper`](helper-abstract-helper) and provides methods for retrieving application payment data.

::: tip
You can test working with **PaymentManager** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/index.client.vue).
:::

## Getters {#getters}

### `data` {#data}
```ts
get data(): TypePayment
```

Returns the application payment data of type [`TypePayment`](#typePayment).

## Data Types {#types}

### `TypePayment` {#typePayment}

The `TypePayment` type represents information about the application's payment.

- **`isExpired: boolean`**: Flag indicating whether the paid or trial period has expired.
- **`days: number`**: Number of days until the end of the paid or trial period.