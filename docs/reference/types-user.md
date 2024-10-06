---
outline: deep
---
# User Data Types

This code defines the `UserBrief` and `UserBasic` data types, which describe user fields in Bitrix24 for various scopes.

These data types are used for handling user information in the Bitrix24 API.

## UserBrief Data Type

`UserBrief` describes the basic user fields for the `scope:user_brief`.

| Field                 | Type                   | Description                      |
|-----------------------|------------------------|----------------------------------|
| `ID`                  | `NumberString`         | User identifier.                 |
| `XML_ID`              | `string \| null`       | External identifier.             |
| `ACTIVE`              | `boolean`              | Whether the user is active.      |
| `NAME`                | `string \| null`       | User's first name.               |
| `LAST_NAME`           | `string \| null`       | User's last name.                |
| `SECOND_NAME`         | `string \| null`       | User's middle name.              |
| `TITLE`               | `string \| null`       | Title or position.               |
| `IS_ONLINE`           | `BoolString`           | Online status ('Y' or 'N').      |
| `TIME_ZONE`           | `string \| null`       | Time zone.                       |
| `TIME_ZONE_OFFSET`    | `NumberString \| null` | Time zone offset.                |
| `TIMESTAMP_X`         | `string`               | Last modification time.          |
| `DATE_REGISTER`       | `ISODate`              | Registration date.               |
| `PERSONAL_PROFESSION` | `string \| null`       | Profession.                      |
| `PERSONAL_GENDER`     | `GenderString`         | Gender ('M', 'F', or '').        |
| `PERSONAL_BIRTHDAY`   | `string \| null`       | Birthday.                        |
| `PERSONAL_PHOTO`      | `string \| null`       | Photo.                           |
| `PERSONAL_CITY`       | `string \| null`       | City of residence.               |
| `PERSONAL_STATE`      | `string \| null`       | State of residence.              |
| `PERSONAL_COUNTRY`    | `string \| null`       | Country of residence.            |
| `WORK_POSITION`       | `string \| null`       | Job position.                    |
| `WORK_CITY`           | `string \| null`       | Work city.                       |
| `WORK_STATE`          | `string \| null`       | Work state.                      |
| `WORK_COUNTRY`        | `string \| null`       | Work country.                    |
| `LAST_ACTIVITY_DATE`  | `string`               | Last activity date.              |
| `UF_EMPLOYMENT_DATE`  | `ISODate \| string`    | Employment date.                 |
| `UF_TIMEMAN`          | `string \| null`       | Time management.                 |
| `UF_SKILLS`           | `string \| null`       | Skills.                          |
| `UF_INTERESTS`        | `string \| null`       | Interests.                       |
| `UF_DEPARTMENT`       | `readonly number[]`    | Departments the user belongs to. |
| `UF_PHONE_INNER`      | `NumberString \| null` | Internal phone.                  |

## UserBasic Data Type

`UserBasic` extends `UserBrief` and adds additional fields for the `scope:user_basic`.

| Field             | Type             | Description           |
|-------------------|------------------|-----------------------|
| `EMAIL`           | `string \| null` | Email address.        |
| `PERSONAL_WWW`    | `string \| null` | Personal website.     |
| `PERSONAL_ICQ`    | `string \| null` | ICQ.                  |
| `PERSONAL_PHONE`  | `string \| null` | Personal phone.       |
| `PERSONAL_FAX`    | `string \| null` | Fax.                  |
| `PERSONAL_MOBILE` | `string \| null` | Mobile phone.         |
| `PERSONAL_PAGER`  | `string \| null` | Pager.                |
| `PERSONAL_STREET` | `string \| null` | Street address.       |
| `PERSONAL_ZIP`    | `string \| null` | Postal code.          |
| `WORK_COMPANY`    | `string \| null` | Company.              |
| `WORK_PHONE`      | `string \| null` | Work phone.           |
| `UF_SKILLS`       | `string \| null` | Skills.               |
| `UF_WEB_SITES`    | `string \| null` | Websites.             |
| `UF_XING`         | `string \| null` | XING profile.         |
| `UF_LINKEDIN`     | `string \| null` | LinkedIn profile.     |
| `UF_FACEBOOK`     | `string \| null` | Facebook profile.     |
| `UF_TWITTER`      | `string \| null` | Twitter profile.      |
| `UF_SKYPE`        | `string \| null` | Skype.                |
| `UF_DISTRICT`     | `string \| null` | District.             |
| `USER_TYPE`       | `employee`       | User type (employee). |

These data types are used for handling user information in the Bitrix24 API, providing a structured approach to managing user data.