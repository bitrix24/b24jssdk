---
outline: deep
---
# `LicenseManager` Class {#LicenseManager}

The `LicenseManager` class is used to manage Bitrix24 license data. It extends the functionality of [`AbstractHelper`](helper-abstract-helper) and provides methods for retrieving license data and configuring parameters for the [restriction manager](core-restriction-manager).

::: tip
You can test working with **LicenseManager** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/index.client.vue).
:::

## Getters {#getters}

### `data` {#data}
```ts
get data(): TypeLicense
```

Returns the license data of type [`TypeLicense`](#typeLicense).

## Methods {#methods}

### `makeRestrictionManagerParams` {#makeRestrictionManagerParams}
```ts
makeRestrictionManagerParams(): void
```
Called automatically during data initialization.

Configures the parameters of the [`RestrictionManager`](core-restriction-manager) based on the license.

For `Enterprise`, it uses [`RestrictionManagerParamsForEnterprise`](core-restriction-manager#RestrictionManagerParamsForEnterprise).

## Data Types {#types}

### `TypeLicense` {#typeLicense}

The `TypeLicense` type represents information about the application's license.

- **`languageId: null|string`**: Language code.
- **`license: null|string`**: Tariff designation with region indication.
- **`licenseType: null|string`**: Internal tariff designation without region indication.
- **`licensePrevious: null|string`**: Previous license value.
- **`licenseFamily: null|string`**: Tariff designation without region indication.
- **`isSelfHosted: boolean`**: Flag indicating whether it is a self-hosted (`true`) or cloud (`false`) version.