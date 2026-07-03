/**
 * Unit tests for PullClient lifecycle hardening (#222). Runs in the `jsSdk:unit`
 * CI project (Node, no DOM). Covers:
 *   - Deliverable 1: SSR / Node safety — construct + start() must not throw when
 *     `window` / `navigator` / `document` are undefined; the guarded globals
 *     (navigator.onLine, window.WebSocket) degrade instead of throwing.
 *   - Deliverable 2: unified timer + window-listener registry — after destroy()
 *     every armed timer is cleared (clearTimeout/clearInterval spied) and every
 *     window listener registered by init() is removed.
 *   - Deliverable 3: an in-flight start() is neutralised by the start-generation
 *     token when destroy() runs before loadConfig() resolves.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PullClient } from '../../../packages/jssdk/src/pullClient/client'
import type { TypeB24 } from '../../../packages/jssdk/src/types/b24'

type Listener = (...args: any[]) => void

function installWindowStub() {
  const added = new Map<string, Set<Listener>>()
  const removed: Array<{ type: string, handler: Listener }> = []
  const stub = {
    added,
    removed,
    WebSocket: function WebSocketStub() {},
    addEventListener(type: string, handler: Listener) {
      if (!added.has(type)) {
        added.set(type, new Set())
      }
      added.get(type)!.add(handler)
    },
    removeEventListener(type: string, handler: Listener) {
      removed.push({ type, handler })
      added.get(type)?.delete(handler)
    }
  }
  ;(globalThis as any).window = stub
  ;(globalThis as any).document = { location: { href: 'https://test.local/' } }
  ;(globalThis as any).navigator = { onLine: true }
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

function clearGlobals() {
  delete (globalThis as any).window
  delete (globalThis as any).document
  delete (globalThis as any).navigator
  delete (globalThis as any).XMLHttpRequest
}

function createClient(): PullClient {
  return new PullClient({
    b24: {} as unknown as TypeB24,
    userId: 42,
    siteId: 'test',
    serverEnabled: true,
    skipStorageInit: true,
    skipCheckRevision: true
  })
}

const VALID_CONFIG = {
  server: { config_timestamp: 1 },
  channels: {},
  publicChannels: {}
} as any

// region Deliverable 1 — SSR / Node safety ////
describe('PullClient SSR safety (#222 D1)', () => {
  afterEach(() => {
    clearGlobals()
  })

  it('constructs without throwing when window/navigator/document are undefined', () => {
    clearGlobals()
    expect(() => createClient()).not.toThrow()
  })

  it('isWebSocketSupported() returns false (no throw) without a window', () => {
    clearGlobals()
    const client = createClient()
    expect(() => client.isWebSocketSupported()).not.toThrow()
    expect(client.isWebSocketSupported()).toBe(false)
  })

  it('getDebugInfo() does not throw when navigator is undefined', () => {
    clearGlobals()
    const client = createClient()
    expect(() => client.getDebugInfo()).not.toThrow()
    expect(client.getDebugInfo()['Browser online']).toBe('N')
  })

  it('start() does not throw under SSR (loadConfig/connect stubbed)', async () => {
    clearGlobals()
    // window/navigator/document AND XMLHttpRequest all stay undefined — a real
    // Node/SSR runtime. init() (run inside start()) must construct the
    // LongPollingConnector without a global XHR: the connector defers
    // `new XMLHttpRequest()` to connect(), so construct/init/start stay
    // ReferenceError-free. Only the network round-trip (connect) is stubbed,
    // because there is genuinely no transport to exercise under SSR. (#222)
    const client = createClient()
    const internal = client as any
    internal.loadConfig = () => Promise.resolve({ ...VALID_CONFIG })
    internal.connect = () => Promise.resolve()

    // Pass a config so _config is seeded before setConfig() iterates it.
    await expect(client.start({ ...VALID_CONFIG })).resolves.toBe(true)
    // init() must have picked long-polling (no window.WebSocket), constructed
    // the long-polling connector without throwing (lazy XHR), and registered no
    // window listeners.
    expect(internal._connectionType).toBe('longPolling')
    expect(internal._connectors.longPolling).toBeTruthy()
    expect(internal._windowListeners.length).toBe(0)

    client.destroy()
  })

  it('long-polling connect() degrades to onError (no throw) when XMLHttpRequest is absent', async () => {
    // Directly exercise the connector's SSR path: with no global XHR, connect()
    // must surface a clean Error via the onError callback rather than throwing a
    // raw ReferenceError. (#222)
    clearGlobals()
    const { LongPollingConnector } = await import(
      '../../../packages/jssdk/src/pullClient/long-polling-connector'
    )
    const onError = vi.fn()
    const connector = new LongPollingConnector({
      parent: {
        isProtobufSupported: () => false,
        isJsonRpc: () => true,
        getConnectionPath: () => 'https://test.local/pull'
      },
      onOpen: () => {},
      onMessage: () => {},
      onDisconnect: () => {},
      onError
    } as any)

    expect(() => connector.connect()).not.toThrow()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
  })
})
// endregion ////

// region Deliverable 2 — timer + listener registry ////
describe('PullClient teardown registry (#222 D2)', () => {
  beforeEach(() => {
    installWindowStub()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearGlobals()
  })

  it('destroy() clears every armed timer and leaves none pending', () => {
    const client = createClient()
    const internal = client as any
    internal.init()

    internal.updateWatch(true)
    internal.scheduleReconnect(5)
    internal.scheduleRestart(1000, 'test', 5)
    internal.scheduleRestoreWebSocketConnection()
    internal.startCheckConfig()
    internal.updatePingWaitTimeout()

    const armed = vi.getTimerCount()
    expect(armed).toBeGreaterThanOrEqual(6)

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    client.destroy()

    // Every setTimeout-backed timer went through clearTimeout, the interval
    // through clearInterval, and nothing is left scheduled.
    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    // Advancing time fires nothing new.
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(vi.getTimerCount()).toBe(0)

    clearTimeoutSpy.mockRestore()
    clearIntervalSpy.mockRestore()
  })

  it('destroy() removes every window listener init() registered', () => {
    const client = createClient()
    const internal = client as any
    internal.init()

    const stub = (globalThis as any).window
    const removeSpy = vi.spyOn(stub, 'removeEventListener')

    expect(internal._windowListeners.length).toBe(3)

    client.destroy()

    expect(removeSpy).toHaveBeenCalledTimes(3)
    expect(internal._windowListeners.length).toBe(0)
    for (const type of ['beforeunload', 'offline', 'online']) {
      expect(stub.added.get(type)?.size ?? 0).toBe(0)
    }
  })
})
// endregion ////

// region Deliverable 3 — abort an in-flight start() ////
describe('PullClient in-flight start() abort (#222 D3)', () => {
  beforeEach(() => {
    installWindowStub()
  })

  afterEach(() => {
    clearGlobals()
  })

  it('destroy() during a pending loadConfig() rejects the start and runs no post-destroy work', async () => {
    const client = createClient()
    const internal = client as any

    let resolveLoad!: (config: any) => void
    internal.loadConfig = () => new Promise((resolve) => {
      resolveLoad = resolve
    })
    const connectSpy = vi.fn(() => Promise.resolve())
    const setConfigSpy = vi.spyOn(internal, 'setConfig')
    internal.connect = connectSpy

    const startPromise = client.start()
    const rejection = expect(startPromise).rejects.toMatchObject({
      ex: { error: 'PULL_DISPOSED' }
    })

    // Tear the client down while loadConfig() is still in flight, then let it
    // resolve: the continuation must bail on the generation-token mismatch.
    client.destroy()
    resolveLoad(VALID_CONFIG)

    await rejection
    expect(connectSpy).not.toHaveBeenCalled()
    expect(setConfigSpy).not.toHaveBeenCalled()
  })

  it('a superseded start() is neutralised by the generation token even when NOT disposed', async () => {
    // The previous case can't distinguish the generation-token guard from the
    // `_disposed` guard, because destroy() trips both at once. Here `_disposed`
    // stays false and ONLY the generation moves forward, so this pins the token
    // half specifically: reverting the `_startGeneration !== startGeneration`
    // clause makes this fail. (#222)
    const client = createClient()
    const internal = client as any

    let resolveFirst!: (config: any) => void
    let calls = 0
    internal.loadConfig = () => new Promise((resolve) => {
      calls += 1
      if (calls === 1) {
        resolveFirst = resolve
      }
      // The second loadConfig() stays pending forever.
    })
    const connectSpy = vi.fn(() => Promise.resolve())
    const setConfigSpy = vi.spyOn(internal, 'setConfig')
    internal.connect = connectSpy

    // First start(): captures generation N, loadConfig #1 pending.
    const firstStart = client.start()
    firstStart.catch(() => {})

    // Simulate the in-flight reset that lets a fresh start() supersede the first
    // WITHOUT destroy(), so _disposed stays false: the second start() bumps the
    // generation and begins its own loadConfig.
    internal._starting = false
    internal._startingPromise = null
    const secondStart = client.start()
    secondStart.catch(() => {})

    // Resolve the FIRST loadConfig: its continuation captured the old generation,
    // which has since moved on (and _disposed is false), so it must bail with
    // PULL_DISPOSED and run no setConfig/connect.
    resolveFirst(VALID_CONFIG)

    await expect(firstStart).rejects.toMatchObject({
      ex: { error: 'PULL_DISPOSED' }
    })
    expect(internal._disposed).toBe(false)
    expect(setConfigSpy).not.toHaveBeenCalled()
    expect(connectSpy).not.toHaveBeenCalled()

    client.destroy()
  })
})
// endregion ////
