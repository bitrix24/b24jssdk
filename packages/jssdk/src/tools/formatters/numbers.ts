import { Type } from '../type'

/**
 * Locale-aware number formatter built on `Intl.NumberFormat`.
 *
 * A singleton — obtain it through `useFormatter()` rather than constructing
 * it directly (the constructor is guarded and throws `TypeError`). Integers
 * are formatted with no fraction digits and non-integers with exactly two.
 */
export default class FormatterNumbers {
  private static isInternalConstructing: boolean = false
  private static instance: FormatterNumbers | null = null
  private _defLocale: null | string = null
  private constructor() {
    if (!FormatterNumbers.isInternalConstructing) {
      throw new TypeError('FormatterNumber is not constructable')
    }
    FormatterNumbers.isInternalConstructing = false
  }

  /**
   * Returns the shared `FormatterNumbers` singleton, creating it on first use.
   *
   * @returns The shared instance.
   */
  static getInstance(): FormatterNumbers {
    if (!FormatterNumbers.instance) {
      FormatterNumbers.isInternalConstructing = true
      FormatterNumbers.instance = new FormatterNumbers()
    }
    return FormatterNumbers.instance
  }

  /**
   * Sets the default locale used by {@link format} when no explicit locale is
   * passed. Affects every consumer of the shared instance.
   *
   * @param locale - A BCP 47 locale tag (e.g. `'de'`, `'ru'`).
   */
  setDefLocale(locale: string) {
    this._defLocale = locale
  }

  /**
   * Formats a number for the given (or default) locale.
   *
   * The locale falls back to the value set via {@link setDefLocale}, then to
   * `navigator.language`, then to `'en'`. Integers get no fraction digits and
   * non-integers exactly two. For `ru`-based locales the decimal comma is
   * normalised to a dot.
   *
   * @param value - The number to format.
   * @param locale - Optional BCP 47 locale tag overriding the default.
   * @returns The formatted number.
   *
   * @example
   * ```ts
   * formatterNumber.format(1234.5)        // '1,234.50'
   * formatterNumber.format(1234.5, 'de')  // '1.234,50'
   * ```
   */
  format(value: number, locale?: string): string {
    let formatter
    if (typeof locale === 'undefined' || !Type.isStringFilled(locale)) {
      locale = Type.isStringFilled(this._defLocale)
        ? this._defLocale || 'en'
        : (
            typeof navigator === 'undefined'
              ? 'en'
              : navigator?.language || 'en'
          )
    }

    if (Number.isInteger(value)) {
      formatter = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })
    } else {
      formatter = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    }

    let result = formatter.format(value)
    if (locale.includes('ru')) {
      result = result.replace(',', '.')
    }

    return result
  }
}
