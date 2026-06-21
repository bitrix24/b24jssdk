/**
 * #242 — the pull config cached in localStorage (`LsKeys.PullConfig`) holds the
 * push `jwt` and the per-channel `signature` HMACs. localStorage is readable by
 * any same-origin script and survives reloads, so a torn-down client must not
 * leave those secrets behind: `destroy()` removes the cached config. (Freshness —
 * ignoring a stale cache by `config_timestamp` / `exp` / channel `end` — is
 * already enforced by `isConfigActual`.) Portal-free (jsSdk:unit).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PullClient } from '../../../packages/jssdk/src/pullClient/client'
import { LsKeys } from '../../../packages/jssdk/src/types/pull'
import type { TypeB24 } from '../../../packages/jssdk/src/types/b24'

const saved: Record<string, unknown> = {}
beforeEach(() => {
  saved.window = (globalThis as any).window
  saved.document = (globalThis as any).document
  ;(globalThis as any).window = { addEventListener() {}, removeEventListener() {} }
  ;(globalThis as any).document = { location: { href: 'https://test.local/' } }
})
afterEach(() => {
  ;(globalThis as any).window = saved.window
  ;(globalThis as any).document = saved.document
})

// A storage double that records every remove() so we can assert the secret-
// bearing config key is dropped. set()/get() are inert (persistSession writes a
// separate, non-secret LS_SESSION key through set()).
function recordingStorage(removed: string[]) {
  return {
    set() {},
    get() { return null },
    remove(name: string) { removed.push(name) },
    setLogger() {},
    compareKey() { return false }
  }
}

describe('#242 PullClient.destroy() clears the secret-bearing pull-config cache', () => {
  it('removes LsKeys.PullConfig (push jwt + channel signatures) from storage on teardown', () => {
    const removed: string[] = []
    const client = new PullClient({
      b24: {} as unknown as TypeB24,
      userId: 1,
      serverEnabled: true,
      skipStorageInit: true,
      skipCheckRevision: true
    })
    ;(client as any)._storage = recordingStorage(removed)

    client.destroy()

    expect(removed).toContain(LsKeys.PullConfig) // 'bx-pull-config'
  })
})
