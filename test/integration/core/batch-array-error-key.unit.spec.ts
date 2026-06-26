/**
 * Unit test for #255 — an array-mode v2 batch must key each per-command error
 * by its numeric position (so `getErrorsByKey()` / `getErrorMessagesByKey()`
 * tell the caller *which* command failed), instead of the previous random UUID.
 *
 * Pure logic, no portal: the transport `call()` is mocked to return a successful
 * batch envelope whose `result_error` carries a failure for command index `1`.
 * (v3 batch is all-or-nothing — per-command errors surface as a single envelope
 * soft error, not per index — so the meaningful change is on the v2 path.)
 */
import { describe, it, expect, vi } from 'vitest'
import { HttpV2 } from '../../../packages/jssdk/src/core/http/v2'
import { AjaxResult } from '../../../packages/jssdk/src/core/http/ajax-result'
import type { AuthActions } from '../../../packages/jssdk/src/types/auth'
import type { BatchCommandsArrayUniversal } from '../../../packages/jssdk/src/types/http'

const TIME = {
  start: 0, finish: 1, duration: 1, processing: 0,
  date_start: '', date_finish: ''
}

/**
 * A successful v2 batch envelope: command 0 succeeds, command 1 fails. The v2
 * format splits per-command outcomes into `result` / `result_error` maps keyed
 * by the command's position.
 */
function arrayBatchWithErrorAtIndex1(): AjaxResult<any> {
  return new AjaxResult({
    answer: {
      result: {
        result: { 0: { item: { id: 10 } } },
        result_error: { 1: { error: 'INVALID_ARG', error_description: 'bad fields' } },
        result_time: { 0: TIME, 1: TIME },
        result_total: {},
        result_next: {}
      },
      time: TIME
    },
    query: { method: 'batch', params: {}, requestId: 'r-255' },
    status: 200
  }) as AjaxResult<any>
}

const twoCalls: BatchCommandsArrayUniversal = [
  ['crm.item.add', { entityTypeId: 1, fields: { ok: true } }],
  ['crm.item.add', { entityTypeId: 1, fields: {} }]
]

describe('#255 array-mode v2 batch keys per-command errors by index', () => {
  it('getErrorsByKey() exposes the failing command under its numeric position', async () => {
    const http = new HttpV2({} as unknown as AuthActions, null, {})
    ;(http as any).call = vi.fn().mockResolvedValue(arrayBatchWithErrorAtIndex1())

    const result = await http.batch(twoCalls, { isHaltOnError: false })

    expect(result.isSuccess).toBe(false)

    const byKey = result.getErrorsByKey()
    // The single per-command error lands under the position '1', not a UUID.
    expect(Object.keys(byKey)).toEqual(['1'])
    expect(byKey['1']?.message).toMatch(/bad fields|INVALID_ARG/)

    const byMessage = result.getErrorMessagesByKey()
    expect(Object.keys(byMessage)).toEqual(['1'])
  })

  it('the error key is a stable numeric position, not a generated UUID', async () => {
    const http = new HttpV2({} as unknown as AuthActions, null, {})
    ;(http as any).call = vi.fn().mockResolvedValue(arrayBatchWithErrorAtIndex1())

    const key = Object.keys((await http.batch(twoCalls, { isHaltOnError: false })).getErrorsByKey())[0]
    // a UUID would be 36 chars with dashes; the position is a short digit string
    expect(key).toBe('1')
    expect(key).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
  })

  it('keys a failure at position 0 under "0" (a falsy index must not be dropped)', async () => {
    const response = new AjaxResult({
      answer: {
        result: {
          result: { 1: { item: { id: 20 } } },
          result_error: { 0: { error: 'BAD', error_description: 'first failed' } },
          result_time: { 0: TIME, 1: TIME },
          result_total: {},
          result_next: {}
        },
        time: TIME
      },
      query: { method: 'batch', params: {}, requestId: 'r-255b' },
      status: 200
    }) as AjaxResult<any>

    const http = new HttpV2({} as unknown as AuthActions, null, {})
    ;(http as any).call = vi.fn().mockResolvedValue(response)

    const byKey = (await http.batch(twoCalls, { isHaltOnError: false })).getErrorsByKey()
    expect(Object.keys(byKey)).toEqual(['0'])
    expect(byKey['0']?.message).toMatch(/first failed|BAD/)
  })

  it('keys each failure independently when multiple commands fail', async () => {
    const threeCalls: BatchCommandsArrayUniversal = [
      ['crm.item.add', { entityTypeId: 1, fields: {} }],
      ['crm.item.add', { entityTypeId: 1, fields: { ok: true } }],
      ['crm.item.add', { entityTypeId: 1, fields: {} }]
    ]
    const response = new AjaxResult({
      answer: {
        result: {
          result: { 1: { item: { id: 30 } } },
          result_error: {
            0: { error: 'E0', error_description: 'cmd 0 failed' },
            2: { error: 'E2', error_description: 'cmd 2 failed' }
          },
          result_time: { 0: TIME, 1: TIME, 2: TIME },
          result_total: {},
          result_next: {}
        },
        time: TIME
      },
      query: { method: 'batch', params: {}, requestId: 'r-255c' },
      status: 200
    }) as AjaxResult<any>

    const http = new HttpV2({} as unknown as AuthActions, null, {})
    ;(http as any).call = vi.fn().mockResolvedValue(response)

    const byKey = (await http.batch(threeCalls, { isHaltOnError: false })).getErrorsByKey()
    expect(Object.keys(byKey).sort()).toEqual(['0', '2'])
    expect(byKey['0']?.message).toMatch(/cmd 0 failed|E0/)
    expect(byKey['2']?.message).toMatch(/cmd 2 failed|E2/)
  })
})
