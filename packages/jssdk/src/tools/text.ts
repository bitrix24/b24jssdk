import type { DateTimeOptions } from 'luxon'
import { DateTime } from 'luxon'
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
 * A collection of text and date utilities used across the SDK.
 *
 * It groups together helpers for:
 * - generating identifiers (random strings, UUID v4 and UUID v7),
 * - encoding and decoding HTML entities,
 * - converting arbitrary values to numbers, integers, and booleans,
 * - changing the case and format of strings (camelCase, PascalCase, kebab-case),
 * - formatting numbers and dates,
 * - building `application/x-www-form-urlencoded` query strings.
 *
 * The class is exported as the `Text` singleton — you never instantiate it yourself.
 *
 * @example
 * ```ts
 * import { Text } from '@bitrix24/b24jssdk'
 *
 * Text.getUuidRfc4122()          // '019323ac-8ace-725b-a3dc-6a7c333da066'
 * Text.getDateForLog()           // '2026-05-04 09:53:51'
 * Text.numberFormat(1234.567, 2) // '1,234.57'
 * ```
 *
 * @see bitrix/js/main/core/src/lib/text.js
 */
class TextManager {
  /**
   * Generates a random `[a-z0-9]` string of the requested length.
   *
   * Each character is drawn from `Math.random()`, so the result is **not**
   * cryptographically secure — use it for cache-busting keys and disposable
   * ids, not for tokens or secrets.
   *
   * @param length - Number of characters to generate. Defaults to `8`.
   * @returns A random lowercase alphanumeric string.
   *
   * @example
   * ```ts
   * Text.getRandom()   // 'a7f3k1z9'
   * Text.getRandom(4)  // 'p2x8'
   * ```
   */
  getRandom(length: number = 8): string {
    return Array.from({ length })
      .map(() => Math.trunc(Math.random() * 36).toString(36))
      .join('')
  }

  /**
   * Generates a locally-computed UUID v4 (random) string.
   *
   * The value is built from `Math.random()` and is **not**
   * cryptographically secure. For a time-ordered, RFC 4122 identifier prefer
   * {@link getUuidRfc4122}.
   *
   * @returns A UUID v4 formatted string (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`).
   *
   * @example
   * ```ts
   * Text.getUniqId() // 'd2b8a1f0-3c4e-4a9b-8f7c-1e2d3a4b5c6d'
   * ```
   */
  getUniqId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.trunc(Math.random() * 16)
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  /**
   * Generates a time-ordered UUID v7 (RFC 4122).
   *
   * This is the identifier the SDK uses as the default request id, because its
   * leading timestamp keeps generated ids sortable by creation time.
   *
   * @returns A UUID v7 formatted string.
   *
   * @example
   * ```ts
   * Text.getUuidRfc4122() // '019323ac-8ace-725b-a3dc-6a7c333da066'
   * ```
   */
  getUuidRfc4122(): string {
    return uuidv7()
  }

  /**
   * Encodes the unsafe HTML characters `&`, `<`, `>`, `'`, and `"` into their
   * entity codes.
   *
   * To match the legacy Bitrix Framework behaviour the trailing `;` is
   * deliberately omitted (`&amp` instead of `&amp;`). Non-string values are
   * returned untouched.
   *
   * This is **not** a general-purpose HTML sanitizer: it only escapes those
   * five characters and is not context-aware (it does not neutralise
   * attribute-breakout, `javascript:` URLs, or markup outside the escaped set).
   * Do not rely on it as the sole XSS defence for untrusted input rendered as
   * HTML.
   *
   * @param value - The string to encode.
   * @returns The encoded string, or the original value when it is not a string.
   *
   * @example
   * ```ts
   * Text.encode('<b>Tom & Jerry</b>') // '&ltb&gtTom &amp Jerry&lt/b&gt'
   * ```
   */
  encode(value: string): string {
    if (Type.isString(value)) {
      return value.replace(reEscape, item => escapeEntities[item]!)
    }

    return value
  }

  /**
   * Decodes HTML entities produced by {@link encode} back into their
   * characters.
   *
   * Both the named entities (`&amp`, `&lt`, …) and their numeric equivalents
   * (`&#38`, `&#60`, …) are recognised. Like {@link encode}, the tokens carry
   * no trailing `;`, so a `;` that follows an entity in the input is left in
   * place (`&amp;` decodes to `&;`). Non-string values are returned untouched.
   *
   * @param value - The string to decode.
   * @returns The decoded string, or the original value when it is not a string.
   *
   * @example
   * ```ts
   * Text.decode('&ltb&gtTom &amp Jerry&lt/b&gt') // '<b>Tom & Jerry</b>'
   * ```
   */
  decode(value: string): string {
    if (Type.isString(value)) {
      return value.replace(reUnescape, item => unescapeEntities[item]!)
    }

    return value
  }

  /**
   * Parses a value into a floating-point number.
   *
   * Uses `Number.parseFloat`, so a leading numeric portion is accepted
   * (`'12px'` → `12`). Any value that cannot be parsed becomes `0`.
   *
   * @param value - The value to convert.
   * @returns The parsed number, or `0` when parsing fails.
   *
   * @example
   * ```ts
   * Text.toNumber('12.5') // 12.5
   * Text.toNumber('abc')  // 0
   * ```
   */
  toNumber(value: any): number {
    const parsedValue = Number.parseFloat(value)

    if (Type.isNumber(parsedValue)) {
      return parsedValue
    }

    return 0.0
  }

  /**
   * Parses a value into an integer (base 10).
   *
   * Any value that cannot be parsed becomes `0`.
   *
   * @param value - The value to convert.
   * @returns The parsed integer, or `0` when parsing fails.
   *
   * @example
   * ```ts
   * Text.toInteger('42.9') // 42
   * Text.toInteger('abc')  // 0
   * ```
   */
  toInteger(value: any): number {
    return this.toNumber(Number.parseInt(value, 10))
  }

  /**
   * Interprets a value as a boolean.
   *
   * `true` is returned for `true`, `1`, `'true'`, `'y'`, and `'1'`
   * (string comparison is case-insensitive). Extra truthy tokens can be added
   * through `trueValues`; everything else yields `false`.
   *
   * @param value - The value to interpret.
   * @param trueValues - Additional values that should be treated as `true`.
   * @returns `true` when the value matches a truthy token, otherwise `false`.
   *
   * @example
   * ```ts
   * Text.toBoolean('Y')             // true
   * Text.toBoolean('on', ['on'])    // true
   * Text.toBoolean('no')            // false
   * ```
   */
  toBoolean(value: any, trueValues: string[] = []): boolean {
    const transformedValue = Type.isString(value) ? value.toLowerCase() : value
    return ['true', 'y', '1', 1, true, ...trueValues].includes(transformedValue)
  }

  /**
   * Converts a string to `camelCase`.
   *
   * Hyphens, underscores, and whitespace are treated as word separators. A
   * fully uppercase string is lowercased (`'ABC'` → `'abc'`); an empty or
   * non-filled string is returned untouched.
   *
   * @param str - The string to convert.
   * @returns The `camelCase` string.
   *
   * @example
   * ```ts
   * Text.toCamelCase('get_user_id') // 'getUserId'
   * Text.toCamelCase('Some Value')  // 'someValue'
   * ```
   */
  toCamelCase(str: string): string {
    if (!Type.isStringFilled(str)) {
      return str
    }

    const separators = /[-_\s]+(.)?/g
    if (!separators.test(str)) {
      return /^[A-Z]+$/.test(str)
        ? str.toLowerCase()
        : str[0]!.toLowerCase() + str.slice(1)
    }

    const camel = str
      .toLowerCase()
      .replace(separators, (_match, letter) =>
        letter ? letter.toUpperCase() : ''
      )

    return camel[0]!.toLowerCase() + camel.slice(1)
  }

  /**
   * Converts a string to `PascalCase`.
   *
   * Equivalent to `capitalize(toCamelCase(str))`. An empty or non-filled string
   * is returned untouched.
   *
   * @param str - The string to convert.
   * @returns The `PascalCase` string.
   *
   * @example
   * ```ts
   * Text.toPascalCase('get_user_id') // 'GetUserId'
   * ```
   */
  toPascalCase(str: string): string {
    if (!Type.isStringFilled(str)) {
      return str
    }

    return this.capitalize(this.toCamelCase(str))
  }

  /**
   * Converts a string to `kebab-case`.
   *
   * Splits on uppercase-letter boundaries as well as existing separators, so
   * both `camelCase` and mixed-case acronyms are handled. An uppercase run that
   * is immediately followed by a digit is split into single letters
   * (`parseHTML5` → `parse-h-t-m-l-5`), because there is no word boundary
   * between the acronym and the digit. An empty or non-filled string is
   * returned untouched.
   *
   * @param str - The string to convert.
   * @returns The `kebab-case` string.
   *
   * @example
   * ```ts
   * Text.toKebabCase('getUserId')      // 'get-user-id'
   * Text.toKebabCase('XMLHttpRequest') // 'xml-http-request'
   * ```
   */
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

    return matches.map(word => word.toLowerCase()).join('-')
  }

  /**
   * Uppercases the first character of a string, leaving the rest untouched.
   *
   * An empty or non-filled string is returned untouched.
   *
   * @param str - The string to capitalize.
   * @returns The capitalized string.
   *
   * @example
   * ```ts
   * Text.capitalize('hello') // 'Hello'
   * ```
   */
  capitalize(str: string): string {
    if (!Type.isStringFilled(str)) {
      return str
    }

    return str[0]!.toUpperCase() + str.slice(1)
  }

  /**
   * Formats a number with grouped thousands and a fixed number of decimals.
   *
   * Mirrors the algorithm Bitrix24 uses on the server: non-finite inputs are
   * treated as `0`, the fractional part is rounded to `decimals` places, and
   * the thousands separator is inserted every three digits left of the decimal
   * point.
   *
   * @param number - The number to format.
   * @param decimals - Number of digits after the decimal point. Defaults to `0`.
   * @param decPoint - The decimal-point character. Defaults to `'.'`.
   * @param thousandsSep - The thousands separator. Defaults to `','`.
   * @returns The formatted number as a string.
   *
   * @example
   * ```ts
   * Text.numberFormat(1234.567, 2)              // '1,234.57'
   * Text.numberFormat(1234.567, 2, ',', ' ')    // '1 234,57'
   * ```
   */
  numberFormat(
    number: number,
    decimals: number = 0,
    decPoint: string = '.',
    thousandsSep: string = ','
  ): string {
    const value = Number.isFinite(number) ? number : 0
    const fractionDigits = Number.isFinite(decimals) ? Math.abs(decimals) : 0

    const roundTo = (n: number, digits: number): number => {
      const factor = 10 ** digits
      return Math.round(n * factor) / factor
    }

    const parts = (fractionDigits ? roundTo(value, fractionDigits) : Math.round(value))
      .toString()
      .split('.')

    if (parts[0] && parts[0].length > 3) {
      parts[0] = parts[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, thousandsSep)
    }

    if ((parts[1] || '').length < fractionDigits) {
      parts[1] = (parts[1] || '').padEnd(fractionDigits, '0')
    }

    return parts.join(decPoint)
  }

  /**
   * Converts a string into a Luxon `DateTime`.
   *
   * When `template` is provided the string is parsed with
   * `DateTime.fromFormat`; otherwise it is parsed as ISO 8601 via
   * `DateTime.fromISO`.
   *
   * @param dateString - The date string to parse.
   * @param template - Optional Luxon format token describing `dateString`.
   * @param opts - Optional Luxon parsing options (zone, locale, …).
   * @returns The parsed `DateTime` (use `.isValid` to check the result).
   *
   * @see https://moment.github.io/luxon/#/parsing?id=parsing-technical-formats
   *
   * @example
   * ```ts
   * Text.toDateTime('2026-05-04T09:53:51+03:00')
   * Text.toDateTime('04.05.2026', 'dd.MM.yyyy')
   * ```
   */
  toDateTime(
    dateString: string,
    template?: string,
    opts?: DateTimeOptions
  ): DateTime {
    if (Type.isStringFilled(template)) {
      return DateTime.fromFormat(dateString, template, opts)
    }

    return DateTime.fromISO(dateString, opts)
  }

  /**
   * Formats a date into the string Bitrix24 expects in REST payloads
   * (`yyyy-MM-dd'T'HH:mm:ssZZ`, i.e. PHP's `Y-m-d\TH:i:sP`).
   *
   * A string input is passed through unchanged (assumed already formatted); a
   * JS `Date` is converted through Luxon first.
   *
   * @param date - The value to format: an already-formatted string, a JS `Date`,
   *   or a Luxon `DateTime`.
   * @returns The Bitrix24-formatted date string.
   *
   * @example
   * ```ts
   * Text.toB24Format(new Date()) // '2026-05-04T09:53:51+03:00'
   * ```
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

  /**
   * Returns the current local timestamp formatted for log lines
   * (`yyyy-MM-dd HH:mm:ss`).
   *
   * @returns The formatted current timestamp.
   *
   * @example
   * ```ts
   * Text.getDateForLog() // '2026-05-04 09:53:51'
   * ```
   */
  getDateForLog(): string {
    return DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')
  }

  /**
   * Serialises a plain object into an `application/x-www-form-urlencoded`
   * query string.
   *
   * Keys and values are percent-encoded. Array values are expanded into
   * indexed pairs (`key[0]=a&key[1]=b`). The leading `?` is **not** included.
   *
   * @param params - The object to serialise. A `null` / `undefined` value
   *   yields an empty string.
   * @returns The encoded query string (without a leading `?`).
   *
   * @example
   * ```ts
   * Text.buildQueryString({ id: 7, tag: ['a', 'b'] })
   * // 'id=7&tag%5B0%5D=a&tag%5B1%5D=b'
   * ```
   */
  buildQueryString(params: any): string {
    if (Type.isNil(params)) {
      return ''
    }

    const pairs: string[] = []

    for (const [key, value] of Object.entries(params)) {
      if (Type.isArray(value)) {
        value.forEach((valueElement: any, index: number) => {
          pairs.push(
            `${encodeURIComponent(`${key}[${index}]`)}=${encodeURIComponent(valueElement)}`
          )
        })
      } else {
        pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value as any)}`)
      }
    }

    return pairs.join('&')
  }
}

export const Text = new TextManager()
