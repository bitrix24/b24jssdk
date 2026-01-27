import { DateTime, type DateTimeOptions } from 'luxon'
import uuidv7 from './uuidv7'
import { Type } from './type'

const reEscape = /[&<>'"]/g
const reUnescape = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34)/g

const escapeEntities: Record<string, string> = {
  '&': '&amp',
  '<': '&lt',
  '>': '&gt',
  '\'': '&#39',
  '"': '&quot'
}

const unescapeEntities: Record<string, string> = {
  '&amp': '&',
  '&#38': '&',
  '&lt': '<',
  '&#60': '<',
  '&gt': '>',
  '&#62': '>',
  '&apos': '\'',
  '&#39': '\'',
  '&quot': '"',
  '&#34': '"'
}

/**
 * The `Text` class provides a set of utility methods for working with text data.
 * It includes functions for encoding and decoding HTML entities, generating random strings,
 * converting values to different data types, and changing the case and format of strings
 *
 * @see bitrix/js/main/core/src/lib/text.js
 */
class TextManager {
  getRandom(length = 8): string {
    return [...Array(length)]
      .map(() => Math.trunc(Math.random() * 36).toString(36))
      .join('')
  }

  /**
   * Generates UUID
   */
  getUniqId(): string {
    return 'xxxxxxxx-xlsx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.trunc(Math.random() * 16)
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  /**
   * Generate uuid v7
   * @return {string}
   */
  getUuidRfc4122(): string {
    return uuidv7()
  }

  /**
   * Encodes all unsafe entities
   * @param {string} value
   * @return {string}
   */
  encode(value: string): string {
    if (Type.isString(value)) {
      return value.replace(reEscape, item => escapeEntities[item])
    }

    return value
  }

  /**
   * Decodes all encoded entities
   * @param {string} value
   * @return {string}
   */
  decode(value: string): string {
    if (Type.isString(value)) {
      return value.replace(reUnescape, item => unescapeEntities[item])
    }

    return value
  }

  toNumber(value: any): number {
    const parsedValue = Number.parseFloat(value)

    if (Type.isNumber(parsedValue)) {
      return parsedValue
    }

    return 0.0
  }

  toInteger(value: any): number {
    return this.toNumber(Number.parseInt(value, 10))
  }

  toBoolean(value: any, trueValues: string[] = []): boolean {
    const transformedValue = Type.isString(value) ? value.toLowerCase() : value
    return ['true', 'y', '1', 1, true, ...trueValues].includes(transformedValue)
  }

  toCamelCase(str: string): string {
    if (!Type.isStringFilled(str)) {
      return str
    }

    const regex = /[-_\s]+(.)?/g
    if (!regex.test(str)) {
      return str.match(/^[A-Z]+$/)
        ? str.toLowerCase()
        : str[0].toLowerCase() + str.slice(1)
    }

    str = str.toLowerCase()
    str = str.replace(regex, (_match: string, letter) =>
      letter ? letter.toUpperCase() : ''
    )

    return str[0].toLowerCase() + str.substring(1)
  }

  toPascalCase(str: string): string {
    if (!Type.isStringFilled(str)) {
      return str
    }

    return this.capitalize(this.toCamelCase(str))
  }

  toKebabCase(str: string): string {
    if (!Type.isStringFilled(str)) {
      return str
    }

    const matches = str.match(
      /[A-Z]{2,}(?=[A-Z][a-z]+\d*|\b)|[A-Z]?[a-z]+\d*|[A-Z]|\d+/g
    )
    if (!matches) {
      return str
    }

    return matches.map(x => x.toLowerCase()).join('-')
  }

  capitalize(str: string): string {
    if (!Type.isStringFilled(str)) {
      return str
    }

    return str[0].toUpperCase() + str.substring(1)
  }

  numberFormat(
    number: number,
    decimals: number = 0,
    decPoint: string = '.',
    thousandsSep: string = ','
  ): string {
    const n = !Number.isFinite(number) ? 0 : number

    const fractionDigits = !Number.isFinite(decimals) ? 0 : Math.abs(decimals)

    const toFixedFix = (n: number, fractionDigits: number): number => {
      const k = Math.pow(10, fractionDigits)
      return Math.round(n * k) / k
    }

    const s = (fractionDigits ? toFixedFix(n, fractionDigits) : Math.round(n))
      .toString()
      .split('.')

    if (s[0].length > 3) {
      s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, thousandsSep)
    }

    if ((s[1] || '').length < fractionDigits) {
      s[1] = s[1] || ''
      // eslint-disable-next-line
      s[1] += new Array(fractionDigits - s[1].length + 1).join('0')
    }

    return s.join(decPoint)
  }

  /**
   * Convert string to DateTime from ISO 8601 or self template
   *
   * @param {string} dateString
   * @param {string} template
   * @param opts
   * @returns {DateTime} Convert string to DateTime from ISO 8601 or self template
   *
   * @link https://moment.github.io/luxon/#/parsing?id=parsing-technical-formats
   */
  toDateTime(
    dateString: string,
    template?: string,
    opts?: DateTimeOptions
  ): DateTime {
    if (!(typeof template === 'undefined') && Type.isStringFilled(template)) {
      return DateTime.fromFormat(dateString, template, opts)
    }

    return DateTime.fromISO(dateString, opts)
  }

  /**
   * Convert Date to Bitrix24 REST API FORMAT Y-m-d\TH:i:sP
   * @param date
   */
  toB24Format(
    date: string | DateTime | Date
  ): string {
    if (typeof date === 'string') {
      return date
    } else if (date instanceof Date) {
      return this.toB24Format(DateTime.fromJSDate(date))
    }
    return date.toFormat('yyyy-MM-dd\'T\'HH:mm:ssZZ')
  }

  getDateForLog(): string {
    const now = DateTime.now()
    return now.toFormat('y-MM-dd HH:mm:ss')
  }

  buildQueryString(params: any): string {
    let result = ''
    for (const key in params) {
      if (!Object.prototype.hasOwnProperty.call(params, key)) {
        continue
      }

      const value = params[key]
      if (Type.isArray(value)) {
        value.forEach((valueElement: any, index: any) => {
          result
            += encodeURIComponent(key + '[' + index + ']')
              + '='
              + encodeURIComponent(valueElement)
              + '&'
        })
      } else {
        result
          += encodeURIComponent(key) + '=' + encodeURIComponent(value) + '&'
      }
    }

    if (result.length > 0) {
      result = result.substring(0, result.length - 1)
    }

    return result
  }
}

export const Text = new TextManager()
