/**
 * Unit test for #148 — `PullClient.getDebugInfo()` must not expose the push JWT
 * (`token`) or the private `CHANNEL_ID`s anywhere in its output: not in the
 * `Path` field (the connection URL) and not in the `ChannelID` config field. It
 * is a developer-facing dump whose name invites logging, so both representations
 * are masked on the way out.
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

const LEAKY_PATH
  = 'wss://push.example/sub/?token=PUSH_JWT_PROBE&CHANNEL_ID=PRIV_CH/SHARED_CH&clientId=cid&revision=22'

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

function makeClient(): PullClient {
  return new PullClient({
    b24: {} as unknown as TypeB24,
    userId: 1,
    serverEnabled: true,
    skipStorageInit: true,
    skipCheckRevision: true
  })
}

// A stub connector — disconnect() is a no-op so destroy()'s teardown doesn't choke on it.
function stubConnector(connectionPath: string): { connectionPath: string, disconnect: () => void } {
  return { connectionPath, disconnect() {} }
}

describe('#148 PullClient.getDebugInfo() does not expose pull secrets', () => {
  it('masks the JWT + CHANNEL_ID in Path AND the private id in the ChannelID field; connector untouched', () => {
    const client = makeClient()
    ;(client as any)._config = {
      channels: { private: { id: 'PRIV_CHANNEL_ID_PROBE', end: 111 }, shared: { end: 222 } }
    }
    ;(client as any)._connectors[ConnectionType.WebSocket] = stubConnector(LEAKY_PATH)

    const info = client.getDebugInfo()

    // Path: query-string secrets masked, non-secret params kept.
    expect(info.Path).not.toContain('PUSH_JWT_PROBE')
    expect(info.Path).not.toContain('PRIV_CH')
    expect(info.Path).not.toContain('SHARED_CH')
    expect(info.Path).toContain('token=***REDACTED***')
    expect(info.Path).toContain('CHANNEL_ID=***REDACTED***')
    expect(info.Path).toContain('clientId=cid')
    expect(info.Path).toContain('revision=22')

    // ChannelID config field: the private channel id is masked here too, not just in Path.
    expect(info.ChannelID).toBe('***REDACTED***')
    expect(JSON.stringify(info)).not.toContain('PRIV_CHANNEL_ID_PROBE')

    // Only the debug view is redacted — the connector's real path is intact.
    expect((client as any)._connectors[ConnectionType.WebSocket].connectionPath).toBe(LEAKY_PATH)

    client.destroy()
  })

  it('redacts the Path on the LongPolling connector too (it is the active-connector getter, not WebSocket-specific)', () => {
    const client = makeClient()
    ;(client as any)._connectionType = ConnectionType.LongPolling
    ;(client as any)._connectors[ConnectionType.LongPolling] = stubConnector(LEAKY_PATH)

    const info = client.getDebugInfo()
    expect(info.Path).not.toContain('PUSH_JWT_PROBE')
    expect(info.Path).toContain('token=***REDACTED***')
    expect(info.Path).toContain('CHANNEL_ID=***REDACTED***')

    client.destroy()
  })

  it('shows "-" for Path when there is no active connector', () => {
    const client = makeClient()
    // No connector injected → the `connector` getter returns null.
    const info = client.getDebugInfo()
    expect(info.Path).toBe('-')

    client.destroy()
  })
})
