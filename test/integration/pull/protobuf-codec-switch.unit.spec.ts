/**
 * The `protobufCodec` option must actually select a codec.
 *
 * A switch nobody exercises is the failure mode this whole change is shaped
 * around: the lite codec is opt-in precisely so the proven path stays the
 * default, and that is worth nothing if the option is ignored, or if it is
 * honoured in one direction and not the other.
 *
 * So three things are pinned here: the default is the vendored library, the
 * option flips both the encode and the decode path, and — because the two
 * codecs agree — the only way to tell them apart from outside is to break one
 * deliberately. That is what the spy does.
 */
import { describe, it, expect, vi } from 'vitest'
import { PullClient } from '../../../packages/jssdk/src/pullClient/client'
import * as vendored from '../../../packages/jssdk/src/pullClient/protobuf'
import * as lite from '../../../packages/jssdk/src/pullClient/protobuf-lite/messages'
import type { TypePullClientParams } from '../../../packages/jssdk/src/types/pull'

const b24 = { getLogger: () => undefined } as unknown as TypePullClientParams['b24']

function build(protobufCodec?: 'vendored' | 'lite') {
  return new PullClient({
    b24,
    userId: 1,
    skipStorageInit: true,
    ...(protobufCodec === undefined ? {} : { protobufCodec })
  })
}

/** `encodeMessageBatch` is private; the tests drive it the way the client does. */
function encode(client: PullClient) {
  return (client as unknown as {
    encodeMessageBatch: (batch: unknown[], publicIds: unknown) => Uint8Array
  }).encodeMessageBatch(
    [{ body: { module_id: 'main' }, expiry: 0, channelList: ['abc.def'] }],
    {}
  )
}

function decode(client: PullClient, raw: ArrayBuffer) {
  return (client as unknown as {
    extractProtobufMessages: (event: ArrayBuffer) => unknown[]
  }).extractProtobufMessages(raw)
}

describe('pull: the protobufCodec switch', () => {
  it('defaults to the vendored library', () => {
    const spy = vi.spyOn(vendored.RequestBatch, 'encode')
    try {
      encode(build())
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('an explicit "vendored" is the same as the default', () => {
    const spy = vi.spyOn(vendored.RequestBatch, 'encode')
    try {
      encode(build('vendored'))
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('"lite" encodes without touching the library', () => {
    const spy = vi.spyOn(vendored.RequestBatch, 'encode')
    try {
      encode(build('lite'))
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('"lite" and the default produce identical bytes', () => {
    // The point of the switch: swapping it must change nothing observable.
    const hex = (v: Uint8Array) => [...v].map(b => b.toString(16).padStart(2, '0')).join(' ')

    expect(hex(encode(build('lite')))).toBe(hex(encode(build())))
  })

  it('the switch reaches the DECODE path too, not only encode', () => {
    // Encode and decode are selected at two separate call sites; wiring one and
    // forgetting the other would leave a client that writes with one codec and
    // reads with the other, which no byte comparison would notice.
    const raw = vendored.ResponseBatch.encode(vendored.ResponseBatch.create({
      responses: [{ outgoingMessages: { messages: [{ id: Uint8Array.from([1]), body: '{"module_id":"main"}' }] } }]
    })).finish()

    const spyLite = vi.spyOn(lite, 'decodeResponseBatch')
    try {
      decode(build('lite'), raw.buffer as ArrayBuffer)
      expect(spyLite).toHaveBeenCalled()
    } finally {
      spyLite.mockRestore()
    }
  })

  it('the default decode path does not reach the lite codec', () => {
    const raw = vendored.ResponseBatch.encode(vendored.ResponseBatch.create({
      responses: [{ outgoingMessages: { messages: [{ id: Uint8Array.from([1]), body: '{"module_id":"main"}' }] } }]
    })).finish()

    const spyLite = vi.spyOn(lite, 'decodeResponseBatch')
    try {
      decode(build(), raw.buffer as ArrayBuffer)
      expect(spyLite).not.toHaveBeenCalled()
    } finally {
      spyLite.mockRestore()
    }
  })
})
