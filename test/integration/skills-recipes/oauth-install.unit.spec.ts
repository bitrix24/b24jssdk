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
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
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

// ── #454: member_id is an object key ────────────────────────────────────────

describe('a member_id that collides with Object.prototype (recipe 12, #454)', () => {
  // Every property on `Object.prototype`, not a hand-picked three. A denylist
  // of the famous names is the wrong shape of fix, and a test that only tries
  // the famous names cannot tell a real fix from one.
  const INHERITED = Object.getOwnPropertyNames(Object.prototype)

  // `__proto__` is the only one that breaks the WRITE path: it is an accessor,
  // so assignment reassigns the prototype and stores nothing. The other eleven
  // are writable data properties, so `store[id] = creds` shadows them and
  // round-trips even on the unfixed code. Keeping them in the storage tables
  // would be ballast that passes with the fix deleted — they belong in the
  // lookup tests, where they genuinely differ.
  const WRITE_HAZARD = '__proto__'

  const installPayload = (memberId: string) => ({
    event: 'ONAPPINSTALL',
    data: { VERSION: '1', ACTIVE: '1', LANGUAGE_ID: 'en' },
    ts: '1893456000',
    auth: authPayload({ member_id: memberId })
  })

  const uninstallReq = (memberId: string, token = 'app-token-secret') => ({
    body: { event: 'ONAPPUNINSTALL', auth: { member_id: memberId, application_token: token } }
  })

  it('sanity: every inherited name is truthy on a plain object, which is the bug', () => {
    // Pins the premise rather than trusting it. If a future V8 changes what
    // lives on Object.prototype, this says so before the rest looks pointless.
    const plain = JSON.parse('{}')
    for (const name of INHERITED) {
      expect(Boolean(plain[name] ?? null), `${name} should be truthy on a plain object`).toBe(true)
    }
    expect(INHERITED).toContain('__proto__')
    expect(INHERITED.length).toBeGreaterThan(3)
  })

  it(`stores and reads back an install for member_id=${WRITE_HAZARD}`, async () => {
    // Before the fix this reassigned the store's prototype instead of adding a
    // property, so `JSON.stringify` emitted `{}`: the install answered 200 and
    // persisted nothing, and the next lookup said "install the app first".
    writeStore({})
    const { handleInstall } = await loadRecipe()
    const { res, state } = fakeRes()

    await handleInstall({ body: installPayload(WRITE_HAZARD) } as never, res as never)

    expect(state.code).toBe(200)
    const onDisk = readStore()
    expect(Object.hasOwn(onDisk, WRITE_HAZARD)).toBe(true)
    expect(onDisk[WRITE_HAZARD].accessToken).toBe('at-1')
  })

  it(`stores member_id=${WRITE_HAZARD} on the very first install, with no store file yet`, async () => {
    // `loadStore` has two ways to produce an empty store — an empty file, and
    // the missing-file branch — and only the second is what a real deployment
    // hits first. Every other test writes the file.
    rmSync(storeFile, { force: true })
    expect(existsSync(storeFile)).toBe(false)

    const { handleInstall } = await loadRecipe()
    const { res } = fakeRes()

    await handleInstall({ body: installPayload(WRITE_HAZARD) } as never, res as never)

    expect(readStore()[WRITE_HAZARD].accessToken).toBe('at-1')
  })

  it('installs another portal without losing a stored __proto__ record', async () => {
    // The read-modify-write cycle: load a store that already holds the hazard,
    // add someone else, save. This is the path a deployment upgraded from an
    // older version takes, and the one where a plain-object copy loses the
    // record without anyone noticing.
    writeStore({ [WRITE_HAZARD]: { applicationToken: 'p', accessToken: 'proto-secret' } })
    const { handleInstall } = await loadRecipe()
    const { res } = fakeRes()

    await handleInstall({ body: installPayload('member-other') } as never, res as never)

    const onDisk = readStore()
    expect(onDisk[WRITE_HAZARD].accessToken).toBe('proto-secret')
    expect(onDisk['member-other'].accessToken).toBe('at-1')
  })

  it('uninstalling one portal does not take a stored __proto__ record with it', async () => {
    // The assertion `deleteCredentials`' comment stands on. Copying the store
    // key by key into a `{}` — an entirely reasonable-looking refactor — sends
    // the `__proto__` record through the prototype setter and writes `{}`:
    // removing one portal silently destroys another's credentials.
    writeStore({
      [WRITE_HAZARD]: { applicationToken: 'p', accessToken: 'proto-secret' },
      'member-other': { applicationToken: 'app-token-secret', accessToken: 'keep' }
    })
    const { handleUninstall } = await loadRecipe()
    const { res, state } = fakeRes()

    await handleUninstall(uninstallReq('member-other') as never, res as never)

    expect(state.code).toBe(200)
    const onDisk = readStore()
    expect(Object.hasOwn(onDisk, 'member-other')).toBe(false)
    expect(Object.hasOwn(onDisk, WRITE_HAZARD)).toBe(true)
    expect(onDisk[WRITE_HAZARD].accessToken).toBe('proto-secret')
  })

  it.each(INHERITED)('uninstalls member_id=%s like any other portal', async (memberId) => {
    writeStore({
      [memberId]: { applicationToken: 'app-token-secret', accessToken: 'at-1' },
      'member-other': { applicationToken: 'other', accessToken: 'keep-me' }
    })
    const { handleUninstall } = await loadRecipe()
    const { res } = fakeRes()

    await handleUninstall(uninstallReq(memberId) as never, res as never)

    const onDisk = readStore()
    expect(Object.hasOwn(onDisk, memberId)).toBe(false)
    expect(onDisk['member-other'].accessToken).toBe('keep-me')
  })

  it.each(INHERITED)('refuses to delete member_id=%s on a token mismatch', async (memberId) => {
    writeStore({ [memberId]: { applicationToken: 'app-token-secret' } })
    const { handleUninstall } = await loadRecipe()
    const { res } = fakeRes()

    await handleUninstall(uninstallReq(memberId, 'wrong-token') as never, res as never)

    expect(readStore()[memberId].applicationToken).toBe('app-token-secret')
  })

  // ── the read path, where all twelve differ ──────────────────────────────

  it.each(INHERITED)('getCredentials returns null for %s when nothing is stored', async (memberId) => {
    // Pins the normalisation `clientForMember`'s guard depends on. Without it,
    // a lookup returns an inherited FUNCTION — truthy — and the guard is
    // bypassed. Asserted here as well as through the guard so that a refactor
    // of either one cannot quietly reopen the other.
    writeStore({})
    const { getCredentials } = await loadRecipe()

    await expect(getCredentials(memberId)).resolves.toBeNull()
  })

  it.each([...INHERITED, 'never-installed'])(
    'clientForMember reports a missing install for %s',
    async (memberId) => {
      // Before the fix the caller got `TypeError: Cannot read properties of
      // undefined (reading 'replaceAll')` from inside the SDK instead of the
      // message written for exactly this case.
      writeStore({})
      const { clientForMember } = await loadRecipe()

      await expect(clientForMember(memberId)).rejects.toThrow(
        `No credentials stored for member ${memberId}. Install the app first.`
      )
    }
  )

  it.each(INHERITED)('getCredentials returns the record for %s once installed', async (memberId) => {
    writeStore({ [memberId]: { applicationToken: 'app-token-secret', accessToken: 'at-1' } })
    const { getCredentials } = await loadRecipe()

    const creds = await getCredentials(memberId)
    expect(creds?.accessToken).toBe('at-1')
  })
})

// ── #454 (cont.): the store file itself ─────────────────────────────────────

describe('a store file that cannot be read as a store (recipe 12, #454)', () => {
  it('refuses valid JSON that is not an object, rather than building a pseudo-store', async () => {
    // `Object.assign(Object.create(null), "hello")` yields {"0":"h","1":"e",…},
    // which the next save would write back over the real file.
    writeFileSync(storeFile, '"hello"', 'utf8')
    const { getCredentials } = await loadRecipe()

    await expect(getCredentials('member-abc')).rejects.toThrow(/not a JSON object/)
  })

  it.each(['123', 'true', 'null', '[{"a":1}]'])('refuses a store file containing %s', async (body) => {
    writeFileSync(storeFile, body, 'utf8')
    const { getCredentials } = await loadRecipe()

    await expect(getCredentials('member-abc')).rejects.toThrow(/not a JSON object/)
  })

  it('refuses a store path that cannot be read at all, rather than reading it as empty', async () => {
    // A directory where the file should be stands in for the whole class —
    // EACCES, EISDIR, a bad mount. Only ENOENT means "no store yet"; treating
    // the rest the same way is how the next save overwrites a store that was
    // simply unreachable for a moment.
    rmSync(storeFile, { force: true })
    mkdirSync(storeFile, { recursive: true })
    const { getCredentials } = await loadRecipe()

    await expect(getCredentials('member-abc')).rejects.toThrow(/EISDIR|EACCES|illegal operation/i)
  })

  it('does not silently empty the store when the file is corrupt', async () => {
    // The data-loss path: a bare `catch` reads unparseable JSON as "no store
    // yet", and the next install overwrites every portal's credentials with a
    // single record.
    writeFileSync(storeFile, '{"member-abc": {"accessToken": "at-1"', 'utf8')
    const { handleInstall } = await loadRecipe()
    const { res, state } = fakeRes()

    // It fails loudly. The route registration wraps the handler in `.catch`
    // and logs, so the operator sees the corrupt file named — which is the
    // point: the alternative was reading it as "no store yet" and overwriting
    // every portal's credentials with this one record.
    await expect(handleInstall({
      body: {
        event: 'ONAPPINSTALL',
        data: { VERSION: '1', ACTIVE: '1', LANGUAGE_ID: 'en' },
        ts: '1893456000',
        auth: authPayload({ member_id: 'member-new' })
      }
    } as never, res as never)).rejects.toThrow(SyntaxError)

    // Bitrix24 still got its 200 before the failure, so it will not retry.
    expect(state.code).toBe(200)
    // And the file is exactly as it was.
    expect(readFileSync(storeFile, 'utf8')).toBe('{"member-abc": {"accessToken": "at-1"')
  })
})

// ── #454 (cont.): member_id is also a log line ──────────────────────────────

describe('an implausible member_id is refused at the boundary (recipe 12, #454)', () => {
  const install = (memberId: string) => ({
    body: {
      event: 'ONAPPINSTALL',
      data: { VERSION: '1', ACTIVE: '1', LANGUAGE_ID: 'en' },
      ts: '1893456000',
      auth: authPayload({ member_id: memberId })
    }
  })

  it.each([
    ['a newline, which forges a second log line', 'aaa\n[ONAPPINSTALL] member=victim-portal'],
    ['a carriage return', 'aaa\r[ONAPPINSTALL] member=victim'],
    ['an ANSI escape', `aaa${String.fromCharCode(27)}[31m`],
    ['a tab', 'aaa\tbbb'],
    ['a path separator', '../../etc/passwd'],
    ['a colon, which collides in a Redis keyspace', 'portal:admin'],
    ['65 characters', 'a'.repeat(65)]
  ])('refuses %s', async (_label, memberId) => {
    writeStore({})
    const { handleInstall } = await loadRecipe()
    const { res, state } = fakeRes()

    await handleInstall(install(memberId) as never, res as never)

    // Still 200 — Bitrix24 must not retry for 24h — but nothing is stored.
    expect(state.code).toBe(200)
    expect(readStore()).toEqual({})
  })

  it.each([
    ['the id shape the SDK documents', '3xx2030386cyy1b'],
    ['the fixture id used across this suite', 'member-abc'],
    ['64 characters', 'a'.repeat(64)],
    ['a prototype name, which the STORE handles rather than this check', '__proto__']
  ])('accepts %s', async (_label, memberId) => {
    writeStore({})
    const { handleInstall } = await loadRecipe()
    const { res } = fakeRes()

    await handleInstall(install(memberId) as never, res as never)

    expect(readStore()[memberId].accessToken).toBe('at-1')
  })
})
