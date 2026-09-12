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
import { HTTP_OPTION_KEYS, pickHttpOptions } from '../../../packages/jssdk/src/core/http/http-options'

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

  // The dropped keys are reported by NAME and never by value: a `headers` entry
  // a caller tried to set here can carry an `Authorization` token, and the
  // report reaches whatever sink the app wired up. Asserted on `pickHttpOptions`
  // directly, because `LoggerFactory.forcedLog` returns early under vitest — so
  // the log line itself is unobservable from a spec, and the property that
  // matters would otherwise rest on a comment.
  it('reports dropped keys by name and never their values', () => {
    const { picked, dropped } = pickHttpOptions({
      timeout: 5000,
      baseURL: 'https://elsewhere.example/',
      transformRequest: [() => 'SECRET_BODY'],
      headers: { Authorization: 'Bearer SECRET_TOKEN' }
    })

    expect(dropped).toEqual(['baseURL', 'transformRequest'])
    expect(Object.keys(picked)).toEqual(['timeout'])
    // `headers` is the documented exception: handled by the caller of this
    // function, so neither kept here nor named as dropped.
    expect(dropped).not.toContain('headers')
    // Nothing in the report is a value.
    expect(JSON.stringify(dropped)).not.toContain('SECRET')
    expect(JSON.stringify(dropped)).not.toContain('elsewhere.example')
  })

  // The type and the runtime filter are one list, derived from the same const —
  // this pins that they have not drifted apart in the other direction.
  it('accepts exactly the keys the public type names', () => {
    const everyKey = Object.fromEntries(HTTP_OPTION_KEYS.map(key => [key, 1]))

    expect(Object.keys(pickHttpOptions(everyKey).picked)).toEqual([...HTTP_OPTION_KEYS])
    expect(pickHttpOptions(everyKey).dropped).toEqual([])
  })
})
