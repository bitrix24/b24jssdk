/**
 * #505 — a Web Worker is not a server, and used to be treated as one.
 *
 * `getEnvironment()` recognised a browser by `window.document`, which no worker
 * has, so all three worker kinds fell through to Node or to `UNKNOWN`. Two
 * answers were wrong as a result, and both were measured before this was fixed:
 *
 *   - the SDK set a `User-Agent` default header, which is a **forbidden header**
 *     in any browser context, worker included — the browser drops it silently;
 *   - the "a webhook is for the server only" warning did not fire, though code
 *     shipped to a worker is exactly as public as code on the main thread, and
 *     the secret is in the bundle either way.
 *
 * `isCorsEnforcedRuntime()` had the worker right, by probing `WorkerGlobalScope`
 * itself — which left two near-identical predicates side by side, inviting the
 * "simplification" that would reopen the case in a code path whose failure mode
 * is a request that never leaves the browser.
 *
 * There is now one predicate, `isBrowserLikeRuntime()`, and a worker has a name
 * of its own. What this file pins is the shape of the answer: a worker is *not*
 * `BROWSE` — it has no DOM, and callers branching on that must keep working —
 * while still being browser-like for everything the browser enforces. Fold the
 * two back together in either direction and a case here goes red.
 *
 * `*.unit.spec.ts` — no portal required.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion, B24Hook } from '../../../packages/jssdk/src/'
import { Environment, getEnvironment, isBrowserLikeRuntime } from '../../../packages/jssdk/src/tools/environment'
import { LoggerFactory, LogLevel } from '../../../packages/jssdk/src/logger'
import { TelegramHandler } from '../../../packages/jssdk/src/logger/handler/telegram-handler'
import { defineGlobal, hideNodeVersion, installBrowserWorkerGlobals, restoreGlobal } from '../../0_setup/browser-globals'

/** A constructor the current global answers to — a worker scope, minus the Node hiding. */
function workerScopeStandIn(): unknown {
  const scope = function WorkerGlobalScope() {}
  Object.defineProperty(scope, Symbol.hasInstance, { value: (value: unknown) => value === globalThis })
  return scope
}

function asWorker<T>(run: () => T): T {
  const restore = installBrowserWorkerGlobals()
  try {
    return run()
  } finally {
    restore()
  }
}

describe('a Web Worker is browser-like without being a browser (#505)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // The disagreement the issue asked to pin, in its new form. `BROWSE` means
  // "there is a DOM" — a worker must not claim it — and `isBrowserLikeRuntime()`
  // means "the browser's rules apply", which it must.
  it('reports WORKER, not BROWSE, and still counts as browser-like', () => {
    asWorker(() => {
      expect(getEnvironment()).toBe(Environment.WORKER)
      expect(getEnvironment()).not.toBe(Environment.BROWSE)
      expect(isBrowserLikeRuntime()).toBe(true)
    })

    // And outside one, nothing moved: this suite runs in Node.
    expect(getEnvironment()).toBe(Environment.NODE)
    expect(isBrowserLikeRuntime()).toBe(false)
  })

  // The ordering, measured rather than reasoned. A runtime that reports a Node
  // version is a server even when it models itself on the Worker API — a Deno
  // worker and a Cloudflare Worker with `nodejs_compat` define both — and
  // calling those browser-like would warn, on every call, that a private secret
  // had leaked. A browser worker has no `process` at all, and the two canonical
  // shims set `process.versions = {}`, so neither reaches this branch.
  it('reports NODE, not WORKER, where a real Node version is present', () => {
    defineGlobal('WorkerGlobalScope', workerScopeStandIn())

    try {
      expect(process.versions.node).toBeTruthy()
      expect(getEnvironment()).toBe(Environment.NODE)
      expect(isBrowserLikeRuntime()).toBe(false)
    } finally {
      restoreGlobal('WorkerGlobalScope')
    }
  })

  // And with no Node version — a browser worker, shimmed or not — the worker
  // branch is what answers.
  it('reports WORKER where there is no Node version', () => {
    asWorker(() => {
      expect(getEnvironment()).toBe(Environment.WORKER)
      expect(isBrowserLikeRuntime()).toBe(true)
    })
  })

  // Measured before the fix: the header was set.
  it('does not set the forbidden User-Agent header in a worker', () => {
    const inWorker = asWorker(() => {
      const b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/secret/')
      const headers = b24.getHttpClient(ApiVersion.v2).ajaxClient.defaults.headers
      b24.destroy()
      return headers['User-Agent']
    })

    expect(inWorker).toBeUndefined()

    // Still set where it is allowed, which is the other half of the contract.
    const b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/secret/')
    expect(b24.getHttpClient(ApiVersion.v2).ajaxClient.defaults.headers['User-Agent']).toBeDefined()
    b24.destroy()
  })

  // Measured before the fix: the warning stayed silent.
  it('warns about a webhook used in a worker', async () => {
    const forced = vi.spyOn(LoggerFactory, 'forcedLog').mockResolvedValue(undefined)

    // Installed for the whole call rather than around a callback: the check runs
    // after the rate limiter awaits, so a scope that ends synchronously would be
    // gone by the time it is consulted.
    const restoreWorker = installBrowserWorkerGlobals()

    try {
      const b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/secret/')
      const client = b24.getHttpClient(ApiVersion.v2)
      vi.spyOn(client.ajaxClient, 'post').mockResolvedValue({
        status: 200, statusText: 'OK', headers: {}, config: {} as never, data: { result: [], time: {} }
      } as never)

      await client.call('user.get', {}, 'req-505')

      b24.destroy()
    } finally {
      restoreWorker()
    }

    const messages = forced.mock.calls.map(call => String(call[2]))
    expect(messages.some(message => message.includes('exclusively for use on the server'))).toBe(true)
  })

  // The precision the `instanceof` buys: a runtime that merely knows the name —
  // an edge runtime modelled on the Worker API, say — is not a worker, and must
  // not be told its secrets are public.
  it('is not fooled by a runtime that only defines the constructor', () => {
    // The Node version is hidden, or the branch above answers first and this
    // case passes without the `instanceof` ever being consulted — which is
    // exactly what it is here to check.
    defineGlobal('WorkerGlobalScope', function NotThisScope() {})
    const restoreVersions = hideNodeVersion()

    try {
      expect(getEnvironment()).toBe(Environment.UNKNOWN)
      expect(isBrowserLikeRuntime()).toBe(false)
    } finally {
      restoreVersions()
      restoreGlobal('WorkerGlobalScope')
    }
  })

  // A global that is not a constructor at all would make `instanceof` throw,
  // which on this path would be a crash where an answer was expected.
  it('survives a WorkerGlobalScope that is not a constructor', () => {
    defineGlobal('WorkerGlobalScope', 42)
    const restoreVersions = hideNodeVersion()

    try {
      expect(() => getEnvironment()).not.toThrow()
      expect(getEnvironment()).toBe(Environment.UNKNOWN)
    } finally {
      restoreVersions()
      restoreGlobal('WorkerGlobalScope')
    }
  })

  // The Telegram handler puts the bot token in the request URL, so it refuses to
  // run anywhere the code is public. A worker used to miss that: it fell through
  // to "unknown environment" and `testConnection()` would have contacted
  // Telegram from a scope anyone can read.
  it('keeps the Telegram bot token off the network in a worker', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      { json: async () => ({ ok: true }) } as never
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const restoreWorker = installBrowserWorkerGlobals()

    try {
      const handler = new TelegramHandler(LogLevel.ERROR, { botToken: 'BOT_TOKEN_PLACEHOLDER', chatId: 1 })

      await expect(handler.testConnection()).resolves.toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      restoreWorker()
      warn.mockRestore()
      fetchSpy.mockRestore()
    }

    // And on a server it still does its job.
    const handler = new TelegramHandler(LogLevel.ERROR, { botToken: 'BOT_TOKEN_PLACEHOLDER', chatId: 1 })
    const serverFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      { json: async () => ({ ok: true }) } as never
    )
    await expect(handler.testConnection()).resolves.toBe(true)
    expect(serverFetch).toHaveBeenCalledOnce()
    serverFetch.mockRestore()
  })

  // The plain, DOM-having browser — the case the two guards were written for —
  // had no test at all: every existing one pins the worker, and a mutation that
  // broke only the ordinary browser's answer went unnoticed. Both outcomes must
  // hold there too, for the same reason and by the same predicate.
  it('does not set the User-Agent header in a plain browser either', () => {
    defineGlobal('window', { document: {} })

    try {
      const b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/secret/')
      const headers = b24.getHttpClient(ApiVersion.v2).ajaxClient.defaults.headers
      b24.destroy()

      expect(headers['User-Agent']).toBeUndefined()
    } finally {
      restoreGlobal('window')
    }
  })

  it('warns about a webhook used in a plain browser too', async () => {
    const forced = vi.spyOn(LoggerFactory, 'forcedLog').mockResolvedValue(undefined)

    defineGlobal('window', { document: {} })

    try {
      const b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/secret/')
      const client = b24.getHttpClient(ApiVersion.v2)
      vi.spyOn(client.ajaxClient, 'post').mockResolvedValue({
        status: 200, statusText: 'OK', headers: {}, config: {} as never, data: { result: [], time: {} }
      } as never)

      await client.call('user.get', {}, 'req-505')

      b24.destroy()
    } finally {
      restoreGlobal('window')
    }

    const messages = forced.mock.calls.map(call => String(call[2]))
    expect(messages.some(message => message.includes('exclusively for use on the server'))).toBe(true)
  })

  // Every real worker is detected *by* prototype chain; the shared helper models
  // the answer rather than the mechanism, so this case models the mechanism —
  // a global whose prototype chain genuinely reaches `WorkerGlobalScope`, the
  // way the specification builds one.
  it('detects a scope whose prototype chain really reaches WorkerGlobalScope', () => {
    const WorkerGlobalScope = function WorkerGlobalScope() {} as unknown as { prototype: object }
    const DedicatedWorkerGlobalScope = function DedicatedWorkerGlobalScope() {} as unknown as { prototype: object }
    Object.setPrototypeOf(DedicatedWorkerGlobalScope.prototype, WorkerGlobalScope.prototype)

    const original = Object.getPrototypeOf(globalThis) as object
    defineGlobal('WorkerGlobalScope', WorkerGlobalScope)
    Object.setPrototypeOf(globalThis, DedicatedWorkerGlobalScope.prototype)

    const restoreVersions = hideNodeVersion()

    try {
      expect(getEnvironment()).toBe(Environment.WORKER)
      expect(isBrowserLikeRuntime()).toBe(true)
    } finally {
      restoreVersions()
      Object.setPrototypeOf(globalThis, original)
      restoreGlobal('WorkerGlobalScope')
    }
  })

  // The helper hides `process.versions` and puts it back, and the whole suite
  // runs serially in one process — so "puts it back" has to mean every attribute,
  // not just the value. Measured: the value-only form happens to be harmless on
  // Node 22, because `defineProperty` leaves an existing property's other
  // attributes alone. This pins the outcome rather than the mechanism, so it
  // holds if either the helper or that assumption changes.
  it('leaves process.versions exactly as it found it', () => {
    const before = Object.getOwnPropertyDescriptor(process, 'versions')

    asWorker(() => {
      expect(process.versions.node).toBeUndefined()
    })

    const after = Object.getOwnPropertyDescriptor(process, 'versions')

    expect(after?.enumerable).toBe(before?.enumerable)
    expect(after?.writable).toBe(before?.writable)
    expect(after?.configurable).toBe(before?.configurable)
    expect(after?.value).toBe(before?.value)
    expect(Object.keys(process)).toContain('versions')
  })

  // A global that only exists when read — a lazily-defined one — is an accessor,
  // and an accessor can throw. `getEnvironment()` is called by every transport,
  // so that would be a crash on a path nobody expects to fail.
  it('survives a WorkerGlobalScope whose getter throws', () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'WorkerGlobalScope')
    Object.defineProperty(globalThis, 'WorkerGlobalScope', {
      get() {
        throw new Error('lazy global')
      },
      configurable: true
    })
    const restoreVersions = hideNodeVersion()

    try {
      expect(() => getEnvironment()).not.toThrow()
      expect(getEnvironment()).toBe(Environment.UNKNOWN)
    } finally {
      restoreVersions()
      if (saved) {
        Object.defineProperty(globalThis, 'WorkerGlobalScope', saved)
      } else {
        delete (globalThis as never as Record<string, unknown>)['WorkerGlobalScope']
      }
    }
  })

  // The handler's browser arm is the half its docblock advertises: it warns that
  // sending would expose the bot token. Only `testConnection()` was pinned, so
  // reverting `handle()` to a DOM test left the suite green.
  it('routes handle() through the browser arm in a worker', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      { json: async () => ({ ok: true }) } as never
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const restoreWorker = installBrowserWorkerGlobals()

    try {
      const handler = new TelegramHandler(LogLevel.ERROR, { botToken: 'BOT_TOKEN_PLACEHOLDER', chatId: 1 })

      const sent = await handler.handle({
        level: LogLevel.ERROR,
        message: 'boom',
        context: {},
        datetime: new Date(),
        channel: 'test',
        extra: {}
      } as never)

      expect(sent).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(warn.mock.calls.flat().join(' ')).toContain('expose your bot token')
    } finally {
      restoreWorker()
      warn.mockRestore()
      fetchSpy.mockRestore()
    }
  })

  // The counterweight: without it, "sends nothing in a worker" is also satisfied
  // by a handler that sends nowhere at all.
  it('still posts to Telegram from a server', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      { json: async () => ({ ok: true }) } as never
    )

    try {
      const handler = new TelegramHandler(LogLevel.ERROR, { botToken: 'BOT_TOKEN_PLACEHOLDER', chatId: 1 })

      await handler.handle({
        level: LogLevel.ERROR,
        message: 'boom',
        context: {},
        datetime: new Date(),
        channel: 'test',
        extra: {}
      } as never)

      expect(fetchSpy).toHaveBeenCalledOnce()
      expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('api.telegram.org')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  // `window` without a `document` is not a browser — a bare `window` shim is a
  // thing bundlers do, and the DOM is what `BROWSE` claims to mean.
  it('does not call a window without a document a browser', () => {
    defineGlobal('window', {})
    const restoreVersions = hideNodeVersion()

    try {
      expect(getEnvironment()).toBe(Environment.UNKNOWN)
      expect(isBrowserLikeRuntime()).toBe(false)
    } finally {
      restoreVersions()
      restoreGlobal('window')
    }
  })

  // …and the realistic shape of that shim: a bare `window` inside a worker. The
  // worker branch is what must answer, not the browser one.
  it('reports WORKER for a bare window shim inside a worker', () => {
    defineGlobal('window', {})
    const restoreWorker = installBrowserWorkerGlobals()

    try {
      expect(getEnvironment()).toBe(Environment.WORKER)
      expect(isBrowserLikeRuntime()).toBe(true)
    } finally {
      restoreWorker()
      restoreGlobal('window')
    }
  })
})
