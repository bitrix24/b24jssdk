/**
 * Regression: a `restApi:v3` batch must go out as a **bare JSON array**, and the
 * OAuth credential must not be one of its elements.
 *
 * On v3 the commands are the request body — there is no `{ halt, cmd }` envelope
 * to wrap them in. `_prepareParams` used to spread that array into an object
 * (`{ '0': …, '1': … }`) and, for any non-hook transport, add the access token as
 * one more top-level entry:
 *
 *   B24Hook   {"0":{…},"1":{…}}
 *   B24OAuth  {"0":{…},"1":{…},"auth":"<token>"}
 *
 * The portal iterates every top-level entry of a batch body and requires
 * `method` and `query` on each, so the `auth` entry rejected the whole batch with
 * `INVALIDSELECTEXCEPTION` before a single command ran — measured in the portal's
 * own `BatchRequest` constructor. The numeric-key form survived only because PHP
 * cannot tell a list from a map with sequential integer keys.
 *
 * On a server the token now travels in `Authorization: Bearer`, which the portal
 * accepts and prefers over any body or query parameter. The header is merged into
 * the per-request config rather than replacing it, so a caller's own
 * `Idempotency-Key` survives alongside it.
 *
 * In a **browser** it cannot: the portal answers the CORS preflight with
 * `Access-Control-Allow-Headers: origin, content-type, accept`
 * (`CRestUtil::sendHeaders()`), so asking for `Authorization` would fail the
 * preflight and the request would never leave. A browser transport is therefore
 * left on the old path — still rejected by the portal, but rejected visibly with
 * a 400 rather than blocked by the browser with an opaque network error.
 *
 * `*.unit.spec.ts` — no real Bitrix24 portal required (axios is mocked).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion, B24Hook } from '../../../packages/jssdk/src/'
import { B24OAuth } from '../../../packages/jssdk/src/oauth/b24'

const COMMANDS = [
  { method: 'main.eventlog.list', params: { select: ['id'] } },
  { method: 'rest.scope.list', params: {} }
]

/**
 * Two successful command results, so the batch parser has something to fold.
 * On v3 `result` is the per-command array directly — no `result_error` /
 * `result_time` split as in v2.
 */
const BATCH_OK = {
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as never,
  data: {
    result: [{ items: [] }, { items: [] }],
    time: {
      start: 0, finish: 0, duration: 0, processing: 0,
      date_start: '1970-01-01T00:00:00+00:00',
      date_finish: '1970-01-01T00:00:00+00:00'
    }
  }
}

function oauthClient(): B24OAuth {
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

describe('the body of a v3 batch', () => {
  let b24: B24Hook | B24OAuth | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  it('@apiV3 is a bare array on a hook, with no credential in it', async () => {
    b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET')
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(BATCH_OK as never)

    await b24.actions.v3.batch.make({ calls: COMMANDS })

    const [, body, config] = post.mock.calls[0]!
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(2)
    expect(body).not.toHaveProperty('auth')
    // A webhook authenticates through the URL; nothing to put in a header.
    expect(config).toBeUndefined()
  })

  it('@apiV3 keeps the OAuth token out of the array and sends it as a header', async () => {
    b24 = oauthClient()
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(BATCH_OK as never)

    await b24.actions.v3.batch.make({ calls: COMMANDS })

    const [, body, config] = post.mock.calls[0]!
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(2)
    // The regression itself: `auth` used to be a third element the portal read as
    // a command with no `method`.
    expect(body).not.toHaveProperty('auth')
    expect(JSON.stringify(body)).not.toContain('ACCESS_TOKEN_PLACEHOLDER')

    expect((config as { headers: Record<string, string> })?.headers?.Authorization)
      .toBe('Bearer ACCESS_TOKEN_PLACEHOLDER')
  })

  it('@apiV3 every element still carries method and query', async () => {
    b24 = oauthClient()
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(BATCH_OK as never)

    await b24.actions.v3.batch.make({ calls: COMMANDS })

    const body = post.mock.calls[0]![1] as Array<Record<string, unknown>>
    // Without this the loop runs zero assertions on an empty array and passes.
    expect(body).toHaveLength(2)
    // What the portal's BatchRequest constructor demands of every top-level entry.
    for (const item of body) {
      expect(item).toHaveProperty('method')
      expect(item).toHaveProperty('query')
    }
  })

  it('@apiV3 a single call is untouched — object body, token still inside it', async () => {
    b24 = oauthClient()
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as never,
        data: { result: { items: [] }, time: BATCH_OK.data.time }
      } as never)

    await b24.actions.v3.call.make({ method: 'main.eventlog.list', params: { select: ['id'] } })

    const [, body, config] = post.mock.calls[0]!
    expect(Array.isArray(body)).toBe(false)
    // Deliberately unchanged: the body form works for every non-batch call, and
    // moving it too would be an untestable change to how every OAuth request
    // authenticates.
    expect((body as { auth?: string }).auth).toBe('ACCESS_TOKEN_PLACEHOLDER')
    expect(config).toBeUndefined()
  })

  it('@apiV3 a browser sends the array and puts the token in the query string', async () => {
    // The portal's CORS allow-list has no `authorization`, so the header would
    // fail the preflight and the request would never leave. The credential goes
    // in the query string instead, which the portal reads through the same
    // dictionary (`CRestUtil::getRequestData()` merges GET over POST). Simulated
    // by making `getEnvironment()` report a browser — this project runs spec
    // files serially for exactly this kind of global mutation.
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = { document: {} }

    try {
      b24 = oauthClient()
      const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
        .mockResolvedValue(BATCH_OK as never)

      await b24.actions.v3.batch.make({ calls: COMMANDS })

      const [url, body, config] = post.mock.calls[0]!
      // No header, and therefore no preflight to fail.
      expect((config as { headers?: Record<string, string> })?.headers?.Authorization).toBeUndefined()
      // The body is the array here too — the whole point is that the portal can
      // parse it, which it cannot do while a credential sits inside.
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(2)
      expect(JSON.stringify(body)).not.toContain('ACCESS_TOKEN_PLACEHOLDER')
      // And the commands survive. Without this, a body replaced wholesale by
      // something shaped right but empty passed every other assertion here.
      const asList = body as Array<{ method?: string }>
      expect(asList[0]?.method).toBe('main.eventlog.list')
      expect(asList[1]?.method).toBe('rest.scope.list')
      // The credential, in the one place a browser can put it.
      expect(String(url)).toContain('auth=ACCESS_TOKEN_PLACEHOLDER')
    } finally {
      if (typeof originalWindow === 'undefined') {
        delete (globalThis as { window?: unknown }).window
      } else {
        ;(globalThis as { window?: unknown }).window = originalWindow
      }
    }
  })

  it('@apiV3 the query credential is url-encoded, and appended not substituted', async () => {
    // Two failures one character apart. A token with a `+` or `/` in it — both
    // ordinary in a Bitrix24 token — decodes wrong if it is not encoded, and the
    // portal answers an authentication error naming neither. And appending with
    // the wrong separator would swallow the telemetry params that `_prepareMethod`
    // already put there, which is how request tracing quietly stops working.
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = { document: {} }

    try {
      b24 = new B24OAuth(
        {
          accessToken: 'a+b/c=d',
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
      const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
        .mockResolvedValue(BATCH_OK as never)

      await b24.actions.v3.batch.make({ calls: COMMANDS })

      const url = String(post.mock.calls[0]![0])
      expect(url).toContain('auth=a%2Bb%2Fc%3Dd')
      expect(url).not.toContain('auth=a+b/c=d')
      // The telemetry params `_prepareMethod` emits are still there.
      expect(url).toContain('bx24_request_id=')
      expect(url).toContain('&auth=')
    } finally {
      if (typeof originalWindow === 'undefined') {
        delete (globalThis as { window?: unknown }).window
      } else {
        ;(globalThis as { window?: unknown }).window = originalWindow
      }
    }
  })

  it('@apiV3 the query branch refuses to follow a redirect too', async () => {
    // Weaker than the header case and still worth having. A query credential
    // does not follow a redirect the way a header does — the target is whatever
    // `Location` names, and it carries the original query only if the server
    // echoes it back — but an nginx or Apache rule built from `$request_uri`
    // does exactly that, and the hop then hands the token to whatever serves
    // the target.
    //
    // Whether the option bites depends on the adapter rather than on "is this a
    // browser": XHR ignores `maxRedirects`, and a service worker — which has no
    // `XMLHttpRequest` — resolves the default adapter list to `fetch`, which
    // reads it as `redirect: 'manual'`. Inert on the common path, load-bearing
    // on that one.
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = { document: {} }

    try {
      b24 = oauthClient()
      const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
        .mockResolvedValue(BATCH_OK as never)

      await b24.actions.v3.batch.make({ calls: COMMANDS })

      const config = post.mock.calls[0]![2] as { maxRedirects?: number, headers?: Record<string, string> }
      expect(config?.maxRedirects).toBe(0)
      // And still no header — this is the branch that exists because one cannot
      // be sent.
      expect(config?.headers?.['Authorization']).toBeUndefined()
    } finally {
      if (typeof originalWindow === 'undefined') {
        delete (globalThis as { window?: unknown }).window
      } else {
        ;(globalThis as { window?: unknown }).window = originalWindow
      }
    }
  })

  it('@apiV3 a browser with no usable token appends nothing', async () => {
    // The `hasAccessToken` term of the query gate, which nothing distinguished:
    // the existing empty-token test never sets `window`, so it only ever runs the
    // header branch, and dropping the term from `useQueryAuth` passed the whole
    // file. Without it a browser with no token appends a bare `?auth=` — a
    // request that fails for a reason naming neither the token nor the header,
    // where the body fallback at least fails the way this transport already does.
    for (const token of ['', '   ']) {
      const originalWindow = (globalThis as { window?: unknown }).window
      ;(globalThis as { window?: unknown }).window = { document: {} }

      try {
        b24 = new B24OAuth(
          {
            accessToken: token,
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
        const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
          .mockResolvedValue(BATCH_OK as never)

        await b24.actions.v3.batch.make({ calls: COMMANDS })

        const [url, body] = post.mock.calls[0]!
        expect(String(url)).not.toContain('auth=')
        // And the fallback is the old body, not a headerless bare array the
        // portal would refuse for an unrelated reason.
        expect(Array.isArray(body)).toBe(false)
      } finally {
        b24?.destroy()
        b24 = null
        if (typeof originalWindow === 'undefined') {
          delete (globalThis as { window?: unknown }).window
        } else {
          ;(globalThis as { window?: unknown }).window = originalWindow
        }
      }
    }
  })

  it('@apiV3 a non-batch v3 call in a browser gets no query credential', async () => {
    // The query branch carries the same gate as the header branch. A single call
    // still authenticates through `auth` in its body, where it always did — a
    // token appended to that URL would be a second copy of the credential, in a
    // place the SDK does not otherwise put one, for no gain.
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = { document: {} }

    try {
      b24 = oauthClient()
      const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
        .mockResolvedValue({
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as never,
          data: { result: { items: [] }, time: BATCH_OK.data.time }
        } as never)

      await b24.actions.v3.call.make({ method: 'main.eventlog.list', params: { select: ['id'] } })

      const [url, body] = post.mock.calls[0]!
      expect(String(url)).not.toContain('auth=')
      expect((body as { auth?: string }).auth).toBe('ACCESS_TOKEN_PLACEHOLDER')
    } finally {
      if (typeof originalWindow === 'undefined') {
        delete (globalThis as { window?: unknown }).window
      } else {
        ;(globalThis as { window?: unknown }).window = originalWindow
      }
    }
  })

  it('@apiV3 a call with an idempotency key keeps its header untouched', async () => {
    // The `else` branch: an object body never gets an Authorization header, and
    // the caller's own config reaches axios unchanged.
    b24 = oauthClient()
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as never,
        data: { result: { items: [] }, time: BATCH_OK.data.time }
      } as never)

    await b24.actions.v3.call.make({
      method: 'main.eventlog.list',
      params: { select: ['id'] },
      idempotencyKey: 'key-42'
    })

    const headers = (post.mock.calls[0]![2] as { headers?: Record<string, string> })?.headers
    expect(headers?.['Idempotency-Key']).toBe('key-42')
    expect(headers?.Authorization).toBeUndefined()
  })

  it('@apiV3 merges Authorization into the caller config rather than replacing it', async () => {
    // The merge branch, exercised as a merge. `actions.v3.batch.make` passes no
    // options, so through it `requestConfig` is always `undefined` and
    // `{ ...undefined, headers: { ...undefined, Authorization } }` is
    // indistinguishable from an assignment — which is why the test above, on a
    // non-batch call, proved nothing about it. `call()` is public and reaches the
    // same branch carrying a real config.
    b24 = oauthClient()
    const http = b24.getHttpClient(ApiVersion.v3)
    const post = vi.spyOn(http.ajaxClient, 'post').mockResolvedValue(BATCH_OK as never)

    await http.call('batch', COMMANDS as never, 'probe-request-id', { idempotencyKey: 'key-42' })

    const headers = (post.mock.calls[0]![2] as { headers?: Record<string, string> })?.headers
    expect(headers?.Authorization).toBe('Bearer ACCESS_TOKEN_PLACEHOLDER')
    // Dropped by a merge written as an assignment: a retried batch write would
    // lose its deduplication guarantee silently.
    expect(headers?.['Idempotency-Key']).toBe('key-42')
  })

  it('@apiV3 refuses to follow a redirect while carrying the token', async () => {
    // A credential in the body was safe across a redirect by accident: a 301/302
    // turns POST into GET and drops the body, so the old `auth` never travelled.
    // A header does travel — `follow-redirects` keeps `Authorization` for the
    // same host and for a subdomain — so the hop is refused instead.
    //
    // Only on this branch: it is the one the header rides on, and it fails on
    // every portal today, so there is no working redirect behaviour to lose.
    b24 = oauthClient()
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(BATCH_OK as never)

    await b24.actions.v3.batch.make({ calls: COMMANDS })

    const config = post.mock.calls[0]![2] as { maxRedirects?: number, headers?: Record<string, string> }
    expect(config?.maxRedirects).toBe(0)
    expect(config?.headers?.Authorization).toBe('Bearer ACCESS_TOKEN_PLACEHOLDER')
  })

  it('@apiV3 leaves redirects alone on every other request', async () => {
    // The instance carries every request the SDK makes, and a redirect somewhere
    // in that traffic may be load-bearing for someone. Nothing outside the
    // header-carrying branch is constrained.
    b24 = oauthClient()
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as never,
        data: { result: { items: [] }, time: BATCH_OK.data.time }
      } as never)

    await b24.actions.v3.call.make({ method: 'main.eventlog.list', params: { select: ['id'] } })

    const config = post.mock.calls[0]![2] as { maxRedirects?: number } | undefined
    expect(config?.maxRedirects).toBeUndefined()
  })

  it('@apiV3 keeps the token out of the logger, which no redactor covers', async () => {
    // `redactSensitiveParams` walks `params`; nothing walks headers, and the local
    // `no-credential-in-logger` rule does not know the word `Authorization`
    // either. So the only thing between this token and every wired log sink is
    // that nobody logs the config — pinned here rather than left to a comment.
    b24 = oauthClient()
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post').mockResolvedValue(BATCH_OK as never)

    const logged: string[] = []
    vi.spyOn(b24.getHttpClient(ApiVersion.v3).getLogger(), 'info')
      .mockImplementation(async (_message: string, context?: Record<string, unknown>) => {
        logged.push(JSON.stringify(context ?? {}))
      })

    await b24.actions.v3.batch.make({ calls: COMMANDS })

    expect(logged.length).toBeGreaterThan(0)
    for (const entry of logged) {
      expect(entry).not.toContain('ACCESS_TOKEN_PLACEHOLDER')
    }
  })

  it('@apiV3 a command with no params still carries an empty query', async () => {
    // `{ method: 'rest.scope.list' }` with no `params` is a valid command shape,
    // and `query: row.params` left it `undefined` — which `JSON.stringify` drops,
    // so the entry went out with no `query` key at all. Measured against a portal:
    // refused with the same `INVALIDSELECTEXCEPTION`, and one such entry takes the
    // whole batch down with it. Invisible until now, because the `auth` entry
    // failed the batch first.
    b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET')
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(BATCH_OK as never)

    await b24.actions.v3.batch.make({
      calls: [{ method: 'rest.scope.list' }, ['main.eventlog.list']] as never
    })

    const body = post.mock.calls[0]![1] as Array<Record<string, unknown>>
    expect(body).toHaveLength(2)
    for (const item of body) {
      expect(item['query']).toEqual({})
    }
    // The shape that reaches the wire, not merely the object before serialisation.
    expect(JSON.parse(JSON.stringify(body))[0]).toHaveProperty('query')
  })

  it('@apiV3 a webhook in a browser sends the array too — no header to preflight', async () => {
    // The one case the "browser is left exactly as it was" wording did not cover.
    // A hook adds no header, so there is no preflight to fail and the body may be
    // the array everywhere. Behaviour is unchanged — the portal reads both forms
    // identically — but the bytes are not, which is what a proxy or a recorded
    // fixture sees.
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = { document: {} }

    try {
      b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET')
      const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
        .mockResolvedValue(BATCH_OK as never)

      await b24.actions.v3.batch.make({ calls: COMMANDS })

      const [url, body, config] = post.mock.calls[0]!
      expect(Array.isArray(body)).toBe(true)
      expect(config).toBeUndefined()
      // And no `?auth=`. A hook's credential is already in the URL **path**,
      // where the portal documents it; appending it again as a query parameter
      // would put a portal-wide, non-expiring secret in a second place for no
      // gain. `AuthHookManager` returns that secret as `access_token`, so the
      // query branch reaches for it unless `!isHook` holds — and nothing else
      // in this file notices if that term is dropped.
      expect(String(url)).not.toContain('auth=SECRET')
      expect(String(url)).not.toContain('&auth=')
    } finally {
      if (typeof originalWindow === 'undefined') {
        delete (globalThis as { window?: unknown }).window
      } else {
        ;(globalThis as { window?: unknown }).window = originalWindow
      }
    }
  })

  it('@apiV3 a browser Web Worker is a browser, not a server', async () => {
    // `getEnvironment()` recognises a browser by `window.document`, which a worker
    // does not have — so `isServerSide()` called it a server, and the header would
    // have been added where CORS forbids it, producing exactly the opaque failure
    // this change exists to avoid. The guard asks about CORS instead, so a worker
    // takes the browser route: array body, credential in the query string.
    const scope = globalThis as { WorkerGlobalScope?: unknown }
    const original = scope.WorkerGlobalScope
    scope.WorkerGlobalScope = function WorkerGlobalScope() {}

    try {
      b24 = oauthClient()
      const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
        .mockResolvedValue(BATCH_OK as never)

      await b24.actions.v3.batch.make({ calls: COMMANDS })

      const [url, body, config] = post.mock.calls[0]!
      expect((config as { headers?: Record<string, string> })?.headers?.Authorization).toBeUndefined()
      expect(Array.isArray(body)).toBe(true)
      expect(JSON.stringify(body)).not.toContain('ACCESS_TOKEN_PLACEHOLDER')
      expect(String(url)).toContain('auth=ACCESS_TOKEN_PLACEHOLDER')
    } finally {
      if (typeof original === 'undefined') {
        delete scope.WorkerGlobalScope
      } else {
        scope.WorkerGlobalScope = original
      }
    }
  })

  it('@apiV3 an empty access token is not sent as `Bearer undefined`', async () => {
    // `_prepareParams` dropped an absent token silently, because `JSON.stringify`
    // omits an `undefined` value. Interpolating it into a header does not — it
    // spells it out. Fall back to the old body rather than put a nonsense
    // credential on the wire.
    b24 = new B24OAuth(
      {
        accessToken: '',
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
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(BATCH_OK as never)

    await b24.actions.v3.batch.make({ calls: COMMANDS })

    const [, body, config] = post.mock.calls[0]!
    expect(config).toBeUndefined()
    expect(Array.isArray(body)).toBe(false)
    expect(JSON.stringify(config ?? {})).not.toContain('Bearer undefined')
  })

  it('@apiV3 a v3 call that is not a batch keeps its body, even with array params', async () => {
    // The `'batch' === method` half of the gate, on its own. Removing it while
    // keeping the version check passed the whole suite: the v2 case below is
    // caught by the version half instead, and nothing else fed an array to a
    // non-batch method. `TypeCallParams` carries an index signature, so an array
    // is accepted here without a cast on the type level, and the legacy `task.*`
    // family is documented with positional arguments — so this is a shape a
    // caller can actually produce, not a contrivance.
    b24 = oauthClient()
    const http = b24.getHttpClient(ApiVersion.v3)
    const post = vi.spyOn(http.ajaxClient, 'post').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
      data: { result: [], time: BATCH_OK.data.time }
    } as never)

    await http.call('task.commentitem.getlist', [1, {}, {}] as never, 'v3-not-a-batch')

    const [, body, config] = post.mock.calls[0]!
    // Reshaping this body would change the wire format of a method nobody
    // measured, and moving the credential would put it where nothing
    // established the portal reads it.
    expect(Array.isArray(body)).toBe(false)
    expect((body as { auth?: string }).auth).toBe('ACCESS_TOKEN_PLACEHOLDER')
    expect((config as { headers?: Record<string, string> })?.headers?.Authorization).toBeUndefined()
  })

  it('@apiV3 a restApi:v2 method named batch is still not a v3 batch', async () => {
    // The version half of the gate, on its own. `HttpV2.batch()` wraps its
    // commands in a `{ halt, cmd }` envelope, so an array never reaches this
    // point through the public path — which is exactly why dropping the version
    // check passed every test. Calling `call('batch', …)` directly is the one
    // way to ask whether the version term does any work, and it has to: v2
    // authenticates through `auth` in the body, and nothing here established
    // that a v2 endpoint reads an `Authorization` header at all.
    b24 = oauthClient()
    const http = b24.getHttpClient(ApiVersion.v2)
    const post = vi.spyOn(http.ajaxClient, 'post').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
      data: { result: [], time: BATCH_OK.data.time }
    } as never)

    await http.call('batch', COMMANDS as never, 'v2-batch-by-name')

    const [, body, config] = post.mock.calls[0]!
    expect(Array.isArray(body)).toBe(false)
    expect((body as { auth?: string }).auth).toBe('ACCESS_TOKEN_PLACEHOLDER')
    expect((config as { headers?: Record<string, string> })?.headers?.Authorization).toBeUndefined()
  })

  it('@apiV3 a token of blanks is not a token', async () => {
    // `length > 0` accepted it and produced `Bearer   ` — a malformed header,
    // not a failed authentication. The portal would answer something that names
    // neither the header nor the token, where the body fallback at least fails
    // the way this transport already fails.
    b24 = new B24OAuth(
      {
        accessToken: '   ',
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
    const post = vi.spyOn(b24.getHttpClient(ApiVersion.v3).ajaxClient, 'post')
      .mockResolvedValue(BATCH_OK as never)

    await b24.actions.v3.batch.make({ calls: COMMANDS })

    const [, body, config] = post.mock.calls[0]!
    expect((config as { headers?: Record<string, string> })?.headers?.Authorization).toBeUndefined()
    // And it falls back to the old body rather than sending a headerless array
    // the portal would reject for a different reason entirely.
    expect(Array.isArray(body)).toBe(false)
  })

  it('@apiV3 a restApi:v2 array body is untouched — the branch is v3-batch only', async () => {
    // `TypeCallParams` has an index signature, so an array satisfies it, and the
    // legacy `task.*` family is documented with positional arguments. Without the
    // version gate such a call would have had its body reshaped and its credential
    // moved into a header on a protocol where nothing here established that the
    // header is read at all.
    b24 = oauthClient()
    const http = b24.getHttpClient(ApiVersion.v2)
    const post = vi.spyOn(http.ajaxClient, 'post').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
      data: { result: [], time: BATCH_OK.data.time }
    } as never)

    await http.call('task.commentitem.getlist', [1, {}, {}] as never, 'v2-positional')

    const [, body, config] = post.mock.calls[0]!
    expect(Array.isArray(body)).toBe(false)
    expect((body as { auth?: string }).auth).toBe('ACCESS_TOKEN_PLACEHOLDER')
    expect((config as { headers?: Record<string, string> })?.headers?.Authorization).toBeUndefined()
  })
})
