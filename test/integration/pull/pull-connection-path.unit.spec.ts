/**
 * #238 — `PullClient.getConnectionPath()` composed the `CHANNEL_ID` query param by
 * pushing the private channel id TWICE (and an empty segment when `private` had no
 * `id`), producing a malformed value like `PRIV/PRIV` or a leading `/`. It must be
 * one guarded push per channel. Portal-free (jsSdk:unit).
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

// Build the LongPolling connection path for a given `channels` config and read
// back the CHANNEL_ID query param (decoded). No server version/mode → the
// jsonRpc / shared-mode branches stay off, so params carry just CHANNEL_ID.
function channelIdFor(channels: Record<string, unknown>): string | null {
  const client = new PullClient({
    b24: {} as unknown as TypeB24,
    userId: 1,
    serverEnabled: true,
    skipStorageInit: true,
    skipCheckRevision: true
  })
  ;(client as any)._isSecure = false
  ;(client as any)._config = { server: { long_polling: 'http://push.example/lp' }, channels }
  const path = client.getConnectionPath(ConnectionType.LongPolling)
  return new URL(path).searchParams.get('CHANNEL_ID')
}

describe('#238 getConnectionPath composes CHANNEL_ID without duplication', () => {
  it('private-only → the private id once, not doubled', () => {
    expect(channelIdFor({ private: { id: 'PRIV' } })).toBe('PRIV')
  })

  it('private + shared → "private/shared"', () => {
    expect(channelIdFor({ private: { id: 'PRIV' }, shared: { id: 'SHARED' } })).toBe('PRIV/SHARED')
  })

  it('no channel ids → throws "Empty channels" (no empty segment slips through)', () => {
    expect(() => channelIdFor({})).toThrow('Empty channels')
    expect(() => channelIdFor({ private: {} })).toThrow('Empty channels')
  })
})
