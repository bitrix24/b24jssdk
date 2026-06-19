/**
 * Unit test for #148 — `PullClient.getDebugInfo()` must not expose the push JWT
 * (`token`) or the private `CHANNEL_ID`s in its `Path` field. `getDebugInfo()`
 * is a developer-facing dump whose name invites logging, so the connection path
 * (which carries those secrets in its query string) is redacted on the way out.
 *
 * Portal-free (`jsSdk:unit`): the connector is stubbed, so no real connection is
 * made. A minimal `window` / `document` stub keeps construction running under
 * Node; `getDebugInfo()` reads `navigator.onLine`, which is harmlessly
 * `undefined` on Node's built-in `navigator` (a getter-only global we leave alone).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PullClient } from '../../../packages/jssdk/src/pullClient/client'
import { ConnectionType } from '../../../packages/jssdk/src/types/pull'
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

describe('#148 PullClient.getDebugInfo() redacts the connection path', () => {
  it('masks the push JWT (token) and CHANNEL_ID in Path, leaving the connector untouched', () => {
    const client = new PullClient({
      b24: {} as unknown as TypeB24,
      userId: 1,
      serverEnabled: true,
      skipStorageInit: true,
      skipCheckRevision: true
    })
    const leakyPath
      = 'wss://push.example/sub/?token=PUSH_JWT_PROBE&CHANNEL_ID=PRIV_CH/SHARED_CH&clientId=cid&revision=22'
    // Inject a stub connector on the default WebSocket connection type
    // (disconnect() is a no-op so destroy()'s teardown doesn't choke on the stub).
    ;(client as any)._connectors[ConnectionType.WebSocket] = {
      connectionPath: leakyPath,
      disconnect() {}
    }

    const info = client.getDebugInfo()

    expect(info.Path).not.toContain('PUSH_JWT_PROBE')
    expect(info.Path).not.toContain('PRIV_CH')
    expect(info.Path).not.toContain('SHARED_CH')
    expect(info.Path).toContain('token=***REDACTED***')
    expect(info.Path).toContain('CHANNEL_ID=***REDACTED***')
    expect(info.Path).toContain('clientId=cid') // non-secret param survives

    // Only the debug view is redacted — the connector's real path is intact.
    expect((client as any)._connectors[ConnectionType.WebSocket].connectionPath).toBe(leakyPath)

    client.destroy()
  })
})
