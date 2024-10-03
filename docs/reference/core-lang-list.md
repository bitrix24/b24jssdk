---

outline: deep

---

# Language List

## Overview

`B24LangList` is an enumeration that defines the list of supported languages in Bitrix24 Cloud. This enumeration can be useful for working with language settings in applications integrated with Bitrix24.

## Description

```js
import { B24LangList } from '@bitrix24/b24jssdk/core/language/list'
```

The `B24LangList` enumeration contains the following language codes:

| Code | Language           |
|------|--------------------|
| en | English            |
| de | Deutsch            |
| la | Español            |
| br | Português (Brasil) |
| fr | Français           |
| it | Italiano           |
| pl | Polski             |
| ru | Русский            |
| ua | Українська         |
| tr | Türkçe             |
| sc | 中文（简体）	       |
| tc | 中文（繁體）         |
| ja | 日本語              |
| vn | Tiếng Việt         |
| id | Bahasa Indonesia   |
| ms | Bahasa Melayu      |
| th | ภาษาไทย            |
| ar | عربي,              |

## Notes

- The cloud version of Bitrix24 supports a wide range of languages as listed in the enumeration.
- The on-premise version of Bitrix24 typically supports 1-2 languages, which should be considered when developing and setting up localization.