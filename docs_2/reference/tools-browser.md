---
outline: deep
---
# `Browser` {#Browser}

The `Browser` object of the `BrowserManager` class provides methods for determining the type of browser, Internet Explorer version, operating system, and other device characteristics such as touch input support and screen resolution.

```ts
import { Browser, LoggerBrowser } from '@bitrix24/b24jssdk'

const $logger = LoggerBrowser.build('Test', import.meta.env?.DEV === true)

$logger.info('isTouchDevice:', Browser.isTouchDevice())
// isTouchDevice: false ////
```

> It uses `navigator.userAgent` to determine browser and device characteristics.

## Methods {#methods}

### `isOpera`
```ts
isOpera(): boolean
```
Returns `true` if the current browser is Opera.

### `isIE`
```ts
isIE(): boolean
```
Returns `true` if the current browser is Internet Explorer.

### `isIE6`
```ts
isIE6(): boolean
```
Returns `true` if the current browser is Internet Explorer version 6.

### `isIE7`
```ts
isIE7(): boolean
```
Returns `true` if the current browser is Internet Explorer version 7.

### `isIE8`
```ts
isIE8(): boolean
```
Returns `true` if the current browser is Internet Explorer version 8.

### `isIE9`
```ts
isIE9(): boolean
```
Returns `true` if the current browser is Internet Explorer version 9.

### `isIE10`
```ts
isIE10(): boolean
```
Returns `true` if the current browser is Internet Explorer version 10.

### `isSafari`
```ts
isSafari(): boolean
```
Returns `true` if the current browser is Safari.

### `isFirefox`
```ts
isFirefox(): boolean
```
Returns `true` if the current browser is Firefox.

### `isChrome`
```ts
isChrome(): boolean
```
Returns `true` if the current browser is Chrome.

### `detectIEVersion`
```ts
detectIEVersion(): number
```
Returns the version of Internet Explorer or -1 if the browser is not IE.

### `isIE11`
```ts
isIE11(): boolean
```
Returns `true` if the current browser is Internet Explorer version 11.

### `isMac`
```ts
isMac(): boolean
```
Returns `true` if the operating system is MacOS.

### `isWin`
```ts
isWin(): boolean
```
Returns `true` if the operating system is Windows.

### `isLinux`
```ts
isLinux(): boolean
```
Returns `true` if the operating system is Linux and not Android.

### `isAndroid`
```ts
isAndroid(): boolean
```
Returns `true` if the device is running on Android.

### `isIPad`
```ts
isIPad(): boolean
```
Returns `true` if the device is an iPad.

### `isIPhone`
```ts
isIPhone(): boolean
```
Returns `true` if the device is an iPhone.

### `isIOS`
```ts
isIOS(): boolean
```
Returns `true` if the device is running on iOS (iPad or iPhone).

### `isMobile`
```ts
isMobile(): boolean
```
Returns `true` if the device is mobile.

### `isRetina`
```ts
isRetina(): boolean
```
Returns `true` if the device has a Retina display.

### `isTouchDevice`
```ts
isTouchDevice(): boolean
```
Returns `true` if the device supports touch input.

### `isDoctype`
```ts
isDoctype(target: any): boolean
```
Returns `true` if the document has a `CSS1Compat` compatibility mode.

### `isLocalStorageSupported`
```ts
isLocalStorageSupported(): boolean
```
Returns `true` if local storage is supported and available.

### `detectAndroidVersion`
```ts
detectAndroidVersion(): number
```
Returns the version of Android or 0 if the device is not Android.