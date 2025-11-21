import Type from '../type'

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
   * @return FormatterNumbers
   */
  static getInstance(): FormatterNumbers {
    if (!FormatterNumbers.instance) {
      FormatterNumbers.isInternalConstructing = true
      FormatterNumbers.instance = new FormatterNumbers()
    }
    return FormatterNumbers.instance
  }

  setDefLocale(locale: string) {
    this._defLocale = locale
  }

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
