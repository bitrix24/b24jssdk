# Changelog

## [1.0.1](https://github.com/bitrix24/b24jssdk/compare/v0.5.1...v1.0.1) (2026-01-xx)

* chore(cli): add
* docs: use Bitrix24 UI (mcp, llms and more demo)
* feat(core\TypeB24): remove `getSystemLogger`
* feat(core\TypeB24.callBatchByChunk): now accumulates errors in Result
* feat(core\TypeHttp): now return ajaxClient
* feat(core\SdkError): add SdkError
* feat(core): add tools and actions
* feat(RestrictionManager): new restrictions
* feat(PlacementManager): use the property name `placement` instead of `title`
* feat(apiVersion): support api 3
* feat(logger\Logger): add new logger system
* feat(logger\handler\TelegramHandler): add Telegram handler
* feat(tools\environment): added tool for environment detection
* fix(core\TypeB24/core\TypeHttp): improve generics
* fix(logger\LoggerBrowser): marked as deprecated
* fix(tools\Type|Text|Browser): improve export
* fix(initializeB24Frame): now throw SdkError
* fix(RefreshTokenError): extends SdkError
* fix(frame\SliderManager): remove showAppForm
* fix(frame\DialogManager): remove deprecated marker

## [0.5.1](https://github.com/bitrix24/b24jssdk/compare/v0.4.10...v0.5.1) (2025-10-29)

### Features
* **AuthActions.getAuthData:** fix `expires` and add `expires_in`

## [0.4.10](https://github.com/bitrix24/b24jssdk/compare/v0.4.9...v0.4.10) (2025-10-09)
### Features
* **B24OAuth:** add CustomRefreshAuth

### Bug Fixes
* **Http.#prepareMethod:** telemetry transfer to task methods

## [0.4.9] (2025-09-12)
## [0.4.8] (2025-09-12)

## [0.4.7](https://github.com/bitrix24/b24jssdk/compare/v0.4.6...v0.4.7) (2025-09-12)

### Bug Fixes
* **MessageManager:** fix null value

## [0.4.6](https://github.com/bitrix24/b24jssdk/compare/v0.4.5...v0.4.6) (2025-09-11)

### Features
* **MessageManager:** add param isRawValue `MessageManager.send`, `PlacementManager.call('setValue', { value: 'some string' })`
* **README:** add AI usage guide for Bitrix24 SDK

### Chore
* **deps:** update

## [0.4.5](https://github.com/bitrix24/b24jssdk/compare/v0.4.4...v0.4.5) (2025-07-07)

### Features
* **Http:** batch now can return AjaxResult in response
* **TypeManager:** support for type casting in check functions


## [0.4.4](https://github.com/bitrix24/b24jssdk/compare/v0.4.3...v0.4.4) (2025-07-01)

### Features

* **B24Hook:** add fromWebhookUrl
* **EventOnAppUnInstallHandlerParams:** improve

## [0.4.3](https://github.com/bitrix24/b24jssdk/compare/v0.4.2...v0.4.3) (2025-05-22)

### ⚠ BREAKING CHANGES
* **AuthHookManager:** fix getTargetOrigin, getTargetOriginWithPath

### Features

* **B24LocaleMap:** add map for B24LangList and Locale
* **types/bizproc/activity:** add some type for `bizproc.activity`
* **types/bizproc:** add some type/functions for `bizproc`
* **types/crm:** add convertor EnumCrmEntityTypeId to EnumCrmEntityTypeShort
* **types/events:** add some interface for EventHandler
* **B24OAuth:** add `issuer` for B24OAuthParams

### Docs

* **we will add new information in the next update**
* for `OAuth` work it is worth looking at an example [@bitrix24/b24sdk-examples/08-nuxt-oauth](https://github.com/bitrix24/b24sdk-examples/tree/main/js/08-nuxt-oauth)

## [0.4.2](https://github.com/bitrix24/b24jssdk/compare/v0.4.1...v0.4.2) (2025-05-08)

### ⚠ BREAKING CHANGES

* **Node.js:** support only Node.js >= 18.0.0
* **uuidv7:** improve

### Features

* **B24OAuth:** add - not a stable implementation - not worth using for now

## [0.4.1](https://github.com/bitrix24/b24jssdk/compare/v0.4.0...v0.4.1) (2025-05-07)

### ⚠ BREAKING CHANGES

* **Node.js:** support only Node.js >= 20.0.0

### Bug Fixes
* **uuidv7:** improve

## [0.4.0](https://github.com/bitrix24/b24jssdk/compare/v0.3.0...v0.4.0) (2025-05-07)

### ⚠ BREAKING CHANGES

* **commonjs:** not support commonjs, only esm and umd
* **Node.js:** support only Node.js >= 18.0.0

### Bug Fixes

* **uuidv7:** support Node.js (Issue #2)

### Chore
* **pullClient:** support Node.js types
* **browser:** add for test UMD
* **esm:** add for test ESM

## [0.3.0](https://github.com/bitrix24/b24jssdk/compare/v0.2.3...v0.3.0) (2025-05-06)

### Features

* **Http:** improve some request params

### Chore

* **deps:** improve

## [0.2.3](https://github.com/bitrix24/b24jssdk/compare/v0.2.2...v0.2.3) (2025-04-30)

### Features

* **PlacementManager::callCustomBind:** make bind for custom events

## [0.2.2](https://github.com/bitrix24/b24jssdk/compare/v0.2.1...v0.2.2) (2025-04-26)

### Features

* **types:** add types for catalog scope, TextType, order, EnumCrmEntityTypeShort, CrmItemProductRow, CrmItemPayment, CrmItemDelivery

## [0.2.1](https://github.com/bitrix24/b24jssdk/compare/v0.2.0...v0.2.1) (2025-04-25)

### Features

* **tools:** add pick, omit and isArrayOfArray functions

### Bug Fixes
* **placement.bindEvent:** restore callBack

## [0.2.0](https://github.com/bitrix24/b24jssdk/compare/v0.1.7...v0.2.0) (2025-04-24)

### Features

* **Result\AjaxResult\AjaxError:** change code-style, improve error collection
* **Http.batch:** improve error collection

### Chore

* **code-style:** improve
* **deps:** remove prettier, npm-run-all, improve vitepress

## 0.1.7 (2025-01-25)

### Features

* **new methods**: PlacementManager::getInterface, PlacementManager::bindEvent, PlacementManager::call

## 0.1.6 (2024-11-22)

- fix FormatterNumbers -> check navigator
- fix Http -> check `error_.response` & check window
- add dependencies @types/luxon
- add docs/guide/example-hook-node-work

## 0.1.5 (2024-11-20)

- add warning about client-side query execution

## 0.1.4 (2024-11-18)

- migrate to `qs-esm`

## 0.1.3 (2024-11-18)

- Fix the error at fetchListMethod

## 0.1.2 (2024-11-18)

- The `protobufjs` module has been moved to internal

## 0.1.1 (2024-11-16)

- fix code Style

## 0.1.0 (2024-11-16)

### Features

- Hooks like initializeB24Frame, useB24Helper, and useFormatter simplify development.
- Text, Type, Pull, Slider, Feedback, LicenseManager, CurrencyManager, RestrictionManager...
