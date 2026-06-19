/**
 * Unit test for #145 — a soft-error batch response must not crash
 * `prepareResponse` with a raw `TypeError`. Pure logic, no portal (the
 * transport `call()` is mocked to return a soft-error AjaxResult), so it runs
 * in the jsSdk:unit project.
 *
 * Background: when `call('batch', …)` hits a code in `exceptionCodeForSoft`,
 * `AbstractHttp._createAjaxResultWithErrorFromResponse` returns an `{ error }`
 * envelope with no `result`, so `AjaxResult.getData()` is `undefined`. v2's
 * `AbstractProcessingV2` used to dereference `response.getData()!.result` /
 * `.time` regardless, throwing an unrelated `TypeError` instead of returning a
 * `Result` carrying the errors. v3 already guarded this; this locks the matching
 * v2 behaviour — both the as-array and as-object strategies extend the fixed
 * `AbstractProcessingV2` — and pins v3 against regression. The single
 * end-to-end `batch()` call exercises both crash sites (`prepareItems`
 * `getData()!.result` and `handleResults` `getData()!.time`).
 */
import { describe, it, expect, vi } from 'vitest'
import { HttpV2 } from '../../../packages/jssdk/src/core/http/v2'
import { HttpV3 } from '../../../packages/jssdk/src/core/http/v3'
import { AjaxResult } from '../../../packages/jssdk/src/core/http/ajax-result'
import type { Result } from '../../../packages/jssdk/src/core/result'
import type { AuthActions } from '../../../packages/jssdk/src/types/auth'
import type {
  BatchCommandsArrayUniversal,
  BatchNamedCommandsUniversal,
  ICallBatchResult
} from '../../../packages/jssdk/src/types/http'

// A real built-in soft code (RestrictionManager.BUILT_IN_SOFT_ERROR_CODES). The
// exact value is illustrative: the test mocks `call()`, so the restriction
// manager's classification is bypassed entirely — any `{ error }` envelope makes
// AjaxResult.isSuccess === false. We use a real code so the fixture isn't misleading.
const SOFT_CODE = 'BITRIX_REST_V3_EXCEPTION_VALIDATION_DTOVALIDATIONEXCEPTION'
const SOFT_MESSAGE = 'Required field is missing'

/**
 * The exact shape `_createAjaxResultWithErrorFromResponse` produces for a soft
 * code: an `{ error }` envelope and no `result`. `AjaxResult.getData()` returns
 * `undefined` because the result carries an error.
 */
function softErrorBatchResponse(): AjaxResult<any> {
  return new AjaxResult({
    answer: { error: { code: SOFT_CODE, message: SOFT_MESSAGE } },
    query: { method: 'batch', params: {}, requestId: 'r-145' },
    status: 400
  }) as AjaxResult<any>
}

function expectSoftErrorResult(result: Result<ICallBatchResult<any>>): void {
  expect(result.isSuccess).toBe(false)
  expect(result.getErrorMessages().join(' ')).toContain(SOFT_MESSAGE)
  // 'base-error' is the stable single-error-envelope key set by AjaxResult and
  // propagated by handleResults; pinning it proves the key survives to the caller.
  expect(result.hasError('base-error')).toBe(true)
  expect(result.getData()?.result?.size ?? -1).toBe(0) // empty data map, no throw
}

const arrayCalls: BatchCommandsArrayUniversal = [
  ['crm.item.add', { entityTypeId: 1, fields: {} }]
]
// A non-array object routes HttpV2.batch to ProcessingAsObjectV2 (named mode).
const namedCalls: BatchNamedCommandsUniversal = {
  addCompany: ['crm.item.add', { entityTypeId: 1, fields: {} }]
}

describe('#145 a soft-error batch returns a Result, not a TypeError', () => {
  it('HttpV2.batch array mode surfaces the envelope errors (was: getData()!.result TypeError)', async () => {
    const http = new HttpV2({} as unknown as AuthActions, null, {})
    ;(http as any).call = vi.fn().mockResolvedValue(softErrorBatchResponse())
    expectSoftErrorResult(await http.batch(arrayCalls))
  })

  it('HttpV2.batch object/named mode is fixed too (shared AbstractProcessingV2)', async () => {
    const http = new HttpV2({} as unknown as AuthActions, null, {})
    ;(http as any).call = vi.fn().mockResolvedValue(softErrorBatchResponse())
    expectSoftErrorResult(await http.batch(namedCalls))
  })

  it('HttpV2.batch with isHaltOnError:false (parallel mode) behaves the same', async () => {
    const http = new HttpV2({} as unknown as AuthActions, null, {})
    ;(http as any).call = vi.fn().mockResolvedValue(softErrorBatchResponse())
    expectSoftErrorResult(await http.batch(arrayCalls, { isHaltOnError: false }))
  })

  it('HttpV3.batch (already guarded) stays correct on the same response', async () => {
    const http = new HttpV3({} as unknown as AuthActions, null, {})
    ;(http as any).call = vi.fn().mockResolvedValue(softErrorBatchResponse())
    expectSoftErrorResult(await http.batch(arrayCalls))
  })
})
