/**
 * The hand-written Pull codec must agree with the vendored protobuf.js, byte
 * for byte, on everything the client actually sends and receives.
 *
 * This is a differential test on purpose. The schema was restored from the
 * box's PHP descriptors rather than reverse-engineered, but "restored
 * correctly" is a claim, and the vendored library is the only oracle available
 * without a portal. So: build the same value both ways, encode both, compare
 * the bytes; and decode bytes the library produced with both, compare the
 * results.
 *
 * It exists to be deleted. Once the lite codec is accepted and the vendored
 * library is removed, the oracle goes with it — at which point these cases
 * become golden-vector tests against the fixtures recorded here.
 */
import { describe, it, expect } from 'vitest'
import { IncomingMessage, Receiver, RequestBatch, ResponseBatch } from '../../../packages/jssdk/src/pullClient/protobuf'
import { decodeResponseBatch, encodeRequestBatch } from '../../../packages/jssdk/src/pullClient/protobuf-lite/messages'
import type { LiteIncomingMessage } from '../../../packages/jssdk/src/pullClient/protobuf-lite/messages'

const bytes = (...values: number[]) => Uint8Array.from(values)
const hex = (view: Uint8Array) => [...view].map(b => b.toString(16).padStart(2, '0')).join(' ')

/** The vendored path, exactly as `client.ts` drives it. */
function encodeWithVendored(messages: LiteIncomingMessage[]): Uint8Array {
  const built = messages.map(message => IncomingMessage.create({
    receivers: (message.receivers ?? []).map(receiver => Receiver.create({
      id: receiver.id,
      ...(receiver.isPrivate === undefined ? {} : { isPrivate: receiver.isPrivate }),
      ...(receiver.signature === undefined ? {} : { signature: receiver.signature })
    })),
    ...(message.body === undefined ? {} : { body: message.body }),
    ...(message.expiry === undefined ? {} : { expiry: message.expiry }),
    ...(message.type === undefined ? {} : { type: message.type })
  }))

  return RequestBatch.encode(
    RequestBatch.create({ requests: [{ incomingMessages: { messages: built } }] })
  ).finish()
}

describe('pull protobuf-lite — encoding agrees with the vendored library', () => {
  const cases: [string, LiteIncomingMessage[]][] = [
    ['the shape client.ts builds: one receiver, body, expiry', [{
      receivers: [{ id: bytes(1, 2, 3), signature: bytes(9, 8) }],
      body: JSON.stringify({ module_id: 'main', command: 'ping' }),
      expiry: 0
    }]],
    ['several receivers in one message', [{
      receivers: [
        { id: bytes(1), signature: bytes(2) },
        { id: bytes(3, 4), signature: bytes(5, 6, 7) },
        { id: bytes(255, 254, 253), signature: bytes(0) }
      ],
      body: '{}',
      expiry: 60
    }]],
    ['several messages in one batch', [
      { receivers: [{ id: bytes(1), signature: bytes(2) }], body: 'a', expiry: 1 },
      { receivers: [{ id: bytes(3), signature: bytes(4) }], body: 'b', expiry: 2 }
    ]],
    ['isPrivate set, which client.ts does not send today', [{
      receivers: [{ id: bytes(1), isPrivate: true, signature: bytes(2) }],
      body: '{}',
      expiry: 0
    }]],
    ['isPrivate false — present on the wire, not omitted', [{
      receivers: [{ id: bytes(1), isPrivate: false, signature: bytes(2) }],
      body: '{}',
      expiry: 0
    }]],
    ['a type field', [{ receivers: [{ id: bytes(1), signature: bytes(2) }], body: '{}', expiry: 0, type: 'text' }]],
    ['no receivers at all', [{ body: '{}', expiry: 0 }]],
    ['empty batch', []],
    ['an expiry past one byte of varint', [{ receivers: [{ id: bytes(1), signature: bytes(2) }], body: '{}', expiry: 300 }]],
    ['an expiry past two bytes of varint', [{ receivers: [{ id: bytes(1), signature: bytes(2) }], body: '{}', expiry: 70_000 }]],
    ['a body longer than 127 bytes, so its length is a multi-byte varint', [{
      receivers: [{ id: bytes(1), signature: bytes(2) }],
      body: JSON.stringify({ text: 'x'.repeat(500) }),
      expiry: 0
    }]],
    ['non-ASCII in the body — UTF-8, and length counted in bytes not characters', [{
      receivers: [{ id: bytes(1), signature: bytes(2) }],
      body: JSON.stringify({ text: 'Привет 🙂 — ёжик' }),
      expiry: 0
    }]],
    ['an empty body string, which is not the same as an absent one', [{
      receivers: [{ id: bytes(1), signature: bytes(2) }],
      body: '',
      expiry: 0
    }]],
    ['zero-length id and signature', [{ receivers: [{ id: bytes(), signature: bytes() }], body: '{}', expiry: 0 }]]
  ]

  it.each(cases)('%s', (_name, messages) => {
    const fromVendored = encodeWithVendored(messages)
    const fromLite = encodeRequestBatch(messages)

    expect(hex(fromLite)).toBe(hex(fromVendored))
  })

  it('agrees on protobuf.js INSTANCES, which is what client.ts actually passes', () => {
    // The cases above hand the lite encoder plain objects. `client.ts` hands it
    // `Receiver.create(...)` / `IncomingMessage.create(...)` instances, and
    // those carry `isPrivate = false` and `type = ''` on the prototype as
    // defaults. An encoder testing `!== undefined` writes both; the library
    // writes neither. That difference was live until the switch test caught it,
    // so it is pinned here, on the input shape that actually occurs.
    const built = [IncomingMessage.create({
      receivers: [Receiver.create({ id: bytes(0xAB, 0x0C), signature: bytes(0xDE, 0x0F) })],
      body: '{"module_id":"main"}',
      expiry: 0
    })]

    const fromVendored = RequestBatch.encode(
      RequestBatch.create({ requests: [{ incomingMessages: { messages: built } }] })
    ).finish()

    expect(hex(encodeRequestBatch(built as unknown as LiteIncomingMessage[]))).toBe(hex(fromVendored))
  })

  it('an explicitly set false or empty string is still written', () => {
    // The mirror of the case above: `has()` must key on own-property, not on
    // truthiness, or a deliberate `isPrivate: false` would vanish from the wire.
    const built = [IncomingMessage.create({
      receivers: [Receiver.create({ id: bytes(1), isPrivate: false, signature: bytes(2) })],
      body: '',
      expiry: 0,
      type: ''
    })]

    const fromVendored = RequestBatch.encode(
      RequestBatch.create({ requests: [{ incomingMessages: { messages: built } }] })
    ).finish()
    const fromLite = encodeRequestBatch(built as unknown as LiteIncomingMessage[])

    expect(hex(fromLite)).toBe(hex(fromVendored))
    // And it is not the empty encoding — the fields really are on the wire.
    expect(fromLite.length).toBeGreaterThan(10)
  })
})

describe('pull protobuf-lite — decoding agrees with the vendored library', () => {
  /** Build a ResponseBatch with the library, so the bytes are its own. */
  function encodeResponseBatch(responses: unknown[]): Uint8Array {
    return ResponseBatch.encode(ResponseBatch.create({ responses })).finish()
  }

  it('reads the outgoing messages the client consumes', () => {
    const raw = encodeResponseBatch([{
      outgoingMessages: {
        messages: [
          { id: bytes(1, 2), body: JSON.stringify({ module_id: 'im' }), expiry: 30, created: 1_726_000_000, sender: { type: 1, id: bytes(7) } },
          { id: bytes(3), body: '{}', expiry: 0 }
        ]
      }
    }])

    const viaVendored = ResponseBatch.decode(raw)
    const viaLite = decodeResponseBatch(raw)

    expect(viaLite.responses).toHaveLength(viaVendored.responses.length)
    expect(viaLite.responses[0]!.command).toBe(viaVendored.responses[0]!.command)

    const libraryMessages = viaVendored.responses[0]!.outgoingMessages.messages
    const liteMessages = viaLite.responses[0]!.outgoingMessages!.messages

    expect(liteMessages).toHaveLength(libraryMessages.length)
    for (const [i, expected] of libraryMessages.entries()) {
      const actual = liteMessages[i]!
      expect(actual.body).toBe(expected.body)
      expect(actual.expiry).toBe(expected.expiry)
      expect(hex(actual.id ?? bytes())).toBe(hex(expected.id))
      // `created` is the schema's only fixed32 — read as four little-endian
      // bytes. A varint read here returns a plausible wrong number rather than
      // throwing, which is why it is asserted separately.
      expect(actual.created ?? 0).toBe(expected.created)
    }

    expect(liteMessages[0]!.sender?.type).toBe(libraryMessages[0]!.sender.type)
    expect(hex(liteMessages[0]!.sender?.id ?? bytes())).toBe(hex(libraryMessages[0]!.sender.id))
  })

  it('keeps the oneof discriminator, so a statistics response is not read as messages', () => {
    // `client.ts` skips on `response.command !== 'outgoingMessages'`. Reporting
    // the wrong name here would hand it a message list it never received.
    const raw = encodeResponseBatch([{ channelStats: { channels: [] } }])

    expect(decodeResponseBatch(raw).responses[0]!.command)
      .toBe(ResponseBatch.decode(raw).responses[0]!.command)
    expect(decodeResponseBatch(raw).responses[0]!.command).toBe('channelStats')
  })

  it('an empty batch decodes to an empty list, not to a throw', () => {
    const raw = encodeResponseBatch([])

    expect(decodeResponseBatch(raw).responses).toStrictEqual([])
    expect(ResponseBatch.decode(raw).responses).toHaveLength(0)
  })

  it.each([
    // Field numbers are kept under 16 so each tag is a single byte: at 16 the
    // tag becomes a two-byte varint, and a hand-written one-byte fixture is
    // then malformed input rather than an unknown field. (It was, first time.)
    ['varint', Uint8Array.from([(15 << 3) | 0, 42])],
    ['length-delimited', Uint8Array.from([(14 << 3) | 2, 3, 1, 2, 3])],
    ['fixed32', Uint8Array.from([(13 << 3) | 5, 1, 2, 3, 4])],
    ['fixed64', Uint8Array.from([(12 << 3) | 1, 1, 2, 3, 4, 5, 6, 7, 8])]
  ])('ignores an unknown %s field, as the library does', (_type, trailer) => {
    // Forward compatibility: a future server field must not break a live
    // connection. Every wire type is covered because `skip()` dispatches on it
    // — a missing branch there reads the next field at the wrong offset and
    // corrupts everything after it, rather than failing where the bug is.
    const base = encodeResponseBatch([{ outgoingMessages: { messages: [{ id: bytes(1), body: '{}' }] } }])
    const withUnknown = Uint8Array.from([...base, ...trailer])

    expect(() => decodeResponseBatch(withUnknown)).not.toThrow()
    expect(decodeResponseBatch(withUnknown).responses[0]!.command).toBe('outgoingMessages')
  })

  it('a field of a type nothing in the schema uses is skipped, not thrown on', () => {
    // A batch whose trailing unknown field is fixed32 — the one `skip()` branch
    // no other case reaches, because the schema's own fixed32 is a KNOWN field.
    const raw = Uint8Array.from([...encodeResponseBatch([]), (13 << 3) | 5, 9, 9, 9, 9])

    expect(decodeResponseBatch(raw).responses).toStrictEqual([])
  })

  it('round-trips what the lite encoder produced back through the library', () => {
    // The two halves of this codec are written independently; this is the one
    // case that catches an error they share.
    const messages: LiteIncomingMessage[] = [{
      receivers: [{ id: bytes(10, 20), signature: bytes(30) }],
      body: JSON.stringify({ hello: 'мир' }),
      expiry: 42
    }]

    const decoded = RequestBatch.decode(encodeRequestBatch(messages))
    const sent = decoded.requests[0]!.incomingMessages.messages[0]!

    expect(sent.body).toBe(messages[0]!.body)
    expect(sent.expiry).toBe(42)
    expect(hex(sent.receivers[0]!.id)).toBe(hex(bytes(10, 20)))
    expect(hex(sent.receivers[0]!.signature)).toBe(hex(bytes(30)))
  })
})
