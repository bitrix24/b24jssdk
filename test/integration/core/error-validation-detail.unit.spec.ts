/**
 * `restApi:v3` validation errors carry a `validation` array naming the field
 * that failed. The SDK used to drop it — not "collect it but not expose it":
 * `validation[].field` was never read, in either of the two copies of the
 * parser, and the array itself was discarded when the soft-error path rebuilt
 * the result (#423).
 *
 * For a caller building a form that is the difference between marking the
 * offending input and showing a banner saying something is wrong somewhere.
 *
 * These tests pin the whole path, because the loss happened in three places and
 * fixing any one of them alone would still leave the field unreachable:
 *
 *   1. the parser reads `field`;
 *   2. `AjaxError` carries it;
 *   3. the soft-error rebuild — which throws the portal's body away and
 *      constructs a new result — carries it too.
 */
import { describe, it, expect, vi } from 'vitest'
import { HttpV3 } from '../../../packages/jssdk/src/core/http/v3'
import { AjaxResult } from '../../../packages/jssdk/src/core/http/ajax-result'
import { AjaxError } from '../../../packages/jssdk/src/core/http/ajax-error'
import { parseErrorPayload } from '../../../packages/jssdk/src/core/http/parse-error-payload'
import type { AuthActions } from '../../../packages/jssdk/src/types/auth'

const QUERY = { method: 'crm.item.list', params: {}, requestId: 'unit/validation-detail' }

/** The body a portal actually returns; the shape reported in #423. */
const V3_VALIDATION_BODY = {
  error: {
    code: 'BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION',
    message: 'Error validating request object.',
    validation: [{ field: 'filter', message: 'Field value must not be empty.' }]
  }
}

function resultFrom(body: object, status = 400) {
  return new AjaxResult({ answer: body as never, query: QUERY, status })
}

function firstError(result: AjaxResult<unknown>): AjaxError {
  const error = [...result.getErrors()][0]
  expect(error).toBeInstanceOf(AjaxError)
  return error as AjaxError
}

describe('parseErrorPayload', () => {
  it('keeps the validation array verbatim, field included', () => {
    const parsed = parseErrorPayload(V3_VALIDATION_BODY, 'FALLBACK', 'fallback')
    expect(parsed?.validation).toEqual([{ field: 'filter', message: 'Field value must not be empty.' }])
  })

  it('separates the messages it folds into the description', () => {
    // Two rows used to be concatenated with nothing between them —
    // "…must not be empty.Field b is invalid." — with no way to see the join.
    const parsed = parseErrorPayload({
      error: {
        code: 'X',
        message: 'Error validating request object.',
        validation: [
          { field: 'filter', message: 'Field value must not be empty.' },
          { field: 'select', message: 'Field b is invalid.' }
        ]
      }
    }, 'FALLBACK', 'fallback')
    expect(parsed?.description).toBe(
      'Error validating request object. Field value must not be empty. Field b is invalid.'
    )
  })

  it('reads the two-row body a portal actually sends', () => {
    // Captured live from `note.document.add` with an empty `fields` (#423). A
    // second validation code — `DTOVALIDATIONEXCEPTION`, not
    // `REQUESTVALIDATIONEXCEPTION` — and two rows whose messages end in a quote
    // rather than a period, which is what the separator has to survive.
    const parsed = parseErrorPayload({
      error: {
        code: 'BITRIX_REST_V3_EXCEPTION_VALIDATION_DTOVALIDATIONEXCEPTION',
        message: 'Ошибка при валидации объекта.',
        validation: [
          { message: 'Не заполнено обязательное поле "collectionId"', field: 'collectionId' },
          { message: 'Не заполнено обязательное поле "title"', field: 'title' }
        ]
      }
    }, 'F', 'f')

    expect(parsed?.description).toBe(
      'Ошибка при валидации объекта. Не заполнено обязательное поле "collectionId" Не заполнено обязательное поле "title"'
    )
    expect(parsed?.validation?.map(row => row.field)).toEqual(['collectionId', 'title'])
  })

  it('reads a restApi:v2 body, which has no validation of any kind', () => {
    const parsed = parseErrorPayload(
      { error: 'ERROR_CODE', error_description: 'nope' },
      'FALLBACK',
      'fallback'
    )
    expect(parsed).toEqual({ code: 'ERROR_CODE', description: 'nope' })
    expect(parsed?.validation).toBeUndefined()
  })

  it('falls back for the v2 sentinel code "0"', () => {
    const parsed = parseErrorPayload({ error: '0' }, 'FALLBACK', 'fallback')
    expect(parsed?.code).toBe('FALLBACK')
    expect(parsed?.description).toBe('fallback')
  })

  it('returns undefined for a body carrying no error, so "none" is not "empty"', () => {
    expect(parseErrorPayload({ result: [], time: {} }, 'F', 'f')).toBeUndefined()
    expect(parseErrorPayload(undefined, 'F', 'f')).toBeUndefined()
    expect(parseErrorPayload('not an object', 'F', 'f')).toBeUndefined()
    expect(parseErrorPayload(null, 'F', 'f')).toBeUndefined()
  })

  it('trims trailing whitespace off the portal message before folding rows in', () => {
    // Otherwise the separator lands next to whatever the portal already put
    // there — "Bad. \n Field…" instead of "Bad. Field…".
    const parsed = parseErrorPayload({
      error: { code: 'X', message: 'Bad.  \n', validation: [{ field: 'f', message: 'Nope.' }] }
    }, 'F', 'f')
    expect(parsed?.description).toBe('Bad. Nope.')
  })

  it('falls back to the row for a message that is present but empty', () => {
    // `||`, not `??`: an empty message says nothing, and letting it through
    // would contribute an empty fragment plus a stray separator.
    const parsed = parseErrorPayload({
      error: { code: 'X', message: 'Bad.', validation: [{ field: 'filter', message: '' }] }
    }, 'F', 'f')
    expect(parsed?.description).toBe('Bad. {"field":"filter","message":""}')
  })

  it('detaches and freezes the array it hands back', () => {
    // The caller gets a copy: mutating the body afterwards must not reach the
    // parsed result, and the array itself must not be reorderable. Both are
    // shallow — the `readonly` on each entry's own fields is type-level only.
    const rows = [{ field: 'filter', message: 'Nope.' }]
    const parsed = parseErrorPayload({ error: { code: 'X', message: 'Bad.', validation: rows } }, 'F', 'f')

    rows.push({ field: 'select', message: 'Also nope.' })
    expect(parsed?.validation).toHaveLength(1)
    expect(Object.isFrozen(parsed?.validation)).toBe(true)
  })

  it('survives a validation row that is not the documented shape', () => {
    // `TypeDescriptionErrorV3` permits extra keys and makes both documented ones
    // optional, so a row without a message must not produce "undefined" in the
    // text or drop the entry from the array.
    const parsed = parseErrorPayload({
      error: { code: 'X', message: 'Bad.', validation: [{ field: 'filter' }] }
    }, 'F', 'f')
    expect(parsed?.description).toBe('Bad. {"field":"filter"}')
    expect(parsed?.validation).toEqual([{ field: 'filter' }])
  })
})

describe('AjaxResult — a restApi:v3 validation error', () => {
  it('exposes the failing field through AjaxError.validation', () => {
    // The whole point of #423: this is what the caller could not reach.
    const error = firstError(resultFrom(V3_VALIDATION_BODY))
    expect(error.validation).toEqual([{ field: 'filter', message: 'Field value must not be empty.' }])
    expect(error.validation?.[0]?.field).toBe('filter')
  })

  it('still reports one error with the folded message, as before', () => {
    // The description was already right, and callers read it. Changing the
    // error shape must not change what they already display.
    const result = resultFrom(V3_VALIDATION_BODY)
    expect([...result.getErrors()]).toHaveLength(1)
    expect(result.getErrorMessages()[0]).toContain('Error validating request object.')
    expect(result.getErrorMessages()[0]).toContain('Field value must not be empty.')
    expect(result.isSuccess).toBe(false)
    expect(result.getData()).toBeUndefined()
  })

  it('leaves validation undefined for an error that carries none', () => {
    const error = firstError(resultFrom({ error: { code: 'SOME_CODE', message: 'Plain failure.' } }))
    expect(error.validation).toBeUndefined()
  })

  it('leaves validation undefined for a restApi:v2 error', () => {
    const error = firstError(resultFrom({ error: 'ERROR_CODE', error_description: 'nope' }))
    expect(error.code).toBe('ERROR_CODE')
    expect(error.validation).toBeUndefined()
  })
})

describe('AjaxError', () => {
  it('does not invent a validation array when none was given', () => {
    const error = new AjaxError({ code: 'X', description: 'y', status: 400 })
    expect(error.validation).toBeUndefined()
  })

  it('carries validation onto an error built directly', () => {
    // The soft-error path builds an AjaxError in the transport, then rebuilds a
    // result from it. This is the first half of that hop.
    const error = new AjaxError({
      code: 'X',
      description: 'y',
      status: 400,
      validation: [{ field: 'filter', message: 'Field value must not be empty.' }]
    })
    expect(error.validation?.[0]?.field).toBe('filter')
  })
})

describe('the soft-error path, end to end through call()', () => {
  /**
   * The rebuild is where most of #423 happened. On a soft code the transport
   * does not return the result it parsed — it builds an `AjaxError`, then
   * constructs a **new** `AjaxResult` from a synthetic body. That body held only
   * `code` and `message`, so the portal's `validation` array existed, was
   * parsed, and was then thrown away one step before the caller saw it.
   *
   * Stubbing `_executeSingleCall` to reject exercises the real classification
   * and rebuild in `call()`, without a portal. Follows the pattern in
   * `http-soft-error-codes.unit.spec.ts` (#230).
   */
  function httpRejectingWithValidation(): HttpV3 {
    const http = new HttpV3({} as unknown as AuthActions, null, { maxRetries: 1 })
    ;(http as any)._executeSingleCall = vi.fn().mockRejectedValue(new AjaxError({
      code: 'BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION',
      description: 'Error validating request object. Field value must not be empty.',
      status: 400,
      validation: [{ field: 'filter', message: 'Field value must not be empty.' }],
      requestInfo: { method: 'crm.item.list', params: {}, requestId: 'unit/soft-path' },
      originalError: null
    }))
    return http
  }

  it('the failing field survives the rebuild and reaches the caller', async () => {
    const result = await httpRejectingWithValidation().call('crm.item.list', {})

    expect(result).toBeInstanceOf(AjaxResult)
    expect(result.isSuccess).toBe(false)

    const error = [...result.getErrors()][0] as AjaxError
    expect(error.validation).toEqual([{ field: 'filter', message: 'Field value must not be empty.' }])
  })

  it('keeps originalError non-enumerable on the carried error', async () => {
    // The soft path now carries the transport's own error rather than rebuilding
    // one, so `originalError` — the raw `AxiosError`, whose `config.url` holds
    // the webhook secret — is reachable here as it already was on the throwing
    // path. What must hold on both is that a serializer cannot walk to it.
    const result = await httpRejectingWithValidation().call('crm.item.list', {})
    const error = [...result.getErrors()][0] as AjaxError

    expect(Object.keys(error)).not.toContain('originalError')
    expect(JSON.stringify({ ...error })).not.toContain('originalError')
  })

  it('the message is not doubled by the round trip', async () => {
    // The rebuild re-parses a body whose `message` already contains the folded
    // validation text. Appending the validation messages a second time would
    // produce "…must not be empty. Field value must not be empty."
    const result = await httpRejectingWithValidation().call('crm.item.list', {})
    const message = result.getErrorMessages()[0] ?? ''

    expect(message).toContain('Field value must not be empty.')
    expect(message.match(/Field value must not be empty\./g)).toHaveLength(1)
  })
})
