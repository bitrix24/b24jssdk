/**
 * Behavioural tests for `skills/b24jssdk-recipes/lib/crypto.ts`.
 *
 * `safeEqual` was extracted from recipes 07 and 12 (#64a), where it guards an
 * `application_token` and an OAuth secret. The hygiene spec proves the recipes
 * import this copy rather than forking it; these prove the copy is correct.
 *
 * The case that matters most is the length mismatch: `node:crypto`'s
 * `timingSafeEqual` *throws* on unequal-length buffers rather than returning
 * false, so a compare that forgot the pre-check would not quietly return the
 * wrong answer — it would blow up inside a webhook handler. Pinning "returns
 * false, does not throw" is pinning the reason the wrapper exists.
 *
 * Pure functions, no portal — jsSdk:unit.
 */
import { describe, it, expect } from 'vitest'
import { safeEqual } from '../../../skills/b24jssdk-recipes/lib/crypto'

describe('safeEqual', () => {
  it('is true for identical strings', () => {
    expect(safeEqual('s3cret-token', 's3cret-token')).toBe(true)
  })

  it('is false for same-length strings that differ', () => {
    expect(safeEqual('s3cret-token', 's3cret-tokeN')).toBe(false)
    // Differing in the first byte must be no different from the last — that is
    // the property the constant-time compare buys.
    expect(safeEqual('abcdef', 'Xbcdef')).toBe(false)
    expect(safeEqual('abcdef', 'abcdeX')).toBe(false)
  })

  it('is false — never throws — when the lengths differ', () => {
    // timingSafeEqual itself throws ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH here.
    // The wrapper exists to turn that into a plain false.
    expect(() => safeEqual('short', 'considerably-longer')).not.toThrow()
    expect(safeEqual('short', 'considerably-longer')).toBe(false)
    expect(safeEqual('considerably-longer', 'short')).toBe(false)
    // A prefix is the shape an attacker probing one byte at a time produces.
    expect(safeEqual('s3cret', 's3cret-token')).toBe(false)
  })

  it('is true for two empty strings', () => {
    expect(safeEqual('', '')).toBe(true)
  })

  it('is false when only one side is empty', () => {
    expect(safeEqual('', 'token')).toBe(false)
    expect(safeEqual('token', '')).toBe(false)
  })

  it('compares by UTF-8 bytes, so multibyte characters are handled', () => {
    expect(safeEqual('ключ', 'ключ')).toBe(true)
    expect(safeEqual('ключ', 'клюя')).toBe(false)
    // 'é' is two UTF-8 bytes and 'e' is one: a length mismatch in bytes even
    // though both strings are one character. Must still be false, not a throw.
    expect(safeEqual('é', 'e')).toBe(false)
  })
})
