/**
 * Unit test for #149 — the OAuth token-refresh request must carry `client_secret`
 * and `refresh_token` in the POST body (`application/x-www-form-urlencoded`), not
 * in the URL query string where they leak via proxy / CDN / server access logs.
 *
 * Portal-free (`jsSdk:unit`): `axios` is mocked, so `axios.create()` returns a stub
 * whose `post`/`get` we capture — no network request is made. The Bitrix auth
 * server's acceptance of the body form was verified manually against
 * `oauth.bitrix24.tech`. The mock asserts the call SHAPE (method, body, headers,
 * absence of query params); axios's own URLSearchParams→wire serialization is not
 * exercised here (covered by that manual check).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { post, get, AxiosError } = vi.hoisted(() => {
  class AxiosError extends Error {
    code?: string
    isAxiosError = true
    response?: { status?: number, data?: unknown }
    constructor(message?: string) {
      super(message)
      this.name = 'AxiosError'
    }
  }
  return { post: vi.fn(), get: vi.fn(), AxiosError }
})

vi.mock('axios', () => {
  const instance = { post, get }
  const create = vi.fn(() => instance)
  return { default: { create }, create, AxiosError }
})

import { AuthOAuthManager } from '../../../packages/jssdk/src/oauth/auth'
import { RefreshTokenError } from '../../../packages/jssdk/src/oauth/refresh-token-error'
import type { B24OAuthParams, B24OAuthSecret } from '../../../packages/jssdk/src/types/auth'

const CLIENT_SECRET = 'CLIENT_SECRET_LEAK_PROBE'
const REFRESH_TOKEN = 'REFRESH_TOKEN_LEAK_PROBE'

function makeManager(): AuthOAuthManager {
  const params = {
    domain: 'https://portal.bitrix24.com',
    clientEndpoint: 'https://portal.bitrix24.com/rest/',
    serverEndpoint: 'https://oauth.bitrix24.tech/rest/',
    expires: Math.floor(Date.now() / 1000) + 3600,
    expiresIn: 3600,
    accessToken: 'ACCESS_OLD',
    refreshToken: REFRESH_TOKEN,
    memberId: 'mid-1',
    scope: 'app',
    status: 'L'
  } as unknown as B24OAuthParams
  const secret = { clientId: 'local.app.id', clientSecret: CLIENT_SECRET } as B24OAuthSecret
  return new AuthOAuthManager(params, secret)
}

const OK_PAYLOAD = {
  access_token: 'ACCESS_NEW',
  refresh_token: 'REFRESH_NEW',
  expires: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  client_endpoint: 'https://portal.bitrix24.com/rest/',
  server_endpoint: 'https://oauth.bitrix24.tech/rest/',
  scope: 'app',
  status: 'L'
}

describe('#149 OAuth token refresh sends credentials in the POST body, not the URL', () => {
  beforeEach(() => {
    post.mockReset()
    get.mockReset()
  })

  it('POSTs /oauth/token/ form-urlencoded with the secrets in the body, never in the query', async () => {
    post.mockResolvedValue({ status: 200, data: OK_PAYLOAD })

    const authData = await makeManager().refreshAuth()
    expect(authData.access_token).toBe('ACCESS_NEW')

    expect(post).toHaveBeenCalledTimes(1)
    expect(get).not.toHaveBeenCalled() // the old GET-with-query path is gone

    const [url, bodyArg, config] = post.mock.calls[0] as [string, unknown, any]
    expect(url).toBe('/oauth/token/') // clean URL, no query string

    expect(bodyArg).toBeInstanceOf(URLSearchParams)
    const body = bodyArg as URLSearchParams
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('client_id')).toBe('local.app.id')
    expect(body.get('client_secret')).toBe(CLIENT_SECRET)
    expect(body.get('refresh_token')).toBe(REFRESH_TOKEN)

    expect(config?.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(config?.params).toBeUndefined() // no query params carrying the secret
    expect(JSON.stringify(config ?? {})).not.toContain(CLIENT_SECRET)
    expect(JSON.stringify(config ?? {})).not.toContain(REFRESH_TOKEN)
  })

  it('on an AxiosError, throws a RefreshTokenError that carries no secret', async () => {
    const err = new AxiosError('Request failed with status code 401')
    err.code = 'ERR_BAD_REQUEST'
    err.response = { status: 401, data: { error: 'invalid_grant', error_description: 'bad refresh token' } }
    post.mockRejectedValue(err)

    const thrown = await makeManager().refreshAuth().catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(RefreshTokenError)
    // The thrown error is built from the server's response only — never the request
    // body — so the credentials never reach it.
    const rendered = `${String(thrown)} ${JSON.stringify((thrown as { toJSON?: () => unknown })?.toJSON?.() ?? {})}`
    expect(rendered).not.toContain(CLIENT_SECRET)
    expect(rendered).not.toContain(REFRESH_TOKEN)
  })

  it('customRefreshAuth short-circuits — no HTTP request is made', async () => {
    const mgr = makeManager()
    mgr.setCustomRefreshAuth(async () => OK_PAYLOAD as any)

    await mgr.refreshAuth()
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })
})
