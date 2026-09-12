/**
 * A blocked redirect must reach the caller as an error, on every adapter.
 *
 * One request sets `maxRedirects: 0` — a `restApi:v3` batch on a non-hook
 * transport, which carries an access token that a redirect to a subdomain would
 * take along. On the Node adapter that produces a legible 301, which
 * `validateStatus` rejects. On `fetch` — what a browser now gets — it produces
 * an *opaque* response instead: status 0, empty body, no headers. Axios resolves
 * that: `settle` returns early on any falsy status, before `validateStatus` is
 * consulted, and unlike the XHR adapter (which rejects `status === 0` as
 * `ECONNABORTED` itself) the fetch adapter has no guard of its own.
 *
 * So without an explicit check the refused request answered `isSuccess` with an
 * empty body — a wrong answer rather than a visible refusal. The check is scoped
 * to the branch that asked for `maxRedirects: 0`, so an ordinary status-0
 * network failure keeps the classification it had.
 *
 * `*.unit.spec.ts` — no portal required.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion, B24Hook } from '../../../packages/jssdk/src/'
import { B24OAuth } from '../../../packages/jssdk/src/oauth/b24'

const OPAQUE_REDIRECT = {
  status: 0,
  statusText: '',
  headers: {},
  config: {} as never,
  data: {}
}

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

describe('a redirect the SDK refuses to follow', () => {
  let b24: B24Hook | B24OAuth | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it('@apiV3 fails the call instead of answering with an empty success', async () => {
    b24 = buildOAuth()
    const client = b24.getHttpClient(ApiVersion.v3)
    vi.spyOn(client.ajaxClient, 'post').mockResolvedValue(OPAQUE_REDIRECT as never)

    const error = await client.batch([['user.get', {}]]).catch((e: unknown) => e)

    expect((error as { code?: string })?.code).toBe('JSSDK_HTTP_REDIRECT_BLOCKED')
  })

  // The narrow scope matters as much as the check: every other request the SDK
  // makes leaves redirects alone, and a status 0 there means something else
  // entirely — a dropped connection, a blocked request — which must keep
  // arriving as what it is.
  it('leaves an ordinary status-0 answer alone', async () => {
    b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/secret/')
    const client = b24.getHttpClient(ApiVersion.v2)
    vi.spyOn(client.ajaxClient, 'post').mockResolvedValue({
      ...OPAQUE_REDIRECT,
      data: { result: [], time: {} }
    } as never)

    const result = await client.call('user.get', {}, 'req-redirect')

    expect(result.isSuccess).toBe(true)
  })
})
