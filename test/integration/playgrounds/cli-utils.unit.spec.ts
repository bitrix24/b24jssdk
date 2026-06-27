/**
 * Unit tests for the pure `playgrounds/cli` utilities (#47 item 16a — give the
 * "unit tests, no portal" CI gate something to run for the playground). Pure
 * logic, no portal and no SDK build needed (these utils import nothing from
 * `@bitrix24/b24jssdk`), so this is picked up by the existing jsSdk:unit
 * "unit.spec" glob under test/integration and runs in the CI `test` job.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { icon } from '../../../playgrounds/cli/src/utils/tty'
import { randomInt, pickRandom } from '../../../playgrounds/cli/src/utils/random'
import { generatePhoneNumber } from '../../../playgrounds/cli/src/utils/phone'
import { COUNTRY_CODES } from '../../../playgrounds/cli/src/constants'

describe('playgrounds/cli utils', () => {
  describe('icon() — TTY-gated emoji (#47 item 15)', () => {
    const originalIsTTY = process.stdout.isTTY
    afterEach(() => {
      process.stdout.isTTY = originalIsTTY
    })

    it('returns the emoji string when stdout is a TTY', () => {
      process.stdout.isTTY = true
      expect(icon('🚀 ')).toBe('🚀 ')
    })

    it('collapses to an empty string when stdout is not a TTY (CI / piped output)', () => {
      process.stdout.isTTY = false
      expect(icon('🚀 ')).toBe('')
    })
  })

  describe('randomInt()', () => {
    it('stays within [min, max] inclusive across many draws', () => {
      for (let i = 0; i < 1000; i++) {
        const n = randomInt(3, 7)
        expect(n).toBeGreaterThanOrEqual(3)
        expect(n).toBeLessThanOrEqual(7)
        expect(Number.isInteger(n)).toBe(true)
      }
    })

    it('returns the single value when min === max', () => {
      expect(randomInt(5, 5)).toBe(5)
    })
  })

  describe('pickRandom()', () => {
    it('returns an element of the source array', () => {
      const arr = ['a', 'b', 'c'] as const
      for (let i = 0; i < 100; i++) {
        expect(arr).toContain(pickRandom(arr))
      }
    })

    it('throws on an empty array instead of returning undefined', () => {
      expect(() => pickRandom([])).toThrow()
    })
  })

  describe('generatePhoneNumber()', () => {
    it('prefixes the country code and appends 10 digits', () => {
      const phone = generatePhoneNumber('russian')
      expect(phone.startsWith(COUNTRY_CODES.russian)).toBe(true)
      expect(phone.slice(COUNTRY_CODES.russian.length)).toMatch(/^\d{10}$/)
    })
  })
})
