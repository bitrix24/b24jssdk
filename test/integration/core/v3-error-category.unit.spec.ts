/**
 * #460 — the soft/hard split for `restApi:v3` decided by the response
 * **category** rather than by an enumerated list of codes.
 *
 * The built-in soft list holds nine v3 codes. A single on-premise build ships
 * at least 39, and every portal module release adds more, so classification by
 * list is per-module-shipping-date rather than per-error-kind:
 * `INVALIDSELECTEXCEPTION` is soft while `INVALIDPAGINATIONEXCEPTION` — the
 * same caller mistake, same request, same HTTP 400, measured seconds apart —
 * throws. Codes are not uniformly prefixed either (`NOTE_SEARCH_QUERY_TOO_SHORT`
 * carries none), so no pattern can stand in for the list.
 *
 * The rule is opt-in for 2.x because it changes *how* an error is delivered: a
 * code that throws today resolves instead, so a `try / catch` stops firing.
 *
 * Portal-free (jsSdk:unit), following the #230 spec next door: `maxRetries: 1`
 * and `_executeSingleCall` stubbed to reject, so `call()`'s classification
 * branch runs for real. The stub rejects *before* `parseErrorPayload` would
 * run, so `isV3Envelope` is set on the error explicitly — which is also what
 * makes the flat-v2 arm meaningful.
 */
import { describe, it, expect, vi } from 'vitest'
import { HttpV2 } from '../../../packages/jssdk/src/core/http/v2'
import { AjaxError } from '../../../packages/jssdk/src/core/http/ajax-error'
import { AjaxResult } from '../../../packages/jssdk/src/core/http/ajax-result'
import type { AuthActions } from '../../../packages/jssdk/src/types/auth'
import type { RestrictionParams } from '../../../packages/jssdk/src/types/limiters'

type ErrorShape = {
  code: string
  status: number
  isV3Envelope?: boolean
}

function httpRejectingWith(error: ErrorShape, params: Partial<RestrictionParams> = {}): HttpV2 {
  const http = new HttpV2({} as unknown as AuthActions, null, { maxRetries: 1, ...params })
  ;(http as any)._executeSingleCall = vi.fn().mockRejectedValue(new AjaxError({
    code: error.code,
    description: `error ${error.code}`,
    status: error.status,
    isV3Envelope: error.isV3Envelope,
    requestInfo: { method: 'main.eventlog.list', params: {}, requestId: 'r-460' },
    originalError: null
  }))
  return http
}

/** Resolves to `'soft'` when the call returned a failed result, `'throw'` when it threw. */
async function deliveryOf(http: HttpV2): Promise<'soft' | 'throw'> {
  try {
    const result = await http.call('main.eventlog.list', {})
    expect(result).toBeInstanceOf(AjaxResult)
    expect(result.isSuccess).toBe(false)
    return 'soft'
  } catch (error) {
    expect(error).toBeInstanceOf(AjaxError)
    return 'throw'
  }
}

const ON: Partial<RestrictionParams> = { classifyV3ErrorsByCategory: true }

describe('#460 v3 errors classified by response category', () => {
  describe('with the rule off — today\'s behaviour, unchanged', () => {
    it('an unlisted v3 4xx still throws', async () => {
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_INVALIDPAGINATIONEXCEPTION',
        status: 400,
        isV3Envelope: true
      })
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('a listed v3 code is still soft', async () => {
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_INVALIDSELECTEXCEPTION',
        status: 400,
        isV3Envelope: true
      })
      await expect(deliveryOf(http)).resolves.toBe('soft')
    })
  })

  describe('with the rule on', () => {
    it('an unlisted v3 4xx becomes soft', async () => {
      // Measured on an on-premise build: `main.eventlog.list` with
      // `pagination: { limit: 0 }`, HTTP 400.
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_INVALIDPAGINATIONEXCEPTION',
        status: 400,
        isV3Envelope: true
      }, ON)
      await expect(deliveryOf(http)).resolves.toBe('soft')
    })

    it('an unprefixed module code is soft too — the prefix is not the rule', async () => {
      // Measured on a cloud sandbox: `note.document.search.list` with a
      // one-character query, HTTP 400. Nine codes on one build carry no prefix,
      // which is why nothing here may match on it.
      const http = httpRejectingWith({
        code: 'NOTE_SEARCH_QUERY_TOO_SHORT',
        status: 400,
        isV3Envelope: true
      }, ON)
      await expect(deliveryOf(http)).resolves.toBe('soft')
    })

    it('403 is soft, alongside the other 4xx', async () => {
      // Decided deliberately rather than left to fall out of a status check: a
      // scope refusal is caller-addressable, and `…ACCESSDENIEDEXCEPTION` — the
      // neighbouring 403 — is already soft by list, so excluding 403 would keep
      // exactly the arbitrariness this rule removes.
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_INSUFFICIENTSCOPEEXCEPTION',
        status: 403,
        isV3Envelope: true
      }, ON)
      await expect(deliveryOf(http)).resolves.toBe('soft')
    })

    it('401 still throws — the auth-refresh path owns it', async () => {
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_SOMEAUTHEXCEPTION',
        status: 401,
        isV3Envelope: true
      }, ON)
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('408 still throws — it is retryable, so it is not classified here', async () => {
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_SOMETIMEOUTEXCEPTION',
        status: 408,
        isV3Envelope: true
      }, ON)
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('429 still throws — likewise retryable', async () => {
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_RATELIMITEXCEPTION',
        status: 429,
        isV3Envelope: true
      }, ON)
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('5xx still throws — not caller-addressable', async () => {
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_INTERNAL_INTERNALEXCEPTION',
        status: 500,
        isV3Envelope: true
      }, ON)
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('a flat v2 body at 400 still throws — the rule is v3-envelope-only', async () => {
      // A gateway in front of the v3 controller is documented to sometimes
      // answer in the flat shape; such a body carries no v3 envelope and is
      // left to the lists. This is why the flag is set from the parsed body
      // rather than from the client's own version.
      const http = httpRejectingWith({
        code: 'SOME_UNLISTED_V2_CODE',
        status: 400,
        isV3Envelope: false
      }, ON)
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('an error with no envelope information at all still throws', async () => {
      // A transport failure never went through the payload parser.
      const http = httpRejectingWith({ code: 'NETWORK_ERROR', status: 0 }, ON)
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('a hardErrorCodes entry at 400 still throws — the override outranks the category', async () => {
      const http = httpRejectingWith({
        code: 'MY_APP_BAD_PAYLOAD',
        status: 400,
        isV3Envelope: true
      }, { ...ON, hardErrorCodes: ['MY_APP_BAD_PAYLOAD'] })
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('a built-in hard code in a v3 envelope at 400 still throws', async () => {
      // The order matters: the hard list is consulted before the category, so
      // the rule can never soften a credential failure.
      const http = httpRejectingWith({
        code: 'expired_token',
        status: 400,
        isV3Envelope: true
      }, ON)
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })
  })
})
