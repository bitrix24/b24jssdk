import { describe, it, expect } from 'vitest'
import { Text } from '../../../packages/jssdk/src/'

// Pure-logic tests for the Text helper — no portal required, runs in the
// `jsSdk:unit` project. See AGENTS.md ("*.unit.spec.ts files inside
// test/integration/").

describe('tools Text.getRandom', () => {
  it('returns a string of the requested length', () => {
    expect(Text.getRandom()).toHaveLength(8)
    expect(Text.getRandom(4)).toHaveLength(4)
    expect(Text.getRandom(16)).toHaveLength(16)
  })

  it('only contains lowercase alphanumeric characters', () => {
    expect(Text.getRandom(64)).toMatch(/^[a-z0-9]+$/)
  })

  it('returns an empty string for length 0', () => {
    expect(Text.getRandom(0)).toBe('')
  })
})

describe('tools Text.getUniqId', () => {
  // Regression lock for the xlsx -> xxxx template fix (#291): the previous
  // template produced a value that failed this UUID v4 pattern 100% of the time.
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  it('matches the UUID v4 pattern', () => {
    expect(Text.getUniqId()).toMatch(uuidV4)
  })

  it('generates unique values', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      ids.add(Text.getUniqId())
    }
    expect(ids.size).toBe(1000)
  })
})

describe('tools Text.encode / decode', () => {
  it('encodes the five unsafe characters without a trailing semicolon', () => {
    expect(Text.encode('<b>Tom & Jerry</b>')).toBe('&ltb&gtTom &amp Jerry&lt/b&gt')
  })

  it('round-trips through decode', () => {
    const source = `<a href='x' title="y">a & b</a>`
    expect(Text.decode(Text.encode(source))).toBe(source)
  })

  it('decodes named and numeric entity tokens (no trailing ";")', () => {
    expect(Text.decode('&amp')).toBe('&')
    expect(Text.decode('&#38')).toBe('&')
    expect(Text.decode('&lt')).toBe('<')
    // The token carries no ';', so a trailing ';' in the input is left in place.
    expect(Text.decode('&amp;')).toBe('&;')
  })

  it('returns non-string input untouched', () => {
    // @ts-expect-error runtime guard for non-string input
    expect(Text.encode(42)).toBe(42)
    // @ts-expect-error runtime guard for non-string input
    expect(Text.decode(null)).toBe(null)
  })
})

describe('tools Text type conversion', () => {
  it('toNumber parses a leading numeric portion, else 0', () => {
    expect(Text.toNumber('12.5')).toBe(12.5)
    expect(Text.toNumber('12px')).toBe(12)
    expect(Text.toNumber('abc')).toBe(0)
    expect(Text.toNumber(null)).toBe(0)
  })

  it('toInteger parses base-10 integers, else 0', () => {
    expect(Text.toInteger('42.9')).toBe(42)
    expect(Text.toInteger('abc')).toBe(0)
  })

  it('toBoolean recognises truthy tokens and custom values', () => {
    for (const truthy of [true, 1, 'true', 'y', '1', 'Y', 'True']) {
      expect(Text.toBoolean(truthy)).toBe(true)
    }
    for (const falsy of ['false', 0, 'no', 'n', null]) {
      expect(Text.toBoolean(falsy)).toBe(false)
    }
    expect(Text.toBoolean('on', ['on'])).toBe(true)
  })
})

describe('tools Text case helpers', () => {
  it('toCamelCase', () => {
    expect(Text.toCamelCase('get_user_id')).toBe('getUserId')
    expect(Text.toCamelCase('Some Value')).toBe('someValue')
    expect(Text.toCamelCase('ABC')).toBe('abc')
    expect(Text.toCamelCase('')).toBe('')
  })

  it('toPascalCase', () => {
    expect(Text.toPascalCase('get_user_id')).toBe('GetUserId')
  })

  it('toKebabCase', () => {
    expect(Text.toKebabCase('getUserId')).toBe('get-user-id')
    expect(Text.toKebabCase('XMLHttpRequest')).toBe('xml-http-request')
    // Documented edge: an uppercase run followed by a digit splits per letter.
    expect(Text.toKebabCase('parseHTML5')).toBe('parse-h-t-m-l-5')
  })

  it('capitalize', () => {
    expect(Text.capitalize('hello')).toBe('Hello')
    expect(Text.capitalize('')).toBe('')
  })
})

describe('tools Text.numberFormat', () => {
  it('formats with grouped thousands and fixed decimals', () => {
    expect(Text.numberFormat(1234.567, 2)).toBe('1,234.57')
    expect(Text.numberFormat(1234.567, 2, ',', ' ')).toBe('1 234,57')
    expect(Text.numberFormat(1, 2)).toBe('1.00')
  })

  it('treats non-finite input as 0', () => {
    expect(Text.numberFormat(Number.NaN, 2)).toBe('0.00')
    expect(Text.numberFormat(Number.POSITIVE_INFINITY)).toBe('0')
  })

  it('keeps the sign and grouping for negative numbers', () => {
    expect(Text.numberFormat(-1234.5, 1)).toBe('-1,234.5')
  })
})

describe('tools Text.buildQueryString', () => {
  it('serialises a plain object', () => {
    expect(Text.buildQueryString({ id: 7 })).toBe('id=7')
  })

  it('expands array values into indexed pairs', () => {
    expect(Text.buildQueryString({ id: 7, tag: ['a', 'b'] }))
      .toBe('id=7&tag%5B0%5D=a&tag%5B1%5D=b')
  })

  it('percent-encodes keys and values', () => {
    expect(Text.buildQueryString({ 'a b': 'c&d' })).toBe('a%20b=c%26d')
  })

  it('returns an empty string for an empty object or nullish input', () => {
    expect(Text.buildQueryString({})).toBe('')
    expect(Text.buildQueryString(null)).toBe('')
    expect(Text.buildQueryString(undefined)).toBe('')
  })
})

describe('tools Text date helpers', () => {
  it('toDateTime parses ISO and templated strings', () => {
    expect(Text.toDateTime('2026-05-04T09:53:51+03:00').isValid).toBe(true)
    expect(Text.toDateTime('04.05.2026', 'dd.MM.yyyy').isValid).toBe(true)
    expect(Text.toDateTime('not-a-date').isValid).toBe(false)
  })

  it('toB24Format passes strings through and formats dates', () => {
    expect(Text.toB24Format('already-formatted')).toBe('already-formatted')
    expect(Text.toB24Format(new Date('2026-05-04T09:53:51Z')))
      .toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
  })

  it('getDateForLog returns a 4-digit-year timestamp', () => {
    expect(Text.getDateForLog()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
})
