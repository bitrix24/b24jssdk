/**
 * #146 — three ways `MessageManager` could leave a frame in a bad state.
 *
 * None of them needs an attacker. `postMessage` is a shared channel, so a page
 * hosting the frame may carry other libraries posting on the same origin, and
 * `B24Frame.destroy()` is ordinary SPA teardown.
 *
 *   1. `event.data.split(':')` assumed a string. A same-origin peer posting an
 *      object threw a `TypeError` out of a window event listener.
 *   2. `JSON.parse(cmd.args)` was unguarded. A malformed payload threw out of
 *      the listener too, and the promise waiting on that command was then left
 *      pending forever — the caller waited for an answer that had arrived.
 *   3. `unsubscribe()` removed the listener and nothing else, so every in-flight
 *      send was stranded with its timer armed and its map entry held. One such
 *      set per mount/unmount cycle.
 *
 * Portal-free (jsSdk:unit). The project's environment is `node`, so `window` and
 * `parent` are stubbed here — `send()` uses `window.setTimeout` and posts to
 * `parent`, and `unsubscribe()` touches `window.removeEventListener`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MessageManager } from '../../../packages/jssdk/src/frame/message/controller'
import { SdkError } from '../../../packages/jssdk/src/core/sdk-error'
import type { LoggerInterface } from '../../../packages/jssdk/src/types/logger'

const ORIGIN = 'https://portal.bitrix24.com'

/** Every `cmd` string handed to `parent.postMessage`, newest last. */
let posted: string[] = []
let savedWindow: unknown
let savedParent: unknown

beforeEach(() => {
  posted = []
  savedWindow = (globalThis as any).window
  savedParent = (globalThis as any).parent
  ;(globalThis as any).window = {
    addEventListener() {},
    removeEventListener() {},
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms)
  }
  ;(globalThis as any).parent = {
    postMessage(cmd: unknown) {
      posted.push(String(cmd))
    }
  }
})

afterEach(() => {
  ;(globalThis as any).window = savedWindow
  ;(globalThis as any).parent = savedParent
})

function silentLogger(): LoggerInterface {
  const sink = () => async () => {}
  return {
    log: async () => {}, debug: sink(), info: sink(), notice: sink(),
    warning: sink(), error: sink(), critical: sink(), alert: sink(),
    emergency: sink()
  } as unknown as LoggerInterface
}

function manager(): MessageManager {
  const mgr = new MessageManager({
    getTargetOrigin: () => ORIGIN,
    getAppSid: () => 'APPSID'
  } as never)
  mgr.setLogger(silentLogger())
  return mgr
}

/**
 * The callback key is generated inside `send()` and is only observable in the
 * `cmd` string posted to the parent — `<command>:<params?>:<key>:<appSid>`,
 * with empty segments dropped. With no params that is `[command, key, appSid]`.
 */
function lastCallbackKey(): string {
  const cmd = posted.at(-1)
  if (!cmd) {
    throw new Error('send() posted nothing to the parent')
  }
  const parts = cmd.split(':')
  const key = parts.at(-2)
  if (!key) {
    throw new Error(`no callback key in posted cmd: ${cmd}`)
  }
  return key
}

describe('#146 inbound data that is not our wire format is ignored, not thrown on', () => {
  it.each([
    ['an object', { hello: 'world' }],
    ['an array', ['a', 'b']],
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
    ['an empty string', '']
  ])('does not throw when a same-origin peer posts %s', (_label, data) => {
    const mgr = manager()

    // This runs inside a window 'message' listener: a throw here is an uncaught
    // error, raised on traffic that is simply not ours.
    expect(() => mgr._runCallback({ origin: ORIGIN, data } as MessageEvent)).not.toThrow()
  })

  it('still resolves a well-formed string message', async () => {
    const mgr = manager()

    const pending = mgr.send('getInitData')
    mgr._runCallback({
      origin: ORIGIN,
      data: `${lastCallbackKey()}:${JSON.stringify({ ok: true })}`
    } as MessageEvent)

    await expect(pending).resolves.toEqual({ ok: true })
  })
})

describe('#146 a malformed payload settles the waiting promise instead of stranding it', () => {
  it('rejects with JSSDK_FRAME_BAD_PAYLOAD rather than hanging', async () => {
    const mgr = manager()

    const pending = mgr.send('getInitData')
    mgr._runCallback({ origin: ORIGIN, data: `${lastCallbackKey()}:{not json` } as MessageEvent)

    // Before the fix this never settled at all, so a plain await would hang the
    // run rather than fail it.
    await expect(pending).rejects.toThrow(SdkError)
    await expect(pending).rejects.toMatchObject({ code: 'JSSDK_FRAME_BAD_PAYLOAD' })
  })

  it('does not throw out of the listener on a malformed payload', () => {
    const mgr = manager()

    const pending = mgr.send('getInitData')
    pending.catch(() => {})

    expect(() =>
      mgr._runCallback({ origin: ORIGIN, data: `${lastCallbackKey()}:{not json` } as MessageEvent)
    ).not.toThrow()
  })

  it('is silent when nothing is waiting — the command may already have timed out', () => {
    const mgr = manager()

    expect(() =>
      mgr._runCallback({ origin: ORIGIN, data: 'unknown-key:{not json' } as MessageEvent)
    ).not.toThrow()
  })
})

describe('#146 unsubscribe() tears the manager down instead of stranding it', () => {
  it('rejects an in-flight send with JSSDK_FRAME_DISPOSED', async () => {
    const mgr = manager()

    const pending = mgr.send('getInitData')
    mgr.unsubscribe()

    await expect(pending).rejects.toMatchObject({ code: 'JSSDK_FRAME_DISPOSED' })
  })

  it('clears the isSafely timer rather than leaving it to no-op', async () => {
    vi.useFakeTimers()
    try {
      const mgr = manager()

      const pending = mgr.send('someCommand', { isSafely: true, safelyTime: 10 })
      pending.catch(() => {})

      expect(vi.getTimerCount()).toBe(1)
      mgr.unsubscribe()

      // Asserting on the timer itself, not on the outcome. The send() timeout
      // callback re-checks the callback map before resolving, so a timer left
      // armed would fire, find nothing, and do nothing — the promise would still
      // be rejected and an outcome-based assertion would pass with the
      // clearTimeout deleted. What must hold is that no timer survives teardown:
      // a destroyed frame should leave nothing on the event loop.
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a send that deliberately opted out of isSafely', async () => {
    const mgr = manager()

    // closeApplication() / closeSliderAppPage() pass isSafely: false on purpose
    // — "everything will be closed, and timeout will not be able to do
    // anything". They are also the calls an app makes while tearing itself
    // down, so racing them against destroy() is the realistic case, and the one
    // that surfaces as an unhandled rejection if the caller discarded the
    // promise.
    const pending = mgr.send('closeApplication', { isSafely: false })
    mgr.unsubscribe()

    await expect(pending).rejects.toMatchObject({ code: 'JSSDK_FRAME_DISPOSED' })
  })

  it('resets the foreign-origin dedup set, so a reused origin warns again', () => {
    const captured: string[] = []
    const mgr = new MessageManager({ getTargetOrigin: () => ORIGIN } as never)
    mgr.setLogger({
      ...silentLogger(),
      warning: async (message: string) => { captured.push(message) }
    } as unknown as LoggerInterface)

    const foreign = { origin: 'https://peer.example', data: 'x:{}' } as MessageEvent
    mgr._runCallback(foreign)
    mgr._runCallback(foreign)
    expect(captured).toHaveLength(1) // deduped

    mgr.unsubscribe()
    mgr._runCallback(foreign)
    expect(captured).toHaveLength(2) // set was cleared at teardown
  })

  it('drops placement callbacks, which cannot fire once the listener is gone', () => {
    const mgr = manager()
    const seen: unknown[] = []

    const pending = mgr.send('bindEvent', {
      callBack: (args: unknown) => seen.push(args),
      isSafely: true
    })
    pending.catch(() => {})
    const key = lastCallbackKey()

    mgr.unsubscribe()
    mgr._runCallback({ origin: ORIGIN, data: `${key}:${JSON.stringify({ late: true })}` } as MessageEvent)

    expect(seen).toEqual([])
  })
})

describe('#146 the foreign-origin warning set cannot grow without bound', () => {
  it('stops growing past the cap, and keeps rejecting the messages', () => {
    const captured: string[] = []
    const mgr = new MessageManager({ getTargetOrigin: () => ORIGIN } as never)
    mgr.setLogger({
      ...silentLogger(),
      warning: async (message: string) => { captured.push(message) }
    } as unknown as LoggerInterface)

    // The dedup key is chosen by the sender, so an unbounded supply of distinct
    // origins would otherwise mean an unbounded set.
    for (let i = 0; i < 200; i++) {
      mgr._runCallback({ origin: `https://peer-${i}.example`, data: 'x:{}' } as MessageEvent)
    }

    expect(captured.length).toBeLessThanOrEqual(50)
    expect(captured.length).toBeGreaterThan(0)
  })
})
