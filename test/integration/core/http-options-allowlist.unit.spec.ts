/**
 * `httpOptions` is filtered at runtime, not merely typed.
 *
 * `TypeHttpOptions` names the axios keys a caller may set at construction, but a
 * type cannot enforce that. TypeScript's excess-property check fires only on a
 * direct object literal with no overlapping key, so one allowed key beside a
 * forbidden one — or any value passed through a variable, or any call from plain
 * JavaScript — used to reach `axios.create` untouched. Measured before the
 * filter existed: a smuggled `transformRequest` replaced the request body
 * wholesale, with no error on either side and a portal-side failure only, and a
 * `baseURL` pointed the SDK's traffic at another host.
 *
 * `headers` is the documented exception: the transport constructor has merged a
 * caller's headers over the SDK's own since #144 and still does. It stays out of
 * `TypeHttpOptions` because the SDK's `Content-Type` and `Authorization` are
 * decided per request, where an instance header cannot reach them.
 *
 * `*.unit.spec.ts` — no portal required.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { ApiVersion, B24Hook } from '../../../packages/jssdk/src/'

function buildHook(httpOptions: object): B24Hook {
  return new B24Hook(
    { b24Url: 'https://example.bitrix24.com', userId: 1, secret: 'secret' },
    { httpOptions } as never
  )
}

describe('httpOptions drops what it does not accept', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    b24?.destroy()
    b24 = null
  })

  it.each([
    'transformRequest',
    'baseURL',
    'paramsSerializer',
    'validateStatus'
  ])('never lets %s reach axios', (key) => {
    // Alongside an accepted key, which is exactly the shape the compiler lets
    // through: excess-property checking needs a literal with no overlap.
    b24 = buildHook({ timeout: 5000, [key]: key === 'baseURL' ? 'https://elsewhere.example/' : () => 'x' })

    const defaults = b24.getHttpClient(ApiVersion.v2).ajaxClient.defaults as Record<string, unknown>

    // `baseURL` has no axios default; the transforming keys do, so compare
    // against a client built with nothing rather than against `undefined`.
    const untouched = new B24Hook({ b24Url: 'https://example.bitrix24.com', userId: 1, secret: 'secret' })
    try {
      expect(defaults[key]).toEqual((untouched.getHttpClient(ApiVersion.v2).ajaxClient.defaults as Record<string, unknown>)[key])
    } finally {
      untouched.destroy()
    }

    // The accepted key beside it still applies — filtered, not refused.
    expect(defaults['timeout']).toBe(5000)
  })

  it('keeps every accepted key', () => {
    b24 = buildHook({ adapter: 'xhr', timeout: 1234, maxRedirects: 7, decompress: false })

    const defaults = b24.getHttpClient(ApiVersion.v2).ajaxClient.defaults

    expect(defaults.adapter).toBe('xhr')
    expect(defaults.timeout).toBe(1234)
    expect(defaults.maxRedirects).toBe(7)
    expect(defaults.decompress).toBe(false)
  })

  it('still merges a caller header over the SDK defaults (#144)', () => {
    b24 = buildHook({ headers: { 'X-Test-Header': 'kept' } })

    const headers = JSON.stringify(b24.getHttpClient(ApiVersion.v2).ajaxClient.defaults.headers)

    expect(headers).toContain('X-Test-Header')
  })
})
