---
outline: deep
---
# Restriction Manager

Manages the request rate limitations to the Bitrix24 API. It tracks the request rate separately for each Bitrix24 account and considers the IP address from which the request is made.

::: tip
You can test working with the **Restriction Manager** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/02-nuxt-hook/pages/hook/testing-rest-api-calls.client.vue).
:::

## `RestrictionManager` Class {#RestrictionManager}

Integrated into the [`Http`](core-http) class.

> By default, [`RestrictionManagerParamsBase`](#RestrictionManagerParamsBase) are used.
>
> For Bitrix24 `Enterprise` editions, it is recommended to use [`RestrictionManagerParamsForEnterprise`](#RestrictionManagerParamsForEnterprise).

::: code-group

```ts [RestrictionManagerParamsForEnterprise]
import {
    B24Hook,
    RestrictionManagerParamsForEnterprise
} from '@bitrix24/b24jssdk'

const $b24 = new B24Hook({
    b24Url: 'https://your_domain.bitrix24.com',
    userId: 123,
    secret: 'k32t88gf3azpmwv3',
})

$b24.getHttpClient().setRestrictionManagerParams(
    RestrictionManagerParamsForEnterprise
)
```

```ts [Custom]
import {
    B24Hook
} from '@bitrix24/b24jssdk'

const $b24 = new B24Hook({
    b24Url: 'https://your_domain.bitrix24.com',
    userId: 123,
    secret: 'k32t88gf3azpmwv3',
})

$b24.getHttpClient().setRestrictionManagerParams({
    sleep: 600,
    speed: 0.01,
    amount: 30 * 5
})

```
:::

### Methods

#### `check` {#check}
```ts
check(hash: string = ''): Promise<null>
```

Checks the possibility of executing a request without exceeding limits. If limits are exceeded, it waits.

| Parameter | Type     | Description                        |
|-----------|----------|------------------------------------|
| `hash`    | `string` | Hash for logging (optional).     |

## Constants

### `RestrictionManagerParamsBase` {#RestrictionManagerParamsBase}

```ts
import { RestrictionManagerParamsBase } from '@bitrix24/b24jssdk'
```
Base parameters for the restriction manager.

- **`sleep`**: `1_000` (waiting time in milliseconds)
- **`speed`**: `0.001` (processing speed)
- **`amount`**: `30` (number of processed items)

### `RestrictionManagerParamsForEnterprise` {#RestrictionManagerParamsForEnterprise}

```ts
import { RestrictionManagerParamsForEnterprise } from '@bitrix24/b24jssdk'
```
Parameters for the restriction manager intended for use in Bitrix24 `Enterprise` editions.

- **`sleep`**: `600` (waiting time in milliseconds)
- **`speed`**: `0.01` (processing speed)
- **`amount`**: `150` (number of processed items)