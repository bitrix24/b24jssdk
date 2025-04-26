# Changelog

## [0.2.2](https://github.com/bitrix24/b24ui/compare/v0.2.1...v0.2.2) (2025-04-xx)

* feat(types): add types for catalog scope
* feat(types): add TextType
* feat(types): add order, EnumCrmEntityTypeShort
* feat(types): add CrmItemProductRow
* feat(types): add CrmItemPayment, CrmItemDelivery

## [0.2.1](https://github.com/bitrix24/b24ui/compare/v0.2.0...v0.2.1) (2025-04-25)

### Features

* **tools:** add pick, omit and isArrayOfArray functions

### Bug Fixes
* **placement.bindEvent:** restore callBack

## [0.2.0](https://github.com/bitrix24/b24ui/compare/v0.1.7...v0.2.0) (2025-04-24)

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
- fix Http -> check error_.response & check window
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
