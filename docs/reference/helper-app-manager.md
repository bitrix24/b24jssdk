---
outline: deep
---
# `AppManager` Class {#AppManager}

The `AppManager` class is used to manage application data in Bitrix24. It extends the functionality of [`AbstractHelper`](helper-abstract-helper) and provides methods for retrieving application data and obtaining a textual description of the application's status.

::: tip
You can test working with **AppManager** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/index.client.vue).
:::

## Getters {#getters}

### `data` {#data}
```ts
get data(): TypeApp
```

Returns the application data of type [`TypeApp`](#typeApp).

### `statusCode` {#statusCode}
```ts
get statusCode(): string
```

Returns a textual description of the application's status.

Uses the [`StatusDescriptions`](#StatusDescriptions) object to convert the status from [`TypeApp`](#typeApp) into a textual description.

If the status is not recognized, it returns `'Unknown status'`.

## Data Types {#types}

>- The `EnumAppStatus` enumeration and the `StatusDescriptions` object are used together to manage and display application statuses in a more readable format.
>- The `TypeEnumAppStatus` type helps ensure type safety when working with application statuses.

### `EnumAppStatus` {#EnumAppStatus}

The `EnumAppStatus` enumeration defines various statuses that an application can have.

- **`Free: 'F'`**: Free application.
- **`Demo: 'D'`**: Demo version of the application.
- **`Trial: 'T'`**: Trial version of the application with limited usage time.
- **`Paid: 'P'`**: Paid application.
- **`Local: 'L'`**: Local application.
- **`Subscription: 'S'`**: Subscription-based application.

### `StatusDescriptions` {#StatusDescriptions}

The `StatusDescriptions` object provides textual descriptions for each application status defined in `EnumAppStatus`.

- **`F`**: `'Free'` — Free application.
- **`D`**: `'Demo'` — Demo version.
- **`T`**: `'Trial'` — Trial version.
- **`P`**: `'Paid'` — Paid application.
- **`L`**: `'Local'` — Local application.
- **`S`**: `'Subscription'` — Subscription-based application.

### `TypeEnumAppStatus` {#TypeEnumAppStatus}

The `TypeEnumAppStatus` type represents the keys of the `EnumAppStatus` enumeration. It is used to restrict the values that can be assigned to variables or parameters related to the application's status.

### `TypeApp` {#typeApp}

The `TypeApp` type represents information about an application.

- **`id: number`**: Local identifier of the application on the portal.
- **`code: string`**: Application code.
- **`version: number`**: Installed version of the application.
- **`status: TypeEnumAppStatus`**: Application status.
- **`isInstalled: boolean`**: Flag indicating whether the application is installed.