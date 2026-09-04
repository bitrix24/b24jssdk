/**
 * #64 — `toOAuthParams()` and `handleUninstall()` from recipe 12-oauth-install.ts.
 *
 * `toOAuthParams` maps Bitrix24's all-strings event payload onto the SDK's
 * typed `B24OAuthParams`. Every numeric field goes through `Number()` and the
 * status through a whitelist lookup, so the interesting cases are the ones
 * where the portal sends something unexpected.
 *
 * `handleUninstall` is a security boundary: the endpoint is reachable by
 * anyone, and it deletes stored portal credentials. It is guarded by a
 * constant-time comparison of `application_token` against the value recorded at
 * install. The two branches that must not regress are "no stored credentials →
 * idempotent no-op" and "token mismatch → refuse to delete".
 *
 * No portal, no network, no listening socket — the recipe's store is pointed at
 * a temp file through B24_OAUTH_STORE. jsSdk:unit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const authPayload = (over: Record<string, string> = {}) => ({
  access_token: 'at-1',
  expires: '1893456000',
  expires_in: '3600',
  scope: 'crm,user',
  domain: 'acme.bitrix24.com',
  server_endpoint: 'https://oauth.bitrix.info/rest/',
  status: 'L',
  client_endpoint: 'https://acme.bitrix24.com/rest/',
  member_id: 'member-abc',
  user_id: '7',
  refresh_token: 'rt-1',
  application_token: 'app-token-secret',
  ...over
})

let storeDir: string
let storeFile: string

/** Fresh module with the store pointed at a temp file (STORE_FILE is read at load). */
async function loadRecipe() {
  vi.resetModules()
  process.env.B24_OAUTH_STORE = storeFile
  return await import('../../../skills/b24jssdk-recipes/examples/12-oauth-install')
}

const writeStore = (data: unknown) => writeFileSync(storeFile, JSON.stringify(data), 'utf8')
const readStore = () => JSON.parse(readFileSync(storeFile, 'utf8'))

/** Express-shaped response recording what the handler replied. */
function fakeRes() {
  const state = { code: 0, body: '' }
  const res = {
    status(code: number) {
      state.code = code
      return res
    },
    send(body: string) {
      state.body = body
      return res
    }
  }
  return { res, state }
}

beforeEach(() => {
  storeDir = mkdtempSync(join(tmpdir(), 'b24-oauth-'))
  storeFile = join(storeDir, 'store.json')
})
afterEach(() => {
  rmSync(storeDir, { recursive: true, force: true })
  delete process.env.B24_OAUTH_STORE
})

describe('toOAuthParams (recipe 12)', () => {
  it('maps the snake_case event payload onto the SDK shape', async () => {
    const { toOAuthParams } = await loadRecipe()
    const out = toOAuthParams(authPayload() as never)

    expect(out).toMatchObject({
      applicationToken: 'app-token-secret',
      userId: 7,
      memberId: 'member-abc',
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      expires: 1893456000,
      expiresIn: 3600,
      scope: 'crm,user',
      domain: 'acme.bitrix24.com',
      clientEndpoint: 'https://acme.bitrix24.com/rest/',
      serverEndpoint: 'https://oauth.bitrix.info/rest/'
    })
  })

  it('coerces the numeric fields, which arrive as strings', async () => {
    const { toOAuthParams } = await loadRecipe()
    const out = toOAuthParams(authPayload({ user_id: '42', expires_in: '3600' }) as never)
    expect(out.userId).toBe(42)
    expect(typeof out.userId).toBe('number')
    expect(typeof out.expiresIn).toBe('number')
  })

  it('keeps a recognised status', async () => {
    const { toOAuthParams } = await loadRecipe()
    // 'L' is EnumAppStatus.Local — a real value, so it survives the lookup.
    expect(toOAuthParams(authPayload({ status: 'L' }) as never).status).toBe('L')
    expect(toOAuthParams(authPayload({ status: 'D' }) as never).status).toBe('D')
  })

  it('falls back to Free for an unknown status', async () => {
    const { toOAuthParams } = await loadRecipe()
    // The fallback is what stops an unrecognised portal status from producing
    // an object that fails type expectations downstream.
    expect(toOAuthParams(authPayload({ status: 'ZZZ' }) as never).status).toBe('F')
    expect(toOAuthParams(authPayload({ status: '' }) as never).status).toBe('F')
  })

  it('produces NaN — not 0 — for a missing numeric field', async () => {
    const { toOAuthParams } = await loadRecipe()
    // Documented consequence of `Number(undefined)`. Pinned because NaN is
    // visibly broken downstream, whereas a silent 0 would read as "expired at
    // the epoch" and be much harder to trace back here.
    const out = toOAuthParams({ ...authPayload(), user_id: undefined, expires: undefined } as never)
    expect(out.userId).toBeNaN()
    expect(out.expires).toBeNaN()
  })
})

describe('handleUninstall (recipe 12)', () => {
  const uninstallReq = (over: Record<string, string> = {}) => ({
    body: {
      event: 'ONAPPUNINSTALL',
      auth: { member_id: 'member-abc', application_token: 'app-token-secret', ...over }
    }
  })

  it('always answers 200, so Bitrix24 does not retry for 24h', async () => {
    const { handleUninstall } = await loadRecipe()
    writeStore({})
    const { res, state } = fakeRes()

    await handleUninstall({ body: {} } as never, res as never)

    expect(state.code).toBe(200)
    expect(state.body).toBe('ok')
  })

  it('deletes the credentials when the token matches', async () => {
    const { handleUninstall } = await loadRecipe()
    writeStore({ 'member-abc': { applicationToken: 'app-token-secret', accessToken: 'at-1' } })
    const { res } = fakeRes()

    await handleUninstall(uninstallReq() as never, res as never)

    expect(readStore()).toEqual({})
  })

  it('is idempotent when no credentials are stored for the member', async () => {
    const { handleUninstall } = await loadRecipe()
    writeStore({ 'someone-else': { applicationToken: 'other' } })
    const { res, state } = fakeRes()

    await handleUninstall(uninstallReq({ member_id: 'unknown-member' }) as never, res as never)

    expect(state.code).toBe(200)
    // Nothing removed, and no crash on the missing key.
    expect(readStore()).toEqual({ 'someone-else': { applicationToken: 'other' } })
  })

  it('refuses to delete when the application_token does not match', async () => {
    // The attack this guards: anyone who can reach /uninstall and guess a
    // member_id could otherwise wipe that portal's credentials.
    const { handleUninstall } = await loadRecipe()
    writeStore({ 'member-abc': { applicationToken: 'app-token-secret', accessToken: 'at-1' } })
    const { res, state } = fakeRes()

    await handleUninstall(uninstallReq({ application_token: 'wrong-token' }) as never, res as never)

    expect(state.code).toBe(200)
    expect(readStore()).toEqual({
      'member-abc': { applicationToken: 'app-token-secret', accessToken: 'at-1' }
    })
  })

  it('refuses a token that is a prefix of the real one', async () => {
    // Length mismatch goes through safeEqual's early return; it must be a
    // refusal, not a throw that leaves the handler half-done.
    const { handleUninstall } = await loadRecipe()
    writeStore({ 'member-abc': { applicationToken: 'app-token-secret' } })
    const { res } = fakeRes()

    await handleUninstall(uninstallReq({ application_token: 'app-token' }) as never, res as never)

    expect(readStore()['member-abc']).toBeTruthy()
  })

  it('ignores a payload carrying only one of member_id / token', async () => {
    // The bail is `!memberId || !receivedToken`. With both absent, `||` and
    // `&&` agree, so only an asymmetric payload can tell them apart — and an
    // `&&` here would fall through to the token check with an undefined token.
    const { handleUninstall } = await loadRecipe()
    writeStore({ 'member-abc': { applicationToken: 'app-token-secret' } })

    await handleUninstall(
      { body: { event: 'ONAPPUNINSTALL', auth: { member_id: 'member-abc' } } } as never,
      fakeRes().res as never
    )
    expect(readStore()['member-abc']).toBeTruthy()

    await handleUninstall(
      { body: { event: 'ONAPPUNINSTALL', auth: { application_token: 'app-token-secret' } } } as never,
      fakeRes().res as never
    )
    expect(readStore()['member-abc']).toBeTruthy()
  })

  it('ignores a payload with no member_id or token, without writing the store', async () => {
    const { handleUninstall } = await loadRecipe()
    const { res, state } = fakeRes()

    await handleUninstall({ body: { event: 'ONAPPUNINSTALL', auth: {} } } as never, res as never)

    expect(state.code).toBe(200)
    // Bailed before touching persistence — the file was never created.
    expect(existsSync(storeFile)).toBe(false)
  })
})

/**
 * #389 — `handleInstall` cannot authenticate its caller, so what a forged
 * install can *achieve* is the thing under test.
 *
 * The endpoint accepts any POST by design: `application_token` is issued by
 * this very event, so a first-time handler has nothing to compare against.
 * What it must not do is persist portal URLs that redirect the app's later
 * traffic — that turns a forged install from "corrupt one record" into "read
 * the app's business data and answer for Bitrix24".
 */
describe('handleInstall (recipe 12)', () => {
  const installPayload = (over: Record<string, string> = {}) => ({
    event: 'ONAPPINSTALL',
    data: { VERSION: '1', ACTIVE: '1', LANGUAGE_ID: 'en' },
    ts: '1893456000',
    auth: authPayload(over)
  })

  it('stores the credentials for a plausible payload', async () => {
    writeStore({})
    const { handleInstall } = await loadRecipe()
    const { res, state } = fakeRes()

    await handleInstall({ body: installPayload() } as never, res as never)

    expect(state.code).toBe(200)
    expect(readStore()['member-abc'].accessToken).toBe('at-1')
  })

  it('always answers 200, so Bitrix24 does not retry for 24h', async () => {
    writeStore({})
    const { handleInstall } = await loadRecipe()
    const { res, state } = fakeRes()

    await handleInstall({ body: { event: 'ONAPPINSTALL', auth: {} } } as never, res as never)

    expect(state.code).toBe(200)
  })

  // The attack this closes. Each of these payloads would otherwise be persisted
  // verbatim, and every later `clientForMember()` call for that portal would go
  // to the attacker's host carrying whatever the app sends.
  for (const [name, over] of [
    ['an endpoint on a foreign host', { client_endpoint: 'https://attacker.example/rest/' }],
    // Worse than the client one: the SDK POSTs client_id, client_secret and
    // refresh_token here on every refresh, so a forged server_endpoint leaks
    // the application-wide secret, not just this portal's data.
    ['a server endpoint on a foreign host', { server_endpoint: 'https://attacker.example/rest/' }],
    ['a lookalike domain', { domain: 'evil-bitrix24.com', client_endpoint: 'https://evil-bitrix24.com/rest/', server_endpoint: 'https://evil-bitrix24.com/rest/' }],
    ['a plain-http endpoint', { client_endpoint: 'http://acme.bitrix24.com/rest/' }],
    // Host matches `domain`, so the consistency check passes it — only the
    // credentials check refuses it. Written the other way round (credentials
    // naming the portal, host naming the attacker) the test would pass for the
    // wrong reason, which is how it was written first.
    ['credentials embedded in the URL', { client_endpoint: 'https://user:pass@acme.bitrix24.com/rest/' }],
    ['a plain-http server endpoint', { server_endpoint: 'http://oauth.bitrix.info/rest/' }],
    ['credentials in the server endpoint', { server_endpoint: 'https://user:pass@oauth.bitrix.info/rest/' }],
    ['a domain that is really a URL', { domain: 'https://attacker.example' }],
    // Ends with an allowed suffix, so the allow-list would pass it. Only the
    // hostname-shape check refuses it — which is the point: without a case like
    // this, disabling that check leaves every test green.
    ['a path smuggled into the domain', {
      domain: 'attacker.example/acme.bitrix24.com',
      client_endpoint: 'https://attacker.example/acme.bitrix24.com/rest/'
    }],
    // A bare suffix has an empty leftmost label, so no resolver would answer for
    // it — but `.bitrix24.com`.endsWith(`.bitrix24.com`) is true, so the
    // allow-list alone would accept it.
    ['a domain that is only a suffix', {
      domain: '.bitrix24.com',
      client_endpoint: 'https://.bitrix24.com/rest/'
    }]
  ] as const) {
    it(`refuses ${name}, leaving any existing record intact`, async () => {
      writeStore({ 'member-abc': { applicationToken: 'real-token', accessToken: 'real-at' } })
      const { handleInstall } = await loadRecipe()
      const { res, state } = fakeRes()

      await handleInstall({ body: installPayload(over) } as never, res as never)

      expect(state.code).toBe(200)
      expect(readStore()['member-abc'].accessToken).toBe('real-at')
    })
  }

  it('accepts the shared cloud OAuth server, which is not the portal host', async () => {
    // `server_endpoint` is `oauth.bitrix.info` for every cloud portal. Requiring
    // it to match `domain` would reject every legitimate cloud install — which
    // is exactly what the first version of this check did.
    writeStore({})
    const { handleInstall } = await loadRecipe()
    const { res } = fakeRes()

    await handleInstall({
      body: installPayload({ server_endpoint: 'https://oauth.bitrix24.tech/rest/' })
    } as never, res as never)

    expect(readStore()['member-abc'].accessToken).toBe('at-1')
  })

  it('accepts a self-hosted portal once its host is allow-listed', async () => {
    // The check would otherwise reject every on-premise install, since a boxed
    // portal lives at whatever domain its owner chose.
    writeStore({})
    process.env.B24_ALLOWED_PORTAL_HOSTS = 'intranet.example.com'
    try {
      const { handleInstall } = await loadRecipe()
      const { res } = fakeRes()

      await handleInstall({
        body: installPayload({
          domain: 'intranet.example.com',
          client_endpoint: 'https://intranet.example.com/rest/',
          server_endpoint: 'https://intranet.example.com/rest/'
        })
      } as never, res as never)

      expect(readStore()['member-abc'].accessToken).toBe('at-1')
    } finally {
      delete process.env.B24_ALLOWED_PORTAL_HOSTS
    }
  })

  it('refuses an OAuth server that is neither the portal nor on the list', async () => {
    // `B24_ALLOWED_OAUTH_HOSTS` had no coverage at all, so nothing pinned that
    // narrowing it actually narrows anything.
    writeStore({})
    process.env.B24_ALLOWED_OAUTH_HOSTS = 'oauth.bitrix.info'
    try {
      const { handleInstall } = await loadRecipe()
      const { res } = fakeRes()

      await handleInstall({
        body: installPayload({ server_endpoint: 'https://oauth.bitrix24.tech/rest/' })
      } as never, res as never)

      expect(readStore()).toEqual({})
    } finally {
      delete process.env.B24_ALLOWED_OAUTH_HOSTS
    }
  })

  it('refuses an allow-list that lists no hosts, rather than refusing everything quietly', async () => {
    // `,` is non-empty but parses to nothing. Silently allowing nothing is an
    // outage that looks like the portal has gone quiet.
    writeStore({})
    process.env.B24_ALLOWED_PORTAL_HOSTS = ','
    try {
      const { handleInstall } = await loadRecipe()
      const { res } = fakeRes()

      await expect(
        handleInstall({ body: installPayload() } as never, res as never)
      ).rejects.toThrow(/lists no hosts/)
    } finally {
      delete process.env.B24_ALLOWED_PORTAL_HOSTS
    }
  })

  it('refuses a suffix broad enough to re-open the hole', async () => {
    writeStore({})
    process.env.B24_ALLOWED_PORTAL_HOSTS = '.com'
    try {
      const { handleInstall } = await loadRecipe()
      const { res } = fakeRes()

      await expect(
        handleInstall({ body: installPayload() } as never, res as never)
      ).rejects.toThrow(/too broad/)
    } finally {
      delete process.env.B24_ALLOWED_PORTAL_HOSTS
    }
  })

  it('still refuses a foreign host when an allow-list is configured', async () => {
    writeStore({})
    process.env.B24_ALLOWED_PORTAL_HOSTS = 'intranet.example.com'
    try {
      const { handleInstall } = await loadRecipe()
      const { res } = fakeRes()

      await handleInstall({ body: installPayload() } as never, res as never)

      expect(readStore()).toEqual({})
    } finally {
      delete process.env.B24_ALLOWED_PORTAL_HOSTS
    }
  })
})

/**
 * `checkPortalUrls` directly, asserting *which* check refused.
 *
 * Driving it through `handleInstall` cannot do this. The layers overlap on
 * purpose — a malformed `domain` that still ends with an allowed suffix also
 * fails the `client_endpoint === domain` comparison, so disabling either shape
 * check alone leaves every black-box test green. That is defence in depth
 * working, and it is also why two tests here were vacuous before this block
 * existed. Asserting the reason string is what tells the layers apart.
 */
describe('checkPortalUrls (recipe 12)', () => {
  const auth = (over: Record<string, string> = {}) => ({
    domain: 'acme.bitrix24.com',
    client_endpoint: 'https://acme.bitrix24.com/rest/',
    server_endpoint: 'https://oauth.bitrix.info/rest/',
    ...over
  })

  it('accepts a normal cloud payload', async () => {
    const { checkPortalUrls } = await import('../../../skills/b24jssdk-recipes/lib/portal-url')
    expect(checkPortalUrls(auth())).toBeNull()
  })

  it('accepts a cloud portal that names itself as its own token server', async () => {
    const { checkPortalUrls } = await import('../../../skills/b24jssdk-recipes/lib/portal-url')
    expect(checkPortalUrls(auth({ server_endpoint: 'https://acme.bitrix24.com/rest/' }))).toBeNull()
  })

  it('is not fooled by case', async () => {
    const { checkPortalUrls } = await import('../../../skills/b24jssdk-recipes/lib/portal-url')
    expect(checkPortalUrls(auth({
      domain: 'ACME.BITRIX24.COM',
      client_endpoint: 'https://ACME.BITRIX24.COM/rest/'
    }))).toBeNull()
  })

  // Each of these ends with an allowed suffix, so the allow-list would pass it.
  // The reason string proves the shape check is what refuses it.
  for (const [name, domain] of [
    ['a path smuggled in', 'attacker.example/acme.bitrix24.com'],
    ['a bare suffix with no leftmost label', '.bitrix24.com'],
    ['an empty label in the middle', 'acme..bitrix24.com'],
    ['a port', 'acme.bitrix24.com:8443'],
    ['whitespace', 'acme .bitrix24.com'],
    // A single label is a host on a local network, never a portal. It is also
    // the only case the "at least two labels" clause uniquely catches — without
    // it the allow-list refuses this, but for a different reason.
    ['a single label', 'localhost']
  ] as const) {
    it(`refuses ${name} on shape, not on the allow-list`, async () => {
      const { checkPortalUrls } = await import('../../../skills/b24jssdk-recipes/lib/portal-url')
      expect(checkPortalUrls(auth({ domain }))).toBe('domain is not a plausible host')
    })
  }

  it('refuses an endpoint whose host is not a plausible host', async () => {
    const { checkPortalUrls } = await import('../../../skills/b24jssdk-recipes/lib/portal-url')
    // An IPv6 literal parses, and `hostname` keeps the brackets. A portal is
    // never one, and letting it through would compare bracketed text to a name.
    expect(checkPortalUrls(auth({ client_endpoint: 'https://[::1]/rest/' })))
      .toBe('client_endpoint is not an https URL without credentials')
  })

  it('names the domain check before the endpoint checks', async () => {
    // Order matters for the log: a payload wrong in several ways should report
    // the first thing wrong with it, not the last.
    const { checkPortalUrls } = await import('../../../skills/b24jssdk-recipes/lib/portal-url')
    expect(checkPortalUrls({
      domain: 'attacker.example',
      client_endpoint: 'http://attacker.example/rest/',
      server_endpoint: 'http://attacker.example/rest/'
    })).toMatch(/^domain host is not allowed/)
  })
})
