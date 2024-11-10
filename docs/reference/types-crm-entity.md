---
outline: deep
---
# CRM Entity Type Enumerations

These enumerations define the CRM entity types used in Bitrix24.

They help identify various entities in the CRM system, such as leads, deals, contacts, and others.

## EnumCrmEntityType

```ts
import { EnumCrmEntityType } from '@bitrix24/b24jssdk'

console.log(EnumCrmEntityType.deal)
```

`EnumCrmEntityType` represents string identifiers for CRM entity types:

| Key          | Value               | Description            |
|--------------|---------------------|------------------------|
| `undefined`  | `UNDEFINED`         | Undefined type         |
| `lead`       | `CRM_LEAD`          | Lead                   |
| `deal`       | `CRM_DEAL`          | Deal                   |
| `contact`    | `CRM_CONTACT`       | Contact                |
| `company`    | `CRM_COMPANY`       | Company                |
| `oldInvoice` | `CRM_INVOICE`       | Old version of invoice |
| `invoice`    | `CRM_SMART_INVOICE` | Invoice                |
| `quote`      | `CRM_QUOTE`         | Quote                  |
| `requisite`  | `CRM_REQUISITE`     | Requisite              |

## EnumCrmEntityTypeId

```ts
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

console.log(EnumCrmEntityTypeId.deal)
```

`EnumCrmEntityTypeId` represents numeric identifiers for CRM entity types:

| Key          | Value | Description            |
|--------------|-------|------------------------|
| `undefined`  | 0     | Undefined type         |
| `lead`       | 1     | Lead                   |
| `deal`       | 2     | Deal                   |
| `contact`    | 3     | Contact                |
| `company`    | 4     | Company                |
| `oldInvoice` | 5     | Old version of invoice |
| `invoice`    | 31    | Invoice                |
| `quote`      | 7     | Quote                  |
| `requisite`  | 8     | Requisite              |

These enumerations can be used to work with various entity types in Bitrix24 CRM, providing a convenient way to identify and process them.

::: tip
You can test **EnumCrmEntityTypeId** in [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/02-nuxt-hook/pages/hook/crm-item-list.client.vue).
:::