/**
 * Regression for https://github.com/bitrix24/b24jssdk/issues/24
 *
 * Non-idempotent REST calls (e.g. `crm.documentgenerator.document.add`) that
 * time out client-side must NOT be retried — the server may have already
 * processed the request, so a retry creates a duplicate entity.
 *
 * The fix exposes a `retryOnNetworkError` flag on `RestrictionParams`. When
 * `false`, transport-level failures (`NETWORK_ERROR` / `REQUEST_TIMEOUT`) are
 * treated as hard errors and the SDK throws on the first attempt.
 *
 * We exercise the SDK behaviour by forcing a 1 ms axios timeout on a benign,
 * idempotent method (`server.time`). The portal cannot respond that fast, so
 * axios reliably raises `ECONNABORTED` → SDK maps it to `REQUEST_TIMEOUT`.
 *
 * Requires `B24_HOOK` from `.env.test`. No portal-side data is modified.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { ApiVersion, B24Hook, ParamsFactory } from '../../../packages/jssdk/src/'

function buildClient(): B24Hook {
  const hook = process.env.B24_HOOK
  if (!hook) {
    throw new Error('B24_HOOK environment variable is not set! Please configure it in your .env.test file')
  }
  const b24 = B24Hook.fromWebhookUrl(hook, { restrictionParams: ParamsFactory.getDefault() })
  // Force every request to time out on the client before the server can answer.
  b24.getHttpClient(ApiVersion.v2).ajaxClient.defaults.timeout = 1
  return b24
}

describe('core.limiters retryOnNetworkError @apiV2 (issue #24)', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    b24?.destroy()
    b24 = null
  })

  it('default behaviour: SDK retries on REQUEST_TIMEOUT and throws JSSDK_CALL_ALL_ATTEMPTS_EXHAUSTED', async () => {
    b24 = buildClient()

    let thrown: any
    try {
      await b24.actions.v2.call.make({ method: 'server.time', params: {} })
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeDefined()
    expect(thrown.code).toBe('JSSDK_CALL_ALL_ATTEMPTS_EXHAUSTED')

    const stats = b24.getHttpClient(ApiVersion.v2).getStats()
    // maxRetries defaults to 3 → 3 attempts total, 3 failures.
    // The retries counter is incremented after each failed attempt that
    // schedules another try, including on the final iteration before the
    // loop's bound check exits, so it ends at maxRetries (3), not 2.
    expect(stats.failedRequests).toBe(3)
    expect(stats.retries).toBe(3)
  })

  it('retryOnNetworkError=false: SDK throws REQUEST_TIMEOUT immediately, no retries', async () => {
    b24 = buildClient()
    await b24.setRestrictionManagerParams({
      ...ParamsFactory.getDefault(),
      retryOnNetworkError: false
    })

    let thrown: any
    try {
      await b24.actions.v2.call.make({ method: 'server.time', params: {} })
    } catch (e) {
      thrown = e
    }

    expect(thrown).toBeDefined()
    expect(thrown.code).toBe('REQUEST_TIMEOUT')

    const stats = b24.getHttpClient(ApiVersion.v2).getStats()
    expect(stats.retries).toBe(0)
    expect(stats.failedRequests).toBe(1)
  })
})
