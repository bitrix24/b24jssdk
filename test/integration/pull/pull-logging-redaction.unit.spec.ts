/**
 * #43 — the pull JSON-RPC layer logs unknown/error server frames, which are opaque
 * and could carry a credential-shaped key (e.g. a channel `signature`). Those logs
 * must be run through `redactSensitiveParams` first. Portal-free (jsSdk:unit).
 */
import { describe, it, expect } from 'vitest'
import { JsonRpc } from '../../../packages/jssdk/src/pullClient/json-rpc'
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
})
