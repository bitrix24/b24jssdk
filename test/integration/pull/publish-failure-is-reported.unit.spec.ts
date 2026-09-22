/**
 * A failed publish must not look like a successful one.
 *
 * `*.unit.spec.ts` rather than an integration spec (testing.md's exception):
 * the behaviour under test is what happens when the portal REFUSES a request,
 * and a live portal that answers correctly cannot produce it.
 *
 * This was measured on a real portal before it was written. `PullClient`
 * reported that a message had been accepted, nothing ever arrived, and nothing
 * anywhere said why — because two independent defects lined up:
 *
 *  1. `sendMessageBatch` started the channel-id lookup and dropped the promise,
 *     so it resolved `undefined` before the lookup had answered.
 *  2. `ChannelManager.getPublicIds` caught the REST failure and resolved `{}`,
 *     so the message was encoded with no receivers and the push server dropped
 *     it silently.
 *
 * The underlying cause is not a bug at all, which is why it has to be said out
 * loud: `pull.channel.public.list` is not part of the application REST surface.
 * An application's Pull client is documented as receive-only — the back end
 * puts messages into the channel with `pull.application.event.add`.
 */
import { describe, it, expect, vi } from 'vitest'
import { ChannelManager } from '../../../packages/jssdk/src/pullClient/channel-manager'
import { PullClient } from '../../../packages/jssdk/src/pullClient/client'
import { SdkError } from '../../../packages/jssdk/src/core/sdk-error'
import type { TypeB24 } from '../../../packages/jssdk/src/types/b24'
import type { TypePullClientParams } from '../../../packages/jssdk/src/types/pull'

/** A `TypeB24` whose only job is to refuse the one call under test. */
function b24Refusing(error: Error): TypeB24 {
  return {
    actions: { v2: { call: { make: () => Promise.reject(error) } } },
    getLogger: () => undefined
  } as unknown as TypeB24
}

function b24Answering(result: unknown): TypeB24 {
  return {
    actions: {
      v2: {
        call: {
          make: () => Promise.resolve({
            getData: () => ({ result })
          })
        }
      }
    },
    getLogger: () => undefined
  } as unknown as TypeB24
}

function build(b24: TypeB24): ChannelManager {
  return new ChannelManager({ b24 } as never)
}

describe('pull: a refused channel lookup is reported, not swallowed', () => {
  it('rejects instead of resolving an empty map', async () => {
    // The empty map is the dangerous answer: it is a *valid* input to
    // `encodeMessageBatch`, which then builds a message addressed to nobody.
    const manager = build(b24Refusing(new Error('ERROR_METHOD_NOT_FOUND')))

    await expect(manager.getPublicIds([42])).rejects.toBeInstanceOf(SdkError)
  })

  it('carries a code a caller can branch on', async () => {
    const manager = build(b24Refusing(new Error('ERROR_METHOD_NOT_FOUND')))

    await expect(manager.getPublicIds([42])).rejects.toMatchObject({
      code: 'JSSDK_PULL_PUBLIC_IDS_UNAVAILABLE'
    })
  })

  it('names the method that failed and the supported alternative', async () => {
    // The whole point of the change: the message has to answer "why did my
    // message go nowhere?" without a debugger. Both halves are pinned because
    // either one alone leaves the reader stuck.
    const manager = build(b24Refusing(new Error('ERROR_METHOD_NOT_FOUND')))

    const error = await manager.getPublicIds([42]).catch((thrown: unknown) => thrown)

    expect(String((error as Error).message)).toContain('pull.channel.public.list')
    expect(String((error as Error).message)).toContain('pull.application.event.add')
  })

  it('interpolates no caller value into the description', async () => {
    // `SdkError` does NOT run its description through the log redaction, so a
    // caller value reaching it would travel into logs and error messages
    // verbatim. Only the method name — a constant — is interpolated.
    const manager = build(b24Refusing(new Error('secret-looking-value-12345')))

    const error = await manager.getPublicIds([42]).catch((thrown: unknown) => thrown)

    expect(String((error as Error).message)).not.toContain('secret-looking-value-12345')
    expect(String((error as Error).message)).not.toContain('42')
  })

  it('sendMessage() REJECTS rather than reporting a send that never happened', async () => {
    // The defect this exists for. `sendMessageBatch` used to start the channel
    // lookup and drop the promise, so it resolved `undefined` immediately —
    // `sendMessage()` reported success before the lookup had even answered, and
    // the failure inside became an unhandled rejection nobody saw. Reverting
    // the `return` in `client.ts` turns this case green again, which is exactly
    // what it is here to prevent.
    const client = new PullClient({
      b24: b24Refusing(new Error('ERROR_METHOD_NOT_FOUND')) as unknown as TypePullClientParams['b24'],
      userId: 1,
      skipStorageInit: true
    })

    // Publishing is gated on the server config, which no portal supplied here,
    // so these are forced to the state the gate checks.
    const internals = client as unknown as {
      _config: unknown
      _connectors: { webSocket: { send: () => boolean, connected: boolean } }
      _connectionType: string
    }
    internals._config = { server: { version: 4, publish_enabled: true } }

    await expect(
      client.sendMessage([42], 'application', 'probe', { hello: 'world' })
    ).rejects.toMatchObject({ code: 'JSSDK_PULL_PUBLIC_IDS_UNAVAILABLE' })
  })

  it('still resolves when the portal answers', async () => {
    // The rejection must be about failure only — a working portal is unchanged.
    const manager = build(b24Answering({
      42: { id: 42, public_id: 'abc', signature: 'def', end: '2099-01-01T00:00:00+00:00' }
    }))

    await expect(manager.getPublicIds([42])).resolves.toBeTypeOf('object')
  })

  it('does not call the portal at all when every id is already cached', async () => {
    // Guards the early return: a cache hit must not be turned into a request,
    // and therefore must not be able to reject.
    const make = vi.fn()
    const manager = build({
      actions: { v2: { call: { make } } },
      getLogger: () => undefined
    } as unknown as TypeB24)

    await expect(manager.getPublicIds([])).resolves.toStrictEqual({})
    expect(make).not.toHaveBeenCalled()
  })
})
