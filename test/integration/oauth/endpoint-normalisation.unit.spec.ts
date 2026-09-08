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
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ApiVersion, B24OAuth } from '../../../packages/jssdk/src/'
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
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it('normalises serverEndpoint too, where only the refresh client sees it', () => {
    // The half that was untested, and it showed: this line was silently reverted
    // by a stray edit and the whole `test/integration/oauth/` directory stayed
    // green. `#oAuthTarget` feeds exactly one consumer — the `baseURL` of the
    // token-refresh axios client — and every other spec in this directory mocks
    // `axios.create` wholesale without ever looking at the config it was handed.
    //
    // So the assertion has to be on that argument. Reading the intermediate
    // would prove nothing: the map is not where this value goes.
    const created = vi.spyOn(axios, 'create')

    for (const [given, expected] of [
      ['https://oauth.bitrix.info/rest/', 'https://oauth.bitrix.info'],
      ['https://oauth.bitrix.info/rest', 'https://oauth.bitrix.info'],
      ['https://oauth.bitrix.info/', 'https://oauth.bitrix.info']
    ] as Array<[string, string]>) {
      created.mockClear()
      manager('https://example.bitrix24.com/rest/', given)

      expect(created).toHaveBeenCalled()
      const config = created.mock.calls[0]![0] as { baseURL?: string }
      expect(config.baseURL).toBe(expected)
    }
  })

  it('strips every trailing slash, not just the last one', () => {
    // `/\/$/` and `/\/+$/` are indistinguishable until an input carries two.
    // A portal is unlikely to send `…/rest//`, but a caller assembling the
    // options by hand can, and one slash left behind is the whole bug again.
    const paths = manager('https://example.bitrix24.com/rest//').getTargetOriginWithPath()

    expect(paths.get(ApiVersion.v2)).toBe('https://example.bitrix24.com/rest')
    expect(paths.get(ApiVersion.v3)).toBe('https://example.bitrix24.com/rest/api')
  })

  it('the URL that actually goes out has one slash, on both versions', async () => {
    // The map is an intermediate; the URL is the artefact, and only the URL
    // shows the defect. `_prepareMethod` concatenates the base with a path that
    // already starts with `/`, so a base keeping its trailing slash produced
    // `…/rest//profile` — which nothing here would have seen while asserting on
    // the map alone.
    const b24 = new B24OAuth(
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

    const ok = {
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
      data: {
        result: {},
        time: {
          start: 0, finish: 0, duration: 0, processing: 0,
          date_start: '1970-01-01T00:00:00+00:00',
          date_finish: '1970-01-01T00:00:00+00:00'
        }
      }
    }

    try {
      for (const [version, method, expected] of [
        [ApiVersion.v2, 'profile', 'https://example.bitrix24.com/rest/profile'],
        [ApiVersion.v3, 'main.eventlog.list', 'https://example.bitrix24.com/rest/api/main.eventlog.list']
      ] as Array<[ApiVersion, string, string]>) {
        const post = vi.spyOn(b24.getHttpClient(version).ajaxClient, 'post')
          .mockResolvedValue(ok as never)

        await b24.actions[ApiVersion.v2 === version ? 'v2' : 'v3'].call.make({ method, params: {} } as never)

        const url = String(post.mock.calls[0]![0])
        expect(url.startsWith(expected)).toBe(true)
        // Said twice on purpose: the first assertion would still pass if a
        // second slash appeared somewhere later in the path.
        expect(url).not.toContain('//api')
        expect(url.replace('https://', '')).not.toContain('//')
      }
    } finally {
      b24.destroy()
    }
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
