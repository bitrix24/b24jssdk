/**
 * Which branch of `RestrictionManager.handleError` claims each throttling error
 * the portal can send — written down so that changing it shows up as a diff.
 *
 * The portal refuses a call for load in three different places, and they do not
 * look alike on the wire (#459):
 *
 * - `OVERLOAD_LIMIT` — raised in the authorization layer, before the URL version
 *   is even parsed, so it arrives in the flat pre-v3 shape on a `restApi:v3` URL
 *   as readily as on a `restApi:v2` one. It is in the built-in **hard**-code
 *   list, but that decides nothing by itself: the status matchers run first, so
 *   at the 503 the error reference documents for it, the rate-limit branch
 *   claims it and retries;
 * - `QUERY_LIMIT_EXCEEDED` — a cloud-side layer, flat pre-v3 shape. This is the
 *   one `#isRateLimitError()` was written for;
 * - `RATELIMITEXCEPTION` — the v3 layer's own, arriving as HTTP 429 in the v3
 *   envelope with code `BITRIX_REST_V3_EXCEPTION_RATELIMITEXCEPTION`.
 *
 * The third is classified as an **operating**-limit error, because
 * `#isOperatingLimitError()` matches `status === 429` on its own and nothing
 * matches the code. That is today's behaviour, not an endorsement of it: the
 * wait then comes from operating-time statistics rather than from
 * `RateLimiter.handleExceeded()`, which never learns it was throttled. It is
 * left alone on purpose until a measurement on a disposable portal answers which
 * layer replies first under load and whether a `Retry-After` is sent — the SDK
 * reads no such header today. These cases exist so that when that measurement
 * arrives, the change is deliberate and visible.
 *
 * `handleError` returns the wait before the next attempt: `0` means "do not
 * retry", a positive value means "retry after this delay".
 *
 * `*.unit.spec.ts` — no portal required.
 */
import { describe, it, expect } from 'vitest'
import { RestrictionManager } from '../../../packages/jssdk/src/core/http/limiters/manager'
import { ParamsFactory } from '../../../packages/jssdk/src/core/http/limiters/params-factory'

function callHandleError(
  error: { code: string, message?: string, status: number },
  attempt = 0
): Promise<number> {
  const manager = new RestrictionManager(ParamsFactory.getDefault())
  return manager.handleError('unit-test', 'tasks.task.list', {}, { message: '', ...error }, attempt)
}

/**
 * The exact waits each branch returns for a first attempt against the default
 * parameters, which is what tells them apart here — there is no log to assert.
 *
 * The operating branch floors at `Math.max(10_000, …)`, and a fresh
 * `OperatingLimiter` has no statistics to raise it above that floor, so it is
 * exactly the floor. The rate branch returns `RateLimiter.handleExceeded()`
 * scaled by `1.5 ** attempt`: at the default `drainRate: 2` that is a refill
 * interval of 500 ms plus 1000, with `attempt` 0 throughout.
 *
 * Pinned exactly rather than as a threshold, deliberately. The gap between them
 * is not a law: the rate branch passes 10 s once `attempt` reaches 6, and a
 * lower `drainRate` shortens that runway — so a `toBeLessThan(10_000)` would
 * quietly start passing for the wrong reason if anyone parameterised these cases
 * over `attempt` or over a different `ParamsFactory` preset.
 */
const OPERATING_WAIT_MS = 10_000
const RATE_WAIT_MS = 1_500

describe('throttling errors: which branch claims which (#459)', () => {
  it('a v3 rate-limit error is currently handled as an operating limit, by status alone', async () => {
    const wait = await callHandleError({
      code: 'BITRIX_REST_V3_EXCEPTION_RATELIMITEXCEPTION',
      status: 429
    })

    expect(wait).toBe(OPERATING_WAIT_MS)
  })

  it('so does a bare 429 carrying no code the SDK knows', async () => {
    const wait = await callHandleError({ code: 'SOMETHING_UNENUMERATED', status: 429 })

    expect(wait).toBe(OPERATING_WAIT_MS)
  })

  it('the operating limit proper is unchanged', async () => {
    const wait = await callHandleError({ code: 'OPERATION_TIME_LIMIT', status: 429 })

    expect(wait).toBe(OPERATING_WAIT_MS)
  })

  it('a rate limit is retried on the rate branch', async () => {
    const wait = await callHandleError({ code: 'QUERY_LIMIT_EXCEEDED', status: 503 })

    expect(wait).toBe(RATE_WAIT_MS)
  })

  // The two matchers overlap, and nothing above says which wins: every case so
  // far matches exactly one of them, so swapping the order of the two branches
  // changes nothing. This input matches both — a rate-limit code carrying the
  // status the operating matcher takes — and so pins the precedence itself.
  it('the rate-limit branch is tested first where the two matchers overlap', async () => {
    const wait = await callHandleError({ code: 'QUERY_LIMIT_EXCEEDED', status: 429 })

    expect(wait).toBe(RATE_WAIT_MS)
  })

  // `OVERLOAD_LIMIT` is in the built-in hard-code list, but being listed there
  // decides nothing on its own: the status matchers run first, and the hard-code
  // check is only reached if neither claimed the error. So which of the two
  // happens is decided entirely by the status the portal attached, and both
  // outcomes are pinned rather than one being assumed.
  //
  // Measured, not inferred: at 503 the rate-limit branch answers first and the
  // call is retried; with no status the hard-code listing takes effect and it is
  // not. The error reference documents this code as 503, so the retried path is
  // the one a portal most likely takes — the hard-code listing is a floor for
  // the shape that arrives without one.
  it('an overload limit at 503 is retried, claimed by the rate-limit branch', async () => {
    const wait = await callHandleError({ code: 'OVERLOAD_LIMIT', status: 503 })

    expect(wait).toBe(RATE_WAIT_MS)
  })

  it('an overload limit with no status is not retried at all', async () => {
    const wait = await callHandleError({ code: 'OVERLOAD_LIMIT', status: 0 })

    expect(wait).toBe(0)
  })
})
