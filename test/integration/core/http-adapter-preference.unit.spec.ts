/**
 * In a browser the SDK asks axios for the `fetch` adapter.
 *
 * Axios walks its default `['xhr', 'http', 'fetch']` and takes the first
 * supported* entry, so anywhere `XMLHttpRequest` exists — a window, a dedicated
 * worker, a shared worker — it picks **XHR** and never reaches `fetch`. That is
 * selection by list order, not by merit. Node is left alone: there XHR does not
 * exist, `http` is already what gets picked, and it is the right one for that
 * runtime.
 *
 * `*.unit.spec.ts` — no portal required.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { ApiVersion, B24Frame, B24Hook } from '../../../packages/jssdk/src/'
import { B24OAuth } from '../../../packages/jssdk/src/oauth/b24'
import type { TypeB24 } from '../../../packages/jssdk/src/'
import { defineGlobal, restoreGlobal } from '../../0_setup/browser-globals'

const AXIOS_DEFAULT_ORDER = ['xhr', 'http', 'fetch']

function adapterOf(b24: TypeB24, version: ApiVersion = ApiVersion.v2): unknown {
  return b24.getHttpClient(version).ajaxClient.defaults.adapter
}

function buildHook(options?: { httpOptions?: { adapter?: string } }): B24Hook {
  return new B24Hook(
    { b24Url: 'https://example.bitrix24.com', userId: 1, secret: 'secret' },
    options as never
  )
}

/**
 * `isCorsEnforcedRuntime()` reads `WorkerGlobalScope` as well as the browser
 * environment, and a worker is the branch reachable from Node — no `window` or
 * `document` has to be invented for it.
 */
function asBrowserLikeRuntime(run: () => void): void {
  const saved = (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope
  ;(globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope = function () {}
  try {
    run()
  } finally {
    if (undefined === saved) {
      delete (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope
    } else {
      ;(globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope = saved
    }
  }
}

describe('which axios adapter the SDK asks for', () => {
  let b24: B24Hook | B24OAuth | null = null

  afterEach(() => {
    b24?.destroy()
    b24 = null
  })

  it('asks for nothing outside a browser, so axios decides', () => {
    b24 = buildHook()

    expect(adapterOf(b24)).toEqual(AXIOS_DEFAULT_ORDER)
    expect(adapterOf(b24, ApiVersion.v3)).toEqual(AXIOS_DEFAULT_ORDER)
  })

  it('asks for fetch in a browser-like runtime, on both transports', () => {
    asBrowserLikeRuntime(() => {
      b24 = buildHook()

      expect(adapterOf(b24)).toBe('fetch')
      expect(adapterOf(b24, ApiVersion.v3)).toBe('fetch')
    })
  })

  // The default is placed before the caller's options are spread, so naming an
  // adapter always wins — that is what makes this a default rather than a lock.
  it('lets the caller name one instead', () => {
    asBrowserLikeRuntime(() => {
      b24 = buildHook({ httpOptions: { adapter: 'xhr' } })

      expect(adapterOf(b24)).toBe('xhr')
    })
  })

  // `B24Frame` is the entry point that runs in a browser — the only one without
  // the "server only" warning the other two carry — so it is the one the adapter
  // preference applies to, and the one where `maxRedirects` stops being inert.
  // An earlier revision gave the option to the two server-side classes and not
  // to this one, which put the documented opt-out out of reach of the audience
  // it was written for.
  //
  // Asserted on the plumbing rather than on a built client: the frame creates
  // its transports inside `init()`, which needs a portal to answer the
  // handshake. What has to hold here is that the constructor carries the option
  // through to where `init()` will read it.
  it('carries the option through on the browser entry point too', () => {
    defineGlobal('window', { addEventListener() {}, removeEventListener() {} })

    try {
      class ProbeFrame extends B24Frame {
        public optionsHandedToTransports(): null | object {
          return this._getHttpOptions()
        }
      }

      const frame = new ProbeFrame(
        { DOMAIN: 'example.bitrix24.com', PROTOCOL: true, APP_SID: 'sid', LANG: 'en' },
        { httpOptions: { adapter: 'xhr' } }
      )

      expect(frame.optionsHandedToTransports()).toEqual({ adapter: 'xhr' })
    } finally {
      restoreGlobal('window')
    }
  })

  // Each entry point assigns `_httpOptions` for itself, so each one can drop it
  // for itself — the hook path above cannot speak for this one.
  it('carries the option through on the OAuth entry point too', () => {
    b24 = new B24OAuth(
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
      { clientId: 'local.test', clientSecret: 'secret' } as never,
      { httpOptions: { adapter: 'xhr' } }
    )

    expect(adapterOf(b24)).toBe('xhr')
  })

  // `fromWebhookUrl` is the factory the documentation recommends everywhere, so
  // an escape hatch it cannot reach is not an escape hatch.
  it('reaches the option through the recommended factory', () => {
    b24 = B24Hook.fromWebhookUrl(
      'https://example.bitrix24.com/rest/1/secret/',
      { httpOptions: { adapter: 'xhr' } }
    )

    expect(adapterOf(b24)).toBe('xhr')
  })

  // Guarded on `fetch` being reachable rather than on a version check: the point
  // is to reach it, not to assert an era.
  it('stands aside where fetch does not exist', () => {
    const savedFetch = globalThis.fetch

    asBrowserLikeRuntime(() => {
      // @ts-expect-error — removing a global the type system says is always there
      delete globalThis.fetch
      b24 = buildHook()

      expect(adapterOf(b24)).toEqual(AXIOS_DEFAULT_ORDER)
    })

    globalThis.fetch = savedFetch
  })
})
