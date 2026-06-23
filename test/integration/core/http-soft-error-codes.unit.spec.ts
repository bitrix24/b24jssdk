/**
 * #230 (part 1) — every code in `RestrictionManager.BUILT_IN_SOFT_ERROR_CODES`
 * must be classified SOFT end-to-end by `AbstractHttp.call()`: on that code the
 * call RETURNS an `AjaxResult` carrying the error (`isSuccess === false`) instead
 * of throwing. A dropped or mistyped entry would silently turn a soft code into a
 * throw — this pins the whole set. A control code outside the set still throws.
 *
 * Portal-free (jsSdk:unit): `_executeSingleCall` is stubbed to reject, so the
 * real `call()` classification branch (`exceptionCodeForSoft.includes`) is
 * exercised. With `maxRetries: 1` the `attempt + 1 < maxRetries` retry block —
 * including `handleError` — is skipped entirely; the catch goes straight to the
 * soft-result-vs-throw decision.
 */
import { describe, it, expect, vi } from 'vitest'
import { HttpV2 } from '../../../packages/jssdk/src/core/http/v2'
import { AjaxError } from '../../../packages/jssdk/src/core/http/ajax-error'
import { AjaxResult } from '../../../packages/jssdk/src/core/http/ajax-result'
import { RestrictionManager } from '../../../packages/jssdk/src/core/http/limiters/manager'
import type { AuthActions } from '../../../packages/jssdk/src/types/auth'

function httpRejectingWith(code: string): HttpV2 {
  const http = new HttpV2({} as unknown as AuthActions, null, { maxRetries: 1 })
  ;(http as any)._executeSingleCall = vi.fn().mockRejectedValue(new AjaxError({
    code,
    description: `error ${code}`,
    status: 400,
    requestInfo: { method: 'crm.item.list', params: {}, requestId: 'r-230' },
    originalError: null
  }))
  return http
}

describe('#230 BUILT_IN_SOFT_ERROR_CODES are classified soft end-to-end by call()', () => {
  // The `it.each` below iterates the live array, so on its own it can't catch a
  // DROPPED entry (the iterator simply shrinks and stays green). Pin the set
  // explicitly against an inline literal so a deletion OR an unexpected addition
  // turns CI red and forces a conscious update here. (#230 review)
  it('the soft-code set is exactly the pinned list (catches dropped / added entries)', () => {
    expect(new Set(RestrictionManager.BUILT_IN_SOFT_ERROR_CODES)).toEqual(new Set([
      'ERROR_ENTITY_NOT_FOUND',
      'BITRIX_REST_V3_EXCEPTION_ACCESSDENIEDEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_INVALIDJSONEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_INVALIDFILTEREXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_INVALIDSELECTEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_ENTITYNOTFOUNDEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_METHODNOTFOUNDEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_UNKNOWNDTOPROPERTYEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION',
      'BITRIX_REST_V3_EXCEPTION_VALIDATION_DTOVALIDATIONEXCEPTION'
    ]))
  })

  it.each([...RestrictionManager.BUILT_IN_SOFT_ERROR_CODES])(
    'returns a soft AjaxResult (not a throw) for %s',
    async (code) => {
      const res = await httpRejectingWith(code).call('crm.item.list', {})
      expect(res).toBeInstanceOf(AjaxResult)
      expect(res.isSuccess).toBe(false)
      expect(res.getErrorMessages().join(' ')).toContain(code)
    }
  )

  it('a code NOT in the soft set still throws (control)', async () => {
    await expect(
      httpRejectingWith('JSSDK_SOME_HARD_CODE_NOT_SOFT').call('crm.item.list', {})
    ).rejects.toThrow()
  })
})
