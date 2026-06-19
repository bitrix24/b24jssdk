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
 * `Result` carrying the errors. v3 already guarded this; this locks the
 * matching v2 behaviour and pins v3 against regression.
 */
import { describe, it, expect, vi } from 'vitest'
import { HttpV2 } from '../../../packages/jssdk/src/core/http/v2'
import { HttpV3 } from '../../../packages/jssdk/src/core/http/v3'
import { AjaxResult } from '../../../packages/jssdk/src/core/http/ajax-result'
import type { AuthActions } from '../../../packages/jssdk/src/types/auth'
import type { BatchCommandsArrayUniversal } from '../../../packages/jssdk/src/types/http'

const SOFT_CODE = 'BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUIRED_FIELD'
const SOFT_MESSAGE = 'Required field is missing'

/**
 * The exact shape `_createAjaxResultWithErrorFromResponse` produces for a soft
 * code: an `{ error }` envelope and no `result`. `getData()` returns
 * `undefined` because the result carries an error.
 */
function softErrorBatchResponse(): AjaxResult<any> {
  return new AjaxResult({
    answer: { error: { code: SOFT_CODE, message: SOFT_MESSAGE } },
    query: { method: 'batch', params: {}, requestId: 'r-145' },
    status: 400
  }) as AjaxResult<any>
}

const calls: BatchCommandsArrayUniversal = [
  ['crm.item.add', { entityTypeId: 1, fields: {} }]
]

describe('#145 a soft-error batch returns a Result, not a TypeError', () => {
  it('HttpV2.batch surfaces the envelope errors (was: getData()!.result TypeError)', async () => {
    const http = new HttpV2({} as unknown as AuthActions, null, {})
    // Mock the transport so the batch call resolves to a soft-error AjaxResult.
    ;(http as any).call = vi.fn().mockResolvedValue(softErrorBatchResponse())

    // Before the fix this rejected with `Cannot read properties of undefined`.
    const result = await http.batch(calls)

    expect(result.isSuccess).toBe(false)
    expect(result.getErrorMessages().join(' ')).toContain(SOFT_MESSAGE)
    expect(result.hasError('base-error')).toBe(true)
    expect(result.getData()?.result?.size ?? -1).toBe(0) // empty data map, no throw
  })

  it('HttpV3.batch (already guarded) stays correct on the same response', async () => {
    const http = new HttpV3({} as unknown as AuthActions, null, {})
    ;(http as any).call = vi.fn().mockResolvedValue(softErrorBatchResponse())

    const result = await http.batch(calls)

    expect(result.isSuccess).toBe(false)
    expect(result.getErrorMessages().join(' ')).toContain(SOFT_MESSAGE)
    expect(result.getData()?.result?.size ?? -1).toBe(0)
  })
})
