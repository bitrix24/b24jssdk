/**
 * Unit-style tests for the retry decision in `RestrictionManager.handleError`.
 *
 * Regression for issue #44: a v3 client validation error (HTTP 400) must fail
 * fast instead of being retried `maxRetries` times. Retryability is decided by
 * HTTP status — any 4xx (except 429/408) is deterministic and not retried,
 * regardless of whether its error code is enumerated in the hard/soft lists.
 *
 * `handleError` returns the wait time before the next attempt: `0` means "do
 * not retry", a positive value means "retry after this delay".
 */
import { describe, it, expect } from 'vitest'
import { RestrictionManager } from '../../../packages/jssdk/src/core/http/limiters/manager'
import { ParamsFactory } from '../../../packages/jssdk/src/core/http/limiters/params-factory'

function buildManager(): RestrictionManager {
  return new RestrictionManager(ParamsFactory.getDefault())
}

function callHandleError(
  manager: RestrictionManager,
  error: { code: string, message?: string, status: number },
  attempt = 0
) {
  return manager.handleError('unit-test', 'tasks.task.update', {}, { message: '', ...error }, attempt)
}

describe('retry decision: client errors are not retried (issue #44)', () => {
  it('does not retry the v3 validation error from the report (HTTP 400)', async () => {
    const wait = await callHandleError(buildManager(), {
      code: 'BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION',
      status: 400
    })
    expect(wait).toBe(0)
  })

  it('does not retry an unlisted 4xx error code (status-driven, not allowlist-driven)', async () => {
    const wait = await callHandleError(buildManager(), {
      code: 'BITRIX_REST_V3_EXCEPTION_SOME_BRAND_NEW_CODE',
      status: 400
    })
    expect(wait).toBe(0)
  })

  it.each([400, 401, 403, 404, 422, 451, 499])('does not retry HTTP %i', async (status) => {
    const wait = await callHandleError(buildManager(), { code: 'CLIENT_ERROR', status })
    expect(wait).toBe(0)
  })

  it('does not retry a 4xx error even on a later attempt (the issue #44 scenario)', async () => {
    const wait = await callHandleError(buildManager(), {
      code: 'BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION',
      status: 400
    }, 2)
    expect(wait).toBe(0)
  })

  it('does not retry a hard error code carried on a 4xx status', async () => {
    // ACCESS_DENIED is in BUILT_IN_HARD_ERROR_CODES; with a 4xx status the
    // status gate fires first, but the outcome must still be "no retry".
    const wait = await callHandleError(buildManager(), { code: 'ACCESS_DENIED', status: 403 })
    expect(wait).toBe(0)
  })

  it('still retries 408 (request timeout) — transient', async () => {
    const wait = await callHandleError(buildManager(), { code: 'REQUEST_TIMEOUT', status: 408 })
    expect(wait).toBeGreaterThan(0)
  })

  it('still retries 429 (operating limit)', async () => {
    const wait = await callHandleError(buildManager(), { code: 'OPERATION_TIME_LIMIT', status: 429 })
    expect(wait).toBeGreaterThanOrEqual(10_000)
  })

  it('still retries 503 (rate limit)', async () => {
    const wait = await callHandleError(buildManager(), { code: 'QUERY_LIMIT_EXCEEDED', status: 503 })
    expect(wait).toBeGreaterThan(0)
  })

  it.each([500, 502, 504])('still retries server error HTTP %i', async (status) => {
    const wait = await callHandleError(buildManager(), { code: 'SERVER_ERROR', status })
    expect(wait).toBeGreaterThan(0)
  })

  it('still retries a network error (status 0)', async () => {
    const wait = await callHandleError(buildManager(), { code: 'NETWORK_ERROR', status: 0 })
    expect(wait).toBeGreaterThan(0)
  })

  it('grows the backoff with the attempt number for a server error', async () => {
    const manager = buildManager()
    const wait0 = await callHandleError(manager, { code: 'SERVER_ERROR', status: 500 }, 0)
    const wait2 = await callHandleError(manager, { code: 'SERVER_ERROR', status: 500 }, 2)
    // Backoff is delay * 2^attempt with ±10% jitter — the gap is large enough
    // that the upper jitter bound of attempt 0 stays below attempt 2.
    expect(wait2).toBeGreaterThan(wait0)
  })
})
