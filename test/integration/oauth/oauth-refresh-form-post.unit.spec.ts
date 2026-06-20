/**
 * Unit test for #149 — the OAuth token-refresh request must carry `client_secret`
 * and `refresh_token` in the POST body (`application/x-www-form-urlencoded`), not
 * in the URL query string where they leak via proxy / CDN / server access logs.
 *
 * Portal-free (`jsSdk:unit`): `axios` is mocked, so `axios.create()` returns a stub
 * whose `post` we capture — no network request is made. The Bitrix auth server's
 * acceptance of the body form was verified manually against `oauth.bitrix24.tech`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('axios', () => {
  class AxiosError extends Error {
    code?: string
    response?: { status?: number, data?: unknown }
    constructor(message?: string) {
      super(message)
      this.name = 'AxiosError'
    }
  }
  const instance = { post, get: vi.fn() }
  const create = vi.fn(() => instance)
  return { default: { create }, create, AxiosError }
})

import { AuthOAuthManager } from '../../../packages/jssdk/src/oauth/auth'
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

describe('#149 OAuth token refresh sends credentials in the POST body, not the URL', () => {
  beforeEach(() => post.mockReset())

  it('POSTs /oauth/token/ form-urlencoded with the secrets in the body, not in query params', async () => {
    post.mockResolvedValue({
      status: 200,
      data: {
        access_token: 'ACCESS_NEW',
        refresh_token: 'REFRESH_NEW',
        expires: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        client_endpoint: 'https://portal.bitrix24.com/rest/',
        server_endpoint: 'https://oauth.bitrix24.tech/rest/',
        scope: 'app',
        status: 'L'
      }
    })

    const authData = await makeManager().refreshAuth()
    expect(authData.access_token).toBe('ACCESS_NEW')

    expect(post).toHaveBeenCalledTimes(1)
    const [url, bodyArg, config] = post.mock.calls[0] as [string, unknown, any]

    // Clean URL — no query string carrying the secret.
    expect(url).toBe('/oauth/token/')

    // Secrets live in the form-urlencoded request BODY.
    expect(bodyArg).toBeInstanceOf(URLSearchParams)
    const body = bodyArg as URLSearchParams
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('client_id')).toBe('local.app.id')
    expect(body.get('client_secret')).toBe(CLIENT_SECRET)
    expect(body.get('refresh_token')).toBe(REFRESH_TOKEN)

    // Form content-type, and NO `params` (query) — the secrets never touch the URL.
    expect(config?.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(config?.params).toBeUndefined()
    expect(JSON.stringify(config ?? {})).not.toContain(CLIENT_SECRET)
    expect(JSON.stringify(config ?? {})).not.toContain(REFRESH_TOKEN)
  })
})
