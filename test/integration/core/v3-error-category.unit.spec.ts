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
 * The rule was opt-in through the 2.x line, behind `classifyV3ErrorsByCategory`,
 * because it changes *how* an error is delivered: a code that used to throw
 * resolves instead, so a `try / catch` written against the old behaviour stops
 * firing. As of 3.0.0 it is simply the behaviour and the flag is gone (#480),
 * so the cases below configure nothing — they assert the default.
 *
 * The two cases that pinned the flag-off position are gone with it. Neither
 * could survive the removal: one asserted that an unlisted v3 4xx throws, which
 * is now the opposite of the rule, and the other that a **listed** code is soft
 * at 400 — true by list and by category both, so it stopped being able to fail.
 *
 * Portal-free (jsSdk:unit), following the #230 spec next door: `maxRetries: 1`
 * and `_executeSingleCall` stubbed to reject, so `call()`'s classification
 * branch runs for real. The stub rejects *before* `parseErrorPayload` would
 * run, so `isV3Envelope` is set on the error explicitly — which is also what
 * makes the flat-v2 arm meaningful.
 */
import { describe, it, expect, vi } from 'vitest'
import { AxiosError } from 'axios'
import { ApiVersion, B24Hook, ParamsFactory } from '../../../packages/jssdk/src/'
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

/** A v3 error body, as the portal sends it. */
function v3ErrorResponse(code: string, status: number) {
  return {
    status,
    statusText: 'Error',
    headers: {},
    config: {} as never,
    data: { error: { code, message: `error ${code}` } }
  }
}

describe('#460 v3 errors classified by response category', () => {
  describe('the envelope flag reaches the error through the real path', () => {
    // The cases below stub `_executeSingleCall`, so they never run
    // `parseErrorPayload`. These two do: without them, deleting
    // `isV3Envelope: parsed?.isV3Envelope` from `_convertAxiosErrorToAjaxError`
    // leaves the whole suite green, and the wiring the rule depends on holds on
    // nothing.

    it('an axios failure carrying a v3 body produces isV3Envelope === true', async () => {
      // End to end, with nothing configured: the portal answers 400 in the v3
      // envelope, `_convertAxiosErrorToAjaxError` tags the error, and the
      // category rule then delivers it **inside the result** rather than
      // throwing. Before #480 this same call threw and the assertion below read
      // the error off a `.catch()`.
      const b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
        restrictionParams: { ...ParamsFactory.getDefault(), maxRetries: 1, retryDelay: 1 }
      })
      const client = b24.getHttpClient(ApiVersion.v3)
      vi.spyOn(client.ajaxClient, 'post').mockRejectedValue(new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        v3ErrorResponse('BITRIX_REST_V3_EXCEPTION_INVALIDPAGINATIONEXCEPTION', 400)
      ))

      const outcome = await client.call('main.eventlog.list', {}).catch((error: unknown) => error)

      expect(outcome).toBeInstanceOf(AjaxResult)
      expect((outcome as AjaxResult<unknown>).isSuccess).toBe(false)

      const [error] = [...(outcome as AjaxResult<unknown>).getErrors()]
      expect(error).toBeInstanceOf(AjaxError)
      expect((error as AjaxError).isV3Envelope).toBe(true)
      b24.destroy()
    })

    it('an axios failure carrying a flat v2 body produces isV3Envelope === false', async () => {
      const b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
        restrictionParams: { ...ParamsFactory.getDefault(), maxRetries: 1, retryDelay: 1 }
      })
      const client = b24.getHttpClient(ApiVersion.v2)
      vi.spyOn(client.ajaxClient, 'post').mockRejectedValue(new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
          status: 400,
          statusText: 'Error',
          headers: {},
          config: {} as never,
          data: { error: 'SOME_V2_CODE', error_description: 'nope' }
        }
      ))

      const thrown = await client.call('crm.deal.get', {}).catch((error: unknown) => error)

      expect(thrown).toBeInstanceOf(AjaxError)
      expect((thrown as AjaxError).isV3Envelope).toBe(false)
      b24.destroy()
    })

    it('an error read off a 200 body carries the flag too', async () => {
      // `AjaxResult.#processErrors()` is the other construction site, reached
      // when the portal reports an error inside an otherwise successful
      // response rather than through an HTTP failure.
      const result = new AjaxResult({
        answer: { error: { code: 'BITRIX_REST_V3_EXCEPTION_INVALIDFILTEREXCEPTION', message: 'nope' } } as never,
        query: { method: 'main.eventlog.list', params: {}, requestId: 'r-460' },
        status: 400
      })

      expect(result.isSuccess).toBe(false)
      const [error] = [...result.getErrors()]
      expect(error).toBeInstanceOf(AjaxError)
      expect((error as AjaxError).isV3Envelope).toBe(true)
    })
  })

  describe('the category rule — the default since 3.0.0', () => {
    it('an unlisted v3 4xx becomes soft', async () => {
      // Measured on an on-premise build: `main.eventlog.list` with
      // `pagination: { limit: 0 }`, HTTP 400.
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_INVALIDPAGINATIONEXCEPTION',
        status: 400,
        isV3Envelope: true
      })
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
      })
      await expect(deliveryOf(http)).resolves.toBe('soft')
    })

    it('403 is soft, alongside the other 4xx', async () => {
      // Decided deliberately rather than left to fall out of a status check: a
      // permission refusal is caller-addressable, and `…ACCESSDENIEDEXCEPTION` —
      // the neighbouring 403 — is already soft by list, so excluding 403 would
      // keep exactly the arbitrariness this rule removes.
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_SOMEFORBIDDENEXCEPTION',
        status: 403,
        isV3Envelope: true
      })
      await expect(deliveryOf(http)).resolves.toBe('soft')
    })

    it.each([401, 403])('`…ACCESSDENIEDEXCEPTION` is soft at %i — the list decides, not the status', async (status) => {
      // Pinned because the docs got this wrong once: the code was described as
      // classifying by status, "soft at 403, hard at 401". It does not.
      // `isSoftError` consults `exceptionCodeForSoft` at step 2, before any
      // status is looked at, and this code is in the built-in soft list — so
      // both statuses come back soft. The 401 auth-refresh path does not take
      // it either: `_isAuthError` additionally requires the code to be
      // `expired_token` or `invalid_token`.
      //
      // What varies by status is what a *caller* should conclude — 401 is a
      // credential that was not accepted, 403 a method disabled on the portal —
      // and that is a reading instruction, not a delivery mode.
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_ACCESSDENIEDEXCEPTION',
        status,
        isV3Envelope: true
      })
      await expect(deliveryOf(http)).resolves.toBe('soft')
    })

    it('a missing OAuth scope still throws at 403, on v3 as on v2', async () => {
      // `insufficient_scope` is pinned hard for `restApi:v2`. The v3 spelling
      // is a different string and matched nothing, so the category rule would
      // have softened the same condition on one version and not the other.
      // Pinning it keeps the two in step: this is a missing grant, a
      // configuration fault, not a per-record permission check.
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_INSUFFICIENTSCOPEEXCEPTION',
        status: 403,
        isV3Envelope: true
      })
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('401 still throws — the auth-refresh path owns it', async () => {
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_SOMEAUTHEXCEPTION',
        status: 401,
        isV3Envelope: true
      })
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('408 still throws — it is retryable, so it is not classified here', async () => {
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_SOMETIMEOUTEXCEPTION',
        status: 408,
        isV3Envelope: true
      })
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('429 still throws — likewise retryable', async () => {
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_RATELIMITEXCEPTION',
        status: 429,
        isV3Envelope: true
      })
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('5xx still throws — not caller-addressable', async () => {
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_INTERNAL_INTERNALEXCEPTION',
        status: 500,
        isV3Envelope: true
      })
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
      })
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('an error with no envelope information at all still throws', async () => {
      // A transport failure never went through the payload parser.
      const http = httpRejectingWith({ code: 'NETWORK_ERROR', status: 0 })
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('499 is soft — the upper bound of the range is inclusive of 4xx', async () => {
      // 400 alone cannot distinguish `< 500` from `< 499`.
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_SOMECLIENTEXCEPTION',
        status: 499,
        isV3Envelope: true
      })
      await expect(deliveryOf(http)).resolves.toBe('soft')
    })

    it('399 still throws — the lower bound is 400, not "anything below 500"', async () => {
      const http = httpRejectingWith({
        code: 'BITRIX_REST_V3_EXCEPTION_SOMEODDEXCEPTION',
        status: 399,
        isV3Envelope: true
      })
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('a code in BOTH lists throws — the hard list is consulted first', async () => {
      // The ordering claim in the predicate's docstring: without this, swapping
      // the two `if` blocks changes nothing any test can see.
      const http = httpRejectingWith({
        code: 'DUP_CODE',
        status: 400,
        isV3Envelope: true
      }, { hardErrorCodes: ['DUP_CODE'], softErrorCodes: ['DUP_CODE'] })
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('a hardErrorCodes entry at 400 still throws — the override outranks the category', async () => {
      const http = httpRejectingWith({
        code: 'MY_APP_BAD_PAYLOAD',
        status: 400,
        isV3Envelope: true
      }, { hardErrorCodes: ['MY_APP_BAD_PAYLOAD'] })
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })

    it('a built-in hard code in a v3 envelope at 400 still throws', async () => {
      // The order matters: the hard list is consulted before the category, so
      // the rule can never soften a credential failure.
      const http = httpRejectingWith({
        code: 'expired_token',
        status: 400,
        isV3Envelope: true
      })
      await expect(deliveryOf(http)).resolves.toBe('throw')
    })
  })
})
