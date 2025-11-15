---
outline: deep
---
# `ProfileManager` Class {#ProfileManager}

The `ProfileManager` class is used to manage user profile data in Bitrix24. It extends the functionality of [`AbstractHelper`](helper-abstract-helper) and provides methods for retrieving the current user's profile data.

::: tip
You can test working with **ProfileManager** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/index.client.vue).
:::

## Getters {#getters}

### `data` {#data}
```ts
get data(): TypeUser
```

Returns the user profile data of type [`TypeUser`](#typeUser).

## Data Types {#types}

### `TypeUser` {#typeUser}

The `TypeUser` type represents information about a user.

- **`isAdmin: boolean`**: Flag indicating whether the user is an administrator.
- **`id: null|number`**: User identifier.
- **`lastName: null|string`**: User's last name.
- **`name: null|string`**: User's first name.
- **`gender: GenderString`**: User's gender.
- **`photo: null|string`**: URL of the user's photo.
- **`TimeZone: null|string`**: User's time zone.
- **`TimeZoneOffset: null|number`**: Time zone offset.
