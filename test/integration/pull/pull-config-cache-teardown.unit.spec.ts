/**
 * #242 — the pull config cached in localStorage (`LsKeys.PullConfig`) holds the
 * push `jwt` and the per-channel `signature` HMACs. localStorage is readable by
 * any same-origin script and survives reloads, so a torn-down client must not
 * leave those secrets behind:
 *   - `destroy()` removes the cached config;
 *   - and once disposed, an in-flight `loadConfig()` that resolves late must not
 *     re-write the cache (`setConfig` skips the write when `_disposed`).
 * (Freshness — ignoring a stale cache by `config_timestamp` / `exp` / channel
 * `end` — is already enforced by `isConfigActual`.) Portal-free (jsSdk:unit).
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

// A storage double recording set()/remove() key names (get() inert). Implements
// the full TypeStorageManager surface so it is a faithful stand-in.
function fakeStorage(sets: string[], removed: string[]) {
  return {
    set(name: string) { sets.push(name) },
    get() { return null },
    remove(name: string) { removed.push(name) },
    setLogger() {},
    getLogger() { return null as any },
    compareKey() { return false }
  }
}

function makeClient(): PullClient {
  return new PullClient({
    b24: {} as unknown as TypeB24,
    userId: 1,
    serverEnabled: true,
    skipStorageInit: true,
    skipCheckRevision: true
  })
}

describe('#242 PullClient does not leave the secret-bearing pull-config cache behind', () => {
  it('destroy() removes LsKeys.PullConfig (push jwt + channel signatures) from storage', () => {
    const sets: string[] = []
    const removed: string[] = []
    const client = makeClient()
    ;(client as any)._storage = fakeStorage(sets, removed)

    client.destroy()

    expect(removed).toContain(LsKeys.PullConfig) // 'bx-pull-config'
  })

  it('destroy() is a no-op (does not throw) when no storage was initialised', () => {
    const client = makeClient() // skipStorageInit → _storage stays null
    expect(() => client.destroy()).not.toThrow()
  })

  it('setConfig re-persists the cache while live, but not once disposed (in-flight loadConfig race)', () => {
    const sets: string[] = []
    const removed: string[] = []
    const client = makeClient()
    ;(client as any)._storage = fakeStorage(sets, removed)
    ;(client as any)._config = {}
    const cfg = { server: { config_timestamp: 1 } }

    // live: setConfig persists the cache (proves the write path is exercised)
    ;(client as any).setConfig(cfg, true)
    expect(sets).toContain(LsKeys.PullConfig)

    // disposed: a late setConfig (in-flight loadConfig after destroy) must NOT
    // write the jwt + signatures back
    sets.length = 0
    ;(client as any)._disposed = true
    ;(client as any).setConfig(cfg, true)
    expect(sets).not.toContain(LsKeys.PullConfig)
  })
})
