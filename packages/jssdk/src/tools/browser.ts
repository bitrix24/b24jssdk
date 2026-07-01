import { Type } from './type'

let UA: string = ''
try {
  UA = navigator?.userAgent.toLowerCase()
} catch {
  UA = '?'
}

/**
 * Cheap user-agent / platform / capability detector for browser environments.
 *
 * Exported as the `Browser` singleton. All checks are derived from a module-level
 * `UA` string (a lower-cased `navigator.userAgent`, captured once at import time)
 * or from browser globals (`window`, `document`, `navigator`, `localStorage`).
 * Because of this, the methods are only meaningful when running in a browser —
 * in non-browser environments (e.g. Node/SSR) `UA` falls back to `'?'` and any
 * method that touches `window`/`document`/`localStorage` directly may throw.
 *
 * @see bitrix/js/main/core/src/lib/browser.js
 */
class BrowserManager {
  /**
   * Checks whether the current browser is Opera.
   *
   * @returns `true` if the user agent string contains `opera`.
   */
  isOpera(): boolean {
    return UA.includes('opera')
  }

  /**
   * Checks whether the current browser is Internet Explorer (any version).
   *
   * @returns `true` if `document` exposes the legacy `attachEvent` API and the browser is not Opera.
   */
  isIE(): boolean {
    return 'attachEvent' in document && !this.isOpera()
  }

  /**
   * Checks whether the current browser is Internet Explorer 6.
   *
   * @returns `true` if the user agent string contains `msie 6`.
   */
  isIE6(): boolean {
    return UA.includes('msie 6')
  }

  /**
   * Checks whether the current browser is Internet Explorer 7.
   *
   * @returns `true` if the user agent string contains `msie 7`.
   */
  isIE7(): boolean {
    return UA.includes('msie 7')
  }

  /**
   * Checks whether the current browser is Internet Explorer 8.
   *
   * @returns `true` if the user agent string contains `msie 8`.
   */
  isIE8(): boolean {
    return UA.includes('msie 8')
  }

  /**
   * Checks whether the current browser is Internet Explorer 9 or the document is rendered in IE9+ document mode.
   *
   * @returns `true` if `document.documentMode` is defined and `>= 9`.
   */
  isIE9(): boolean {
    return 'documentMode' in document && ((document?.documentMode as number) >= 9)
  }

  /**
   * Checks whether the current browser is Internet Explorer 10 or the document is rendered in IE10+ document mode.
   *
   * @returns `true` if `document.documentMode` is defined and `>= 10`.
   */
  isIE10(): boolean {
    return 'documentMode' in document && ((document?.documentMode as number) >= 10)
  }

  /**
   * Checks whether the current browser is Safari.
   *
   * @returns `true` if the user agent string contains `safari` and does not contain `chrome`.
   */
  isSafari(): boolean {
    return UA.includes('safari') && !UA.includes('chrome')
  }

  /**
   * Checks whether the current browser is Firefox.
   *
   * @returns `true` if the user agent string contains `firefox`.
   */
  isFirefox() {
    return UA.includes('firefox')
  }

  /**
   * Checks whether the current browser is Chrome.
   *
   * @returns `true` if the user agent string contains `chrome`.
   */
  isChrome() {
    return UA.includes('chrome')
  }

  /**
   * Detects the Internet Explorer version using a chain of user-agent and
   * `document`/`navigator` heuristics (including legacy Trident/MSIE detection).
   *
   * @returns The detected IE version number, or `-1` if the browser is Opera, Safari, Firefox, or Chrome (i.e. not IE).
   */
  detectIEVersion() {
    if (
      this.isOpera()
      || this.isSafari()
      || this.isFirefox()
      || this.isChrome()
    ) {
      return -1
    }

    let rv = -1

    if (
      // @ts-expect-error we detect IEVersion ////
      !!window.MSStream
      // @ts-expect-error we detect IEVersion ////
      && !window.ActiveXObject
      && 'ActiveXObject' in window
    ) {
      rv = 11
    } else if (this.isIE10()) {
      rv = 10
    } else if (this.isIE9()) {
      rv = 9
    } else if (this.isIE()) {
      rv = 8
    }

    if (rv === -1 || rv === 8) {
      if (navigator.appName === 'Microsoft Internet Explorer') {
        const re = /MSIE (\d[.0-9]*)/
        const res = navigator.userAgent.match(re)

        if (Type.isArrayLike(res) && res.length > 0) {
          rv = Number.parseFloat(res[1]!)
        }
      }

      if (navigator.appName === 'Netscape') {
        // Alternative check for IE 11
        rv = 11
        const re = /Trident\/.*rv:(\d[.0-9]*)/

        if (re.exec(navigator.userAgent) != null) {
          const res = navigator.userAgent.match(re)

          if (Type.isArrayLike(res) && res.length > 0) {
            rv = Number.parseFloat(res[1]!)
          }
        }
      }
    }

    return rv
  }

  /**
   * Checks whether the current browser is Internet Explorer 11.
   *
   * @returns `true` if {@link detectIEVersion} resolves to `11` or higher.
   */
  isIE11(): boolean {
    return this.detectIEVersion() >= 11
  }

  /**
   * Checks whether the current OS is macOS.
   *
   * @returns `true` if the user agent string contains `macintosh`.
   */
  isMac(): boolean {
    return UA.includes('macintosh')
  }

  /**
   * Checks whether the current OS is Windows.
   *
   * @returns `true` if the user agent string contains `windows`.
   */
  isWin(): boolean {
    return UA.includes('windows')
  }

  /**
   * Checks whether the current OS is Linux (desktop, not Android).
   *
   * @returns `true` if the user agent string contains `linux` and the platform is not Android.
   */
  isLinux(): boolean {
    return UA.includes('linux') && !this.isAndroid()
  }

  /**
   * Checks whether the current OS is Android.
   *
   * @returns `true` if the user agent string contains `android`.
   */
  isAndroid(): boolean {
    return UA.includes('android')
  }

  /**
   * Checks whether the current device is an iPad.
   *
   * @returns `true` if the user agent string contains `ipad;`, or the platform is macOS with touch support (modern iPadOS reporting as Mac).
   */
  isIPad(): boolean {
    return UA.includes('ipad;') || (this.isMac() && this.isTouchDevice())
  }

  /**
   * Checks whether the current device is an iPhone.
   *
   * @returns `true` if the user agent string contains `iphone;`.
   */
  isIPhone(): boolean {
    return UA.includes('iphone;')
  }

  /**
   * Checks whether the current device runs iOS.
   *
   * @returns `true` if {@link isIPad} or {@link isIPhone} is `true`.
   */
  isIOS(): boolean {
    return this.isIPad() || this.isIPhone()
  }

  /**
   * Checks whether the current device is a mobile device.
   *
   * @returns `true` if the device is an iPhone, iPad, or Android device, or the user agent string contains `mobile` or `touch`.
   */
  isMobile(): boolean {
    return (
      this.isIPhone()
      || this.isIPad()
      || this.isAndroid()
      || UA.includes('mobile')
      || UA.includes('touch')
    )
  }

  /**
   * Checks whether the current display is a high-density (Retina) screen.
   *
   * @returns `true` if `window.devicePixelRatio` is defined and `>= 2`.
   */
  isRetina(): boolean {
    return (window.devicePixelRatio && window.devicePixelRatio >= 2) === true
  }

  /**
   * Checks whether the current device supports touch input.
   *
   * @returns `true` if `window` exposes `ontouchstart` or `navigator.maxTouchPoints` is greater than `0`.
   */
  isTouchDevice(): boolean {
    return (
      'ontouchstart' in window
      || navigator.maxTouchPoints > 0
    )
  }

  /**
   * Checks whether a document is rendered in standards mode (as opposed to quirks mode).
   *
   * @param target - The document to inspect. Defaults to the global `document` when omitted/falsy.
   * @returns `true` if `compatMode` is `'CSS1Compat'`, or a truthy fallback based on `documentElement.clientHeight` when `compatMode` is unavailable.
   */
  isDoctype(target: any): boolean {
    const doc = target || document

    if (doc.compatMode) {
      return doc.compatMode === 'CSS1Compat'
    }

    return doc.documentElement && doc.documentElement.clientHeight
  }

  /**
   * Checks whether `localStorage` is available and writable in the current environment.
   *
   * @returns `true` if a test key can be written to and removed from `localStorage` without throwing.
   */
  isLocalStorageSupported(): boolean {
    try {
      localStorage.setItem('test', 'test')
      localStorage.removeItem('test')
      return true
    } catch {
      return false
    }
  }

  /**
   * Detects the Android OS version from the user agent string.
   *
   * @returns The parsed Android version number, or `0` if it cannot be detected (e.g. not Android).
   */
  detectAndroidVersion(): number {
    const re = /Android (\d[.0-9]*)/

    if (re.exec(navigator.userAgent) != null) {
      const res = navigator.userAgent.match(re)
      if (Type.isArrayLike(res) && res.length > 0) {
        return Number.parseFloat(res[1]!)
      }
    }

    return 0
  }
}

export const Browser = new BrowserManager()
