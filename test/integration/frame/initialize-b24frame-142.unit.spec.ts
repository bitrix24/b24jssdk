/**
 * #142 — `initializeB24Frame()` must not strand callers or leak a frame on a
 * failed init.
 *
 * The loader keeps module-level singleton state, so each test re-imports it
 * fresh via `vi.resetModules()`. `B24Frame` is mocked so we can (a) count how
 * many times it is constructed — the missing-DOMAIN path must construct ZERO —
 * and (b) drive its `init()` outcome. Runs in the `jsSdk:unit` project (Node,
 * no DOM), so a minimal `window` stub provides `name` + `setTimeout`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Controls shared with the hoisted B24Frame mock below.
let frameConstructCount = 0
let frameDestroyCount = 0
let initBehavior: () => Promise<void> = () => Promise.resolve()

vi.mock('../../../packages/jssdk/src/frame', () => ({
  B24Frame: class {
    constructor(_queryParams: any, _options: any) {
      frameConstructCount += 1
    }

    init(): Promise<void> {
      return initBehavior()
    }

    destroy(): void {
      frameDestroyCount += 1
    }
  }
}))

function setWindow(name: string): void {
  ;(globalThis as any).window = {
    name,
    setTimeout: (fn: (...args: any[]) => void, ms?: number) => setTimeout(fn, ms)
  }
}

const VALID_NAME = 'acme.bitrix24.com|1|APPSID123'

async function loadLoader() {
  return import('../../../packages/jssdk/src/loader-b24frame')
}

describe('#142 initializeB24Frame() failure handling', () => {
  beforeEach(() => {
    frameConstructCount = 0
    frameDestroyCount = 0
    initBehavior = () => Promise.resolve()
    vi.resetModules()
  })

  afterEach(() => {
    delete (globalThis as any).window
  })

  it('rejects and constructs NO frame when window.name lacks DOMAIN/APP_SID', async () => {
    setWindow('') // no name → DOMAIN/APP_SID stay null
    const { initializeB24Frame } = await loadLoader()

    await expect(initializeB24Frame()).rejects.toMatchObject({
      code: 'JSSDK_CLIENT_SIDE_WARNING'
    })
    // The core bug: execution used to fall through and build a B24Frame (which
    // subscribes a window `message` listener) + call .init(). It must not.
    expect(frameConstructCount).toBe(0)
  })

  it('does not strand concurrent callers on the missing-DOMAIN path', async () => {
    setWindow('')
    const { initializeB24Frame } = await loadLoader()

    // Both are issued before any await; the second must NOT hang forever.
    const p1 = initializeB24Frame()
    const p2 = initializeB24Frame()

    await expect(p1).rejects.toMatchObject({ code: 'JSSDK_CLIENT_SIDE_WARNING' })
    await expect(p2).rejects.toMatchObject({ code: 'JSSDK_CLIENT_SIDE_WARNING' })
    expect(frameConstructCount).toBe(0)
  })

  it('rejects a queued caller when the first init() rejects asynchronously', async () => {
    setWindow(VALID_NAME) // valid params → a frame IS constructed, init pending
    let rejectInit!: (error: any) => void
    initBehavior = () => new Promise<void>((_resolve, reject) => {
      rejectInit = reject
    })
    const { initializeB24Frame } = await loadLoader()

    const p1 = initializeB24Frame() // first call — init() pending
    const p2 = initializeB24Frame() // queued behind the pending first call
    p1.catch(() => {})
    p2.catch(() => {})

    const boom = new Error('init boom')
    rejectInit(boom)

    // The queued caller must be rejected (previously it waited on a promise
    // that never settled while the 50ms watch looped forever).
    await expect(p1).rejects.toBe(boom)
    await expect(p2).rejects.toBe(boom)
    expect(frameConstructCount).toBe(1)
  })

  it('allows a retry after a failure (isMakeFirstCall + connectError are reset)', async () => {
    setWindow('') // first attempt fails: missing DOMAIN
    const mod = await loadLoader()

    await expect(mod.initializeB24Frame()).rejects.toMatchObject({
      code: 'JSSDK_CLIENT_SIDE_WARNING'
    })
    expect(frameConstructCount).toBe(0)

    // Environment fixed → a retry must be able to succeed from scratch, not be
    // poisoned by the previous connectError.
    ;(globalThis as any).window.name = VALID_NAME
    initBehavior = () => Promise.resolve()

    const b24 = await mod.initializeB24Frame()
    expect(b24).toBeTruthy()
    expect(frameConstructCount).toBe(1) // only the successful retry built a frame
  })

  it('destroys the frame from a failed async init before a retry builds a new one', async () => {
    setWindow(VALID_NAME)
    let rejectInit!: (error: any) => void
    initBehavior = () => new Promise<void>((_resolve, reject) => {
      rejectInit = reject
    })
    const mod = await loadLoader()

    const failing = mod.initializeB24Frame()
    failing.catch(() => {})
    rejectInit(new Error('init boom'))
    await expect(failing).rejects.toThrow('init boom')

    // The frame built by the failed attempt must be torn down (its window
    // `message` listener removed) so a retry doesn't leave two live handlers.
    expect(frameConstructCount).toBe(1)
    expect(frameDestroyCount).toBe(1)

    // Retry succeeds and builds exactly one fresh frame.
    initBehavior = () => Promise.resolve()
    const b24 = await mod.initializeB24Frame()
    expect(b24).toBeTruthy()
    expect(frameConstructCount).toBe(2)
  })

  it('a caller that QUEUES via startWatch during a retry resolves (not poisoned by the old connectError)', async () => {
    // Pins the entry-time `connectError = null` reset: the retry keeps its init
    // pending so a second retry caller goes through the isMakeFirstCall/startWatch
    // queue path (not a direct resolve). A stale connectError would make the
    // watch reject this queued caller.
    setWindow(VALID_NAME)
    let rejectFirst!: (error: any) => void
    initBehavior = () => new Promise<void>((_resolve, reject) => {
      rejectFirst = reject
    })
    const mod = await loadLoader()

    const failing = mod.initializeB24Frame()
    failing.catch(() => {})
    rejectFirst(new Error('first boom'))
    await expect(failing).rejects.toThrow('first boom')

    // Retry: keep init pending so the second caller queues via startWatch.
    let resolveRetry!: () => void
    initBehavior = () => new Promise<void>((resolve) => {
      resolveRetry = resolve
    })
    const retryA = mod.initializeB24Frame() // fresh first-call, init pending
    const retryB = mod.initializeB24Frame() // queued via startWatch
    retryA.catch(() => {})
    retryB.catch(() => {})

    resolveRetry()

    await expect(retryA).resolves.toBeTruthy()
    await expect(retryB).resolves.toBeTruthy() // must NOT be rejected with 'first boom'
  })

  it('stops the watch loop after a failure — no infinite 50ms polling', async () => {
    // Pins startWatch's `connectError === null` termination guard. A queued
    // caller arms the watch; once init fails the loop must stop, leaving no
    // pending timer. Without the guard the watch re-arms itself forever.
    vi.useFakeTimers()
    try {
      setWindow(VALID_NAME)
      let rejectInit!: (error: any) => void
      initBehavior = () => new Promise<void>((_resolve, reject) => {
        rejectInit = reject
      })
      const { initializeB24Frame } = await loadLoader()

      const pA = initializeB24Frame() // first call, init pending
      const pB = initializeB24Frame() // queued → arms startWatch
      pA.catch(() => {})
      pB.catch(() => {})

      expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1)

      rejectInit(new Error('boom'))
      // Flush the .catch/failInit microtasks and run the armed watch timer.
      await vi.advanceTimersByTimeAsync(50 * 4)

      // The watch must have terminated: nothing left polling.
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
