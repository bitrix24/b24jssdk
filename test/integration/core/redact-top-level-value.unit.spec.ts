/**
 * The redactor used to refuse anything that was not a plain object.
 *
 * `redactSensitiveParams` began `if (!isPlainObject(params)) return params`,
 * and `isPlainObject` excludes arrays — so an array or a bare string handed in
 * at the top level came back untouched. The walker underneath (`redactValue`)
 * had always handled both; only the door was shut. The same content was
 * therefore masked inside an object and printed verbatim when it arrived on its
 * own.
 *
 * That is reached on an ordinary path, not a corner: `_makeAxiosRequest` logs
 * `response.data?.result`, and a `restApi:v3` batch answers with an **array**
 * there — so every successful v3 batch wrote its response to the log unmasked.
 *
 * #468 widened the gap rather than closing it: it taught the string pass to
 * mask a webhook secret in a URL *path*, a capability a top-level string never
 * reached.
 *
 * One `it` per surface: a compound case lets one mutation hide behind a
 * neighbouring assertion.
 *
 * `*.unit.spec.ts` — no portal, no network.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ApiVersion, B24Hook, ParamsFactory } from '../../../packages/jssdk/src/'
import { redactSensitiveParams } from '../../../packages/jssdk/src/core/http/redact'

const SECRET_URL = 'https://example.bitrix24.com/rest/1/abcdefgh12345678/user.get'
const REDACTED = '***REDACTED***'

describe('redacting a top-level array or string', () => {
  it('masks a credential key inside a top-level array', () => {
    // No cast on the way in: the generic overload carries the array type
    // through, which is itself part of the contract this pins.
    const redacted = redactSensitiveParams([{ id: 1, auth: 'SECRET' }])
    expect(redacted[0]?.auth).toBe(REDACTED)
  })

  it('masks a webhook secret in a URL inside a top-level array', () => {
    const redacted = redactSensitiveParams([{ url: SECRET_URL }])
    expect(redacted[0]?.url).not.toContain('abcdefgh12345678')
    expect(redacted[0]?.url).toContain(REDACTED)
  })

  it('masks a webhook secret in a bare top-level string', () => {
    // The #468 capability, on the shape #468 never reached.
    const redacted = redactSensitiveParams(SECRET_URL)
    expect(redacted).not.toContain('abcdefgh12345678')
    expect(redacted).toContain(REDACTED)
  })

  it('masks a query-string credential in a bare top-level string', () => {
    const redacted = redactSensitiveParams('https://example.com/?auth=SECRET&x=1')
    expect(redacted).not.toContain('SECRET')
  })

  it('walks an array nested in a top-level array', () => {
    const redacted = redactSensitiveParams([[{ auth: 'SECRET' }]])
    expect(redacted[0]?.[0]?.auth).toBe(REDACTED)
  })

  it('leaves a value with nothing to mask alone', () => {
    expect(redactSensitiveParams(['plain', 42])).toEqual(['plain', 42])
    expect(redactSensitiveParams(null)).toBeNull()
    expect(redactSensitiveParams(undefined)).toBeUndefined()
    expect(redactSensitiveParams(42)).toBe(42)
  })

  it('does not mutate the array it was given', () => {
    const source = [{ auth: 'SECRET' }]
    redactSensitiveParams(source)
    expect(source[0]?.auth).toBe('SECRET')
  })

  it('keeps the full two-level reach for a plain object', () => {
    // Entering through the value walker would spend a depth level on the object
    // itself, halving the reach batch-shaped payloads need.
    const redacted = redactSensitiveParams({ cmd: [{ params: { auth: 'SECRET' } }] }) as {
      cmd: Array<{ params: { auth: string } }>
    }
    expect(redacted.cmd[0]?.params.auth).toBe(REDACTED)
  })
})

describe('the response log of a call whose result is an array', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it('masks the credentials a v3 batch returns', async () => {
    b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
      restrictionParams: { ...ParamsFactory.getDefault(), maxRetries: 1, retryDelay: 1 }
    })
    const client = b24.getHttpClient(ApiVersion.v3)

    vi.spyOn(client.ajaxClient, 'post').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
      data: {
        result: [{ id: 1, auth: 'SECRET-IN-BATCH', url: SECRET_URL }],
        time: {
          start: 0, finish: 0, duration: 0, processing: 0,
          date_start: '1970-01-01T00:00:00+00:00', date_finish: '1970-01-01T00:00:00+00:00'
        }
      }
    })

    const logged: string[] = []
    vi.spyOn(client.getLogger(), 'info').mockImplementation(async (message: string, context?: unknown) => {
      if (message === 'post/response') {
        logged.push(JSON.stringify(context))
      }
    })

    await client.call('main.eventlog.list', {})

    // End to end, because the unit-level cases above cannot show that this is
    // the shape the transport actually hands the redactor.
    expect(logged).toHaveLength(1)
    expect(logged[0]).not.toContain('SECRET-IN-BATCH')
    expect(logged[0]).not.toContain('abcdefgh12345678')
  })
})
