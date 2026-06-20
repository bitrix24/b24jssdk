/**
 * #43 — the frame `MessageManager` receives auth tokens from the parent window
 * over `postMessage` (the `refreshAuth` / `getInitData` responses carry `AUTH_ID`
 * and `REFRESH_ID`). The inbound handler must log only the callback id/origin,
 * never the raw payload. Portal-free (jsSdk:unit).
 */
import { describe, it, expect } from 'vitest'
import { MessageManager } from '../../../packages/jssdk/src/frame/message/controller'
import type { LoggerInterface } from '../../../packages/jssdk/src/types/logger'

const ORIGIN = 'https://portal.bitrix24.com'
const AUTH_SENTINEL = 'FRAME_AUTH_ID_SENTINEL'
const REFRESH_SENTINEL = 'FRAME_REFRESH_ID_SENTINEL'

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
