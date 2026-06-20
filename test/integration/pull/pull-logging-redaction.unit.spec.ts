/**
 * #43 — the pull layer logs server frames and events that are opaque or app-defined
 * and could carry a credential-shaped key (e.g. a channel `signature`). Two surfaces:
 *   - `JsonRpc` logs unknown / error RPC frames (three branches);
 *   - `PullClient.logMessage` logs every inbound event when debug is enabled.
 * Both must run through `redactSensitiveParams` first. Portal-free (jsSdk:unit).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { JsonRpc } from '../../../packages/jssdk/src/pullClient/json-rpc'
import { PullClient } from '../../../packages/jssdk/src/pullClient/client'
import type { TypeB24 } from '../../../packages/jssdk/src/types/b24'
import type { LoggerInterface } from '../../../packages/jssdk/src/types/logger'

const SIG_SENTINEL = 'PULL_SIGNATURE_SENTINEL'

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

describe('#43 pull JsonRpc redacts credential keys in logged unknown frames', () => {
  it('an unknown-id rpc response carrying a `signature` is redacted before logging', () => {
    const captured: Array<{ message: string, context?: unknown }> = []
    const rpc = new JsonRpc({ connector: { send: () => {} } } as never)
    rpc.setLogger(capturingLogger(captured))

    // id with no registered awaiter → logged as an error; must be redacted.
    rpc.parseJsonRpcMessage(JSON.stringify({ jsonrpc: '2.0', id: 99999, result: { signature: SIG_SENTINEL } }))

    const blob = JSON.stringify(captured)
    expect(blob).not.toContain(SIG_SENTINEL)
    expect(blob).toContain('***REDACTED***')
  })

  it('an unknown rpc packet (no jsonrpc field) carrying a `signature` is redacted', () => {
    const captured: Array<{ message: string, context?: unknown }> = []
    const rpc = new JsonRpc({ connector: { send: () => {} } } as never)
    rpc.setLogger(capturingLogger(captured))

    // neither request nor response → "unknown rpc packet" log of { decoded }
    rpc.parseJsonRpcMessage(JSON.stringify({ signature: SIG_SENTINEL }))

    const blob = JSON.stringify(captured)
    expect(blob).not.toContain(SIG_SENTINEL)
    expect(blob).toContain('***REDACTED***')
  })

  it('an unknown batch command carrying a `signature` is redacted', () => {
    const captured: Array<{ message: string, context?: unknown }> = []
    const rpc = new JsonRpc({ connector: { send: () => {} } } as never)
    rpc.setLogger(capturingLogger(captured))

    // array item that is neither request nor response → "unknown rpc command in batch"
    rpc.parseJsonRpcMessage(JSON.stringify([{ command: 'test', signature: SIG_SENTINEL }]))

    const blob = JSON.stringify(captured)
    expect(blob).not.toContain(SIG_SENTINEL)
    expect(blob).toContain('***REDACTED***')
  })
})

describe('#43 PullClient.logMessage redacts credential keys before logging', () => {
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

  function makeClient(captured: Array<{ message: string, context?: unknown }>): PullClient {
    const client = new PullClient({
      b24: {} as unknown as TypeB24,
      userId: 1,
      serverEnabled: true,
      skipStorageInit: true,
      skipCheckRevision: true
    })
    client.setLogger(capturingLogger(captured))
    // logMessage only logs in debug mode
    ;(client as any)._debug = true
    return client
  }

  it('an onPullEvent whose params carry a `signature` is redacted (else branch)', () => {
    const captured: Array<{ message: string, context?: unknown }> = []
    const client = makeClient(captured)

    ;(client as any).logMessage({
      module_id: 'crm', command: 'onX', params: { signature: SIG_SENTINEL }, extra: {}
    })

    const blob = JSON.stringify(captured)
    expect(blob).not.toContain(SIG_SENTINEL)
    expect(blob).toContain('***REDACTED***')
    client.destroy()
  })

  it('an onPullOnlineEvent whose params carry a `signature` is redacted (online branch)', () => {
    const captured: Array<{ message: string, context?: unknown }> = []
    const client = makeClient(captured)

    ;(client as any).logMessage({
      module_id: 'online', command: 'onX', params: { signature: SIG_SENTINEL }, extra: {}
    })

    const blob = JSON.stringify(captured)
    expect(blob).not.toContain(SIG_SENTINEL)
    expect(blob).toContain('***REDACTED***')
    client.destroy()
  })
})
