/**
 * Unit tests for the keyed error accessors added for issue #184:
 * `Result.getErrorsByKey()` / `getErrorMessagesByKey()` must preserve the
 * request-identifier keys (e.g. batch request labels), which the existing
 * `getErrors()` / `getErrorMessages()` discard.
 */
import { describe, it, expect } from 'vitest'
import { Result } from '../../../packages/jssdk/src/core/result'

describe('Result keyed error accessors (issue #184)', () => {
  it('getErrorsByKey() preserves request keys; getErrors() still yields values', () => {
    const result = new Result()
      .addError(new Error('company failed'), 'companyList')
      .addError(new Error('deal failed'), 'dealList')

    const byKey = result.getErrorsByKey()
    expect(Object.keys(byKey).sort()).toEqual(['companyList', 'dealList'])
    expect(byKey.companyList).toBeInstanceOf(Error)
    expect(byKey.companyList?.message).toBe('company failed')
    expect(byKey.dealList?.message).toBe('deal failed')

    // backward-compatible: getErrors() still returns an iterator of Error values
    const values = [...result.getErrors()]
    expect(values.map(e => e.message).sort()).toEqual(['company failed', 'deal failed'])
  })

  it('getErrorMessagesByKey() maps key -> message; getErrorMessages() still returns string[]', () => {
    const result = new Result()
      .addError('boom', 'a')
      .addError('bang', 'b')

    expect(result.getErrorMessagesByKey()).toEqual({ a: 'boom', b: 'bang' })

    // backward-compatible: getErrorMessages() still returns a flat string[]
    expect(result.getErrorMessages().sort()).toEqual(['bang', 'boom'])
  })

  it('returns empty containers when there are no errors', () => {
    const result = Result.ok({ ok: true })
    expect(result.isSuccess).toBe(true)
    expect(result.getErrorsByKey()).toEqual({})
    expect(result.getErrorMessagesByKey()).toEqual({})
  })
})
