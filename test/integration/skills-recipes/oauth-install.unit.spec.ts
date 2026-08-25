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
