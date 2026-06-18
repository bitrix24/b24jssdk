/**
 * Unit tests for the HTTP-layer correctness fixes (#143, #144). Pure logic — no
 * portal — so they run in the jsSdk:unit project. HttpV2 is constructed with a
 * stub AuthActions; no real request is made (the transport-touching methods are
 * overridden), so this stays portal-free.
 */
import { describe, it, expect, vi } from 'vitest'
import { HttpV2 } from '../../../packages/jssdk/src/core/http/v2'
import { AjaxError } from '../../../packages/jssdk/src/core/http/ajax-error'
import type { AuthActions } from '../../../packages/jssdk/src/types/auth'

function makeHttp(restrictionParams: Record<string, unknown> = {}): HttpV2 {
  return new HttpV2({} as unknown as AuthActions, null, restrictionParams)
}

describe('HTTP layer fixes (#143, #144)', () => {
  it('#144: getStats() reports totalRequests (not totalDuration), and reset() clears it', async () => {
    const http = makeHttp()
    const metrics = (http as any)._metrics
    metrics.totalRequests = 7
    metrics.totalDuration = 12_345
    metrics.successfulRequests = 5
    metrics.failedRequests = 2

    const stats = http.getStats()
    expect(stats.totalRequests).toBe(7) // was wired to totalDuration before the fix
    expect(stats.totalDuration).toBe(12_345)

    await http.reset()
    expect((http as any)._metrics.totalRequests).toBe(0) // reset used to skip this field
    expect((http as any)._metrics.totalDuration).toBe(0)
  })

  it('#144: the SDK User-Agent and a caller-supplied header both survive construction', () => {
    const http = new HttpV2(
      {} as unknown as AuthActions,
      { headers: { 'X-Test-Header': 'kept' } }
    )
    const headers = JSON.stringify((http as any)._clientAxios.defaults.headers)
    // Before the fix, the `headers: undefined` spread wiped both.
    expect(headers).toContain('X-Test-Header')
    expect(headers).toContain('User-Agent')
  })

  it('#143: the final retryable attempt throws the real error code, not the generic exhausted one', async () => {
    const http = makeHttp({ maxRetries: 2 })
    const realError = new AjaxError({
      code: 'TEST_HARD_ERROR', // not in BUILT_IN_SOFT_ERROR_CODES → takes the throw path
      description: 'still failing on the last attempt',
      status: 503,
      requestInfo: { method: 'x', params: {}, requestId: 'r' },
      originalError: null
    })

    ;(http as any)._executeSingleCall = vi.fn().mockRejectedValue(realError)
    const rm = (http as any)._restrictionManager
    rm.applyOperatingLimits = vi.fn().mockResolvedValue(undefined)
    rm.handleError = vi.fn().mockResolvedValue(5) // waitTime > 0 — the old code would sleep then throw the generic code
    rm.waiteDelay = vi.fn().mockResolvedValue(undefined)

    await expect(http.call('x', {})).rejects.toMatchObject({ code: 'TEST_HARD_ERROR' })
    // The last attempt must NOT enter the retry branch.
    expect(rm.handleError).toHaveBeenCalledTimes(1)
    expect(rm.waiteDelay).toHaveBeenCalledTimes(1)
  })
})
