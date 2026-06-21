/**
 * #43 — the frame `MessageManager` carries credentials both ways over `postMessage`:
 *   - inbound, the `refreshAuth` / `getInitData` responses carry `AUTH_ID` /
 *     `REFRESH_ID` — the handler must log only the callback id/origin;
 *   - outbound, `send('setAppOption'/'setUserOption', …)` assembles a `cmd`
 *     string that embeds the serialised option `value` (an app may store a
 *     secret there) — the log must not echo the `cmd`.
 * Portal-free (jsSdk:unit).
 */
import { describe, it, expect } from 'vitest'
import { MessageManager } from '../../../packages/jssdk/src/frame/message/controller'
import type { LoggerInterface } from '../../../packages/jssdk/src/types/logger'

const ORIGIN = 'https://portal.bitrix24.com'
const AUTH_SENTINEL = 'FRAME_AUTH_ID_SENTINEL'
const REFRESH_SENTINEL = 'FRAME_REFRESH_ID_SENTINEL'
const OPTION_SENTINEL = 'FRAME_APP_OPTION_SENTINEL'

function capturingLogger(captured: Array<{ message: string, context?: unknown }>): LoggerInterface {
  const push = (message: string, context?: unknown): void => {
    captured.push({ message, context })
  }
  const sink = () => async (message: string, context?: unknown) => push(message, context)
  return {
    log: async (_l: unknown, message: string, context?: unknown) => push(message, context),
    debug: sink(), info: sink(), notice: sink(), warning: sink(),
    error: sink(), critical: sink(), alert: sink(), emergency: sink()
  } as unknown as LoggerInterface
}

describe('#43 frame MessageManager does not log inbound auth tokens', () => {
  it('_runCallback logs only the callback id/origin, never the AUTH_ID/REFRESH_ID payload', () => {
    const captured: Array<{ message: string, context?: unknown }> = []
    const mgr = new MessageManager({ getTargetOrigin: () => ORIGIN } as never)
    mgr.setLogger(capturingLogger(captured))

    const data = `cb1:${JSON.stringify({ AUTH_ID: AUTH_SENTINEL, REFRESH_ID: REFRESH_SENTINEL, AUTH_EXPIRES: 123 })}`
    mgr._runCallback({ origin: ORIGIN, data } as MessageEvent)

    const blob = JSON.stringify(captured)
    expect(blob).not.toContain(AUTH_SENTINEL)
    expect(blob).not.toContain(REFRESH_SENTINEL)
    expect(blob).toContain('cb1') // sanity: the callback id IS logged
  })
})

describe('#43 frame MessageManager.send does not log app-defined option values', () => {
  it('send(setAppOption, { value }) logs the command + callback key, never the cmd payload', () => {
    const captured: Array<{ message: string, context?: unknown }> = []
    const mgr = new MessageManager({
      getTargetOrigin: () => ORIGIN,
      getAppSid: () => 'APPSID'
    } as never)
    mgr.setLogger(capturingLogger(captured))

    // `send` posts to the parent window; stub it so the synchronous body runs.
    const savedParent = (globalThis as any).parent
    ;(globalThis as any).parent = { postMessage() {} }
    try {
      // fire-and-forget: the promise only settles on an inbound callback we never send
      void mgr.send('setAppOption', { value: OPTION_SENTINEL }).catch(() => {})
    } finally {
      ;(globalThis as any).parent = savedParent
    }

    const blob = JSON.stringify(captured)
    expect(blob).not.toContain(OPTION_SENTINEL)
    expect(blob).toContain('setAppOption') // sanity: the command name IS logged
  })
})

describe('#244 frame MessageManager surfaces a rejected foreign-origin message', () => {
  it('logs the origins (rejected + expected) but never the event.data payload', () => {
    const captured: Array<{ message: string, context?: unknown }> = []
    const mgr = new MessageManager({ getTargetOrigin: () => ORIGIN } as never)
    mgr.setLogger(capturingLogger(captured))

    const FOREIGN = 'https://evil.example'
    const data = `cb1:${JSON.stringify({ AUTH_ID: AUTH_SENTINEL })}`
    mgr._runCallback({ origin: FOREIGN, data } as MessageEvent)

    const blob = JSON.stringify(captured)
    expect(blob).toContain(FOREIGN) // the rejected origin IS surfaced
    expect(blob).toContain(ORIGIN) // and the expected one
    expect(blob).not.toContain(AUTH_SENTINEL) // but never the payload
  })

  it('warns only once per distinct foreign origin (dedup against flood)', () => {
    const captured: Array<{ message: string, context?: unknown }> = []
    const mgr = new MessageManager({ getTargetOrigin: () => ORIGIN } as never)
    mgr.setLogger(capturingLogger(captured))

    const ev = { origin: 'https://evil.example', data: 'cb1:{}' } as MessageEvent
    mgr._runCallback(ev)
    mgr._runCallback(ev)
    mgr._runCallback(ev)

    const rejections = captured.filter(c => c.message === 'message rejected: unexpected origin')
    expect(rejections).toHaveLength(1)
  })
})
