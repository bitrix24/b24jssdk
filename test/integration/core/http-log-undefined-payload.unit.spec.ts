/**
 * #338 — a payload the logger callsites hand to `truncateForLog` is not always a
 * string. `JSON.stringify` returns the VALUE `undefined` (not `"undefined"`) for
 * `undefined`, so two real request paths used to throw
 * `TypeError: Cannot read properties of undefined (reading 'length')` from inside
 * the logging call:
 *
 *   1. a v3 success body with no `result` envelope (`rest.documentation.openapi`)
 *      → `post/response` logs `response.data.result`, which is `undefined`;
 *   2. an AxiosError with no `response` (network failure, DNS, timeout, CORS)
 *      → `post/catchError` logs `error.response.data`, which is `undefined`.
 *
 * Both were destructive rather than cosmetic: the TypeError replaced the real
 * outcome — the caller lost a perfectly good response in (1), and the real
 * network error in (2) — and got `JSSDK_UNKNOWN_ERROR` / status 0 instead.
 *
 * The argument is evaluated eagerly at the callsite, so neither case depends on
 * a logger being wired: a NullLogger or a raised log level does not avoid it.
 *
 * Pure logic — no portal — so this runs in the jsSdk:unit project.
 */
import { describe, it, expect, vi } from 'vitest'
import { AxiosError } from 'axios'
import { HttpV2 } from '../../../packages/jssdk/src/core/http/v2'
import { truncateForLog } from '../../../packages/jssdk/src/core/http/abstract-http'
import { ApiVersion } from '../../../packages/jssdk/src/types/b24'
import type { AuthActions, AuthData } from '../../../packages/jssdk/src/types/auth'

// Enough of AuthActions for `_makeAxiosRequest` to build a URL; the transport
// itself is stubbed per test, so nothing leaves the process.
const authActionsStub = {
  getTargetOriginWithPath: () => new Map([
    [ApiVersion.v2, 'https://example.bitrix24.test/rest'],
    [ApiVersion.v3, 'https://example.bitrix24.test/api']
  ])
} as unknown as AuthActions

const authDataStub = { access_token: 'x', refresh_token: 'hook' } as unknown as AuthData

function makeHttp(): HttpV2 {
  return new HttpV2(authActionsStub, null, {})
}

describe('#338 truncateForLog tolerates a non-string payload', () => {
  it('coerces the `undefined` that JSON.stringify returns for an absent value', () => {
    // The exact expression the post/response callsite builds for an
    // envelope-less body. `JSON.stringify(undefined)` is the value `undefined`.
    expect(JSON.stringify(undefined)).toBeUndefined()
    expect(truncateForLog(JSON.stringify(undefined))).toBe('undefined')
  })

  it('coerces null without throwing', () => {
    expect(truncateForLog(null)).toBe('null')
  })

  it('still caps an oversized non-string payload', () => {
    expect(truncateForLog({ toString: () => 'w'.repeat(5000) })).toBe('w'.repeat(100) + '...')
  })
})

describe('#338 a success body with no `result` key reaches the caller intact', () => {
  it('resolves the bare OpenAPI document instead of throwing from the logger', async () => {
    const http = makeHttp()
    // `rest.documentation.openapi` answers with a top-level OpenAPI document —
    // no `result` key anywhere in the envelope.
    const openapiBody = {
      openapi: '3.0.0',
      info: { title: 'Bitrix24 REST V3 API', version: '1.0.0' },
      servers: [],
      paths: {},
      tags: []
    }
    ;(http as any)._clientAxios.post = vi.fn().mockResolvedValue({
      status: 200,
      data: openapiBody
    })

    const response = await (http as any)._makeAxiosRequest('rid', 'rest.documentation.openapi', {}, authDataStub)

    expect(response.status).toBe(200)
    // The untouched body is handed back — redaction applies to the log copy only.
    expect(response.payload).toEqual(openapiBody)
  })
})

describe('#338 a network error keeps its own identity through the catchError log', () => {
  it('rethrows the AxiosError, not a TypeError raised while logging it', async () => {
    const http = makeHttp()
    // A transport failure: axios populates no `response`, so the callsite's
    // `error?.response?.data` is `undefined`.
    const networkError = new AxiosError('Network Error', 'ERR_NETWORK')
    expect(networkError.response).toBeUndefined()

    ;(http as any)._makeAxiosRequest = vi.fn().mockRejectedValue(networkError)
    ;(http as any)._restrictionManager.checkRateLimit = vi.fn().mockResolvedValue(undefined)

    const caught = await (http as any)
      ._makeRequestWithAuthRetry('rid', 'some.method', {}, authDataStub)
      .then(() => null, (error: unknown) => error)

    // Before the fix this was a TypeError from `truncateForLog`, which erased
    // the transport failure the caller needed to see.
    expect(caught).not.toBeInstanceOf(TypeError)
    expect((caught as Error)?.message).not.toContain('reading \'length\'')
  })
})
