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
import { LoggerFactory } from '../../../packages/jssdk/src/logger'
import { defineGlobal, restoreGlobal } from '../../0_setup/browser-globals'

function asWorker<T>(run: () => T): T {
  defineGlobal('WorkerGlobalScope', function WorkerGlobalScope() {})
  try {
    return run()
  } finally {
    restoreGlobal('WorkerGlobalScope')
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

  // A worker's globals win over a `process` shim a bundler may have injected:
  // being wrong in that direction is what the member exists to prevent.
  it('prefers WORKER over the Node branch', () => {
    asWorker(() => {
      expect(typeof process).toBe('object')
      expect(getEnvironment()).toBe(Environment.WORKER)
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
    defineGlobal('WorkerGlobalScope', function WorkerGlobalScope() {})

    try {
      const b24 = B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/secret/')
      const client = b24.getHttpClient(ApiVersion.v2)
      vi.spyOn(client.ajaxClient, 'post').mockResolvedValue({
        status: 200, statusText: 'OK', headers: {}, config: {} as never, data: { result: [], time: {} }
      } as never)

      await client.call('user.get', {}, 'req-505')

      b24.destroy()
    } finally {
      restoreGlobal('WorkerGlobalScope')
    }

    const messages = forced.mock.calls.map(call => String(call[2]))
    expect(messages.some(message => message.includes('exclusively for use on the server'))).toBe(true)
  })
})
