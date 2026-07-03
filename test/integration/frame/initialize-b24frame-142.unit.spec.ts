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

  it('concurrent callers during a retry share ONE init and both resolve (not poisoned by the prior failure)', async () => {
    // After a failure, a retry must succeed for every caller — the earlier
    // error must not leak into the new attempt. Two callers issued while the
    // retry's init is pending share the single cached promise and both resolve.
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

    // Retry: keep init pending so the second caller joins the same in-flight init.
    let resolveRetry!: () => void
    initBehavior = () => new Promise<void>((resolve) => {
      resolveRetry = resolve
    })
    const retryA = mod.initializeB24Frame() // fresh attempt, init pending
    const retryB = mod.initializeB24Frame() // shares retryA's cached promise
    retryA.catch(() => {})
    retryB.catch(() => {})

    resolveRetry()

    await expect(retryA).resolves.toBeTruthy()
    await expect(retryB).resolves.toBeTruthy() // must NOT reject with 'first boom'
    expect(frameConstructCount).toBe(2) // one failed attempt + one successful retry
  })

  it('never schedules a background timer — no busy-poll while init is pending or after failure', async () => {
    // Regression guard for the refactor: initialization is a single shared
    // promise, so it must not arm any setTimeout (the former startWatch armed a
    // self-rescheduling 50ms poll). No timers before, during, or after a failure.
    vi.useFakeTimers()
    try {
      setWindow(VALID_NAME)
      let rejectInit!: (error: any) => void
      initBehavior = () => new Promise<void>((_resolve, reject) => {
        rejectInit = reject
      })
      const { initializeB24Frame } = await loadLoader()

      const pA = initializeB24Frame()
      const pB = initializeB24Frame()
      pA.catch(() => {})
      pB.catch(() => {})

      // No poll timer while init is in flight.
      expect(vi.getTimerCount()).toBe(0)

      rejectInit(new Error('boom'))
      await vi.advanceTimersByTimeAsync(50 * 4)

      // And none left after a terminal failure.
      expect(vi.getTimerCount()).toBe(0)
      await expect(pA).rejects.toThrow('boom')
      await expect(pB).rejects.toThrow('boom')
    } finally {
      vi.useRealTimers()
    }
  })
})
