/**
 * Regression for https://github.com/bitrix24/b24jssdk/issues/533
 *
 * The portal reads a `filter` value as a boolean only when the request body is
 * JSON. Under `application/x-www-form-urlencoded`, `ACTIVE: false` arrives as
 * the string `"false"`, the condition is dropped, and the call answers with rows
 * it should have excluded — with no error on either side.
 *
 * Measured against one portal in one minute, `user.get` with
 * `filter: { ACTIVE: … }`:
 *
 *   body JSON            true → 1 row   false → 0 rows
 *   body form-urlencoded true → 1 row   false → 1 row
 *
 * The SDK had always sent JSON, but never asked for it — axios picks
 * `application/json` on its own for a plain-object body. That default is
 * reachable: `ajaxClient` is public and the documentation encourages touching it
 * to raise `defaults.timeout`, so a single header on the instance silently broke
 * every boolean filter portal-wide.
 *
 * `*.unit.spec.ts` — no portal required.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion, B24Hook } from '../../../packages/jssdk/src/'
import { B24OAuth } from '../../../packages/jssdk/src/oauth/b24'

function buildHook(): B24Hook {
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/secret/')
}

/**
 * A non-hook transport, which takes the two other branches of the per-request
 * config: `Authorization: Bearer` on a server, and `?auth=` in a browser.
 */
function buildOAuth(): B24OAuth {
  return new B24OAuth(
    {
      accessToken: 'ACCESS_TOKEN_PLACEHOLDER',
      refreshToken: 'REFRESH_TOKEN_PLACEHOLDER',
      expires: 2_000_000_000,
      expiresIn: 3600,
      domain: 'example.bitrix24.com',
      memberId: 'member',
      clientEndpoint: 'https://example.bitrix24.com/rest/',
      serverEndpoint: 'https://oauth.bitrix.info/rest/',
      status: 'L'
    } as never,
    { clientId: 'local.test', clientSecret: 'secret' } as never
  )
}

const okResponse = {
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as never,
  data: { result: [], time: {} }
}

describe('the JSON content type is stated, not inherited (#533)', () => {
  let b24: B24Hook | B24OAuth | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it.each([ApiVersion.v2, ApiVersion.v3])('%s states it on every call', async (version) => {
    b24 = buildHook()
    const client = b24.getHttpClient(version)
    const post = vi.spyOn(client.ajaxClient, 'post').mockResolvedValue(okResponse as never)

    await client.call('user.get', { filter: { ACTIVE: false } }, 'req-533')

    expect(post.mock.calls[0]?.[2]?.headers?.['Content-Type']).toBe('application/json')
  })

  // The reachable failure: one line on the public instance used to change the
  // body encoding for every request the SDK made.
  it('a form-urlencoded default on the instance no longer wins', async () => {
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v2)
    client.ajaxClient.defaults.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    const post = vi.spyOn(client.ajaxClient, 'post').mockResolvedValue(okResponse as never)

    await client.call('user.get', { filter: { ACTIVE: false } }, 'req-533')

    expect(post.mock.calls[0]?.[2]?.headers?.['Content-Type']).toBe('application/json')
  })

  // The header is built in three branches — webhook, `Authorization: Bearer`,
  // and the browser's query-auth — and only the first is exercised above. Each
  // one composes the header object separately, so each one can lose it
  // separately.
  it('the Bearer branch states it too', async () => {
    // That branch is narrower than it looks: a bare-array body on a non-hook
    // transport outside a browser, i.e. a v3 batch. An ordinary OAuth call
    // still carries its credential in the body.
    b24 = buildOAuth()
    const client = b24.getHttpClient(ApiVersion.v3)
    const post = vi.spyOn(client.ajaxClient, 'post').mockResolvedValue({
      ...okResponse,
      data: { result: [{ items: [] }], time: {} }
    } as never)

    await client.batch([['user.get', {}]])

    const headers = post.mock.calls[0]?.[2]?.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    // And the credential still rides alongside it rather than replacing it.
    expect(headers['Authorization']).toBe('Bearer ACCESS_TOKEN_PLACEHOLDER')
  })

  it('the browser query-auth branch states it too', async () => {
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = { document: {} }

    try {
      b24 = buildOAuth()
      const client = b24.getHttpClient(ApiVersion.v3)
      const post = vi.spyOn(client.ajaxClient, 'post').mockResolvedValue({
        ...okResponse,
        data: { result: [{ items: [] }], time: {} }
      } as never)

      await client.batch([['user.get', {}]])

      const headers = post.mock.calls[0]?.[2]?.headers as Record<string, string>
      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['Authorization']).toBeUndefined()
    } finally {
      if (typeof originalWindow === 'undefined') {
        delete (globalThis as { window?: unknown }).window
      } else {
        ;(globalThis as { window?: unknown }).window = originalWindow
      }
    }
  })

  // The header is a default, not a lock: it is spread before
  // `requestConfig.headers`, so a transport that overrides
  // `_prepareRequestConfig` can still name its own. Nothing in the SDK does
  // today — this pins the ordering the source comment promises, which is what
  // keeps the next edit from silently turning it into a lock.
  it('a transport-supplied content type wins over it', async () => {
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v2)

    ;(client as unknown as {
      _prepareRequestConfig: () => object
    })._prepareRequestConfig = () => ({
      headers: { 'Content-Type': 'multipart/form-data' }
    })

    const post = vi.spyOn(client.ajaxClient, 'post').mockResolvedValue(okResponse as never)

    await client.call('user.get', {}, 'req-533')

    expect(post.mock.calls[0]?.[2]?.headers?.['Content-Type']).toBe('multipart/form-data')
  })

  // Per request rather than on the instance, deliberately. Measured: an
  // instance-level `application/json` sticks to a `FormData` body and replaces
  // the multipart boundary axios would have computed — so setting it there
  // would break a caller who posts their own form data through `ajaxClient`.
  it('leaves the instance default alone, so a caller\'s own FormData still works', async () => {
    b24 = buildHook()
    const client = b24.getHttpClient(ApiVersion.v2)

    const instanceDefault = client.ajaxClient.defaults.headers['Content-Type']

    expect(instanceDefault).toBeUndefined()
  })
})
