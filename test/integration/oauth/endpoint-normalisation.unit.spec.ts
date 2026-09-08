/**
 * The portal sends `client_endpoint` **with** a trailing slash —
 * `https://<portal>/rest/` — and every consumer appends its own separator, so
 * the slash survived into the request URL twice: `…/rest//profile` on
 * `restApi:v2`, `…/rest//api/batch` on v3.
 *
 * Measured against a live portal, both spellings answer identically, so nothing
 * was broken by it. It is still worth not emitting: the URL reaches access logs,
 * proxy and WAF path rules, and anything a caller matches on.
 *
 * The second half is the one that could bite. `getTargetOrigin()` took the REST
 * root off with `replace('/rest/', '')`, which matches only the trailing-slash
 * spelling — so an endpoint arriving without one would have yielded
 * `https://<portal>/rest` where the caller asked for the portal.
 *
 * `*.unit.spec.ts` — no real Bitrix24 portal required.
 */
import { describe, it, expect } from 'vitest'
import { ApiVersion } from '../../../packages/jssdk/src/'
import { AuthOAuthManager } from '../../../packages/jssdk/src/oauth/auth'

function manager(clientEndpoint: string, serverEndpoint = 'https://oauth.bitrix.info/rest/'): AuthOAuthManager {
  return new AuthOAuthManager(
    {
      accessToken: 'ACCESS_TOKEN_PLACEHOLDER',
      refreshToken: 'REFRESH_TOKEN_PLACEHOLDER',
      expires: 2_000_000_000,
      expiresIn: 3600,
      domain: 'example.bitrix24.com',
      memberId: 'member',
      clientEndpoint,
      serverEndpoint,
      status: 'L'
    } as never,
    { clientId: 'local.test', clientSecret: 'secret' } as never
  )
}

describe('the OAuth endpoints are normalised once, not at each use', () => {
  // The shape the portal actually sends.
  it('a trailing slash does not survive into the version map', () => {
    const paths = manager('https://example.bitrix24.com/rest/').getTargetOriginWithPath()

    expect(paths.get(ApiVersion.v2)).toBe('https://example.bitrix24.com/rest')
    expect(paths.get(ApiVersion.v3)).toBe('https://example.bitrix24.com/rest/api')
    // The failure this pins, spelled out: a base that keeps the slash makes
    // `_prepareMethod` emit `…/rest//profile` and `…/rest//api/batch`.
    expect(paths.get(ApiVersion.v2)).not.toContain('//rest')
    expect(paths.get(ApiVersion.v3)).not.toContain('rest//')
  })

  it('an endpoint without the trailing slash gives the same answer', () => {
    const paths = manager('https://example.bitrix24.com/rest').getTargetOriginWithPath()

    expect(paths.get(ApiVersion.v2)).toBe('https://example.bitrix24.com/rest')
    expect(paths.get(ApiVersion.v3)).toBe('https://example.bitrix24.com/rest/api')
  })

  it('getTargetOrigin returns the portal for both spellings', () => {
    // The one that was actually wrong rather than merely untidy: the old
    // `replace('/rest/', '')` left `https://…/rest` when the input had no
    // trailing slash, handing back the REST root as the portal origin.
    expect(manager('https://example.bitrix24.com/rest/').getTargetOrigin())
      .toBe('https://example.bitrix24.com')
    expect(manager('https://example.bitrix24.com/rest').getTargetOrigin())
      .toBe('https://example.bitrix24.com')
  })

  it('does not eat a portal whose own name contains rest', () => {
    // Anchored, so only the REST root at the end goes. A portal called
    // `rest-team` keeps its name.
    const paths = manager('https://rest-team.bitrix24.com/rest/').getTargetOriginWithPath()

    expect(paths.get(ApiVersion.v3)).toBe('https://rest-team.bitrix24.com/rest/api')
    expect(manager('https://rest-team.bitrix24.com/rest/').getTargetOrigin())
      .toBe('https://rest-team.bitrix24.com')
  })
})
