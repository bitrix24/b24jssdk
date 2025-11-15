---
outline: deep
---
# `DialogManager` Class {#DialogManager}

Used for displaying standard dialogs.

::: tip
You can test working with **B24Frame.parent** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/index.client.vue).
:::

## Methods {#methods}

### `selectUser` {#selectUser}
```ts
async selectUser(): Promise<null|SelectedUser>
```

Displays a standard dialog for selecting a single user.

Shows only company employees.

Returns a `Promise` that resolves to `null` or a [`SelectedUser`](#selectedUser) object.

[Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-dialogues/bx24-select-user.html)

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
const makeSelectUsers = async() => {
	const selectedUser = await $b24.dialog.selectUser()
	$logger.info(selectedUser)
}
```

### `selectUsers` {#selectUsers}
```ts
async selectUsers(): Promise<SelectedUser[]>
```

Displays a standard dialog for selecting multiple users.

Shows only company employees.

Returns a `Promise` that resolves to an array of [`SelectedUser`](#selectedUser) objects.

[Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-dialogues/bx24-select-user.html)

```ts
// ... /////
$b24 = await initializeB24Frame()
// ... /////
const makeSelectUsers = async() => {
	const selectedUsers = await $b24.dialog.selectUsers()
	
	const list = selectedUsers.map((row: SelectedUser): string => {
		return [ `[id: ${row.id}]`, row.name ].join(' ')
	})
	
	$logger.info(selectedUsers, list)
}
```

## Data Types {#types}
### `SelectedUser` {#selectedUser}

Used to represent information about a selected user in the Bitrix24 application. It contains several fields that describe the user's ID, name, photo, position, and other characteristics.

> The `sub` and `sup` fields help determine hierarchical relationships between the current user and the selected user.

- **`id: NumberString`**: User identifier. Represented as a string containing a numeric value.
- **`name: string`**: Formatted name of the user.
- **`photo: string`**: URL of the user's photo.
- **`position: string`**: User's position in the company.
- **`url: string`**: URL of the user's profile.
- **`sub: boolean`**: Flag indicating that the selected user is a subordinate of the current user. A value of `true` means the user is a subordinate.
- **`sup: boolean`**: Flag indicating that the selected user is a supervisor of the current user. A value of `true` means the user is a supervisor.