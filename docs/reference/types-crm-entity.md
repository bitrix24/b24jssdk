---
outline: deep
---

# CRM Entity Type Enumerations {#CromOwnerType}

These enumerations define the CRM entity types used in Bitrix24.

They help identify various entities in the CRM system (leads, deals, contacts, and others).

## EnumCrmEntityType

```ts
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

console.log(EnumCrmEntityTypeId.deal)
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
| `quote`      | `CRM_QUOTE`         | Commercial proposal    |
| `requisite`  | `CRM_REQUISITE`     | Requisite              |

## EnumCrmEntityTypeId

```ts
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

console.log(EnumCrmEntityTypeId.deal)
```

`EnumCrmEntityTypeId` represents numerical identifiers for CRM entity types:

| Key          | Value | Description            |
|--------------|-------|------------------------|
| `undefined`  | 0     | Undefined type         |
| `lead`       | 1     | Lead                   |
| `deal`       | 2     | Deal                   |
| `contact`    | 3     | Contact                |
| `company`    | 4     | Company                |
| `oldInvoice` | 5     | Old version of invoice |
| `invoice`    | 31    | Invoice                |
| `quote`      | 7     | Commercial proposal    |
| `requisite`  | 8     | Requisite              |

These enumerations can be used to work with different types of entities in Bitrix24 CRM, providing a convenient way to identify and process them.

::: tip
You can test working with **EnumCrmEntityTypeId** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/02-nuxt-hook/pages/hook/crm-item-list.client.vue).
:::