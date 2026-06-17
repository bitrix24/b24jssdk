/**
 * Unit tests for PullClient teardown (#141). Pure lifecycle logic, no portal — runs
 * in the `jsSdk:unit` CI project. Verifies that destroy():
 *   - removes the window listeners init() registered (they used to leak),
 *   - cancels every pending timer (only _checkInterval used to be cleared),
 *   - leaves the client disposed so reconnect / watch / online no longer reschedule,
 * and that start() refuses to resurrect a destroyed instance.
 *
 * The unit project runs under Node (no DOM), so we install a minimal `window` stub
 * that records add/removeEventListener calls. No WebSocket/localStorage on it, so
 * the client picks long-polling and skips storage — keeping construction portal-free.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PullClient } from '../../../packages/jssdk/src/pullClient/client'
import type { TypeB24 } from '../../../packages/jssdk/src/types/b24'

type Listener = (...args: any[]) => void

interface WindowStub {
  added: Map<string, Set<Listener>>
  removed: Array<{ type: string, handler: Listener }>
  addEventListener: (type: string, handler: Listener) => void
  removeEventListener: (type: string, handler: Listener) => void
}

function installWindowStub(): WindowStub {
  const added = new Map<string, Set<Listener>>()
  const removed: Array<{ type: string, handler: Listener }> = []
  const stub: WindowStub = {
    added,
    removed,
    addEventListener(type, handler) {
      if (!added.has(type)) {
        added.set(type, new Set())
      }
      added.get(type)!.add(handler)
    },
    removeEventListener(type, handler) {
      removed.push({ type, handler })
      added.get(type)?.delete(handler)
    }
  }
  ;(globalThis as any).window = stub
  ;(globalThis as any).document = { location: { href: 'https://test.local/' } }
  // The long-polling connector lazily creates an XHR (even to abort it on
  // disconnect); Node has none, so provide a no-op stub.
  ;(globalThis as any).XMLHttpRequest = class {
    responseType = ''
    onreadystatechange: Listener | null = null
    open() {}
    send() {}
    abort() {}
    setRequestHeader() {}
    addEventListener() {}
    removeEventListener() {}
  }
  return stub
}

function createClient(): PullClient {
  return new PullClient({
    b24: {} as unknown as TypeB24,
    userId: 42,
    serverEnabled: true,
    skipStorageInit: true,
    skipCheckRevision: true
  })
}

const WINDOW_EVENTS = ['beforeunload', 'offline', 'online']
const TIMER_FIELDS = [
  '_reconnectTimeout',
  '_restartTimeout',
  '_restoreWebSocketTimeout',
  '_checkInterval',
  '_offlineTimeout',
  '_watchUpdateTimeout',
  '_pingWaitTimeout'
]

describe('PullClient teardown (#141)', () => {
  let windowStub: WindowStub

  beforeEach(() => {
    windowStub = installWindowStub()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as any).window
    delete (globalThis as any).document
    delete (globalThis as any).XMLHttpRequest
  })

  it('removes every window listener it registered, on destroy()', () => {
    const client = createClient()
    const internal = client as any
    internal.init()

    for (const type of WINDOW_EVENTS) {
      expect(windowStub.added.get(type)?.size ?? 0, `listener added for ${type}`).toBe(1)
    }

    client.destroy()

    for (const type of WINDOW_EVENTS) {
      expect(windowStub.added.get(type)?.size ?? 0, `listener removed for ${type}`).toBe(0)
    }
    expect(windowStub.removed.map(entry => entry.type).sort()).toEqual([...WINDOW_EVENTS].sort())
  })

  it('cancels every pending timer on destroy()', () => {
    const client = createClient()
    const internal = client as any
    internal.init()

    // Arm six of the seven timer-arming paths (the 7th, _offlineTimeout, needs a
    // PullStatus). clearAllTimers() must cancel every one.
    internal.updateWatch(true)
    internal.scheduleReconnect(5)
    internal.scheduleRestart(1000, 'test', 5)
    internal.scheduleRestoreWebSocketConnection()
    internal.startCheckConfig()
    internal.updatePingWaitTimeout()
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(6)

    client.destroy()

    for (const field of TIMER_FIELDS) {
      expect(internal[field], `${field} cleared`).toBeNull()
    }
    expect(vi.getTimerCount()).toBe(0)
    expect(internal._disposed).toBe(true)
  })

  it('does not reschedule watch / reconnect / online after destroy()', () => {
    const client = createClient()
    const internal = client as any
    internal.init()
    client.destroy()

    // A disposed client must treat these as no-ops.
    internal.updateWatch()
    internal.scheduleReconnect(5)
    internal.onOnline()

    expect(internal._watchUpdateTimeout).toBeNull()
    expect(internal._reconnectTimeout).toBeNull()
    expect(vi.getTimerCount()).toBe(0)

    // …and letting plenty of time pass schedules nothing new.
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('start() rejects on a disposed client instead of re-initialising', async () => {
    const client = createClient()
    client.destroy()
    await expect(client.start()).rejects.toMatchObject({ ex: { error: 'PULL_DISPOSED' } })
  })

  it('a disposed client re-arms no timers and re-registers no listeners', () => {
    const client = createClient()
    const internal = client as any
    internal.init()
    client.destroy()

    // Every timer-arming path — and init() — must no-op once disposed, even if a
    // late connector callback reaches them after clearAllTimers() ran.
    internal.updateWatch(true)
    internal.scheduleReconnect(5)
    internal.scheduleRestart(1000, 'test', 5)
    internal.scheduleRestoreWebSocketConnection()
    internal.startCheckConfig()
    internal.updatePingWaitTimeout()
    internal.onOnline()
    internal.init()

    expect(vi.getTimerCount()).toBe(0)
    for (const field of TIMER_FIELDS) {
      expect(internal[field], `${field} stays null`).toBeNull()
    }
    for (const type of WINDOW_EVENTS) {
      expect(windowStub.added.get(type)?.size ?? 0, `no ${type} listener re-registered`).toBe(0)
    }
  })

  it('destroy() is safe with no window (SSR/Node teardown)', () => {
    const client = createClient()
    const internal = client as any
    internal.init()
    delete (globalThis as any).window
    expect(() => client.destroy()).not.toThrow()
    expect(internal._disposed).toBe(true)
  })
})
