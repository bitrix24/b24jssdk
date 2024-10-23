---
outline: deep
---
# Data Types and Interfaces for Authorization

This code defines data types and interfaces used for handling authorization and parameters exchanged between an application and Bitrix24.

These types help structure data related to OAuth authorization and interaction with Bitrix24.

## Data Types

### AuthError

```ts
import {type TypeDescriptionError } from '@bitrix24/b24jssdk/types/auth'
```

`TypeDescriptionError` describes the structure of an authorization error:

| Field               | Type     | Description                                           |
|---------------------|----------|-------------------------------------------------------|
| `error`             | `string` | Error code, e.g., 'invalid_token' or 'expired_token'. |
| `error_description` | `string` | Description of the error.                             |

### B24HookParams

```ts
import {type B24HookParams } from '@bitrix24/b24jssdk/types/auth'
```

`B24HookParams` describes parameters for a hook:

| Field    | Type     | Description                                                           |
|----------|----------|-----------------------------------------------------------------------|
| `b24Url` | `string` | Bitrix24 portal URL, e.g., `https://your-bitrix-portal.bitrix24.com`. |
| `userId` | `number` | User identifier.                                                      |
| `secret` | `string` | Secret key.                                                           |

### B24FrameQueryParams

```ts
import {type B24FrameQueryParams } from '@bitrix24/b24jssdk/types/auth'
```

`B24FrameQueryParams` describes parameters passed in a GET request from the Bitrix24 parent window to the application:

| Field      | Type                           | Description                     |
|------------|--------------------------------|---------------------------------|
| `DOMAIN`   | `string \| null \| undefined`  | Bitrix24 domain.                |
| `PROTOCOL` | `boolean \| null \| undefined` | Protocol (HTTP/HTTPS).          |
| `LANG`     | `string \| null \| undefined`  | Interface language.             |
| `APP_SID`  | `string \| null \| undefined`  | Application session identifier. |

### RefreshAuthData

```ts
import {type RefreshAuthData } from '@bitrix24/b24jssdk/types/auth'
```

`RefreshAuthData` describes parameters passed from the parent window when calling `refreshAuth`:

| Field          | Type           | Description                                |
|----------------|----------------|--------------------------------------------|
| `AUTH_ID`      | `string`       | Authorization identifier.                  |
| `REFRESH_ID`   | `string`       | Refresh authorization identifier.          |
| `AUTH_EXPIRES` | `NumberString` | Authorization expiration time as a string. |

### MessageInitData

```ts
import {type MessageInitData } from '@bitrix24/b24jssdk/types/auth'
```

`MessageInitData` extends `RefreshAuthData` and describes parameters passed from the parent window when calling `getInitData`:

| Field               | Type                  | Description                                     |
|---------------------|-----------------------|-------------------------------------------------|
| `DOMAIN`            | `string`              | Bitrix24 domain.                                |
| `PROTOCOL`          | `string`              | Protocol (HTTP/HTTPS).                          |
| `PATH`              | `string`              | Application path.                               |
| `LANG`              | `string`              | Interface language.                             |
| `MEMBER_ID`         | `string`              | Member identifier.                              |
| `IS_ADMIN`          | `boolean`             | Whether the user is an administrator.           |
| `APP_OPTIONS`       | `Record<string, any>` | Application options.                            |
| `USER_OPTIONS`      | `Record<string, any>` | User options.                                   |
| `PLACEMENT`         | `string`              | Application placement.                          |
| `PLACEMENT_OPTIONS` | `Record<string, any>` | Placement options.                              |
| `INSTALL`           | `boolean`             | Whether the application is installed.           |
| `FIRST_RUN`         | `boolean`             | Whether it is the first run of the application. |

### AuthData

```ts
import {type AuthData } from '@bitrix24/b24jssdk/types/auth'
```

`AuthData` describes parameters for OAuth authorization:

| Field           | Type     | Description                |
|-----------------|----------|----------------------------|
| `access_token`  | `string` | Access token.              |
| `refresh_token` | `string` | Refresh token.             |
| `expires_in`    | `number` | Token lifetime in seconds. |
| `domain`        | `string` | Bitrix24 domain.           |
| `member_id`     | `string` | Member identifier.         |

## Interfaces

### AuthActions

```ts
import {type AuthActions } from '@bitrix24/b24jssdk/types/auth'
```

`AuthActions` defines an interface for updating authorization:

| Method        | Return Value        | Description                                                                |
|---------------|---------------------|----------------------------------------------------------------------------|
| `getAuthData` | `false \| AuthData` | Returns authorization data or `false` if data is unavailable.              |
| `refreshAuth` | `Promise<AuthData>` | Refreshes authorization and returns a promise with new authorization data. |

These types and interfaces provide a structured approach to handling authorization and parameters in applications integrated with Bitrix24.