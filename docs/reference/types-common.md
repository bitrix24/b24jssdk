---
outline: deep
---
# Common {#common}

```ts
import type {
	NumberString,
	ISODate,
	BoolString,
	GenderString,
	PlacementViewMode,
	Fields,
	MultiField,
	MultiFieldArray,
	UserFieldType
} from '@bitrix24/b24jssdk'

import { DataType } from '@bitrix24/b24jssdk'
```

These are various data types and structures used in applications integrated with Bitrix24. They include string types representing numbers, dates, boolean values, and other specific data formats.

## Data Types {#DataTypes}

### NumberString

| Type     | Description                                                       |
|----------|----------------------------------------------------------------|
| `string` | A string that is actually a number, e.g., `20.23`.             |

### ISODate

| Type      | Description                                                          |
|----------|-------------------------------------------------------------------|
| `string` | A string in ISO date format, e.g., `2018-06-07T03:00:00+03:00`.   |

::: tip
You can test working with **ISODate** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/02-nuxt-hook/pages/hook/crm-item-list.client.vue).
:::

### BoolString

| Value | Description    |
|----------|-------------|
| `Y`      | Yes (true)  |
| `N`      | No (false)  |

### GenderString

| Value | Description  |
|----------|-----------|
| `M`      | Male      |
| `F`      | Female    |
| ``       | Not Specified |

### PlacementViewMode

| Value | Description             |
|----------|----------------------|
| `view`   | View mode            |
| `edit`   | Edit mode            |

## Data Structures {#DataStructures}

### Fields

| Field         | Type      | Description     |
|---------------|-----------|-----------------|
| `type`        | `string`  | Field type      |
| `isRequired`  | `boolean` | Required field  |
| `isReadOnly`  | `boolean` | Read-only field |
| `isImmutable` | `boolean` | Immutable field |
| `isMultiple`  | `boolean` | Multiple field  |
| `isDynamic`   | `boolean` | Dynamic field   |
| `title`       | `string`  | Field title     |

### MultiField

| Field        | Type           | Description     |
|--------------|----------------|-----------------|
| `ID`         | `NumberString` | Identifier      |
| `VALUE_TYPE` | `string`       | Value type      |
| `VALUE`      | `string`       | Value           |
| `TYPE_ID`    | `string`       | Type identifier |

### MultiFieldArray

| Field        | Type     | Description |
|--------------|----------|-------------|
| `VALUE`      | `string` | Value       |
| `VALUE_TYPE` | `string` | Value type  |

### UserFieldType

| Field          | Type     | Description            |
|----------------|----------|------------------------|
| `USER_TYPE_ID` | `string` | User type identifier   |
| `HANDLER`      | `string` | Handler                |
| `TITLE`        | `string` | Title                  |
| `DESCRIPTION`  | `string` | Description            |
| `OPTIONS`      | `object` | Options (e.g., height) |

## enum DataType {#EnumDataType}

`DataType` defines various data types used in Bitrix24:

| Key           | Value          | Description   |
|---------------|----------------|---------------|
| `undefined`   | `undefined`    | Undefined     |
| `any`         | `any`          | Any           |
| `integer`     | `integer`      | Integer       |
| `boolean`     | `boolean`      | Boolean value |
| `double`      | `double`       | Double        |
| `date`        | `date`         | Date          |
| `datetime`    | `datetime`     | Date and time |
| `string`      | `string`       | String        |
| `text`        | `text`         | Text          |
| `file`        | `file`         | File          |
| `array`       | `array`        | Array         |
| `object`      | `object`       | Object        |
| `user`        | `user`         | User          |
| `location`    | `location`     | Location      |
| `crmCategory` | `crm_category` | CRM Category  |
| `crmStatus`   | `crm_status`   | CRM Status    |
| `crmCurrency` | `crm_currency` | CRM Currency  |

These data types and structures can be used to describe and work with various entities and fields in Bitrix24.